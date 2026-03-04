import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, FileText, Users, Database, RotateCw, Newspaper, ClipboardList, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFoiaAuth } from '@/lib/foia/hooks';
import { clearProfileCache } from '@/lib/foia/auth';
import { cn } from '@/lib/utils';

export function FoiaNavbar() {
  const { profile, isAdmin } = useFoiaAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    clearProfileCache();
    await supabase.auth.signOut();
    navigate('/foia/login');
  };

  const adminLinks = [
    { href: '/foia/admin', label: 'Dashboard', icon: Database },
    { href: '/foia/admin/invite', label: 'Invite VAs', icon: Users },
    { href: '/foia/admin/import', label: 'Import', icon: FileText },
    { href: '/foia/admin/assignments', label: 'Assign', icon: ClipboardList },
    { href: '/foia/admin/rotation', label: 'Rotation', icon: RotateCw },
    { href: '/foia/admin/press-accounts', label: 'Press Accounts', icon: Newspaper },
    { href: '/foia/admin/intelligence', label: 'Intelligence', icon: BarChart3 },
  ];

  const vaLinks = [
    { href: '/foia/va', label: 'Dashboard', icon: Database },
    { href: '/foia/va/queue', label: 'My Queue', icon: ClipboardList },
    { href: '/foia/va/history', label: 'History', icon: FileText },
  ];

  const links = isAdmin ? adminLinks : vaLinks;

  return (
    <nav className="bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link to={isAdmin ? '/foia/admin' : '/foia/va'} className="font-bold text-white text-sm tracking-wide">
              FOIA OPS
            </Link>
            <div className="flex items-center gap-1">
              {links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  to={href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors',
                    location.pathname === href
                      ? 'bg-white/20 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-sm">{profile?.full_name}</span>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              isAdmin ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
            )}>
              {profile?.role}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-slate-400 hover:text-white text-sm transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
