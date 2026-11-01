'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Loader2, LocateFixed, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card } from '@safi/ui';
import { ErrorText, Field, Input, Modal, Toggle } from '@/components/form';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatPKR, paisaToRupees, rupeesToPaisa } from '@/lib/format';

interface Branch {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

interface Zone {
  id: string;
  name: string;
  /** null = a circle of maxDistance km around the branch */
  polygon: unknown;
  maxDistance: number | null;
  feeType: 'FLAT' | 'PER_KM' | 'FREE_ABOVE';
  flatFee: number | null;
  perKmFee: number | null;
  freeAbove: number | null;
  minOrder: number;
  isActive: boolean;
}

/** "31.52, 74.35", or a Google Maps link with @lat,lng / ?q=lat,lng / !3dlat!4dlng */
function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const patterns = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

function feeText(z: Zone): string {
  const fee = z.feeType === 'PER_KM' ? `${formatPKR(z.perKmFee ?? 0)} per km` : formatPKR(z.flatFee ?? 0);
  return z.freeAbove != null ? `${fee} · free above ${formatPKR(z.freeAbove)}` : fee;
}

export default function DeliveryPage() {
  const branchId = useAuth((s) => s.branchId);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [error, setError] = useState('');
  const [zoneModal, setZoneModal] = useState<Zone | 'new' | null>(null);

  const reload = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data } = await api.get<{ branch: Branch; zones: Zone[] }>('/delivery', { params: { branchId } });
      setBranch(data.branch);
      setZones(data.zones);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [branchId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!branch) {
    return (
      <div className="flex justify-center py-20 text-gray-500">
        {error ? <ErrorText>{error}</ErrorText> : <Loader2 className="animate-spin" />}
      </div>
    );
  }

  const hasPin = branch.lat != null && branch.lng != null;
  const activeZones = zones.filter((z) => z.isActive);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Delivery</h1>
        <p className="text-sm text-gray-400">
          Where you deliver and what it costs. WhatsApp customers who share a pin outside every active zone are offered
          pickup instead.
        </p>
      </div>

      <ErrorText>{error}</ErrorText>

      {activeZones.length === 0 && (
        <p className="rounded-lg border border-yellow-800 bg-yellow-950/40 px-3 py-2 text-sm text-yellow-300">
          No active delivery zone. Every delivery order will be turned away, so add a zone below.
        </p>
      )}

