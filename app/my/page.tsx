'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getDayType } from '@/lib/schedule';
import type { ScheduleMap } from '@/lib/schedule';
import { LESSONS } from './lessons-data';
import LessonCalendar from './LessonCalendar';

interface TestScore { id: string; test_date: string; subject: string; score: number; }
interface TestResponse { id: string; session: string; question_id: string; is_correct: boolean; earned_score: number; max_score: number; user_answer: string; }
interface Question { question_id: string; session: string; question_text: string; correct_answer: string; category: string; series: string; detail: string; explanation: string; }
interface Announcement { id: string; title: string; content: string; priority: 'normal' | 'important' | 'urgent'; created_at: string; }
interface AttendanceRow { id: string; date: string; status: string; note?: string | null; }
interface NoteRow { id: string; title: string; content: string; created_at: string; participation_score?: number; participation_max?: number; tags?: string[]; confidence?: string; }
interface TodoRow { id: string; student_id: string; date: string; text: string; done: boolean; }

// 카테고리 매핑 (대시보드 mapCategory 단순화 버전)
function mapCategory(c: string): string {
  if (!c) return '기타';
  const map: Record<string, string> = {
    '학생방': '키즈', '키즈룸': '키즈',
    '서재': '서재', '책상': '서재', '책장': '서재',
    '침실': '침실', '침대': '침실', '매트리스': '침실',
    '옷장': '침실', '리빙': '리빙', '거실': '리빙',
    '소파': '리빙', '주방': '다이닝', '식탁': '다이닝',
    '조명': '리빙', '공통지식': '공통',
  };
  return map[c] || c;
}

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 17, fontWeight: 700, color: 'var(--text-primary)',
  margin: '0 0 16px', letterSpacing: '-0.01em',
};

const sectionLink: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', textDecoration: 'none',
};

const emptyStyle: React.CSSProperties = {
  fontSize: 14, color: 'var(--text-muted)', textAlign: 'center',
  padding: '32px 0', margin: 0,
};

