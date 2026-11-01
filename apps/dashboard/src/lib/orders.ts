'use client';

import { useCallback, useEffect, useState } from 'react';
import { endOfDay, startOfDay, subDays } from 'date-fns';
import { api, errorMessage } from './api';
import { useAuth } from './auth-store';
import { useBranchEvent } from './socket';

export type OrderStatus =
  | 'NEW'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'PICKED_UP'
  | 'CANCELLED'
  | 'REFUNDED';

export type OrderType = 'DELIVERY' | 'PICKUP' | 'DINE_IN';

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: string;
  orderType: OrderType;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  discountAmount: number;
  tip: number;
  total: number;
  notes: string | null;
  estimatedMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  customer: { name: string | null; phone: string };
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    notes: string | null;
    modifiers: { id: string; name: string; priceAdjustment: number }[];
  }[];
  address: { label: string; address: string; houseNo: string | null; landmark: string | null; lat: number; lng: number } | null;
  payment: { method: string; status: string } | null;
}

export interface StatusChange {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  reason: string | null;
  createdAt: string;
  changedByName: string | null;
}

export interface OrderDetail extends Order {
  statusHistory: StatusChange[];
}

export interface OrderPage {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrderStats {
  counts: Partial<Record<OrderStatus, number>>;
  total: number;
  sales: number;
  averageOrder: number;
}

export const ACTIVE_STATUSES: OrderStatus[] = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

export interface OrderQuery {
  status?: OrderStatus[];
  orderType?: OrderType;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Refetch on every order change, and after reconnecting (events may have been missed) */
function useOrderEvents(reload: () => void) {
  useBranchEvent('order.created', reload);
  useBranchEvent('order.updated', reload);
  useBranchEvent('connect', reload);
}

/** A live, filtered page of the branch's orders */
export function useOrderList(query: OrderQuery) {
  const branchId = useAuth((s) => s.branchId);
  const [data, setData] = useState<OrderPage | null>(null);
  const [error, setError] = useState('');
  const key = JSON.stringify(query);

  const reload = useCallback(async () => {
    if (!branchId) return;
    const q: OrderQuery = JSON.parse(key);
    try {
      const { data } = await api.get<OrderPage>('/orders', {
        params: { branchId, ...q, status: q.status?.join(',') || undefined, q: q.q || undefined },
      });
      setData(data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [branchId, key]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useOrderEvents(reload);

  return { data, error, reload };
}

/** Live per-status counts and sales for a date range */
export function useOrderStats(range: { from?: string; to?: string }) {
  const branchId = useAuth((s) => s.branchId);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const { from, to } = range;

  const reload = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data } = await api.get<OrderStats>('/orders/stats', { params: { branchId, from, to } });
      setStats(data);
    } catch {
      // The list shows the error; counts just stay as they were
    }
  }, [branchId, from, to]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useOrderEvents(reload);

  return stats;
}

/** One order with its status history, kept live */
export function useOrder(id: string | null) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get<OrderDetail>(`/orders/${id}`);
      setOrder(data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    setOrder(null);
    void reload();
  }, [reload]);
  useBranchEvent<{ orderId: string }>('order.updated', (e) => {
    if (e.orderId === id) void reload();
  });

  return { order, error };
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  extra: { reason?: string; estimatedMinutes?: number } = {},
) {
  await api.patch(`/orders/${orderId}/status`, { status, ...extra });
}

// ─── Date ranges ──────────────────────────────────────────────────────────────

export const DATE_RANGES = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
} as const;
export type DateRangeKey = keyof typeof DATE_RANGES;

/** Local-time bounds for a preset, or a single yyyy-mm-dd day */
export function rangeBounds(key: string): { from?: string; to?: string } {
  const now = new Date();
  const span = (from: Date, to: Date) => ({ from: from.toISOString(), to: to.toISOString() });
  switch (key) {
    case 'today':
      return span(startOfDay(now), endOfDay(now));
    case 'yesterday':
      return span(startOfDay(subDays(now, 1)), endOfDay(subDays(now, 1)));
    case '7d':
      return span(startOfDay(subDays(now, 6)), endOfDay(now));
    case '30d':
      return span(startOfDay(subDays(now, 29)), endOfDay(now));
    case 'all':
      return {};
    default: {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(key) ? new Date(`${key}T00:00:00`) : null;
      return day && !isNaN(day.getTime()) ? span(startOfDay(day), endOfDay(day)) : span(startOfDay(now), endOfDay(now));
    }
  }
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export interface ProgressStep {
  status: OrderStatus;
  label: string;
}

/** The steps an order of this type goes through, in order */
export function progressSteps(orderType: OrderType): ProgressStep[] {
  return [
    { status: 'NEW', label: 'Placed' },
    { status: 'ACCEPTED', label: 'Accepted' },
    { status: 'PREPARING', label: 'Preparing' },
    { status: 'READY', label: 'Ready' },
    ...(orderType === 'DELIVERY'
      ? [
          { status: 'OUT_FOR_DELIVERY' as const, label: 'On the way' },
          { status: 'DELIVERED' as const, label: 'Delivered' },
        ]
      : [{ status: 'PICKED_UP' as const, label: 'Picked up' }]),
  ];
}

/** Index of the step the order has reached (-1 when cancelled/refunded) */
export function progressIndex(order: { status: OrderStatus; orderType: OrderType }): number {
  return progressSteps(order.orderType).findIndex((s) => s.status === order.status);
}

/** The one forward step staff take from each status */
export function nextStep(o: { status: OrderStatus; orderType: OrderType }): { status: OrderStatus; label: string } | null {
  switch (o.status) {
    case 'ACCEPTED':
      return { status: 'PREPARING', label: '👨‍🍳 Start preparing' };
    case 'PREPARING':
      return { status: 'READY', label: '✅ Mark ready' };
    case 'READY':
      return o.orderType === 'DELIVERY'
        ? { status: 'OUT_FOR_DELIVERY', label: '🛵 Send out for delivery' }
        : { status: 'PICKED_UP', label: '🙌 Customer picked up' };
    case 'OUT_FOR_DELIVERY':
      return { status: 'DELIVERED', label: '📦 Mark delivered' };
    default:
      return null;
  }
}
