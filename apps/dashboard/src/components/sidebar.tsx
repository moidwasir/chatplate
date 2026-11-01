'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bike,
  LayoutDashboard,
  MessageCircle,
  Settings,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@safi/ui';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Not built yet — shown greyed out with the phase it lands in */
  soon?: string;
}

const NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { href: '/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/chats', label: 'WhatsApp chats', icon: MessageCircle, soon: 'Phase 2' },
  { href: '/customers', label: 'Customers', icon: Users, soon: 'Phase 2' },
  { href: '/delivery', label: 'Delivery', icon: Bike },
  { href: '/reports', label: 'Reports', icon: BarChart3, soon: 'Phase 5' },
  { href: '/settings', label: 'Settings', icon: Settings, soon: 'Later' },
];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-60 shrink-0 border-r border-gray-800 bg-gray-950 transition-transform lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-gray-800 px-5">
        <span className="text-xl">🍽️</span>
        <span className="font-semibold text-green-400">
          Chat<span className="text-orange-500">Plate</span>
        </span>
      </div>
      <nav className="space-y-0.5 p-3">
        {NAV.map(({ href, label, icon: Icon, soon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          if (soon) {
            return (
              <span
                key={href}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600"
                title={`Coming in ${soon}`}
              >
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">
                  Soon
                </span>
              </span>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active ? 'bg-green-600/15 font-medium text-green-400' : 'text-gray-300 hover:bg-gray-900 hover:text-white',
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