export default function MyPage() {
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [scores, setScores] = useState<TestScore[]>([]);
  const [allScores, setAllScores] = useState<TestScore[]>([]);
  const [responses, setResponses] = useState<TestResponse[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [batchInfo, setBatchInfo] = useState<{ start_date: string; end_date: string } | null>(null);
  const [personalTodos, setPersonalTodos] = useState<TodoRow[]>([]);
  const [todoInput, setTodoInput] = useState('');
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
          const b = batches.find((x: { id: string }) => x.id === p.batchId);
          if (b) {
            if (b.schedule) setSchedule(b.schedule);
            setBatchInfo({ start_date: b.start_date, end_date: b.end_date });
          }
        }).catch(() => {});
      }
      if (p.isArchived) setIsArchived(true);
    }
  }, []);

  // 출결 알림 체크 (미출근이면 알림 표시, 30분마다 재확인) — 휴무일 제외
  useEffect(() => {
    if (!studentId || !schedule) return;

    const checkAttendance = () => {
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
      // 휴무일이면 알림 안 띄움
      if (getDayType(schedule, today) === 'off') {
        setShowAttendanceAlert(false);
        return;
      }
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
  }, [studentId, schedule]);

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
          : data.slice(0, 3);
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

      // 나머지는 병렬
      const [allScRes, respRes, qRes, notesRes, attRes] = await Promise.all([
        fetch('/api/scores').then(r => r.json()),
        fetch(`/api/test-responses?studentId=${studentId}`).then(r => r.json()),
        fetch(`/api/questions?limit=600`).then(r => r.json()),
        fetch(`/api/notes?studentId=${studentId}&all=true`).then(r => r.json()),
        fetch(`/api/attendance?studentId=${studentId}`).then(r => r.json()),
      ]);
      setAllScores(allScRes.scores || []);
      setResponses(respRes.responses || []);
      setQuestions(qRes.questions || []);
      setNotes(notesRes?.notes || (Array.isArray(notesRes) ? notesRes : []));
      setAttendance(Array.isArray(attRes) ? attRes : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  // 교육일지/실습일지 분리
  const educationNotes = useMemo(() => notes.filter(n => !(n.tags || []).includes('실습일지')), [notes]);
  const practiceNotes = useMemo(() => notes.filter(n => (n.tags || []).includes('실습일지')), [notes]);

  // ━━ 학생 홈 요약 지표 ━━
  const [kstToday] = useState(() => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10));

  // 개인 할 일 불러오기
  useEffect(() => {
    if (!studentId) return;
    fetch(`/api/student-todos?student_id=${studentId}&date=${kstToday}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPersonalTodos(data); })
      .catch(() => {});
  }, [studentId, kstToday]);

  const addTodo = useCallback(async () => {
    if (!todoInput.trim() || !studentId) return;
    const res = await fetch('/api/student-todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, date: kstToday, text: todoInput.trim() }),
    });
    const saved = await res.json();
    if (saved.id) {
      setPersonalTodos(prev => [...prev, saved]);
      setTodoInput('');
    }
  }, [todoInput, studentId, kstToday]);

  const toggleTodo = useCallback(async (id: string, done: boolean) => {
    await fetch('/api/student-todos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, done: !done }),
    });
    setPersonalTodos(prev => prev.map(t => t.id === id ? { ...t, done: !done } : t));
  }, []);

  const deleteTodo = useCallback(async (id: string) => {
    await fetch(`/api/student-todos?id=${id}`, { method: 'DELETE' });
    setPersonalTodos(prev => prev.filter(t => t.id !== id));
  }, []);

  const avgScore = useMemo(() => {
    if (scores.length === 0) return 0;
    return Math.round((scores.reduce((s, sc) => s + sc.score, 0) / scores.length) * 10) / 10;
  }, [scores]);

  // 출석률 (present=1점, late/early_leave=0.5점)
  const attendanceRate = useMemo(() => {
    if (attendance.length === 0) return null;
    let score = 0;
    for (const a of attendance) {
      if (a.status === 'present') score += 1;
      else if (a.status === 'late' || a.status === 'early_leave') score += 0.5;
    }
    return Math.round((score / attendance.length) * 100);
  }, [attendance]);

  // 오늘 출근 상태
  const todayAttendance = useMemo(() => attendance.find(a => a.date === kstToday) || null, [attendance, kstToday]);

  // 오늘 일지 작성 여부
  const hasTodayEduNote = useMemo(() => educationNotes.some(n => new Date(n.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) === kstToday), [educationNotes, kstToday]);
  const hasTodayPracticeNote = useMemo(() => practiceNotes.some(n => new Date(n.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) === kstToday), [practiceNotes, kstToday]);

  // 오늘 타입 (education / practice / off)
  const todayDayType = useMemo(() => schedule ? getDayType(schedule, kstToday) : null, [schedule, kstToday]);

  // 어제 날짜 (KST) 및 어제 타입/일지 작성 여부
  const kstYesterday = useMemo(() => {
    const d = new Date(kstToday + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [kstToday]);
  const yesterdayDayType = useMemo(() => schedule ? getDayType(schedule, kstYesterday) : null, [schedule, kstYesterday]);
  const hasYesterdayEduNote = useMemo(() => educationNotes.some(n => new Date(n.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) === kstYesterday), [educationNotes, kstYesterday]);
  const hasYesterdayPracticeNote = useMemo(() => practiceNotes.some(n => new Date(n.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) === kstYesterday), [practiceNotes, kstYesterday]);
  const yesterdayMissingEdu = yesterdayDayType && yesterdayDayType !== 'off' && !hasYesterdayEduNote;
  const yesterdayMissingPractice = yesterdayDayType === 'practice' && !hasYesterdayPracticeNote;

  // 제출률 (교육일지 기준)
  const submissionRate = useMemo(() => {
    if (!batchInfo) return null;
    const start = new Date(batchInfo.start_date);
    const today = new Date(kstToday + 'T00:00:00');
    const end = today < new Date(batchInfo.end_date) ? today : new Date(batchInfo.end_date);
    let weekdays = 0;
    const d = new Date(start);
    while (d <= end) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) weekdays++;
      d.setDate(d.getDate() + 1);
    }
    if (weekdays === 0) return null;
    return { written: educationNotes.length, total: weekdays };
  }, [batchInfo, kstToday, educationNotes]);

  // 입문교육 D-day
  const dDay = useMemo(() => {
    if (!batchInfo) return null;
    const today = new Date(kstToday + 'T00:00:00');
    const start = new Date(batchInfo.start_date);
    const end = new Date(batchInfo.end_date);
    const dayNum = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const remaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { day: dayNum, remaining };
  }, [batchInfo, kstToday]);

  // 취약 영역 TOP 3
  const weakTop3 = useMemo(() => tagAnalysis.filter(t => t.rate < 60).slice(0, 3), [tagAnalysis]);

  // 안 본 공지 수 (localStorage iloom-announce-seen 기준)
  const [unseenAnnouncements, setUnseenAnnouncements] = useState(0);
  useEffect(() => {
    if (!batchId) return;
    const lastSeen = localStorage.getItem('iloom-announce-seen') || '';
    fetch(`/api/announcements?batch_id=${batchId}`)
      .then(r => r.json())
      .then((data: Announcement[]) => {
        if (!Array.isArray(data)) return;
        const unseen = lastSeen ? data.filter(a => new Date(a.created_at) > new Date(lastSeen)).length : data.length;
        setUnseenAnnouncements(unseen);
      })
      .catch(() => {});
  }, [batchId]);


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
              <h3 style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.015em', color: 'var(--text-primary)', margin: '0 0 12px' }}>
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
            <h3 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.015em', color: 'var(--orange)', margin: '0 0 12px' }}>
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

      {/* 인사 섹션 (관리자 홈 패턴) */}
      <div className="greeting-row" style={{ padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 1.3rem + 0.9vw, 2rem)', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
            안녕하세요, {studentName}님
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: '4px 0 0' }}>오늘의 교육 현황이에요</p>
        </div>
        {dDay && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ padding: '6px 14px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue)', fontSize: 14, fontWeight: 600 }}>
              입문교육 {dDay.day}일차 {dDay.remaining > 0 ? `D-${dDay.remaining}` : dDay.remaining === 0 ? 'D-day' : '완료'}
            </span>
          </div>
        )}
      </div>

      {/* 1행: 캘린더 (2fr) + 오늘 체크리스트/스탯 (1fr) */}
      <div className="row-cal-plus-today" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'stretch' }}>
        <LessonCalendar lessons={LESSONS} kstToday={kstToday} />

        {/* 오늘 할 일 + 스탯 카드 */}
        <div className="today-card" style={{ ...card, display: 'flex', flexDirection: 'column', height: 420, gap: 0 }}>
          <h3 style={{ ...sectionTitle, marginBottom: 12 }}>오늘 할 일</h3>

          {/* 체크리스트 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            {/* 출근 체크 (휴무일 제외) */}
            {todayDayType !== 'off' && (() => {
              const done = !!todayAttendance && todayAttendance.status !== 'absent';
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: done ? 'transparent' : 'var(--orange-dim)' }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                    background: done ? 'var(--green)' : 'transparent',
                    border: done ? 'none' : '1.5px solid var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700,
                  }}>{done ? '✓' : ''}</span>
                  <span style={{ fontSize: 14, color: done ? 'var(--text-tertiary)' : 'var(--text-primary)', fontWeight: done ? 400 : 600, textDecoration: done ? 'line-through' : 'none', flex: 1 }}>
                    출근 체크
                  </span>
                  {!done && <span style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600 }}>타임인아웃</span>}
                </div>
              );
            })()}

            {/* 어제 교육일지 미작성 알림 */}
            {yesterdayMissingEdu && (
              <Link href="/my/notes" style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 'var(--radius-sm)', textDecoration: 'none',
                background: 'var(--red-dim)',
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                  border: '1.5px solid var(--red)',
                }} />
                <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>
                  어제 교육일지가 비어 있어요
                </span>
                <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>지금 쓰기 →</span>
              </Link>
            )}

            {/* 어제 실습일지 미작성 알림 */}
            {yesterdayMissingPractice && (
              <Link href="/my/practice" style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 'var(--radius-sm)', textDecoration: 'none',
                background: 'var(--red-dim)',
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                  border: '1.5px solid var(--red)',
                }} />
                <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>
                  어제 실습일지가 비어 있어요
                </span>
                <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>지금 쓰기 →</span>
              </Link>
            )}

            {/* 교육일지 */}
            {todayDayType !== 'off' && (
              <Link href="/my/notes" style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 'var(--radius-sm)', textDecoration: 'none',
                background: hasTodayEduNote ? 'transparent' : 'var(--bg-main)',
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                  background: hasTodayEduNote ? 'var(--green)' : 'transparent',
                  border: hasTodayEduNote ? 'none' : '1.5px solid var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700,
                }}>{hasTodayEduNote ? '✓' : ''}</span>
                <span style={{ fontSize: 14, color: hasTodayEduNote ? 'var(--text-tertiary)' : 'var(--text-primary)', fontWeight: hasTodayEduNote ? 400 : 600, textDecoration: hasTodayEduNote ? 'line-through' : 'none', flex: 1 }}>
                  교육일지 작성
                </span>
                {!hasTodayEduNote && <span style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>쓰러가기 →</span>}
              </Link>
            )}

            {/* 실습일지 (실습날만) */}
            {todayDayType === 'practice' && (
              <Link href="/my/practice" style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 'var(--radius-sm)', textDecoration: 'none',
                background: hasTodayPracticeNote ? 'transparent' : 'var(--orange-dim)',
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                  background: hasTodayPracticeNote ? 'var(--green)' : 'transparent',
                  border: hasTodayPracticeNote ? 'none' : '1.5px solid var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700,
                }}>{hasTodayPracticeNote ? '✓' : ''}</span>
                <span style={{ fontSize: 14, color: hasTodayPracticeNote ? 'var(--text-tertiary)' : 'var(--text-primary)', fontWeight: hasTodayPracticeNote ? 400 : 600, textDecoration: hasTodayPracticeNote ? 'line-through' : 'none', flex: 1 }}>
                  실습일지 작성
                </span>
                {!hasTodayPracticeNote && <span style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600 }}>쓰러가기 →</span>}
              </Link>
            )}

            {/* 안 본 공지 */}
            {unseenAnnouncements > 0 && (
              <Link href="/my/announcements" style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 'var(--radius-sm)', textDecoration: 'none',
                background: 'var(--red-dim)',
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                  border: '1.5px solid var(--text-muted)',
                }} />
                <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>
                  공지 확인 ({unseenAnnouncements}건 새로 올라옴)
                </span>
                <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>보러가기 →</span>
              </Link>
            )}

            {todayDayType === 'off' && !todayAttendance && (
              <div style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-muted)' }}>
                오늘은 휴무일이에요
              </div>
            )}
          </div>

          {/* 개인 할 일 */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>내 할 일</div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
              {personalTodos.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 10px' }}>
                  할 일을 추가해보세요
                </div>
              )}
              {personalTodos.map(todo => (
                <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--radius-sm)' }}>
                  <button
                    onClick={() => toggleTodo(todo.id, todo.done)}
                    style={{
                      width: 16, height: 16, borderRadius: 'var(--radius-xs)', flexShrink: 0,
                      background: todo.done ? 'var(--blue)' : 'transparent',
                      border: todo.done ? 'none' : '1.5px solid var(--border-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: '#fff', fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {todo.done ? '✓' : ''}
                  </button>
                  <span style={{
                    flex: 1, fontSize: 13,
                    color: todo.done ? 'var(--text-muted)' : 'var(--text-primary)',
                    textDecoration: todo.done ? 'line-through' : 'none',
                  }}>{todo.text}</span>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', padding: 0, flexShrink: 0 }}
                  >×</button>
                </div>
              ))}
            </div>
            <input
              value={todoInput}
              onChange={e => setTodoInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTodo(); }}
              placeholder="+ 할 일 추가 (Enter로 저장)"
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13, marginTop: 6,
                border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 스탯 요약 (플랫 구분선 스타일) */}
          <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-light)', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12 }}>내 상태</div>
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              {[
                {
                  label: '평균',
                  value: String(avgScore),
                  unit: '점',
                  color: avgScore >= 80 ? 'var(--green)' : avgScore >= 60 ? 'var(--orange)' : 'var(--red)',
                },
                {
                  label: '출석률',
                  value: attendanceRate == null ? '-' : String(attendanceRate),
                  unit: attendanceRate == null ? '' : '%',
                  color: attendanceRate == null ? 'var(--text-primary)' : attendanceRate >= 90 ? 'var(--green)' : attendanceRate >= 80 ? 'var(--orange)' : 'var(--red)',
                },
                {
                  label: '일지',
                  value: submissionRate ? String(submissionRate.written) : '-',
                  unit: submissionRate ? `/${submissionRate.total}` : '',
                  color: submissionRate ? (submissionRate.written >= submissionRate.total ? 'var(--green)' : submissionRate.written >= submissionRate.total * 0.8 ? 'var(--orange)' : 'var(--red)') : 'var(--text-primary)',
                },
              ].map((s, i, arr) => (
                <div key={s.label} style={{
                  flex: 1, textAlign: 'center',
                  borderRight: i < arr.length - 1 ? '1px solid var(--border-light)' : 'none',
                  padding: '0 8px',
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>
                    {s.value}
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 2 }}>{s.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 1023px) {
            .row-cal-plus-today { grid-template-columns: 1fr !important; }
            .today-card { height: auto !important; }
          }
        `}</style>
      </div>

      {/* 2열: 취약영역 TOP3 + 차시별 점수 추이 */}
      <div className="row-weak-chart" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, alignItems: 'stretch' }}>
        {/* 취약영역 TOP3 */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ ...sectionTitle, margin: 0 }}>공부 필요 영역</h3>
            <Link href="/my/tests" style={sectionLink}>전체보기 →</Link>
          </div>
          {weakTop3.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {weakTop3.map((t, idx) => (
                <div key={t.label} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 'var(--radius-md)',
                  background: 'var(--red-dim)',
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--red)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                  }}>{idx + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', flexShrink: 0 }}>
                    {t.rate}%
                  </span>
                </div>
              ))}
            </div>
          ) : tagAnalysis.length > 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: 'var(--green)', fontWeight: 600, margin: 0 }}>잘하고 있어요! 👍</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>취약 영역이 없어요</p>
            </div>
          ) : (
            <p style={emptyStyle}>시험 응시 데이터가 없어요</p>
          )}
        </div>

        {/* 차시별 점수 추이 */}
        <div style={card}>
          <h3 style={sectionTitle}>차시별 점수 추이</h3>
          {sessionScores.length > 0 ? (() => {
            const chartData = sessionScores.map(s => {
              const dt = new Date(s.test_date + 'T00:00:00');
              return { date: `${dt.getMonth() + 1}/${dt.getDate()}`, score: s.score, classAvg: s.classAvg };
            });
            return (
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#d1d5db', display: 'inline-block' }} />반 평균
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--blue)', display: 'inline-block' }} />{studentName}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} formatter={(value) => [`${value}점`]} />
                    <Bar dataKey="classAvg" name="반 평균" fill="#d1d5db" radius={[4, 4, 0, 0]} maxBarSize={20} />
                    <Bar dataKey="score" name={studentName} radius={[4, 4, 0, 0]} maxBarSize={20}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={d.score >= d.classAvg ? 'var(--blue)' : 'var(--red)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })() : (
            <p style={emptyStyle}>시험 데이터가 없어요</p>
          )}
        </div>

        <style>{`
          @media (max-width: 1023px) {
            .row-weak-chart { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>

      {/* 교육일지 / 실습일지 (2열) */}
      {(() => {
        const isPracticeDay = todayDayType === 'practice';
        const isOffDay = todayDayType === 'off';

        const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
        const fmtDate = (iso: string) => {
          const d = new Date(iso);
          const ds = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
          const parsed = new Date(ds + 'T12:00:00Z');
          return `${WEEKDAYS[parsed.getUTCDay()]} ${parsed.getUTCMonth() + 1}/${parsed.getUTCDate()}`;
        };

        const parseSteps = (content: string) => {
          try { const p = JSON.parse(content); return p.steps || p; } catch { return {}; }
        };

        const writeBtnStyle = (color: 'blue' | 'orange'): React.CSSProperties => ({
          background: 'transparent',
          color: color === 'blue' ? 'var(--blue)' : 'var(--orange)',
          fontSize: 13, fontWeight: 600, textDecoration: 'none',
          whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        });

        const confMap: Record<string, { icon: string; label: string }> = {
          very_confident: { icon: '😎', label: '자신만만' },
          confident: { icon: '😊', label: '자신있어요' },
          normal: { icon: '😐', label: '보통이에요' },
          uncertain: { icon: '🤔', label: '알쏭달쏭' },
          need_help: { icon: '😵', label: '도움요청' },
        };

        const noteCardStyle: React.CSSProperties = {
          textDecoration: 'none',
          padding: 16, borderRadius: 'var(--radius-md)',
          background: 'var(--bg-main)',
          display: 'flex', flexDirection: 'column', gap: 8,
          transition: 'all 0.15s ease',
        };

        return (
          <div className="row-2cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, alignItems: 'start' }}>
            {/* 교육일지 */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ ...sectionTitle, margin: 0 }}>교육일지 ({educationNotes.length}건)</h3>
                {!hasTodayEduNote && !isOffDay ? (
                  <Link href="/my/notes" style={writeBtnStyle('blue')}>오늘 일지 쓰기 →</Link>
                ) : hasTodayEduNote ? (
                  <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>오늘 작성 완료 ✓</span>
                ) : null}
              </div>
              {educationNotes.length > 0 ? (
                <div className="note-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {educationNotes.slice(0, 4).map(n => {
                    const isSelfStudy = (n.tags || []).includes('자율학습');
                    const conf = n.confidence ? confMap[n.confidence] : null;
                    const displayTags = (n.tags || []).filter(t => t !== '자율학습' && t !== '실습일지');
                    return (
                      <Link key={n.id} href="/my/notes" style={{
                        ...noteCardStyle,
                        padding: 20, gap: 10,
                        ...(isSelfStudy ? { border: '1px solid var(--purple-dim)', background: 'var(--purple-dim)' } : {}),
                      }}>
                        {/* 날짜 + 자율학습 배지 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(n.created_at)}</span>
                          {isSelfStudy && (
                            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--purple-dim)', color: 'var(--purple)' }}>자율학습</span>
                          )}
                        </div>
                        {/* 제목 */}
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {n.title || '제목 없음'}
                        </div>
                        {/* 자신감 + 참여점수 */}
                        {!isSelfStudy && (conf || (n.participation_score != null && n.participation_score > 0)) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {conf && <span style={{ fontSize: 13 }}>{conf.icon} {conf.label}</span>}
                            {n.participation_score != null && n.participation_score > 0 && (
                              <span style={{
                                padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
                                background: n.participation_score >= (n.participation_max || 3) ? 'var(--green-dim)' : 'var(--orange-dim)',
                                color: n.participation_score >= (n.participation_max || 3) ? 'var(--green)' : 'var(--orange)',
                              }}>
                                참여 {n.participation_score}/{n.participation_max || 3}
                              </span>
                            )}
                          </div>
                        )}
                        {/* 태그 */}
                        {displayTags.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {displayTags.slice(0, 3).map(tag => (
                              <span key={tag} style={{
                                padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                                background: isSelfStudy ? 'var(--purple-dim)' : 'var(--blue-dim)',
                                color: isSelfStudy ? 'var(--purple)' : 'var(--blue-light)',
                                fontSize: 12, fontWeight: 600,
                              }}>{tag}</span>
                            ))}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', margin: 0 }}>
                  아직 작성한 교육일지가 없어요
                </p>
              )}
            </div>

            {/* 실습일지 */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ ...sectionTitle, margin: 0 }}>실습일지 ({practiceNotes.length}건)</h3>
                {isPracticeDay && !hasTodayPracticeNote ? (
                  <Link href="/my/practice" style={writeBtnStyle('orange')}>오늘 실습일지 쓰기 →</Link>
                ) : isPracticeDay && hasTodayPracticeNote ? (
                  <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>오늘 작성 완료 ✓</span>
                ) : null}
              </div>
              {practiceNotes.length > 0 ? (
                <div className="note-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {practiceNotes.slice(0, 4).map(n => {
                    const s = parseSteps(n.content);
                    const consult = Number(s.stats_consult) || 0;
                    const estimate = Number(s.stats_estimate) || 0;
                    const order = Number(s.stats_order) || 0;
                    const amount = Number(s.stats_amount) || 0;
                    return (
                      <Link key={n.id} href="/my/practice" style={{
                        ...noteCardStyle,
                        padding: 20, gap: 10,
                      }}>
                        {/* 날짜 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(n.created_at)}</span>
                        </div>
                        {/* 제목 */}
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {n.title || '실습일지'}
                        </div>
                        {/* 실적 뱃지 */}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {consult > 0 && (
                            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--blue-dim)', color: 'var(--blue-light)' }}>상담 {consult}</span>
                          )}
                          {estimate > 0 && (
                            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--blue-dim)', color: 'var(--blue-light)' }}>견적 {estimate}</span>
                          )}
                          {order > 0 && (
                            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--orange-dim)', color: 'var(--orange)' }}>수주 {order}</span>
                          )}
                          {amount > 0 && (
                            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--purple-dim)', color: 'var(--purple)' }}>{amount.toLocaleString()}원</span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', margin: 0 }}>
                  아직 작성한 실습일지가 없어요
                </p>
              )}
            </div>

            <style>{`
              @media (max-width: 1023px) {
                .row-2cols { grid-template-columns: 1fr !important; }
              }
            `}</style>
          </div>
        );
      })()}

      {/* 오답 모아보기 (테이블 형식) */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>오답 모아보기</h3>
          {(() => {
            const totalWrongs = sessionWrongs.reduce((sum, s) => sum + s.wrongs.length, 0);
            const totalQ = sessionWrongs.reduce((sum, s) => sum + s.total, 0);
            return (
              <span style={{ fontSize: 14, fontWeight: 600, color: totalWrongs > 0 ? 'var(--red)' : 'var(--green)' }}>
                {totalWrongs === 0 ? '전부 정답!' : `${totalWrongs}개 / ${totalQ}문항`}
              </span>
            );
          })()}
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ whiteSpace: 'nowrap', width: 1 }}>차시</th>
              <th style={{ whiteSpace: 'nowrap', width: 1, textAlign: 'center' }}>응시</th>
              <th style={{ whiteSpace: 'nowrap', width: 1, textAlign: 'center' }}>오답</th>
              <th style={{ whiteSpace: 'nowrap', width: 1, textAlign: 'center' }}>정답률</th>
              <th>오답 문항</th>
            </tr>
          </thead>
          <tbody>
            {sessionWrongs.map(({ session, wrongs, total }) => {
              const correct = total - wrongs.length;
              const rate = total > 0 ? Math.round((correct / total) * 100) : 0;
              const rateColor = rate >= 90 ? 'var(--green)' : rate >= 70 ? 'var(--orange)' : 'var(--red)';
              return (
                <tr key={session}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{session}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{total}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {wrongs.length === 0 ? (
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>-</span>
                    ) : (
                      <span style={{ color: 'var(--red)', fontWeight: 700 }}>{wrongs.length}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                      fontSize: 12, fontWeight: 600,
                      background: rate >= 90 ? 'var(--green-dim)' : rate >= 70 ? 'var(--orange-dim)' : 'var(--red-dim)',
                      color: rateColor,
                    }}>{rate}%</span>
                  </td>
                  <td>
                    {wrongs.length === 0 ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>만점!</span>
                    ) : (
                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--blue)', listStyle: 'none' }}>
                          {wrongs.length}개 문항 보기 ↓
                        </summary>
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {wrongs.map(w => (
                            <div key={w.id} style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--red-dim)' }}>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                                Q{w.question_id} · {w.question?.category} · {w.question?.series}
                              </div>
                              <div style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.5 }}>
                                {w.question?.question_text}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-main)' }}>
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
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

