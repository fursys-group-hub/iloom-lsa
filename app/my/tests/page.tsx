'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

interface TestScore { id: string; test_date: string; subject: string; score: number; }
interface TestResponse { id: string; session: string; question_id: string; is_correct: boolean; earned_score: number; max_score: number; user_answer: string; submitted_at: string | null; }
interface Question { question_id: string; session: string; question_text: string; correct_answer: string; category: string; series: string; detail: string; options: string; explanation: string; scoring_mode: string; }

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)',
};

export default function MyTestsPage() {
  const [studentId, setStudentId] = useState('');
  const [scores, setScores] = useState<TestScore[]>([]);
  const [allScores, setAllScores] = useState<TestScore[]>([]);
  const [responses, setResponses] = useState<TestResponse[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) setStudentId(JSON.parse(auth).studentId);
  }, []);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const [scRes, allScRes, respRes, qRes] = await Promise.all([
        fetch(`/api/scores?studentId=${studentId}`).then(r => r.json()),
        fetch('/api/scores').then(r => r.json()),
        fetch(`/api/test-responses?studentId=${studentId}`).then(r => r.json()),
        fetch('/api/questions').then(r => r.json()),
      ]);
      setScores(scRes.scores || []);
      setAllScores(allScRes.scores || []);
      setResponses(respRes.responses || []);
      setQuestions(qRes.questions || []);
    } catch { /* */ }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 차시 목록
  const sessions = useMemo(() => {
    return [...new Set(scores.map(s => s.subject))].sort((a, b) =>
      (parseInt(a.replace(/[^0-9]/g, '')) || 0) - (parseInt(b.replace(/[^0-9]/g, '')) || 0)
    );
  }, [scores]);

  // 차시별 통계
  const sessionStats = useMemo(() => {
    return sessions.map(session => {
      const myScore = scores.find(s => s.subject === session);
      const classScores = allScores.filter(s => s.subject === session);
      const classAvg = classScores.length > 0
        ? Math.round((classScores.reduce((sum, s) => sum + s.score, 0) / classScores.length) * 10) / 10 : 0;
      const myResp = responses.filter(r => r.session === session);
      const wrongCount = myResp.filter(r => !r.is_correct).length;
      return {
        session, score: myScore?.score ?? 0, classAvg,
        totalQ: myResp.length, wrongCount,
        submittedAt: myResp[0]?.submitted_at || '',
      };
    });
  }, [sessions, scores, allScores, responses]);

  // 선택된 차시 문항
  const selectedDetails = useMemo(() => {
    if (!selectedSession) return [];
    return responses
      .filter(r => r.session === selectedSession)
      .sort((a, b) => {
        const na = parseInt(a.question_id.split('-')[0]) || 0;
        const nb = parseInt(b.question_id.split('-')[0]) || 0;
        return na !== nb ? na - nb : a.question_id.localeCompare(b.question_id);
      })
      .map(r => ({
        ...r,
        question: questions.find(q => q.question_id === r.question_id && q.session === r.session),
      }));
  }, [selectedSession, responses, questions]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>내 테스트</h2>

      {/* 차시 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {sessionStats.map(stat => {
          const isSelected = selectedSession === stat.session;
          const color = stat.score >= 80 ? 'var(--green)' : stat.score >= 60 ? 'var(--orange)' : 'var(--red)';
          const diff = Math.round((stat.score - stat.classAvg) * 10) / 10;
          return (
            <button
              key={stat.session}
              onClick={() => setSelectedSession(isSelected ? null : stat.session)}
              style={{
                padding: '20px', borderRadius: 'var(--radius-md)', textAlign: 'left',
                border: isSelected ? '2px solid var(--blue)' : '1px solid var(--border)',
                background: isSelected ? 'var(--blue-dim)' : 'var(--bg-surface)',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>{stat.session}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>내 점수</span>
                  <span style={{ color, fontWeight: 700 }}>{stat.score}점</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>반 평균</span>
                  <span style={{ color: diff >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {stat.classAvg}점 ({diff >= 0 ? '+' : ''}{diff})
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>오답</span>
                  <span style={{ color: stat.wrongCount > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {stat.wrongCount === 0 ? '전문항 정답!' : `${stat.wrongCount}/${stat.totalQ}문항`}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택된 차시 상세 */}
      {selectedSession && selectedDetails.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
            {selectedSession} — 문항별 결과
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selectedDetails.map(d => (
              <div key={d.id} style={{
                padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${d.is_correct ? 'var(--border)' : 'var(--red-dim)'}`,
                background: d.is_correct ? 'var(--bg-surface)' : 'var(--red-dim)',
              }}>
                {/* 문제 */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <span style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    background: d.is_correct ? 'var(--green-dim)' : 'var(--red-dim)',
                    color: d.is_correct ? 'var(--green)' : 'var(--red)',
                  }}>
                    {d.is_correct ? 'O' : 'X'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      Q{d.question_id} · {d.question?.scoring_mode} · {d.earned_score}/{d.max_score}점
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--text-primary)', marginTop: 2, lineHeight: 1.5 }}>
                      {d.question?.question_text}
                    </div>
                  </div>
                </div>

                {/* 보기 */}
                {d.question?.options && d.question.options.trim() && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginLeft: 38, marginBottom: 8 }}>
                    {d.question.options.split('\n').filter(o => o.trim()).map((opt, i) => (
                      <div key={i} style={{
                        padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-elevated)', fontSize: 13, color: 'var(--text-tertiary)',
                      }}>
                        {/^\d+\)/.test(opt.trim()) ? opt.trim() : `${i + 1}) ${opt.trim()}`}
                      </div>
                    ))}
                  </div>
                )}

                {/* 답안 비교 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginLeft: 38 }}>
                  <div style={{
                    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                    background: d.is_correct ? 'var(--green-dim)' : 'var(--red-dim)',
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>내 답안</div>
                    <div style={{ fontSize: 14, color: d.is_correct ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                      {d.user_answer || '(미입력)'}
                    </div>
                  </div>
                  <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--blue-dim)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>정답</div>
                    <div style={{ fontSize: 14, color: 'var(--blue-light)', fontWeight: 500 }}>{d.question?.correct_answer}</div>
                  </div>
                </div>

                {/* 해설 */}
                {d.question?.explanation && (
                  <div style={{ marginTop: 8, marginLeft: 38, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                    {d.question.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
