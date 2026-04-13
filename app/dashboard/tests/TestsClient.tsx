'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Batch, Student, TestScore, Attendance } from '@/lib/types';
import { calculateDailyAverages } from '@/lib/analysis';
import ScoreTrendChart from '@/components/charts/ScoreTrendChart';

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
type PageTab = 'manage' | 'analysis';

// 분석용 타입
interface AnalysisResponse { student_id: string; batch_id: string; session: string; question_id: string; is_correct: boolean; test_date: string; }
interface AnalysisQuestion { id: string; batch_id: string; session: string; question_id: string; category: string | null; series: string | null; detail: string | null; question_text: string | null; }
interface NoteRow { id: string; student_id: string; title: string; content: string; created_at: string; }

interface Props {
  batches: Batch[];
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
  notes: NoteRow[];
  allTestResponses: AnalysisResponse[];
  allQuestions: AnalysisQuestion[];
}

// 분석 유틸
function rateColor(rate: number) {
  if (rate >= 80) return { bg: '#30D15833', text: 'var(--green)' };
  if (rate >= 60) return { bg: '#FF9F0A33', text: 'var(--orange)' };
  return { bg: '#FF453A33', text: 'var(--red)' };
}

const analysisCardStyle: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 };

export default function TestsClient({ batches, students, scores, attendance, notes, allTestResponses, allQuestions }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('scores');
  const [pageTab, setPageTab] = useState<PageTab>('manage');

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

  // 퇴사자 제외
  const activeStudents = useMemo(() => students.filter(s => !s.is_dropped), [students]);

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
    const tested = activeStudents
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
  }, [selectedSession, activeStudents, scores, responses]);

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

  // ── 분석 탭 데이터 ──
  const [analysisStudentId, setAnalysisStudentId] = useState('');
  const [analysisDate, setAnalysisDate] = useState<string | null>(null);
  const [studentDateModal, setStudentDateModal] = useState<string | null>(null);
  const [heatmapModal, setHeatmapModal] = useState<{ category: string; detail: string } | null>(null);

  const batchStudents = useMemo(() => students.filter(s => s.batch_id === batchId && !s.is_dropped), [students, batchId]);

  // 시험 성적 추이
  const dailyAverages = useMemo(() => {
    const batchScores = scores.filter(s => batchStudents.some(st => st.id === s.student_id));
    return calculateDailyAverages(batchScores);
  }, [scores, batchStudents]);

  // 교육생별 성장 곡선
  const studentGrowthData = useMemo(() => {
    if (!analysisStudentId) return { merged: [] as { date: string; avg: number; classAvg: number }[], summary: null as null | { first: number; last: number; diff: number; overall: number } };
    const personalAvgs = calculateDailyAverages(scores.filter(s => s.student_id === analysisStudentId));
    const avgMap = new Map(dailyAverages.map(d => [d.date, d.avg]));
    const merged = personalAvgs.map(d => ({ date: d.date, avg: d.avg, classAvg: avgMap.get(d.date) ?? 0 }));
    const first = personalAvgs[0]?.avg ?? 0;
    const last = personalAvgs[personalAvgs.length - 1]?.avg ?? 0;
    const diff = Math.round((last - first) * 10) / 10;
    const overall = personalAvgs.length > 0 ? Math.round(personalAvgs.reduce((s, d) => s + d.avg, 0) / personalAvgs.length * 10) / 10 : 0;
    return { merged, summary: { first, last, diff, overall } };
  }, [analysisStudentId, scores, dailyAverages]);

  // 날짜별 상세 분석
  const dateAnalysis = useMemo(() => {
    if (!analysisDate) return null;
    const batchStudentIds = new Set(batchStudents.map(s => s.id));
    const qMap = new Map<string, AnalysisQuestion>();
    for (const q of allQuestions) { if (q.batch_id === batchId) qMap.set(`${q.session}_${q.question_id}`, q); }

    const currIdx = dailyAverages.findIndex(d => d.date === analysisDate);
    const curr = dailyAverages[currIdx];
    const prev = currIdx > 0 ? dailyAverages[currIdx - 1] : null;
    if (!curr) return null;
    const change = prev ? Math.round((curr.avg - prev.avg) * 10) / 10 : 0;

    const dayScores = scores.filter(s => s.test_date === analysisDate && batchStudentIds.has(s.student_id));
    const daySessions = [...new Set(dayScores.map(s => s.subject))];
    const dayResponses = allTestResponses.filter(r => r.test_date === analysisDate && batchStudentIds.has(r.student_id));
    const dayCategories = new Set<string>();
    for (const r of dayResponses) { const q = qMap.get(`${r.session}_${r.question_id}`); if (q?.category) dayCategories.add(q.category); }

    const qStats = new Map<string, { session: string; questionId: string; questionText: string; wrong: number; correct: number; total: number; category: string; detail: string }>();
    for (const r of dayResponses) {
      const q = qMap.get(`${r.session}_${r.question_id}`);
      if (!q) continue;
      const key = `${r.session}_${r.question_id}`;
      const stat = qStats.get(key) || { session: r.session, questionId: r.question_id, questionText: q.question_text || '', wrong: 0, correct: 0, total: 0, category: q.category || '', detail: q.detail || '' };
      stat.total++; if (r.is_correct) stat.correct++; else stat.wrong++;
      qStats.set(key, stat);
    }
    const questionStats = [...qStats.values()].map(s => ({ ...s, wrongRate: s.total > 0 ? Math.round((s.wrong / s.total) * 100) : 0 })).sort((a, b) => b.wrongRate - a.wrongRate);

    const studentScores: { name: string; score: number; prevScore: number | null; diff: number | null }[] = [];
    for (const student of batchStudents) {
      const currS = dayScores.filter(s => s.student_id === student.id);
      if (currS.length === 0) continue;
      const currAvg = Math.round(currS.reduce((s, x) => s + x.score, 0) / currS.length * 10) / 10;
      let prevScore: number | null = null; let pDiff: number | null = null;
      if (prev) { const prevS = scores.filter(s => s.test_date === prev.date && s.student_id === student.id); if (prevS.length > 0) { prevScore = Math.round(prevS.reduce((s, x) => s + x.score, 0) / prevS.length * 10) / 10; pDiff = Math.round((currAvg - prevScore) * 10) / 10; } }
      studentScores.push({ name: student.name, score: currAvg, prevScore, diff: pDiff });
    }
    studentScores.sort((a, b) => (a.diff ?? 0) - (b.diff ?? 0));
    return { date: analysisDate, avg: curr.avg, prevAvg: prev?.avg ?? null, change, categories: [...dayCategories], sessions: daySessions, questionStats, studentScores };
  }, [analysisDate, dailyAverages, scores, allTestResponses, allQuestions, batchStudents, batchId]);

  // 학생별 날짜 분석 모달
  const studentDateAnalysis = useMemo(() => {
    if (!studentDateModal || !analysisStudentId) return null;
    const batchStudentIds = new Set(batchStudents.map(s => s.id));
    const qMap = new Map<string, AnalysisQuestion>();
    for (const q of allQuestions) { if (q.batch_id === batchId) qMap.set(`${q.session}_${q.question_id}`, q); }
    const student = batchStudents.find(s => s.id === analysisStudentId);
    if (!student) return null;

    const myResponses = allTestResponses.filter(r => r.student_id === analysisStudentId && r.test_date === studentDateModal);
    const allDayResponses = allTestResponses.filter(r => r.test_date === studentDateModal && batchStudentIds.has(r.student_id));

    const qAnalysis: { session: string; questionId: string; questionText: string; category: string; detail: string; myCorrect: boolean; classRate: number }[] = [];
    for (const myR of myResponses) {
      const q = qMap.get(`${myR.session}_${myR.question_id}`);
      if (!q) continue;
      const classForQ = allDayResponses.filter(r => r.session === myR.session && r.question_id === myR.question_id);
      const classCorrect = classForQ.filter(r => r.is_correct).length;
      qAnalysis.push({ session: myR.session, questionId: myR.question_id, questionText: q.question_text || '', category: q.category || '', detail: q.detail || '', myCorrect: myR.is_correct, classRate: classForQ.length > 0 ? Math.round((classCorrect / classForQ.length) * 100) : 0 });
    }

    const onlyMyWrong = qAnalysis.filter(q => !q.myCorrect && q.classRate >= 70).sort((a, b) => b.classRate - a.classRate);
    const wrongByCategory = new Map<string, number>();
    const wrongByDetail = new Map<string, number>();
    for (const q of qAnalysis.filter(q => !q.myCorrect)) {
      if (q.category) wrongByCategory.set(q.category, (wrongByCategory.get(q.category) || 0) + 1);
      if (q.detail) wrongByDetail.set(q.detail, (wrongByDetail.get(q.detail) || 0) + 1);
    }
    const topWeakCategories = [...wrongByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topWeakDetails = [...wrongByDetail.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    const myDayScores = scores.filter(s => s.student_id === analysisStudentId && s.test_date === studentDateModal);
    const myAvg = myDayScores.length > 0 ? Math.round(myDayScores.reduce((s, x) => s + x.score, 0) / myDayScores.length * 10) / 10 : 0;
    const classAvgForDay = dailyAverages.find(d => d.date === studentDateModal)?.avg ?? 0;
    const gap = Math.round((myAvg - classAvgForDay) * 10) / 10;
    const totalQ = qAnalysis.length;
    const myCorrectCount = qAnalysis.filter(q => q.myCorrect).length;

    return { studentName: student.name, date: studentDateModal, myAvg, classAvg: classAvgForDay, gap, totalQ, myCorrectCount, myWrongCount: totalQ - myCorrectCount, onlyMyWrong, topWeakCategories, topWeakDetails };
  }, [studentDateModal, analysisStudentId, allTestResponses, allQuestions, scores, batchStudents, dailyAverages, batchId]);

  // 히트맵
  const heatmapData = useMemo(() => {
    const batchStudentIds = new Set(batchStudents.map(s => s.id));
    const batchResponses = allTestResponses.filter(r => batchStudentIds.has(r.student_id));
    const qMap = new Map<string, AnalysisQuestion>();
    for (const q of allQuestions) { if (q.batch_id === batchId) qMap.set(`${q.session}_${q.question_id}`, q); }
    const cellMap = new Map<string, { correct: number; total: number }>();
    const allCats = new Set<string>(); const allDets = new Set<string>();
    for (const r of batchResponses) {
      const q = qMap.get(`${r.session}_${r.question_id}`);
      if (!q || !q.category) continue;
      const det = q.detail || '기타';
      allCats.add(q.category); allDets.add(det);
      const key = `${q.category}__${det}`;
      const cell = cellMap.get(key) || { correct: 0, total: 0 };
      cell.total++; if (r.is_correct) cell.correct++;
      cellMap.set(key, cell);
    }
    const categories = [...allCats].sort();
    const details = [...allDets].sort();
    const data: { category: string; detail: string; rate: number; totalQ: number }[] = [];
    for (const cat of categories) for (const det of details) {
      const cell = cellMap.get(`${cat}__${det}`);
      if (cell && cell.total > 0) data.push({ category: cat, detail: det, rate: Math.round((cell.correct / cell.total) * 100), totalQ: cell.total });
    }
    return { data, categories, details };
  }, [batchStudents, allTestResponses, allQuestions, batchId]);

  // 히트맵 모달 데이터
  const heatmapModalData = useMemo(() => {
    if (!heatmapModal) return [];
    const { category, detail } = heatmapModal;
    const batchStudentIds = new Set(batchStudents.map(s => s.id));
    const qMap = new Map<string, AnalysisQuestion>();
    for (const q of allQuestions) { if (q.batch_id === batchId) qMap.set(`${q.session}_${q.question_id}`, q); }
    const qStats = new Map<string, { questionId: string; session: string; correct: number; wrong: number; total: number }>();
    for (const r of allTestResponses) {
      if (!batchStudentIds.has(r.student_id)) continue;
      const q = qMap.get(`${r.session}_${r.question_id}`);
      if (!q || q.category !== category || (q.detail || '기타') !== detail) continue;
      const key = `${r.session}_${r.question_id}`;
      const stat = qStats.get(key) || { questionId: r.question_id, session: r.session, correct: 0, wrong: 0, total: 0 };
      stat.total++; if (r.is_correct) stat.correct++; else stat.wrong++;
      qStats.set(key, stat);
    }
    return [...qStats.values()].map(s => ({ ...s, wrongRate: s.total > 0 ? Math.round((s.wrong / s.total) * 100) : 0 })).sort((a, b) => b.wrongRate - a.wrongRate);
  }, [heatmapModal, batchStudents, allTestResponses, allQuestions, batchId]);

  // 동기화
  const handleSync = async (date?: string, mode?: string) => {
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
        body: JSON.stringify({ sheetId, date, mode }),
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            테스트
          </h2>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 3 }}>
            {([['manage', '차시별 성적'], ['analysis', '시험 분석']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setPageTab(key)} style={{
                padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                background: pageTab === key ? 'var(--blue)' : 'transparent',
                color: pageTab === key ? '#fff' : 'var(--text-tertiary)',
                border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
              }}>{label}</button>
            ))}
          </div>
        </div>
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
            <span className="btn-label">Excel 다운로드</span>
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
            <span className="btn-label">{syncing ? '동기화 중...' : '오늘 시험 동기화'}</span>
          </button>
          <button
            onClick={() => { handleSync('today', 'new_only'); }}
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
            <span className="btn-label">{syncing ? '동기화 중...' : '+ 새 응답만 추가'}</span>
          </button>
        </div>
      </div>

      {/* 알림 */}
      {syncResult && (
        <div style={{
          padding: '14px 20px', borderRadius: 'var(--radius-md)',
          background: syncResult.includes('완료') ? 'var(--green-dim)' : 'var(--red-dim)',
          border: `1px solid ${syncResult.includes('완료') ? 'var(--green-dim)' : 'var(--red-dim)'}`,
          color: syncResult.includes('완료') ? 'var(--green)' : 'var(--red)',
          fontSize: 15,
        }}>
          {syncResult}
        </div>
      )}

      {/* ════════════ 분석 탭 ════════════ */}
      {pageTab === 'analysis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 시험 성적 추이 + 교육생별 성장 곡선 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={analysisCardStyle}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>차시별 전체 평균 추이</h3>
              {dailyAverages.length > 0 ? (
                <>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
                    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>최근 평균 </span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{dailyAverages[dailyAverages.length - 1]?.avg}점</span>
                    </div>
                    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>변화 </span>
                      {(() => {
                        const first = dailyAverages[0]?.avg ?? 0;
                        const last = dailyAverages[dailyAverages.length - 1]?.avg ?? 0;
                        const diff = Math.round((last - first) * 10) / 10;
                        return <span style={{ fontWeight: 700, color: diff >= 0 ? 'var(--green)' : 'var(--red)' }}>{diff >= 0 ? '+' : ''}{diff}점</span>;
                      })()}
                    </div>
                  </div>
                  <ScoreTrendChart data={dailyAverages} height={240} />
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                    {dailyAverages.map((d, i) => {
                      const prev = i > 0 ? dailyAverages[i - 1] : null;
                      const ch = prev ? Math.round((d.avg - prev.avg) * 10) / 10 : 0;
                      const isDown = ch < -3;
                      const dt = new Date(d.date);
                      return (
                        <button key={d.date} onClick={() => setAnalysisDate(d.date)} style={{
                          background: isDown ? 'var(--red-dim)' : 'var(--bg-elevated)', border: `1px solid ${isDown ? 'var(--red)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 11,
                          color: isDown ? 'var(--red)' : 'var(--text-second)', fontWeight: isDown ? 700 : 400, cursor: 'pointer',
                        }}>{dt.getMonth() + 1}/{dt.getDate()}{isDown && ' ▼'}</button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>날짜를 클릭하면 그날의 상세 분석을 볼 수 있어요. <span style={{ color: 'var(--red)' }}>빨간 날짜</span>는 3점 이상 하락한 날이에요.</p>
                </>
              ) : <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>시험 데이터가 없습니다.</p>}
            </div>

            <div style={analysisCardStyle}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>교육생별 성장 곡선</h3>
              <select value={analysisStudentId} onChange={e => setAnalysisStudentId(e.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', fontSize: 13, marginBottom: 12 }}>
                <option value="">교육생 선택</option>
                {batchStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {analysisStudentId && studentGrowthData.merged.length > 0 ? (
                <>
                  {studentGrowthData.summary && (
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12, fontSize: 13, flexWrap: 'wrap' }}>
                      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>전체 평균 </span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{studentGrowthData.summary.overall}점</span>
                      </div>
                      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>첫 시험 </span>
                        <span style={{ fontWeight: 700 }}>{studentGrowthData.summary.first}점</span>
                        <span style={{ color: 'var(--text-muted)' }}> → 최근 </span>
                        <span style={{ fontWeight: 700 }}>{studentGrowthData.summary.last}점</span>
                      </div>
                      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>변화 </span>
                        <span style={{ fontWeight: 700, color: studentGrowthData.summary.diff >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {studentGrowthData.summary.diff >= 0 ? '+' : ''}{studentGrowthData.summary.diff}점
                        </span>
                      </div>
                    </div>
                  )}
                  <ScoreTrendChart data={studentGrowthData.merged} lines={[{ key: 'avg', color: '#007AFF', name: '개인 점수' }, { key: 'classAvg', color: '#8E8E93', name: '전체 평균' }]} height={200} />
                  <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#007AFF', marginRight: 4, verticalAlign: 'middle' }} />개인 점수</span>
                    <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#8E8E93', marginRight: 4, verticalAlign: 'middle' }} />전체 평균</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                    {studentGrowthData.merged.map(d => {
                      const g = d.avg - d.classAvg;
                      const isBigGap = g < -15;
                      const dt = new Date(d.date);
                      return (
                        <button key={d.date} onClick={() => setStudentDateModal(d.date)} style={{
                          background: isBigGap ? 'var(--red-dim)' : g > 10 ? 'var(--green-dim)' : 'var(--bg-elevated)',
                          border: `1px solid ${isBigGap ? 'var(--red)' : g > 10 ? 'var(--green)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 11,
                          color: isBigGap ? 'var(--red)' : g > 10 ? 'var(--green)' : 'var(--text-second)',
                          fontWeight: isBigGap || g > 10 ? 700 : 400, cursor: 'pointer',
                        }}>{dt.getMonth() + 1}/{dt.getDate()}{isBigGap && ' ▼'}{g > 10 && ' ▲'}</button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>날짜를 클릭하면 &quot;다른 애들은 맞췄는데 이 학생만 틀린 문항&quot;과 약점 분석을 볼 수 있어요</p>
                </>
              ) : <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{analysisStudentId ? '시험 데이터가 없습니다.' : '교육생을 선택하면 전체 평균과 비교한 성장 곡선이 보여요.'}</p>}
            </div>
          </div>

          {/* 히트맵 */}
          <div style={analysisCardStyle}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>카테고리별 약점 맵</h3>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, marginTop: -8 }}>
              <b>가로축</b> = 대분류 (제품군), <b>세로축</b> = 소분류 (지식 유형). 셀 색상은 전체 교육생 정답률이에요.
              <span style={{ marginLeft: 8 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: '#30D15833', borderRadius: 2, marginRight: 2 }} />80%+
                <span style={{ display: 'inline-block', width: 10, height: 10, background: '#FF9F0A33', borderRadius: 2, marginLeft: 8, marginRight: 2 }} />60~79%
                <span style={{ display: 'inline-block', width: 10, height: 10, background: '#FF453A33', borderRadius: 2, marginLeft: 8, marginRight: 2 }} />60% 미만
              </span>
              <br />셀을 <b>클릭</b>하면 해당 문항 목록과 오답률을 볼 수 있어요.
            </p>
            {heatmapData.data.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${heatmapData.categories.length}, minmax(80px, 1fr))`, gap: 3 }}>
                  <div style={{ padding: 8, fontWeight: 800, fontSize: 12, color: 'var(--text-second)' }}>소분류 ↓ / 대분류 →</div>
                  {heatmapData.categories.map(cat => (
                    <div key={cat} style={{ textAlign: 'center', padding: 8, fontWeight: 700, color: 'var(--text-primary)', fontSize: 12, background: 'var(--bg-elevated)', borderRadius: 4 }}>{cat}</div>
                  ))}
                  {heatmapData.details.map(det => (
                    <div key={det} style={{ display: 'contents' }}>
                      <div style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-second)', fontSize: 12, display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 4 }}>{det}</div>
                      {heatmapData.categories.map(cat => {
                        const cell = heatmapData.data.find(d => d.category === cat && d.detail === det);
                        if (!cell) return <div key={`${cat}-${det}`} style={{ textAlign: 'center', padding: 8, color: 'var(--text-muted)', fontSize: 12, background: 'var(--bg-hover)', borderRadius: 4 }}>—</div>;
                        const rc = rateColor(cell.rate);
                        return (
                          <div key={`${cat}-${det}`} onClick={() => setHeatmapModal({ category: cat, detail: det })} style={{ textAlign: 'center', padding: 8, background: rc.bg, color: rc.text, fontSize: 13, fontWeight: 700, borderRadius: 4, cursor: 'pointer' }} title={`${cat} > ${det}: ${cell.rate}% (${cell.totalQ}문항)`}>
                            {cell.rate}%
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>시험 응답 데이터가 없습니다.</p>}
          </div>
        </div>
      )}

      {/* 날짜별 상세 분석 모달 */}
      {analysisDate && dateAnalysis && (
        <div onClick={() => setAnalysisDate(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 720, width: '90%', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{(() => { const d = new Date(dateAnalysis.date); return `${d.getMonth() + 1}/${d.getDate()}`; })()} 시험 상세 분석</h3>
                <div style={{ fontSize: 15, fontWeight: 600, color: dateAnalysis.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  전체 평균 {dateAnalysis.avg}점{dateAnalysis.prevAvg !== null && <span> (전일 대비 {dateAnalysis.change >= 0 ? '+' : ''}{dateAnalysis.change}점)</span>}
                </div>
              </div>
              <button onClick={() => setAnalysisDate(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {dateAnalysis.sessions.map(s => <span key={s} style={{ background: 'var(--blue-dim)', color: 'var(--blue)', borderRadius: 'var(--radius-pill)', padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>{s}</span>)}
              {dateAnalysis.categories.map(cat => <span key={cat} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '4px 12px', fontSize: 13, color: 'var(--text-second)' }}>{cat}</span>)}
            </div>
            {dateAnalysis.questionStats.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>문항별 정답률</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dateAnalysis.questionStats.map((q, i) => {
                    const rc = rateColor(100 - q.wrongRate);
                    return (
                      <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{q.session} Q{q.questionId}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--green)' }}>정답 {q.correct}명</span>
                            <span style={{ fontSize: 12, color: 'var(--red)' }}>오답 {q.wrong}명</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: rc.text, background: rc.bg, borderRadius: 'var(--radius-pill)', padding: '2px 8px' }}>오답률 {q.wrongRate}%</span>
                          </div>
                        </div>
                        {q.questionText && <p style={{ fontSize: 13, color: 'var(--text-second)', margin: 0, lineHeight: 1.5 }}>{q.questionText.length > 100 ? q.questionText.slice(0, 100) + '...' : q.questionText}</p>}
                        {(q.category || q.detail) && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            {q.category && <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-hover)', borderRadius: 4, padding: '1px 6px' }}>{q.category}</span>}
                            {q.detail && <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-hover)', borderRadius: 4, padding: '1px 6px' }}>{q.detail}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>교육생별 점수</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {dateAnalysis.studentScores.map((s, i) => {
                  const isDown = (s.diff ?? 0) < -10; const isUp = (s.diff ?? 0) > 5;
                  return (
                    <div key={i} style={{ background: isDown ? 'var(--red-dim)' : isUp ? 'var(--green-dim)' : 'var(--bg-surface)', border: `1px solid ${isDown ? 'var(--red)' : isUp ? 'var(--green)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', padding: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{s.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: isDown ? 'var(--red)' : isUp ? 'var(--green)' : 'var(--text-primary)' }}>{s.score}점</span>
                        {s.diff !== null && <span style={{ fontSize: 13, fontWeight: 600, color: s.diff >= 0 ? 'var(--green)' : 'var(--red)' }}>{s.diff >= 0 ? '▲' : '▼'} {Math.abs(s.diff)}</span>}
                      </div>
                      {s.prevScore !== null && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>전일 {s.prevScore}점</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 학생별 날짜 분석 모달 */}
      {studentDateModal && studentDateAnalysis && (
        <div onClick={() => setStudentDateModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 720, width: '90%', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{studentDateAnalysis.studentName} — {(() => { const d = new Date(studentDateAnalysis.date); return `${d.getMonth() + 1}/${d.getDate()}`; })()} 분석</h3>
                <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
                  <span style={{ color: 'var(--text-second)' }}>개인 <b style={{ color: studentDateAnalysis.gap >= 0 ? 'var(--green)' : 'var(--red)' }}>{studentDateAnalysis.myAvg}점</b></span>
                  <span style={{ color: 'var(--text-muted)' }}>전체 평균 {studentDateAnalysis.classAvg}점</span>
                  <span style={{ fontWeight: 700, color: studentDateAnalysis.gap >= 0 ? 'var(--green)' : 'var(--red)' }}>{studentDateAnalysis.gap >= 0 ? '+' : ''}{studentDateAnalysis.gap}점 차이</span>
                </div>
              </div>
              <button onClick={() => setStudentDateModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 12, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{studentDateAnalysis.totalQ}문항</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>총 문항</div></div>
              <div style={{ background: 'var(--green-dim)', borderRadius: 'var(--radius-md)', padding: 12, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>{studentDateAnalysis.myCorrectCount}개 정답</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>맞힌 문항</div></div>
              <div style={{ background: 'var(--red-dim)', borderRadius: 'var(--radius-md)', padding: 12, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)' }}>{studentDateAnalysis.myWrongCount}개 오답</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>틀린 문항</div></div>
            </div>
            {studentDateAnalysis.onlyMyWrong.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)', marginBottom: 12 }}>다른 교육생은 맞췄는데 {studentDateAnalysis.studentName}만 틀린 문항 ({studentDateAnalysis.onlyMyWrong.length}개)</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {studentDateAnalysis.onlyMyWrong.map((q, i) => (
                    <div key={i} style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{q.session} Q{q.questionId}</span>
                        <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>전체 정답률 {q.classRate}%</span>
                      </div>
                      {q.questionText && <p style={{ fontSize: 13, color: 'var(--text-second)', margin: '0 0 6px', lineHeight: 1.5 }}>{q.questionText.length > 120 ? q.questionText.slice(0, 120) + '...' : q.questionText}</p>}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {q.category && <span style={{ fontSize: 11, background: 'var(--bg-hover)', borderRadius: 4, padding: '1px 6px', color: 'var(--text-muted)' }}>{q.category}</span>}
                        {q.detail && <span style={{ fontSize: 11, background: 'var(--bg-hover)', borderRadius: 4, padding: '1px 6px', color: 'var(--text-muted)' }}>{q.detail}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(studentDateAnalysis.topWeakCategories.length > 0 || studentDateAnalysis.topWeakDetails.length > 0) && (
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--orange)', marginBottom: 12 }}>약점 패턴 분석</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>약한 제품군 (대분류)</div>
                    {studentDateAnalysis.topWeakCategories.map(([cat, count], i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-second)' }}>{cat}</span>
                        <span style={{ color: 'var(--red)', fontWeight: 700 }}>{count}문항 오답</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>약한 지식 유형 (소분류)</div>
                    {studentDateAnalysis.topWeakDetails.map(([det, count], i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-second)' }}>{det}</span>
                        <span style={{ color: 'var(--red)', fontWeight: 700 }}>{count}문항 오답</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 12, background: 'var(--blue-dim)', border: '1px solid var(--blue)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)', marginBottom: 6 }}>교육 제안</div>
                  <div style={{ fontSize: 13, color: 'var(--text-second)', lineHeight: 1.6 }}>
                    {studentDateAnalysis.topWeakCategories.length > 0 && <p style={{ margin: '0 0 4px' }}>• <b>{studentDateAnalysis.topWeakCategories[0][0]}</b> 분야 제품 지식을 집중 보강해주세요</p>}
                    {studentDateAnalysis.topWeakDetails.length > 0 && <p style={{ margin: '0 0 4px' }}>• 특히 <b>{studentDateAnalysis.topWeakDetails[0][0]}</b> 유형의 문제를 많이 틀렸어요</p>}
                    {studentDateAnalysis.onlyMyWrong.length > 0 && <p style={{ margin: 0 }}>• &quot;나만 틀린 문항&quot; {studentDateAnalysis.onlyMyWrong.length}개는 스터디 그룹으로 빠르게 따라잡을 수 있어요</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 히트맵 모달 */}
      {heatmapModal && (
        <div onClick={() => setHeatmapModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 560, width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{heatmapModal.category} &gt; {heatmapModal.detail}</h3>
              <button onClick={() => setHeatmapModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            {heatmapModalData.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-second)' }}>차시</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-second)' }}>문항</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--green)' }}>정답</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--red)' }}>오답</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-second)' }}>오답률</th>
                </tr></thead>
                <tbody>{heatmapModalData.map((q, i) => {
                  const rc = rateColor(100 - q.wrongRate);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{q.session}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>Q{q.questionId}</td>
                      <td style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--green)', fontWeight: 600 }}>{q.correct}명</td>
                      <td style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--red)', fontWeight: 600 }}>{q.wrong}명</td>
                      <td style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700, color: rc.text }}>{q.wrongRate}%</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            ) : <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>해당 문항 데이터가 없습니다.</p>}
          </div>
        </div>
      )}

      {/* ════════════ 차시별 성적 (기존) ════════════ */}
      {pageTab === 'manage' && <>

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
                  <Row label="응시" value={`${stat.count}/${activeStudents.length}명`} color={stat.count < activeStudents.length ? 'var(--orange)' : undefined} />
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
              데이터 불러오는 중...
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
                          borderRadius: 'var(--radius-pill)', background: 'var(--red-dim)', color: 'var(--red)',
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
                                border: `1px solid ${r.is_correct ? 'var(--border)' : 'var(--red-dim)'}`,
                                background: r.is_correct ? 'var(--bg-surface)' : 'var(--red-dim)',
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
                                    background: 'var(--blue-dim)', border: '1px solid var(--blue-dim)',
                                    cursor: 'pointer', transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--blue)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--blue-dim)'; }}
                                >
                                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>정답:</span>
                                  <span style={{ fontSize: 15, color: 'var(--blue-light)', fontWeight: 600 }}>{q.correct_answer}</span>
                                  <span style={{
                                    fontSize: 12, color: 'var(--purple)', padding: '2px 8px',
                                    borderRadius: 'var(--radius-pill)', background: 'var(--purple-dim)',
                                    marginLeft: 8,
                                  }}>{q.scoring_mode}</span>
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>클릭하여 수정</span>
                                </div>
                              )}
                            </div>

                            {/* 해설 */}
                            {q.explanation && (
                              <div style={{ marginLeft: hasSubs ? 50 : 0, marginTop: 8, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                                {q.explanation}
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
                                                background: currentCorrect ? 'var(--green)' : 'var(--green-dim)',
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
                                                background: !currentCorrect ? 'var(--red)' : 'var(--red-dim)',
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
                                      border: '1px solid var(--orange)', background: 'var(--orange-dim)',
                                      color: 'var(--orange)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    서술형 채점하기 ({qResp.filter((r) => !r.is_correct).length}명 미채점/오답)
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

      </>}
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
      background: correct ? 'var(--green-dim)' : 'var(--red-dim)',
      color: correct ? 'var(--green)' : 'var(--red)',
    }}>
      {correct ? 'O' : 'X'}
    </span>
  );
}

function AnswerBox({ label, value, color }: { label: string; value: string; color: 'green' | 'red' | 'blue' }) {
  const colors = {
    green: { bg: 'var(--green-dim)', border: 'var(--green-dim)', text: 'var(--green)' },
    red: { bg: 'var(--red-dim)', border: 'var(--red-dim)', text: 'var(--red)' },
    blue: { bg: 'var(--blue-dim)', border: 'var(--blue-dim)', text: 'var(--blue-light)' },
  };
  const c = colors[color];
  return (
    <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: c.bg, border: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: c.text, fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}
