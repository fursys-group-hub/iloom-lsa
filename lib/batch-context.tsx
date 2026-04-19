'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getKSTToday } from '@/lib/date';

export interface BatchSummary {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  advanced_start: string | null;
  advanced_end: string | null;
  is_archived: boolean;
}

interface BatchContextValue {
  batches: BatchSummary[];
  selectedBatchId: string;
  setSelectedBatchId: (id: string) => void;
  selectedBatch: BatchSummary | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const BatchContext = createContext<BatchContextValue | null>(null);

const STORAGE_KEY = 'iloom-selected-batch';

function pickDefaultBatchId(batches: BatchSummary[]): string {
  if (batches.length === 0) return '';
  const today = getKSTToday();
  // 1순위: 현재 입문/심화 진행중 (보관 제외)
  const inProgress = batches.find(b => {
    if (b.is_archived) return false;
    if (today >= b.start_date && today <= b.end_date) return true;
    if (b.advanced_start && b.advanced_end && today >= b.advanced_start && today <= b.advanced_end) return true;
    return false;
  });
  if (inProgress) return inProgress.id;
  // 2순위: 가장 최근 활성 기수
  const active = batches.find(b => !b.is_archived);
  if (active) return active.id;
  // 3순위: 그냥 첫 번째
  return batches[0].id;
}

export function BatchProvider({ children }: { children: React.ReactNode }) {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [selectedBatchId, setSelectedBatchIdState] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/batches');
      const data: BatchSummary[] = await res.json();
      if (!Array.isArray(data)) return;
      setBatches(data);
      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const valid = stored && data.some(b => b.id === stored);
      setSelectedBatchIdState(prev => {
        if (prev && data.some(b => b.id === prev)) return prev;
        return valid ? (stored as string) : pickDefaultBatchId(data);
      });
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setSelectedBatchId = useCallback((id: string) => {
    setSelectedBatchIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const selectedBatch = batches.find(b => b.id === selectedBatchId) || null;

  return (
    <BatchContext.Provider value={{ batches, selectedBatchId, setSelectedBatchId, selectedBatch, loading, refresh }}>
      {children}
    </BatchContext.Provider>
  );
}

export function useBatch(): BatchContextValue {
  const ctx = useContext(BatchContext);
  if (!ctx) throw new Error('useBatch must be used inside <BatchProvider>');
  return ctx;
}
