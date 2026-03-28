'use client';

import { useState, useEffect, useCallback } from 'react';

interface Attendance { id: string; date: string; status: string; note: string | null; }

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: 24,
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  present: { label: '출근', color: 'var(--green)', icon: '✅' },
  late: { label: '지각', color: 'var(--orange)', icon: '⏰' },
  early_leave: { label: '조퇴', color: 'var(--orange)', icon: '🚪' },
  absent: { label: '미출근', color: 'var(--red)', icon: '❌' },
};

export default function MyAttendancePage() {
  const [studentId, setStudentId] = useState('');
  const [data, setData] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) setStudentId(JSON.parse(auth).studentId);
  }, []);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance?studentId=${studentId}`);
      const d = await res.json();
      setData(Array.isArray(d) ? d : []);
    } catch { /* */ }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));
  const presentCount = data.filter(d => d.status === 'present').length;
  const lateCount = data.filter(d => d.status === 'late').length;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📋 내 출결</h2>

      {/* 요약 */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ ...card, flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>출근</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)' }}>{presentCount}일</div>
        </div>
        <div style={{ ...card, flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>지각</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: lateCount > 0 ? 'var(--orange)' : 'var(--text-primary)' }}>{lateCount}회</div>
        </div>
        <div style={{ ...card, flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>총 기록</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{data.length}일</div>
        </div>
      </div>

      {/* 목록 */}
      <div style={card}>
        {sorted.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sorted.map(d => {
              const s = STATUS_MAP[d.status] || STATUS_MAP.present;
              // 출퇴근 시간 파싱
              const checkIn = d.note?.match(/출근\s*([\d:]+)/)?.[1] || '';
              const checkOut = d.note?.match(/퇴근\s*([\d:]+)/)?.[1] || '';
              return (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '12px 16px', borderRadius: 'var(--radius-md)',
                  transition: 'background 0.15s ease',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 15, color: 'var(--text-muted)', minWidth: 100 }}>{d.date}</span>
                  <span style={{ fontSize: 16 }}>{s.icon}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: s.color, minWidth: 50 }}>{s.label}</span>
                  {checkIn && <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>출근 {checkIn}</span>}
                  {checkOut && <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>퇴근 {checkOut}</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 15 }}>출결 기록이 없어요</p>
        )}
      </div>
    </div>
  );
}
