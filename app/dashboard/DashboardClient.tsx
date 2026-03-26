'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Student, TestScore, Attendance } from '@/lib/types';
import { calculateRiskLevel, calculateDailyAverages, calculateAvgScore } from '@/lib/analysis';
import ScoreTrendChart from '@/components/charts/ScoreTrendChart';
import RiskBadge from '@/components/RiskBadge';

interface Props {
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
}

// 실제 메시지는 DB에서 가져올 예정 — 지금은 예시 1건만
const mockMessages: { id: string; name: string; time: string; type: 'question' | 'help'; replied: boolean; message: string; replyText?: string }[] = [
  {
    id: '1', name: '채형우', time: '오전 10:05', type: 'help', replied: false,
    message: '소파 자재 등급 부분 너무 어려워요... 추가 자료 있으면 공유 부탁드립니다! 😭',
  },
];

export default function DashboardClient({ students, scores, attendance }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

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

          {/* 교육생 메시지 */}
          <div style={{ ...cardStyle, minHeight: 500, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                💬 교육생 메시지
              </h3>
              <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue-light)' }}>
                {mockMessages.filter((m) => !m.replied).length}건 미답변
              </span>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
              {mockMessages.map((msg) => (
                <div key={msg.id} className="animate-fade-in-up">
                  {/* 학생 메시지 */}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15, fontWeight: 700,
                      background: msg.type === 'help' ? 'var(--red-dim)' : 'var(--blue-dim)',
                      color: msg.type === 'help' ? 'var(--red)' : 'var(--blue-light)',
                    }}>
                      {msg.name[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{msg.name}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{msg.time}</span>
                        {msg.type === 'help' && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--red-dim)', color: 'var(--red)' }}>
                            도움 요청
                          </span>
                        )}
                      </div>
                      <div
                        onClick={() => { setReplyingTo(replyingTo === msg.id ? null : msg.id); setReplyText(''); }}
                        style={{
                          background: 'var(--bubble-assistant)',
                          color: 'var(--text-primary)',
                          padding: '14px 18px',
                          borderRadius: '16px 16px 16px 6px',
                          fontSize: 17,
                          lineHeight: 1.65,
                          maxWidth: '85%',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bubble-assistant)'; }}
                      >
                        {msg.message}
                      </div>
                    </div>
                  </div>

                  {/* 내 답변 */}
                  {msg.replied && msg.replyText && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                      <div style={{
                        background: 'var(--bubble-user)',
                        color: '#fff',
                        padding: '14px 18px',
                        borderRadius: '16px 16px 6px 16px',
                        fontSize: 17,
                        lineHeight: 1.65,
                        maxWidth: '75%',
                      }}>
                        {msg.replyText}
                      </div>
                    </div>
                  )}

                  {/* 답변 입력 */}
                  {replyingTo === msg.id && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                      <div style={{ width: '80%', display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder={`${msg.name}에게 답변...`}
                          autoFocus
                          style={{
                            flex: 1,
                            padding: '12px 18px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-primary)',
                            fontSize: 15,
                            outline: 'none',
                            transition: 'border 0.2s',
                          }}
                          onFocus={(e) => { e.target.style.border = '1px solid var(--blue)'; }}
                          onBlur={(e) => { e.target.style.border = '1px solid var(--border)'; }}
                          onKeyDown={(e) => { if (e.key === 'Escape') { setReplyingTo(null); setReplyText(''); } }}
                        />
                        <button style={{
                          padding: '12px 20px',
                          borderRadius: 'var(--radius-md)',
                          border: 'none',
                          background: 'var(--blue)',
                          color: '#fff',
                          fontSize: 15,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          flexShrink: 0,
                        }}>
                          전송
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
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
