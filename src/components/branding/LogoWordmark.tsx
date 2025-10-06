import { Link } from "react-router-dom";

export function LogoWordmark({ className = "" }: { className?: string }) {
  return (
    <Link to="/" aria-label="Snap Ignite" className={`flex items-baseline gap-2 select-none ${className}`}>
      <span className="font-extrabold tracking-wide text-slate-900 dark:text-white text-lg">SNAP</span>
      {/* green bolt */}
      <svg viewBox="0 0 24 24" className="h-5 w-5 -mx-1" aria-hidden="true">
        <path d="M13.5 2 4 13h6l-1.5 9L18 11h-6L13.5 2Z" fill="#22c55e" />
      </svg>
      <span className="font-semibold tracking-tight text-slate-900/90 dark:text-white/90 text-lg">ignite</span>
    </Link>
  );
}
