'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Student, TestScore, Attendance } from '@/lib/types';
import { calculateRiskLevel, calculateAvgScore } from '@/lib/analysis';
import RiskBadge from '@/components/RiskBadge';

interface Props {
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
}

export default function StudentsClient({ students, scores, attendance }: Props) {
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [search, setSearch] = useState('');

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

  const filtered = useMemo(() => {
    return studentsWithStats.filter((s) => {
      if (filter !== 'all' && s.risk_level !== filter) return false;
      if (search && !s.name.includes(search)) return false;
      return true;
    });
  }, [studentsWithStats, filter, search]);

  const filterLabels: Record<string, string> = { all: '전체', high: '위험', medium: '주의', low: '양호' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
        👥 교육생
      </h2>

      {/* 상태 기준 안내 */}
      <details style={{ cursor: 'pointer' }}>
        <summary style={{
          fontSize: 14, color: 'var(--text-muted)',
          padding: '10px 16px', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          ℹ️ 상태 판별 기준 보기
        </summary>
        <div style={{
          marginTop: 8, padding: '16px 20px', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          fontSize: 14, color: 'var(--text-second)', lineHeight: 1.8,
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, fontSize: 15 }}>상태 판별 기준</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>● 위험</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>—</span>
              결석 2회 이상 또는 최근 3회 시험 평균 60점 미만
            </div>
            <div>
              <span style={{ color: 'var(--orange)', fontWeight: 700 }}>● 주의</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>—</span>
              지각 3회 이상 또는 최근 3회 시험 평균 80점 미만
            </div>
            <div>
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>● 양호</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>—</span>
              최근 3회 시험 평균 80점 이상 + 출결 양호
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            ※ 평균 점수는 전체 차시 평균이고, 상태는 <b>최근 3회 시험</b> 기준으로 판별돼요.
          </div>
        </div>
      </details>

      {/* 필터 */}
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
          {(['all', 'high', 'medium', 'low'] as const).map((level) => (
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
        </div>
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
                {['이름', '평균 점수', '결석', '지각', '상태'].map((h) => (
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
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s ease' }}
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
                        background: 'var(--blue-dim)', color: 'var(--blue-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, fontWeight: 700, flexShrink: 0,
                      }}>
                        {s.name[0]}
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</span>
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
                    <RiskBadge level={s.risk_level} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 16 }}>
                    교육생 데이터가 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
