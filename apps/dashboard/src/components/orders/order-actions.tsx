'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, cn } from '@safi/ui';
import { ErrorText, Field, Input, Modal } from '@/components/form';
import { errorMessage } from '@/lib/api';
import { nextStep, updateOrderStatus, type Order, type OrderStatus } from '@/lib/orders';

const PREP_TIMES = [15, 20, 30, 45, 60];
const REJECT_REASONS = ['Item not available', 'Too busy right now', 'Address outside delivery area', 'Restaurant closing soon'];

type ActionOrder = Pick<Order, 'id' | 'orderNumber' | 'status' | 'orderType' | 'source' | 'estimatedMinutes'>;

/**
 * Accept / reject for new orders, the next step for everything else.
 * Used on board cards (compact) and in the order panel.
 */
export function OrderActions({ order, compact }: { order: ActionOrder; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prepMinutes, setPrepMinutes] = useState(order.estimatedMinutes ?? 30);
  const [rejecting, setRejecting] = useState(false);
  const step = nextStep(order);
  const isNew = order.status === 'NEW';
  const canCancel = order.status === 'NEW' || order.status === 'ACCEPTED';

  const move = async (status: OrderStatus, extra?: { estimatedMinutes?: number }) => {
    setBusy(true);
    setError('');
    try {
      await updateOrderStatus(order.id, status, extra);
      // The live update refreshes the lists and panel
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!isNew && !step) return null;

  return (
    // Card clicks open the order; clicks on these controls shouldn't
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <ErrorText>{error}</ErrorText>
      {isNew ? (
        <>
          <div className="flex gap-2">
            <select
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(Number(e.target.value))}
              className="rounded-lg border border-gray-700 bg-gray-950 px-2 text-sm text-gray-100"
              aria-label="Ready in"
              title="How long until it's ready"
            >
              {PREP_TIMES.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            <Button
              size={compact ? 'sm' : 'md'}
              className="flex-1 justify-center"
              disabled={busy}
              onClick={() => move('ACCEPTED', { estimatedMinutes: prepMinutes })}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Accept
            </Button>
            <Button size={compact ? 'sm' : 'md'} variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </div>
        </>
      ) : (
        step && (
          <div className="flex gap-2">
            <Button size={compact ? 'sm' : 'md'} className="flex-1 justify-center" disabled={busy} onClick={() => move(step.status)}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              {step.label}
            </Button>
            {canCancel && (
              <Button size={compact ? 'sm' : 'md'} variant="ghost" disabled={busy} onClick={() => setRejecting(true)}>
                Cancel
              </Button>
            )}
          </div>
        )
      )}
      {!compact && order.source === 'WHATSAPP' && (
        <p className="text-center text-[11px] text-gray-500">The customer gets a WhatsApp message for each step</p>
      )}
      {rejecting && <RejectModal order={order} onClose={() => setRejecting(false)} />}
    </div>
  );
}

function RejectModal({ order, onClose }: { order: ActionOrder; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const verb = order.status === 'NEW' ? 'Reject' : 'Cancel';

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await updateOrderStatus(order.id, 'CANCELLED', { reason: reason.trim() });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={`${verb} ${order.orderNumber}?`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {REJECT_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                reason === r ? 'border-green-600 bg-green-600/15 text-green-300' : 'border-gray-700 text-gray-300 hover:bg-gray-800',
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Field label="Reason" hint={order.source === 'WHATSAPP' ? 'Sent to the customer on WhatsApp' : undefined}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why can't you take this order?" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Keep order
          </Button>
          <Button variant="danger" disabled={busy || !reason.trim()} onClick={submit}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {verb} order
          </Button>
        </div>
      </div>
    </Modal>
  );
}
