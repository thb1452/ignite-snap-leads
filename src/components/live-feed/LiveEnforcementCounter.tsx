import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useWeeklyViolationCount } from "@/hooks/useWeeklyViolationCount";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";

function useCountUp(target: number, duration = 2000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (target <= 0) return;
    const start = performance.now();
    let raf: number;

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return count;
}

export function LiveEnforcementCounter() {
  const { data, isLoading } = useWeeklyViolationCount();
  const animatedCount = useCountUp(data?.count ?? 0, 2500);

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <Skeleton className="h-16 w-48 mx-auto mb-3" />
        <Skeleton className="h-4 w-64 mx-auto" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-xl border bg-card p-8 text-center relative overflow-hidden"
    >
      {/* Subtle animated glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Live This Month
          </span>
        </div>

        <motion.p
          key={animatedCount}
          className="text-6xl md:text-7xl font-bold text-foreground tabular-nums"
        >
          {animatedCount.toLocaleString()}
        </motion.p>

        <p className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5">
          <Activity className="h-4 w-4 text-primary" />
          Enforcement Actions Tracked
        </p>
      </div>
    </motion.div>
  );
}
