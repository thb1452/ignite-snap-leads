import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/externalClient";
import { Check, Loader2, Mail } from "lucide-react";
import { motion } from "framer-motion";

export function WaitlistForm({ className = "" }: { className?: string }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;

    setIsSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase
      .from("beta_waitlist" as any)
      .insert({ full_name: fullName.trim(), email: email.trim().toLowerCase() } as any);

    if (insertError) {
      if (insertError.message?.includes("duplicate") || insertError.code === "23505") {
        setError("You're already on the waitlist! We'll be in touch soon.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setIsSubmitting(false);
      return;
    }

    setSubmitted(true);
    setIsSubmitting(false);
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`text-center p-6 rounded-xl bg-landing-accent/10 border border-landing-accent/30 ${className}`}
      >
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-landing-accent/20 flex items-center justify-center">
          <Check className="w-6 h-6 text-landing-accent" />
        </div>
        <p className="text-lg font-semibold text-landing-text mb-1">You're on the list!</p>
        <p className="text-sm text-landing-text-muted">
          We'll email you as soon as new spots open up.
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-3 ${className}`}>
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="text"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={isSubmitting}
          required
          className="bg-landing-surface/50 border-landing-surface text-landing-text placeholder:text-landing-text-muted/60"
        />
        <Input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          required
          className="bg-landing-surface/50 border-landing-surface text-landing-text placeholder:text-landing-text-muted/60"
        />
      </div>
      <Button
        type="submit"
        disabled={isSubmitting || !fullName.trim() || !email.trim()}
        className="w-full sm:w-auto bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold px-8"
        size="lg"
      >
        {isSubmitting ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Joining...</>
        ) : (
          <><Mail className="w-4 h-4 mr-2" /> Join the Waitlist</>
        )}
      </Button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
