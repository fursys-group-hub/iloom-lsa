'use client';

import { useState, useMemo } from 'react';
import type { Batch, Student, TestScore, Attendance, AdaptationIndex } from '@/lib/types';
import { calculateAdaptationIndex, calculateRiskChecklist, calculateAvgScore, calculateDailyAverages } from '@/lib/analysis';
import ScoreTrendChart from '@/components/charts/ScoreTrendChart';

// ── 타입 ──
interface NoteRow { id: string; student_id: string; title: string; content: string; created_at: string; }
interface TestResponse { student_id: string; batch_id: string; session: string; question_id: string; is_correct: boolean; test_date: string; }
interface Question { id: string; batch_id: string; session: string; question_id: string; category: string | null; series: string | null; detail: string | null; question_text: string | null; }

interface Props {
  batches: Batch[];
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
  notes: NoteRow[];
  testResponses: TestResponse[];
  questions: Question[];
  studentQuestions: { id: string; student_id: string }[];
  memos: { student_id: string; category: string }[];
  coaching: { student_id: string; tag_tracking: unknown }[];
}

// ── 스타일 ──
const cardStyle: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 };
const sectionTitle: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 };

// ── 유틸 ──
function parseNoteMeta(content: string) {
  try {
    const parsed = JSON.parse(content);
    const meta = parsed.meta || {};
    const steps = parsed.steps || {};
    let pScore = meta.participation_score;
    if (pScore === undefined) {
      pScore = 0;
      if (steps.step1 && String(steps.step1).trim()) pScore++;
      if (steps.step2 && String(steps.step2).trim()) pScore++;
      if (steps.step3 && String(steps.step3).trim()) pScore++;
    }
    return { participation_score: pScore as number, confidence: (meta.confidence || null) as string | null, tags: (meta.tags || []) as string[] };
  } catch { return { participation_score: 0, confidence: null, tags: [] as string[] }; }
}

const GROUP_COLORS = {
  high: { bg: 'var(--green-dim)', text: 'var(--green)', label: '상' },
  mid: { bg: 'var(--orange-dim)', text: 'var(--orange)', label: '중' },
  low: { bg: 'var(--red-dim)', text: 'var(--red)', label: '하' },
};

// 자신감 영어→한국어 변환
function confToKor(c: string | null | undefined): string {
  if (!c) return '';
  const lower = c.toLowerCase();
  if (lower === 'confident') return '높음';
  if (lower === 'half' || lower === 'understood') return '보통';
  if (lower === 'low') return '낮음';
  return c; // 이미 한국어면 그대로
}

function rateColor(rate: number) {
  if (rate >= 80) return { bg: '#30D15833', text: 'var(--green)' };
  if (rate >= 60) return { bg: '#FF9F0A33', text: 'var(--orange)' };
  return { bg: '#FF453A33', text: 'var(--red)' };
}

