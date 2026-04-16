'use client';

import { useEffect, useState } from 'react';
import { SummaryCard } from '@/components/SummaryCard';
import { PrintCard, type ReportDetail } from '@/app/dashboard/reports/ReportsClient';
import { ReportStyles } from '@/app/dashboard/reports/ReportStyles';

interface BatchItem { id: string; name: string; start_date: string; end_date: string; }

export default function ManagerReportsClient({ batches }: { batches: BatchItem[] }) {
  const [storeName, setStoreName] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportDetail[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem('iloom-auth');
    let store: string | null = null;
    if (raw) {
      try {
        const p = JSON.parse(raw);
        store = p.storeName || null;
      } catch { /* ignore */ }
    }
    setStoreName(store);

    const load = async () => {
      try {
        if (batches.length === 0) { setLoading(false); return; }
        const current = batches[0];
        const res = await fetch(`/api/reports?batchId=${current.id}&publishedOnly=true`);
        const data = await res.json();
        setReports(data.reports || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [batches]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', minHeight: 400 }}>
        <p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      </div>
    );
  }

  const myStoreReports = storeName
    ? reports.filter((r) => r.students?.store_location === storeName)
    : reports;

  // 종합 리포트 우선 (학생당 1개)
  const uniqueByStudent = new Map<string, ReportDetail>();
  for (const r of myStoreReports) {
    if (!uniqueByStudent.has(r.student_id) || r.report_type === 'comprehensive') {
      uniqueByStudent.set(r.student_id, r);
    }
  }
  const deduped = Array.from(uniqueByStudent.values());
  const selected = deduped.find((r) => r.student_id === selectedStudentId);

  if (selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <button
          onClick={() => setSelectedStudentId('')}
          style={{ alignSelf: 'flex-start', padding: 0, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 14, cursor: 'pointer' }}
        >
          ← 리포트 목록
        </button>
        <PrintCard r={selected} isPrint={false} />
        <ReportStyles />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
        입문교육 AI 리포트
      </h1>

      {deduped.length === 0 ? (
        <div style={{
          padding: 40, background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', textAlign: 'center',
        }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            {storeName ? `${storeName} 매장 ` : ''}교육생에게 아직 공식 리포트가 발송되지 않았어요.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {deduped.map((r) => {
            const headerLeft = (
              <span style={{
                padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                background: r.students?.store_location ? 'var(--blue-dim)' : 'var(--bg-hover)',
                color: r.students?.store_location ? 'var(--blue)' : 'var(--text-tertiary)',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              }}>{r.students?.store_location || '매장 미배정'}</span>
            );
            const created = new Date(r.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
            return (
              <SummaryCard
                key={r.id}
                date={headerLeft}
                title={r.students?.name || '—'}
                sub={`${created} 발송`}
                typeBadge={{ text: '공식 리포트', tone: 'green' }}
                onClick={() => setSelectedStudentId(r.student_id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
