import { LogoWordmark } from "@/components/branding/LogoWordmark";
import { UserMenu } from "@/components/layout/UserMenu";

export function LeadsHeader() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-white/90 supports-[backdrop-filter]:bg-white/75 border-b border-slate-200/70 pt-[env(safe-area-inset-top)]">
      <div className="px-4 md:px-6 h-14 flex items-center justify-between">
        <LogoWordmark className="text-[18px] leading-none" />
        <UserMenu />
      </div>
    </header>
  );
}
