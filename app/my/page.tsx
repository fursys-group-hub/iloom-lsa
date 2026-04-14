'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import ScoreTrendChart from '@/components/charts/ScoreTrendChart';
import { getDayType, DAY_TYPE_CONFIG } from '@/lib/schedule';
import type { ScheduleMap } from '@/lib/schedule';

interface TestScore { id: string; test_date: string; subject: string; score: number; }
interface TestResponse { id: string; session: string; question_id: string; is_correct: boolean; earned_score: number; max_score: number; user_answer: string; }
interface Question { question_id: string; session: string; question_text: string; correct_answer: string; category: string; series: string; detail: string; explanation: string; }
interface Announcement { id: string; title: string; content: string; priority: 'normal' | 'important' | 'urgent'; created_at: string; }

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)',
};

export default function MyPage() {
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [scores, setScores] = useState<TestScore[]>([]);
  const [allScores, setAllScores] = useState<TestScore[]>([]);
  const [responses, setResponses] = useState<TestResponse[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchId, setBatchId] = useState('');
  const [schedule, setSchedule] = useState<ScheduleMap | null>(null);
  const [announcePopup, setAnnouncePopup] = useState<Announcement[]>([]);
  const [popupIndex, setPopupIndex] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [showAttendanceAlert, setShowAttendanceAlert] = useState(false);
  const [isArchived, setIsArchived] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) {
      const p = JSON.parse(auth);
      setStudentId(p.studentId);
      setStudentName(p.name);
      if (p.batchId) {
        setBatchId(p.batchId);
        fetch('/api/batches').then(r => r.json()).then(batches => {
          const batch = batches.find((b: { id: string }) => b.id === p.batchId);
          if (batch?.schedule) setSchedule(batch.schedule);
        }).catch(() => {});
      }
      if (p.isArchived) setIsArchived(true);
    }
  }, []);

  // 출결 알림 체크 (미출근이면 알림 표시, 30분마다 재확인)
  useEffect(() => {
    if (!studentId) return;

    const checkAttendance = () => {
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
      fetch(`/api/attendance?studentId=${studentId}`)
        .then(r => r.json())
        .then((data) => {
          if (!Array.isArray(data)) return;
          const todayRecord = data.find((d: { date: string }) => d.date === today);
          if (!todayRecord || todayRecord.status === 'absent') {
            setShowAttendanceAlert(true);
          } else {
            setShowAttendanceAlert(false);
          }
        })
        .catch(() => {});
    };

    checkAttendance();
    const interval = setInterval(checkAttendance, 30 * 60 * 1000); // 30분마다 재확인
    return () => clearInterval(interval);
  }, [studentId]);

  // 로그인 시 새 공지 팝업
  useEffect(() => {
    if (!batchId) return;
    const lastSeen = localStorage.getItem('iloom-announce-seen') || '';
    fetch(`/api/announcements?batch_id=${batchId}`)
      .then(r => r.json())
      .then((data: Announcement[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        // 마지막으로 본 시간 이후의 공지만
        const unseen = lastSeen
          ? data.filter(a => new Date(a.created_at) > new Date(lastSeen))
          : data.slice(0, 3); // 처음이면 최신 3개까지
        if (unseen.length > 0) {
          setAnnouncePopup(unseen);
          setPopupIndex(0);
          setShowPopup(true);
        }
      })
      .catch(() => {});
  }, [batchId]);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      // 내 점수 먼저 (가벼움)
      const scRes = await fetch(`/api/scores?studentId=${studentId}`).then(r => r.json());
      setScores(scRes.scores || []);

      // 나머지는 병렬 (반 평균용 전체 점수는 scores만, questions/responses는 학생것만)
      const [allScRes, respRes, qRes] = await Promise.all([
        fetch('/api/scores').then(r => r.json()),
        fetch(`/api/test-responses?studentId=${studentId}`).then(r => r.json()),
        fetch(`/api/questions?limit=600`).then(r => r.json()),
      ]);
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

  const closePopup = () => {
    // 마지막으로 본 시간 저장
    if (announcePopup.length > 0) {
      localStorage.setItem('iloom-announce-seen', announcePopup[0].created_at);
    }
    setShowPopup(false);
  };

  const PRIORITY_STYLE: Record<string, { color: string; bg: string; label: string }> = {
    normal: { color: 'var(--blue-light)', bg: 'var(--blue-dim)', label: '공지' },
    important: { color: 'var(--orange)', bg: 'var(--orange-dim)', label: '중요' },
    urgent: { color: 'var(--red)', bg: 'var(--red-dim)', label: '긴급' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* 공지사항 팝업 */}
      {showPopup && announcePopup.length > 0 && (() => {
        const a = announcePopup[popupIndex];
        const ps = PRIORITY_STYLE[a.priority] || PRIORITY_STYLE.normal;
        return (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'var(--overlay)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={closePopup}
          >
            <div
              style={{
                background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
                padding: '32px', width: 480, maxWidth: '90vw', maxHeight: '80vh',
                boxShadow: 'var(--shadow-lg)', overflowY: 'auto',
                borderTop: `4px solid ${ps.color}`,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                  background: ps.bg, color: ps.color,
                  fontSize: 12, fontWeight: 700,
                }}>
                  {ps.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(a.created_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                {announcePopup.length > 1 && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {popupIndex + 1} / {announcePopup.length}
                  </span>
                )}
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                {a.title}
              </h3>
              <p style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.7, margin: '0 0 24px', whiteSpace: 'pre-wrap' }}>
                {a.content}
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {popupIndex > 0 && (
                  <button
                    onClick={() => setPopupIndex(popupIndex - 1)}
                    style={{
                      padding: '10px 20px', borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)', background: 'transparent',
                      color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    이전
                  </button>
                )}
                {popupIndex < announcePopup.length - 1 ? (
                  <button
                    onClick={() => setPopupIndex(popupIndex + 1)}
                    style={{
                      padding: '10px 20px', borderRadius: 'var(--radius-md)',
                      border: 'none', background: 'var(--blue)', color: '#fff',
                      fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    다음 공지
                  </button>
                ) : (
                  <button
                    onClick={closePopup}
                    style={{
                      padding: '10px 20px', borderRadius: 'var(--radius-md)',
                      border: 'none', background: 'var(--blue)', color: '#fff',
                      fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    확인
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 오늘 일정 안내 배너 */}
      {schedule && (() => {
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const todayStr = kst.toISOString().slice(0, 10);
        const dayType = getDayType(schedule, todayStr);
        const config = DAY_TYPE_CONFIG[dayType];
        if (dayType === 'practice') return (
          <div style={{
            ...card, padding: '16px 20px',
            background: 'var(--orange-dim)', border: '1px solid var(--orange)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--orange)' }}></span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--orange)' }}>오늘은 매장실습일이에요!</div>
                <div style={{ fontSize: 13, color: 'var(--text-second)', marginTop: 2 }}>실습일지 작성이 필요해요</div>
              </div>
            </div>
            <Link href="/my/practice" style={{
              padding: '8px 16px', borderRadius: 'var(--radius-md)',
              background: 'var(--orange)', color: '#fff', fontSize: 14, fontWeight: 600,
              textDecoration: 'none',
            }}>
              실습일지 쓰러가기 →
            </Link>
          </div>
        );
        if (dayType === 'off') return (
          <div style={{
            ...card, padding: '16px 20px',
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>🌙</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-tertiary)' }}>오늘은 휴무일이에요!</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>교육일지 제출이 필요 없어요. 자율학습은 자유롭게 작성할 수 있어요!</div>
              </div>
            </div>
            <Link href="/my/notes" style={{
              padding: '8px 16px', borderRadius: 'var(--radius-md)',
              background: 'var(--purple)', color: '#fff', fontSize: 14, fontWeight: 600,
              textDecoration: 'none',
            }}>
              자율학습 쓰기
            </Link>
          </div>
        );
        return null;
      })()}

      {/* 아카이브 읽기전용 배너 */}
      {isArchived && (
        <div style={{
          ...card,
          background: 'rgba(142, 142, 147, 0.1)',
          border: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 16, color: 'var(--text-muted)' }}></span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-tertiary)' }}>
              이 기수는 보관 처리되었습니다
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              기록을 조회할 수 있지만, 새로운 작성이나 수정은 할 수 없어요.
            </div>
          </div>
        </div>
      )}

      {/* 출결 알림 팝업 */}
      {showAttendanceAlert && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
              padding: '40px 36px', width: 440, maxWidth: '90vw',
              boxShadow: 'var(--shadow-lg)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 16 }}>⏰</div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: 'var(--orange)', margin: '0 0 12px' }}>
              출근 체크를 확인해 주세요!
            </h3>
            <p style={{ fontSize: 16, color: 'var(--text-second)', lineHeight: 1.7, margin: '0 0 8px' }}>
              아직 오늘 출근 기록이 없어요.
            </p>
            <p style={{ fontSize: 15, color: 'var(--text-tertiary)', lineHeight: 1.6, margin: '0 0 28px' }}>
              타임인아웃 앱에서 출근 체크를 해 주세요.<br />
              8시 30분이 넘으면 지각 처리돼요!
            </p>
            <button
              onClick={() => setShowAttendanceAlert(false)}
              style={{
                padding: '14px 40px', borderRadius: 'var(--radius-md)',
                border: 'none', background: 'var(--orange)', color: '#fff',
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
                width: '100%',
              }}
            >
              확인했어요
            </button>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
              출근 체크 전까지 페이지 방문 시 다시 알려드려요
            </p>
          </div>
        </div>
      )}

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
              <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{studentName}</h2>
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
          <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>학습 피드백</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {weakTags.length > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)', marginBottom: 10 }}>이 부분을 더 공부하세요</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {weakTags.slice(0, 5).map(t => (
                    <span key={t.label} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--red-dim)', color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>
                      {t.label} ({t.correct}/{t.total})
                    </span>
                  ))}
                </div>
              </div>
            )}
            {midTags.length > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--orange)', marginBottom: 10 }}>조금 더 복습하면 좋아요</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {midTags.slice(0, 5).map(t => (
                    <span key={t.label} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--orange-dim)', color: 'var(--orange)', fontSize: 12, fontWeight: 600 }}>
                      {t.label} ({t.correct}/{t.total})
                    </span>
                  ))}
                </div>
              </div>
            )}
            {strongTags.length > 0 && (
              <div style={{ fontSize: 14, color: 'var(--green)' }}>
                <span style={{ fontWeight: 600 }}>{strongTags.length}개 영역</span> 잘하고 있어요
              </div>
            )}
          </div>
        </div>
      )}

      {/* 차시별 점수 추이 — 라인 차트 */}
      <div style={card}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>차시별 점수 추이</h3>
        {sessionScores.length > 0 ? (
          <ScoreTrendChart
            data={sessionScores.map(s => ({
              date: s.test_date,
              avg: s.score,
              classAvg: s.classAvg,
            }))}
            lines={[
              { key: 'avg', color: '#3b82f6', name: studentName },
              { key: 'classAvg', color: '#6b7280', name: '반 평균' },
            ]}
          />
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
                    background: 'var(--red-dim)', border: '1px solid var(--red-dim)',
                  }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Q{w.question_id} · {w.question?.category} · {w.question?.series}
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.5 }}>
                      {w.question?.question_text}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--red-dim)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>내 답안</div>
                        <div style={{ fontSize: 14, color: 'var(--red)', fontWeight: 500 }}>{w.user_answer || '(미입력)'}</div>
                      </div>
                      <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--blue-dim)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>정답</div>
                        <div style={{ fontSize: 14, color: 'var(--blue-light)', fontWeight: 500 }}>{w.question?.correct_answer}</div>
                      </div>
                    </div>
                    {w.question?.explanation && (
                      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                        {w.question.explanation}
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
