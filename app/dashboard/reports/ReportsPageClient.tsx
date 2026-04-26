'use client';

import { useState, useRef } from 'react';
import ReportsClient from './ReportsClient';
import BatchSummarySection from './BatchSummarySection';
import type { Batch, Student, TestScore, Attendance, TagTracking } from '@/lib/types';

interface BatchItem { id: string; name: string; start_date: string; end_date: string; }

interface SummaryProps {
  batches: Batch[];
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
  notes: { id: string; student_id: string; title: string; content: string; created_at: string }[];
  memos: { student_id: string; category: string }[];
  testResponses: { student_id: string; batch_id: string; session: string; question_id: string; is_correct: boolean; test_date: string }[];
  examQuestions: { id: string; batch_id: string; session: string; question_id: string; category: string }[];
  coachingReports: { student_id: string; tag_tracking: TagTracking | null; created_at: string }[];
  totalQuestionCount: number;
}

const tabs: [string, string][] = [
  ['reports', 'AI 리포트'],
  ['summary', '기수 요약'],
];

const actionBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', transition: 'all 0.15s ease',
};

export default function ReportsPageClient({
  batches,
  summaryProps,
}: {
  batches: BatchItem[];
  summaryProps: SummaryProps;
}) {
  const [active, setActive] = useState('reports');
  const refreshRef = useRef<(() => void) | null>(null);
  const printRef = useRef<(() => void) | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 헤더: 제목 + 액션 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          AI 분석 리포트
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {active === 'reports' && (
            <button onClick={() => refreshRef.current?.()} style={actionBtn}>
              새로고침
            </button>
          )}
          {active === 'summary' && (
            <button
              onClick={() => printRef.current?.()}
              style={{ ...actionBtn, background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 600 }}
            >
              PDF 다운로드
            </button>
          )}
        </div>
      </div>

      {/* Underline Tabs — DESIGN_SYSTEM.md §8 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {tabs.map(([key, label], i) => (
          <button key={key} onClick={() => setActive(key)} style={{
            padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,
            background: 'transparent',
            color: active === key ? 'var(--text-primary)' : 'var(--text-muted)',
            border: 'none',
            borderBottom: active === key ? '2px solid var(--blue)' : '2px solid transparent',
            fontSize: 15,
            fontWeight: active === key ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {active === 'reports' && <ReportsClient batches={batches} actionRef={refreshRef} />}
      {active === 'summary' && <BatchSummarySection {...summaryProps} actionRef={printRef} />}
    </div>
  );
}
