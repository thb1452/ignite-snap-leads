import { ReactNode } from 'react';
import { FoiaNavbar } from './FoiaNavbar';

interface FoiaLayoutProps {
  children: ReactNode;
}

export function FoiaLayout({ children }: FoiaLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <FoiaNavbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
