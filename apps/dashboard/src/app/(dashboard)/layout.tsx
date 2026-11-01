'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut, Menu as MenuIcon } from 'lucide-react';
import { Sidebar } from '@/components/sidebar';
import { StatusIndicators } from '@/components/status-indicators';
import { OrderAlerts } from '@/components/order-alerts';
import { useAuth } from '@/lib/auth-store';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, user, branchId, setBranch, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setNavOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-800 bg-gray-950/90 px-4 backdrop-blur">
          <button className="rounded p-1.5 text-gray-400 hover:bg-gray-800 lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <MenuIcon size={20} />
          </button>

          {user.branches.length > 1 ? (
            <select
              value={branchId ?? ''}
              onChange={(e) => setBranch(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-sm"
              aria-label="Branch"
            >
              {user.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-300">{user.branches[0]?.name ?? 'No branch assigned'}</span>
          )}

          <div className="ml-auto flex items-center gap-4">
            <StatusIndicators />
            <OrderAlerts />
            <div className="hidden text-right text-xs leading-tight sm:block">
              <div className="text-gray-200">{user.name}</div>
              <div className="text-gray-500">{user.role.toLowerCase()}</div>
            </div>
            <button
              onClick={() => void logout()}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
