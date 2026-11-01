'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Card, OrderStatusBadge } from '@safi/ui';
import { ErrorText } from '@/components/form';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatPKR } from '@/lib/format';
import type { Category } from '@/lib/menu-types';
import { ACTIVE_STATUSES, rangeBounds, useOrderList, useOrderStats } from '@/lib/orders';
import { OrderProgressBar } from '@/components/orders/order-progress';

export default function OverviewPage() {
  const branchId = useAuth((s) => s.branchId);
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const { data: recent, error: ordersError } = useOrderList({ pageSize: 10 });
  const { data: active } = useOrderList({ status: ACTIVE_STATUSES, pageSize: 1 });
  const [todayRange] = useState(() => rangeBounds('today'));
  const today = useOrderStats(todayRange);
  const orders = recent?.items ?? null;
  const [menu, setMenu] = useState<Category[] | null>(null);
  const [menuError, setMenuError] = useState('');
  const error = ordersError || menuError;

  useEffect(() => {
    if (!branchId) return;
    setMenuError('');
    api
      .get<Category[]>('/menu/admin', { params: { branchId } })
      .then((m) => setMenu(m.data))
      .catch((err) => setMenuError(errorMessage(err)));
  }, [branchId]);

  const items = menu?.flatMap((c) => c.items) ?? [];
  const stats = [
    { label: 'Orders today', value: today ? today.total : '—' },
    {
      label: 'Sales today',
      value: today
        ? formatPKR(today.sales)
        : '—',
    },
    { label: 'Active orders', value: active ? active.total : '—' },
    {
      label: 'Menu items',
      value: menu ? `${items.filter((i) => i.isActive).length}` : '—',
      sub: menu ? `${items.filter((i) => i.isSoldOut).length} sold out` : undefined,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Good to see you, {user?.name.split(' ')[0]}</h1>
        <p className="text-sm text-gray-400">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <div className="text-xs uppercase tracking-wide text-gray-500">{s.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</div>
            {s.sub && <div className="mt-1 text-xs text-gray-500">{s.sub}</div>}
          </Card>
        ))}
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h2 className="font-medium">Recent orders</h2>
          <Link href="/orders" className="text-sm text-green-400 hover:underline">
            Manage orders →
          </Link>
        </div>
        {orders && orders.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-500">
            No orders yet. WhatsApp and POS orders will show up here once Phases 2–4 are live.
            <div className="mt-3">
              <Link href="/menu" className="text-green-400 hover:underline">
                Set up your menu →
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2 font-medium">Customer</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="w-40 px-4 py-2 font-medium">Progress</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {(orders ?? []).map((o) => (
                  <tr
                    key={o.id}
                    tabIndex={0}
                    onClick={() => router.push(`/orders?order=${o.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && router.push(`/orders?order=${o.id}`)}
                    className="cursor-pointer hover:bg-gray-800/40 focus:bg-gray-800/40 focus:outline-none"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs">{o.orderNumber}</td>
                    <td className="px-4 py-2.5">{o.customer.name ?? o.customer.phone}</td>
                    <td className="px-4 py-2.5 text-gray-400">{o.orderType.toLowerCase().replace('_', '-')}</td>
                    <td className="px-4 py-2.5">
                      <OrderProgressBar status={o.status} orderType={o.orderType} showLabel={false} />
                    </td>
                    <td className="px-4 py-2.5">
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatPKR(o.total)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{format(new Date(o.createdAt), 'HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
