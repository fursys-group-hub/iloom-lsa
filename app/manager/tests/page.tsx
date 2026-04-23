'use client';

import { useEffect, useState, useMemo } from 'react';
import type { WeekBlock, SessionSummary, AdvancedQuestion } from '@/lib/types';
import { parseUserAnswers, gradeAnswer } from '@/lib/advanced-grading';
import { SessionDetailModal } from '@/components/AdvancedScoreSection';

interface StudentItem {
  id: string;
  name: string;
  store_location: string | null;
  is_dropped?: boolean;
}

interface OverviewResponse {
  pass_score: number;
  weeks: Record<number, WeekBlock>;
  class_avg: Record<string, { avg: number; count: number }>;
  questions_by_key: Record<string, AdvancedQuestion[]>;
}

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

const WEEKS = [1, 2, 3, 4, 5, 6];
const SESSIONS = [1, 2];

function computeWrong(summary: SessionSummary, questions: AdvancedQuestion[]): { wrong: number; total: number } {
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

export default function ManagerTestsPage() {
  const [storeName, setStoreName] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [openKey, setOpenKey] = useState<{ week: number; session: number } | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('iloom-auth');
    if (raw) {
      try {
        const p = JSON.parse(raw);
        setStoreName(p.storeName || null);
      } catch { /* ignore */ }
    }
    fetch('/api/students')
      .then(r => r.json())
      .then(data => setStudents(data))
      .finally(() => setLoading(false));
  }, []);

  const myStudents = useMemo(
    () => students.filter(s => !s.is_dropped && storeName && s.store_location === storeName),
    [students, storeName]
  );

  // 첫 학생 자동 선택
  useEffect(() => {
    if (!selectedStudentId && myStudents.length > 0) {
      setSelectedStudentId(myStudents[0].id);
    }
  }, [myStudents, selectedStudentId]);

  // 선택된 학생 데이터 fetch
  useEffect(() => {
    if (!selectedStudentId) return;
    setDataLoading(true);
    setData(null);
    fetch(`/api/advanced-student-overview?student_id=${selectedStudentId}`)
      .then(r => r.json())
      .then(json => setData(json))
      .catch(() => setData(null))
      .finally(() => setDataLoading(false));
  }, [selectedStudentId]);

  const passScore = data?.pass_score ?? 80;

  const cards = useMemo<CardData[]>(() => {
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
          week: w, session: s, mine,
          passed: summary?.passed ?? false,
          passAttempt: summary?.pass_attempt ?? null,
          attemptCount: summary?.attempt_count ?? 0,
          classAvg: classRow?.avg ?? null,
          classCount: classRow?.count ?? 0,
          wrong, total,
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

  const selectedStudent = myStudents.find(s => s.id === selectedStudentId);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', minHeight: 400 }}>
        <p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>심화테스트</h1>
      </div>

      {/* 교육생 탭 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
        {myStudents.map((s, i) => (
          <button key={s.id} onClick={() => setSelectedStudentId(s.id)} style={{
            padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,
            background: 'transparent',
            color: selectedStudentId === s.id ? 'var(--text-primary)' : 'var(--text-muted)',
            border: 'none',
            borderBottom: selectedStudentId === s.id ? '2px solid var(--blue)' : '2px solid transparent',
            fontSize: 15, fontWeight: selectedStudentId === s.id ? 600 : 400,
            cursor: 'pointer', transition: 'all 0.15s ease', marginBottom: -1,
          }}>{s.name}</button>
        ))}
      </div>

      {/* 카드 그리드 */}
      {dataLoading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          불러오는 중...
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {cards.map(c => (
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
      )}

      {/* 상세 모달 */}
      {openKey && openSummary && selectedStudent && (
        <SessionDetailModal
          week={openKey.week}
          session={openKey.session}
          studentName={selectedStudent.name}
          summary={openSummary}
          passScore={passScore}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
}

function TestCard({ data: c, passScore, onClick }: {
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

  const diff = c.mine !== null && c.classAvg !== null
    ? Math.round((c.mine - c.classAvg) * 10) / 10
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasAttempt}
      style={{
        padding: '20px', borderRadius: 'var(--radius-md)', textAlign: 'left',
        border: '1px solid var(--border)', background: 'var(--bg-surface)',
        cursor: hasAttempt ? 'pointer' : 'default',
        opacity: hasAttempt ? 1 : 0.7,
        transition: 'all 0.15s ease', fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
          {c.week}주차 {c.session}차시
        </span>
        {hasAttempt && (
          <span style={{
            padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
            background: c.passed ? 'var(--green-dim)' : 'var(--orange-dim)',
            color: c.passed ? 'var(--green)' : 'var(--orange)', whiteSpace: 'nowrap',
          }}>
            {c.passed ? `달성 · ${c.passAttempt}회` : `미달성 · ${c.attemptCount}회`}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ color: 'var(--text-muted)' }}>점수</span>
          {hasAttempt
            ? <span style={{ color: mineColor, fontWeight: 700 }}>{c.mine}점</span>
            : <span style={{ color: 'var(--text-muted)' }}>미응시</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ color: 'var(--text-muted)' }}>반 평균</span>
          {c.classAvg !== null && c.classCount > 0
            ? <span style={{ color: diff !== null && diff >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {c.classAvg}점{diff !== null && hasAttempt && ` (${diff >= 0 ? '+' : ''}${diff})`}
              </span>
            : <span style={{ color: 'var(--text-muted)' }}>—</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ color: 'var(--text-muted)' }}>오답</span>
          {c.total > 0
            ? hasAttempt
              ? <span style={{ color: c.wrong > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {c.wrong === 0 ? '전문항 정답!' : `${c.wrong}/${c.total}문항`}
                </span>
              : <span style={{ color: 'var(--text-muted)' }}>{c.total}문항</span>
            : <span style={{ color: 'var(--text-muted)' }}>—</span>}
        </div>
      </div>
    </button>
  );
}
