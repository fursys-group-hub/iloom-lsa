'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Student, TestScore, Attendance } from '@/lib/types';
import { calculateRiskLevel, calculateDailyAverages, calculateAvgScore } from '@/lib/analysis';
import ScoreTrendChart from '@/components/charts/ScoreTrendChart';
import RiskBadge from '@/components/RiskBadge';

interface BatchInfo {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  advanced_start: string | null;
  advanced_end: string | null;
}

interface Props {
  batches: BatchInfo[];
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
}

function getBatchStatus(batch: BatchInfo): { label: string; color: string; bg: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (today >= batch.start_date && today <= batch.end_date)
    return { label: '입문교육 진행중', color: 'var(--green)', bg: 'rgba(48,209,88,0.12)' };
  if (batch.advanced_start && batch.advanced_end && today >= batch.advanced_start && today <= batch.advanced_end)
    return { label: '심화교육 진행중', color: 'var(--purple)', bg: 'rgba(191,90,242,0.15)' };
  if (batch.advanced_end && today > batch.advanced_end)
    return { label: '완료', color: 'var(--text-muted)', bg: 'var(--bg-hover)' };
  if (today > batch.end_date)
    return { label: '매장 배치 대기', color: 'var(--orange)', bg: 'rgba(255,159,10,0.12)' };
  if (today < batch.start_date)
    return { label: '예정', color: 'var(--blue-light)', bg: 'var(--blue-dim)' };
  return { label: '', color: '', bg: '' };
}

