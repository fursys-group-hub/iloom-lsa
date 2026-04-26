'use client';

import { useEffect, useState } from 'react';
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

  // 첫 학생 자동 선택
  const activeId = selectedStudentId || deduped[0]?.student_id || '';
  const selected = deduped.find((r) => r.student_id === activeId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 0 0', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
          입문교육 AI 리포트
        </h1>
      </div>

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
        <>
          {/* 학생 탭 */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
            {deduped.map((r, i) => (
              <button
                key={r.student_id}
                onClick={() => setSelectedStudentId(r.student_id)}
                style={{
                  padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,
                  background: 'transparent',
                  color: activeId === r.student_id ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderBottom: activeId === r.student_id ? '2px solid var(--blue)' : '2px solid transparent',
                  fontSize: 15,
                  fontWeight: activeId === r.student_id ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  marginBottom: -1,
                }}
              >
                {r.students?.name || '—'}
              </button>
            ))}
          </div>

          {/* 선택된 학생 리포트 */}
          {selected && (
            <>
              <PrintCard r={selected} isPrint={false} />
              <ReportStyles />
            </>
          )}
        </>
      )}
    </div>
  );
}
