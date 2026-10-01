import { AVAILABILITY_MESSAGE } from "@/lib/publicAvailability";

export default function AvailabilityNotice({ className = "" }: { className?: string }) {
  return (
    <aside aria-label="Current availability" className={`rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm ${className}`}>
      <p className="font-semibold mb-1">Relaunch preparation — access paused</p>
      <p>{AVAILABILITY_MESSAGE}</p>
    </aside>
  );
}
