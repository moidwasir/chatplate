'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNowStrict, format, isToday } from 'date-fns';
import { Bot, Loader2, MapPin, MessageCircle, Search, Send, UserRound } from 'lucide-react';
import { Badge, Button, Card, cn } from '@safi/ui';
import { ErrorText } from '@/components/form';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

/** The bot writes in the background; re-read the open chat this often */
const POLL_MS = 5000;

interface ChatRow {
  customer: { id: string; name: string | null; phone: string; isBlocked: boolean };
  handledBy: 'BOT' | 'HUMAN';
  lastMessageAt: string;
  lastMessage: { direction: 'INBOUND' | 'OUTBOUND'; text: string } | null;
  waitingForStaff: boolean;
}

interface ChatMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  at: string;
  status: string | null;
  text: string;
  buttons?: string[];
  imageUrl?: string;
  location?: { lat: number; lng: number };
  staffName?: string;
}

interface Thread {
  customer: { id: string; name: string | null; phone: string; isBlocked: boolean };
  orderCount: number;
  handledBy: 'BOT' | 'HUMAN';
  windowOpen: boolean;
  windowEndsAt: string | null;
  messages: ChatMessage[];
}

const nameOf = (c: { name: string | null; phone: string }) => c.name || `+${c.phone}`;

export default function ChatsPage() {
  return (
    <Suspense fallback={<Loader2 className="mx-auto mt-20 animate-spin text-gray-500" />}>
      <Chats />
    </Suspense>
  );
}

