import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Badge ────────────────────────────────────────────────────────────────────
import React from 'react';

type BadgeVariant = 'green' | 'yellow' | 'red' | 'blue' | 'gray';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-green-900/60 text-green-300 border border-green-700',
  yellow: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700',
  red: 'bg-red-900/60 text-red-300 border border-red-700',
  blue: 'bg-blue-900/60 text-blue-300 border border-blue-700',
  gray: 'bg-gray-800 text-gray-300 border border-gray-600',
};

export function Badge({ children, variant = 'gray', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ─── Order Status Badge ───────────────────────────────────────────────────────
export function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    NEW: { label: 'New', variant: 'blue' },
    ACCEPTED: { label: 'Accepted', variant: 'green' },
    PREPARING: { label: 'Preparing', variant: 'yellow' },
    READY: { label: 'Ready', variant: 'green' },
    OUT_FOR_DELIVERY: { label: 'Out for Delivery', variant: 'blue' },
    DELIVERED: { label: 'Delivered', variant: 'green' },
    PICKED_UP: { label: 'Picked Up', variant: 'green' },
    CANCELLED: { label: 'Cancelled', variant: 'red' },
    REFUNDED: { label: 'Refunded', variant: 'gray' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'gray' };
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm', className)}>
      {children}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  const variantCls = {
    primary: 'bg-green-600 hover:bg-green-500 text-white',
    secondary: 'bg-gray-700 hover:bg-gray-600 text-white',
    danger: 'bg-red-600 hover:bg-red-500 text-white',
    ghost: 'bg-transparent hover:bg-gray-800 text-gray-300',
  }[variant];

  const sizeCls = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  }[size];

  return (
    <button
      className={cn(
        'inline-flex items-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variantCls,
        sizeCls,
        className,
      )}
      {...props}
    />
  );
}

export { React };
