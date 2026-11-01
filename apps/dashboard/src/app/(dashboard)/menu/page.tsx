'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Clock, EyeOff, ImageOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, cn } from '@safi/ui';
import { ErrorText, Field, Input, Modal, Toggle } from '@/components/form';
import { ItemEditor } from '@/components/menu/item-editor';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatPKR, formatTime } from '@/lib/format';
import type { Category, MenuItem } from '@/lib/menu-types';

export default function MenuManagerPage() {
  const branchId = useAuth((s) => s.branchId);
  const [menu, setMenu] = useState<Category[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [categoryModal, setCategoryModal] = useState<Category | 'new' | null>(null);
  const [itemModal, setItemModal] = useState<MenuItem | 'new' | null>(null);

  const reload = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data } = await api.get<Category[]>('/menu/admin', { params: { branchId } });
      setMenu(data);
      setSelectedId((current) => (data.some((c) => c.id === current) ? current : (data[0]?.id ?? null)));
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [branchId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = menu?.find((c) => c.id === selectedId) ?? null;

  async function run(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!menu) {
    return (
      <div className="flex justify-center py-20 text-gray-500">
        {error ? <ErrorText>{error}</ErrorText> : <Loader2 className="animate-spin" />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Menu</h1>
          <p className="text-sm text-gray-400">
            What customers see on WhatsApp. Hidden and sold-out items are not shown to them.
          </p>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        {/* ─── Categories ─── */}
        <Card className="h-fit p-2">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Categories</span>
            <button
              onClick={() => setCategoryModal('new')}
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
              aria-label="Add category"
              title="Add category"
            >
              <Plus size={16} />
            </button>
          </div>
          {menu.length === 0 && <p className="px-2 py-4 text-sm text-gray-500">No categories yet.</p>}
          <ul className="space-y-0.5">
            {menu.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    'group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm',
                    c.id === selectedId ? 'bg-green-600/15 text-green-400' : 'text-gray-300 hover:bg-gray-800',
                  )}
                >
                  <span className={cn('flex-1 truncate', !c.isActive && 'text-gray-500 line-through')}>{c.name}</span>
                  {!c.isActive && <EyeOff size={14} className="text-gray-500" />}
                  <span className="text-xs text-gray-500">{c.items.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* ─── Items ─── */}
        <Card className="p-0">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-gray-800 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-medium">
                    {selected.name}
                    {selected.nameUrdu && <span className="ml-2 text-gray-500" dir="rtl">{selected.nameUrdu}</span>}
                  </h2>
                  {!selected.isActive && <p className="text-xs text-yellow-400">Hidden from customers</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCategoryModal(selected)}>
                  <Pencil size={14} /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => {
                    if (confirm(`Delete category "${selected.name}"?`)) {
                      void run(() => api.delete(`/menu/categories/${selected.id}`));
                    }
                  }}
                >
                  <Trash2 size={14} /> Delete
                </Button>
                <Button size="sm" onClick={() => setItemModal('new')}>
                  <Plus size={14} /> Add item
                </Button>
              </div>

              {selected.items.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-gray-500">No items in this category yet.</p>
              ) : (
                <ul className="divide-y divide-gray-800">
                  {selected.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onEdit={() => setItemModal(item)}
                      onSoldOut={(soldOut) =>
                        run(() => api.patch(`/menu/items/${item.id}/availability`, { soldOut }))
                      }
                    />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="px-4 py-16 text-center text-sm text-gray-500">
              Create your first category (e.g. Burgers, Drinks) to start adding items.
              <div className="mt-4">
                <Button size="sm" onClick={() => setCategoryModal('new')}>
                  <Plus size={14} /> Add category
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {categoryModal && branchId && (
        <CategoryForm
          category={categoryModal === 'new' ? null : categoryModal}
          nextSort={menu.length}
          branchId={branchId}
          onClose={() => setCategoryModal(null)}
          onSaved={async (id) => {
            setCategoryModal(null);
            await reload();
            setSelectedId(id);
          }}
        />
      )}

      {itemModal && selected && (
        <ItemEditor
          item={itemModal === 'new' ? null : itemModal}
          categoryId={selected.id}
          categories={menu}
          nextSort={selected.items.length}
          onClose={() => {
            setItemModal(null);
            void reload();
          }}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function ItemRow({
  item,
  onEdit,
  onSoldOut,
}: {
  item: MenuItem;
  onEdit: () => void;
  onSoldOut: (soldOut: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const optionCount = item.modifierGroups.length;

  return (
    <li className={cn('flex items-center gap-3 px-4 py-3', !item.isActive && 'opacity-60')}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-800">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageOff size={18} className="text-gray-600" />
        )}
      </div>

      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium hover:text-green-400">{item.name}</span>
          {!item.isActive && <Badge>Hidden</Badge>}
          {item.isSoldOut && <Badge variant="red">Sold out</Badge>}
          {item.servingStart && item.servingEnd && (
            <Badge variant="blue">
              <Clock size={11} className="mr-1 inline" />
              {formatTime(item.servingStart)}–{formatTime(item.servingEnd)}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-gray-500">
          {item.description || 'No description'}
          {optionCount > 0 && ` · ${optionCount} option group${optionCount > 1 ? 's' : ''}`}
        </div>
      </button>

      <div className="w-24 text-right text-sm tabular-nums">{formatPKR(item.price)}</div>

      <label className="flex items-center gap-2 text-xs text-gray-400" title="Available to order">
        <span className="hidden sm:inline">{item.isSoldOut ? 'Sold out' : 'In stock'}</span>
        <Toggle
          label={`${item.name} in stock`}
          checked={!item.isSoldOut}
          disabled={busy}
          onChange={async (inStock) => {
            setBusy(true);
            await onSoldOut(!inStock);
            setBusy(false);
          }}
        />
      </label>
    </li>
  );
}

function CategoryForm({
  category,
  branchId,
  nextSort,
  onClose,
  onSaved,
}: {
  category: Category | null;
  branchId: string;
  nextSort: number;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [nameUrdu, setNameUrdu] = useState(category?.nameUrdu ?? '');
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? nextSort));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = { name: name.trim(), nameUrdu: nameUrdu.trim() || null, isActive, sortOrder: Number(sortOrder) || 0 };
    try {
      const { data } = category
        ? await api.patch<Category>(`/menu/categories/${category.id}`, body)
        : await api.post<Category>('/menu/categories', { ...body, branchId });
      onSaved(data.id);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal title={category ? 'Edit category' : 'New category'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name">
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Burgers" />
        </Field>
        <Field label="Name in Urdu" hint="Optional — shown to customers who chose Urdu">
          <Input dir="rtl" value={nameUrdu} onChange={(e) => setNameUrdu(e.target.value)} placeholder="برگر" />
        </Field>
        <Field label="Position" hint="Lower numbers appear first">
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Visible to customers</span>
          <Toggle label="Visible to customers" checked={isActive} onChange={setIsActive} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
