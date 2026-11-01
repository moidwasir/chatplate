'use client';

import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { Ban, Loader2, MapPin, MessageCircle, Search, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, OrderStatusBadge, cn } from '@safi/ui';
import { ErrorText, Input, TextArea } from '@/components/form';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatPKR } from '@/lib/format';

const PAGE_SIZE = 50;

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string;
  isBlocked: boolean;
  createdAt: string;
  orderCount: number;
  spent: number;
  lastOrderAt: string | null;
}

interface CustomerDetail extends CustomerRow {
  addresses: { id: string; label: string; address: string; lat: number; lng: number; isDefault: boolean }[];
  notes: { id: string; note: string; createdAt: string; createdByName: string }[];
  orders: {
    id: string;
    orderNumber: string;
    status: string;
    orderType: string;
    total: number;
    createdAt: string;
    items: { name: string; quantity: number }[];
  }[];
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<Loader2 className="mx-auto mt-20 animate-spin text-gray-500" />}>
      <Customers />
    </Suspense>
  );
}

function Customers() {
  const branchId = useAuth((s) => s.branchId);
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get('c');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: CustomerRow[]; total: number } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data } = await api.get<{ items: CustomerRow[]; total: number }>('/customers', {
        params: { branchId, q: q || undefined, page, pageSize: PAGE_SIZE },
      });
      setData(data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [branchId, q, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const open = (id: string | null) => router.replace(id ? `/customers?c=${id}` : '/customers', { scroll: false });
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-gray-400">Everyone who has ordered or chatted on WhatsApp. Spend excludes cancelled orders.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or phone"
            className="pl-8"
          />
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
              <th className="px-4 py-3 text-right font-medium">Spent</th>
              <th className="px-4 py-3 font-medium">Last order</th>
              <th className="px-4 py-3 font-medium">First seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/70">
            {!data && (
              <tr>
                <td colSpan={5} className="py-10 text-center">
                  <Loader2 className="mx-auto animate-spin text-gray-500" />
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No customers found.
                </td>
              </tr>
            )}
            {data?.items.map((c) => (
              <tr key={c.id} onClick={() => open(c.id)} className="cursor-pointer hover:bg-gray-800/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    {c.name || <span className="text-gray-500">No name</span>}
                    {c.isBlocked && <Badge variant="red">Blocked</Badge>}
                  </div>
                  <div className="text-xs text-gray-500">+{c.phone}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{c.orderCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPKR(c.spent)}</td>
                <td className="px-4 py-3 text-gray-400">
                  {c.lastOrderAt ? `${formatDistanceToNowStrict(new Date(c.lastOrderAt))} ago` : '—'}
                </td>
                <td className="px-4 py-3 text-gray-400">{format(new Date(c.createdAt), 'd MMM yyyy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-sm text-gray-400">
          <span>
            Page {page} of {pages} · {data.total} customers
          </span>
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      {selectedId && branchId && (
        <CustomerPanel key={selectedId} id={selectedId} branchId={branchId} onClose={() => open(null)} onChanged={load} />
      )}
    </div>
  );
}

function CustomerPanel({
  id,
  branchId,
  onClose,
  onChanged,
}: {
  id: string;
  branchId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [c, setC] = useState<CustomerDetail | null>(null);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<CustomerDetail>(`/customers/${id}`, { params: { branchId } });
      setC(data);
      setName(data.name ?? '');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await act(async () => {
      await api.post(`/customers/${id}/notes`, { note });
      setNote('');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        className="h-full w-full max-w-lg overflow-y-auto border-l border-gray-800 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Customer"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-800 bg-gray-900 px-5 py-3">
          <h2 className="font-semibold">Customer</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!c ? (
          <div className="flex justify-center py-16 text-gray-500">
            {error ? <ErrorText>{error}</ErrorText> : <Loader2 className="animate-spin" />}
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <ErrorText>{error}</ErrorText>

            <div className="space-y-2">
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={80} />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || name === (c.name ?? '')}
                  onClick={() => act(() => api.patch(`/customers/${id}`, { name }))}
                >
                  Save
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                <span>+{c.phone}</span>
                <Link href={`/chats?c=${c.id}`} className="inline-flex items-center gap-1 text-green-400 hover:underline">
                  <MessageCircle size={14} /> Chat
                </Link>
                <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" className="text-green-400 hover:underline">
                  Open in WhatsApp
                </a>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['Orders', String(c.orderCount)],
                ['Spent', formatPKR(c.spent)],
                ['Average', c.orderCount ? formatPKR(Math.round(c.spent / Math.max(1, c.orderCount))) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-gray-950 p-3">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="font-semibold tabular-nums">{value}</div>
                </div>
              ))}
            </div>

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Orders</h3>
              {c.orders.length === 0 && <p className="text-sm text-gray-500">No orders yet.</p>}
              <ul className="divide-y divide-gray-800 rounded-lg border border-gray-800">
                {c.orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders?view=all&range=all&order=${o.id}`} className="block px-3 py-2 hover:bg-gray-800/50">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{o.orderNumber}</span>
                        <OrderStatusBadge status={o.status} />
                        <span className="ml-auto tabular-nums">{formatPKR(o.total)}</span>
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {format(new Date(o.createdAt), 'd MMM, HH:mm')} · {o.orderType.toLowerCase()} ·{' '}
                        {o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Saved addresses</h3>
              {c.addresses.length === 0 && <p className="text-sm text-gray-500">None.</p>}
              <ul className="space-y-1.5">
                {c.addresses.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-gray-500" />
                    <span className="flex-1">
                      {a.label}
                      {a.isDefault && <span className="ml-1 text-xs text-gray-500">(default)</span>}
                      <span className="block text-xs text-gray-500">{a.address}</span>
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${a.lat},${a.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-green-400 hover:underline"
                    >
                      Map
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Staff notes</h3>
              <form onSubmit={addNote} className="mb-2 space-y-2">
                <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Prefers less spicy, gate code 42" maxLength={1000} />
                <Button size="sm" type="submit" disabled={busy || !note.trim()}>
                  Add note
                </Button>
              </form>
              <ul className="space-y-2">
                {c.notes.map((n) => (
                  <li key={n.id} className="group rounded-lg bg-gray-950 px-3 py-2 text-sm">
                    <div className="flex gap-2">
                      <p className="flex-1 whitespace-pre-wrap">{n.note}</p>
                      <button
                        onClick={() => act(() => api.delete(`/customers/${id}/notes/${n.id}`))}
                        className="text-gray-600 hover:text-red-400"
                        aria-label="Delete note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {n.createdByName} · {format(new Date(n.createdAt), 'd MMM yyyy')}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="border-t border-gray-800 pt-4">
              <Button
                size="sm"
                variant={c.isBlocked ? 'secondary' : 'danger'}
                disabled={busy}
                onClick={() =>
                  (c.isBlocked || confirm('Block this customer? The bot will ignore their WhatsApp messages.')) &&
                  act(() => api.patch(`/customers/${id}`, { isBlocked: !c.isBlocked }))
                }
              >
                <Ban size={14} /> {c.isBlocked ? 'Unblock' : 'Block customer'}
              </Button>
              <p className={cn('mt-1 text-xs text-gray-500')}>Blocked customers get no replies from the bot.</p>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
