'use client';

import { useBatch } from '@/lib/batch-context';

export function BatchSelector({ compact = false }: { compact?: boolean }) {
  const { batches, selectedBatchId, setSelectedBatchId, loading } = useBatch();

  if (loading || batches.length === 0) return null;

  const active = batches.filter(b => !b.is_archived);
  const archived = batches.filter(b => b.is_archived);

  return (
    <select
      aria-label="기수 선택"
      value={selectedBatchId}
      onChange={e => setSelectedBatchId(e.target.value)}
      style={{
        width: '100%',
        padding: compact ? '6px 12px' : '8px 14px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      {active.map(b => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
      {archived.length > 0 && (
        <optgroup label="── 보관 ──">
          {archived.map(b => (
            <option key={b.id} value={b.id}>{b.name} (보관)</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
