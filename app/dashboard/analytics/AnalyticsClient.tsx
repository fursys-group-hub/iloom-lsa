'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Batch, Student, TestScore, Attendance } from '@/lib/types';
import { calculateAdaptationIndex, calculateAvgScore, calculateDailyAverages } from '@/lib/analysis';
import ScoreTrendChart from '@/components/charts/ScoreTrendChart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter, ZAxis, LineChart, Line, Legend } from 'recharts';

// ── 타입 ──
interface NoteRow { id: string; student_id: string; title: string; content: string; created_at: string; }
interface TestResponse { student_id: string; batch_id: string; session: string; question_id: string; is_correct: boolean; test_date: string; }
interface Question { id: string; batch_id: string; session: string; question_id: string; category: string | null; series: string | null; detail: string | null; question_text: string | null; }
interface SurveyRow {
  id: string; batch_id: string; student_id: string; phase: string;
  eff_product: number | null; eff_customer: number | null; eff_sales: number | null;
  eff_teamwork: number | null; eff_overall: number | null;
  sat_content: number | null; sat_method: number | null; sat_duration: number | null;
  open_strength: string | null; open_worry: string | null; open_goal: string | null;
}
interface WeeklySalesRow {
  id: string; batch_id: string; student_id: string; week: number;
  consult: number; estimate: number; orders: number; amount: number;
  categories: string[] | null; note: string | null;
}
interface EvaluationRow {
  id: string; batch_id: string; student_id: string; week: number;
  store_name?: string | null; strength_tags?: string[] | null; improvement_tags?: string[] | null;
  overall_score?: number | null; comment?: string | null;
}

interface Props {
  batches: Batch[];
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
  notes: NoteRow[];
  testResponses: TestResponse[];
  questions: Question[];
  memos: { student_id: string; category: string }[];
  surveys: SurveyRow[];
  weeklySales: WeeklySalesRow[];
  evaluations: EvaluationRow[];
}

// ── 스타일 ──
const cardStyle: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' };
const sectionTitle: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 };
const sectionSub: React.CSSProperties = { fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 };
const insightBox: React.CSSProperties = { marginTop: 12, padding: 14, background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6 };
const emptyStyle: React.CSSProperties = { fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' };
const thStyle: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', fontSize: 14, color: 'var(--text-second)', borderBottom: '1px solid var(--border-light)' };
const badgeBase: React.CSSProperties = { padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' };
const groupHeader: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '8px 0 4px' };

// ── 유틸 ──
function parseNoteMeta(content: string) {
  try {
    const parsed = JSON.parse(content);
    const meta = parsed.meta || {};
    const steps = parsed.steps || {};
    let pScore = meta.participation_score;
    if (pScore === undefined) { pScore = 0; if (steps.step1 && String(steps.step1).trim()) pScore++; if (steps.step2 && String(steps.step2).trim()) pScore++; if (steps.step3 && String(steps.step3).trim()) pScore++; }
    return { participation_score: pScore as number, confidence: (meta.confidence || null) as string | null, tags: (meta.tags || []) as string[] };
  } catch { return { participation_score: 0, confidence: null, tags: [] as string[] }; }
}

function parsePracticeSteps(content: string) {
  try {
    const parsed = JSON.parse(content);
    const s = parsed.steps || {};
    return {
      consult: Number(s.stats_consult) || 0,
      estimate: Number(s.stats_estimate) || 0,
      order: Number(s.stats_order) || 0,
      amount: Number(s.stats_amount) || 0,
      step1: String(s.step1 || ''),
      step2: String(s.step2 || ''),
      step3: String(s.step3 || ''),
      step4: String(s.step4 || ''),
    };
  } catch { return { consult: 0, estimate: 0, order: 0, amount: 0, step1: '', step2: '', step3: '', step4: '' }; }
}

function rateColor(rate: number) {
  if (rate >= 80) return { bg: 'var(--green-dim)', text: 'var(--green)' };
  if (rate >= 60) return { bg: 'var(--orange-dim)', text: 'var(--orange)' };
  return { bg: 'var(--red-dim)', text: 'var(--red)' };
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return dx > 0 && dy > 0 ? Math.round((num / Math.sqrt(dx * dy)) * 100) / 100 : 0;
}

function corrLabel(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return '강한 상관';
  if (abs >= 0.4) return '중간 상관';
  if (abs >= 0.2) return '약한 상관';
  return '상관 없음';
}

const STOP_WORDS = new Set('은는이가을를에의로와과도등수것때더매우정말아주위해통해하고하는했다있다없다했습니다합니다입니다그리고저는제가오늘'.split(''));

function extractKeywords(texts: string[], topN = 10): { word: string; count: number }[] {
  const freq = new Map<string, number>();
  for (const text of texts) {
    const words = text.replace(/[.,!?~\n\r]/g, ' ').split(/\s+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w));
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([word, count]) => ({ word, count }));
}

const EFF_LABELS: Record<string, string> = {
  eff_product: '제품 지식', eff_customer: '고객 응대', eff_sales: '판매 성사',
  eff_teamwork: '팀워크', eff_overall: '전반적 준비도',
};
const SAT_LABELS: Record<string, string> = {
  sat_content: '교육 내용', sat_method: '교육 방식', sat_duration: '교육 기간',
};

