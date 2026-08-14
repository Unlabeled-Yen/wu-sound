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
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>新增設備</h1>
        <Link href="/boss/equipment" className="text-[13px] underline nm-focus" style={{ color: 'var(--nm-text-muted)' }}>返回</Link>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="名稱 *">
          <input value={name} onChange={(e) => setName(e.target.value)} required className="nm-input w-full text-[13.5px]" />
        </Field>
        <Field label="分類 *">
          <select value={category} onChange={(e) => setCategory(e.target.value as EquipmentCategory)} className="nm-input w-full text-[13.5px]">
            {CATEGORIES.map((c) => <option key={c} value={c}>{EQUIPMENT_CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="品牌">
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className="nm-input w-full text-[13.5px]" />
          </Field>
          <Field label="型號">
            <input value={model_number} onChange={(e) => setModel(e.target.value)} className="nm-input w-full text-[13.5px]" />
          </Field>
        </div>
        <Field label="序號 · 系統不檢查是否重複,同序號可能對應多筆設備紀錄">
          <input value={serial_number} onChange={(e) => setSerial(e.target.value)} className="nm-input w-full text-[13.5px]" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="數量 · 這批會整批一起移動,不支援拆開部分調度">
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="nm-input w-full text-[13.5px]" />
          </Field>
          <Field label="單位">
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className="nm-input w-full text-[13.5px]" />
          </Field>
        </div>
        <Field label="備註">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="nm-input w-full text-[13.5px]" />
        </Field>

        {error && (
          <div className="rounded-xl nm-inset p-2 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className="nm-btn-solid text-[13.5px]">
            {submitting ? '新增中…' : '新增'}
          </button>
          <Link href="/boss/equipment" className="nm-btn text-[13.5px]">
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
      <span className="text-[13px]" style={{ color: 'var(--nm-text-secondary)' }}>{label}</span>
      {children}
    </label>
  );
}
