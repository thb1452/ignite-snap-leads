import { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

export function ListEnrichmentTeaser() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const { error } = await supabase
        .from("list_enrichment_waitlist" as any)
        .insert({ email: email.trim() } as any);

      if (error) throw error;
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="py-10 md:py-14 bg-landing-bg">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto rounded-2xl border border-landing-accent/30 bg-landing-surface/40 backdrop-blur-xl p-6 md:p-10 relative overflow-hidden"
          style={{
            boxShadow: "0 0 40px rgba(56, 178, 172, 0.08), 0 0 80px rgba(56, 178, 172, 0.04)",
          }}
        >
          {/* Subtle glow accent */}
          <div className="absolute -top-20 -right-20 w-60 h-60 bg-landing-accent/10 rounded-full blur-3xl pointer-events-none" />

          <h3 className="text-xl md:text-2xl font-bold text-landing-text mb-3">
            🔥 Coming Soon: Scan
          </h3>

          <p className="text-sm md:text-base text-landing-text-muted leading-relaxed mb-2">
            Upload any property list. We'll scan every address against our enforcement database — violations, escalating fines, and city action — and return a SnapScore for each one instantly.
          </p>

          <p className="text-sm font-semibold text-landing-accent mb-6">
            Your list. Our enforcement intelligence. Your edge.
          </p>

          {status === "success" ? (
            <p className="text-sm text-landing-accent font-medium">
              ✅ You're on the list. We'll notify you at launch.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="flex-1 h-11 rounded-lg border border-landing-accent/30 bg-landing-bg/80 px-4 text-sm text-landing-text placeholder:text-landing-text-muted/60 focus:outline-none focus:ring-2 focus:ring-landing-accent/50"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="h-11 px-6 rounded-lg bg-landing-accent text-landing-bg font-semibold text-sm hover:bg-landing-accent/90 transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                {status === "loading" ? "Submitting…" : "Notify Me When It Launches"}
              </button>
            </form>
          )}

          {status === "error" && (
            <p className="text-sm text-red-400 mt-2">Something went wrong. Please try again.</p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
