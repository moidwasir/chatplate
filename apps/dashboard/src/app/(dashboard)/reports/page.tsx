'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, endOfDay, format, startOfDay, subDays } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Card, cn } from '@safi/ui';
import { ErrorText } from '@/components/form';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatPKR } from '@/lib/format';

interface Bucket {
  orders: number;
  sales: number;
}

interface SalesReport {
  totals: { orders: number; sales: number; averageOrder: number; cancelled: number; customers: number; tips: number; deliveryFees: number };
  byDay: (Bucket & { date: string })[];
  byHour: (Bucket & { hour: number })[];
  byType: Record<string, Bucket>;
  bySource: Record<string, Bucket>;
  topItems: { name: string; quantity: number; revenue: number }[];
}

const RANGES = {
  today: { label: 'Today', days: 1 },
  '7d': { label: 'Last 7 days', days: 7 },
  '30d': { label: 'Last 30 days', days: 30 },
  '90d': { label: 'Last 90 days', days: 90 },
} as const;
type RangeKey = keyof typeof RANGES;

const SOURCE_LABELS: Record<string, string> = { WHATSAPP: 'WhatsApp', POS: 'Counter (POS)', WEB: 'Web' };

export default function ReportsPage() {
  const branchId = useAuth((s) => s.branchId);
  const [range, setRange] = useState<RangeKey>('7d');
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState('');

  const bounds = useMemo(() => {
    const now = new Date();
    return { from: startOfDay(subDays(now, RANGES[range].days - 1)), to: endOfDay(now) };
  }, [range]);

  useEffect(() => {
    if (!branchId) return;
    let live = true;
    setReport(null);
    api
      .get<SalesReport>('/reports/sales', {
        params: { branchId, from: bounds.from.toISOString(), to: bounds.to.toISOString() },
      })
      .then(({ data }) => live && (setReport(data), setError('')))
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [branchId, bounds]);

  // Every day in the range, including days without orders
  const days = useMemo(() => {
    if (!report) return [];
    const found = new Map(report.byDay.map((d) => [d.date, d]));
    const out: { label: string; tip: string; value: number; orders: number }[] = [];
    for (let d = bounds.from; d <= bounds.to; d = addDays(d, 1)) {
      const key = format(d, 'yyyy-MM-dd');
      const b = found.get(key) ?? { orders: 0, sales: 0 };
      out.push({ label: format(d, RANGES[range].days > 14 ? 'd MMM' : 'EEE d'), tip: format(d, 'EEE d MMM'), value: b.sales, orders: b.orders });
    }
    return out;
  }, [report, bounds, range]);

  const hours = useMemo(
    () =>
      (report?.byHour ?? []).map((h) => ({
        label: format(new Date(2000, 0, 1, h.hour), 'ha').toLowerCase(),
        tip: `${format(new Date(2000, 0, 1, h.hour), 'h a')} – ${format(new Date(2000, 0, 1, (h.hour + 1) % 24), 'h a')}`,
        value: h.orders,
        orders: h.orders,
      })),
    [report],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-gray-400">Sales exclude cancelled orders and tips. Days and hours are in restaurant time.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-gray-800 p-1 text-sm">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={cn('rounded-md px-3 py-1', range === k ? 'bg-green-600/15 text-green-400' : 'text-gray-400 hover:bg-gray-800')}
            >
              {RANGES[k].label}
            </button>
          ))}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      {!report ? (
        !error && <Loader2 className="mx-auto mt-16 animate-spin text-gray-500" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Sales" value={formatPKR(report.totals.sales)} />
            <Stat label="Orders" value={String(report.totals.orders)} sub={report.totals.cancelled ? `${report.totals.cancelled} cancelled` : undefined} />
            <Stat label="Average order" value={formatPKR(report.totals.averageOrder)} />
            <Stat label="Customers" value={String(report.totals.customers)} sub={`${formatPKR(report.totals.deliveryFees)} delivery fees`} />
          </div>

          {range !== 'today' && (
            <Card>
              <h2 className="mb-3 font-medium">Sales by day</h2>
              <BarChart data={days} format={(v) => formatPKR(v)} sub={(d) => `${d.orders} order${d.orders === 1 ? '' : 's'}`} />
            </Card>
          )}

          <Card>
            <h2 className="font-medium">Busiest hours</h2>
            <p className="mb-3 text-xs text-gray-500">Orders placed in each hour, over the whole range</p>
            <BarChart data={hours} format={(v) => `${v} order${v === 1 ? '' : 's'}`} labelEvery={3} />
          </Card>

          <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
            <Card className="p-0">
              <h2 className="px-4 pt-4 font-medium">Top items</h2>
              {report.topItems.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">No sales in this range.</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-4 py-2 text-right font-medium">Sold</th>
                      <th className="px-4 py-2 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/70">
                    {report.topItems.map((i) => (
                      <tr key={i.name}>
                        <td className="px-4 py-2">{i.name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{i.quantity}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatPKR(i.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card className="space-y-4">
              <Split title="Delivery vs pickup" rows={[['Delivery', report.byType.DELIVERY], ['Pickup', report.byType.PICKUP]]} />
              <Split
                title="Where orders came from"
                rows={Object.entries(report.bySource).map(([k, v]) => [SOURCE_LABELS[k] ?? k, v] as [string, Bucket])}
              />
              <p className="text-xs text-gray-500">Tips collected: {formatPKR(report.totals.tips)}</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </Card>
  );
}

/** Share of orders per group, as a labelled meter */
function Split({ title, rows }: { title: string; rows: [string, Bucket | undefined][] }) {
  const total = rows.reduce((n, [, b]) => n + (b?.orders ?? 0), 0);
  return (
    <div>
      <h2 className="mb-2 font-medium">{title}</h2>
      {total === 0 && <p className="text-sm text-gray-500">No orders.</p>}
      <ul className="space-y-2">
        {total > 0 &&
          rows.map(([label, b]) => {
            const pct = Math.round(((b?.orders ?? 0) / total) * 100);
            return (
              <li key={label}>
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums text-gray-400">
                    {b?.orders ?? 0} · {pct}% · {formatPKR(b?.sales ?? 0)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-800">
                  <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

interface BarDatum {
  label: string;
  tip: string;
  value: number;
  orders: number;
}

/** Single-series vertical bars with a hover tooltip; one hue, so no legend */
function BarChart({
  data,
  format: fmt,
  sub,
  labelEvery,
}: {
  data: BarDatum[];
  format: (v: number) => string;
  sub?: (d: BarDatum) => string;
  labelEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 12));
  const h = hover != null ? data[hover] : null;

  return (
    <div>
      <div className="relative">
        {/* Recessive grid: top and middle */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-gray-800" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-gray-800" />
        <span className="pointer-events-none absolute -top-2 right-0 bg-gray-900 pl-1 text-[10px] text-gray-500">{fmt(max)}</span>

        <div className="flex h-44 items-end gap-0.5 border-b border-gray-700" onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => (
            <div
              key={i}
              className="flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(i)}
              aria-label={`${d.tip}: ${fmt(d.value)}`}
            >
              <div
                className={cn('w-full rounded-t-[4px] transition-colors', hover === i ? 'bg-green-400' : 'bg-green-600')}
                style={{ height: d.value > 0 ? `max(2px, ${(d.value / max) * 100}%)` : 0 }}
              />
            </div>
          ))}
        </div>

        {h && hover != null && (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs shadow-xl"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          >
            <div className="text-gray-400">{h.tip}</div>
            <div className="font-semibold tabular-nums text-white">{fmt(h.value)}</div>
            {sub && <div className="text-gray-400">{sub(h)}</div>}
          </div>
        )}
      </div>
      <div className="mt-1 flex gap-0.5">
        {data.map((d, i) => (
          <div key={i} className="relative h-4 flex-1">
            {i % every === 0 && (
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-gray-500">{d.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