      <LocationCard branch={branch} onSaved={reload} />

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div>
            <h2 className="font-medium">Delivery zones</h2>
            <p className="text-xs text-gray-500">
              Distance is measured in a straight line from the restaurant. If zones overlap, the smallest one applies.
            </p>
          </div>
          <Button size="sm" onClick={() => setZoneModal('new')} disabled={!hasPin} title={hasPin ? '' : 'Set the restaurant location first'}>
            <Plus size={14} /> Add zone
          </Button>
        </div>
        {zones.length === 0 && <p className="px-4 py-6 text-sm text-gray-500">No zones yet.</p>}
        <ul className="divide-y divide-gray-800">
          {zones.map((z) => (
            <li key={z.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={z.isActive ? 'font-medium' : 'font-medium text-gray-500 line-through'}>{z.name}</span>
                  {z.polygon == null ? (
                    <Badge variant="green">Within {z.maxDistance} km</Badge>
                  ) : (
                    <Badge variant="yellow">Drawn area</Badge>
                  )}
                </div>
                <p className="text-sm text-gray-400">
                  {feeText(z)}
                  {z.minOrder > 0 && ` · minimum order ${formatPKR(z.minOrder)}`}
                </p>
                {z.polygon != null && (
                  <p className="text-xs text-yellow-400/80">
                    A fixed shape from the initial setup. Edit it to switch to a distance you control.
                  </p>
                )}
              </div>
              <Toggle
                checked={z.isActive}
                label={`${z.name} active`}
                onChange={(isActive) => run(() => api.patch(`/delivery/zones/${z.id}`, { isActive }))}
              />
              <Button variant="ghost" size="sm" onClick={() => setZoneModal(z)} disabled={!hasPin}>
                <Pencil size={14} /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => confirm(`Delete the zone "${z.name}"?`) && run(() => api.delete(`/delivery/zones/${z.id}`))}
                aria-label={`Delete ${z.name}`}
              >
                <Trash2 size={14} />
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      {zoneModal && (
        <ZoneEditor
          branchId={branch.id}
          zone={zoneModal === 'new' ? null : zoneModal}
          onClose={() => setZoneModal(null)}
          onSaved={async () => {
            setZoneModal(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function LocationCard({ branch, onSaved }: { branch: Branch; onSaved: () => Promise<void> }) {
  const [text, setText] = useState(branch.lat != null && branch.lng != null ? `${branch.lat}, ${branch.lng}` : '');
  const [address, setAddress] = useState(branch.address);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const coords = parseCoordinates(text);

  function useCurrentLocation() {
    setError('');
    if (!navigator.geolocation) return setError('This browser cannot share its location. Paste a Google Maps link instead.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setText(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
        setBusy(false);
      },
      () => {
        setError('Could not get your location. Allow location access, or paste a Google Maps link instead.');
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!coords) return setError('Enter coordinates like "31.5204, 74.3587" or paste a Google Maps link.');
    setBusy(true);
    setError('');
    try {
      await api.patch(`/delivery/branch/${branch.id}`, { ...coords, address });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="space-y-3">
        <div className="flex items-center gap-2">
          <MapPin size={18} className="text-green-400" />
          <h2 className="font-medium">Restaurant location</h2>
        </div>
        <p className="text-xs text-gray-500">
          Delivery distance is measured from here. At the restaurant? Use your current location. Otherwise open the
          place in Google Maps and paste the link or the coordinates.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Coordinates or Google Maps link">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="31.5204, 74.3587" />
          </Field>
          <Field label="Address shown to customers">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={useCurrentLocation} disabled={busy}>
            <LocateFixed size={14} /> Use my current location
          </Button>
          {coords && (
            <a
              href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-green-400 hover:underline"
            >
              Check on map <ExternalLink size={12} />
            </a>
          )}
          <div className="flex-1" />
          {saved && <span className="text-sm text-green-400">Saved</span>}
          <Button type="submit" size="sm" disabled={busy || !coords}>
            {busy && <Loader2 size={14} className="animate-spin" />} Save location
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ZoneEditor({
  branchId,
  zone,
  onClose,
  onSaved,
}: {
  branchId: string;
  zone: Zone | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: zone?.name ?? 'Delivery area',
    radiusKm: zone?.maxDistance != null ? String(zone.maxDistance) : '5',
    feeType: zone?.feeType === 'PER_KM' ? 'PER_KM' : 'FLAT',
    fee: zone ? paisaToRupees((zone.feeType === 'PER_KM' ? zone.perKmFee : zone.flatFee) ?? 0) : '100',
    minOrder: zone ? paisaToRupees(zone.minOrder) : '500',
    freeAbove: zone?.freeAbove != null ? paisaToRupees(zone.freeAbove) : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fee = rupeesToPaisa(form.fee || 0);
    const body = {
      name: form.name,
      radiusKm: Number(form.radiusKm),
      feeType: form.feeType,
      flatFee: form.feeType === 'FLAT' ? fee : null,
      perKmFee: form.feeType === 'PER_KM' ? fee : null,
      minOrder: rupeesToPaisa(form.minOrder || 0),
      freeAbove: form.freeAbove ? rupeesToPaisa(form.freeAbove) : null,
    };
    try {
      if (zone) await api.patch(`/delivery/zones/${zone.id}`, body);
      else await api.post('/delivery/zones', { ...body, branchId });
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={zone ? 'Edit delivery zone' : 'Add delivery zone'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" hint="Shown to customers, e.g. when the minimum order is not met">
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} required maxLength={80} />
        </Field>
        <Field label="Deliver up to (km from the restaurant)">
          <Input
            type="number"
            min={0.5}
            max={100}
            step={0.5}
            value={form.radiusKm}
            onChange={(e) => set({ radiusKm: e.target.value })}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fee type">
            <select
              value={form.feeType}
              onChange={(e) => set({ feeType: e.target.value as 'FLAT' | 'PER_KM' })}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none"
            >
              <option value="FLAT">Same fee for everyone</option>
              <option value="PER_KM">Per km</option>
            </select>
          </Field>
          <Field label={form.feeType === 'PER_KM' ? 'Fee per km (Rs)' : 'Delivery fee (Rs)'}>
            <Input type="number" min={0} value={form.fee} onChange={(e) => set({ fee: e.target.value })} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimum order (Rs)" hint="0 = no minimum">
            <Input type="number" min={0} value={form.minOrder} onChange={(e) => set({ minOrder: e.target.value })} />
          </Field>
          <Field label="Free delivery above (Rs)" hint="Leave empty to always charge">
            <Input type="number" min={0} value={form.freeAbove} onChange={(e) => set({ freeAbove: e.target.value })} />
          </Field>
        </div>
        {zone?.polygon != null && (
          <p className="text-xs text-yellow-400">Saving replaces the drawn area from the initial setup with this distance.</p>
        )}
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 size={14} className="animate-spin" />} Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
