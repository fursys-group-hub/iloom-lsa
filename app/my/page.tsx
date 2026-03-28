'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

interface TestScore { id: string; test_date: string; subject: string; score: number; }
interface TestResponse { id: string; session: string; question_id: string; is_correct: boolean; earned_score: number; max_score: number; user_answer: string; }
interface Question { id: string; session: string; question_id: string; question_text: string; correct_answer: string; category: string; series: string; detail: string; options: string; explanation: string; }
interface Note { id: string; title: string; content: string; tags: string[]; confidence: string | null; created_at: string; }

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: 24,
};

const CONFIDENCE_OPTIONS = [
  { value: 'confident', label: '자신만만', icon: '😎', desc: '고객 앞에서 바로 답변 가능' },
  { value: 'understood', label: '이해완료', icon: '😊', desc: '혼자 복습하면 충분해요' },
  { value: 'half', label: '알쏭달쏭', icon: '🤔', desc: '실물 보면서 한번 더 봐야 할 것 같아요' },
  { value: 'need_help', label: '도움요청', icon: '😵', desc: '추가 설명이 필요해요' },
];

export default function MyPage() {
  const [studentId, setStudentId] = useState<string>('');
  const [studentName, setStudentName] = useState<string>('');
  const [scores, setScores] = useState<TestScore[]>([]);
  const [allScores, setAllScores] = useState<TestScore[]>([]);
  const [responses, setResponses] = useState<TestResponse[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tab, setTab] = useState<'overview' | 'wrong' | 'notes'>('overview');
  const [loading, setLoading] = useState(true);

  // 노트 작성
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [noteConfidence, setNoteConfidence] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) {
      const parsed = JSON.parse(auth);
      setStudentId(parsed.studentId);
      setStudentName(parsed.name);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const [scoresRes, allScoresRes, respRes, qRes, notesRes] = await Promise.all([
        fetch(`/api/test-responses?studentId=${studentId}`).then(r => r.json()),
        fetch('/api/test-responses?all=true').then(r => r.json()),
        fetch(`/api/test-responses?studentId=${studentId}`).then(r => r.json()),
        fetch('/api/questions').then(r => r.json()),
        fetch(`/api/notes?studentId=${studentId}`).then(r => r.json()),
      ]);
      // scores from test_scores table via a simple fetch
      const scData = await fetch(`/api/scores?studentId=${studentId}`).then(r => r.json()).catch(() => ({ scores: [] }));
      const allScData = await fetch('/api/scores').then(r => r.json()).catch(() => ({ scores: [] }));

      setScores(scData.scores || []);
      setAllScores(allScData.scores || []);
      setResponses(respRes.responses || []);
      setQuestions(qRes.questions || []);
      setNotes(notesRes.notes || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 차시별 점수
  const sessionScores = useMemo(() => {
    return scores
      .sort((a, b) => a.test_date.localeCompare(b.test_date))
      .map((s) => {
        const classScores = allScores.filter((as) => as.subject === s.subject);
        const classAvg = classScores.length > 0
          ? Math.round((classScores.reduce((sum, cs) => sum + cs.score, 0) / classScores.length) * 10) / 10
          : 0;
        return { ...s, classAvg };
      });
  }, [scores, allScores]);

  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((s, sc) => s + sc.score, 0) / scores.length) * 10) / 10
    : 0;

  // 태그별 약점
  const weakTags = useMemo(() => {
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
      .sort((a, b) => a.rate - b.rate)
      .filter((t) => t.rate < 80);
  }, [responses, questions]);

  // 오답 목록
  const wrongAnswers = useMemo(() => {
    const sessions = [...new Set(responses.map(r => r.session))].sort((a, b) => {
      return (parseInt(b.replace(/[^0-9]/g, '')) || 0) - (parseInt(a.replace(/[^0-9]/g, '')) || 0);
    });
    return sessions.map(session => {
      const sResp = responses.filter(r => r.session === session);
      const wrongs = sResp.filter(r => !r.is_correct).map(r => {
        const q = questions.find(qq => qq.question_id === r.question_id && qq.session === r.session);
        return { ...r, question: q };
      });
      return { session, wrongs, total: sResp.length };
    });
  }, [responses, questions]);

  // 노트 저장
  const handleSaveNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    setSavingNote(true);
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          title: noteTitle,
          content: noteContent,
          tags: noteTags ? noteTags.split(',').map(t => t.trim()) : [],
          confidence: noteConfidence || null,
        }),
      });
      setShowNoteForm(false);
      setNoteTitle(''); setNoteContent(''); setNoteTags(''); setNoteConfidence('');
      fetchData();
    } catch { /* ignore */ }
    setSavingNote(false);
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* 인사 + 요약 */}
      <div style={card}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
          안녕하세요, {studentName}님! 👋
        </h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>평균 점수</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: avgScore >= 80 ? 'var(--green)' : avgScore >= 60 ? 'var(--orange)' : 'var(--red)' }}>{avgScore}점</div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>응시 차시</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{scores.length}회</div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>교육 노트</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--blue-light)' }}>{notes.length}개</div>
          </div>
        </div>
      </div>

      {/* 학습 피드백 */}
      {weakTags.length > 0 && (
        <div style={{ ...card, background: 'rgba(255, 69, 58, 0.04)', border: '1px solid rgba(255, 69, 58, 0.15)' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--red)', margin: '0 0 12px' }}>
            🚨 이 부분을 더 공부하세요
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {weakTags.slice(0, 8).map(t => (
              <span key={t.label} style={{
                padding: '6px 14px', borderRadius: 'var(--radius-pill)',
                background: t.rate < 60 ? 'rgba(255,69,58,0.1)' : 'rgba(255,159,10,0.1)',
                color: t.rate < 60 ? 'var(--red)' : 'var(--orange)',
                fontSize: 14, fontWeight: 600,
              }}>
                {t.label} ({t.correct}/{t.total})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 8 }}>
        {([['overview', '📈 내 성적'], ['wrong', '❌ 오답 모아보기'], ['notes', '📝 교육 노트']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 20px', borderRadius: 'var(--radius-md)',
              border: tab === key ? 'none' : '1px solid var(--border)',
              background: tab === key ? 'var(--blue)' : 'transparent',
              color: tab === key ? '#fff' : 'var(--text-tertiary)',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 내 성적 */}
      {tab === 'overview' && (
        <div style={card}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>차시별 점수</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessionScores.map((s) => {
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
                  <span style={{ fontSize: 13, color: diff >= 0 ? 'var(--green)' : 'var(--red)', minWidth: 70, textAlign: 'right' }}>
                    반 평균 {diff >= 0 ? '+' : ''}{diff}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 오답 모아보기 */}
      {tab === 'wrong' && (
        <div style={card}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>오답 모아보기</h3>
          {wrongAnswers.map(({ session, wrongs, total }) => (
            <details key={session} style={{ marginBottom: 8 }}>
              <summary style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
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
                      {w.question?.options && w.question.options.trim() && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                          {w.question.options.split('\n').filter(o => o.trim()).map((opt, i) => (
                            <div key={i} style={{
                              padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                              background: 'var(--bg-elevated)', fontSize: 13, color: 'var(--text-tertiary)',
                            }}>
                              {/^\d+\)/.test(opt.trim()) ? opt.trim() : `${i + 1}) ${opt.trim()}`}
                            </div>
                          ))}
                        </div>
                      )}
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
      )}

      {/* 교육 노트 */}
      {tab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 작성 버튼 */}
          <button
            onClick={() => setShowNoteForm(!showNoteForm)}
            style={{
              padding: '12px 20px', borderRadius: 'var(--radius-md)',
              border: showNoteForm ? 'none' : '1px solid var(--border)',
              background: showNoteForm ? 'var(--blue)' : 'transparent',
              color: showNoteForm ? '#fff' : 'var(--text-tertiary)',
              fontSize: 15, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start',
            }}
          >
            {showNoteForm ? '✕ 닫기' : '✏️ 교육일지 작성'}
          </button>

          {/* 작성 폼 */}
          {showNoteForm && (
            <div style={card}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
                ✨ 오늘의 교육일지
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>오늘 한마디</label>
                  <input
                    value={noteTitle} onChange={e => setNoteTitle(e.target.value)}
                    placeholder="오늘의 학습을 한 문장으로!"
                    style={{ ...inputStyle, fontSize: 16, fontWeight: 600 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>오늘의 자신감</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {CONFIDENCE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setNoteConfidence(noteConfidence === opt.value ? '' : opt.value)}
                        style={{
                          padding: '10px 8px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                          border: noteConfidence === opt.value ? '2px solid var(--blue)' : '1px solid var(--border)',
                          background: noteConfidence === opt.value ? 'var(--blue-dim)' : 'var(--bg-elevated)',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>태그</label>
                  <input
                    value={noteTags} onChange={e => setNoteTags(e.target.value)}
                    placeholder="소재, 색상, 규격 (쉼표로 구분)"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>핵심 필기</label>
                  <textarea
                    value={noteContent} onChange={e => setNoteContent(e.target.value)}
                    rows={8} placeholder="오늘 배운 핵심 내용을 정리해보세요..."
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                  />
                </div>
                <button
                  onClick={handleSaveNote} disabled={savingNote || !noteTitle.trim() || !noteContent.trim()}
                  style={{
                    padding: '14px', borderRadius: 'var(--radius-md)', border: 'none',
                    background: !noteTitle.trim() || !noteContent.trim() ? 'var(--bg-elevated)' : 'var(--blue)',
                    color: !noteTitle.trim() || !noteContent.trim() ? 'var(--text-muted)' : '#fff',
                    fontSize: 16, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {savingNote ? '저장 중...' : '저장하기'}
                </button>
              </div>
            </div>
          )}

          {/* 노트 목록 */}
          {notes.length > 0 ? notes.map(note => (
            <div key={note.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <h4 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{note.title}</h4>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {new Date(note.created_at).toLocaleDateString('ko')}
                  </span>
                </div>
                {note.confidence && (
                  <span style={{
                    padding: '4px 12px', borderRadius: 'var(--radius-pill)',
                    background: 'var(--bg-elevated)', fontSize: 13,
                    color: 'var(--text-second)',
                  }}>
                    {CONFIDENCE_OPTIONS.find(o => o.value === note.confidence)?.icon}{' '}
                    {CONFIDENCE_OPTIONS.find(o => o.value === note.confidence)?.label}
                  </span>
                )}
              </div>
              {note.tags && note.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                  {note.tags.map(tag => (
                    <span key={tag} style={{
                      padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                      background: 'var(--blue-dim)', color: 'var(--blue-light)',
                      fontSize: 12, fontWeight: 600,
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {note.content}
              </div>
            </div>
          )) : (
            <div style={{ ...card, textAlign: 'center', padding: 48 }}>
              <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>아직 작성한 교육 노트가 없어요</p>
              <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>위의 "교육일지 작성" 버튼을 눌러보세요!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
  color: 'var(--text-primary)', fontSize: 15, outline: 'none', boxSizing: 'border-box',
};
