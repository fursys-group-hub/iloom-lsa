'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Batch, Student, TestScore } from '@/lib/types';

interface Question {
  id: string;
  session: string;
  question_id: string;
  question_text: string;
  correct_answer: string;
  scoring_mode: string;
  max_score: number;
  category: string;
  series: string;
  detail: string;
  options: string;
  explanation: string;
}

interface TestResponse {
  id: string;
  student_id: string;
  session: string;
  question_id: string;
  test_date: string;
  user_answer: string;
  is_correct: boolean;
  earned_score: number;
  max_score: number;
  scoring_mode: string;
  submitted_at: string | null;
}

type ViewMode = 'scores' | 'questions';

interface Props {
  batches: Batch[];
  students: Student[];
  scores: TestScore[];
}

export default function TestsClient({ batches, students, scores }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('scores');

  // DB 데이터
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<TestResponse[]>([]);
  const [loading, setLoading] = useState(false);

  // 정답 수정
  const [editingQ, setEditingQ] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editMode, setEditMode] = useState('');
  const [editScore, setEditScore] = useState(0);
  const [editExplanation, setEditExplanation] = useState('');
  const [saving, setSaving] = useState(false);

  // 서술형 수동 채점
  const [gradingQ, setGradingQ] = useState<string | null>(null);
  const [gradingChanges, setGradingChanges] = useState<Map<string, boolean>>(new Map());
  const [savingGrade, setSavingGrade] = useState(false);

  const sheetId = batches[0]?.sheet_id || '';
  const batchId = batches[0]?.id || '';

  // 차시 목록
  const sessions = useMemo(() => {
    const sessionSet = new Set(scores.map((s) => s.subject));
    return [...sessionSet].sort((a, b) => {
      const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
      const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
      return numA - numB;
    });
  }, [scores]);

  // 차시별 통계
  const sessionStats = useMemo(() => {
    return sessions.map((session) => {
      const ss = scores.filter((s) => s.subject === session);
      const avg = ss.length > 0
        ? Math.round((ss.reduce((sum, s) => sum + s.score, 0) / ss.length) * 10) / 10 : 0;
      const max = ss.length > 0 ? Math.round(Math.max(...ss.map((s) => s.score)) * 10) / 10 : 0;
      const min = ss.length > 0 ? Math.round(Math.min(...ss.map((s) => s.score)) * 10) / 10 : 0;
      return { session, avg, max, min, count: ss.length };
    });
  }, [sessions, scores]);

  // 차시 선택 시 데이터 가져오기
  const fetchSessionData = useCallback(async (session: string) => {
    if (!batchId) return;
    setLoading(true);
    try {
      const [qRes, rRes] = await Promise.all([
        fetch(`/api/questions?batchId=${batchId}&session=${encodeURIComponent(session)}`),
        fetch(`/api/test-responses?batchId=${batchId}&session=${encodeURIComponent(session)}`),
      ]);
      const qData = await qRes.json();
      const rData = await rRes.json();
      setQuestions(qData.questions || []);
      setResponses(rData.responses || []);
    } catch {
      setQuestions([]);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (selectedSession) {
      fetchSessionData(selectedSession);
      setSelectedStudent(null);
      setEditingQ(null);
    }
  }, [selectedSession, fetchSessionData]);

  // 학생별 성적 (responses 기반) — 미응시 포함
  const selectedScores = useMemo(() => {
    if (!selectedSession) return [];
    const tested = students
      .map((student) => {
        const score = scores.find(
          (s) => s.student_id === student.id && s.subject === selectedSession
        );
        const studentResp = responses.filter((r) => r.student_id === student.id);
        const wrongCount = studentResp.filter((r) => !r.is_correct).length;
        const totalCount = studentResp.length;
        const submittedAt = studentResp[0]?.submitted_at || '';
        const took = score !== undefined || totalCount > 0;
        return { student, score: score?.score ?? null, wrongCount, totalCount, submittedAt, took };
      });
    // 응시자 점수순 + 미응시자 이름순
    const tookExam = tested.filter(s => s.took).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const notTook = tested.filter(s => !s.took).sort((a, b) => a.student.name.localeCompare(b.student.name));
    return [...tookExam, ...notTook];
  }, [selectedSession, students, scores, responses]);

  // 서술형 수동 채점 저장
  const handleSaveGrading = async (questionId: string) => {
    if (gradingChanges.size === 0) { setGradingQ(null); return; }
    setSavingGrade(true);
    try {
      const qResp = responses.filter((r) => r.question_id === questionId);
      const payload = [...gradingChanges.entries()].map(([respId, isCorrect]) => {
        const resp = qResp.find((r) => r.id === respId);
        return {
          id: respId,
          is_correct: isCorrect,
          max_score: resp?.max_score ?? 0,
          student_id: resp?.student_id ?? '',
          session: resp?.session ?? '',
          test_date: resp?.test_date ?? '',
        };
      });
      const res = await fetch('/api/test-responses/grade', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses: payload }),
      });
      const data = await res.json();
      setSyncResult(data.message);
      setGradingQ(null);
      setGradingChanges(new Map());
      if (res.ok) setTimeout(() => window.location.reload(), 1500);
    } catch {
      setSyncResult('채점 저장 실패');
    } finally {
      setSavingGrade(false);
    }
  };

  // 정답 수정 저장
  const handleSaveAnswer = async (questionDbId: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: questionDbId, correct_answer: editValue, scoring_mode: editMode, max_score: editScore, explanation: editExplanation }),
      });
      const data = await res.json();
      setSyncResult(data.message);
      if (res.ok) {
        setEditingQ(null);
        // 데이터 새로고침
        if (selectedSession) fetchSessionData(selectedSession);
        // 점수도 새로고침 (페이지 리로드)
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      setSyncResult('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  // 동기화
  const handleSync = async (date?: string) => {
    if (!sheetId) {
      setSyncResult('기수에 Google Sheet ID가 설정되지 않았어요.');
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, date }),
      });
      const data = await res.json();
      setSyncResult(data.message);
      if (res.ok) setTimeout(() => window.location.reload(), 1500);
    } catch {
      setSyncResult('동기화 중 오류가 발생했어요.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          📝 테스트
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={`/api/export-tests?batchId=${batchId}`}
            style={{
              padding: '10px 20px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s ease',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
            }}
          >
            📥 Excel 다운로드
          </a>
          <button
            onClick={() => { handleSync('today'); }}
            disabled={syncing}
            style={{
              padding: '10px 20px', borderRadius: 'var(--radius-md)',
              border: syncing ? 'none' : '1px solid var(--border)',
              background: syncing ? 'var(--bg-elevated)' : 'transparent',
              color: syncing ? 'var(--text-muted)' : 'var(--text-tertiary)',
              fontSize: 14, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {syncing ? '⏳ 동기화 중...' : '🔄 오늘 시험 동기화'}
          </button>
        </div>
      </div>

      {/* 알림 */}
      {syncResult && (
        <div style={{
          padding: '14px 20px', borderRadius: 'var(--radius-md)',
          background: syncResult.includes('완료') ? 'rgba(48, 209, 88, 0.1)' : 'rgba(255, 69, 58, 0.1)',
          border: `1px solid ${syncResult.includes('완료') ? 'rgba(48, 209, 88, 0.3)' : 'rgba(255, 69, 58, 0.3)'}`,
          color: syncResult.includes('완료') ? 'var(--green)' : 'var(--red)',
          fontSize: 15,
        }}>
          {syncResult}
        </div>
      )}

      {/* 차시 카드 */}
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
          차시별 성적 현황
        </h3>
        {sessions.length === 0 ? (
          <div style={{
            padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 16,
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          }}>
            아직 시험 데이터가 없어요. 위의 동기화 버튼을 눌러주세요.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {sessionStats.map((stat) => (
              <button
                key={stat.session}
                onClick={() => setSelectedSession(selectedSession === stat.session ? null : stat.session)}
                style={{
                  padding: '20px', borderRadius: 'var(--radius-md)',
                  border: selectedSession === stat.session ? '2px solid var(--blue)' : '1px solid var(--border)',
                  background: selectedSession === stat.session ? 'var(--blue-dim)' : 'var(--bg-surface)',
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>{stat.session}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Row label="평균" value={`${stat.avg}점`} color="var(--blue-light)" />
                  <Row label="최고/최저" value={`${stat.max} / ${stat.min}`} />
                  <Row label="응시" value={`${stat.count}/${students.length}명`} color={stat.count < students.length ? 'var(--orange)' : undefined} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 차시 선택 시 */}
      {selectedSession && (
        <div>
          {/* 보기 모드 토글 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0, marginRight: 4 }}>
              {selectedSession}
            </h3>
            {/* 시험 날짜 표시 */}
            {(() => {
              const sessionDates = [...new Set(
                responses.filter((r) => r.submitted_at).map((r) => r.submitted_at!.split(' ')[0])
              )].sort();
              return sessionDates.length > 0 ? (
                <span style={{ fontSize: 14, color: 'var(--text-muted)', marginRight: 12 }}>
                  ({sessionDates.map(formatDisplayDate).join(', ')})
                </span>
              ) : null;
            })()}
            {(['scores', 'questions'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                  border: viewMode === mode ? 'none' : '1px solid var(--border)',
                  background: viewMode === mode ? 'var(--blue)' : 'transparent',
                  color: viewMode === mode ? '#fff' : 'var(--text-tertiary)',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                {mode === 'scores' ? '학생별 성적' : '문제은행'}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{
              padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 15,
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
            }}>
              ⏳ 데이터 불러오는 중...
            </div>
          ) : viewMode === 'scores' ? (
            /* ========== 학생별 성적 ========== */
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', overflow: 'hidden',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 120px 90px 70px 70px', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                {['순위', '이름', '제출 시간', '점수', '정답', '오답'].map((h) => (
                  <div key={h} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textAlign: h === '이름' ? 'left' : 'center' }}>{h}</div>
                ))}
              </div>
              {selectedScores.map((row, idx) => {
                const scoreVal = row.score ?? 0;
                const scoreColor = scoreVal >= 90 ? 'var(--green)' : scoreVal >= 70 ? 'var(--blue-light)' : scoreVal >= 60 ? 'var(--orange)' : 'var(--red)';
                const isSelected = selectedStudent === row.student.id;
                const rowResp = isSelected
                  ? responses.filter((r) => r.student_id === row.student.id).sort((a, b) => {
                      const na = parseInt(a.question_id.split('-')[0]) || 0;
                      const nb = parseInt(b.question_id.split('-')[0]) || 0;
                      return na !== nb ? na - nb : a.question_id.localeCompare(b.question_id);
                    })
                  : [];

                // 미응시
                if (!row.took) {
                  return (
                    <div key={row.student.id} style={{
                      display: 'grid', gridTemplateColumns: '50px 1fr 120px 90px 70px 70px',
                      alignItems: 'center', padding: '14px 20px',
                      borderBottom: '1px solid var(--border)', opacity: 0.5,
                    }}>
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>-</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={row.student.name} />
                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{row.student.name}</span>
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: '2px 10px',
                          borderRadius: 'var(--radius-pill)', background: 'rgba(255,69,58,0.1)', color: 'var(--red)',
                        }}>미응시</span>
                      </div>
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>-</div>
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>-</div>
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>-</div>
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>-</div>
                    </div>
                  );
                }

                return (
                  <div key={row.student.id}>
                    <div
                      onClick={() => setSelectedStudent(isSelected ? null : row.student.id)}
                      style={{
                        display: 'grid', gridTemplateColumns: '50px 1fr 120px 90px 70px 70px',
                        alignItems: 'center', padding: '14px 20px',
                        borderBottom: '1px solid var(--border)', cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        background: isSelected ? 'var(--blue-dim)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>{idx + 1}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={row.student.name} />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.student.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{isSelected ? '▲' : '▼'}</span>
                      </div>
                      <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                        {row.submittedAt ? formatTime(row.submittedAt) : '-'}
                      </div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: scoreColor, fontSize: 16 }}>{scoreVal}점</div>
                      <div style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 600 }}>{row.totalCount - row.wrongCount}개</div>
                      <div style={{ textAlign: 'center', color: row.wrongCount > 0 ? 'var(--red)' : 'var(--text-muted)', fontWeight: 600 }}>{row.wrongCount}개</div>
                    </div>

                    {isSelected && rowResp.length > 0 && (
                      <div style={{ padding: '16px 20px 20px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-second)', marginBottom: 12 }}>
                          {row.student.name}의 문항별 답안 ({rowResp.length}문항)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {rowResp.map((r) => {
                            const q = questions.find((qq) => qq.question_id === r.question_id);
                            return (
                              <div key={r.id} style={{
                                padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                                border: `1px solid ${r.is_correct ? 'var(--border)' : 'rgba(255, 69, 58, 0.3)'}`,
                                background: r.is_correct ? 'var(--bg-surface)' : 'rgba(255, 69, 58, 0.05)',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                                  <OXBadge correct={r.is_correct} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                      Q{r.question_id} · {r.scoring_mode} · {r.earned_score}/{r.max_score}점
                                    </span>
                                    <div style={{ fontSize: 14, color: 'var(--text-primary)', marginTop: 2, lineHeight: 1.5 }}>
                                      {q?.question_text || ''}
                                    </div>
                                  </div>
                                </div>
                                {/* 보기 (객관식인 경우) */}
                                {q?.options && q.options.trim() && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginLeft: 38, marginBottom: 6 }}>
                                    {q.options.split('\n').filter((o) => o.trim()).map((opt, oi) => {
                                      const text = opt.trim().replace(/^\d+\)\s*/, '');
                                      const hasNum = /^\d+\)/.test(opt.trim());
                                      return (
                                        <div key={oi} style={{
                                          padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                          fontSize: 13, color: 'var(--text-tertiary)',
                                        }}>
                                          {hasNum ? opt.trim() : `${oi + 1}) ${text}`}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginLeft: 38 }}>
                                  <AnswerBox
                                    label="학생 답안"
                                    value={r.user_answer || '(미입력)'}
                                    color={r.is_correct ? 'green' : 'red'}
                                  />
                                  <AnswerBox
                                    label="정답"
                                    value={q?.correct_answer || ''}
                                    color="blue"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ========== 문제은행 ========== */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {questions.length === 0 ? (
                <div style={{
                  padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 16,
                  background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
                }}>
                  문제 데이터가 없어요. 동기화를 먼저 해주세요.
                </div>
              ) : (() => {
                // 문제를 대문항 번호로 그룹핑
                const grouped = new Map<number, Question[]>();
                for (const q of questions) {
                  const mainNum = parseInt(q.question_id.split('-')[0]) || 0;
                  if (!grouped.has(mainNum)) grouped.set(mainNum, []);
                  grouped.get(mainNum)!.push(q);
                }
                // 소문항 내부 정렬 (자연수)
                for (const [, subs] of grouped) {
                  subs.sort((a, b) => naturalSort(a.question_id, b.question_id));
                }
                // 그룹별 평균 정답률 계산 + 정답률 낮은 순 정렬
                const groupEntries = [...grouped.entries()].map(([mainNum, subs]) => {
                  const allResp = subs.flatMap((q) => responses.filter((r) => r.question_id === q.question_id));
                  const avgRate = allResp.length > 0
                    ? allResp.filter((r) => r.is_correct).length / allResp.length : 1;
                  return { mainNum, subs, avgRate };
                }).sort((a, b) => a.avgRate - b.avgRate);

                return groupEntries.map(({ mainNum, subs }) => {
                  const hasSubs = subs.length > 1 || subs[0]?.question_id.includes('-');
                  // 그룹 전체 정답률
                  const allResp = subs.flatMap((q) => responses.filter((r) => r.question_id === q.question_id));
                  const groupCorrect = allResp.filter((r) => r.is_correct).length;
                  const groupRate = allResp.length > 0 ? Math.round((groupCorrect / allResp.length) * 100) : 0;
                  const groupColor = groupRate >= 80 ? 'var(--green)' : groupRate >= 50 ? 'var(--orange)' : 'var(--red)';

                  return (
                    <div key={mainNum} style={{
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      overflow: 'hidden',
                    }}>
                      {/* 대문항 헤더 */}
                      <div style={{ padding: '16px 20px', borderBottom: hasSubs ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <span style={{
                            padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                            background: 'var(--blue-dim)', color: 'var(--blue-light)',
                            fontSize: 14, fontWeight: 700,
                          }}>
                            Q{mainNum}
                          </span>
                          {subs[0]?.category && (
                            <span style={{ fontSize: 13, color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)' }}>
                              {subs[0].category}
                            </span>
                          )}
                          {subs[0]?.series && subs[0].series !== '공통' && (
                            <span style={{ fontSize: 13, color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)' }}>
                              {subs[0].series}
                            </span>
                          )}
                          {hasSubs && (
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                              소문항 {subs.length}개
                            </span>
                          )}
                          {allResp.length > 0 && (
                            <span style={{ fontSize: 13, fontWeight: 600, color: groupColor, marginLeft: 'auto' }}>
                              정답률 {groupRate}%
                            </span>
                          )}
                        </div>
                        {/* 그룹 정답률 바 */}
                        {allResp.length > 0 && (
                          <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 3, width: `${groupRate}%`,
                              background: groupColor, transition: 'width 0.3s ease',
                            }} />
                          </div>
                        )}
                      </div>

                      {/* 소문항들 */}
                      {subs.map((q, subIdx) => {
                        const isEditing = editingQ === q.id;
                        const qResp = responses.filter((r) => r.question_id === q.question_id);
                        const correctCount = qResp.filter((r) => r.is_correct).length;
                        const correctRate = qResp.length > 0 ? Math.round((correctCount / qResp.length) * 100) : 0;
                        const subColor = correctRate >= 80 ? 'var(--green)' : correctRate >= 50 ? 'var(--orange)' : 'var(--red)';

                        return (
                          <div key={q.id} style={{
                            padding: '14px 20px 14px 32px',
                            borderBottom: subIdx < subs.length - 1 ? '1px solid var(--border)' : 'none',
                          }}>
                            {/* 소문항 문제 */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                              {hasSubs ? (
                                <span style={{
                                  flexShrink: 0, fontSize: 13, fontWeight: 600,
                                  color: 'var(--text-muted)', minWidth: 40,
                                }}>
                                  {q.question_id.includes('-') ? q.question_id.split('-')[1] + ')' : ''}
                                </span>
                              ) : null}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.5 }}>
                                  {q.question_text}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                  <span>{q.scoring_mode}</span>
                                  <span>배점: {q.max_score}점</span>
                                  {qResp.length > 0 && (
                                    <span style={{ color: subColor, fontWeight: 600 }}>
                                      정답률 {correctRate}% ({correctCount}/{qResp.length})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* 보기 */}
                            {q.options && q.options.trim() && (
                              <div style={{ marginLeft: hasSubs ? 50 : 0, marginBottom: 8 }}>
                                <div style={{
                                  display: 'flex', flexDirection: 'column', gap: 4,
                                }}>
                                  {q.options.split('\n').filter((o) => o.trim()).map((opt, oi) => {
                                    const text = opt.trim().replace(/^\d+\)\s*/, '');
                                    const hasNum = /^\d+\)/.test(opt.trim());
                                    return (
                                      <div key={oi} style={{
                                        padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                        fontSize: 14, color: 'var(--text-second)',
                                      }}>
                                        {hasNum ? opt.trim() : `${oi + 1}) ${text}`}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 정답 영역 */}
                            <div style={{ marginLeft: hasSubs ? 50 : 0 }}>
                              {isEditing ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {/* 채점모드 + 배점 */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>채점모드:</span>
                                    <select
                                      value={editMode}
                                      onChange={(e) => setEditMode(e.target.value)}
                                      style={{
                                        padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                        border: '2px solid var(--purple)', background: 'var(--bg-elevated)',
                                        color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {SCORING_MODES.map((m) => (
                                        <option key={m} value={m}>{m}</option>
                                      ))}
                                    </select>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>배점:</span>
                                    <input
                                      type="number"
                                      value={editScore}
                                      onChange={(e) => setEditScore(parseFloat(e.target.value) || 0)}
                                      min={0}
                                      step={1}
                                      style={{
                                        width: 70, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                        border: '2px solid var(--orange)', background: 'var(--bg-elevated)',
                                        color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                                        textAlign: 'center',
                                      }}
                                    />
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>점</span>
                                  </div>
                                  {/* 정답 */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>정답:</span>
                                    <input
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      autoFocus
                                      placeholder="여러 정답은 | 로 구분"
                                      style={{
                                        flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                        border: '2px solid var(--blue)', background: 'var(--bg-elevated)',
                                        color: 'var(--text-primary)', fontSize: 15, outline: 'none',
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveAnswer(q.id);
                                        if (e.key === 'Escape') setEditingQ(null);
                                      }}
                                    />
                                  </div>
                                  {/* 해설 */}
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0, marginTop: 10 }}>해설:</span>
                                    <textarea
                                      value={editExplanation}
                                      onChange={(e) => setEditExplanation(e.target.value)}
                                      rows={2}
                                      placeholder="해설을 입력하세요"
                                      style={{
                                        flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                                        color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                                        resize: 'vertical', lineHeight: 1.5,
                                      }}
                                    />
                                  </div>
                                  {/* 버튼 */}
                                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <button
                                      onClick={() => setEditingQ(null)}
                                      style={{
                                        padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border)', background: 'transparent',
                                        color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
                                      }}
                                    >
                                      취소
                                    </button>
                                    <button
                                      onClick={() => handleSaveAnswer(q.id)}
                                      disabled={saving}
                                      style={{
                                        padding: '10px 18px', borderRadius: 'var(--radius-sm)',
                                        border: 'none', background: 'var(--blue)', color: '#fff',
                                        fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {saving ? '저장 중...' : '저장 + 재채점'}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  onClick={() => { setEditingQ(q.id); setEditValue(q.correct_answer); setEditMode(q.scoring_mode); setEditScore(q.max_score); setEditExplanation(q.explanation || ''); }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(10, 132, 255, 0.08)', border: '1px solid rgba(10, 132, 255, 0.2)',
                                    cursor: 'pointer', transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--blue)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(10, 132, 255, 0.2)'; }}
                                >
                                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>정답:</span>
                                  <span style={{ fontSize: 15, color: 'var(--blue-light)', fontWeight: 600 }}>{q.correct_answer}</span>
                                  <span style={{
                                    fontSize: 12, color: 'var(--purple)', padding: '2px 8px',
                                    borderRadius: 'var(--radius-pill)', background: 'rgba(191, 90, 242, 0.1)',
                                    marginLeft: 8,
                                  }}>{q.scoring_mode}</span>
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>클릭하여 수정</span>
                                </div>
                              )}
                            </div>

                            {/* 해설 */}
                            {q.explanation && (
                              <div style={{ marginLeft: hasSubs ? 50 : 0, marginTop: 8, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                                💡 {q.explanation}
                              </div>
                            )}

                            {/* 서술형 수동 채점 */}
                            {q.scoring_mode === '주관식_서술' && qResp.length > 0 && (
                              <div style={{ marginLeft: hasSubs ? 50 : 0, marginTop: 10 }}>
                                {gradingQ === q.question_id ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-second)' }}>
                                        학생 답안 채점 ({qResp.length}명)
                                      </span>
                                      <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                          onClick={() => { setGradingQ(null); setGradingChanges(new Map()); }}
                                          style={{
                                            padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                                            border: '1px solid var(--border)', background: 'transparent',
                                            color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                                          }}
                                        >취소</button>
                                        <button
                                          onClick={() => handleSaveGrading(q.question_id)}
                                          disabled={savingGrade || gradingChanges.size === 0}
                                          style={{
                                            padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                                            border: 'none', background: gradingChanges.size > 0 ? 'var(--blue)' : 'var(--bg-elevated)',
                                            color: gradingChanges.size > 0 ? '#fff' : 'var(--text-muted)',
                                            fontSize: 13, fontWeight: 600, cursor: gradingChanges.size > 0 ? 'pointer' : 'default',
                                          }}
                                        >{savingGrade ? '저장 중...' : `저장 (${gradingChanges.size}건 변경)`}</button>
                                      </div>
                                    </div>
                                    {qResp.map((r) => {
                                      const student = students.find((s) => s.id === r.student_id);
                                      const changed = gradingChanges.has(r.id);
                                      const currentCorrect = changed ? gradingChanges.get(r.id)! : r.is_correct;
                                      return (
                                        <div key={r.id} style={{
                                          padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                          background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                          display: 'flex', alignItems: 'flex-start', gap: 10,
                                        }}>
                                          {/* O/X 토글 */}
                                          <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginTop: 2 }}>
                                            <button
                                              onClick={() => {
                                                const m = new Map(gradingChanges);
                                                if (r.is_correct === true) m.delete(r.id); else m.set(r.id, true);
                                                setGradingChanges(m);
                                              }}
                                              style={{
                                                width: 32, height: 32, borderRadius: '50%', border: 'none',
                                                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                                background: currentCorrect ? 'var(--green)' : 'rgba(48, 209, 88, 0.1)',
                                                color: currentCorrect ? '#fff' : 'var(--green)',
                                                transition: 'all 0.15s ease',
                                              }}
                                            >O</button>
                                            <button
                                              onClick={() => {
                                                const m = new Map(gradingChanges);
                                                if (r.is_correct === false) m.delete(r.id); else m.set(r.id, false);
                                                setGradingChanges(m);
                                              }}
                                              style={{
                                                width: 32, height: 32, borderRadius: '50%', border: 'none',
                                                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                                background: !currentCorrect ? 'var(--red)' : 'rgba(255, 69, 58, 0.1)',
                                                color: !currentCorrect ? '#fff' : 'var(--red)',
                                                transition: 'all 0.15s ease',
                                              }}
                                            >X</button>
                                          </div>
                                          {/* 이름 + 답안 */}
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                                              {student?.name || '?'}
                                              {changed && <span style={{ color: 'var(--orange)', marginLeft: 6, fontSize: 12 }}>변경됨</span>}
                                            </div>
                                            <div style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                                              {r.user_answer || '(미입력)'}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setGradingQ(q.question_id); setGradingChanges(new Map()); }}
                                    style={{
                                      padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                                      border: '1px solid var(--orange)', background: 'rgba(255, 159, 10, 0.08)',
                                      color: 'var(--orange)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    ✏️ 서술형 채점하기 ({qResp.filter((r) => !r.is_correct).length}명 미채점/오답)
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 채점모드 목록
const SCORING_MODES = [
  '주관식_단답',
  '주관식_서술',
  '주관식_허용답',
  '주관식_순서무관',
  '주관식_순위차등',
  '객관식_단일',
  '객관식_복수',
  'OX',
];

// 날짜 표시: "2026-03-27" → "3월 27일"
function formatDisplayDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  return `${parseInt(parts[1])}월 ${parseInt(parts[2])}일`;
}

// 시간 표시: "2026-03-27 8:41:59" → "8:41"
function formatTime(timestamp: string): string {
  const timePart = timestamp.split(' ')[1];
  if (!timePart) return '';
  const [h, m] = timePart.split(':');
  return `${h}:${m}`;
}

// 자연수 정렬: "1-2" < "1-10" < "2-1"
function naturalSort(a: string, b: string): number {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

// 작은 컴포넌트들
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: color || 'var(--text-second)', fontWeight: color ? 600 : 400 }}>{value}</span>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: 'var(--blue-dim)', color: 'var(--blue-light)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 700, flexShrink: 0,
    }}>
      {name[0]}
    </div>
  );
}

function OXBadge({ correct }: { correct: boolean }) {
  return (
    <span style={{
      flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700,
      background: correct ? 'rgba(48, 209, 88, 0.15)' : 'rgba(255, 69, 58, 0.15)',
      color: correct ? 'var(--green)' : 'var(--red)',
    }}>
      {correct ? 'O' : 'X'}
    </span>
  );
}

function AnswerBox({ label, value, color }: { label: string; value: string; color: 'green' | 'red' | 'blue' }) {
  const colors = {
    green: { bg: 'rgba(48, 209, 88, 0.08)', border: 'rgba(48, 209, 88, 0.2)', text: 'var(--green)' },
    red: { bg: 'rgba(255, 69, 58, 0.08)', border: 'rgba(255, 69, 58, 0.2)', text: 'var(--red)' },
    blue: { bg: 'rgba(10, 132, 255, 0.08)', border: 'rgba(10, 132, 255, 0.2)', text: 'var(--blue-light)' },
  };
  const c = colors[color];
  return (
    <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: c.bg, border: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: c.text, fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}
