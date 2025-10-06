import { Link } from "react-router-dom";
import LogoDark from "@/assets/brand/snap-ignite-logo-dark.svg";
import LogoLight from "@/assets/brand/snap-ignite-logo-light.svg";
import Mark from "@/assets/brand/snap-ignite-mark.svg";

type Props = { 
  size?: "sm" | "md" | "lg"; 
  collapseAtSm?: boolean; 
};

export default function BrandLogo({ size = "md", collapseAtSm = true }: Props) {
  const h = size === "sm" ? "h-6" : size === "lg" ? "h-8" : "h-7";
  
  return (
    <Link 
      to="/" 
      className="flex items-center gap-2 shrink-0 min-w-0" 
      aria-label="Snap Ignite – Home"
    >
      {/* Icon-only on very small screens */}
      {collapseAtSm && (
        <>
          <img 
            src={Mark} 
            alt="" 
            className={`sm:hidden ${h} w-auto`} 
          />
          <picture className="hidden sm:block">
            <source srcSet={LogoLight} media="(prefers-color-scheme: dark)" />
            <img 
              src={LogoDark} 
              alt="Snap Ignite" 
              className={`${h} w-auto`} 
            />
          </picture>
        </>
      )}
      {!collapseAtSm && (
        <picture>
          <source srcSet={LogoLight} media="(prefers-color-scheme: dark)" />
          <img 
            src={LogoDark} 
            alt="Snap Ignite" 
            className={`${h} w-auto`} 
          />
        </picture>
      )}
    </Link>
  );
}
