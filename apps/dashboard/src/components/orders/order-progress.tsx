'use client';

import { format } from 'date-fns';
import { Check, X } from 'lucide-react';
import { cn } from '@safi/ui';
import { progressIndex, progressSteps, type OrderStatus, type OrderType, type StatusChange } from '@/lib/orders';

interface ProgressProps {
  status: OrderStatus;
  orderType: OrderType;
}

const isStopped = (status: OrderStatus) => status === 'CANCELLED' || status === 'REFUNDED';

/** Thin segmented bar with the current step's name, for cards and table rows */
export function OrderProgressBar({ status, orderType, showLabel = true }: ProgressProps & { showLabel?: boolean }) {
  const steps = progressSteps(orderType);
  const reached = progressIndex({ status, orderType });
  const stopped = isStopped(status);
  const done = reached === steps.length - 1;

  return (
    <div className="space-y-1" aria-label={`Progress: ${stopped ? status.toLowerCase() : steps[reached]?.label}`}>
      <div className="flex gap-0.5">
        {steps.map((step, i) => (
          <div
            key={step.status}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              stopped
                ? 'bg-red-900/60'
                : i <= reached
                  ? done
                    ? 'bg-green-500'
                    : i === reached
                      ? 'bg-green-400 animate-pulse'
                      : 'bg-green-600'
                  : 'bg-gray-800',
            )}
          />
        ))}
      </div>
      {showLabel && (
        <div className={cn('text-[11px]', stopped ? 'text-red-400' : 'text-gray-400')}>
          {stopped
            ? status === 'CANCELLED'
              ? 'Cancelled'
              : 'Refunded'
            : `${steps[reached]?.label ?? status} · step ${reached + 1} of ${steps.length}`}
        </div>
      )}
    </div>
  );
}

/** Full stepper with the time each step happened, for the order panel */
export function OrderProgressSteps({ status, orderType, history }: ProgressProps & { history: StatusChange[] }) {
  const steps = progressSteps(orderType);
  const reached = progressIndex({ status, orderType });
  const stopped = isStopped(status);
  const when = (s: OrderStatus) => history.find((h) => h.toStatus === s)?.createdAt;
  // A cancelled order shows how far it got before it stopped
  const lastBeforeStop = stopped
    ? Math.max(...history.map((h) => steps.findIndex((s) => s.status === h.toStatus)), 0)
    : reached;

  return (
    <div>
      <ol className="flex">
        {steps.map((step, i) => {
          const complete = i <= lastBeforeStop;
          const current = !stopped && i === reached;
          const at = when(step.status);
          return (
            <li key={step.status} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && (
                <span
                  className={cn('absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2', i <= lastBeforeStop ? 'bg-green-600' : 'bg-gray-800')}
                />
              )}
              <span
                className={cn(
                  'relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold',
                  complete
                    ? current && i < steps.length - 1
                      ? 'border-green-400 bg-green-950 text-green-300 ring-4 ring-green-500/20'
                      : 'border-green-600 bg-green-600 text-white'
                    : 'border-gray-700 bg-gray-900 text-gray-500',
                )}
              >
                {complete && !(current && i < steps.length - 1) ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn('mt-1.5 text-[11px] leading-tight', complete ? 'text-gray-200' : 'text-gray-500')}>{step.label}</span>
              {at && <span className="text-[10px] text-gray-500">{format(new Date(at), 'HH:mm')}</span>}
            </li>
          );
        })}
      </ol>
      {stopped && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          <X size={14} />
          {status === 'CANCELLED' ? 'Cancelled' : 'Refunded'}
          {history.at(-1)?.reason && <span className="text-red-400">· {history.at(-1)?.reason}</span>}
        </div>
      )}
    </div>
  );
}
