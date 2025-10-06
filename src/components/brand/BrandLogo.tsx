import { Link } from "react-router-dom";
import logo from "@/assets/snap-ignite-logo.jpg";

type Props = { 
  size?: "sm" | "md" | "lg"; 
};

export default function BrandLogo({ size = "md" }: Props) {
  const h = size === "sm" ? "h-6" : size === "lg" ? "h-9" : "h-8";
  
  return (
    <Link 
      to="/" 
      className="flex items-center shrink-0" 
      aria-label="Snap Ignite – Home"
    >
      <img 
        src={logo} 
        alt="Snap Ignite" 
        className={`${h} w-auto`} 
      />
    </Link>
  );
}
