'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  Ban,
  Bike,
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Inbox,
  KanbanSquare,
  Loader2,
  MessageCircle,
  PackageCheck,
  Search,
  ShoppingBag,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react';
import { Card, OrderStatusBadge, cn } from '@safi/ui';
import { ErrorText } from '@/components/form';
import { OrderActions } from '@/components/orders/order-actions';
import { OrderPanel } from '@/components/orders/order-panel';
import { OrderProgressBar } from '@/components/orders/order-progress';
import { formatPKR } from '@/lib/format';
import {
  ACTIVE_STATUSES,
  DATE_RANGES,
  rangeBounds,
  useOrderList,
  useOrderStats,
  type Order,
  type OrderStats,
  type OrderStatus,
  type OrderType,
} from '@/lib/orders';

// ─── Views in the management sidebar ──────────────────────────────────────────

interface View {
  key: string;
  label: string;
  icon: LucideIcon;
  statuses?: OrderStatus[];
}

const BOARD: View = { key: 'board', label: 'Live board', icon: KanbanSquare, statuses: ACTIVE_STATUSES };
const VIEWS: View[] = [
  { key: 'all', label: 'All orders', icon: ClipboardList },
  { key: 'new', label: 'New', icon: Inbox, statuses: ['NEW'] },
  { key: 'accepted', label: 'Accepted', icon: ThumbsUp, statuses: ['ACCEPTED'] },
  { key: 'preparing', label: 'Preparing', icon: ChefHat, statuses: ['PREPARING'] },
  { key: 'ready', label: 'Ready', icon: PackageCheck, statuses: ['READY'] },
  { key: 'out', label: 'Out for delivery', icon: Bike, statuses: ['OUT_FOR_DELIVERY'] },
  { key: 'completed', label: 'Completed', icon: CheckCircle2, statuses: ['DELIVERED', 'PICKED_UP'] },
  { key: 'cancelled', label: 'Cancelled', icon: Ban, statuses: ['CANCELLED', 'REFUNDED'] },
];

const COLUMNS: { title: string; statuses: OrderStatus[] }[] = [
  { title: 'New', statuses: ['NEW'] },
  { title: 'In the kitchen', statuses: ['ACCEPTED', 'PREPARING'] },
  { title: 'Ready & on the way', statuses: ['READY', 'OUT_FOR_DELIVERY'] },
];

const PAGE_SIZE = 50;
/** A new order waiting longer than this is flagged */
const SLOW_ACCEPT_MIN = 5;

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16 text-gray-500">
          <Loader2 className="animate-spin" />
        </div>
      }
    >
      <OrdersManager />
    </Suspense>
  );
}

