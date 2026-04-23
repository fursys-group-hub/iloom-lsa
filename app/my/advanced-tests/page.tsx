'use client';

import { useEffect, useState, useMemo } from 'react';
import type { WeekBlock, SessionSummary, AdvancedQuestion } from '@/lib/types';
import { parseUserAnswers, gradeAnswer } from '@/lib/advanced-grading';
import { SessionDetailModal } from '@/components/AdvancedScoreSection';

interface OverviewResponse {
  pass_score: number;
  weeks: Record<number, WeekBlock>;
  class_avg: Record<string, { avg: number; count: number }>;
  questions_by_key: Record<string, AdvancedQuestion[]>;
}

const WEEKS = [1, 2, 3, 4, 5, 6];
const SESSIONS = [1, 2];

export default function MyAdvancedTestsPage() {
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<{ week: number; session: number } | null>(null);

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) {
      const parsed = JSON.parse(auth);
      if (parsed.studentId) setStudentId(parsed.studentId);
      if (parsed.name) setStudentName(parsed.name);
    }
  }, []);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    fetch(`/api/advanced-student-overview?student_id=${studentId}`)
      .then((r) => r.json())
      .then((json) => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [studentId]);

  const passScore = data?.pass_score ?? 80;

  // 주차 × 차시 = 12개 카드
  const cards = useMemo(() => {
    const list: CardData[] = [];
    for (const w of WEEKS) {
      for (const s of SESSIONS) {
        const summary = data?.weeks?.[w]?.sessions?.[s];
        const classRow = data?.class_avg?.[`${w}-${s}`];
        const questions = data?.questions_by_key?.[`${w}-${s}`] || [];
        const mine = summary?.final_score ?? null;
        const { wrong, total } = summary && summary.attempts.length > 0
          ? computeWrong(summary, questions)
          : { wrong: 0, total: questions.length };
        list.push({
          week: w,
          session: s,
          mine,
          passed: summary?.passed ?? false,
          passAttempt: summary?.pass_attempt ?? null,
          attemptCount: summary?.attempt_count ?? 0,
          classAvg: classRow?.avg ?? null,
          classCount: classRow?.count ?? 0,
          wrong,
          total,
          summary: summary ?? null,
        });
      }
    }
    return list;
  }, [data]);

  const openSummary: SessionSummary | null =
    openKey && data?.weeks?.[openKey.week]?.sessions?.[openKey.session]
      ? data.weeks[openKey.week].sessions[openKey.session]
      : null;

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
        불러오는 중...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2
        style={{
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
          margin: 0,
        }}
      >
        내 심화시험
      </h2>

      {/* 주차×차시 카드 그리드 — 기존 테스트 페이지와 동일 스타일 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {cards.map((c) => (
          <TestCard
            key={`${c.week}-${c.session}`}
            data={c}
            passScore={passScore}
            onClick={() => {
              if (c.attemptCount > 0) setOpenKey({ week: c.week, session: c.session });
            }}
          />
        ))}
      </div>

      {/* 상세 모달 */}
      {openKey && openSummary && (
        <SessionDetailModal
          week={openKey.week}
          session={openKey.session}
          studentName={studentName}
          summary={openSummary}
          passScore={passScore}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Types & helpers
// ------------------------------------------------------------

interface CardData {
  week: number;
  session: number;
  mine: number | null;
  passed: boolean;
  passAttempt: number | null;
  attemptCount: number;
  classAvg: number | null;
  classCount: number;
  wrong: number;
  total: number;
  summary: SessionSummary | null;
}

function computeWrong(
  summary: SessionSummary,
  questions: AdvancedQuestion[],
): { wrong: number; total: number } {
  const total = questions.length;
  if (summary.attempts.length === 0 || total === 0) return { wrong: 0, total };
  const idx = summary.passed && summary.pass_attempt
    ? summary.pass_attempt - 1
    : summary.attempts.length - 1;
  const rep = summary.attempts[idx];
  const userMap = parseUserAnswers(rep.submitted_answers);
  let wrong = 0;
  for (const q of questions) {
    const ua = userMap[q.question_id] ?? '';
    const result = gradeAnswer(ua, q.correct_answer, q.scoring_mode);
    if (result === false) wrong++;
  }
  return { wrong, total };
}

// ------------------------------------------------------------
// TestCard — 기존 /my/tests 페이지 카드 스타일 그대로
// ------------------------------------------------------------
function TestCard({
  data: c,
  passScore,
  onClick,
}: {
  data: CardData;
  passScore: number;
  onClick: () => void;
}) {
  const hasAttempt = c.attemptCount > 0;
  const mineColor = !hasAttempt
    ? 'var(--text-muted)'
    : c.passed
      ? 'var(--green)'
      : (c.mine ?? 0) >= passScore * 0.75
        ? 'var(--orange)'
        : 'var(--red)';

  const diff =
    c.mine !== null && c.classAvg !== null
      ? Math.round((c.mine - c.classAvg) * 10) / 10
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasAttempt}
      style={{
        padding: '20px',
        borderRadius: 'var(--radius-md)',
        textAlign: 'left',
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        cursor: hasAttempt ? 'pointer' : 'default',
        opacity: hasAttempt ? 1 : 0.7,
        transition: 'all 0.15s ease',
        fontFamily: 'inherit',
      }}
    >
      {/* 제목 + 시도 횟수 뱃지 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
          {c.week}주차 {c.session}차시
        </span>
        {hasAttempt && (
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 'var(--radius-pill)',
              fontSize: 12,
              fontWeight: 600,
              background: c.passed ? 'var(--green-dim)' : 'var(--orange-dim)',
              color: c.passed ? 'var(--green)' : 'var(--orange)',
              whiteSpace: 'nowrap',
            }}
          >
            {c.passed ? `달성 · ${c.passAttempt}회` : `미달성 · ${c.attemptCount}회`}
          </span>
        )}
      </div>

      {/* 지표 행 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ color: 'var(--text-muted)' }}>내 점수</span>
          {hasAttempt ? (
            <span style={{ color: mineColor, fontWeight: 700 }}>{c.mine}점</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>미응시</span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ color: 'var(--text-muted)' }}>반 평균</span>
          {c.classAvg !== null && c.classCount > 0 ? (
            <span style={{ color: diff !== null && diff >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {c.classAvg}점
              {diff !== null && hasAttempt && ` (${diff >= 0 ? '+' : ''}${diff})`}
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>—</span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ color: 'var(--text-muted)' }}>오답</span>
          {c.total > 0 ? (
            hasAttempt ? (
              <span style={{ color: c.wrong > 0 ? 'var(--red)' : 'var(--green)' }}>
                {c.wrong === 0 ? '전문항 정답!' : `${c.wrong}/${c.total}문항`}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>{c.total}문항</span>
            )
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>—</span>
          )}
        </div>
      </div>
    </button>
  );
}
