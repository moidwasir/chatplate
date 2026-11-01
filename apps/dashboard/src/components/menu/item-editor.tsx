'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button, cn } from '@safi/ui';
import { ErrorText, Field, Input, Modal, TextArea, Toggle } from '@/components/form';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatPKR, paisaToRupees, rupeesToPaisa } from '@/lib/format';
import type { Category, MenuItem, ModifierGroup } from '@/lib/menu-types';

interface Props {
  item: MenuItem | null;
  categoryId: string;
  categories: Category[];
  nextSort: number;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

/**
 * Create / edit a menu item. Image and option groups become available once the
 * item has been saved (they hang off its id).
 */
export function ItemEditor({ item: initial, categoryId, categories, nextSort, onClose, onChanged }: Props) {
  const branchId = useAuth((s) => s.branchId);
  const [item, setItem] = useState<MenuItem | null>(initial);
  const [error, setError] = useState('');

  /** Re-read this item after a change to its image or options */
  async function refresh(id: string) {
    const { data } = await api.get<Category[]>('/menu/admin', { params: { branchId } });
    const fresh = data.flatMap((c) => c.items).find((i) => i.id === id);
    if (fresh) setItem(fresh);
    await onChanged();
  }

  async function run(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
      if (item) await refresh(item.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={item ? `Edit ${item.name}` : 'New item'} onClose={onClose} wide>
      <div className="space-y-6">
        <DetailsForm
          item={item}
          categoryId={categoryId}
          categories={categories}
          nextSort={nextSort}
          onSaved={async (saved) => {
            setItem(saved);
            await onChanged();
          }}
        />

        {item ? (
          <>
            <ImageSection item={item} run={run} />
            <OptionsSection item={item} run={run} />
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-between border-t border-gray-800 pt-4">
              <Button
                variant="ghost"
                className="text-red-400 hover:text-red-300"
                onClick={async () => {
                  if (!confirm(`Delete "${item.name}"?`)) return;
                  try {
                    const { data } = await api.delete<{ archived: boolean }>(`/menu/items/${item.id}`);
                    if (data.archived) alert('This item is on past orders, so it was hidden instead of deleted.');
                    onClose();
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                <Trash2 size={14} /> Delete item
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500">Save the item first, then add a photo and options (size, add-ons, spice level).</p>
        )}
      </div>
    </Modal>
  );
}

// ─── Details ────────────────────────────────────────────────────────────────

function DetailsForm({
  item,
  categoryId,
  categories,
  nextSort,
  onSaved,
}: {
  item: MenuItem | null;
  categoryId: string;
  categories: Category[];
  nextSort: number;
  onSaved: (item: MenuItem) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    nameUrdu: item?.nameUrdu ?? '',
    description: item?.description ?? '',
    price: item ? paisaToRupees(item.price) : '',
    compareAtPrice: item?.compareAtPrice ? paisaToRupees(item.compareAtPrice) : '',
    categoryId: item?.categoryId ?? categoryId,
    isActive: item?.isActive ?? true,
    limitedHours: Boolean(item?.servingStart),
    servingStart: item?.servingStart ?? '11:00',
    servingEnd: item?.servingEnd ?? '23:00',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      name: form.name.trim(),
      nameUrdu: form.nameUrdu.trim() || null,
      description: form.description.trim() || null,
      price: rupeesToPaisa(form.price),
      compareAtPrice: form.compareAtPrice ? rupeesToPaisa(form.compareAtPrice) : null,
      categoryId: form.categoryId,
      isActive: form.isActive,
      servingStart: form.limitedHours ? form.servingStart : null,
      servingEnd: form.limitedHours ? form.servingEnd : null,
    };
    try {
      const { data } = item
        ? await api.patch<MenuItem>(`/menu/items/${item.id}`, body)
        : await api.post<MenuItem>('/menu/items', { ...body, sortOrder: nextSort });
      await onSaved(data);
      setSavedAt(Date.now());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input required autoFocus={!item} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Zinger Burger" />
        </Field>
        <Field label="Name in Urdu" hint="Optional">
          <Input dir="rtl" value={form.nameUrdu} onChange={(e) => set('nameUrdu', e.target.value)} />
        </Field>
      </div>
      <Field label="Description" hint="Shown under the item on WhatsApp">
        <TextArea value={form.description} maxLength={500} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Price (Rs)">
          <Input required type="number" min="0" step="1" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="650" />
        </Field>
        <Field label="Regular price (Rs)" hint="Deals only: customers see “save Rs X”">
          <Input
            type="number"
            min="0"
            step="1"
            value={form.compareAtPrice}
            onChange={(e) => set('compareAtPrice', e.target.value)}
            placeholder="e.g. 2050"
          />
        </Field>
        <Field label="Category">
          <select
            value={form.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-800 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-300">Only serve at certain hours</div>
            <div className="text-xs text-gray-500">e.g. breakfast items. Late-night windows like 10 pm–2 am work too.</div>
          </div>
          <Toggle label="Limit serving hours" checked={form.limitedHours} onChange={(v) => set('limitedHours', v)} />
        </div>
        {form.limitedHours && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="From">
              <Input type="time" required value={form.servingStart} onChange={(e) => set('servingStart', e.target.value)} />
            </Field>
            <Field label="Until">
              <Input type="time" required value={form.servingEnd} onChange={(e) => set('servingEnd', e.target.value)} />
            </Field>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">Visible to customers</span>
        <Toggle label="Visible to customers" checked={form.isActive} onChange={(v) => set('isActive', v)} />
      </div>

      <ErrorText>{error}</ErrorText>
      <div className="flex items-center justify-end gap-3">
        {savedAt && !saving && <span className="text-xs text-green-400">Saved</span>}
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          {item ? 'Save changes' : 'Create item'}
        </Button>
      </div>
    </form>
  );
}

// ─── Image ──────────────────────────────────────────────────────────────────

function ImageSection({ item, run }: { item: MenuItem; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const body = new FormData();
    body.append('image', file);
    await run(() => api.post(`/menu/items/${item.id}/image`, body));
    setUploading(false);
  }

  return (
    <section className="flex items-center gap-4 border-t border-gray-800 pt-5">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-800">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="text-gray-600" />
        )}
      </div>
      <div className="space-y-1">
        <div className="text-sm font-medium">Photo</div>
        <div className="text-xs text-gray-500">JPEG, PNG or WebP, up to 5 MB. Square photos look best on WhatsApp.</div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        <Button type="button" size="sm" variant="secondary" disabled={uploading} onClick={() => input.current?.click()}>
          {uploading && <Loader2 size={14} className="animate-spin" />}
          {item.imageUrl ? 'Replace photo' : 'Upload photo'}
        </Button>
      </div>
    </section>
  );
}

// ─── Option groups (size, add-ons, spice level) ─────────────────────────────

function OptionsSection({ item, run }: { item: MenuItem; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  return (
    <section className="space-y-3 border-t border-gray-800 pt-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Options</div>
          <div className="text-xs text-gray-500">Choices the customer makes — size, add-ons, spice level.</div>
        </div>
        {!adding && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add option group
          </Button>
        )}
      </div>

      {adding && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await run(() =>
              api.post(`/menu/items/${item.id}/modifier-groups`, {
                name: name.trim(),
                sortOrder: item.modifierGroups.length,
              }),
            );
            setName('');
            setAdding(false);
          }}
        >
          <Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Size, Extra toppings, Spice level" />
          <Button type="submit" size="sm">
            Add
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      )}

      {item.modifierGroups.map((group) => (
        <GroupCard key={group.id} group={group} run={run} />
      ))}
    </section>
  );
}

function GroupCard({ group, run }: { group: ModifierGroup; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [optName, setOptName] = useState('');
  const [optPrice, setOptPrice] = useState('');

  const patchGroup = (body: Partial<ModifierGroup>) => run(() => api.patch(`/menu/modifier-groups/${group.id}`, body));

  return (
    <div className="rounded-lg border border-gray-800">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-800 bg-gray-950/50 px-3 py-2">
        <span className="flex-1 font-medium">{group.name}</span>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          Required
          <Toggle
            label={`${group.name} required`}
            checked={group.required}
            onChange={(required) => patchGroup({ required, minChoices: required ? Math.max(1, group.minChoices) : 0 })}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-400" title="How many options the customer can pick">
          Pick up to
          <Input
            type="number"
            min={1}
            className="w-16 py-1"
            defaultValue={group.maxChoices}
            onBlur={(e) => {
              const maxChoices = Math.max(1, Number(e.target.value) || 1);
              if (maxChoices !== group.maxChoices) {
                void patchGroup({ maxChoices, minChoices: Math.min(group.minChoices, maxChoices) });
              }
            }}
          />
        </label>
        <button
          type="button"
          className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-red-400"
          aria-label={`Delete ${group.name}`}
          onClick={() => confirm(`Delete option group "${group.name}"?`) && run(() => api.delete(`/menu/modifier-groups/${group.id}`))}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <ul className="divide-y divide-gray-800/70">
        {group.modifiers.map((m) => (
          <li key={m.id} className={cn('flex items-center gap-3 px-3 py-2 text-sm', !m.isAvailable && 'opacity-50')}>
            <span className="flex-1">{m.name}</span>
            <span className="tabular-nums text-gray-400">
              {m.priceAdjustment === 0 ? 'no extra' : `${m.priceAdjustment > 0 ? '+' : '−'}${formatPKR(Math.abs(m.priceAdjustment))}`}
            </span>
            <Toggle
              label={`${m.name} available`}
              checked={m.isAvailable}
              onChange={(isAvailable) => run(() => api.patch(`/menu/modifiers/${m.id}`, { isAvailable }))}
            />
            <button
              type="button"
              className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-red-400"
              aria-label={`Delete ${m.name}`}
              onClick={() => run(() => api.delete(`/menu/modifiers/${m.id}`))}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2 p-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await run(() =>
            api.post(`/menu/modifier-groups/${group.id}/modifiers`, {
              name: optName.trim(),
              priceAdjustment: optPrice ? rupeesToPaisa(optPrice) : 0,
              sortOrder: group.modifiers.length,
            }),
          );
          setOptName('');
          setOptPrice('');
        }}
      >
        <Input required value={optName} onChange={(e) => setOptName(e.target.value)} placeholder="Option, e.g. Large" className="py-1.5" />
        <Input type="number" step="1" value={optPrice} onChange={(e) => setOptPrice(e.target.value)} placeholder="+Rs" className="w-24 py-1.5" />
        <Button type="submit" size="sm" variant="secondary">
          <Plus size={14} />
        </Button>
      </form>
    </div>
  );
}
