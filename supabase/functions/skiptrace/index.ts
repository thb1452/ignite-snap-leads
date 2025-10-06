// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function (Deno): Skip Trace via BatchData
// Route: POST /skiptrace  { property_id: string, phone_hint?: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

// ---------- CORS ----------
const ALLOW_ORIGINS = (Deno.env.get("CORS_ALLOW_ORIGINS") ?? "*")
  .split(",")
  .map(o => o.trim());

function cors(origin: string | null) {
  const allowOrigin = ALLOW_ORIGINS.includes("*")
    ? "*"
    : (origin && ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0] ?? "*");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ---------- Types ----------
type SkipTraceRequest = { property_id: string; phone_hint?: string | null };

type BatchDataResponse = {
  owner_name?: string | null;
  phones?: (string | { number: string })[] | null;
  emails?: string[] | null;
  // Keep raw: BatchData sometimes sends more fields
  [k: string]: any;
};

type ApiError = { ok: false; error: string };
type ApiOk = { ok: true; contacts: any[]; raw_data: BatchDataResponse };

// ---------- Helpers ----------
const normalizePhone = (p?: string) => {
  if (!p) return null;
  // strip non-digits, keep last 10/11
  const digits = p.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+1${digits.slice(1)}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
};

const normalizeEmail = (e?: string) => (e ? e.trim().toLowerCase() : null);

function unique<T>(arr: (T | null | undefined)[]): T[] {
  return Array.from(new Set(arr.filter(Boolean) as T[]));
}

async function fetchWithRetry(url: string, init: RequestInit, tries = 3, delayMs = 700) {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25_000); // 25s timeout per try
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      // 429/5xx retry
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        lastErr = new Error(`Upstream ${res.status}: ${await res.text()}`);
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