function OrdersManager() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Filters live in the URL, so a view can be bookmarked or shared and Back works
  const viewKey = params.get('view') ?? 'board';
  const range = params.get('range') ?? 'today';
  const orderType = (params.get('type') as OrderType | null) ?? undefined;
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const openId = params.get('order');

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      // Any filter change goes back to the first page
      if (!('page' in changes)) next.delete('page');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const view = viewKey === 'board' ? BOARD : (VIEWS.find((v) => v.key === viewKey) ?? VIEWS[0]);
  const isBoard = view.key === 'board';
  const bounds = rangeBounds(range);
  const stats = useOrderStats(bounds);

  // The board always shows every open order, whatever day it was placed
  const { data, error } = useOrderList({
    status: view.statuses,
    orderType,
    q,
    ...(isBoard ? { pageSize: 200 } : { ...bounds, page, pageSize: PAGE_SIZE }),
  });

  const openOrder = (id: string) => setParams({ order: id, page: String(page) });

  return (
    <div className="mx-auto grid max-w-[90rem] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <ManagementSidebar
        viewKey={view.key}
        range={range}
        orderType={orderType}
        q={q}
        stats={stats}
        onChange={setParams}
      />

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">{view.label}</h1>
            <p className="text-sm text-gray-400">
              {isBoard
                ? 'Every open order, oldest first in each column. Click an order for details.'
                : `${DATE_RANGES[range as keyof typeof DATE_RANGES] ?? format(new Date(`${range}T00:00:00`), 'd MMM yyyy')}${
                    orderType ? ` · ${orderType.toLowerCase()} only` : ''
                  }${q ? ` · matching “${q}”` : ''}`}
            </p>
          </div>
          {data && !isBoard && <span className="text-sm text-gray-400">{data.total} orders</span>}
        </div>

        <ErrorText>{error}</ErrorText>

        {!data ? (
          <div className="flex justify-center py-16 text-gray-500">
            <Loader2 className="animate-spin" />
          </div>
        ) : isBoard ? (
          <Board orders={data.items} onOpen={openOrder} />
        ) : (
          <OrderTable
            orders={data.items}
            total={data.total}
            page={page}
            pageSize={PAGE_SIZE}
            onOpen={openOrder}
            onPage={(p) => setParams({ page: String(p) })}
          />
        )}
      </div>

      {openId && <OrderPanel orderId={openId} onClose={() => setParams({ order: null, page: String(page) })} />}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function ManagementSidebar({
  viewKey,
  range,
  orderType,
  q,
  stats,
  onChange,
}: {
  viewKey: string;
  range: string;
  orderType?: OrderType;
  q: string;
  stats: OrderStats | null;
  onChange: (changes: Record<string, string | null>) => void;
}) {
  const [search, setSearch] = useState(q);

  // Search as you type, without a request per keystroke
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => onChange({ q: search.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [search, q, onChange]);

  const count = (v: View) =>
    v.statuses ? v.statuses.reduce((n, s) => n + (stats?.counts[s] ?? 0), 0) : (stats?.total ?? 0);
  const activeNow = ACTIVE_STATUSES.reduce((n, s) => n + (stats?.counts[s] ?? 0), 0);
  const isPreset = range in DATE_RANGES;

  return (
    <aside className="space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Order #, name or phone"
          className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2 pl-8 pr-2 text-sm placeholder:text-gray-500 focus:border-green-600 focus:outline-none"
          aria-label="Search orders"
        />
      </div>

      <nav className="space-y-0.5">
        <ViewLink view={BOARD} active={viewKey === 'board'} badge={activeNow} highlight={(stats?.counts.NEW ?? 0) > 0} onClick={() => onChange({ view: null })} />
        <div className="px-3 pb-1 pt-3 text-[11px] uppercase tracking-wide text-gray-500">Orders by status</div>
        {VIEWS.map((v) => (
          <ViewLink
            key={v.key}
            view={v}
            active={viewKey === v.key}
            badge={count(v)}
            highlight={v.key === 'new' && count(v) > 0}
            onClick={() => onChange({ view: v.key })}
          />
        ))}
      </nav>

      <div className="space-y-2">
        <div className="px-1 text-[11px] uppercase tracking-wide text-gray-500">Date</div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(DATE_RANGES).map(([key, label]) => (
            <Chip key={key} active={range === key} onClick={() => onChange({ range: key === 'today' ? null : key })}>
              {label}
            </Chip>
          ))}
        </div>
        <input
          type="date"
          value={isPreset ? '' : range}
          max={format(new Date(), 'yyyy-MM-dd')}
          onChange={(e) => onChange({ range: e.target.value || null })}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-200 [color-scheme:dark]"
          aria-label="Pick a day"
        />
        <p className="px-1 text-[11px] text-gray-500">Counts and lists use this date. The live board shows all open orders.</p>
      </div>

      <div className="space-y-2">
        <div className="px-1 text-[11px] uppercase tracking-wide text-gray-500">Type</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!orderType} onClick={() => onChange({ type: null })}>
            All
          </Chip>
          <Chip active={orderType === 'DELIVERY'} onClick={() => onChange({ type: 'DELIVERY' })}>
            Delivery
          </Chip>
          <Chip active={orderType === 'PICKUP'} onClick={() => onChange({ type: 'PICKUP' })}>
            Pickup
          </Chip>
        </div>
      </div>

      <Card className="space-y-2 text-sm">
        <div className="text-[11px] uppercase tracking-wide text-gray-500">
          {DATE_RANGES[range as keyof typeof DATE_RANGES] ?? format(new Date(`${range}T00:00:00`), 'd MMM')} summary
        </div>
        <Stat label="Orders" value={stats ? String(stats.total) : '—'} />
        <Stat label="Sales" value={stats ? formatPKR(stats.sales) : '—'} />
        <Stat label="Average order" value={stats ? formatPKR(stats.averageOrder) : '—'} />
        <Stat
          label="Cancelled"
          value={stats ? String((stats.counts.CANCELLED ?? 0) + (stats.counts.REFUNDED ?? 0)) : '—'}
        />
      </Card>
    </aside>
  );
}

function ViewLink({
  view,
  active,
  badge,
  highlight,
  onClick,
}: {
  view: View;
  active: boolean;
  badge: number;
  highlight?: boolean;
  onClick: () => void;
}) {
  const Icon = view.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
        active ? 'bg-green-600/15 font-medium text-green-400' : 'text-gray-300 hover:bg-gray-900 hover:text-white',
      )}
    >
      <Icon size={17} />
      <span className="flex-1">{view.label}</span>
      <span
        className={cn(
          'min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] tabular-nums',
          highlight ? 'bg-green-600 font-semibold text-white' : 'bg-gray-800 text-gray-400',
        )}
      >
        {badge}
      </span>
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs',
        active ? 'border-green-600 bg-green-600/15 text-green-300' : 'border-gray-700 text-gray-300 hover:bg-gray-800',
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

// ─── Board ────────────────────────────────────────────────────────────────────

