'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBatch } from '@/lib/batch-context';

/* ── types ── */
interface Student {
  id: string;
  name: string;
  batch_id: string;
  is_dropped?: boolean;
}
interface Todo {
  id: string;
  student_id: string;
  date: string;
  text: string;
  done: boolean;
  created_at: string;
}

/* ── styles ── */
const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px 24px',
  boxShadow: 'var(--shadow-sm)',
};
const selectStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  outline: 'none',
};
const badgeBase: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 'var(--radius-pill)',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

/* ── helpers ── */
function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

// 최근 7일 날짜 배열 (KST)
function recentDates(n: number): string[] {
  const dates: string[] = [];
  const today = todayKST();
  for (let i = 0; i < n; i++) {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/* ── component ── */
export default function TodosPage() {
  const { selectedBatchId } = useBatch();
  const [students, setStudents] = useState<Student[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayKST());

  const dates = useMemo(() => recentDates(14), []);

  // fetch students
  useEffect(() => {
    (async () => {
      try {
        const sRes = await fetch('/api/students').then(r => r.json());
        const sList = (sRes.students || sRes || []) as Student[];
        setStudents(sList);
      } catch { /* */ }
      setLoading(false);
    })();
  }, []);

  // filtered students
  const batchStudents = useMemo(() =>
    students.filter(s => s.batch_id === selectedBatchId && !s.is_dropped).sort((a, b) => a.name.localeCompare(b.name)),
    [students, selectedBatchId]
  );

  // fetch todos for batch students on date
  const fetchTodos = useCallback(async () => {
    if (batchStudents.length === 0) { setTodos([]); return; }
    try {
      const ids = batchStudents.map(s => s.id).join(',');
      const res = await fetch(`/api/student-todos?student_ids=${ids}&date=${selectedDate}`);
      const data = await res.json();
      setTodos(Array.isArray(data) ? data : []);
    } catch { setTodos([]); }
  }, [batchStudents, selectedDate]);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  // group todos by student
  const todosByStudent = useMemo(() => {
    const map: Record<string, Todo[]> = {};
    for (const t of todos) {
      if (!map[t.student_id]) map[t.student_id] = [];
      map[t.student_id].push(t);
    }
    return map;
  }, [todos]);

  const studentsWithTodos = batchStudents.filter(s => (todosByStudent[s.id]?.length || 0) > 0);
  const studentsWithoutTodos = batchStudents.filter(s => !todosByStudent[s.id]?.length);

  if (loading) {
    return <div style={{ padding: 32 }}><p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>불러오는 중...</p></div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          교육생 할일
        </h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={selectStyle}>
            {dates.map(d => (
              <option key={d} value={d}>{formatDateLabel(d)}{d === todayKST() ? ' (오늘)' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={cardStyle}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>작성한 교육생</span>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--blue)', margin: '4px 0 0' }}>
            {studentsWithTodos.length}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>/ {batchStudents.length}명</span>
          </p>
        </div>
        <div style={cardStyle}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>전체 할일</span>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 0' }}>
            {todos.length}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>건</span>
          </p>
        </div>
        <div style={cardStyle}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>완료율</span>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)', margin: '4px 0 0' }}>
            {todos.length > 0 ? Math.round((todos.filter(t => t.done).length / todos.length) * 100) : 0}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>%</span>
          </p>
        </div>
      </div>

      {/* Student cards */}
      {batchStudents.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center' as const, padding: '40px 24px' }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>교육생이 없어요</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, maxWidth: 1280 }}>
          {/* Students with todos first */}
          {studentsWithTodos.map(s => {
            const sTodos = todosByStudent[s.id] || [];
            const doneCount = sTodos.filter(t => t.done).length;
            return (
              <div key={s.id} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--blue-dim)', color: 'var(--blue)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                  }}>{s.name[0]}</span>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                  <span style={{
                    ...badgeBase,
                    background: doneCount === sTodos.length ? 'var(--green-dim)' : 'var(--blue-dim)',
                    color: doneCount === sTodos.length ? 'var(--green)' : 'var(--blue)',
                  }}>
                    {doneCount}/{sTodos.length}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sTodos.map(t => (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      padding: '8px 12px',
                      background: 'var(--bg-main)',
                      borderRadius: 'var(--radius-sm)',
                    }}>
                      <span style={{
                        width: 20, height: 20, flexShrink: 0, marginTop: 1,
                        borderRadius: 'var(--radius-xs)',
                        border: t.done ? 'none' : '2px solid var(--border)',
                        background: t.done ? 'var(--blue)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 12,
                      }}>
                        {t.done && '\u2713'}
                      </span>
                      <span style={{
                        fontSize: 14,
                        color: t.done ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: t.done ? 'line-through' : 'none',
                        lineHeight: 1.5,
                      }}>
                        {t.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Students without todos */}
          {studentsWithoutTodos.map(s => (
            <div key={s.id} style={{ ...cardStyle, opacity: 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700,
                }}>{s.name[0]}</span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-tertiary)' }}>{s.name}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>미작성</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
