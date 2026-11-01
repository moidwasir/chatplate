'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from './api';
import { useAuth } from './auth-store';

// One connection for the whole app, joined to the current branch's room.
// The server has no "leave", so switching branch opens a fresh connection.
let socket: Socket | null = null;
let socketBranch: string | null = null;

export function branchSocket(branchId: string): Socket {
  if (socket && socketBranch === branchId) return socket;
  socket?.disconnect();
  const s = io(SOCKET_URL, { transports: ['websocket'], reconnectionDelayMax: 10_000 });
  // Runs again after every reconnect, so the room is rejoined automatically
  s.on('connect', () => s.emit('join', { branchId }));
  socket = s;
  socketBranch = branchId;
  return s;
}

/**
 * Run `handler` whenever the current branch's socket emits `event`.
 * Also accepts socket lifecycle events such as 'connect' (handy for refetching after a drop).
 */
export function useBranchEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const branchId = useAuth((s) => s.branchId);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!branchId) return;
    const s = branchSocket(branchId);
    const fn = (payload: T) => latest.current(payload);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [branchId, event]);
}

/** Payload of the API's order.created event */
export interface OrderCreatedEvent {
  orderId: string;
  orderNumber: string;
  orderType: string;
  customerName: string;
  total: number;
}
