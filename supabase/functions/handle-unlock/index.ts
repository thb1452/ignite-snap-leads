import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("SERVER_MISCONFIGURED");
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.warn("[handle-unlock] missing Authorization bearer");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.replace("Bearer ", "");

    const userScopedKey = supabaseAnonKey ?? supabaseKey;
    const userClient = createClient(supabaseUrl, userScopedKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token);

    if (authErr || !user) {
      console.warn("[handle-unlock] auth failed:", authErr?.message ?? "no user");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    const body = await req.json().catch(() => ({}));
    const stripe_session_id = typeof body.stripe_session_id === "string" ? body.stripe_session_id.trim() : "";
    const property_id_input = body.property_id as string | undefined;

    console.info("[handle-unlock]", {
      mode: stripe_session_id ? "stripe_checkout" : property_id_input ? "credits_or_free" : "missing_input",
      user_id: user.id,
    });

    let property_id: string;
    let source: string;
    let free_remaining: number | undefined;
    let credits_remaining: number | undefined;
    let subscription_remaining: number | null | undefined;

    if (stripe_session_id) {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        console.error(
          "[handle-unlock] STRIPE_SECRET_KEY is not set for this function — add it in Dashboard → Edge Functions secrets (or project secrets).",
        );
        return new Response(
          JSON.stringify({
            error: "Stripe not configured",
            hint: "Set STRIPE_SECRET_KEY for edge functions (same key as create-checkout-session).",
          }),
          { status: 500, headers },
        );
      }

      const stripe = new Stripe(stripeKey, {
        apiVersion: "2023-10-16",
        httpClient: Stripe.createFetchHttpClient(),
      });

      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.retrieve(stripe_session_id, {
          expand: ["payment_intent"],
        });
      } catch (e: unknown) {
        const msg = (e as Error)?.message ?? String(e);
        console.error("[handle-unlock] Stripe sessions.retrieve failed:", msg);
        return new Response(
          JSON.stringify({
            error: "Invalid or expired checkout session",
            hint: "Complete payment on Stripe, or start checkout again. Test mode sessions cannot be used with live keys and vice versa.",
          }),
          { status: 400, headers },
        );
      }

      const metaUserId = session.metadata?.user_id;
      const checkoutType = session.metadata?.checkout_type;
      const metaPropertyId = session.metadata?.property_id;

      if (!metaUserId || String(metaUserId) !== String(user.id)) {
        console.error("[handle-unlock] session user mismatch", { metaUserId, authUserId: user.id });
        return new Response(JSON.stringify({ error: "Session does not belong to this user" }), {
          status: 403,
          headers,
        });
      }

      if (checkoutType !== "single_unlock") {
        console.error("[handle-unlock] wrong checkout_type:", checkoutType);
        return new Response(JSON.stringify({ error: "Not a single-unlock checkout" }), {
          status: 400,
          headers,
        });
      }

      if (!metaPropertyId) {
        return new Response(JSON.stringify({ error: "Missing property_id on session" }), {
          status: 400,
          headers,
        });
      }

      if (session.mode !== "payment") {
        return new Response(JSON.stringify({ error: "Invalid checkout mode" }), {
          status: 400,
          headers,
        });
      }

      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
        console.info("[handle-unlock] payment not complete yet:", session.payment_status);
        return new Response(
          JSON.stringify({
            success: false,
            payment_status: session.payment_status,
            message: "Payment not complete yet",
          }),
          { headers },
        );
      }

      property_id = metaPropertyId;

      const { data: existing } = await supabase
        .from("unlocked_properties")
        .select("id")
        .eq("user_id", user.id)
        .eq("property_id", property_id)
        .maybeSingle();

      if (existing) {
        source = "already_unlocked";
      } else {
        const { error: unlockErr } = await supabase.from("unlocked_properties").insert({
          user_id: user.id,
          property_id,
          credit_cost: 0,
          unlock_source: "paid_unlock",
        });

        if (unlockErr) {
          console.error("[handle-unlock] paid unlock insert error:", unlockErr);
          return new Response(JSON.stringify({ error: "Failed to record unlock" }), {
            status: 500,
            headers,
          });
        }
        source = "paid_unlock";
      }
    } else if (property_id_input) {
      property_id = property_id_input;

      const { data: existingUnlock } = await supabase
        .from("unlocked_properties")
        .select("id")
        .eq("user_id", user.id)
        .eq("property_id", property_id)
        .maybeSingle();

      if (existingUnlock) {
        source = "already_unlocked";
      } else {
        const { data, error } = await supabase.rpc("fn_unlock_property", {
          p_user_id: user.id,
          p_property_id: property_id,
        });

        if (error) {
          console.error("[handle-unlock] RPC error:", error);
          return new Response(JSON.stringify({ error: "Failed to unlock property" }), {
            status: 500,
            headers,
          });
        }

        const result = data as Record<string, unknown>;

        if (result.success) {
          source = String(result.source ?? "unknown");
          free_remaining = result.free_remaining as number | undefined;
          credits_remaining = result.credits_remaining as number | undefined;
        } else {
          const { data: limitData, error: limitError } = await supabase.rpc("fn_check_subscription_limit", {
            p_user_id: user.id,
            p_usage_type: "exports",
            p_amount: 1,
          });

          console.info("[handle-unlock] subscription check:", JSON.stringify({ limitData, limitError }));

          const limitResult = (limitData ?? null) as { allowed?: boolean; remaining?: number | null } | null;

          if (!limitError && limitResult?.allowed) {
            const { error: insertError } = await supabase.from("unlocked_properties").insert({
              user_id: user.id,
              property_id,
              credit_cost: 1,
              unlock_source: "subscription",
            });

            if (insertError) {
              console.error("[handle-unlock] subscription unlock insert error:", insertError);
              return new Response(JSON.stringify({ error: "Failed to record subscription unlock" }), {
                status: 500,
                headers,
              });
            }

            const { data: incremented, error: incrementError } = await supabase.rpc("fn_increment_usage", {
              p_user_id: user.id,
              p_usage_type: "exports",
              p_amount: 1,
            });

            if (incrementError || incremented !== true) {
              console.error("[handle-unlock] subscription usage increment error:", incrementError);
              await supabase
                .from("unlocked_properties")
                .delete()
                .eq("user_id", user.id)
                .eq("property_id", property_id)
                .eq("unlock_source", "subscription");

              return new Response(JSON.stringify({ error: "Failed to apply monthly unlock" }), {
                status: 500,
                headers,
              });
            }

            source = "subscription_allowance";
            // Re-query the actual remaining AFTER the increment so we return fresh data
            const { data: postIncrementData } = await supabase.rpc("fn_check_subscription_limit", {
              p_user_id: user.id,
              p_usage_type: "exports",
              p_amount: 0, // just a read, no additional amount
            });
            const postResult = (postIncrementData ?? null) as { remaining?: number | null } | null;
            subscription_remaining =
              postResult?.remaining === null
                ? null
                : typeof postResult?.remaining === "number"
                  ? Math.max(0, postResult.remaining)
                  : (limitResult.remaining === null
                      ? null
                      : typeof limitResult.remaining === "number"
                        ? Math.max(0, limitResult.remaining - 1)
                        : null);
          } else {
            console.info("[handle-unlock] fn_unlock_property declined:", result.error);
            return new Response(
              JSON.stringify({
                error: result.error,
                free_remaining: result.free_remaining ?? 0,
                credits: result.credits ?? 0,
                subscription_remaining:
                  typeof limitResult?.remaining === "number"
                    ? Math.max(0, limitResult.remaining)
                    : limitResult?.remaining === null
                      ? null
                      : 0,
                message: "Insufficient balance. Buy unlock with Stripe to continue.",
              }),
              { status: 402, headers },
            );
          }
        }
      }
    } else {
      console.warn("[handle-unlock] body missing property_id and stripe_session_id");
      return new Response(JSON.stringify({ error: "property_id or stripe_session_id required" }), {
        status: 400,
        headers,
      });
    }

    const { data: property, error: propErr } = await supabase
      .from("properties")
      .select(
        "id, address, street_number, street_name, city, state, zip, latitude, longitude, snap_score, snap_insight, total_violations, open_violations, opportunity_class, investor_insight_brief, violation_types, distress_signals",
      )
      .eq("id", property_id)
      .single();

    if (propErr) {
      console.error("[handle-unlock] Error fetching property:", propErr);
    }

    const batchdataKey = Deno.env.get("BATCHDATA_API_KEY");
    if (batchdataKey && property) {
      const enrichPropertyContacts = async () => {
        const { data: existingContacts } = await supabase
          .from("property_contacts")
          .select("id")
          .eq("property_id", property_id)
          .limit(1);

        if (existingContacts && existingContacts.length > 0) return;

        try {
          const batchRes = await fetch("https://api.batchdata.com/api/v1/property/skip-trace", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${batchdataKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requests: [
                {
                  propertyAddress: {
                    street: property.address,
                    city: property.city,
                    state: property.state,
                    zip: property.zip,
                  },
                },
              ],
            }),
          });

          if (!batchRes.ok) {
            console.error("[handle-unlock] BatchData error:", batchRes.status);
            return;
          }

          const batchData = await batchRes.json();
          const persons = batchData?.results?.persons || batchData?.results?.[0]?.persons || [];

          if (persons.length > 0) {
            const contacts = persons.slice(0, 3).map((person: Record<string, unknown>) => {
              const mailingAddr = (person.addresses as Record<string, unknown>[] | undefined)?.[0] as
                | Record<string, string>
                | undefined;
              const nameObj = person.name as Record<string, string> | string | undefined;
              const firstName =
                (person.firstName as string | undefined) ||
                (typeof nameObj === "object" && nameObj !== null ? nameObj.first : undefined);
              const lastName =
                (person.lastName as string | undefined) ||
                (typeof nameObj === "object" && nameObj !== null ? nameObj.last : undefined);
              const fullName =
                [firstName, lastName].filter(Boolean).join(" ") || (typeof nameObj === "string" ? nameObj : null);

              return {
                property_id,
                created_by: user.id,
                source: "batchdata",
                name: fullName || null,
                phone:
                  (person.phones as { phone?: string }[] | undefined)?.[0]?.phone ||
                  (person.phoneNumbers as { number?: string }[] | undefined)?.[0]?.number ||
                  null,
                email:
                  (person.emails as { email?: string }[] | undefined)?.[0]?.email ||
                  (person.emailAddresses as { address?: string }[] | undefined)?.[0]?.address ||
                  null,
                mailing_address: mailingAddr
                  ? [mailingAddr.street, mailingAddr.city, mailingAddr.state, mailingAddr.zip]
                      .filter(Boolean)
                      .join(", ")
                  : null,
                raw_payload: person,
              };
            });

            await supabase.from("property_contacts").insert(contacts);
            return;
          }

          await supabase.from("property_contacts").insert({
            property_id,
            created_by: user.id,
            source: "batchdata",
            name: null,
            phone: null,
            email: null,
            mailing_address: null,
            raw_payload: batchData,
          });
        } catch (enrichErr: unknown) {
          console.error("[handle-unlock] Enrichment error:", (enrichErr as Error)?.message);
        }
      };

      const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
      if (runtime?.waitUntil) {
        runtime.waitUntil(enrichPropertyContacts());
      } else {
        enrichPropertyContacts().catch((enrichErr) =>
          console.error("[handle-unlock] async enrichment fallback error:", enrichErr),
        );
      }
    }

    const { data: contacts } = await supabase
      .from("property_contacts")
      .select("name, phone, email, mailing_address, source")
      .eq("property_id", property_id);

    console.info("[handle-unlock] success", { source, property_id });

    return new Response(
      JSON.stringify({
        success: true,
        property_id,
        source,
        free_remaining,
        credits_remaining,
        subscription_remaining,
        property: property ?? null,
        contacts: contacts ?? [],
      }),
      { headers },
    );
  } catch (e: unknown) {
    console.error("[handle-unlock] error:", (e as Error)?.message ?? e);
    return new Response(JSON.stringify({ error: (e as Error)?.message ?? "Internal error" }), {
      status: 500,
      headers,
    });
  }
});
