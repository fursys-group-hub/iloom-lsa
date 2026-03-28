'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

interface TestScore { id: string; test_date: string; subject: string; score: number; }
interface TestResponse { id: string; session: string; question_id: string; is_correct: boolean; earned_score: number; max_score: number; user_answer: string; }
interface Question { question_id: string; session: string; question_text: string; correct_answer: string; category: string; series: string; detail: string; explanation: string; }

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: 24,
};

export default function MyPage() {
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [scores, setScores] = useState<TestScore[]>([]);
  const [allScores, setAllScores] = useState<TestScore[]>([]);
  const [responses, setResponses] = useState<TestResponse[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) { const p = JSON.parse(auth); setStudentId(p.studentId); setStudentName(p.name); }
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
    } catch { /* ignore */ }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((s, sc) => s + sc.score, 0) / scores.length) * 10) / 10 : 0;

  // 차시별 점수 + 반 평균
  const sessionScores = useMemo(() => {
    return [...scores].sort((a, b) => a.test_date.localeCompare(b.test_date)).map(s => {
      const classScores = allScores.filter(as => as.subject === s.subject);
      const classAvg = classScores.length > 0
        ? Math.round((classScores.reduce((sum, cs) => sum + cs.score, 0) / classScores.length) * 10) / 10 : 0;
      return { ...s, classAvg };
    });
  }, [scores, allScores]);

  // 태그별 약점/강점
  const tagAnalysis = useMemo(() => {
    const tagMap = new Map<string, { correct: number; total: number }>();
    for (const r of responses) {
      const q = questions.find(qq => qq.question_id === r.question_id && qq.session === r.session);
      if (!q) continue;
      const s = q.series && q.series !== '공통' ? q.series : '';
      const d = (q.detail || '').split('(')[0].trim();
      const tag = s ? `${s} > ${d}` : d;
      if (!tagMap.has(tag)) tagMap.set(tag, { correct: 0, total: 0 });
      const t = tagMap.get(tag)!;
      t.total++;
      if (r.is_correct) t.correct++;
    }
    return [...tagMap.entries()]
      .filter(([, v]) => v.total >= 2)
      .map(([label, v]) => ({ label, rate: Math.round((v.correct / v.total) * 100), ...v }))
      .sort((a, b) => a.rate - b.rate);
  }, [responses, questions]);

  const weakTags = tagAnalysis.filter(t => t.rate < 60);
  const midTags = tagAnalysis.filter(t => t.rate >= 60 && t.rate < 80);
  const strongTags = tagAnalysis.filter(t => t.rate >= 80);

  // 차시별 오답
  const sessionWrongs = useMemo(() => {
    const sessions = [...new Set(responses.map(r => r.session))].sort((a, b) =>
      (parseInt(b.replace(/[^0-9]/g, '')) || 0) - (parseInt(a.replace(/[^0-9]/g, '')) || 0)
    );
    return sessions.map(session => {
      const sResp = responses.filter(r => r.session === session);
      const wrongs = sResp.filter(r => !r.is_correct).map(r => ({
        ...r, question: questions.find(q => q.question_id === r.question_id && q.session === r.session),
      }));
      return { session, wrongs, total: sResp.length };
    });
  }, [responses, questions]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* 프로필 */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--blue-dim)', color: 'var(--blue-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700,
            }}>{studentName[0]}</div>
            <div>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{studentName}</h2>
              <p style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 2 }}>일룸 LSA 입문교육</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <StatItem label="평균" value={`${avgScore}점`} color={avgScore >= 80 ? 'var(--green)' : avgScore >= 60 ? 'var(--orange)' : 'var(--red)'} />
            <StatItem label="응시" value={`${scores.length}회`} />
          </div>
        </div>
      </div>

      {/* 학습 피드백 */}
      {tagAnalysis.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>💬 학습 피드백</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {weakTags.length > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)', marginBottom: 10 }}>🚨 이 부분을 더 공부하세요</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {weakTags.slice(0, 5).map(t => (
                    <span key={t.label} style={{ padding: '5px 12px', borderRadius: 'var(--radius-pill)', background: 'rgba(255,69,58,0.1)', color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>
                      {t.label} ({t.correct}/{t.total})
                    </span>
                  ))}
                </div>
              </div>
            )}
            {midTags.length > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--orange)', marginBottom: 10 }}>⚠️ 조금 더 복습하면 좋아요</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {midTags.slice(0, 5).map(t => (
                    <span key={t.label} style={{ padding: '5px 12px', borderRadius: 'var(--radius-pill)', background: 'rgba(255,159,10,0.1)', color: 'var(--orange)', fontSize: 13, fontWeight: 600 }}>
                      {t.label} ({t.correct}/{t.total})
                    </span>
                  ))}
                </div>
              </div>
            )}
            {strongTags.length > 0 && (
              <div style={{ fontSize: 14, color: 'var(--green)' }}>
                ✅ <span style={{ fontWeight: 600 }}>{strongTags.length}개 영역</span> 잘하고 있어요
              </div>
            )}
          </div>
        </div>
      )}

      {/* 차시별 점수 추이 */}
      <div style={card}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>📈 차시별 점수</h3>
        {sessionScores.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessionScores.map(s => {
              const color = s.score >= 80 ? 'var(--green)' : s.score >= 60 ? 'var(--orange)' : 'var(--red)';
              const diff = Math.round((s.score - s.classAvg) * 10) / 10;
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px',
                  borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)',
                }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--blue-light)', minWidth: 60 }}>{s.subject}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.score}%`, borderRadius: 4, background: color }} />
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700, color, minWidth: 55, textAlign: 'right' }}>{s.score}점</span>
                  <span style={{ fontSize: 13, color: diff >= 0 ? 'var(--green)' : 'var(--red)', minWidth: 80, textAlign: 'right' }}>
                    반 평균 {diff >= 0 ? '+' : ''}{diff}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>시험 데이터가 없어요</p>
        )}
      </div>

      {/* 차시별 오답 */}
      <div style={card}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>❌ 오답 모아보기</h3>
        {sessionWrongs.map(({ session, wrongs, total }) => (
          <details key={session} style={{ marginBottom: 8 }}>
            <summary style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 'var(--radius-md)',
              cursor: 'pointer', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
              transition: 'background 0.15s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span>{session}</span>
              <span style={{ fontSize: 14, color: wrongs.length === 0 ? 'var(--green)' : 'var(--red)' }}>
                {wrongs.length === 0 ? '전문항 정답! 🎉' : `오답 ${wrongs.length}/${total}`}
              </span>
            </summary>
            {wrongs.length > 0 && (
              <div style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {wrongs.map(w => (
                  <div key={w.id} style={{
                    padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255,69,58,0.04)', border: '1px solid rgba(255,69,58,0.12)',
                  }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Q{w.question_id} · {w.question?.category} · {w.question?.series}
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.5 }}>
                      {w.question?.question_text}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,69,58,0.08)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>내 답안</div>
                        <div style={{ fontSize: 14, color: 'var(--red)', fontWeight: 500 }}>{w.user_answer || '(미입력)'}</div>
                      </div>
                      <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(10,132,255,0.08)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>정답</div>
                        <div style={{ fontSize: 14, color: 'var(--blue-light)', fontWeight: 500 }}>{w.question?.correct_answer}</div>
                      </div>
                    </div>
                    {w.question?.explanation && (
                      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                        💡 {w.question.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)', margin: 0 }}>{value}</p>
    </div>
  );
}
