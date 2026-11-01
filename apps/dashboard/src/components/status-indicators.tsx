'use client';

import { useEffect, useState } from 'react';
import { cn } from '@safi/ui';
import { api } from '@/lib/api';
import { branchSocket } from '@/lib/socket';
import { useAuth } from '@/lib/auth-store';

type Health = 'checking' | 'up' | 'down';

/** API health (polled) + real-time socket connection, shown in the top bar */
export function StatusIndicators() {
  const branchId = useAuth((s) => s.branchId);
  const [apiHealth, setApiHealth] = useState<Health>('checking');
  const [live, setLive] = useState<Health>('checking');

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      api
        .get('/health', { timeout: 5000 })
        .then(() => !cancelled && setApiHealth('up'))
        .catch(() => !cancelled && setApiHealth('down'));
    check();
    const timer = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!branchId) return;
    const socket = branchSocket(branchId);
    setLive(socket.connected ? 'up' : 'checking');
    const up = () => setLive('up');
    const down = () => setLive('down');
    socket.on('connect', up);
    socket.on('disconnect', down);
    socket.on('connect_error', down);
    return () => {
      socket.off('connect', up);
      socket.off('disconnect', down);
      socket.off('connect_error', down);
    };
  }, [branchId]);

  return (
    <div className="flex items-center gap-4 text-xs text-gray-400">
      <Dot state={apiHealth} label="API" />
      <Dot state={live} label="Live updates" />
    </div>
  );
}

function Dot({ state, label }: { state: Health; label: string }) {
  const text = { checking: 'checking…', up: 'online', down: 'offline' }[state];
  return (
    <span className="flex items-center gap-1.5" title={`${label}: ${text}`}>
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          state === 'up' && 'bg-green-500 shadow-[0_0_6px] shadow-green-500',
          state === 'down' && 'bg-red-500',
          state === 'checking' && 'animate-pulse bg-gray-500',
        )}
      />
      <span className="hidden sm:inline">{label}</span>
      <span className={cn(state === 'down' ? 'text-red-400' : 'text-gray-500')}>{text}</span>
    </span>
  );
}
