'use client';

import { useEffect, useState, useMemo } from 'react';
import type {
  AdvancedScoresResponse,
  SessionSummary,
  AdvancedTestScore,
  AdvancedQuestion,
} from '@/lib/types';
import { parseUserAnswers, gradeAnswer } from '@/lib/advanced-grading';

interface Props {
  studentId: string;
  studentName?: string;
  weeks?: number[];
  sessions?: number[];
}

const DEFAULT_WEEKS = [1, 2, 3, 4, 5, 6];
const DEFAULT_SESSIONS = [1, 2];

export default function AdvancedScoreSection({
  studentId,
  studentName = '',
  weeks = DEFAULT_WEEKS,
  sessions = DEFAULT_SESSIONS,
}: Props) {
  const [data, setData] = useState<AdvancedScoresResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [openKey, setOpenKey] = useState<{ week: number; session: number } | null>(null);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    fetch(`/api/advanced-scores?student_id=${studentId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.weeks) setData(json as AdvancedScoresResponse);
        else setData({ pass_score: 80, weeks: {} });
      })
      .catch(() => setData({ pass_score: 80, weeks: {} }))
      .finally(() => setLoading(false));
  }, [studentId]);

  const passScore = data?.pass_score ?? 80;

  const hasAny = useMemo(() => {
    if (!data) return false;
    return Object.values(data.weeks).some((block) =>
      Object.values(block.sessions).some((s) => s.attempt_count > 0),
    );
  }, [data]);

  const openSummary: SessionSummary | null =
    openKey && data?.weeks?.[openKey.week]?.sessions?.[openKey.session]
      ? data.weeks[openKey.week].sessions[openKey.session]
      : null;

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${weeks.length}, 1fr)`,
        }}
      >
        {weeks.map((w, i) => (
          <WeekCard
            key={w}
            week={w}
            sessions={sessions}
            data={data}
            passScore={passScore}
            loading={loading}
            showDivider={i < weeks.length - 1}
            onSessionClick={(session) => {
              const summary = data?.weeks?.[w]?.sessions?.[session];
              if (summary && summary.attempt_count > 0) {
                setOpenKey({ week: w, session });
              }
            }}
          />
        ))}
      </div>

      {!loading && !hasAny && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '16px 0 0', textAlign: 'center' }}>
          구글 시트 연동 후 주차별 시험 점수가 여기에 표시됩니다
        </p>
      )}

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
// 주차 카드 (내부에 차시 2열)
// ------------------------------------------------------------
interface WeekCardProps {
  week: number;
  sessions: number[];
  data: AdvancedScoresResponse | null;
  passScore: number;
  loading: boolean;
  showDivider: boolean;
  onSessionClick: (session: number) => void;
}

