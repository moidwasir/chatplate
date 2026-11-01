'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth-store';

/**
 * Live updates by polling GET /orders/changes every few seconds. Works on any host
 * (Vercel has no WebSockets). Emits the same events the API's Socket.IO gateway uses:
 *   order.created  { orderId, orderNumber, orderType, customerName, total }
 *   order.updated  { orderId, status }
 *   connect        after the first successful poll, and again after recovering from a failure
 *   disconnect     when a poll fails
 */
const POLL_MS = 4000;

type Listener = (payload: any) => void;

interface Poller {
  branchId: string;
  listeners: Map<string, Set<Listener>>;
  connected: boolean;
  timer?: ReturnType<typeof setTimeout>;
  since?: string;
  stopped: boolean;
}

let poller: Poller | null = null;

function emit(p: Poller, event: string, payload?: unknown) {
  p.listeners.get(event)?.forEach((fn) => fn(payload));
}

async function tick(p: Poller) {
  if (p.stopped) return;
  try {
    const { data } = await api.get<{
      now: string;
      created: unknown[];
      updated: unknown[];
    }>('/orders/changes', { params: { branchId: p.branchId, since: p.since }, timeout: 10_000 });
    if (p.stopped) return;
    p.since = data.now;
    if (!p.connected) {
      p.connected = true;
      emit(p, 'connect');
    }
    data.created.forEach((e) => emit(p, 'order.created', e));
    data.updated.forEach((e) => emit(p, 'order.updated', e));
  } catch {
    if (p.stopped) return;
    if (p.connected) {
      p.connected = false;
      emit(p, 'disconnect');
    }
  }
  if (!p.stopped) p.timer = setTimeout(() => void tick(p), POLL_MS);
}

/** The single poller for this branch, started on first use */
function branchPoller(branchId: string): Poller {
  if (poller && poller.branchId === branchId) return poller;
  if (poller) {
    poller.stopped = true;
    clearTimeout(poller.timer);
  }
  const p: Poller = { branchId, listeners: new Map(), connected: false, stopped: false };
  poller = p;
  void tick(p);
  return p;
}

/** Run `handler` whenever the current branch emits `event` (see the list above) */
export function useBranchEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const branchId = useAuth((s) => s.branchId);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!branchId) return;
    const p = branchPoller(branchId);
    const fn: Listener = (payload) => latest.current(payload as T);
    if (!p.listeners.has(event)) p.listeners.set(event, new Set());
    p.listeners.get(event)!.add(fn);
    return () => {
      p.listeners.get(event)?.delete(fn);
    };
  }, [branchId, event]);
}

/** 'checking' until the first poll answers, then 'up' or 'down' */
export function useLiveStatus(): 'checking' | 'up' | 'down' {
  const branchId = useAuth((s) => s.branchId);
  const [state, setState] = useState<'checking' | 'up' | 'down'>('checking');
  useEffect(() => {
    if (branchId && poller?.branchId === branchId && poller.connected) setState('up');
  }, [branchId]);
  useBranchEvent('connect', () => setState('up'));
  useBranchEvent('disconnect', () => setState('down'));
  return state;
}

/** Payload of order.created */
export interface OrderCreatedEvent {
  orderId: string;
  orderNumber: string;
  orderType: string;
  customerName: string;
  total: number;
}