function Chats() {
  const branchId = useAuth((s) => s.branchId);
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get('c');
  const [filter, setFilter] = useState<'all' | 'HUMAN'>('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ChatRow[] | null>(null);
  const [humanCount, setHumanCount] = useState(0);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data } = await api.get<{ items: ChatRow[]; humanCount: number }>('/chats', {
        params: { branchId, q: q || undefined, handledBy: filter === 'HUMAN' ? 'HUMAN' : undefined },
      });
      setRows(data.items);
      setHumanCount(data.humanCount);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [branchId, q, filter]);

  useEffect(() => {
    void loadList();
    const t = setInterval(() => void loadList(), POLL_MS);
    return () => clearInterval(t);
  }, [loadList]);

  const open = (id: string | null) => router.replace(id ? `/chats?c=${id}` : '/chats', { scroll: false });

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-6xl flex-col gap-3">
      <div>
        <h1 className="text-2xl font-semibold">WhatsApp chats</h1>
        <p className="text-sm text-gray-400">
          Every conversation with the bot. Reply to take over; hand it back when you're done.
        </p>
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[320px_1fr]">
        {/* ─── List ─── */}
        <Card className={cn('flex min-h-0 flex-col p-0', selectedId && 'hidden md:flex')}>
          <div className="space-y-2 border-b border-gray-800 p-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or phone"
                className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-8 pr-3 text-sm placeholder-gray-500 focus:border-green-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-1 text-sm">
              {(['all', 'HUMAN'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'rounded-lg px-3 py-1',
                    filter === f ? 'bg-green-600/15 text-green-400' : 'text-gray-400 hover:bg-gray-800',
                  )}
                >
                  {f === 'all' ? 'All' : 'With staff'}
                  {f === 'HUMAN' && humanCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 text-xs text-white">{humanCount}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-gray-800/70 overflow-y-auto">
            {!rows && <Loader2 className="mx-auto my-8 animate-spin text-gray-500" />}
            {rows?.length === 0 && <p className="p-4 text-sm text-gray-500">No chats yet.</p>}
            {rows?.map((r) => (
              <li key={r.customer.id}>
                <button
                  onClick={() => open(r.customer.id)}
                  className={cn(
                    'flex w-full gap-3 px-3 py-3 text-left hover:bg-gray-800/60',
                    r.customer.id === selectedId && 'bg-gray-800',
                  )}
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-800 text-gray-400">
                    {r.handledBy === 'HUMAN' ? <UserRound size={16} /> : <Bot size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{nameOf(r.customer)}</span>
                      <span className="ml-auto shrink-0 text-xs text-gray-500">
                        {formatDistanceToNowStrict(new Date(r.lastMessageAt))}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-xs text-gray-400">
                        {r.lastMessage?.direction === 'OUTBOUND' && '↪ '}
                        {r.lastMessage?.text.split('\n')[0] ?? ''}
                      </span>
                      {r.waitingForStaff && (
                        <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-orange-500" title="Waiting for a reply" />
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* ─── Thread ─── */}
        <Card className={cn('flex min-h-0 flex-col p-0', !selectedId && 'hidden md:flex')}>
          {selectedId && branchId ? (
            <ThreadView key={selectedId} customerId={selectedId} branchId={branchId} onBack={() => open(null)} onChanged={loadList} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-500">
              <MessageCircle size={32} />
              <p className="text-sm">Pick a chat</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ThreadView({
  customerId,
  branchId,
  onBack,
  onChanged,
}: {
  customerId: string;
  branchId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Thread>(`/chats/${customerId}`, { params: { branchId } });
      setThread(data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [customerId, branchId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Scroll down when a new message arrives
  useEffect(() => {
    const newest = thread?.messages.at(-1)?.id ?? null;
    if (newest && newest !== lastId.current) {
      lastId.current = newest;
      bottom.current?.scrollIntoView({ block: 'end' });
    }
  }, [thread]);

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

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    await act(async () => {
      await api.post(`/chats/${customerId}/reply`, { branchId, text: body });
      setText('');
    });
  }

  const setHandler = (handledBy: 'BOT' | 'HUMAN') => act(() => api.post(`/chats/${customerId}/handler`, { branchId, handledBy }));

  if (!thread) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-500">
        {error ? <ErrorText>{error}</ErrorText> : <Loader2 className="animate-spin" />}
      </div>
    );
  }

  const human = thread.handledBy === 'HUMAN';
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-800 px-4 py-3">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white md:hidden">
          ← Back
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{nameOf(thread.customer)}</span>
            {human ? <Badge variant="yellow">Staff is replying</Badge> : <Badge variant="green">Bot is replying</Badge>}
            {thread.customer.isBlocked && <Badge variant="red">Blocked</Badge>}
          </div>
          <p className="text-xs text-gray-500">
            +{thread.customer.phone} ·{' '}
            <Link href={`/customers?c=${thread.customer.id}`} className="hover:text-green-400 hover:underline">
              {thread.orderCount} order{thread.orderCount === 1 ? '' : 's'}
            </Link>
          </p>
        </div>
        {human ? (
          <Button size="sm" variant="secondary" onClick={() => setHandler('BOT')} disabled={busy}>
            <Bot size={14} /> Hand back to bot
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setHandler('HUMAN')} disabled={busy}>
            <UserRound size={14} /> Take over
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-gray-950/40 px-4 py-4">
        {thread.messages.length === 0 && <p className="text-center text-sm text-gray-500">No messages yet.</p>}
        {thread.messages.map((m, i) => {
          const prev = thread.messages[i - 1];
          const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 text-center text-xs text-gray-500">
                  {isToday(new Date(m.at)) ? 'Today' : format(new Date(m.at), 'EEE d MMM')}
                </div>
              )}
              <Bubble m={m} />
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <div className="space-y-2 border-t border-gray-800 p-3">
        <ErrorText>{error}</ErrorText>
        {!thread.windowOpen && (
          <p className="text-xs text-yellow-400">
            The customer last wrote more than 24 hours ago, so WhatsApp won't deliver a typed reply until they message
            again.
          </p>
        )}
        <form onSubmit={send} className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(e);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={human ? 'Type a reply…' : 'Type a reply (this takes the chat over from the bot)…'}
            className="min-h-[40px] flex-1 resize-none rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm placeholder-gray-500 focus:border-green-500 focus:outline-none"
          />
          <Button type="submit" disabled={busy || !text.trim()} aria-label="Send">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </form>
      </div>
    </>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.direction === 'OUTBOUND';
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-xl px-3 py-2 text-sm',
          mine ? (m.staffName ? 'bg-green-800/70' : 'bg-gray-800') : 'bg-gray-700/60',
        )}
      >
        {mine && (
          <div className="mb-0.5 text-[11px] text-gray-400">{m.staffName ? `👤 ${m.staffName}` : '🤖 Bot'}</div>
        )}
        {m.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.imageUrl} alt="" className="mb-1.5 max-h-40 rounded-lg object-cover" />
        )}
        <p className="whitespace-pre-wrap break-words">{m.text}</p>
        {m.location && (
          <a
            href={`https://www.google.com/maps?q=${m.location.lat},${m.location.lng}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-green-400 hover:underline"
          >
            <MapPin size={12} /> Open map
          </a>
        )}
        {m.buttons && m.buttons.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {m.buttons.map((b, i) => (
              <span key={i} className="rounded border border-gray-600 px-1.5 py-0.5 text-xs text-gray-300">
                {b}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1 text-right text-[10px] text-gray-500">
          {format(new Date(m.at), 'HH:mm')}
          {mine && m.status && ` · ${m.status === 'failed' ? '⚠️ not delivered' : m.status}`}
        </div>
      </div>
    </div>
  );
}
