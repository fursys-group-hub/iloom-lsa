'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { Student, TestScore, WrongAnswer, Attendance, StudentMemo, CoachingReport } from '@/lib/types';
import {
  calculateRiskLevel,
  calculateAvgScore,
  calculateSubjectAverages,
  calculateDailyAverages,
  trackTags,
} from '@/lib/analysis';
import ScoreTrendChart from '@/components/charts/ScoreTrendChart';
import SubjectRadarChart from '@/components/charts/SubjectRadarChart';
import RiskBadge from '@/components/RiskBadge';

interface Props {
  student: Student;
  scores: TestScore[];
  wrongAnswers: WrongAnswer[];
  attendance: Attendance[];
  memos: StudentMemo[];
  coachingReports: CoachingReport[];
}

const card: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 24,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px',
};

export default function StudentDetailClient({
  student, scores, wrongAnswers, attendance, memos, coachingReports,
}: Props) {
  const avgScore = useMemo(() => calculateAvgScore(scores), [scores]);
  const riskLevel = useMemo(() => calculateRiskLevel(scores, attendance), [scores, attendance]);
  const subjectAverages = useMemo(() => calculateSubjectAverages(scores), [scores]);
  const dailyAverages = useMemo(() => calculateDailyAverages(scores), [scores]);

  const tagTracking = useMemo(() => {
    if (wrongAnswers.length === 0) return null;
    const dates = [...new Set(wrongAnswers.map((w) => w.test_date))].sort().reverse();
    if (dates.length < 2) return null;
    const current = wrongAnswers.filter((w) => w.test_date === dates[0]);
    const previous = wrongAnswers.filter((w) => w.test_date !== dates[0]);
    return trackTags(previous, current);
  }, [wrongAnswers]);

  const absentCount = attendance.filter((a) => a.status === 'absent').length;
  const lateCount = attendance.filter((a) => a.status === 'late').length;
  const presentCount = attendance.filter((a) => a.status === 'present').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 뒤로가기 */}
      <Link
        href="/dashboard/students"
        style={{ fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.15s' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--blue-light)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        ← 교육생 목록
      </Link>

      {/* 프로필 카드 */}
      <div style={card}>
        <div className="profile-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--blue-dim)', color: 'var(--blue-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700,
            }}>
              {student.name[0]}
            </div>
            <div>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {student.name}
              </h2>
              <p style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 2 }}>
                {student.department || '부서 미배정'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <StatItem label="평균" value={`${avgScore}점`} />
            <StatItem label="출석" value={`${presentCount}일`} color="var(--green)" />
            <StatItem label="결석" value={`${absentCount}회`} color={absentCount > 0 ? 'var(--red)' : undefined} />
            <StatItem label="지각" value={`${lateCount}회`} color={lateCount > 0 ? 'var(--orange)' : undefined} />
            <RiskBadge level={riskLevel} />
          </div>
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={card}>
          <h3 style={sectionTitle}>📈 점수 추이</h3>
          {dailyAverages.length > 0 ? (
            <ScoreTrendChart data={dailyAverages} />
          ) : (
            <p style={emptyStyle}>데이터 없음</p>
          )}
        </div>

        <div style={card}>
          <h3 style={sectionTitle}>🎯 과목별 강약점</h3>
          {subjectAverages.length > 0 ? (
            <SubjectRadarChart data={subjectAverages} />
          ) : (
            <p style={emptyStyle}>데이터 없음</p>
          )}
        </div>
      </div>

      {/* 태그 추적 + 코칭 */}
      <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={card}>
          <h3 style={sectionTitle}>🏷️ 취약 영역 추적</h3>
          {tagTracking ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {tagTracking.overcome.length > 0 && (
                <TagSection title="극복 성공" icon="✅" tags={tagTracking.overcome} bg="var(--green-dim)" color="var(--green)" />
              )}
              {tagTracking.newWeak.length > 0 && (
                <TagSection title="새로운 약점" icon="⚠️" tags={tagTracking.newWeak} bg="var(--orange-dim)" color="var(--orange)" />
              )}
              {tagTracking.chronic.length > 0 && (
                <TagSection title="고질적 약점" icon="🚨" tags={tagTracking.chronic} bg="var(--red-dim)" color="var(--red)" />
              )}
              {tagTracking.overcome.length === 0 && tagTracking.newWeak.length === 0 && tagTracking.chronic.length === 0 && (
                <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>태그 변화 없음</p>
              )}
            </div>
          ) : (
            <p style={emptyStyle}>2회 이상 시험 데이터가 필요해요</p>
          )}
        </div>

        <div style={card}>
          <h3 style={sectionTitle}>🤖 AI 코칭 리포트</h3>
          {coachingReports.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {coachingReports.map((report) => (
                <details key={report.id} style={{ cursor: 'pointer' }}>
                  <summary style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: 'var(--radius-md)',
                    fontSize: 15, fontWeight: 500, color: 'var(--text-primary)',
                    transition: 'background 0.15s ease',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span>{report.test_date} 분석</span>
                    <span style={{ color: 'var(--text-muted)' }}>▼</span>
                  </summary>
                  <div style={{
                    marginTop: 8, padding: 16, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-hover)', fontSize: 14, color: 'var(--text-second)',
                    lineHeight: 1.7, whiteSpace: 'pre-wrap',
                  }}>
                    {report.manager_report}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p style={emptyStyle}>아직 코칭 리포트가 없어요</p>
          )}
        </div>
      </div>

      {/* 교육 메모 */}
      <div style={card}>
        <h3 style={sectionTitle}>📝 교육 메모</h3>
        {memos.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memos.map((memo) => (
              <div key={memo.id} style={{
                display: 'flex', gap: 16, padding: '12px 16px',
                borderRadius: 'var(--radius-md)', background: 'var(--bg-hover)',
              }}>
                <span style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0, width: 100 }}>{memo.date}</span>
                <span style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.6 }}>{memo.content}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={emptyStyle}>메모가 없어요</p>
        )}
      </div>

      {/* 반응형 */}
      <style>{`
        @media (max-width: 768px) {
          .chart-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  padding: '32px 0', textAlign: 'center', fontSize: 15, color: 'var(--text-muted)',
};

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)', margin: 0 }}>{value}</p>
    </div>
  );
}

function TagSection({ title, icon, tags, bg, color }: {
  title: string; icon: string; tags: string[]; bg: string; color: string;
}) {
  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-second)', margin: '0 0 8px' }}>
        {icon} {title}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tags.map((tag) => (
          <span key={tag} style={{
            display: 'inline-flex', padding: '4px 12px',
            borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 600,
            background: bg, color,
          }}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
