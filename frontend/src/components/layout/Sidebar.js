import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from '@/lib/supabase';
import { useSessionContext } from '@supabase/auth-helpers-react';
import {
  CalendarDays, BarChart3, Mail, Clock,
  BookOpen, LogOut, Menu, X, Bell
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

const NAV = [
  { href: '/dashboard',            icon: BarChart3,    label: 'Overview'    },
  { href: '/dashboard/attendance', icon: CalendarDays, label: 'Attendance'  },
  { href: '/dashboard/grades',     icon: BookOpen,     label: 'Grades'      },
  { href: '/dashboard/timetable',  icon: Clock,        label: 'Timetable'   },
  { href: '/dashboard/emails',     icon: Mail,         label: 'Smart Inbox' },
];

export default function Sidebar() {
  const router = useRouter();
  const { session } = useSessionContext();
  const [open, setOpen] = useState(false);

  const user = session?.user;

  const NavItems = () => (
    <nav className="flex-1 space-y-1 mt-6">
      {NAV.map(({ href, icon: Icon, label }) => {
        const active = router.pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={clsx(
              'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
              active
                ? 'bg-accent/15 text-accent border border-accent/20'
                : 'text-slate-400 hover:bg-surface-raised hover:text-slate-200'
            )}
          >
            <Icon size={16} />
            {label}
            {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 bg-base-900 border-b border-surface-border">
        <span className="font-bold gradient-text text-lg">CampusIQ</span>
        <button onClick={() => setOpen(!open)} className="text-slate-400 p-1">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-64 bg-base-900 border-r border-surface-border flex flex-col p-4 pt-16">
            <NavItems />
            <UserFooter user={user} />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 min-h-screen bg-base-900 border-r border-surface-border px-4 py-6 fixed left-0 top-0">
        <div className="flex items-center gap-2 px-1 mb-2">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center font-bold text-white text-sm">
            C
          </div>
          <span className="font-bold gradient-text">CampusIQ</span>
        </div>
        <NavItems />
        <UserFooter user={user} />
      </aside>
    </>
  );
}

function UserFooter({ user }) {
  return (
    <div className="pt-4 border-t border-surface-border mt-4">
      <div className="flex items-center gap-2 px-1 mb-3">
        {user?.user_metadata?.avatar_url ? (
          <img src={user.user_metadata.avatar_url} alt="" className="w-7 h-7 rounded-full" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs text-accent font-bold">
            {user?.email?.[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-200 truncate">
            {user?.user_metadata?.full_name || 'Student'}
          </p>
          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
        </div>
      </div>
      <button
        onClick={signOut}
        className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-400 transition-colors w-full px-1 py-1"
      >
        <LogOut size={13} />
        Sign out
      </button>
    </div>
  );
}
