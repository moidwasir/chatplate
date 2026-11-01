'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, BellOff, X } from 'lucide-react';
import { formatPKR } from '@/lib/format';
import { useBranchEvent, type OrderCreatedEvent } from '@/lib/socket';

const SOUND_KEY = 'safi.orderSound';

/**
 * Chime + pop-up for every new order, on whichever dashboard page is open.
 * Browsers only allow sound after the user has clicked somewhere on the page,
 * so the audio is unlocked on the first click.
 */
export function OrderAlerts() {
  const pathname = usePathname();
  const [soundOn, setSoundOn] = useState(true);
  const [toasts, setToasts] = useState<OrderCreatedEvent[]>([]);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem(SOUND_KEY) !== 'off');
    } catch {}
    const unlock = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const chime = useCallback(() => {
    const ctx = audio.current;
    if (!ctx || ctx.state !== 'running') return;
    // Two rising notes, played twice
    [0, 0.18, 0.6, 0.78].forEach((at, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i % 2 ? 1175 : 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.17);
    });
  }, []);

  useBranchEvent<OrderCreatedEvent>('order.created', (order) => {
    if (soundOn) chime();
    setToasts((t) => [order, ...t.filter((x) => x.orderId !== order.orderId)].slice(0, 3));
  });

  const dismiss = (orderId: string) => setToasts((t) => t.filter((x) => x.orderId !== orderId));

  // Already looking at the orders board — the highlighted card is the alert
  useEffect(() => {
    if (pathname.startsWith('/orders')) setToasts([]);
  }, [pathname]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch {}
    if (next) {
      audio.current ??= new AudioContext();
      void audio.current.resume().then(chime);
    }
  };

  return (
    <>
      <button
        onClick={toggleSound}
        className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
        title={soundOn ? 'New-order sound is on (click to mute)' : 'New-order sound is off (click to turn on)'}
        aria-label={soundOn ? 'Mute new-order sound' : 'Turn on new-order sound'}
      >
        {soundOn ? <Bell size={18} /> : <BellOff size={18} />}
      </button>

      {toasts.length > 0 && !pathname.startsWith('/orders') && (
        <div className="fixed bottom-4 right-4 z-50 w-80 space-y-2">
          {toasts.map((t) => (
            <div key={t.orderId} className="rounded-xl border border-green-700 bg-gray-900 p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-green-400">🛎️ New order {t.orderNumber}</div>
                  <div className="mt-1 text-sm text-gray-300">
                    {t.customerName} · {t.orderType.toLowerCase()} · {formatPKR(t.total)}
                  </div>
                </div>
                <button onClick={() => dismiss(t.orderId)} className="rounded p-1 text-gray-500 hover:text-white" aria-label="Dismiss">
                  <X size={16} />
                </button>
              </div>
              <Link href="/orders" className="mt-3 inline-block text-sm font-medium text-green-400 hover:underline">
                Open orders →
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