// ── 메인 ──
export default function AnalyticsClient({ batches, students, scores, attendance, notes, testResponses, questions, studentQuestions, memos }: Props) {
  // 기수 선택
  const activeBatches = batches.filter(b => !b.is_archived);
  const archivedBatches = batches.filter(b => b.is_archived);
  const [selectedBatchId, setSelectedBatchId] = useState(activeBatches[0]?.id || batches[0]?.id || '');
  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  // 상태
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [heatmapModal, setHeatmapModal] = useState<{ category: string; detail: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 기수별 학생
  const batchStudents = useMemo(() => students.filter(s => s.batch_id === selectedBatchId && !s.is_dropped), [students, selectedBatchId]);

  // 교육일수
  const totalEducationDays = useMemo(() => {
    if (!selectedBatch) return 20;
    const start = new Date(selectedBatch.start_date);
    const end = new Date(selectedBatch.end_date);
    const today = new Date();
    const effectiveEnd = today < end ? today : end;
    let days = 0;
    const d = new Date(start);
    while (d <= effectiveEnd) { if (d.getDay() !== 0 && d.getDay() !== 6) days++; d.setDate(d.getDate() + 1); }
    return Math.max(days, 1);
  }, [selectedBatch]);

  // ── 학생별 카테고리 정답률 (적응 지수 + 위험 체크에 사용) ──
  const studentCategoryRates = useMemo(() => {
    const result = new Map<string, { category: string; rate: number }[]>();
    const batchStudentIds = new Set(batchStudents.map(s => s.id));
    const qMap = new Map<string, Question>();
    for (const q of questions) {
      if (q.batch_id === selectedBatchId) qMap.set(`${q.session}_${q.question_id}`, q);
    }

    for (const studentId of batchStudentIds) {
      const catMap = new Map<string, { correct: number; total: number }>();
      const sResponses = testResponses.filter(r => r.student_id === studentId);
      for (const r of sResponses) {
        const q = qMap.get(`${r.session}_${r.question_id}`);
        if (!q || !q.category) continue;
        const cell = catMap.get(q.category) || { correct: 0, total: 0 };
        cell.total++;
        if (r.is_correct) cell.correct++;
        catMap.set(q.category, cell);
      }
      result.set(studentId, [...catMap.entries()].map(([category, v]) => ({
        category,
        rate: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      })));
    }
    return result;
  }, [batchStudents, testResponses, questions, selectedBatchId]);

  // ── 적응 지수 ──
  const adaptationIndices = useMemo(() => {
    return batchStudents.map(student => {
      const sScores = scores.filter(s => s.student_id === student.id);
      const sAttendance = attendance.filter(a => a.student_id === student.id);
      const sNotes = notes.filter(n => n.student_id === student.id).map(n => ({ ...parseNoteMeta(n.content), created_at: n.created_at }));
      const catRates = studentCategoryRates.get(student.id) || [];

      return calculateAdaptationIndex({
        studentId: student.id,
        studentName: student.name,
        scores: sScores,
        attendance: sAttendance,
        notes: sNotes,
        totalEducationDays,
        categoryRates: catRates,
      });
    }).sort((a, b) => b.total - a.total);
  }, [batchStudents, scores, attendance, notes, studentCategoryRates, totalEducationDays]);

  // ── 위험 체크리스트 ──
  const riskChecks = useMemo(() => {
    return batchStudents.map(student => {
      const sScores = scores.filter(s => s.student_id === student.id);
      const sAttendance = attendance.filter(a => a.student_id === student.id);
      const sNotes = notes.filter(n => n.student_id === student.id).map(n => ({ ...parseNoteMeta(n.content), created_at: n.created_at }));
      const sMemoCategories = memos.filter(m => m.student_id === student.id).map(m => m.category);
      const catRates = studentCategoryRates.get(student.id) || [];

      return calculateRiskChecklist({
        studentId: student.id,
        studentName: student.name,
        scores: sScores,
        attendance: sAttendance,
        notes: sNotes,
        memoCategories: sMemoCategories,
        totalEducationDays,
        categoryRates: catRates,
      });
    }).filter(r => r.riskCount > 0).sort((a, b) => b.riskCount - a.riskCount);
  }, [batchStudents, scores, attendance, notes, memos, studentCategoryRates, totalEducationDays]);

  // ── 시험 성적 추이 ──
  const dailyAverages = useMemo(() => {
    const batchScores = scores.filter(s => batchStudents.some(st => st.id === s.student_id));
    return calculateDailyAverages(batchScores);
  }, [scores, batchStudents]);

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentDateModal, setStudentDateModal] = useState<string | null>(null);
  // 개인 곡선 + 전체 평균 합친 데이터
  const studentGrowthData = useMemo(() => {
    if (!selectedStudentId) return { merged: [], summary: null };
    const personalAvgs = calculateDailyAverages(scores.filter(s => s.student_id === selectedStudentId));
    // 날짜 기준으로 전체 평균과 합치기
    const avgMap = new Map(dailyAverages.map(d => [d.date, d.avg]));
    const merged = personalAvgs.map(d => ({
      date: d.date,
      avg: d.avg,       // 개인 점수
      classAvg: avgMap.get(d.date) ?? 0,  // 전체 평균
    }));
    // 요약: 첫 시험 vs 최근 시험
    const first = personalAvgs[0]?.avg ?? 0;
    const last = personalAvgs[personalAvgs.length - 1]?.avg ?? 0;
    const diff = Math.round((last - first) * 10) / 10;
    const overall = personalAvgs.length > 0 ? Math.round(personalAvgs.reduce((s, d) => s + d.avg, 0) / personalAvgs.length * 10) / 10 : 0;
    return { merged, summary: { first, last, diff, overall, count: personalAvgs.length } };
  }, [selectedStudentId, scores, dailyAverages]);

  // ── 학생별 날짜 분석 (성장 곡선 날짜 클릭 시) ──
  const studentDateAnalysis = useMemo(() => {
    if (!studentDateModal || !selectedStudentId) return null;
    const batchStudentIds = new Set(batchStudents.map(s => s.id));
    const qMap = new Map<string, Question>();
    for (const q of questions) {
      if (q.batch_id === selectedBatchId) qMap.set(`${q.session}_${q.question_id}`, q);
    }

    const student = batchStudents.find(s => s.id === selectedStudentId);
    if (!student) return null;

    // 해당 날짜의 이 학생 응답
    const myResponses = testResponses.filter(r => r.student_id === selectedStudentId && r.test_date === studentDateModal);
    // 해당 날짜의 전체 응답
    const allDayResponses = testResponses.filter(r => r.test_date === studentDateModal && batchStudentIds.has(r.student_id));

    // 문항별: 전체 정답률 vs 이 학생 정답 여부
    const qAnalysis: { session: string; questionId: string; questionText: string; category: string; detail: string; myCorrect: boolean; classCorrect: number; classTotal: number; classRate: number; }[] = [];

    // 이 학생이 응시한 문항들
    for (const myR of myResponses) {
      const q = qMap.get(`${myR.session}_${myR.question_id}`);
      if (!q) continue;

      // 전체 학생의 해당 문항 정답률
      const classForQ = allDayResponses.filter(r => r.session === myR.session && r.question_id === myR.question_id);
      const classCorrect = classForQ.filter(r => r.is_correct).length;

      qAnalysis.push({
        session: myR.session,
        questionId: myR.question_id,
        questionText: q.question_text || '',
        category: q.category || '',
        detail: q.detail || '',
        myCorrect: myR.is_correct,
        classCorrect,
        classTotal: classForQ.length,
        classRate: classForQ.length > 0 ? Math.round((classCorrect / classForQ.length) * 100) : 0,
      });
    }

    // "나만 틀린 문항" = 내가 오답 + 전체 정답률 70% 이상
    const onlyMyWrong = qAnalysis.filter(q => !q.myCorrect && q.classRate >= 70)
      .sort((a, b) => b.classRate - a.classRate);

    // "모두 어려운 문항" = 전체 정답률 50% 미만
    const hardForAll = qAnalysis.filter(q => q.classRate < 50)
      .sort((a, b) => a.classRate - b.classRate);

    // 약점 패턴 분석: 틀린 문항들의 카테고리/소분류 집계
    const wrongByCategory = new Map<string, number>();
    const wrongByDetail = new Map<string, number>();
    for (const q of qAnalysis.filter(q => !q.myCorrect)) {
      if (q.category) wrongByCategory.set(q.category, (wrongByCategory.get(q.category) || 0) + 1);
      if (q.detail) wrongByDetail.set(q.detail, (wrongByDetail.get(q.detail) || 0) + 1);
    }
    const topWeakCategories = [...wrongByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topWeakDetails = [...wrongByDetail.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    // 이 학생의 점수
    const myDayScores = scores.filter(s => s.student_id === selectedStudentId && s.test_date === studentDateModal);
    const myAvg = myDayScores.length > 0 ? Math.round(myDayScores.reduce((s, x) => s + x.score, 0) / myDayScores.length * 10) / 10 : 0;
    const classAvgForDay = dailyAverages.find(d => d.date === studentDateModal)?.avg ?? 0;
    const gap = Math.round((myAvg - classAvgForDay) * 10) / 10;

    const totalQ = qAnalysis.length;
    const myCorrectCount = qAnalysis.filter(q => q.myCorrect).length;
    const myWrongCount = totalQ - myCorrectCount;

    return {
      studentName: student.name,
      date: studentDateModal,
      myAvg,
      classAvg: classAvgForDay,
      gap,
      totalQ,
      myCorrectCount,
      myWrongCount,
      onlyMyWrong,
      hardForAll,
      topWeakCategories,
      topWeakDetails,
    };
  }, [studentDateModal, selectedStudentId, testResponses, questions, scores, batchStudents, dailyAverages, selectedBatchId]);

  // ── 날짜별 분석 (차트 클릭 시) ──
  const dateAnalysis = useMemo(() => {
    if (!selectedDate) return null;
    const batchStudentIds = new Set(batchStudents.map(s => s.id));
    const qMap = new Map<string, Question>();
    for (const q of questions) {
      if (q.batch_id === selectedBatchId) qMap.set(`${q.session}_${q.question_id}`, q);
    }

    const currIdx = dailyAverages.findIndex(d => d.date === selectedDate);
    const curr = dailyAverages[currIdx];
    const prev = currIdx > 0 ? dailyAverages[currIdx - 1] : null;
    if (!curr) return null;

    const change = prev ? Math.round((curr.avg - prev.avg) * 10) / 10 : 0;

    // 해당 날짜 시험
    const dayScores = scores.filter(s => s.test_date === selectedDate && batchStudentIds.has(s.student_id));
    const daySessions = [...new Set(dayScores.map(s => s.subject))];

    // 해당 날짜의 test_responses를 test_date로 직접 필터
    const dayResponses = testResponses.filter(r =>
      r.test_date === selectedDate && batchStudentIds.has(r.student_id)
    );

    // 분야
    const dayCategories = new Set<string>();
    for (const r of dayResponses) {
      const q = qMap.get(`${r.session}_${r.question_id}`);
      if (q?.category) dayCategories.add(q.category);
    }

    // 문항별 오답률 + 문항 텍스트
    const qStats = new Map<string, { session: string; questionId: string; questionText: string; wrong: number; correct: number; total: number; category: string; detail: string }>();
    for (const r of dayResponses) {
      const q = qMap.get(`${r.session}_${r.question_id}`);
      if (!q) continue;
      const key = `${r.session}_${r.question_id}`;
      const stat = qStats.get(key) || { session: r.session, questionId: r.question_id, questionText: q.question_text || '', wrong: 0, correct: 0, total: 0, category: q.category || '', detail: q.detail || '' };
      stat.total++;
      if (r.is_correct) stat.correct++; else stat.wrong++;
      qStats.set(key, stat);
    }
    const questionStats = [...qStats.values()]
      .map(s => ({ ...s, wrongRate: s.total > 0 ? Math.round((s.wrong / s.total) * 100) : 0 }))
      .sort((a, b) => b.wrongRate - a.wrongRate);

    // 교육생별 점수
    const studentScores: { name: string; score: number; prevScore: number | null; diff: number | null }[] = [];
    for (const student of batchStudents) {
      const currS = dayScores.filter(s => s.student_id === student.id);
      if (currS.length === 0) continue;
      const currAvg = Math.round(currS.reduce((s, x) => s + x.score, 0) / currS.length * 10) / 10;
      let prevScore: number | null = null;
      let diff: number | null = null;
      if (prev) {
        const prevS = scores.filter(s => s.test_date === prev.date && s.student_id === student.id);
        if (prevS.length > 0) {
          prevScore = Math.round(prevS.reduce((s, x) => s + x.score, 0) / prevS.length * 10) / 10;
          diff = Math.round((currAvg - prevScore) * 10) / 10;
        }
      }
      studentScores.push({ name: student.name, score: currAvg, prevScore, diff });
    }
    studentScores.sort((a, b) => (a.diff ?? 0) - (b.diff ?? 0));

    return {
      date: selectedDate,
      avg: curr.avg,
      prevAvg: prev?.avg ?? null,
      change,
      categories: [...dayCategories],
      sessions: daySessions,
      questionStats,
      studentScores,
    };
  }, [selectedDate, dailyAverages, scores, testResponses, questions, batchStudents, selectedBatchId]);

  // ── 히트맵 ──
  const heatmapData = useMemo(() => {
    const batchStudentIds = new Set(batchStudents.map(s => s.id));
    const batchResponses = testResponses.filter(r => batchStudentIds.has(r.student_id));
    const qMap = new Map<string, Question>();
    for (const q of questions) {
      if (q.batch_id === selectedBatchId) qMap.set(`${q.session}_${q.question_id}`, q);
    }
    const cellMap = new Map<string, { correct: number; total: number }>();
    const allCats = new Set<string>();
    const allDets = new Set<string>();
    for (const r of batchResponses) {
      const q = qMap.get(`${r.session}_${r.question_id}`);
      if (!q || !q.category) continue;
      const cat = q.category;
      const det = q.detail || '기타';
      allCats.add(cat);
      allDets.add(det);
      const key = `${cat}__${det}`;
      const cell = cellMap.get(key) || { correct: 0, total: 0 };
      cell.total++;
      if (r.is_correct) cell.correct++;
      cellMap.set(key, cell);
    }
    const categories = [...allCats].sort();
    const details = [...allDets].sort();
    const data: { category: string; detail: string; rate: number; totalQ: number }[] = [];
    for (const cat of categories) {
      for (const det of details) {
        const cell = cellMap.get(`${cat}__${det}`);
        if (cell && cell.total > 0) data.push({ category: cat, detail: det, rate: Math.round((cell.correct / cell.total) * 100), totalQ: cell.total });
      }
    }
    return { data, categories, details };
  }, [batchStudents, testResponses, questions, selectedBatchId]);

  // ── 히트맵 모달: 해당 셀의 문항 목록 ──
  const heatmapModalData = useMemo(() => {
    if (!heatmapModal) return [];
    const { category, detail } = heatmapModal;
    const batchStudentIds = new Set(batchStudents.map(s => s.id));
    const qMap = new Map<string, Question>();
    for (const q of questions) {
      if (q.batch_id === selectedBatchId) qMap.set(`${q.session}_${q.question_id}`, q);
    }
    // 해당 카테고리+소분류의 문항별 통계
    const qStats = new Map<string, { questionId: string; session: string; correct: number; wrong: number; total: number }>();
    for (const r of testResponses) {
      if (!batchStudentIds.has(r.student_id)) continue;
      const q = qMap.get(`${r.session}_${r.question_id}`);
      if (!q || q.category !== category || (q.detail || '기타') !== detail) continue;
      const key = `${r.session}_${r.question_id}`;
      const stat = qStats.get(key) || { questionId: r.question_id, session: r.session, correct: 0, wrong: 0, total: 0 };
      stat.total++;
      if (r.is_correct) stat.correct++; else stat.wrong++;
      qStats.set(key, stat);
    }
    return [...qStats.values()]
      .map(s => ({ ...s, wrongRate: s.total > 0 ? Math.round((s.wrong / s.total) * 100) : 0 }))
      .sort((a, b) => b.wrongRate - a.wrongRate);
  }, [heatmapModal, batchStudents, testResponses, questions, selectedBatchId]);

  // ── 태도/참여 통계 ──
  const participationStats = useMemo(() => {
    let totalAttRate = 0, totalSubmitRate = 0, totalPart = 0;
    const count = batchStudents.length || 1;
    for (const student of batchStudents) {
      const sAtt = attendance.filter(a => a.student_id === student.id);
      let attScore = 0;
      for (const a of sAtt) { if (a.status === 'present') attScore += 1; else if (a.status === 'late' || a.status === 'early_leave') attScore += 0.5; }
      totalAttRate += totalEducationDays > 0 ? (attScore / totalEducationDays) * 100 : 0;
      const sNotes = notes.filter(n => n.student_id === student.id);
      const eduNotes = sNotes.filter(n => { const m = parseNoteMeta(n.content); return !m.tags?.includes('실습일지') && !m.tags?.includes('자율학습'); });
      totalSubmitRate += totalEducationDays > 0 ? (eduNotes.length / totalEducationDays) * 100 : 0;
      const parsed = eduNotes.map(n => parseNoteMeta(n.content));
      totalPart += parsed.length > 0 ? (parsed.reduce((s, p) => s + (p.participation_score || 0), 0) / parsed.length / 3) * 100 : 0;
    }
    return { avgAttendance: Math.round(totalAttRate / count), avgSubmitRate: Math.round(totalSubmitRate / count), avgParticipation: Math.round(totalPart / count) };
  }, [batchStudents, attendance, notes, totalEducationDays]);

  // ── 자신감 추이 ──
  const confidenceTrendData = useMemo(() => {
    const dateMap = new Map<string, { confident: number; half: number; low: number; total: number }>();
    for (const student of batchStudents) {
      for (const note of notes.filter(n => n.student_id === student.id)) {
        const meta = parseNoteMeta(note.content);
        if (meta.tags?.includes('실습일지') || meta.tags?.includes('자율학습')) continue;
        const conf = (meta.confidence || '').toLowerCase();
        if (!conf) continue;
        const date = note.created_at.slice(0, 10);
        const entry = dateMap.get(date) || { confident: 0, half: 0, low: 0, total: 0 };
        entry.total++;
        if (conf === 'confident' || conf === '높음') entry.confident++;
        else if (conf === 'half' || conf === '보통' || conf === 'understood') entry.half++;
        else if (conf === 'low' || conf === '낮음') entry.low++;
        dateMap.set(date, entry);
      }
    }
    return [...dateMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
      date: date.slice(5),
      높음: v.total > 0 ? Math.round((v.confident / v.total) * 100) : 0,
      보통: v.total > 0 ? Math.round((v.half / v.total) * 100) : 0,
      낮음: v.total > 0 ? Math.round((v.low / v.total) * 100) : 0,
    }));
  }, [batchStudents, notes]);

  // ── 렌더 ──
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>📊 교육 효과 분석</h1>
          <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 14 }}>
            {activeBatches.length > 0 && <optgroup label="진행 중">{activeBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>}
            {archivedBatches.length > 0 && <optgroup label="보관됨">{archivedBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>}
          </select>
        </div>
        <button onClick={() => window.print()} style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>📄 PDF 내보내기</button>
      </div>

      {/* ── 1. 교육생 종합 현황 ── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={sectionTitle}>🎯 교육생 종합 현황 — 입문교육 적응 지수</h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, marginTop: -8 }}>
          시험 평균(40%) + 하위 분야(20%) + 출석률(15%) + 교육일지 참여(15%) + 자신감 추이(10%)로 계산해요. 카드를 클릭하면 상세 근거를 볼 수 있어요.
        </p>
        {adaptationIndices.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>선택한 기수에 교육생이 없습니다.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {adaptationIndices.map(idx => {
              const gc = GROUP_COLORS[idx.group];
              const isExpanded = expandedCard === idx.studentId;
              return (
                <div key={idx.studentId} onClick={() => setExpandedCard(isExpanded ? null : idx.studentId)} style={{ background: idx.group === 'low' ? gc.bg : 'var(--bg-elevated)', border: `1px solid ${isExpanded ? gc.text : idx.group === 'low' ? gc.text : 'var(--border)'}`, borderRadius: 'var(--radius-md)', padding: 16, cursor: 'pointer', transition: 'border-color 0.2s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{idx.studentName}</span>
                    <span style={{ background: gc.bg, color: gc.text, borderRadius: 'var(--radius-pill)', padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>{gc.label} {idx.total}점</span>
                  </div>
                  {/* 게이지 */}
                  <div style={{ background: 'var(--bg-hover)', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${Math.min(idx.total, 100)}%`, background: gc.text, borderRadius: 6, transition: 'width 0.5s ease' }} />
                  </div>
                  {/* 요약 줄 */}
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
                    <span>시험 {idx.breakdown.examAvg}점</span>
                    <span>하위분야 {idx.breakdown.weakCategoryCount}/{idx.breakdown.totalCategories}개</span>
                    <span>출석 {idx.breakdown.attendanceRate}%</span>
                    <span>{isExpanded ? '▲ 접기' : '▼ 상세보기'}</span>
                  </div>
                  {/* 상세 근거 (펼침) */}
                  {isExpanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <DetailRow label="📝 시험 평균" score={idx.breakdown.examAvg} detail={`전체 시험 평균 ${idx.breakdown.examAvg}점 (가중치 40%)`} />
                      <DetailRow label="🗺️ 하위 분야" score={idx.breakdown.weakCategories} detail={`${idx.breakdown.totalCategories}개 분야 중 60점 미만 ${idx.breakdown.weakCategoryCount}개 (가중치 20%)`} />
                      <DetailRow label="📋 출석률" score={idx.breakdown.attendanceRate} detail={`출석률 ${idx.breakdown.attendanceRate}% (지각=0.5 반영, 가중치 15%)`} />
                      <DetailRow label="📓 교육일지 참여" score={idx.breakdown.participation} detail={`${idx.breakdown.participationDetail} (가중치 15%)`} />
                      <DetailRow label={`💪 자신감 추이${!idx.breakdown.hasConfidenceData ? ' (미입력)' : ''}`} score={idx.breakdown.confidenceTrend} detail={`${idx.breakdown.confidenceDetail} (가중치 10%)`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 2. 위험 교육생 알림 ── */}
      {riskChecks.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 20, borderColor: 'var(--red)' }}>
          <h2 style={sectionTitle}>⚠️ 주의가 필요한 교육생 ({riskChecks.length}명)</h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, marginTop: -8 }}>
            5개 항목 중 해당되는 것이 있는 교육생이에요. 자신감 미입력 시 해당 항목은 제외돼요.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {riskChecks.map(r => {
              // 적응 지수 "상"인 교육생은 별도 스타일
              const idx = adaptationIndices.find(a => a.studentId === r.studentId);
              const isHighGroup = idx?.group === 'high';

              let cardBg = r.riskCount >= 3 ? 'var(--red-dim)' : r.riskCount >= 2 ? 'var(--orange-dim)' : 'var(--bg-elevated)';
              let cardBorder = r.riskCount >= 3 ? 'var(--red)' : r.riskCount >= 2 ? 'var(--orange)' : 'var(--border)';
              let badgeBg = r.riskCount >= 3 ? 'var(--red)' : 'var(--orange)';
              let badgeText = r.riskCount >= 3 ? '위험' : '주의';

              if (isHighGroup) {
                cardBg = 'var(--blue-dim)';
                cardBorder = 'var(--blue)';
                badgeBg = 'var(--blue)';
                badgeText = '부분 주의';
              }

              return (
              <div key={r.studentId} style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
                borderRadius: 'var(--radius-md)',
                padding: 16,
              }}>
                {isHighGroup && (
                  <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, marginBottom: 6 }}>
                    💡 전체적으로 양호하지만 이 부분은 주의
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {r.studentName}
                    {idx && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>적응 {idx.total}점</span>}
                  </span>
                  <span style={{
                    background: badgeBg,
                    color: '#fff',
                    borderRadius: 'var(--radius-pill)',
                    padding: '2px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}>
                    {badgeText} {r.riskCount}개 해당
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.checks.filter(c => c.triggered).map((c, i) => {
                    // 자신감 값 한국어 변환
                    let displayValue = c.value;
                    if (c.label.includes('자신감') && c.value !== '미입력') {
                      displayValue = c.value.split(', ').map(v => confToKor(v)).join(' → ');
                    }
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <span style={{ color: 'var(--red)', fontSize: 14 }}>⚠️</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{c.label}</span>
                        <span style={{ color: 'var(--red)', fontWeight: 700, marginLeft: 'auto' }}>{displayValue}</span>
                      </div>
                    );
                  })}
                  {r.checks.filter(c => !c.triggered && c.value !== '미입력').length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {r.checks.filter(c => !c.triggered && c.value !== '미입력').map((c, i) => {
                        let v = c.value;
                        if (c.label.includes('자신감')) v = c.value.split(', ').map(s => confToKor(s)).join(' → ');
                        return <span key={i}>✓ {c.label} <span style={{ color: 'var(--green)' }}>{v}</span></span>;
                      })}
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. 시험 성적 추이 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={cardStyle}>
          <h2 style={sectionTitle}>📈 차시별 전체 평균 추이</h2>
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
              {/* 날짜 버튼 */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {dailyAverages.map((d, i) => {
                  const prev = i > 0 ? dailyAverages[i - 1] : null;
                  const change = prev ? Math.round((d.avg - prev.avg) * 10) / 10 : 0;
                  const isDown = change < -3;
                  const dt = new Date(d.date);
                  return (
                    <button key={d.date} onClick={() => setSelectedDate(d.date)} style={{
                      background: isDown ? 'var(--red-dim)' : 'var(--bg-elevated)',
                      border: `1px solid ${isDown ? 'var(--red)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 8px',
                      fontSize: 11,
                      color: isDown ? 'var(--red)' : 'var(--text-second)',
                      fontWeight: isDown ? 700 : 400,
                      cursor: 'pointer',
                    }}>
                      {dt.getMonth() + 1}/{dt.getDate()}
                      {isDown && ` ▼`}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>💡 날짜를 클릭하면 그날의 상세 분석을 볼 수 있어요. <span style={{ color: 'var(--red)' }}>빨간 날짜</span>는 3점 이상 하락한 날이에요.</p>
            </>
          ) : <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>시험 데이터가 없습니다.</p>}
        </div>
        <div style={cardStyle}>
          <h2 style={sectionTitle}>📊 교육생별 성장 곡선</h2>
          <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', fontSize: 13, marginBottom: 12 }}>
            <option value="">교육생 선택</option>
            {batchStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {selectedStudentId && studentGrowthData.merged.length > 0 ? (
            <>
              {/* 요약 */}
              {studentGrowthData.summary && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, fontSize: 13, flexWrap: 'wrap' }}>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>전체 평균 </span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{studentGrowthData.summary.overall}점</span>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>첫 시험 </span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{studentGrowthData.summary.first}점</span>
                    <span style={{ color: 'var(--text-muted)' }}> → 최근 </span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{studentGrowthData.summary.last}점</span>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>변화 </span>
                    <span style={{ fontWeight: 700, color: studentGrowthData.summary.diff >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {studentGrowthData.summary.diff >= 0 ? '+' : ''}{studentGrowthData.summary.diff}점
                    </span>
                  </div>
                </div>
              )}
              {/* 개인(파란) + 전체 평균(회색) */}
              <ScoreTrendChart
                data={studentGrowthData.merged}
                lines={[
                  { key: 'avg', color: '#007AFF', name: '개인 점수' },
                  { key: 'classAvg', color: '#8E8E93', name: '전체 평균' },
                ]}
                height={200}
              />
              <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#007AFF', marginRight: 4, verticalAlign: 'middle' }} />개인 점수</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#8E8E93', marginRight: 4, verticalAlign: 'middle' }} />전체 평균</span>
              </div>
              {/* 날짜 버튼: 평균과 차이가 큰 날 강조 */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {studentGrowthData.merged.map(d => {
                  const gap = d.avg - (d.classAvg as number);
                  const isBigGap = gap < -15;
                  const dt = new Date(d.date);
                  return (
                    <button key={d.date} onClick={() => setStudentDateModal(d.date)} style={{
                      background: isBigGap ? 'var(--red-dim)' : gap > 10 ? 'var(--green-dim)' : 'var(--bg-elevated)',
                      border: `1px solid ${isBigGap ? 'var(--red)' : gap > 10 ? 'var(--green)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 8px',
                      fontSize: 11,
                      color: isBigGap ? 'var(--red)' : gap > 10 ? 'var(--green)' : 'var(--text-second)',
                      fontWeight: isBigGap || gap > 10 ? 700 : 400,
                      cursor: 'pointer',
                    }}>
                      {dt.getMonth() + 1}/{dt.getDate()}
                      {isBigGap && ' ▼'}
                      {gap > 10 && ' ▲'}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>💡 날짜를 클릭하면 "다른 애들은 맞췄는데 이 학생만 틀린 문항"과 약점 분석을 볼 수 있어요</p>
            </>
          ) : <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{selectedStudentId ? '시험 데이터가 없습니다.' : '교육생을 선택하면 전체 평균과 비교한 성장 곡선이 보여요.'}</p>}
        </div>
      </div>

      {/* ── 3-1. 날짜별 상세 분석 모달 (차트 클릭 시) ── */}
      {selectedDate && dateAnalysis && (
        <div onClick={() => setSelectedDate(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 720, width: '90%', maxHeight: '85vh', overflow: 'auto' }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                  📋 {(() => { const d = new Date(dateAnalysis.date); return `${d.getMonth() + 1}/${d.getDate()}`; })()} 시험 상세 분석
                </h3>
                <div style={{ fontSize: 15, fontWeight: 600, color: dateAnalysis.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  전체 평균 {dateAnalysis.avg}점
                  {dateAnalysis.prevAvg !== null && (
                    <span> (전일 대비 {dateAnalysis.change >= 0 ? '+' : ''}{dateAnalysis.change}점)</span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedDate(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            {/* 시험 분야 + 차시 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {dateAnalysis.sessions.map(s => (
                <span key={s} style={{ background: 'var(--blue-dim)', color: 'var(--blue)', borderRadius: 'var(--radius-pill)', padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>{s}</span>
              ))}
              {dateAnalysis.categories.map(cat => (
                <span key={cat} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '4px 12px', fontSize: 13, color: 'var(--text-second)' }}>{cat}</span>
              ))}
            </div>

            {/* 문항별 오답률 */}
            {dateAnalysis.questionStats.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🚨 문항별 정답률</h4>
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
                        {q.questionText && (
                          <p style={{ fontSize: 13, color: 'var(--text-second)', margin: 0, lineHeight: 1.5 }}>{q.questionText.length > 100 ? q.questionText.slice(0, 100) + '...' : q.questionText}</p>
                        )}
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

            {/* 교육생별 점수 카드 */}
            <div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>👤 교육생별 점수</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {dateAnalysis.studentScores.map((s, i) => {
                  const isDown = (s.diff ?? 0) < -10;
                  const isUp = (s.diff ?? 0) > 5;
                  return (
                    <div key={i} style={{
                      background: isDown ? 'var(--red-dim)' : isUp ? 'var(--green-dim)' : 'var(--bg-surface)',
                      border: `1px solid ${isDown ? 'var(--red)' : isUp ? 'var(--green)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: 10,
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{s.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: isDown ? 'var(--red)' : isUp ? 'var(--green)' : 'var(--text-primary)' }}>{s.score}점</span>
                        {s.diff !== null && (
                          <span style={{ fontSize: 13, fontWeight: 600, color: s.diff >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {s.diff >= 0 ? '▲' : '▼'} {Math.abs(s.diff)}
                          </span>
                        )}
                      </div>
                      {s.prevScore !== null && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>전일 {s.prevScore}점</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. 카테고리별 약점 맵 ── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={sectionTitle}>🗺️ 카테고리별 약점 맵</h2>
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
              {/* 헤더 */}
              <div style={{ padding: 8, fontWeight: 800, fontSize: 12, color: 'var(--text-second)' }}>소분류 ↓ / 대분류 →</div>
              {heatmapData.categories.map(cat => (
                <div key={cat} style={{ textAlign: 'center', padding: 8, fontWeight: 700, color: 'var(--text-primary)', fontSize: 12, background: 'var(--bg-elevated)', borderRadius: 4 }}>{cat}</div>
              ))}
              {/* 행 */}
              {heatmapData.details.map(det => (
                <div key={det} style={{ display: 'contents' }}>
                  <div style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-second)', fontSize: 12, display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 4 }}>{det}</div>
                  {heatmapData.categories.map(cat => {
                    const cell = heatmapData.data.find(d => d.category === cat && d.detail === det);
                    if (!cell) return <div key={`${cat}-${det}`} style={{ textAlign: 'center', padding: 8, color: 'var(--text-muted)', fontSize: 12, background: 'var(--bg-hover)', borderRadius: 4 }}>—</div>;
                    const rc = rateColor(cell.rate);
                    return (
                      <div key={`${cat}-${det}`} onClick={() => setHeatmapModal({ category: cat, detail: det })} style={{ textAlign: 'center', padding: 8, background: rc.bg, color: rc.text, fontSize: 13, fontWeight: 700, borderRadius: 4, cursor: 'pointer', transition: 'transform 0.1s' }} title={`${cat} > ${det}: ${cell.rate}% (${cell.totalQ}문항) — 클릭하면 문항 상세`}>
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

      {/* ── 히트맵 모달: 문항 상세 ── */}
      {heatmapModal && (
        <div onClick={() => setHeatmapModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 560, width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>📋 {heatmapModal.category} &gt; {heatmapModal.detail}</h3>
              <button onClick={() => setHeatmapModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            {heatmapModalData.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-second)' }}>차시</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-second)' }}>문항 번호</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--green)' }}>정답</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--red)' }}>오답</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-second)' }}>오답률</th>
                  </tr>
                </thead>
                <tbody>
                  {heatmapModalData.map((q, i) => {
                    const rc = rateColor(100 - q.wrongRate);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{q.session}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>Q{q.questionId}</td>
                        <td style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--green)', fontWeight: 600 }}>{q.correct}명</td>
                        <td style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--red)', fontWeight: 600 }}>{q.wrong}명</td>
                        <td style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700, color: rc.text }}>
                          {q.wrongRate}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>해당 문항 데이터가 없습니다.</p>}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>오답률이 높은 문항 → 교육 보강 또는 문제 난이도 조정 검토</p>
          </div>
        </div>
      )}

      {/* ── 학생별 날짜 분석 모달 ── */}
      {studentDateModal && studentDateAnalysis && (
        <div onClick={() => setStudentDateModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 720, width: '90%', maxHeight: '85vh', overflow: 'auto' }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                  🔍 {studentDateAnalysis.studentName} — {(() => { const d = new Date(studentDateAnalysis.date); return `${d.getMonth() + 1}/${d.getDate()}`; })()} 분석
                </h3>
                <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
                  <span style={{ color: 'var(--text-second)' }}>개인 <b style={{ color: studentDateAnalysis.gap >= 0 ? 'var(--green)' : 'var(--red)' }}>{studentDateAnalysis.myAvg}점</b></span>
                  <span style={{ color: 'var(--text-muted)' }}>전체 평균 {studentDateAnalysis.classAvg}점</span>
                  <span style={{ fontWeight: 700, color: studentDateAnalysis.gap >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {studentDateAnalysis.gap >= 0 ? '+' : ''}{studentDateAnalysis.gap}점 차이
                  </span>
                </div>
              </div>
              <button onClick={() => setStudentDateModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            {/* 요약 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{studentDateAnalysis.totalQ}문항</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>총 문항</div>
              </div>
              <div style={{ background: 'var(--green-dim)', borderRadius: 'var(--radius-md)', padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>{studentDateAnalysis.myCorrectCount}개 정답</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>맞힌 문항</div>
              </div>
              <div style={{ background: 'var(--red-dim)', borderRadius: 'var(--radius-md)', padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)' }}>{studentDateAnalysis.myWrongCount}개 오답</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>틀린 문항</div>
              </div>
            </div>

            {/* 🚨 나만 틀린 문항 (다른 애들은 맞췄는데) */}
            {studentDateAnalysis.onlyMyWrong.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)', marginBottom: 12 }}>
                  🚨 다른 교육생은 맞췄는데 {studentDateAnalysis.studentName}만 틀린 문항 ({studentDateAnalysis.onlyMyWrong.length}개)
                </h4>
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

            {/* 📊 약점 패턴 분석 + 교육 제안 */}
            {(studentDateAnalysis.topWeakCategories.length > 0 || studentDateAnalysis.topWeakDetails.length > 0) && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--orange)', marginBottom: 12 }}>📊 왜 틀렸을까? — 약점 패턴 분석</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* 약한 분야 */}
                  <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>약한 제품군 (대분류)</div>
                    {studentDateAnalysis.topWeakCategories.map(([cat, count], i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-second)' }}>{cat}</span>
                        <span style={{ color: 'var(--red)', fontWeight: 700 }}>{count}문항 오답</span>
                      </div>
                    ))}
                  </div>
                  {/* 약한 지식 유형 */}
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
                {/* 교육 제안 */}
                <div style={{ marginTop: 12, background: 'var(--blue-dim)', border: '1px solid var(--blue)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)', marginBottom: 6 }}>💡 교육 제안</div>
                  <div style={{ fontSize: 13, color: 'var(--text-second)', lineHeight: 1.6 }}>
                    {studentDateAnalysis.topWeakCategories.length > 0 && (
                      <p style={{ margin: '0 0 4px' }}>
                        • <b>{studentDateAnalysis.topWeakCategories[0][0]}</b> 분야 제품 지식을 집중 보강해주세요
                        {studentDateAnalysis.topWeakCategories.length > 1 && <span>, 추가로 <b>{studentDateAnalysis.topWeakCategories[1][0]}</b>도 복습이 필요해요</span>}
                      </p>
                    )}
                    {studentDateAnalysis.topWeakDetails.length > 0 && (
                      <p style={{ margin: '0 0 4px' }}>
                        • 특히 <b>{studentDateAnalysis.topWeakDetails[0][0]}</b> 유형의 문제를 많이 틀렸어요
                        {studentDateAnalysis.topWeakDetails[0][0].includes('소재') && ' → 소재 샘플을 직접 만져보며 학습하면 효과적이에요'}
                        {studentDateAnalysis.topWeakDetails[0][0].includes('색상') && ' → 컬러칩 카드로 반복 암기가 도움돼요'}
                        {studentDateAnalysis.topWeakDetails[0][0].includes('규격') && ' → 실제 제품 치수를 재보는 실습이 효과적이에요'}
                        {studentDateAnalysis.topWeakDetails[0][0].includes('시공') && ' → 설치 현장 동행 경험이 도움돼요'}
                      </p>
                    )}
                    {studentDateAnalysis.onlyMyWrong.length > 0 && (
                      <p style={{ margin: 0 }}>• "나만 틀린 문항" {studentDateAnalysis.onlyMyWrong.length}개는 다른 교육생은 이해한 내용이므로, 1:1 또는 스터디 그룹으로 같이 공부하면 빠르게 따라잡을 수 있어요</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 전체 문항 상태가 없을 때 */}
            {studentDateAnalysis.totalQ === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>이 날짜의 문항별 응답 데이터가 없어요.</p>
            )}
          </div>
        </div>
      )}

      {/* ── 5. 태도/참여 현황 ── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={sectionTitle}>🙋 태도/참여 현황</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: '평균 출석률', value: `${participationStats.avgAttendance}%`, color: 'var(--green)', desc: '지각=0.5 반영' },
            { label: '교육일지 제출률', value: `${participationStats.avgSubmitRate}%`, color: 'var(--blue)', desc: `교육일 ${totalEducationDays}일 기준` },
            { label: '평균 참여 점수', value: `${participationStats.avgParticipation}점`, color: 'var(--purple)', desc: 'STEP 1~3 작성 기준' },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 14, color: 'var(--text-second)', marginTop: 4 }}>{stat.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{stat.desc}</div>
            </div>
          ))}
        </div>
        {/* 자신감 추이 */}
        {confidenceTrendData.length > 0 && (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-second)', marginBottom: 8 }}>자신감 추이 (일별 비율)</h3>
            <div style={{ display: 'flex', gap: 3, alignItems: 'end', minHeight: 120, padding: '0 4px' }}>
              {confidenceTrendData.map(d => (
                <div key={d.date} style={{ flex: 1, minWidth: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {d.높음 > 0 && <div style={{ height: Math.max(d.높음 * 0.8, 3), background: 'var(--green)', borderRadius: 2 }} title={`높음 ${d.높음}%`} />}
                    {d.보통 > 0 && <div style={{ height: Math.max(d.보통 * 0.8, 3), background: 'var(--orange)', borderRadius: 2 }} title={`보통 ${d.보통}%`} />}
                    {d.낮음 > 0 && <div style={{ height: Math.max(d.낮음 * 0.8, 3), background: 'var(--red)', borderRadius: 2 }} title={`낮음 ${d.낮음}%`} />}
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>{d.date}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--green)', borderRadius: 2, marginRight: 4 }} />높음</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--orange)', borderRadius: 2, marginRight: 4 }} />보통</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--red)', borderRadius: 2, marginRight: 4 }} />낮음</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 6+7. 수주 (준비 중) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {['💰 수주 실적 현황', '🔀 수주 분야별 분석'].map(title => (
          <div key={title} style={{ ...cardStyle, opacity: 0.5 }}>
            <h2 style={sectionTitle}>{title}</h2>
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>🔒</p>
              <p style={{ fontSize: 15, fontWeight: 600 }}>4/23 이후 데이터 수집 시 활성화</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>수주 데이터가 입력되면 자동으로 분석이 시작돼요</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 상세 근거 행 컴포넌트 ──
function DetailRow({ label, score, detail }: { label: string; score: number; detail: string }) {
  const color = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--orange)' : 'var(--red)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 13, color: 'var(--text-second)', minWidth: 130 }}>{label}</span>
      <div style={{ flex: 1, background: 'var(--bg-hover)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(score, 100)}%`, background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 40, textAlign: 'right' }}>{score}</span>
    </div>
  );
}