// ── "왜 보나요?" Popover 컴포넌트 (재사용) ──
function WhyPopover({ title, children, width = 460 }: { title: string; children: React.ReactNode; width?: number }) {
  return (
    <details style={{ cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
      <summary style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', listStyle: 'none' }}>왜 보나요?</summary>
      <div style={{ position: 'absolute', right: 0, marginTop: 8, padding: '20px 22px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', fontSize: 13, color: 'var(--text-second)', zIndex: 10, width, lineHeight: 1.7 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, fontSize: 15 }}>{title}</div>
        {children}
      </div>
    </details>
  );
}

// ── 메인 ──
export default function AnalyticsClient({ batches, students, scores, attendance, notes, testResponses, questions, memos, surveys, weeklySales, evaluations }: Props) {
  const activeBatches = batches.filter(b => !b.is_archived);
  const archivedBatches = batches.filter(b => b.is_archived);
  const [selectedBatchId, setSelectedBatchId] = useState(activeBatches[0]?.id || batches[0]?.id || '');
  const [uploadMsg, setUploadMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const selectedBatch = batches.find(b => b.id === selectedBatchId);
  const batchStudents = useMemo(() => students.filter(s => s.batch_id === selectedBatchId && !s.is_dropped), [students, selectedBatchId]);

  // 교육일수
  const totalEducationDays = useMemo(() => {
    if (!selectedBatch) return 20;
    const start = new Date(selectedBatch.start_date);
    const end = new Date(selectedBatch.end_date);
    const today = new Date();
    const effectiveEnd = today < end ? today : end;
    let days = 0; const d = new Date(start);
    while (d <= effectiveEnd) { if (d.getDay() !== 0 && d.getDay() !== 6) days++; d.setDate(d.getDate() + 1); }
    return Math.max(days, 1);
  }, [selectedBatch]);

  // 카테고리별 정답률
  const categoryRates = useMemo(() => {
    const qMap = new Map<string, Question>();
    for (const q of questions) { if (q.batch_id === selectedBatchId) qMap.set(`${q.session}_${q.question_id}`, q); }
    const catMap = new Map<string, { correct: number; total: number }>();
    const ids = new Set(batchStudents.map(s => s.id));
    for (const r of testResponses) {
      if (!ids.has(r.student_id)) continue;
      const q = qMap.get(`${r.session}_${r.question_id}`);
      if (!q || !q.category) continue;
      const cell = catMap.get(q.category) || { correct: 0, total: 0 };
      cell.total++; if (r.is_correct) cell.correct++;
      catMap.set(q.category, cell);
    }
    return [...catMap.entries()].map(([category, v]) => ({
      category, rate: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0, total: v.total,
    })).sort((a, b) => a.rate - b.rate);
  }, [batchStudents, testResponses, questions, selectedBatchId]);

  // 학생별 카테고리 정답률
  const studentCategoryRates = useMemo(() => {
    const result = new Map<string, { category: string; rate: number }[]>();
    const qMap = new Map<string, Question>();
    for (const q of questions) { if (q.batch_id === selectedBatchId) qMap.set(`${q.session}_${q.question_id}`, q); }
    for (const student of batchStudents) {
      const catMap = new Map<string, { correct: number; total: number }>();
      for (const r of testResponses.filter(r => r.student_id === student.id)) {
        const q = qMap.get(`${r.session}_${r.question_id}`);
        if (!q || !q.category) continue;
        const cell = catMap.get(q.category) || { correct: 0, total: 0 };
        cell.total++; if (r.is_correct) cell.correct++;
        catMap.set(q.category, cell);
      }
      result.set(student.id, [...catMap.entries()].map(([category, v]) => ({ category, rate: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0 })));
    }
    return result;
  }, [batchStudents, testResponses, questions, selectedBatchId]);

  // 적응 지수
  const adaptationIndices = useMemo(() => {
    return batchStudents.map(student => {
      const sScores = scores.filter(s => s.student_id === student.id);
      const sAttendance = attendance.filter(a => a.student_id === student.id);
      const sNotes = notes.filter(n => n.student_id === student.id).map(n => ({ ...parseNoteMeta(n.content), created_at: n.created_at }));
      const catRates = studentCategoryRates.get(student.id) || [];
      return calculateAdaptationIndex({ studentId: student.id, studentName: student.name, scores: sScores, attendance: sAttendance, notes: sNotes, totalEducationDays, categoryRates: catRates });
    }).sort((a, b) => b.total - a.total);
  }, [batchStudents, scores, attendance, notes, studentCategoryRates, totalEducationDays]);

  // 차시별 평균
  const dailyAverages = useMemo(() => calculateDailyAverages(scores.filter(s => batchStudents.some(st => st.id === s.student_id))), [scores, batchStudents]);

  // 설문 데이터
  const batchSurveys = useMemo(() => surveys.filter(s => s.batch_id === selectedBatchId), [surveys, selectedBatchId]);
  const introSurveys = useMemo(() => batchSurveys.filter(s => s.phase === 'intro_end'), [batchSurveys]);
  const advancedSurveys = useMemo(() => batchSurveys.filter(s => s.phase === 'advanced_end'), [batchSurveys]);

  // 주간 수주
  const batchWeeklySales = useMemo(() => weeklySales.filter(s => s.batch_id === selectedBatchId), [weeklySales, selectedBatchId]);

  // 실습일지 데이터
  const practiceData = useMemo(() => {
    const ids = new Set(batchStudents.map(s => s.id));
    return notes.filter(n => {
      if (!ids.has(n.student_id)) return false;
      try { const p = JSON.parse(n.content); return (p.meta?.tags || []).includes('실습일지'); } catch { return false; }
    }).map(n => ({ studentId: n.student_id, date: n.created_at.slice(0, 10), ...parsePracticeSteps(n.content) }));
  }, [notes, batchStudents]);

  // 교육일지 분석 (자신감 + 참여도)
  const noteAnalysis = useMemo(() => {
    const ids = new Set(batchStudents.map(s => s.id));
    const eduNotes = notes.filter(n => {
      if (!ids.has(n.student_id)) return false;
      const m = parseNoteMeta(n.content);
      return !m.tags.includes('실습일지') && !m.tags.includes('자율학습');
    }).map(n => ({ date: n.created_at.slice(0, 10), ...parseNoteMeta(n.content) }));

    const byDate = new Map<string, { high: number; mid: number; low: number; pScores: number[] }>();
    for (const n of eduNotes) {
      const d = byDate.get(n.date) || { high: 0, mid: 0, low: 0, pScores: [] };
      const c = n.confidence;
      if (c === '😊' || c === '😎' || c === 'very_high' || c === 'high' || c === 'confident') d.high++;
      else if (c === '😐' || c === '🤔' || c === 'medium' || c === 'normal' || c === 'half') d.mid++;
      else if (c === '😟' || c === '😵' || c === 'low' || c === 'not_confident' || c === 'very_low') d.low++;
      d.pScores.push(n.participation_score);
      byDate.set(n.date, d);
    }

    const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      dailyConfidence: sorted.map(([date, d]) => {
        const total = d.high + d.mid + d.low;
        const dt = new Date(date + 'T00:00:00');
        return { date: `${dt.getMonth() + 1}/${dt.getDate()}`, high: total > 0 ? Math.round((d.high / total) * 100) : 0, mid: total > 0 ? Math.round((d.mid / total) * 100) : 0, low: total > 0 ? Math.round((d.low / total) * 100) : 0 };
      }),
      dailyParticipation: sorted.map(([date, d]) => {
        const dt = new Date(date + 'T00:00:00');
        return { date: `${dt.getMonth() + 1}/${dt.getDate()}`, avg: d.pScores.length > 0 ? Math.round((d.pScores.reduce((a, b) => a + b, 0) / d.pScores.length) * 100) / 100 : 0 };
      }),
    };
  }, [notes, batchStudents]);

  // 실습 키워드
  const practiceKeywords = useMemo(() => {
    const steps: Record<string, string[]> = { step1: [], step2: [], step3: [], step4: [] };
    for (const p of practiceData) {
      if (p.step1.trim()) steps.step1.push(p.step1);
      if (p.step2.trim()) steps.step2.push(p.step2);
      if (p.step3.trim()) steps.step3.push(p.step3);
      if (p.step4.trim()) steps.step4.push(p.step4);
    }
    return {
      step1: extractKeywords(steps.step1),
      step2: extractKeywords(steps.step2),
      step3: extractKeywords(steps.step3),
      step4: extractKeywords(steps.step4),
    };
  }, [practiceData]);

  // KPI 수치
  const kpi = useMemo(() => {
    const batchScores = scores.filter(s => batchStudents.some(st => st.id === s.student_id));
    const avgScore = batchScores.length > 0 ? Math.round(batchScores.reduce((s, sc) => s + sc.score, 0) / batchScores.length) : 0;
    const avgAdapt = adaptationIndices.length > 0 ? Math.round(adaptationIndices.reduce((s, a) => s + a.total, 0) / adaptationIndices.length) : 0;

    const batchAtt = attendance.filter(a => batchStudents.some(s => s.id === a.student_id));
    let attScore = 0;
    for (const a of batchAtt) { if (a.status === 'present') attScore += 1; else if (a.status === 'late' || a.status === 'early_leave') attScore += 0.5; }
    const attRate = batchAtt.length > 0 ? Math.round((attScore / (totalEducationDays * batchStudents.length)) * 100) : 0;

    const effKeys = ['eff_product', 'eff_customer', 'eff_sales', 'eff_teamwork', 'eff_overall'] as const;
    const introAvg = introSurveys.length > 0 ? introSurveys.reduce((s, sv) => s + effKeys.reduce((a, k) => a + (sv[k] || 0), 0) / effKeys.length, 0) / introSurveys.length : 0;
    const advAvg = advancedSurveys.length > 0 ? advancedSurveys.reduce((s, sv) => s + effKeys.reduce((a, k) => a + (sv[k] || 0), 0) / effKeys.length, 0) / advancedSurveys.length : 0;
    const effChange = introSurveys.length > 0 && advancedSurveys.length > 0 ? Math.round((advAvg - introAvg) * 10) / 10 : null;

    return { avgScore, avgAdapt, attRate, effChange, introAvg: Math.round(introAvg * 10) / 10, advAvg: Math.round(advAvg * 10) / 10 };
  }, [scores, batchStudents, adaptationIndices, attendance, totalEducationDays, introSurveys, advancedSurveys]);

  // 엑셀 업로드
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('batchId', selectedBatchId);
      const res = await fetch('/api/weekly-sales', { method: 'POST', body: form });
      const data = await res.json();
      if (res.ok) {
        setUploadMsg({ type: 'ok', text: `${data.inserted}건 저장 완료${data.errors ? ` (오류 ${data.errors.length}건)` : ''}` });
      } else {
        setUploadMsg({ type: 'err', text: data.error || '업로드 실패' });
      }
    } catch { setUploadMsg({ type: 'err', text: '업로드 중 오류' }); }
    setUploading(false);
    e.target.value = '';
  }, [selectedBatchId]);

  // ── 렌더 ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 헤더 */}
      <div className="insight-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="insight-title-row" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>교육 인사이트</h2>
          <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)} style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
            {activeBatches.length > 0 && <optgroup label="진행 중">{activeBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>}
            {archivedBatches.length > 0 && <optgroup label="보관됨">{archivedBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>}
          </select>
        </div>
      </div>

      {/* KPI — 한 카드에 4칸 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 8 }}>
          <WhyPopover title="이 4가지 지표를 왜 보나요?">
            <p style={{ margin: '0 0 10px' }}>이 기수의 <b>전반적인 상태</b>를 4가지 핵심 숫자로 요약했어요. 자세히 들어가기 전에 &ldquo;이 기수가 어떤 상태인가&rdquo;를 한 줄로 파악할 수 있어요.</p>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>4가지 지표</div>
            <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
              <li><b>평균 시험 성적</b>: 전체 차시 시험 점수의 반 평균. 80점 이상 우수 / 60~79 보통 / 60 미만 보강 필요</li>
              <li><b>평균 적응 지수</b>: 시험+출석+일지+자신감 8가지를 종합한 100점 만점 점수. 70점 이상 양호</li>
              <li><b>출석률</b>: 출석=1, 지각/조퇴=0.5 가중치. 90% 이상 양호</li>
              <li><b>자기효능감 변화</b>: 사전(입문 끝) → 사후(심화 끝) 자기효능감 평균의 변화량. +1점 이상 큰 성장</li>
            </ul>
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <b>활용:</b> 이 4가지 숫자는 윗선 보고용으로 그대로 쓸 수 있어요. 각 지표의 상세는 아래 카드에서 확인하세요.
            </div>
          </WhyPopover>
        </div>
        <div className="insight-kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
          {[
            { label: '평균 시험 성적', value: `${kpi.avgScore}`, unit: '점', color: 'var(--blue)', badge: kpi.avgScore >= 80 ? '우수' : kpi.avgScore >= 60 ? '보통' : '보강 필요', badgeColor: kpi.avgScore >= 80 ? 'var(--green)' : kpi.avgScore >= 60 ? 'var(--orange)' : 'var(--red)' },
            { label: '평균 적응 지수', value: `${kpi.avgAdapt}`, unit: '점', color: kpi.avgAdapt >= 70 ? 'var(--green)' : kpi.avgAdapt >= 50 ? 'var(--orange)' : 'var(--red)', badge: kpi.avgAdapt >= 70 ? '양호' : kpi.avgAdapt >= 50 ? '주의' : '위험', badgeColor: kpi.avgAdapt >= 70 ? 'var(--green)' : kpi.avgAdapt >= 50 ? 'var(--orange)' : 'var(--red)' },
            { label: '출석률', value: `${kpi.attRate}`, unit: '%', color: kpi.attRate >= 90 ? 'var(--green)' : 'var(--orange)', badge: kpi.attRate >= 95 ? '매우 우수' : kpi.attRate >= 90 ? '양호' : '주의', badgeColor: kpi.attRate >= 90 ? 'var(--green)' : 'var(--orange)' },
            { label: '자기효능감 변화', value: kpi.effChange !== null ? `${kpi.effChange > 0 ? '+' : ''}${kpi.effChange}` : '-', unit: kpi.effChange !== null ? '점' : '', color: kpi.effChange !== null ? (kpi.effChange > 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)', badge: kpi.effChange !== null ? (kpi.effChange >= 1 ? '큰 성장' : kpi.effChange > 0 ? '성장' : '정체') : '미실시', badgeColor: kpi.effChange !== null ? (kpi.effChange > 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)' },
          ].map((c, i, arr) => (
            <div key={i} style={{ textAlign: 'center', padding: '8px 12px', borderLeft: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: c.color, lineHeight: 1.1 }}>{c.value}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>{c.unit}</span></div>
              <span style={{ ...badgeBase, background: `${c.badgeColor}1a`, color: c.badgeColor, marginTop: 8, display: 'inline-block' }}>{c.badge}</span>
            </div>
          ))}
        </div>
      </div>


      {introSurveys.length === 0 ? (
        <div style={cardStyle}>
          <h3 style={sectionTitle}>교육생들은 얼마나 성장했나?</h3>
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 12 }}>입문교육 마지막 날에 교육생에게 설문을 보내주세요</p>
            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/my/survey`)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--blue)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>설문 링크 복사</button>
          </div>
        </div>
      ) : (() => {
        const effKeys = ['eff_product', 'eff_customer', 'eff_sales', 'eff_teamwork', 'eff_overall'] as const;
        const radarData = effKeys.map(k => {
          const introAvg = introSurveys.length > 0 ? introSurveys.reduce((s, sv) => s + (sv[k] || 0), 0) / introSurveys.length : 0;
          const advAvg = advancedSurveys.length > 0 ? advancedSurveys.reduce((s, sv) => s + (sv[k] || 0), 0) / advancedSurveys.length : 0;
          return { area: EFF_LABELS[k], 사전: Math.round(introAvg * 10) / 10, 사후: advancedSurveys.length > 0 ? Math.round(advAvg * 10) / 10 : 0 };
        });
        const changes = radarData.map(d => ({ area: d.area, diff: Math.round((d.사후 - d.사전) * 10) / 10 }));
        const mostGrowth = [...changes].sort((a, b) => b.diff - a.diff)[0];
        const leastGrowth = [...changes].sort((a, b) => a.diff - b.diff)[0];
        return (
          <div style={cardStyle}>
            <div className="insight-survey-grid" style={{ display: 'grid', gridTemplateColumns: '4fr 6fr', gap: 32, position: 'relative' }}>
            {/* 좌측: 자기효능감 레이더 (교육생 분석 페이지와 동일 스타일) */}
            <div>
              {/* 헤드라인 + 왜 보나요? popover */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
                {advancedSurveys.length > 0 ? (
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                    교육 후<br /><span style={{ color: 'var(--green)' }}>{mostGrowth.area}</span> 자신감이<br />가장 많이 자랐어요
                  </h2>
                ) : (
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>사후 설문 대기 중</h2>
                )}
                <WhyPopover title="자신감(자기효능감)을 왜 측정하나요?">
                  <p style={{ margin: '0 0 10px' }}>시험 점수가 높다고 해서 매장에서 잘하는 건 아니에요. <b>&ldquo;나는 실제 고객 앞에서 자신 있게 응대할 수 있다&rdquo;</b>고 믿는 정도(자기효능감)가 실전 성과의 핵심 예측 변수예요.</p>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>측정 방식</div>
                  <ul style={{ margin: '0 0 10px', paddingLeft: 20, color: 'var(--text-second)', listStyleType: 'disc', listStylePosition: 'outside' }}>
                    <li><b>사전</b>: 입문교육 마지막 날 5문항 (5점 척도)</li>
                    <li><b>사후</b>: 심화교육 마지막 날 동일 5문항</li>
                    <li>같은 문항을 사전-사후로 비교해 <b>변화량</b>을 봐요</li>
                  </ul>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>5가지 영역</div>
                  <ul style={{ margin: '0 0 10px', paddingLeft: 20, color: 'var(--text-second)', listStyleType: 'disc', listStylePosition: 'outside' }}>
                    <li><b>제품 지식</b>: 일룸 제품을 자신 있게 설명할 수 있다</li>
                    <li><b>고객 응대</b>: 다양한 고객 유형에 맞춰 응대할 수 있다</li>
                    <li><b>판매 성사</b>: 상담부터 수주까지 스스로 이끌 수 있다</li>
                    <li><b>팀워크</b>: 매장 동료들과 잘 협력할 수 있다</li>
                    <li><b>전반적 준비도</b>: 매장에서 일할 준비가 됐다</li>
                  </ul>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>이 데이터로 알 수 있는 것</div>
                  <ul style={{ margin: '0 0 10px', paddingLeft: 20, color: 'var(--text-second)', listStyleType: 'disc', listStylePosition: 'outside' }}>
                    <li>교육이 <b>어느 영역</b>에서 효과를 냈는지</li>
                    <li>어느 영역이 <b>덜 자랐는지</b> → 다음 기수 보강 검토</li>
                    <li>실제 매장 성과(수주)와의 <b>상관관계</b> 분석 가능</li>
                  </ul>
                  <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    <b>참고:</b> 커크패트릭 4단계 평가 모델의 3단계(행동 변화)에 해당하며, HR L&amp;D 분야에서 가장 널리 쓰이는 자기효능감(Self-Efficacy) 측정 방식입니다.
                  </div>
                </WhyPopover>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="var(--border)" gridType="polygon" />
                    <PolarAngleAxis dataKey="area" tick={{ fontSize: 13, fill: 'var(--text-tertiary)', fontWeight: 500 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 5]} tick={false} axisLine={false} />
                    <Radar name="사전" dataKey="사전" stroke="var(--blue)" fill="var(--blue)" fillOpacity={0.15} strokeWidth={2} dot={{ r: 4, fill: 'var(--blue)', strokeWidth: 0 }} />
                    {advancedSurveys.length > 0 && <Radar name="사후" dataKey="사후" stroke="var(--green)" fill="var(--green)" fillOpacity={0.15} strokeWidth={2} dot={{ r: 4, fill: 'var(--green)', strokeWidth: 0 }} />}
                    <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--blue)' }} />사전 ({introSurveys.length}명)</span>
                {advancedSurveys.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)' }} />사후 ({advancedSurveys.length}명)</span>}
              </div>
              {/* 영역별 점수 표 */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>영역</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', width: 60 }}>사전</th>
                    {advancedSurveys.length > 0 && <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', width: 60 }}>사후</th>}
                    {advancedSurveys.length > 0 && <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', width: 60 }}>변화</th>}
                  </tr>
                </thead>
                <tbody>
                  {radarData.map(d => {
                    const diff = Math.round((d.사후 - d.사전) * 10) / 10;
                    const diffColor = diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--text-muted)';
                    return (
                      <tr key={d.area} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{d.area}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{d.사전}</td>
                        {advancedSurveys.length > 0 && <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{d.사후}</td>}
                        {advancedSurveys.length > 0 && <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: diffColor }}>{diff > 0 ? '+' : ''}{diff}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {advancedSurveys.length > 0 && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--green-dim)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>
                  {mostGrowth.area} 자신감이 +{mostGrowth.diff}점 가장 크게 성장
                </div>
              )}
            </div>

            {/* 우측: 만족도 + 교육생 목소리 */}
            <div className="insight-survey-right" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <h3 style={sectionTitle}>교육 만족도와 목소리</h3>
                <WhyPopover title="만족도와 주관식을 왜 보나요?">
                  <p style={{ margin: '0 0 10px' }}>교육생이 <b>&ldquo;교육이 도움이 됐다&rdquo;</b>고 느끼는지(반응)는 가장 기본적인 교육 평가 지표예요. 만족도가 낮으면 다른 지표들도 의미가 약해져요.</p>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>3가지 만족도 항목</div>
                  <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                    <li><b>교육 내용</b>: 실무에 도움이 되었나</li>
                    <li><b>교육 방식</b>: 강의/실습 비율이 적절했나</li>
                    <li><b>교육 기간</b>: 적절했나</li>
                  </ul>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>주관식(목소리)이 중요한 이유</div>
                  <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                    <li>점수만으로는 안 보이는 <b>구체적 어려움</b>을 알 수 있어요</li>
                    <li>&ldquo;가격 협상이 걱정&rdquo; 같은 답이 여러 명에게 나오면 다음 기수 커리큘럼에 반영</li>
                    <li>HR이 매장 관리자에게 전달할 <b>인수인계 자료</b>로도 활용</li>
                  </ul>
                  <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    <b>참고:</b> 커크패트릭 4단계 평가 모델의 1단계(반응)에 해당해요. 가장 일반적이고 빠른 교육 평가 방식입니다.
                  </div>
                </WhyPopover>
              </div>
              <p style={sectionSub}>입문교육 직후 응답 기준</p>

              {/* 만족도 3카드 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                {(['sat_content', 'sat_method', 'sat_duration'] as const).map(k => {
                  const avg = introSurveys.length > 0 ? Math.round((introSurveys.reduce((s, sv) => s + (sv[k] || 0), 0) / introSurveys.length) * 10) / 10 : 0;
                  return (
                    <div key={k} style={{ background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', padding: '14px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{SAT_LABELS[k]}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: avg >= 4 ? 'var(--green)' : avg >= 3 ? 'var(--orange)' : 'var(--red)' }}>{avg}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}> /5</span></div>
                    </div>
                  );
                })}
              </div>

              {/* 교육생 목소리 — 성장 / 걱정 (데스크톱 2열, 모바일 1열 stack) */}
              {introSurveys.some(s => s.open_strength || s.open_worry) && (() => {
                const strengths = introSurveys.filter(s => s.open_strength).map(s => s.open_strength as string).slice(0, 4);
                const worries = introSurveys.filter(s => s.open_worry).map(s => s.open_worry as string).slice(0, 4);
                return (
                  <div>
                    <p style={{ ...sectionSub, marginBottom: 10 }}>교육생이 직접 적은 성장과 걱정</p>
                    <div className="insight-voice-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      {/* 성장 */}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>성장</div>
                        {strengths.map((text, i) => (
                          <div key={`s${i}`} style={{ padding: '10px 0', fontSize: 13, color: 'var(--text-second)', lineHeight: 1.5, borderBottom: i < strengths.length - 1 ? '1px solid var(--border-light)' : 'none' }}>{text}</div>
                        ))}
                      </div>
                      {/* 걱정 */}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)', paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>걱정</div>
                        {worries.map((text, i) => (
                          <div key={`w${i}`} style={{ padding: '10px 0', fontSize: 13, color: 'var(--text-second)', lineHeight: 1.5, borderBottom: i < worries.length - 1 ? '1px solid var(--border-light)' : 'none' }}>{text}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            </div>
          </div>
        );
      })()}

      {/* ── 섹션 2: 자신감 + 참여도 ── */}
      <div className="insight-growth-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <h3 style={sectionTitle}>자신감 분포 변화</h3>
            <WhyPopover title="자신감 분포는 왜 보나요?">
              <p style={{ margin: '0 0 10px' }}>교육생이 매일 작성하는 <b>교육일지의 자신감 이모지</b>(😊😐😟)를 모아 반 전체 흐름으로 봐요. 설문(자기효능감)은 시점이 한정적이지만, 일지는 <b>매일의 감정 흐름</b>을 보여줘요.</p>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>이 데이터로 알 수 있는 것</div>
              <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li>교육 초반 &ldquo;낮음&rdquo; 비율 → 후반에 줄어들면 효과 있음</li>
                <li>특정 차시에 &ldquo;낮음&rdquo;이 갑자기 늘면 그날 내용이 어려웠다는 신호</li>
                <li>마지막까지 &ldquo;낮음&rdquo;이 많으면 매장 배치 전 추가 케어 필요</li>
              </ul>
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <b>설문과 차이:</b> 설문은 사전/사후 2회만, 일지는 매일이라 <b>일별 변화</b>를 추적할 수 있어요.
              </div>
            </WhyPopover>
          </div>
          <p style={sectionSub}>교육일지 자신감 — 높음/보통/낮음 비율 추이</p>
          {noteAnalysis.dailyConfidence.length > 0 ? (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', gap: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--green)', display: 'inline-block' }} />높음</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--orange)', display: 'inline-block' }} />보통</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--red)', display: 'inline-block' }} />낮음</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={noteAnalysis.dailyConfidence} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v}%`]} />
                  <Bar dataKey="high" name="높음" stackId="a" fill="var(--green)" />
                  <Bar dataKey="mid" name="보통" stackId="a" fill="var(--orange)" />
                  <Bar dataKey="low" name="낮음" stackId="a" fill="var(--red)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {(() => {
                const d = noteAnalysis.dailyConfidence;
                const first3 = d.slice(0, 3);
                const last3 = d.slice(-3);
                const firstLow = first3.length > 0 ? Math.round(first3.reduce((s, c) => s + c.low, 0) / first3.length) : 0;
                const lastLow = last3.length > 0 ? Math.round(last3.reduce((s, c) => s + c.low, 0) / last3.length) : 0;
                return <div style={insightBox}>교육 초반 자신감 &apos;낮음&apos; {firstLow}% → 후반 {lastLow}%{lastLow < firstLow ? ' 로 감소 (긍정적)' : lastLow > firstLow ? ' 로 증가 (주의 필요)' : ''}</div>;
              })()}
            </div>
          ) : <p style={emptyStyle}>교육일지 데이터가 없어요</p>}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <h3 style={sectionTitle}>참여 깊이 변화</h3>
            <WhyPopover title="참여 깊이는 왜 측정하나요?">
              <p style={{ margin: '0 0 10px' }}>교육일지에는 <b>STEP 1, 2, 3</b>를 작성하는 칸이 있어요. 모든 칸을 충실히 채우는지(참여점수)를 보면, 단순히 일지를 제출했는지를 넘어 <b>얼마나 깊이 있게 고민했는지</b>를 알 수 있어요.</p>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>참여점수 산정</div>
              <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li>STEP 1, 2, 3 각 칸에 내용이 있으면 1점씩 (0~3점)</li>
                <li>모두 채우면 3점 (만점)</li>
                <li>한 칸이라도 비우면 1점씩 차감</li>
              </ul>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>이 데이터로 알 수 있는 것</div>
              <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li>초반엔 한 줄 → 후반엔 깊이 있게 작성하는 변화</li>
                <li>참여 깊이가 일정하면 <b>일지가 형식적</b>이 되었을 수 있음</li>
                <li>참여 깊이 증가는 <b>몰입도 향상</b>의 신호</li>
              </ul>
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <b>활용:</b> 참여점수가 낮은 교육생은 다음 일지 작성 시 코멘트로 격려할 수 있어요.
              </div>
            </WhyPopover>
          </div>
          <p style={sectionSub}>교육일지 평균 참여점수 (0~3점) 추이</p>
          {noteAnalysis.dailyParticipation.length > 0 ? (
            <div>
              <ScoreTrendChart data={noteAnalysis.dailyParticipation.map(d => ({ date: d.date, avg: Math.round(d.avg * 33.3) }))} height={180} />
              {(() => {
                const d = noteAnalysis.dailyParticipation;
                const first3 = d.slice(0, 3);
                const last3 = d.slice(-3);
                const firstAvg = first3.length > 0 ? Math.round((first3.reduce((s, c) => s + c.avg, 0) / first3.length) * 10) / 10 : 0;
                const lastAvg = last3.length > 0 ? Math.round((last3.reduce((s, c) => s + c.avg, 0) / last3.length) * 10) / 10 : 0;
                return <div style={insightBox}>참여 깊이 초반 {firstAvg}점 → 후반 {lastAvg}점{lastAvg > firstAvg ? ` (+${Math.round((lastAvg - firstAvg) * 10) / 10}점 향상)` : ''}</div>;
              })()}
            </div>
          ) : <p style={emptyStyle}>교육일지 데이터가 없어요</p>}
        </div>
      </div>

      {/* ── 섹션 3: 지식 성장 + 적응 분포 ── */}
      <div className="insight-knowledge-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={cardStyle}>
          {dailyAverages.length > 0 ? (() => {
            const first = dailyAverages.slice(0, 3);
            const last = dailyAverages.slice(-3);
            const fAvg = first.length > 0 ? Math.round(first.reduce((s, d) => s + d.avg, 0) / first.length) : 0;
            const lAvg = last.length > 0 ? Math.round(last.reduce((s, d) => s + d.avg, 0) / last.length) : 0;
            const diff = lAvg - fAvg;
            return (
              <>
                {/* 헤드라인 + popover */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12 }}>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                      {diff > 0 ? <>교육이 진행될수록<br />시험 점수가<br /><span style={{ color: 'var(--green)' }}>꾸준히 올랐어요</span></> : diff < 0 ? <>후반에<br />시험 점수가<br /><span style={{ color: 'var(--red)' }}>떨어졌어요</span></> : <>시험 점수가<br />정체 중이에요</>}
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '10px 0 0' }}>초반 평균 {fAvg}점 → 후반 평균 {lAvg}점 ({diff > 0 ? '+' : ''}{diff}점)</p>
                  </div>
                  <WhyPopover title="시험 성적 추이를 왜 보나요?">
                    <p style={{ margin: '0 0 10px' }}>차시별 시험 점수의 <b>반 전체 평균</b> 추이예요. 한 학생의 점수가 아니라 <b>프로그램 전체가 효과 있는지</b>를 보여줍니다.</p>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>이 데이터로 알 수 있는 것</div>
                    <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                      <li>교육이 진행될수록 점수가 올라가면 → <b>지식이 누적</b>되고 있다는 증거</li>
                      <li>점수가 정체되면 → 후반 차시 난이도가 급상승했거나, 교육 방식 점검 필요</li>
                      <li>점수가 떨어지면 → 후반 내용이 이해 안 되거나, 교육생 피로도 증가</li>
                    </ul>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>다른 차트와 차이</div>
                    <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                      <li><b>테스트 페이지</b>는 개별 교육생/문항/오답 분석 (디테일)</li>
                      <li><b>여기는</b> 반 전체 평균만 (프로그램 효과 한눈에)</li>
                    </ul>
                    <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      <b>참고:</b> 커크패트릭 4단계 평가 모델의 2단계(학습)에 해당해요.
                    </div>
                  </WhyPopover>
                </div>
                <ScoreTrendChart data={dailyAverages} height={180} />
              </>
            );
          })() : <p style={emptyStyle}>시험 데이터가 없어요</p>}
        </div>

        <div style={cardStyle}>
          {adaptationIndices.length > 0 ? (() => {
            const highCount = adaptationIndices.filter(a => a.total >= 70).length;
            const highPct = Math.round((highCount / adaptationIndices.length) * 100);
            return (
            <div>
              {/* 헤드라인 + popover */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                    {highPct >= 70 ? <>대부분의 교육생이<br />프로그램에<br /><span style={{ color: 'var(--green)' }}>잘 적응했어요</span></> : highPct >= 50 ? <>절반은 적응했지만<br />케어가 필요한<br /><span style={{ color: 'var(--orange)' }}>교육생이 있어요</span></> : <>적응에 어려움을 겪는<br />교육생이<br /><span style={{ color: 'var(--red)' }}>많아요</span></>}
                  </h2>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '10px 0 0' }}>{adaptationIndices.length}명 중 {highCount}명({highPct}%)이 적응 양호 (70점 이상)</p>
                </div>
                <WhyPopover title="적응 지수 분포는 왜 보나요?">
                  <p style={{ margin: '0 0 10px' }}><b>적응 지수</b>는 시험 성적 + 출석 + 일지 참여 + 자신감 등 <b>8가지 데이터를 종합한 100점 만점 점수</b>예요. 한 가지 지표보다 종합 적응도를 보여줘요.</p>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>3그룹 의미</div>
                  <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                    <li><b>상위 (70점 이상)</b>: 매장 배치 후 잘 해낼 가능성이 높은 그룹</li>
                    <li><b>중위 (50~69점)</b>: 배치 후 초반에 어려움을 겪을 수 있어 관찰 필요</li>
                    <li><b>하위 (50점 미만)</b>: 추가 케어 또는 매장 배치 전 보강 교육 검토</li>
                  </ul>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>HR이 활용하는 방법</div>
                  <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                    <li>상위 비율이 70% 이상이면 → <b>프로그램이 효과적</b></li>
                    <li>하위 비율이 30% 이상이면 → <b>커리큘럼 조정 검토</b></li>
                    <li>다음 기수에서 같은 분포가 나오면 평균 수준 안정적</li>
                  </ul>
                  <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    <b>개인별 상세는 교육생 분석 페이지에서</b> 적응 지수 8가지 항목 분해를 볼 수 있어요.
                  </div>
                </WhyPopover>
              </div>
              <div className="insight-adapt-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { label: '상위', min: 70, color: 'var(--green)', bg: 'var(--green-dim)' },
                  { label: '중위', min: 50, max: 69, color: 'var(--orange)', bg: 'var(--orange-dim)' },
                  { label: '하위', max: 49, color: 'var(--red)', bg: 'var(--red-dim)' },
                ].map(g => {
                  const group = adaptationIndices.filter(a => g.min !== undefined && g.max !== undefined ? a.total >= g.min && a.total <= g.max : g.min !== undefined ? a.total >= g.min : a.total <= (g.max || 0));
                  const pct = adaptationIndices.length > 0 ? Math.round((group.length / adaptationIndices.length) * 100) : 0;
                  return (
                    <div key={g.label} style={{ background: g.bg, borderRadius: 'var(--radius-md)', padding: 16, textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: g.color, marginBottom: 4 }}>{g.label} ({g.min !== undefined ? `${g.min}+` : `~${g.max}`})</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{group.length}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>명</span></div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pct}%</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{group.map(a => a.studentName).join(', ')}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })() : <p style={emptyStyle}>데이터 없음</p>}
        </div>
      </div>

      {/* ── 섹션 4+5: 분야별 + 키워드 (2열) ── */}
      <div className="insight-category-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* 분야별 교육 효과 */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <h3 style={sectionTitle}>어떤 분야를 더 가르쳐야 할까?</h3>
            <WhyPopover title="분야별 정답률을 왜 보나요?">
              <p style={{ margin: '0 0 10px' }}>일룸 제품 카테고리별(학생방, 침실, 거실 등) 시험 정답률이에요. 어느 분야 교육이 충분했고, 어느 분야가 <b>보강이 필요한지</b> 한눈에 볼 수 있어요.</p>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>판정 기준</div>
              <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li><b>70% 이상</b>: 충분히 학습됨 (현행 유지)</li>
                <li><b>50~69%</b>: 보통 (유의 관찰)</li>
                <li><b>50% 미만</b>: 보강 필요 (다음 기수 교육 시간 늘리기 검토)</li>
              </ul>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>HR이 활용하는 방법</div>
              <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li>가장 정답률이 낮은 분야 → 다음 기수 <b>교육 시간 배분</b> 조정</li>
                <li>매장에서 그 분야 매출이 어떻게 나오는지 함께 보면 우선순위 명확</li>
                <li>강사/교재의 분야별 약점도 점검 가능</li>
              </ul>
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <b>참고:</b> 카테고리는 일룸 홈페이지 9개 대분류 기준이에요.
              </div>
            </WhyPopover>
          </div>
          <p style={sectionSub}>카테고리별 시험 정답률 — 낮은 분야부터</p>
          {categoryRates.length > 0 ? (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {categoryRates.slice(0, 8).map(cr => {
                  const rc = rateColor(cr.rate);
                  return (
                    <div key={cr.category} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', width: 80, flexShrink: 0 }}>{cr.category}</span>
                      <div style={{ flex: 1, background: 'var(--bg-hover)', borderRadius: 'var(--radius-xs)', height: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${cr.rate}%`, background: rc.text, borderRadius: 'var(--radius-xs)' }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: rc.text, width: 36, textAlign: 'right' }}>{cr.rate}%</span>
                    </div>
                  );
                })}
              </div>
              {categoryRates[0] && <div style={insightBox}><b>{categoryRates[0].category}</b>가 가장 낮은 정답률({categoryRates[0].rate}%) — 다음 기수에서 보강 검토</div>}
            </div>
          ) : <p style={emptyStyle}>시험 데이터가 없어요</p>}
        </div>

        {/* 실습 키워드 */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <h3 style={sectionTitle}>현장에서 무엇을 느꼈나?</h3>
            <WhyPopover title="실습 키워드를 왜 보나요?">
              <p style={{ margin: '0 0 10px' }}>실습일지에 교육생들이 직접 쓴 텍스트(STEP 1~4)에서 자주 등장하는 단어를 추출해요. 정량 데이터로 못 잡는 <b>현장의 생생한 목소리</b>를 한눈에 볼 수 있어요.</p>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>4가지 영역</div>
              <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li><b>기억에 남는 고객</b>: 어떤 상황을 인상 깊게 기억하는지</li>
                <li><b>선배에게 배운 것</b>: 어떤 노하우가 매장에서 통하는지</li>
                <li><b>칭찬할 점</b>: 자기 성장을 어떻게 인식하는지</li>
                <li><b>보완할 점</b>: 가장 어려워하는 부분 (다음 기수 보강 힌트)</li>
              </ul>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>활용 방법</div>
              <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                <li>&ldquo;보완할 점&rdquo;에 같은 키워드가 반복되면 → 다음 기수에 미리 다룰 주제</li>
                <li>&ldquo;선배에게 배운 것&rdquo;의 노하우를 공식 교재에 반영 가능</li>
              </ul>
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <b>참고:</b> 조사/접속사 등 의미 없는 단어는 제외하고 추출했어요.
              </div>
            </WhyPopover>
          </div>
          <p style={sectionSub}>실습일지 텍스트 키워드 추출</p>
          {practiceData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { key: 'step1' as const, label: '기억에 남는 고객' },
                { key: 'step2' as const, label: '선배에게 배운 것' },
                { key: 'step3' as const, label: '칭찬할 점' },
                { key: 'step4' as const, label: '보완할 점' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {practiceKeywords[key].slice(0, 6).length > 0 ? practiceKeywords[key].slice(0, 6).map(kw => (
                      <span key={kw.word} style={{ ...badgeBase, background: key === 'step4' ? 'var(--red-dim)' : 'var(--blue-dim)', color: key === 'step4' ? 'var(--red)' : 'var(--blue)' }}>{kw.word}</span>
                    )) : <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>키워드 없음</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p style={emptyStyle}>실습일지 데이터를 기다리는 중</p>}
        </div>
      </div>

      {/* ── 섹션 6: 현장 성과 추이 ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h3 style={sectionTitle}>교육이 현장 성과로 이어졌나?</h3>
          <WhyPopover title="현장 성과를 왜 보나요?">
            <p style={{ margin: '0 0 10px' }}>교육 효과의 <b>최종 증거</b>예요. 시험을 잘 봤어도 매장에서 매출이 안 나오면 교육이 실전에 안 통한다는 뜻이고, 반대도 마찬가지예요.</p>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>2단계 데이터</div>
            <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
              <li><b>실습일지 (1~2주)</b>: 매장 실습 중 교육생이 직접 입력한 상담/견적/수주. <b>선배 도움이 있는 환경</b>이에요.</li>
              <li><b>주간 수주 (1~6주)</b>: 심화교육 기간 동안 <b>독립적으로 거둔 성과</b>. HR이 엑셀로 업로드해요.</li>
            </ul>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>이 데이터로 알 수 있는 것</div>
            <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
              <li>실습 전환율 &gt; 심화 전환율 → 선배 도움 없이는 어렵다는 신호 (독립 역량 부족)</li>
              <li>심화 전환율이 주차마다 올라가면 → 교육이 실전에 통한다는 강력한 증거</li>
              <li>주차별 추이가 정체되면 → 매장 배치 후 추가 코칭 검토</li>
            </ul>
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <b>참고:</b> 커크패트릭 4단계 평가 모델의 4단계(결과)에 해당해요. 가장 측정이 어렵지만 교육 ROI 증명의 핵심이에요.
            </div>
          </WhyPopover>
        </div>
        <p style={sectionSub}>실습일지 + 심화교육 주간 수주 데이터 기반</p>
        {/* 성장률 강조 배너 */}
        {batchWeeklySales.length > 0 && (() => {
          const weeks = [...new Set(batchWeeklySales.map(w => w.week))].sort((a, b) => a - b);
          if (weeks.length < 2) return null;
          const firstWeek = batchWeeklySales.filter(w => w.week === weeks[0]);
          const lastWeek = batchWeeklySales.filter(w => w.week === weeks[weeks.length - 1]);
          const firstOrders = firstWeek.reduce((s, w) => s + w.orders, 0);
          const lastOrders = lastWeek.reduce((s, w) => s + w.orders, 0);
          const firstAmount = firstWeek.reduce((s, w) => s + w.amount, 0);
          const lastAmount = lastWeek.reduce((s, w) => s + w.amount, 0);
          const growthRate = firstOrders > 0 ? Math.round(((lastOrders - firstOrders) / firstOrders) * 100) : 0;
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'var(--blue-dim)', borderRadius: 'var(--radius-md)', padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{weeks[0]}주차 → {weeks[weeks.length - 1]}주차 수주 건수</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>{firstOrders}건 → {lastOrders}건</div>
              </div>
              <div style={{ background: growthRate > 0 ? 'var(--green-dim)' : 'var(--red-dim)', borderRadius: 'var(--radius-md)', padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>수주 성장률</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: growthRate > 0 ? 'var(--green)' : 'var(--red)' }}>{growthRate > 0 ? '+' : ''}{growthRate}%</div>
              </div>
              <div style={{ background: 'var(--purple-dim)', borderRadius: 'var(--radius-md)', padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>총 수주 금액</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--purple)' }}>{Math.round(batchWeeklySales.reduce((s, w) => s + w.amount, 0) / 10000).toLocaleString()}만원</div>
              </div>
            </div>
          );
        })()}
        {practiceData.length > 0 || batchWeeklySales.length > 0 ? (
          <div className="insight-performance-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* 퍼널 */}
            <div style={{ background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>전체 퍼널</div>
              {(() => {
                const pc = practiceData.reduce((s, p) => ({ c: s.c + p.consult, e: s.e + p.estimate, o: s.o + p.order, a: s.a + p.amount }), { c: 0, e: 0, o: 0, a: 0 });
                const wc = batchWeeklySales.reduce((s, w) => ({ c: s.c + w.consult, e: s.e + w.estimate, o: s.o + w.orders, a: s.a + w.amount }), { c: 0, e: 0, o: 0, a: 0 });
                const items = [
                  { label: '상담', practice: pc.c, advanced: wc.c },
                  { label: '견적', practice: pc.e, advanced: wc.e },
                  { label: '수주', practice: pc.o, advanced: wc.o },
                ];
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((item, i) => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)', width: 40 }}>{item.label}</span>
                        {practiceData.length > 0 && <span style={{ ...badgeBase, background: 'var(--blue-dim)', color: 'var(--blue)' }}>실습 {item.practice}</span>}
                        {batchWeeklySales.length > 0 && <span style={{ ...badgeBase, background: 'var(--green-dim)', color: 'var(--green)' }}>심화 {item.advanced}</span>}
                        {i < 2 && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>→</span>}
                      </div>
                    ))}
                    <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                      수주 금액: {practiceData.length > 0 && <span>실습 {pc.a.toLocaleString()}원</span>} {batchWeeklySales.length > 0 && <span> / 심화 {wc.a.toLocaleString()}원</span>}
                    </div>
                    {practiceData.length > 0 && batchWeeklySales.length > 0 && (() => {
                      const pRate = pc.c > 0 ? Math.round((pc.o / pc.c) * 100) : 0;
                      const wRate = wc.c > 0 ? Math.round((wc.o / wc.c) * 100) : 0;
                      return <div style={insightBox}>실습 전환율 {pRate}% → 심화 전환율 {wRate}%{wRate < pRate ? ' (선배 도움 없이 독립 역량 확인 필요)' : ' (독립적으로도 잘 하고 있어요)'}</div>;
                    })()}
                  </div>
                );
              })()}
            </div>

            {/* 교육생별 수주 성장 밴드 */}
            <div style={{ background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>교육생별 주차 수주 성장</div>
              {batchWeeklySales.length > 0 ? (() => {
                const weeks = [...new Set(batchWeeklySales.map(w => w.week))].sort((a, b) => a - b);
                const colors = ['#3B82F6', '#22C55E', '#F59E0B', '#A855F7', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];
                const studentMap = new Map(batchStudents.map(s => [s.id, s.name]));
                const studentIds = [...new Set(batchWeeklySales.map(w => w.student_id))];
                // 데이터를 주차별 레코드로 변환: { week: 1, 홍길동: 1, 김철수: 2, ... }
                const chartData = weeks.map(week => {
                  const row: Record<string, number | string> = { week: `${week}주차` };
                  for (const sid of studentIds) {
                    const ws = batchWeeklySales.find(w => w.student_id === sid && w.week === week);
                    const name = studentMap.get(sid) || '?';
                    row[name] = ws?.orders || 0;
                  }
                  return row;
                });
                return (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v}건`]} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      {studentIds.map((sid, i) => {
                        const name = studentMap.get(sid) || '?';
                        return <Line key={sid} type="monotone" dataKey={name} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 3 }} />;
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                );
              })() : <p style={{ ...emptyStyle, padding: '16px 0' }}>심화교육 수주 데이터를 엑셀로 업로드해주세요</p>}
            </div>
          </div>
        ) : <p style={emptyStyle}>실습/수주 데이터가 아직 없어요</p>}
      </div>

      {/* ── 섹션 7: 교차 분석 + 제안 + 업로드 ── */}
      <div style={cardStyle}>
        <h3 style={sectionTitle}>다음 기수를 위한 데이터 기반 제안</h3>

        {/* 교차 분석 — 산점도 */}
        {(practiceData.length > 0 || batchWeeklySales.length > 0) && adaptationIndices.length > 0 && (() => {
          const scatterData = adaptationIndices.map(idx => {
            const pData = practiceData.filter(p => p.studentId === idx.studentId);
            const wData = batchWeeklySales.filter(w => w.student_id === idx.studentId);
            const totalConsult = pData.reduce((s, p) => s + p.consult, 0) + wData.reduce((s, w) => s + w.consult, 0);
            const totalOrder = pData.reduce((s, p) => s + p.order, 0) + wData.reduce((s, w) => s + w.orders, 0);
            return { name: idx.studentName, exam: idx.breakdown.examAvg, conv: totalConsult > 0 ? Math.round((totalOrder / totalConsult) * 100) : 0 };
          });
          return (
            <div style={{ marginBottom: 20, background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>시험 성적 vs 수주 전환율</div>
                <WhyPopover title="산점도와 상관계수를 왜 보나요?" width={420}>
                  <p style={{ margin: '0 0 10px' }}>각 점이 한 명의 교육생이에요. <b>X축은 시험 평균, Y축은 수주 전환율</b>. 점들이 우상향으로 모이면 &ldquo;시험 잘 본 교육생이 수주도 잘 한다&rdquo;는 뜻이에요.</p>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>상관계수 r 읽는 법</div>
                  <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                    <li><b>r ≥ 0.7</b>: 강한 상관 (시험이 좋은 예측 변수)</li>
                    <li><b>0.4 ~ 0.7</b>: 중간 상관 (어느 정도 관련)</li>
                    <li><b>0.2 ~ 0.4</b>: 약한 상관 (다른 요인이 더 중요)</li>
                    <li><b>0.2 미만</b>: 사실상 무관</li>
                  </ul>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 12, marginBottom: 6, fontSize: 13 }}>HR이 활용하는 방법</div>
                  <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', listStylePosition: 'outside' }}>
                    <li>강한 상관이면 → 시험 결과로 매장 배치 후 성과 <b>예측 가능</b></li>
                    <li>약한 상관이면 → 시험 외 다른 평가 기준(자신감, 태도 등) 도입 검토</li>
                    <li>이상치(시험 좋은데 수주 나쁨)가 있으면 그 교육생은 별도 코칭</li>
                  </ul>
                  <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    <b>참고:</b> 피어슨 상관계수(Pearson&apos;s r)를 사용해요. -1 ~ +1 범위이고, 0에 가까울수록 무관해요.
                  </div>
                </WhyPopover>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>우상향에 점이 모이면 &ldquo;시험 잘 본 교육생이 수주도 잘함&rdquo;</div>
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" dataKey="exam" name="시험 평균" unit="점" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} label={{ value: '시험 평균 (점)', position: 'insideBottom', offset: -10, fontSize: 12, fill: 'var(--text-muted)' }} />
                  <YAxis type="number" dataKey="conv" name="수주 전환율" unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} label={{ value: '수주 전환율 (%)', angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--text-muted)' }} />
                  <ZAxis range={[120, 120]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0].payload as { name: string; exam: number; conv: number };
                    return <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div><div>시험 {d.exam}점 · 전환율 {d.conv}%</div></div>;
                  }} />
                  <Scatter data={scatterData} fill="var(--blue)">
                    {scatterData.map((d, i) => <Cell key={i} fill={d.conv >= 30 && d.exam >= 70 ? 'var(--green)' : d.conv < 20 || d.exam < 50 ? 'var(--red)' : 'var(--orange)'} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              {/* 이름 라벨 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {scatterData.map(d => {
                  const color = d.conv >= 30 && d.exam >= 70 ? 'var(--green)' : d.conv < 20 || d.exam < 50 ? 'var(--red)' : 'var(--orange)';
                  return <span key={d.name} style={{ ...badgeBase, background: `${color}1a`, color }}>{d.name} · 시험{d.exam}/전환{d.conv}%</span>;
                })}
              </div>
              {(() => {
                const r = pearsonR(scatterData.map(d => d.exam), scatterData.map(d => d.conv));
                return <div style={insightBox}><b>상관계수 r = {r}</b> ({corrLabel(r)}) — {Math.abs(r) >= 0.4 ? '시험 성적이 현장 성과와 의미 있는 관계를 보여요' : '시험 성적만으로는 현장 성과를 예측하기 어려워요. 다른 요인(태도, 관찰력 등)도 중요해 보입니다'}</div>;
              })()}
            </div>
          );
        })()}

        {/* 교차 분석 테이블 */}
        {(practiceData.length > 0 || batchWeeklySales.length > 0) && adaptationIndices.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>교육 지표 vs 현장 성과</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={thStyle}>교육생</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>시험평균</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>적응지수</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>출석률</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>수주전환율</th>
                </tr></thead>
                <tbody>
                  {adaptationIndices.map(idx => {
                    const pData = practiceData.filter(p => p.studentId === idx.studentId);
                    const wData = batchWeeklySales.filter(w => w.student_id === idx.studentId);
                    const totalConsult = pData.reduce((s, p) => s + p.consult, 0) + wData.reduce((s, w) => s + w.consult, 0);
                    const totalOrder = pData.reduce((s, p) => s + p.order, 0) + wData.reduce((s, w) => s + w.orders, 0);
                    const convRate = totalConsult > 0 ? Math.round((totalOrder / totalConsult) * 100) : 0;
                    const ec = rateColor(idx.breakdown.examAvg);
                    const ac = rateColor(idx.total);
                    const attc = rateColor(idx.breakdown.attendanceRate);
                    const cc = rateColor(convRate);
                    return (
                      <tr key={idx.studentId} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-primary)' }}>{idx.studentName}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: ec.text }}>{idx.breakdown.examAvg}점</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: ac.text }}>{idx.total}점</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: attc.text }}>{idx.breakdown.attendanceRate}%</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: cc.text }}>{convRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(() => {
              const examScores = adaptationIndices.map(a => a.breakdown.examAvg);
              const convRates = adaptationIndices.map(idx => {
                const pD = practiceData.filter(p => p.studentId === idx.studentId);
                const wD = batchWeeklySales.filter(w => w.student_id === idx.studentId);
                const tc = pD.reduce((s, p) => s + p.consult, 0) + wD.reduce((s, w) => s + w.consult, 0);
                const to = pD.reduce((s, p) => s + p.order, 0) + wD.reduce((s, w) => s + w.orders, 0);
                return tc > 0 ? Math.round((to / tc) * 100) : 0;
              });
              const r = pearsonR(examScores, convRates);
              const adaptScores = adaptationIndices.map(a => a.total);
              const r2 = pearsonR(adaptScores, convRates);
              return (
                <div style={insightBox}>
                  시험 성적 ↔ 수주 전환율: r={r} ({corrLabel(r)}) / 적응 지수 ↔ 수주 전환율: r={r2} ({corrLabel(r2)})
                </div>
              );
            })()}
          </div>
        )}

        {/* 제안 카드 */}
        <div className="insight-suggest-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[
            { q: '어떤 분야를 보강해야 하나?', a: categoryRates.length > 0 ? `${categoryRates[0].category} (정답률 ${categoryRates[0].rate}%)` : '데이터 부족' },
            { q: '적응 지수 기준값은?', a: adaptationIndices.length > 0 ? `하위 그룹 기준: ${Math.round(adaptationIndices[adaptationIndices.length - 1]?.total || 0)}점 이하` : '데이터 부족' },
            { q: '교육 기간은 적절한가?', a: dailyAverages.length >= 6 ? (dailyAverages[dailyAverages.length - 1].avg > dailyAverages[dailyAverages.length - 3]?.avg ? '마지막까지 성장 중 — 연장 검토' : '성장 정체 — 현행 유지') : '차시 부족' },
            { q: '교육 만족도는?', a: introSurveys.length > 0 ? `평균 ${Math.round((introSurveys.reduce((s, sv) => s + ((sv.sat_content || 0) + (sv.sat_method || 0) + (sv.sat_duration || 0)) / 3, 0) / introSurveys.length) * 10) / 10} / 5.0` : '설문 미실시' },
          ].map(item => (
            <div key={item.q} style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{item.q}</div>
              <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>{item.a}</div>
            </div>
          ))}
        </div>

        {/* 엑셀 업로드 */}
        <div style={{ background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>심화교육 주간 수주 데이터 업로드</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>엑셀 형식: 교육생명 | 주차 | 상담 | 견적 | 수주 | 금액 | 카테고리 | 메모</div>
          <label style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 'var(--radius-md)', background: 'var(--blue)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
            {uploading ? '업로드 중...' : '엑셀 파일 선택'}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
          </label>
          {batchWeeklySales.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>현재 {new Set(batchWeeklySales.map(w => w.week)).size}개 주차 데이터 업로드됨</div>}
          {uploadMsg && <div style={{ marginTop: 8, padding: '8px 14px', borderRadius: 'var(--radius-sm)', background: uploadMsg.type === 'ok' ? 'var(--green-dim)' : 'var(--red-dim)', color: uploadMsg.type === 'ok' ? 'var(--green)' : 'var(--red)', fontSize: 13, fontWeight: 600 }}>{uploadMsg.text}</div>}
        </div>
      </div>

      {/* 모바일 반응형 */}
      <style>{`
        /* 콤보 카드 (자기효능감 + 만족도): 좁아지면 일찍 1열로 */
        @media (max-width: 1023px) {
          .insight-survey-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .insight-survey-right { border-left: none !important; padding-left: 0 !important; border-top: 1px solid var(--border) !important; padding-top: 24px !important; }
          .insight-voice-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
        }
        @media (max-width: 768px) {
          .insight-header { flex-direction: column; align-items: flex-start !important; gap: 12px; }
          .insight-title-row { flex-wrap: wrap; gap: 10px !important; }
          .insight-kpi-row { grid-template-columns: 1fr 1fr !important; }
          .insight-survey-combo { flex-direction: column !important; }
          .insight-survey-left { width: 100% !important; }
          .insight-growth-grid { grid-template-columns: 1fr !important; }
          .insight-knowledge-grid { grid-template-columns: 1fr !important; }
          .insight-performance-grid { grid-template-columns: 1fr !important; }
          .insight-suggest-grid { grid-template-columns: 1fr !important; }
          .insight-adapt-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
