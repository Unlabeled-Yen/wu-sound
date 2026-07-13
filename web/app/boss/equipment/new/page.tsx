'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  EQUIPMENT_CATEGORY_LABEL,
  type EquipmentCategory,
} from '@/lib/types';

const CATEGORIES = Object.keys(EQUIPMENT_CATEGORY_LABEL) as EquipmentCategory[];

export default function NewEquipmentPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model_number, setModel] = useState('');
  const [category, setCategory] = useState<EquipmentCategory>('speaker');
  const [serial_number, setSerial] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('台');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('請填設備名稱'); return; }
    const qn = parseInt(quantity, 10);
    if (!Number.isFinite(qn) || qn <= 0) { setError('數量必須為正整數'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/equipment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          brand: brand.trim() || null,
          model_number: model_number.trim() || null,
          category,
          serial_number: serial_number.trim() || null,
          quantity: qn,
          unit: unit.trim() || '台',
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '新增失敗');
      router.push('/boss/equipment');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '新增失敗');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">新增設備</h1>
        <Link href="/boss/equipment" className="text-sm underline">返回</Link>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="名稱 *">
          <input value={name} onChange={(e) => setName(e.target.value)} required
            className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900" />
        </Field>
        <Field label="分類 *">
          <select value={category} onChange={(e) => setCategory(e.target.value as EquipmentCategory)}
            className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
            {CATEGORIES.map((c) => <option key={c} value={c}>{EQUIPMENT_CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="品牌">
            <input value={brand} onChange={(e) => setBrand(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900" />
          </Field>
          <Field label="型號">
            <input value={model_number} onChange={(e) => setModel(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900" />
          </Field>
        </div>
        <Field label="序號">
          <input value={serial_number} onChange={(e) => setSerial(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="數量">
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900" />
          </Field>
          <Field label="單位">
            <input value={unit} onChange={(e) => setUnit(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900" />
          </Field>
        </div>
        <Field label="備註">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900" />
        </Field>

        {error && <div className="p-2 rounded bg-red-50 border border-red-300 text-red-800 text-sm">{error}</div>}

        <div className="flex gap-2">
          <button type="submit" disabled={submitting}
            className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50">
            {submitting ? '新增中…' : '新增'}
          </button>
          <Link href="/boss/equipment" className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700">
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-neutral-700 dark:text-neutral-300">{label}</span>
      {children}
    </label>
  );
}
