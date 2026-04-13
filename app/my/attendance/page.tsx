'use client';

import { useState, useEffect, useCallback } from 'react';

interface Attendance { id: string; date: string; status: string; note: string | null; }

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)',
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  present: { label: '출근', color: 'var(--green)' },
  late: { label: '지각', color: 'var(--orange)' },
  early_leave: { label: '조퇴', color: 'var(--orange)' },
  absent: { label: '미출근', color: 'var(--red)' },
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
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>내 출결</h2>

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
      {sorted.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map(d => {
            const s = STATUS_MAP[d.status] || STATUS_MAP.present;
            const checkIn = d.note?.match(/출근\s*([\d:]+)/)?.[1] || '';
            const checkOut = d.note?.match(/퇴근\s*([\d:]+)/)?.[1] || '';
            // 시:분만 표시
            const fmtTime = (t: string) => t.split(':').slice(0, 2).join(':');
            // 날짜 + 요일
            const dateObj = new Date(d.date + 'T00:00:00');
            const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
            const month = dateObj.getMonth() + 1;
            const day = dateObj.getDate();
            const dayName = dayNames[dateObj.getDay()];

            return (
              <div key={d.id} style={{
                ...card,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px',
              }}>
                {/* 왼쪽: 날짜 + 상태 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ textAlign: 'center', minWidth: 48 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{month}/{day}</div>
                    <div style={{ fontSize: 12, color: dayName === '토' || dayName === '일' ? 'var(--red)' : 'var(--text-muted)', fontWeight: 500 }}>{dayName}요일</div>
                  </div>
                  <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                    background: s.color + '18',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{s.label}</span>
                  </div>
                </div>

                {/* 오른쪽: 출퇴근 시간 */}
                {(checkIn || checkOut) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {checkIn && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>출근</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{fmtTime(checkIn)}</div>
                      </div>
                    )}
                    {checkIn && checkOut && (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>→</span>
                    )}
                    {checkOut && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>퇴근</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{fmtTime(checkOut)}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={card}>
          <p style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 15, margin: 0 }}>출결 기록이 없어요</p>
        </div>
      )}
    </div>
  );
}
