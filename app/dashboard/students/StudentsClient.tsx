'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import type { Student, TestScore, Attendance } from '@/lib/types';
import { calculateRiskLevel, calculateAvgScore } from '@/lib/analysis';
import RiskBadge from '@/components/RiskBadge';

interface Props {
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
}

export default function StudentsClient({ students: initialStudents, scores, attendance }: Props) {
  const [students, setStudents] = useState(initialStudents);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showDropped, setShowDropped] = useState(false);
  const [search, setSearch] = useState('');
  const [dropModal, setDropModal] = useState<{ student: Student; show: boolean } | null>(null);
  const [dropReason, setDropReason] = useState('');
  const [dropDate, setDropDate] = useState(new Date().toISOString().slice(0, 10));

  const toggleDrop = useCallback(async (student: Student) => {
    if (student.is_dropped) {
      // 복구
      const res = await fetch('/api/students', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: student.id, is_dropped: false }),
      });
      if (res.ok) {
        setStudents(prev => prev.map(s => s.id === student.id ? { ...s, is_dropped: false, dropped_at: null, drop_reason: null } : s));
      }
    } else {
      // 퇴사 모달 열기
      setDropReason('');
      setDropDate(new Date().toISOString().slice(0, 10));
      setDropModal({ student, show: true });
    }
  }, []);

  const resetPassword = useCallback(async (student: Student) => {
    if (!confirm(`${student.name}님의 비밀번호를 '0000'으로 초기화할까요?`)) return;
    const res = await fetch('/api/students', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: student.id, password: '0000' }),
    });
    if (res.ok) alert(`${student.name}님의 비밀번호가 '0000'으로 초기화되었어요.`);
  }, []);

  const confirmDrop = useCallback(async () => {
    if (!dropModal) return;
    const res = await fetch('/api/students', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: dropModal.student.id,
        is_dropped: true,
        dropped_at: dropDate,
        drop_reason: dropReason || null,
      }),
    });
    if (res.ok) {
      setStudents(prev => prev.map(s => s.id === dropModal.student.id
        ? { ...s, is_dropped: true, dropped_at: dropDate, drop_reason: dropReason || null }
        : s
      ));
      setDropModal(null);
    }
  }, [dropModal, dropDate, dropReason]);

  const studentsWithStats = useMemo(() => {
    return students.map((student) => {
      const ss = scores.filter((s) => s.student_id === student.id);
      const sa = attendance.filter((a) => a.student_id === student.id);
      return {
        ...student,
        avg_score: calculateAvgScore(ss),
        risk_level: calculateRiskLevel(ss, sa),
        absent_count: sa.filter((a) => a.status === 'absent').length,
        late_count: sa.filter((a) => a.status === 'late').length,
      };
    });
  }, [students, scores, attendance]);

  const droppedCount = studentsWithStats.filter(s => s.is_dropped).length;

  const filtered = useMemo(() => {
    return studentsWithStats.filter((s) => {
      // 퇴사자 필터
      if (!showDropped && s.is_dropped) return false;
      if (showDropped && !s.is_dropped) return false;
      if (!showDropped && filter !== 'all' && s.risk_level !== filter) return false;
      if (search && !s.name.includes(search)) return false;
      return true;
    });
  }, [studentsWithStats, filter, showDropped, search]);

  const filterLabels: Record<string, string> = { all: '전체', high: '위험', medium: '주의', low: '양호' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
        👥 교육생
      </h2>

      {/* 필터 + 상태 기준 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="이름 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 280,
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            fontSize: 15,
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {!showDropped && (['all', 'high', 'medium', 'low'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              style={{
                padding: '10px 18px',
                borderRadius: 'var(--radius-md)',
                border: filter === level ? 'none' : '1px solid var(--border)',
                background: filter === level ? 'var(--blue)' : 'transparent',
                color: filter === level ? '#fff' : 'var(--text-tertiary)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {filterLabels[level]}
            </button>
          ))}
          <button
            onClick={() => setShowDropped(!showDropped)}
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              border: showDropped ? 'none' : '1px solid var(--border)',
              background: showDropped ? 'var(--red)' : 'transparent',
              color: showDropped ? '#fff' : 'var(--text-muted)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            퇴사자{droppedCount > 0 ? ` (${droppedCount})` : ''}
          </button>
        </div>
        {/* 상태 기준 토글 */}
        <details style={{ cursor: 'pointer', marginLeft: 'auto' }}>
          <summary style={{ fontSize: 13, color: 'var(--text-muted)', listStyle: 'none' }}>
            ℹ️ 기준
          </summary>
          <div style={{
            position: 'absolute', right: 40, marginTop: 8,
            padding: '14px 18px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)', fontSize: 13, color: 'var(--text-second)',
            lineHeight: 1.8, zIndex: 10, width: 340,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div><span style={{ color: 'var(--red)', fontWeight: 700 }}>● 위험</span> — 결석 2회+ 또는 최근 3회 평균 60점 미만</div>
              <div><span style={{ color: 'var(--orange)', fontWeight: 700 }}>● 주의</span> — 지각 3회+ 또는 최근 3회 평균 80점 미만</div>
              <div><span style={{ color: 'var(--green)', fontWeight: 700 }}>● 양호</span> — 최근 3회 평균 80점 이상 + 출결 양호</div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              ※ 평균 점수 = 전체 차시 평균 / 상태 = 최근 3회 기준
            </div>
          </div>
        </details>
      </div>

      {/* 테이블 */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['이름', '평균 점수', '결석', '지각', '상태', '관리'].map((h) => (
                  <th key={h} style={{
                    padding: '14px 20px',
                    textAlign: h === '이름' ? 'left' : 'center',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 0.15s ease',
                    opacity: s.is_dropped ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ padding: '14px 20px' }}>
                    <Link
                      href={`/dashboard/students/${s.id}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        textDecoration: 'none', color: 'var(--text-primary)',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: s.is_dropped ? 'var(--bg-hover)' : 'var(--blue-dim)',
                        color: s.is_dropped ? 'var(--text-muted)' : 'var(--blue-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, fontWeight: 700, flexShrink: 0,
                      }}>
                        {s.name[0]}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, textDecoration: s.is_dropped ? 'line-through' : 'none' }}>{s.name}</span>
                        {s.is_dropped && (
                          <span style={{
                            padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                            fontSize: 11, fontWeight: 700,
                            background: 'rgba(255,69,58,0.12)', color: 'var(--red)',
                          }}>퇴사</span>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {s.avg_score}점
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    {s.absent_count}회
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    {s.late_count}회
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    {s.is_dropped ? (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {s.dropped_at}
                      </span>
                    ) : (
                      <RiskBadge level={s.risk_level} />
                    )}
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        onClick={(e) => { e.preventDefault(); resetPassword(s); }}
                        title="비밀번호 초기화"
                        style={{
                          padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13,
                          background: 'transparent', color: 'var(--text-muted)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        🔑
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); toggleDrop(s); }}
                        style={{
                          padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                          border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          background: s.is_dropped ? 'rgba(48,209,88,0.12)' : 'rgba(255,69,58,0.08)',
                          color: s.is_dropped ? 'var(--green)' : 'var(--red)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {s.is_dropped ? '복구' : '퇴사 처리'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 16 }}>
                    교육생 데이터가 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 퇴사 처리 모달 */}
      {dropModal?.show && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setDropModal(null)}
        >
          <div
            style={{
              background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
              padding: '32px', width: 420, maxWidth: '90vw',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              퇴사 처리
            </h3>
            <p style={{ fontSize: 15, color: 'var(--text-second)', margin: '0 0 24px' }}>
              <span style={{ fontWeight: 700, color: 'var(--red)' }}>{dropModal.student.name}</span>님을 퇴사 처리할까요?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
                  퇴사일
                </label>
                <input
                  type="date"
                  value={dropDate}
                  onChange={e => setDropDate(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)', background: 'var(--bg-surface)',
                    color: 'var(--text-primary)', fontSize: 15,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
                  사유 (선택)
                </label>
                <input
                  type="text"
                  placeholder="예: 개인사유, 적응 어려움 등"
                  value={dropReason}
                  onChange={e => setDropReason(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)', background: 'var(--bg-surface)',
                    color: 'var(--text-primary)', fontSize: 15,
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 28 }}>
              <button
                onClick={() => setDropModal(null)}
                style={{
                  padding: '12px 24px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-tertiary)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                onClick={confirmDrop}
                style={{
                  padding: '12px 24px', borderRadius: 'var(--radius-md)',
                  border: 'none', background: 'var(--red)', color: '#fff',
                  fontSize: 15, fontWeight: 600, cursor: 'pointer',
                }}
              >
                퇴사 처리
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