function WeekCard({
  week,
  sessions,
  data,
  passScore,
  loading,
  showDivider,
  onSessionClick,
}: WeekCardProps) {
  return (
    <div
      style={{
        padding: '8px 16px',
        borderRight: showDivider ? '1px solid var(--border-light)' : 'none',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-tertiary)',
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        {week}주차
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${sessions.length}, 1fr)`,
          gap: 4,
        }}
      >
        {sessions.map((s) => {
          const summary = data?.weeks?.[week]?.sessions?.[s];
          return (
            <SessionCell
              key={s}
              session={s}
              summary={summary}
              passScore={passScore}
              loading={loading}
              onClick={() => onSessionClick(s)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 차시 셀
// ------------------------------------------------------------
interface SessionCellProps {
  session: number;
  summary?: SessionSummary;
  passScore: number;
  loading: boolean;
  onClick: () => void;
}

function SessionCell({ session, summary, passScore, loading, onClick }: SessionCellProps) {
  const hasAttempts = !!summary && summary.attempt_count > 0;
  const passed = !!summary?.passed;
  const number = hasAttempts ? summary!.final_score : null;
  const color = !hasAttempts
    ? 'var(--text-muted)'
    : passed
      ? 'var(--green)'
      : (number ?? 0) >= passScore * 0.75
        ? 'var(--orange)'
        : 'var(--red)';

  const subText = !hasAttempts
    ? ''
    : passed
      ? `${summary!.pass_attempt}회 달성`
      : `${summary!.attempt_count}회 시도`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasAttempts || loading}
      style={{
        textAlign: 'center',
        padding: '8px 4px',
        background: 'transparent',
        border: 'none',
        cursor: hasAttempts ? 'pointer' : 'default',
        opacity: hasAttempts ? 1 : 0.5,
        borderRadius: 'var(--radius-sm)',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (hasAttempts) e.currentTarget.style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        {number !== null ? number : '—'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
        {session}차시
      </div>
      {subText && (
        <div
          style={{
            marginTop: 3,
            fontSize: 11,
            fontWeight: 600,
            color: passed ? 'var(--green)' : 'var(--orange)',
          }}
        >
          {subText}
        </div>
      )}
    </button>
  );
}

// ------------------------------------------------------------
// 상세 모달
// ------------------------------------------------------------
interface ModalProps {
  week: number;
  session: number;
  studentName: string;
  summary: SessionSummary;
  passScore: number;
  onClose: () => void;
}

export function SessionDetailModal({ week, session, studentName, summary, passScore, onClose }: ModalProps) {
  const passed = summary.passed;
  const headerStatus = passed
    ? `${summary.pass_attempt}회 만에 달성`
    : `${summary.attempt_count}회 시도 중 · 미달성`;

  // 확장된 시도 id (클릭 시 문항별 상세 펼침)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 문제은행 로드 (batch_id는 첫 attempt에서 획득)
  const [questions, setQuestions] = useState<AdvancedQuestion[]>([]);
  const [loadingQs, setLoadingQs] = useState(false);

  useEffect(() => {
    const first = summary.attempts[0];
    if (!first?.batch_id) return;
    setLoadingQs(true);
    fetch(`/api/advanced-questions?batch_id=${first.batch_id}&week=${week}&session=${session}`)
      .then((r) => r.json())
      .then((json) => setQuestions(json.questions || []))
      .catch(() => setQuestions([]))
      .finally(() => setLoadingQs(false));
  }, [summary.attempts, week, session]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 20px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 880,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px 32px',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 2,
            width: 36,
            height: 36,
            minWidth: 36,
            minHeight: 36,
            maxWidth: 36,
            maxHeight: 36,
            boxSizing: 'border-box',
            padding: 0,
            margin: 0,
            flex: 'none',
            borderRadius: '50%',
            border: 'none',
            background: 'var(--bg-hover)',
            color: 'var(--text-tertiary)',
            fontSize: 20,
            lineHeight: '36px',
            fontWeight: 400,
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          ×
        </button>

        <div style={{ paddingRight: 44, marginBottom: 20 }}>
          <h3
            style={{
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            {studentName ? `${studentName} · ` : ''}
            {week}주차 {session}차시 시험 기록
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '6px 0 0' }}>
            통과 기준 {passScore}점 · {headerStatus}
            {questions.length > 0 && (
              <span style={{ marginLeft: 10 }}>
                · 각 시도 클릭 시 문제별 정답/오답 보기
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {summary.attempts.map((a, i) => {
            const isExpanded = expandedId === a.id;
            const isPass = passed && summary.pass_attempt === i + 1;
            return (
              <AttemptBlock
                key={a.id}
                idx={i + 1}
                attempt={a}
                passScore={passScore}
                isPassRow={isPass}
                expanded={isExpanded}
                onToggle={() => setExpandedId(isExpanded ? null : a.id)}
                questions={questions}
                loadingQs={loadingQs}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface AttemptBlockProps {
  idx: number;
  attempt: AdvancedTestScore;
  passScore: number;
  isPassRow: boolean;
  expanded: boolean;
  onToggle: () => void;
  questions: AdvancedQuestion[];
  loadingQs: boolean;
}

function AttemptBlock({
  idx,
  attempt,
  passScore,
  isPassRow,
  expanded,
  onToggle,
  questions,
  loadingQs,
}: AttemptBlockProps) {
  const scoreColor = attempt.score >= passScore ? 'var(--green)' : 'var(--red)';
  const bg = isPassRow ? 'var(--green-dim)' : 'var(--bg-main)';
  const canExpand = questions.length > 0;

  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        background: 'var(--bg-surface)',
      }}
    >
      {/* 시도 요약 행 */}
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '60px 160px 90px 1fr 28px',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          background: bg,
          border: 'none',
          textAlign: 'left',
          cursor: canExpand ? 'pointer' : 'default',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-second)' }}>{idx}회</span>
        <span style={{ fontSize: 14, color: 'var(--text-second)' }}>{formatKST(attempt.submitted_at)}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: scoreColor }}>
          {attempt.score}
          {isPassRow ? ' ✓' : ''}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{attempt.wrong_parts || '—'}</span>
        <span
          style={{
            fontSize: 14,
            color: 'var(--text-muted)',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        >
          ›
        </span>
      </button>

      {/* 문항별 상세 (펼쳐질 때) */}
      {expanded && (
        <div style={{ padding: '14px 18px 18px', background: 'var(--bg-main)', borderTop: '1px solid var(--border)' }}>
          {loadingQs ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>문제 불러오는 중...</p>
          ) : questions.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              이 주차의 문제은행이 없어요. 동기화 후 다시 시도해주세요.
            </p>
          ) : (
            <QuestionList attempt={attempt} questions={questions} />
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 문항별 리스트 (정답/오답 카드)
// ------------------------------------------------------------
interface QuestionListProps {
  attempt: AdvancedTestScore;
  questions: AdvancedQuestion[];
}

function QuestionList({ attempt, questions }: QuestionListProps) {
  const userMap = useMemo(() => parseUserAnswers(attempt.submitted_answers), [attempt.submitted_answers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-second)', marginBottom: 4 }}>
        문항별 답안 ({questions.length}문항)
      </div>
      {questions.map((q) => {
        const userAnswer = userMap[q.question_id] ?? '';
        const correct = gradeAnswer(userAnswer, q.correct_answer, q.scoring_mode);
        return (
          <QuestionCard
            key={q.id}
            question={q}
            userAnswer={userAnswer}
            correct={correct}
          />
        );
      })}
    </div>
  );
}

interface QuestionCardProps {
  question: AdvancedQuestion;
  userAnswer: string;
  correct: boolean | null;
}

function QuestionCard({ question, userAnswer, correct }: QuestionCardProps) {
  const q = question;
  const isCorrect = correct === true;
  const isWrong = correct === false;

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${isWrong ? 'var(--red-dim)' : 'var(--border)'}`,
        background: isWrong ? 'var(--red-dim)' : 'var(--bg-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <OXBadge correct={isCorrect} unknown={correct === null} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Q{q.question_id}
            {q.scoring_mode && ` · ${q.scoring_mode}`}
            {q.max_score ? ` · ${q.max_score}점` : ''}
            {q.category && ` · ${q.category}`}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', marginTop: 2, lineHeight: 1.5 }}>
            {q.question_text}
          </div>
        </div>
      </div>

      {/* 보기 (객관식) */}
      {q.options && q.options.trim() && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginLeft: 38, marginBottom: 6 }}>
          {q.options.split('\n').filter((o) => o.trim()).map((opt, oi) => {
            const hasNum = /^\d+[.)]\s*/.test(opt.trim());
            return (
              <div
                key={oi}
                style={{
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  color: 'var(--text-tertiary)',
                }}
              >
                {hasNum ? opt.trim() : `${oi + 1}) ${opt.trim()}`}
              </div>
            );
          })}
        </div>
      )}

      {/* 학생답 vs 정답 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginLeft: 38 }}>
        <AnswerBox
          label="학생 답안"
          value={userAnswer || '(미입력)'}
          color={isCorrect ? 'green' : isWrong ? 'red' : 'gray'}
        />
        <AnswerBox label="정답" value={q.correct_answer || ''} color="blue" />
      </div>

      {/* 해설 */}
      {q.explanation && (
        <div
          style={{
            marginLeft: 38,
            marginTop: 8,
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)',
            fontSize: 13,
            color: 'var(--text-tertiary)',
            lineHeight: 1.5,
          }}
        >
          💡 {q.explanation}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// OX 뱃지 & 답안 박스 (입문교육 TestsClient 패턴 재구현)
// ------------------------------------------------------------
function OXBadge({ correct, unknown }: { correct: boolean; unknown?: boolean }) {
  if (unknown) {
    return (
      <span
        style={{
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 700,
          background: 'var(--bg-hover)',
          color: 'var(--text-muted)',
        }}
      >
        ?
      </span>
    );
  }
  return (
    <span
      style={{
        flexShrink: 0,
        width: 32,
        height: 32,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        background: correct ? 'var(--green-dim)' : 'var(--red-dim)',
        color: correct ? 'var(--green)' : 'var(--red)',
      }}
    >
      {correct ? 'O' : 'X'}
    </span>
  );
}

function AnswerBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'green' | 'red' | 'blue' | 'gray';
}) {
  const colors = {
    green: { bg: 'var(--green-dim)', border: 'var(--green-dim)', text: 'var(--green)' },
    red: { bg: 'var(--red-dim)', border: 'var(--red-dim)', text: 'var(--red)' },
    blue: { bg: 'var(--blue-dim)', border: 'var(--blue-dim)', text: 'var(--blue-light)' },
    gray: { bg: 'var(--bg-hover)', border: 'var(--border)', text: 'var(--text-tertiary)' },
  };
  const c = colors[color];
  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: 'var(--radius-sm)',
        background: c.bg,
        border: `1px solid ${c.border}`,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: c.text, fontWeight: 500, wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  );
}

function formatKST(iso: string): string {
  try {
    const d = new Date(iso);
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${mo}/${day} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}
