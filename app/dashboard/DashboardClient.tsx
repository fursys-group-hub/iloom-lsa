'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import type { Student, TestScore, Attendance } from '@/lib/types';
import { calculateRiskLevel, calculateDailyAverages, calculateAvgScore } from '@/lib/analysis';
import ScoreTrendChart from '@/components/charts/ScoreTrendChart';
import RiskBadge from '@/components/RiskBadge';

interface Insight {
  id: string;
  session: string;
  content: string;
  created_at: string;
}

interface Props {
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
  batchId?: string;
}

export default function DashboardClient({ students, scores, attendance, batchId }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [insights, setInsights] = useState<Insight[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  // 인사이트 불러오기
  useEffect(() => {
    fetch(`/api/insights${batchId ? `?batchId=${batchId}` : ''}`)
      .then((r) => r.json())
      .then((d) => setInsights(d.insights || []))
      .catch(() => {});
  }, [batchId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenResult(null);
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
      const data = await res.json();
      if (res.ok) {
        setGenResult('분석 완료!');
        setInsights((prev) => [{ id: 'new', session: '전체', content: data.content, created_at: new Date().toISOString() }, ...prev]);
      } else {
        setGenResult(data.message || '생성 실패');
      }
    } catch {
      setGenResult('생성 중 오류 발생');
    } finally {
      setGenerating(false);
    }
  };

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

      {/* 인사 */}
      <div>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          안녕하세요, 수지님 👋
        </h2>
        <p style={{ fontSize: 17, color: 'var(--text-tertiary)', marginTop: 4 }}>
          오늘의 교육 현황이에요
        </p>
      </div>

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

          {/* AI 교육 인사이트 */}
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                🤖 AI 교육 인사이트
              </h3>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                  border: generating ? 'none' : '1px solid var(--border)',
                  background: generating ? 'var(--bg-elevated)' : 'transparent',
                  color: generating ? 'var(--text-muted)' : 'var(--text-tertiary)',
                  fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
                }}
              >
                {generating ? '⏳ 분석 중...' : '✨ 새 분석 생성'}
              </button>
            </div>

            {genResult && (
              <div style={{
                padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 12,
                background: genResult.includes('완료') ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)',
                color: genResult.includes('완료') ? 'var(--green)' : 'var(--red)',
                fontSize: 13,
              }}>
                {genResult}
              </div>
            )}

            {insights.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {insights.slice(0, 3).map((insight, idx) => (
                  <details key={insight.id} open={idx === 0}>
                    <summary style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: 'var(--radius-md)',
                      cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      color: 'var(--text-primary)', transition: 'background 0.15s ease',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span>📊 {insight.session} 분석</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {new Date(insight.created_at).toLocaleDateString('ko')}
                      </span>
                    </summary>
                    <div style={{
                      padding: '14px 16px', marginTop: 4,
                      borderRadius: 'var(--radius-md)', background: 'var(--bg-hover)',
                      fontSize: 14, color: 'var(--text-second)',
                      lineHeight: 1.8, whiteSpace: 'pre-wrap',
                    }}>
                      {insight.content}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 12 }}>
                  아직 분석 결과가 없어요
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  위의 &quot;새 분석 생성&quot; 버튼을 눌러보세요
                </p>
              </div>
            )}
          </div>

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
                        background: 'var(--red-dim)', color: 'var(--red)',
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