function Board({ orders, onOpen }: { orders: Order[]; onOpen: (id: string) => void }) {
  const [, tick] = useState(0);
  // Keep "waiting 6 min" labels fresh
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {COLUMNS.map((col) => {
        // Oldest first: that's the one to deal with next
        const list = orders.filter((o) => col.statuses.includes(o.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return (
          <section key={col.title} className="flex min-w-0 flex-col rounded-xl border border-gray-800 bg-gray-950/60">
            <h2 className="flex items-center justify-between border-b border-gray-800 px-4 py-2.5 font-medium">
              {col.title}
              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs tabular-nums text-gray-300">{list.length}</span>
            </h2>
            <div className="space-y-3 p-3 xl:max-h-[calc(100vh-14rem)] xl:overflow-y-auto">
              {list.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-600">Nothing here</div>
              ) : (
                list.map((o) => <BoardCard key={o.id} order={o} onOpen={() => onOpen(o.id)} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({ order: o, onOpen }: { order: Order; onOpen: () => void }) {
  const isNew = o.status === 'NEW';
  const waitingMin = (Date.now() - new Date(o.createdAt).getTime()) / 60_000;
  const slow = isNew && waitingMin >= SLOW_ACCEPT_MIN;
  const itemCount = o.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className={cn(
        'cursor-pointer space-y-2.5 rounded-xl border bg-gray-900 p-3 transition-colors hover:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600',
        isNew ? (slow ? 'border-red-600 ring-1 ring-red-600/40' : 'border-green-600 ring-1 ring-green-600/40') : 'border-gray-800',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-mono text-sm font-semibold">
            {o.orderNumber}
            {o.source === 'WHATSAPP' && <MessageCircle size={13} className="text-green-500" aria-label="WhatsApp order" />}
          </div>
          <div className="truncate text-sm text-gray-300">{o.customer.name ?? `+${o.customer.phone}`}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
          <span className="flex items-center gap-1 text-gray-400">
            {o.orderType === 'DELIVERY' ? <Bike size={13} /> : <ShoppingBag size={13} />}
            {o.orderType === 'DELIVERY' ? 'Delivery' : 'Pickup'}
          </span>
          <span className={cn(slow ? 'font-semibold text-red-400' : 'text-gray-500')} title={format(new Date(o.createdAt), 'd MMM, HH:mm')}>
            {isNew ? `waiting ${formatDistanceToNowStrict(new Date(o.createdAt))}` : format(new Date(o.createdAt), 'HH:mm')}
          </span>
        </div>
      </div>

      <div className="line-clamp-2 text-xs text-gray-400">
        {o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-xs text-gray-500">
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </span>
        <span className="font-semibold tabular-nums">{formatPKR(o.total)}</span>
      </div>

      <OrderProgressBar status={o.status} orderType={o.orderType} />
      <OrderActions order={o} compact />
    </div>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

function OrderTable({
  orders,
  total,
  page,
  pageSize,
  onOpen,
  onPage,
}: {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
  onOpen: (id: string) => void;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (orders.length === 0) {
    return (
      <Card className="py-16 text-center text-sm text-gray-500">No orders match these filters.</Card>
    );
  }

  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Order</th>
              <th className="px-4 py-2.5 font-medium">Placed</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Items</th>
              <th className="w-44 px-4 py-2.5 font-medium">Progress</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {orders.map((o) => (
              <tr
                key={o.id}
                tabIndex={0}
                onClick={() => onOpen(o.id)}
                onKeyDown={(e) => e.key === 'Enter' && onOpen(o.id)}
                className="cursor-pointer hover:bg-gray-800/50 focus:bg-gray-800/50 focus:outline-none"
              >
                <td className="px-4 py-3 font-mono text-xs">
                  <span className="flex items-center gap-1.5">
                    {o.orderNumber}
                    {o.source === 'WHATSAPP' && <MessageCircle size={12} className="text-green-500" />}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-400">{format(new Date(o.createdAt), 'd MMM, HH:mm')}</td>
                <td className="px-4 py-3">
                  <div>{o.customer.name ?? '—'}</div>
                  <div className="text-xs text-gray-500">+{o.customer.phone}</div>
                </td>
                <td className="px-4 py-3 text-gray-400">{o.orderType.toLowerCase().replace('_', '-')}</td>
                <td className="max-w-56 truncate px-4 py-3 text-gray-400" title={o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}>
                  {o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                </td>
                <td className="px-4 py-3">
                  <OrderProgressBar status={o.status} orderType={o.orderType} />
                </td>
                <td className="px-4 py-3">
                  <OrderStatusBadge status={o.status} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPKR(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-gray-800 px-4 py-2.5 text-sm text-gray-400">
        <span>
          {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
        </span>
        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="rounded p-1.5 hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="tabular-nums">
            Page {page} of {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
            className="rounded p-1.5 hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </Card>
  );
}
