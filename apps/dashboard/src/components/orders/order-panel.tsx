'use client';

import { useEffect } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { Bike, Clock, Loader2, MapPin, MessageCircle, Phone, ShoppingBag, StickyNote, X } from 'lucide-react';
import { OrderStatusBadge } from '@safi/ui';
import { ErrorText } from '@/components/form';
import { formatPKR } from '@/lib/format';
import { useOrder } from '@/lib/orders';
import { OrderActions } from './order-actions';
import { OrderProgressSteps } from './order-progress';

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  PICKED_UP: 'Picked up',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

/** Right-hand panel with everything about one order; stays live while open */
export function OrderPanel({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { order, error } = useOrder(orderId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={order ? `Order ${order.orderNumber}` : 'Order'}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-gray-800 bg-gray-950 shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-gray-800 px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-lg font-semibold">{order?.orderNumber ?? '…'}</h2>
              {order && <OrderStatusBadge status={order.status} />}
            </div>
            {order && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                {order.orderType === 'DELIVERY' ? <Bike size={13} /> : <ShoppingBag size={13} />}
                {order.orderType === 'DELIVERY' ? 'Delivery' : order.orderType === 'PICKUP' ? 'Pickup' : 'Dine-in'}
                {order.source === 'WHATSAPP' && (
                  <>
                    · <MessageCircle size={13} className="text-green-500" /> WhatsApp
                  </>
                )}
                · {format(new Date(order.createdAt), 'd MMM, HH:mm')} ({formatDistanceToNowStrict(new Date(order.createdAt), { addSuffix: true })})
              </div>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <ErrorText>{error}</ErrorText>
          {!order ? (
            !error && (
              <div className="flex justify-center py-16 text-gray-500">
                <Loader2 className="animate-spin" />
              </div>
            )
          ) : (
            <>
              <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <OrderProgressSteps status={order.status} orderType={order.orderType} history={order.statusHistory} />
                {order.estimatedMinutes && !['DELIVERED', 'PICKED_UP', 'CANCELLED', 'REFUNDED'].includes(order.status) && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock size={13} /> Promised in {order.estimatedMinutes} min
                  </div>
                )}
              </section>

              <OrderActions order={order} />

              <section className="space-y-1 text-sm">
                <h3 className="text-xs uppercase tracking-wide text-gray-500">Customer</h3>
                <div className="font-medium">{order.customer.name ?? 'Customer'}</div>
                <a href={`tel:+${order.customer.phone}`} className="flex items-center gap-1.5 text-gray-300 hover:text-white">
                  <Phone size={14} /> +{order.customer.phone}
                </a>
                <a
                  href={`https://wa.me/${order.customer.phone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-green-400 hover:underline"
                >
                  <MessageCircle size={14} /> Open chat in WhatsApp
                </a>
                {order.address && (
                  <a
                    href={`https://www.google.com/maps?q=${order.address.lat},${order.address.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-1.5 text-gray-300 hover:text-white"
                  >
                    <MapPin size={14} className="mt-0.5 shrink-0" />
                    <span>
                      {[order.address.houseNo, order.address.address, order.address.landmark].filter(Boolean).join(', ')}
                      <span className="block text-xs text-gray-500">Open in Google Maps</span>
                    </span>
                  </a>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-gray-500">Items</h3>
                <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800">
                  {order.items.map((i) => (
                    <li key={i.id} className="px-3 py-2.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span>
                          <span className="font-semibold">{i.quantity}×</span> {i.name}
                        </span>
                        <span className="tabular-nums">{formatPKR(i.lineTotal)}</span>
                      </div>
                      {i.modifiers.length > 0 && (
                        <div className="pl-5 text-xs text-gray-400">
                          {i.modifiers.map((m) => (m.priceAdjustment ? `${m.name} (+${formatPKR(m.priceAdjustment)})` : m.name)).join(', ')}
                        </div>
                      )}
                      {i.notes && <div className="pl-5 text-xs text-yellow-400">Note: {i.notes}</div>}
                    </li>
                  ))}
                </ul>
                {order.notes && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-yellow-950/40 px-3 py-2 text-xs text-yellow-300">
                    <StickyNote size={13} className="mt-0.5" /> {order.notes}
                  </div>
                )}
              </section>

              <section className="space-y-1 text-sm">
                <Line label="Subtotal" value={formatPKR(order.subtotal)} />
                {order.discountAmount > 0 && <Line label="Discount" value={`− ${formatPKR(order.discountAmount)}`} />}
                {order.taxAmount > 0 && <Line label="Tax" value={formatPKR(order.taxAmount)} />}
                {order.deliveryFee > 0 && <Line label="Delivery fee" value={formatPKR(order.deliveryFee)} />}
                {order.tip > 0 && <Line label="Tip" value={formatPKR(order.tip)} />}
                <div className="flex justify-between border-t border-gray-800 pt-2 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatPKR(order.total)}</span>
                </div>
                {order.payment && (
                  <div className="text-right text-xs text-gray-400">
                    {order.payment.method === 'COD' ? 'Cash on delivery' : order.payment.method} · payment {order.payment.status.toLowerCase()}
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-gray-500">History</h3>
                <ol className="space-y-2 border-l border-gray-800 pl-4 text-sm">
                  {order.statusHistory.map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-gray-600" />
                      <div className="flex justify-between gap-2">
                        <span>{STATUS_LABEL[h.toStatus] ?? h.toStatus}</span>
                        <span className="text-xs text-gray-500">{format(new Date(h.createdAt), 'HH:mm')}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {h.changedByName ?? 'Staff'}
                        {h.reason && ` · ${h.reason}`}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-gray-400">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
