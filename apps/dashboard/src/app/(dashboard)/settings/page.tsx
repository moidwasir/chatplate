'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Card } from '@safi/ui';
import { ErrorText, Field, Input, Toggle } from '@/components/form';
import { api, errorMessage, tokens, type TokenPair } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

interface Settings {
  restaurant: { id: string; name: string; taxPercent: number; currency: string };
  branch: { id: string; name: string; address: string; phone: string };
  openingHours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday first, the way people read a week */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function SettingsPage() {
  const branchId = useAuth((s) => s.branchId);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data } = await api.get<Settings>('/settings', { params: { branchId } });
      setSettings(data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!settings || !branchId) {
    return (
      <div className="flex justify-center py-20 text-gray-500">
        {error ? <ErrorText>{error}</ErrorText> : <Loader2 className="animate-spin" />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-400">Changes apply to the WhatsApp bot straight away.</p>
      </div>
      <RestaurantCard key={`r-${settings.restaurant.id}`} branchId={branchId} restaurant={settings.restaurant} onSaved={load} />
      <BranchCard key={`b-${settings.branch.id}`} branch={settings.branch} onSaved={load} />
      <HoursCard key={`h-${settings.branch.id}`} branchId={settings.branch.id} hours={settings.openingHours} onSaved={load} />
      <PasswordCard />
    </div>
  );
}

/** Card with a save button, error and "Saved" feedback */
function SettingsForm({
  title,
  hint,
  onSubmit,
  disabled,
  children,
}: {
  title: string;
  hint?: string;
  onSubmit: () => Promise<unknown>;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h2 className="font-medium">{title}</h2>
          {hint && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
        {children}
        <ErrorText>{error}</ErrorText>
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-green-400">Saved</span>}
          <Button type="submit" size="sm" disabled={busy || disabled}>
            {busy && <Loader2 size={14} className="animate-spin" />} Save
          </Button>
        </div>
      </form>
    </Card>
  );
}

function RestaurantCard({
  branchId,
  restaurant,
  onSaved,
}: {
  branchId: string;
  restaurant: Settings['restaurant'];
  onSaved: () => Promise<void>;
}) {
  const isOwner = useAuth((s) => s.user?.role === 'OWNER');
  const [name, setName] = useState(restaurant.name);
  const [tax, setTax] = useState(String(restaurant.taxPercent / 100));

  return (
    <SettingsForm
      title="Restaurant"
      hint={isOwner ? 'The name opens every WhatsApp greeting. Tax is added to every order.' : 'Only the owner can change these.'}
      disabled={!isOwner}
      onSubmit={async () => {
        await api.patch('/settings/restaurant', { name, taxPercent: Math.round(Number(tax) * 100) }, { params: { branchId } });
        await onSaved();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <Field label="Restaurant name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} disabled={!isOwner} />
        </Field>
        <Field label="Sales tax (%)">
          <Input type="number" min={0} max={50} step={0.01} value={tax} onChange={(e) => setTax(e.target.value)} required disabled={!isOwner} />
        </Field>
      </div>
    </SettingsForm>
  );
}

function BranchCard({ branch, onSaved }: { branch: Settings['branch']; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ name: branch.name, address: branch.address, phone: branch.phone });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <SettingsForm
      title="Branch"
      hint="Shown to customers when their pickup order is ready. The delivery location is set on the Delivery page."
      onSubmit={async () => {
        await api.patch(`/settings/branch/${branch.id}`, form);
        await onSaved();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Branch name">
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} required maxLength={80} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+92 300 1234567" />
        </Field>
      </div>
      <Field label="Address">
        <Input value={form.address} onChange={(e) => set({ address: e.target.value })} maxLength={200} />
      </Field>
    </SettingsForm>
  );
}

function HoursCard({
  branchId,
  hours,
  onSaved,
}: {
  branchId: string;
  hours: Settings['openingHours'];
  onSaved: () => Promise<void>;
}) {
  const [week, setWeek] = useState(() =>
    DAYS.map((_, day) => hours.find((h) => h.dayOfWeek === day) ?? { dayOfWeek: day, openTime: '11:00', closeTime: '23:00', isClosed: false }),
  );
  const update = (day: number, patch: Partial<Settings['openingHours'][number]>) =>
    setWeek((w) => w.map((h) => (h.dayOfWeek === day ? { ...h, ...patch } : h)));

  function copyToAll(day: number) {
    const src = week[day];
    setWeek((w) => w.map((h) => ({ ...h, openTime: src.openTime, closeTime: src.closeTime, isClosed: src.isClosed })));
  }

  return (
    <SettingsForm
      title="Opening hours"
      hint={`Outside these hours the bot tells customers when you open next. A closing time before the opening time runs past midnight (e.g. 18:00–02:00).${hours.length === 0 ? ' No hours are saved yet, so the bot currently takes orders at any time.' : ''}`}
      onSubmit={async () => {
        await api.put(`/settings/branch/${branchId}/hours`, { hours: week });
        await onSaved();
      }}
    >
      <ul className="divide-y divide-gray-800">
        {WEEK_ORDER.map((day) => {
          const h = week[day];
          return (
            <li key={day} className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-24 text-sm">{DAYS[day]}</span>
              <Toggle checked={!h.isClosed} onChange={(open) => update(day, { isClosed: !open })} label={`Open on ${DAYS[day]}`} />
              {h.isClosed ? (
                <span className="flex-1 text-sm text-gray-500">Closed</span>
              ) : (
                <span className="flex flex-1 items-center gap-2">
                  <Input type="time" value={h.openTime} onChange={(e) => update(day, { openTime: e.target.value })} className="w-32" required />
                  <span className="text-gray-500">to</span>
                  <Input type="time" value={h.closeTime} onChange={(e) => update(day, { closeTime: e.target.value })} className="w-32" required />
                </span>
              )}
              <button type="button" onClick={() => copyToAll(day)} className="text-xs text-gray-500 hover:text-green-400">
                Copy to all days
              </button>
            </li>
          );
        })}
      </ul>
    </SettingsForm>
  );
}

function PasswordCard() {
  const user = useAuth((s) => s.user);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <SettingsForm
      title="Change password"
      hint={`For ${user?.email ?? 'your account'}. Other devices signed in with this account are signed out.`}
      disabled={!form.current || form.next.length < 8 || form.next !== form.confirm}
      onSubmit={async () => {
        const { data } = await api.post<TokenPair>('/auth/change-password', {
          currentPassword: form.current,
          newPassword: form.next,
        });
        // The old session was revoked with the rest; keep this tab signed in
        tokens.set(data);
        setForm({ current: '', next: '', confirm: '' });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={form.current} onChange={(e) => set({ current: e.target.value })} />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <Input type="password" autoComplete="new-password" value={form.next} onChange={(e) => set({ next: e.target.value })} />
        </Field>
        <Field label="Repeat new password" hint={form.confirm && form.next !== form.confirm ? "Doesn't match" : undefined}>
          <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => set({ confirm: e.target.value })} />
        </Field>
      </div>
    </SettingsForm>
  );
}