// ---------- Handler ----------
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors(req.headers.get("origin")) });
  }

  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };

  try {
    // ---- Env ----
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const batchDataKey = Deno.env.get("BATCHDATA_API_KEY");
    const batchDataBase = Deno.env.get("BATCHDATA_API_URL") ?? "https://api.batchdata.com";
    if (!supabaseUrl || !supabaseKey || !batchDataKey) {
      throw new Error("SERVER_MISCONFIGURED");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ---- Auth ----
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" } satisfies ApiError), {
        status: 401,
        headers,
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" } satisfies ApiError), {
        status: 401,
        headers,
      });
    }
    const user = authData.user;

    // ---- Input ----
    const body = (await req.json()) as Partial<SkipTraceRequest & { overrides?: any }>;
    if (!body?.property_id) {
      return new Response(JSON.stringify({ ok: false, error: "property_id required" } satisfies ApiError), {
        status: 400,
        headers,
      });
    }
    const property_id = body.property_id;
    const phone_hint = body.phone_hint ?? null;
    const overrides = body.overrides ?? null;

    // ---- Property lookup ----
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("id,address,city,state,zip")
      .eq("id", property_id)
      .single();
    if (propError || !property) throw new Error("PROPERTY_NOT_FOUND");

    // Use overrides if provided, otherwise use property data
    const useAddress = overrides?.address_line || property.address;
    const useCity = overrides?.city || property.city;
    const useState = overrides?.state || property.state;
    const useZip = overrides?.postal_code || property.zip;

    const parts = [useAddress, useCity, useState, useZip].filter(Boolean);
    if (parts.length < 3) throw new Error("ADDRESS_INCOMPLETE");
    const fullAddress = parts.join(", ");
    console.log("[skiptrace] property", property_id, "addr:", fullAddress, overrides ? "(with overrides)" : "");

    // ---- Call BatchData ----
    const url = `${batchDataBase.replace(/\/$/, "")}/api/v1/property/skip-trace`;
    const payload = {
      requests: [{
        propertyAddress: {
          street: useAddress,
          city: useCity,
          state: useState,
          zip: useZip
        }
      }]
    };
    if (phone_hint) {
      payload.requests[0].phoneHint = phone_hint;
    }
    if (overrides?.owner_name) {
      payload.requests[0].ownerName = overrides.owner_name;
    }

    const bdRes = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${batchDataKey}`,
        },
        body: JSON.stringify(payload),
      },
      3,
      700
    );

    if (!bdRes.ok) {
      const errTxt = await bdRes.text();
      console.error("[batchdata] error", bdRes.status, errTxt);
      if (bdRes.status === 401 || bdRes.status === 403) throw new Error("BATCHDATA_AUTH");
      if (bdRes.status === 429) throw new Error("BATCHDATA_RATE_LIMIT");
      throw new Error(`BATCHDATA_${bdRes.status}`);
    }

    const rawResponse: any = await bdRes.json();
    console.log("[batchdata] raw response:", JSON.stringify(rawResponse));

    // BatchData returns an array of results
    const results = rawResponse.results || rawResponse.data || [];
    if (!results.length) {
      console.log("[batchdata] no results found");
      // Return success with empty contacts
      return new Response(JSON.stringify({ ok: true, contacts: [], raw_data: rawResponse }), { headers });
    }

    // Get the first result (we only queried one property)
    const raw = results[0];

    // ---- Normalize + de-dupe ----
    const ownerName = (raw.owner_name ?? raw.ownerName ?? "Unknown Owner").toString().trim() || "Unknown Owner";

    const phonesRaw = Array.isArray(raw.phones)
      ? raw.phones.map((p: any) => (typeof p === "string" ? p : p?.number)).filter(Boolean) as string[]
      : [];

    const emailsRaw = Array.isArray(raw.emails) ? raw.emails : [];

    let phones = unique(phonesRaw.map(normalizePhone)).filter(Boolean) as string[];
    let emails = unique(emailsRaw.map(normalizeEmail)).filter(Boolean) as string[];

    // ---- FALLBACKS if no contacts found ----
    const gotContacts = (phones.length + emails.length) > 0;

    if (!gotContacts) {
      console.log("[skiptrace] No contacts from initial query, trying fallbacks...");

      // Fallback A: Try structured address format (different API endpoint style)
      try {
        console.log("[skiptrace] Fallback A: structured address");
        const structuredPayload = {
          address_line: property.address,
          city: property.city,
          state: property.state,
          postal_code: property.zip
        };

        const bdRes2 = await fetchWithRetry(
          `${batchDataBase.replace(/\/$/, "")}/api/v1/property/skip-trace`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${batchDataKey}`,
            },
            body: JSON.stringify({ requests: [{ propertyAddress: structuredPayload }] }),
          },
          2,
          700
        );

        if (bdRes2.ok) {
          const raw2: any = await bdRes2.json();
          const results2 = raw2.results || raw2.data || [];
          if (results2.length > 0) {
            const firstResult = results2[0];
            const phones2Raw = Array.isArray(firstResult.phones) 
              ? firstResult.phones.map((p: any) => typeof p === "string" ? p : p?.number).filter(Boolean) as string[]
              : [];
            const emails2Raw = Array.isArray(firstResult.emails) ? firstResult.emails : [];
            
            phones = unique(phones2Raw.map(normalizePhone)).filter(Boolean) as string[];
            emails = unique(emails2Raw.map(normalizeEmail)).filter(Boolean) as string[];
            
            if (phones.length || emails.length) {
              console.log("[skiptrace] Fallback A successful:", phones.length, "phones", emails.length, "emails");
            }
          }
        }
      } catch (e) {
        console.log("[skiptrace] Fallback A failed:", e?.message);
      }
    }

    // ---- Demo mode for sandbox ----
    if ((phones.length + emails.length) === 0 && batchDataBase.toLowerCase().includes("sandbox")) {
      console.log("[skiptrace] Sandbox mode: creating demo contact");
      phones = ["+15555550100"];
      emails = ["owner.demo@example.com"];
    }

    // ---- Persist contacts (idempotent upsert) ----
    const contacts: any[] = [];

    // Upsert for each phone
    for (const phone of phones) {
      const { data: contact, error } = await supabase
        .from("property_contacts")
        .upsert(
          {
            property_id,
            phone,
            name: ownerName,
            email: emails[0] ?? null,
            source: batchDataBase.toLowerCase().includes("sandbox") ? "batchdata_sandbox_demo" : "batchdata",
            raw_payload: raw,
            created_by: user.id,
          },
          { onConflict: "property_id,phone" }
        )
        .select()
        .single();

      if (!error && contact) contacts.push(contact);
    }

    // If we had NO phones, but we have an email, store a single email row
    if (phones.length === 0 && emails.length > 0) {
      const { data: contact, error } = await supabase
        .from("property_contacts")
        .upsert(
          {
            property_id,
            phone: null,
            name: ownerName,
            email: emails[0],
            source: "batchdata",
            raw_payload: raw,
            created_by: user.id,
          },
          { onConflict: "property_id,email" }
        )
        .select()
        .single();

      if (!error && contact) contacts.push(contact);
    }

    // ---- Consume credit only after success ----
    const { error: creditError } = await supabase.rpc("fn_consume_credit", {
      p_reason: "skip_trace",
      p_meta: { property_id, address: fullAddress },
    });
    if (creditError) {
      console.error("[credits] error", creditError);
      // Don't fail the whole request; return ok with a warning
    }

    const resp: ApiOk = { ok: true, contacts, raw_data: raw };
    return new Response(JSON.stringify(resp), { headers });
  } catch (e: any) {
    console.error("[skiptrace] error", e?.message ?? e);

    let status = 500;
    let msg = "Internal error";

    // Map abort/timeouts clearly
    if (e?.name === "AbortError" || String(e?.message || "").toLowerCase().includes("aborted")) {
      status = 504; msg = "BatchData timeout, please retry";
    }

    switch (e?.message) {
      case "SERVER_MISCONFIGURED":
        status = 500; msg = "Server misconfigured"; break;
      case "PROPERTY_NOT_FOUND":
        status = 404; msg = "Property not found"; break;
      case "ADDRESS_INCOMPLETE":
        status = 400; msg = "Property address incomplete"; break;
      case "BATCHDATA_AUTH":
        status = 502; msg = "Upstream auth error (BatchData)"; break;
      case "BATCHDATA_RATE_LIMIT":
        status = 429; msg = "BatchData rate limited, try again"; break;
      default:
        if (typeof e?.message === "string") msg = e.message;
    }

    const err: ApiError = { ok: false, error: msg };
    return new Response(JSON.stringify(err), { status, headers });
  }
});