export default function DashboardClient({ batches, students: allStudents, scores: allScores, attendance: allAttendance }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id || '');
  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  // 선택된 기수의 학생만 필터
  const students = useMemo(() => allStudents.filter(s => s.batch_id === selectedBatchId), [allStudents, selectedBatchId]);
  const studentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);
  const scores = useMemo(() => allScores.filter(s => studentIds.has(s.student_id)), [allScores, studentIds]);
  const attendance = useMemo(() => allAttendance.filter(a => studentIds.has(a.student_id)), [allAttendance, studentIds]);

  const todayAttendance = useMemo(() => {
    const recs = attendance.filter((a) => a.date === today);
    return {
      present: recs.filter((a) => a.status === 'present').length,
      late: recs.filter((a) => a.status === 'late').length,
      absent: recs.filter((a) => a.status === 'absent').length,
      total: students.length,
    };
  }, [attendance, today, students.length]);

  const dailyAverages = useMemo(() => calculateDailyAverages(scores), [scores]);

  const studentsWithStats = useMemo(() => {
    return students.map((student) => {
      const ss = scores.filter((s) => s.student_id === student.id);
      const sa = attendance.filter((a) => a.student_id === student.id);
      return { ...student, avg_score: calculateAvgScore(ss), risk_level: calculateRiskLevel(ss, sa) };
    });
  }, [students, scores, attendance]);

  const riskStudents = studentsWithStats.filter((s) => s.risk_level !== 'low');

  const latestTest = useMemo(() => {
    if (scores.length === 0) return null;
    const dates = [...new Set(scores.map((s) => s.test_date))].sort().reverse();
    const d = dates[0];
    const ls = scores.filter((s) => s.test_date === d);
    const vals = ls.map((s) => s.score);
    return {
      date: d,
      subject: [...new Set(ls.map((s) => s.subject))].join(', '),
      avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      max: Math.round(Math.max(...vals) * 10) / 10,
      min: Math.round(Math.min(...vals) * 10) / 10,
      count: new Set(ls.map((s) => s.student_id)).size,
    };
  }, [scores]);

  const subjectAverages = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of scores) { const a = m.get(s.subject) || []; a.push(s.score); m.set(s.subject, a); }
    return [...m.entries()]
      .map(([subject, vals]) => ({ subject, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [scores]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* 인사 + 기수 선택 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            안녕하세요, 수지님 👋
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-tertiary)', marginTop: 4 }}>
            오늘의 교육 현황이에요
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={selectedBatchId}
            onChange={e => setSelectedBatchId(e.target.value)}
            style={{
              padding: '10px 16px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', background: 'var(--bg-surface)',
              color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              minWidth: 180,
            }}
          >
            {batches.map(b => (
              <option key={b.id} value={b.id}>{b.name} 기수</option>
            ))}
          </select>
          {selectedBatch && (() => {
            const status = getBatchStatus(selectedBatch);
            return (
              <span style={{
                padding: '6px 14px', borderRadius: 'var(--radius-pill)',
                fontSize: 13, fontWeight: 700, background: status.bg, color: status.color,
                whiteSpace: 'nowrap',
              }}>
                {status.label}
              </span>
            );
          })()}
        </div>
      </div>

      {/* 교육 일정 타임라인 */}
      {selectedBatch && (
        <div style={{
          display: 'flex', gap: 12, padding: '16px 20px', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700, background: 'var(--blue-dim)', color: 'var(--blue-light)' }}>입문</span>
            <span style={{ fontSize: 14, color: today >= selectedBatch.start_date && today <= selectedBatch.end_date ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: today >= selectedBatch.start_date && today <= selectedBatch.end_date ? 600 : 400 }}>
              {selectedBatch.start_date} ~ {selectedBatch.end_date}
            </span>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700, background: 'rgba(191,90,242,0.15)', color: 'var(--purple)' }}>심화</span>
            {selectedBatch.advanced_start ? (
              <span style={{ fontSize: 14, color: today >= (selectedBatch.advanced_start||'') && today <= (selectedBatch.advanced_end||'') ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: today >= (selectedBatch.advanced_start||'') && today <= (selectedBatch.advanced_end||'') ? 600 : 400 }}>
                {selectedBatch.advanced_start} ~ {selectedBatch.advanced_end}
              </span>
            ) : (
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>미정</span>
            )}
          </div>
        </div>
      )}

      {/* 요약 카드 */}
      <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatCard icon="👥" label="전체 인원" value={todayAttendance.total} unit="명" />
        <StatCard icon="✅" label="출석" value={todayAttendance.present} unit="명" accent="var(--green)" />
        <StatCard icon="⏰" label="지각" value={todayAttendance.late} unit="명" accent="var(--orange)" />
        <StatCard icon="❌" label="결석" value={todayAttendance.absent} unit="명" accent="var(--red)" />
      </div>

      {/* 2컬럼 */}
      <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24 }}>

        {/* ─── 왼쪽: 메시징 ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* 주의 교육생 */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>
              ⚠️ 주의 교육생
            </h3>
            {riskStudents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {riskStudents.map((s) => (
                  <Link
                    key={s.id}
                    href={`/dashboard/students/${s.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', borderRadius: 'var(--radius-md)',
                      textDecoration: 'none', transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'var(--red-solid-bg)', color: 'var(--red-solid-text)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, fontWeight: 700, flexShrink: 0,
                      }}>
                        {s.name[0]}
                      </div>
                      <div>
                        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{s.name}</p>
                        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>평균 {s.avg_score}점</p>
                      </div>
                    </div>
                    <RiskBadge level={s.risk_level} />
                  </Link>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 16, color: 'var(--text-tertiary)', padding: '20px 0' }}>모든 교육생이 양호해요! 🎉</p>
            )}
          </div>
        </div>

        {/* ─── 오른쪽: 현황 ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* 최근 시험 */}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>📝 최근 시험</h3>
            {latestTest ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{latestTest.date}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue-light)' }}>
                    {latestTest.subject}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
                  <ScoreBox label="평균" value={latestTest.avg} bg="var(--bg-hover)" color="var(--text-primary)" />
                  <ScoreBox label="최고" value={latestTest.max} bg="var(--green-dim)" color="var(--green)" />
                  <ScoreBox label="최저" value={latestTest.min} bg="var(--red-dim)" color="var(--red)" />
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' }}>{latestTest.count}명 응시</p>
              </div>
            ) : (
              <p style={{ fontSize: 16, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>시험 결과 없음</p>
            )}
          </div>

          {/* 차시별 평균 */}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>📊 차시별 평균</h3>
            {subjectAverages.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {subjectAverages.map((s) => (
                  <div key={s.subject} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-tertiary)', width: 56, textAlign: 'right', flexShrink: 0 }}>
                      {s.subject}
                    </span>
                    <div style={{ flex: 1, height: 32, background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.max(s.avg, 8)}%`,
                        borderRadius: 'var(--radius-sm)',
                        background: s.avg >= 80 ? 'var(--green)' : s.avg >= 60 ? 'var(--blue)' : 'var(--red)',
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10,
                        transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{s.avg}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 16, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>데이터 없음</p>
            )}
          </div>

          {/* 평균 추이 */}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>📈 평균 추이</h3>
            {dailyAverages.length > 0 ? (
              <ScoreTrendChart data={dailyAverages} height={200} />
            ) : (
              <p style={{ fontSize: 16, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>데이터 없음</p>
            )}
          </div>

          {/* 교육생 목록 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}>👥 교육생</h3>
              <Link href="/dashboard/students" style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue-light)', textDecoration: 'none' }}>
                전체보기 →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {studentsWithStats.slice(0, 6).map((s) => (
                <Link
                  key={s.id}
                  href={`/dashboard/students/${s.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 'var(--radius-md)',
                    textDecoration: 'none', transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: 'var(--blue-dim)', color: 'var(--blue-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, flexShrink: 0,
                    }}>
                      {s.name[0]}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{s.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{s.avg_score}점</span>
                    <RiskBadge level={s.risk_level} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 반응형 */}
      <style>{`
        @media (max-width: 768px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .main-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── 공통 스타일 ─── */

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 24,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: '0 0 20px',
};

/* ─── 하위 컴포넌트 ─── */

function StatCard({ icon, label, value, unit, accent }: {
  icon: string; label: string; value: number; unit: string; accent?: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <p style={{ fontSize: 32, fontWeight: 800, color: accent || 'var(--text-primary)', margin: 0 }}>
        {value}
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span>
      </p>
    </div>
  );
}

function ScoreBox({ label, value, bg, color }: {
  label: string; value: number; bg: string; color: string;
}) {
  return (
    <div style={{ background: bg, borderRadius: 'var(--radius-md)', padding: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color, margin: 0 }}>{value}</p>
    </div>
  );
}
