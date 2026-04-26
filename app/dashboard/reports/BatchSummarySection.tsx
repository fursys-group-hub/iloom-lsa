'use client';

import { useMemo, useCallback } from 'react';
import { useBatch } from '@/lib/batch-context';
import { calculateAdaptationIndex, calculateRiskChecklist, generateHRAdvice, calculateGrowthSlope } from '@/lib/analysis';
import type { Batch, Student, TestScore, Attendance, TagTracking } from '@/lib/types';

interface Props {
  batches: Batch[];
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
  notes: { id: string; student_id: string; title: string; content: string; created_at: string }[];
  memos: { student_id: string; category: string }[];
  testResponses: { student_id: string; batch_id: string; session: string; question_id: string; is_correct: boolean; test_date: string }[];
  examQuestions: { id: string; batch_id: string; session: string; question_id: string; category: string }[];
  coachingReports: { student_id: string; tag_tracking: TagTracking | null; created_at: string }[];
  totalQuestionCount: number;
}

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

function getKSTToday(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const MEMO_LABELS: Record<string, string> = {
  behavior: '수업태도',
  counsel: '상담',
  praise: '칭찬',
  caution: '주의',
  general: '일반',
};

const MEMO_COLORS: Record<string, string> = {
  praise: '#22C55E',
  caution: '#EF4444',
  counsel: '#A855F7',
  behavior: '#3B82F6',
  general: '#9CA3AF',
};

export default function BatchSummarySection({
  batches, students: allStudents, scores: allScores, attendance: allAttendance,
  notes: allNotes, memos: allMemos, testResponses, examQuestions, coachingReports,
  totalQuestionCount, actionRef,
}: Props & { actionRef?: React.MutableRefObject<(() => void) | null> }) {
  const { selectedBatchId } = useBatch();
  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  // --- 기수별 필터 ---
  const students = useMemo(() => allStudents.filter(s => s.batch_id === selectedBatchId && !s.is_dropped), [allStudents, selectedBatchId]);
  const droppedStudents = useMemo(() => allStudents.filter(s => s.batch_id === selectedBatchId && s.is_dropped), [allStudents, selectedBatchId]);
  const studentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);
  const scores = useMemo(() => allScores.filter(s => studentIds.has(s.student_id)), [allScores, studentIds]);
  const attendance = useMemo(() => allAttendance.filter(a => studentIds.has(a.student_id)), [allAttendance, studentIds]);
  const notes = useMemo(() => allNotes.filter(n => studentIds.has(n.student_id)), [allNotes, studentIds]);
  const memos = useMemo(() => allMemos.filter(m => studentIds.has(m.student_id)), [allMemos, studentIds]);

  // --- 교육일수 ---
  const totalEducationDays = useMemo(() => {
    if (!selectedBatch) return 20;
    const start = new Date(selectedBatch.start_date);
    const end = new Date(selectedBatch.end_date);
    const today = new Date(getKSTToday());
    const effectiveEnd = today < end ? today : end;
    let days = 0;
    const d = new Date(start);
    while (d <= effectiveEnd) {
      if (d.getDay() !== 0 && d.getDay() !== 6) days++;
      d.setDate(d.getDate() + 1);
    }
    return Math.max(days, 1);
  }, [selectedBatch]);

  // --- 노트 파싱 ---
  const parsedNotes = useMemo(() => notes.map(n => ({ ...parseNoteMeta(n.content), student_id: n.student_id, created_at: n.created_at })), [notes]);
  const educationNotes = useMemo(() => parsedNotes.filter(n => !n.tags.includes('실습일지') && !n.tags.includes('자율학습')), [parsedNotes]);
  const selfStudyNotes = useMemo(() => parsedNotes.filter(n => n.tags.includes('자율학습')), [parsedNotes]);
  const practiceNotes = useMemo(() => parsedNotes.filter(n => n.tags.includes('실습일지')), [parsedNotes]);

  // --- 카테고리별 정답률 ---
  const studentCategoryRates = useMemo(() => {
    const result = new Map<string, { category: string; rate: number }[]>();
    const qMap = new Map<string, { category: string }>();
    for (const q of examQuestions) {
      if (q.batch_id === selectedBatchId) qMap.set(`${q.session}_${q.question_id}`, q);
    }
    for (const student of students) {
      const catMap = new Map<string, { correct: number; total: number }>();
      const sResponses = testResponses.filter(r => r.student_id === student.id);
      for (const r of sResponses) {
        const q = qMap.get(`${r.session}_${r.question_id}`);
        if (!q || !q.category) continue;
        const cell = catMap.get(q.category) || { correct: 0, total: 0 };
        cell.total++;
        if (r.is_correct) cell.correct++;
        catMap.set(q.category, cell);
      }
      result.set(student.id, [...catMap.entries()].map(([category, v]) => ({
        category, rate: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      })));
    }
    return result;
  }, [students, testResponses, examQuestions, selectedBatchId]);

  // --- 기수 전체 카테고리별 평균 정답률 ---
  const batchCategoryRates = useMemo(() => {
    const catMap = new Map<string, number[]>();
    for (const [, rates] of studentCategoryRates) {
      for (const { category, rate } of rates) {
        const arr = catMap.get(category) || [];
        arr.push(rate);
        catMap.set(category, arr);
      }
    }
    return [...catMap.entries()]
      .map(([category, rates]) => ({
        category,
        avg: Math.round(rates.reduce((a, b) => a + b, 0) / rates.length),
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [studentCategoryRates]);

  // --- 차시별 평균 ---
  const sessionAverages = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of scores) {
      const arr = m.get(s.subject) || [];
      arr.push(s.score);
      m.set(s.subject, arr);
    }
    return [...m.entries()]
      .map(([subject, vals]) => ({
        subject,
        avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      }))
      .sort((a, b) => {
        const numA = parseInt(a.subject) || 0;
        const numB = parseInt(b.subject) || 0;
        return numA - numB;
      });
  }, [scores]);

  // --- KPI 집계 ---
  const kpi = useMemo(() => {
    const allAvg = scores.length > 0
      ? Math.round((scores.reduce((s, sc) => s + sc.score, 0) / scores.length) * 10) / 10
      : 0;

    const studentAvgs = students.map(st => {
      const ss = scores.filter(s => s.student_id === st.id);
      return ss.length > 0 ? ss.reduce((sum, s) => sum + s.score, 0) / ss.length : 0;
    }).filter(a => a > 0);
    const highest = studentAvgs.length > 0 ? Math.round(Math.max(...studentAvgs) * 10) / 10 : 0;
    const lowest = studentAvgs.length > 0 ? Math.round(Math.min(...studentAvgs) * 10) / 10 : 0;

    const growthSlopes = students.map(st => {
      const ss = scores.filter(s => s.student_id === st.id);
      return calculateGrowthSlope(ss);
    });
    const avgGrowth = growthSlopes.length > 0
      ? Math.round((growthSlopes.reduce((a, b) => a + b, 0) / growthSlopes.length) * 10) / 10
      : 0;

    const presentCount = attendance.filter(a => a.status === 'present').length;
    const lateCount = attendance.filter(a => a.status === 'late' || a.status === 'early_leave').length;
    const totalAttRecords = attendance.length;
    const avgAttRate = totalAttRecords > 0
      ? Math.round(((presentCount + lateCount * 0.5) / totalAttRecords) * 1000) / 10
      : 0;

    const eduNoteSubmitRate = students.length > 0
      ? Math.round((new Set(educationNotes.map(n => n.student_id)).size / students.length) * 100)
      : 0;

    return { allAvg, highest, lowest, avgGrowth, avgAttRate, eduNoteSubmitRate };
  }, [scores, students, attendance, educationNotes]);

  // --- 적응지수 + 주의 교육생 ---
  const adaptationData = useMemo(() => {
    const results: { student: Student; adaptation: ReturnType<typeof calculateAdaptationIndex>; adviceType: string | null }[] = [];
    for (const student of students) {
      const sScores = scores.filter(s => s.student_id === student.id);
      const sAttendance = attendance.filter(a => a.student_id === student.id);
      const sNotes = parsedNotes.filter(n => n.student_id === student.id);
      const catRates = studentCategoryRates.get(student.id) || [];
      const sMemoCategories = memos.filter(m => m.student_id === student.id).map(m => m.category);
      const sTagTrackings = coachingReports.filter(r => r.student_id === student.id).map(r => r.tag_tracking);

      const adaptation = calculateAdaptationIndex({
        studentId: student.id, studentName: student.name,
        scores: sScores, attendance: sAttendance, notes: sNotes,
        totalEducationDays, categoryRates: catRates,
        memoCategories: sMemoCategories, tagTrackings: sTagTrackings,
      });

      const riskCheck = calculateRiskChecklist({
        studentId: student.id, studentName: student.name,
        scores: sScores, attendance: sAttendance, notes: sNotes,
        memoCategories: sMemoCategories, totalEducationDays, categoryRates: catRates,
      });

      const advice = generateHRAdvice(riskCheck, adaptation);
      results.push({ student, adaptation, adviceType: advice?.typeLabel || null });
    }
    return results;
  }, [students, scores, attendance, parsedNotes, studentCategoryRates, memos, coachingReports, totalEducationDays]);

  const adaptationStats = useMemo(() => {
    const totals = adaptationData.map(d => d.adaptation.total);
    const avg = totals.length > 0 ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : 0;
    const high = adaptationData.filter(d => d.adaptation.group === 'high').length;
    const mid = adaptationData.filter(d => d.adaptation.group === 'mid').length;
    const low = adaptationData.filter(d => d.adaptation.group === 'low').length;
    const attentionStudents = adaptationData.filter(d => d.adviceType !== null);
    const typeCounts = new Map<string, number>();
    for (const s of attentionStudents) {
      if (s.adviceType) typeCounts.set(s.adviceType, (typeCounts.get(s.adviceType) || 0) + 1);
    }
    return { avg, high, mid, low, attentionCount: attentionStudents.length, typeCounts };
  }, [adaptationData]);

  // --- 메모 분포 ---
  const memoDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of memos) {
      counts.set(m.category, (counts.get(m.category) || 0) + 1);
    }
    const total = memos.length;
    return [...counts.entries()]
      .map(([category, count]) => ({
        category,
        label: MEMO_LABELS[category] || category,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        color: MEMO_COLORS[category] || '#9CA3AF',
      }))
      .sort((a, b) => b.count - a.count);
  }, [memos]);

  // --- PDF 출력 ---
  const printToPDF = useCallback(() => {
    const el = document.getElementById('batch-summary-content');
    if (!el) return;
    const html = el.innerHTML;
    const pw = window.open('', '_blank');
    if (!pw) return;

    pw.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>기수 요약 리포트 — ${selectedBatch?.name || ''}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #fff; color: #1a1a1a;
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 10pt; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  @page { size: A4 landscape; margin: 12mm 16mm; }
  .summary-wrap { max-width: 1100px; margin: 0 auto; }
  .summary-header { text-align: center; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #E5E7EB; }
  .summary-header h1 { font-size: 20pt; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 4px; }
  .summary-header .meta { font-size: 10pt; color: #6B7280; }
  .summary-header .meta span { margin: 0 8px; }
  .kpi-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 18px; }
  .kpi-card { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 10px; padding: 12px 14px; text-align: center; }
  .kpi-label { font-size: 8.5pt; color: #6B7280; font-weight: 500; margin-bottom: 2px; }
  .kpi-value { font-size: 18pt; font-weight: 800; letter-spacing: -0.02em; }
  .kpi-sub { font-size: 7.5pt; color: #9CA3AF; margin-top: 1px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .section { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 14px 16px; }
  .section-title { font-size: 11pt; font-weight: 700; margin-bottom: 10px; letter-spacing: -0.01em; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .bar-label { width: 52px; font-size: 8pt; color: #374151; text-align: right; flex-shrink: 0; font-weight: 500; }
  .bar-track { flex: 1; height: 16px; background: #F3F4F6; border-radius: 4px; overflow: hidden; position: relative; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .bar-value { width: 36px; font-size: 8pt; color: #374151; font-weight: 600; text-align: left; flex-shrink: 0; }
  .cat-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  .cat-table th { text-align: left; padding: 5px 8px; color: #6B7280; font-weight: 600; border-bottom: 1px solid #E5E7EB; }
  .cat-table td { padding: 5px 8px; border-bottom: 1px solid #F3F4F6; }
  .cat-bar { display: inline-block; height: 10px; border-radius: 3px; vertical-align: middle; margin-right: 6px; }
  .dist-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .dist-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .dist-label { font-size: 8.5pt; color: #374151; flex: 1; }
  .dist-count { font-size: 8.5pt; font-weight: 700; color: #1a1a1a; }
  .dist-bar-track { flex: 2; height: 10px; background: #F3F4F6; border-radius: 3px; overflow: hidden; }
  .dist-bar-fill { height: 100%; border-radius: 3px; }
  .group-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .group-badge { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; font-size: 9pt; font-weight: 700; color: #fff; }
  .group-info { flex: 1; }
  .group-name { font-size: 9pt; font-weight: 600; color: #374151; }
  .group-count { font-size: 13pt; font-weight: 800; }
  .group-pct { font-size: 8pt; color: #9CA3AF; }
  .stat-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #F3F4F6; font-size: 9pt; }
  .stat-label { color: #6B7280; }
  .stat-value { font-weight: 700; color: #1a1a1a; }
  .footer { text-align: center; margin-top: 16px; padding-top: 10px; border-top: 1px solid #E5E7EB; font-size: 7.5pt; color: #9CA3AF; }
</style>
</head>
<body>
<div class="summary-wrap">${html}</div>
</body>
</html>`);
    pw.document.close();
    setTimeout(() => { pw.print(); }, 600);
  }, [selectedBatch]);

  if (actionRef) actionRef.current = printToPDF;

  if (!selectedBatch) {
    return <p style={{ color: 'var(--text-muted)', padding: 40 }}>기수를 선택해주세요.</p>;
  }

  const total = students.length;
  const barColor = (v: number) => v >= 80 ? '#22C55E' : v >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <div>
      {/* 인쇄 대상 영역 */}
      <div id="batch-summary-content">
        {/* 헤더 */}
        <div className="summary-header" style={{ textAlign: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid var(--border)' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
            {selectedBatch.name}
          </h1>
          <div className="meta" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            <span>{formatDate(selectedBatch.start_date)} ~ {formatDate(selectedBatch.end_date)}</span>
            <span style={{ margin: '0 8px' }}>|</span>
            <span>수료 {students.length}명</span>
            {droppedStudents.length > 0 && <span> / 퇴사 {droppedStudents.length}명</span>}
          </div>
        </div>

        {/* KPI 카드 */}
        <div className="kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: '시험 전체 평균', value: `${kpi.allAvg}`, unit: '점', color: '#3B82F6', sub: `최고 ${kpi.highest} / 최저 ${kpi.lowest}` },
            { label: '성장 기울기', value: `${kpi.avgGrowth >= 0 ? '+' : ''}${kpi.avgGrowth}`, unit: '점', color: kpi.avgGrowth >= 0 ? '#22C55E' : '#EF4444', sub: '초반 3회 → 최근 3회' },
            { label: '출석률 평균', value: `${kpi.avgAttRate}`, unit: '%', color: '#22C55E', sub: `총 ${attendance.length}건` },
            { label: '적응지수 평균', value: `${adaptationStats.avg}`, unit: '점', color: '#A855F7', sub: `상${adaptationStats.high} 중${adaptationStats.mid} 하${adaptationStats.low}` },
            { label: '교육일지 참여', value: `${educationNotes.length}`, unit: '건', color: '#3B82F6', sub: `자율학습 ${selfStudyNotes.length}건` },
            { label: '주의 교육생', value: `${adaptationStats.attentionCount}`, unit: '명', color: adaptationStats.attentionCount > 0 ? '#EF4444' : '#22C55E', sub: `전체 ${total}명 중` },
          ].map((item, i) => (
            <div key={i} className="kpi-card" style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', padding: '14px 16px', textAlign: 'center',
            }}>
              <div className="kpi-label" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 2 }}>{item.label}</div>
              <div className="kpi-value" style={{ fontSize: 28, fontWeight: 800, color: item.color, letterSpacing: '-0.02em' }}>
                {item.value}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 3 }}>{item.unit}</span>
              </div>
              <div className="kpi-sub" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.sub}</div>
            </div>
          ))}
        </div>

        {/* 차시별 평균 + 카테고리별 정답률 */}
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* 차시별 평균 */}
          <div className="section" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
            <div className="section-title" style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.01em' }}>차시별 평균 점수</div>
            {sessionAverages.map((s) => (
              <div key={s.subject} className="bar-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="bar-label" style={{ width: 52, fontSize: 12, color: 'var(--text-second)', textAlign: 'right', flexShrink: 0, fontWeight: 500 }}>{s.subject}</span>
                <div className="bar-track" style={{ flex: 1, height: 18, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                  <div className="bar-fill" style={{ width: `${s.avg}%`, height: '100%', background: barColor(s.avg), borderRadius: 4 }} />
                </div>
                <span className="bar-value" style={{ width: 40, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{s.avg}</span>
              </div>
            ))}
          </div>

          {/* 카테고리별 정답률 */}
          <div className="section" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
            <div className="section-title" style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.01em' }}>카테고리별 평균 정답률</div>
            <table className="cat-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', fontSize: 12 }}>카테고리</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', fontSize: 12, width: '50%' }}>정답률</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', fontSize: 12 }}>%</th>
                </tr>
              </thead>
              <tbody>
                {batchCategoryRates.map((c) => (
                  <tr key={c.category}>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--bg-elevated)', fontWeight: 500, color: 'var(--text-second)' }}>{c.category}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--bg-elevated)' }}>
                      <span className="cat-bar" style={{ display: 'inline-block', width: `${c.avg}%`, maxWidth: '100%', height: 12, borderRadius: 3, background: barColor(c.avg), verticalAlign: 'middle' }} />
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--bg-elevated)', textAlign: 'right', fontWeight: 700, color: barColor(c.avg) }}>{c.avg}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 적응지수 분포 + 태도 참여 + 메모 분포 */}
        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* 적응지수 분포 */}
          <div className="section" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
            <div className="section-title" style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.01em' }}>적응지수 분포</div>
            {([
              { label: '상 (70+)', count: adaptationStats.high, color: '#22C55E' },
              { label: '중 (50~69)', count: adaptationStats.mid, color: '#F59E0B' },
              { label: '하 (~49)', count: adaptationStats.low, color: '#EF4444' },
            ] as const).map((g) => (
              <div key={g.label} className="group-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div className="group-badge" style={{ width: 36, height: 36, borderRadius: '50%', background: g.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 700 }}>
                  {g.count}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="group-name" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-second)' }}>{g.label}</div>
                  <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ width: total > 0 ? `${(g.count / total) * 100}%` : '0%', height: '100%', background: g.color, borderRadius: 4 }} />
                  </div>
                </div>
                <span className="group-pct" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                  {total > 0 ? Math.round((g.count / total) * 100) : 0}%
                </span>
              </div>
            ))}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>평균</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#A855F7', marginLeft: 8 }}>{adaptationStats.avg}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 2 }}>점</span>
            </div>
          </div>

          {/* 태도/참여 지표 */}
          <div className="section" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
            <div className="section-title" style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.01em' }}>태도/참여 지표</div>
            {[
              { label: '평균 출석률', value: `${kpi.avgAttRate}%` },
              { label: '교육일지 총 건수', value: `${educationNotes.length}건` },
              { label: '실습일지 총 건수', value: `${practiceNotes.length}건` },
              { label: '자율학습 노트', value: `${selfStudyNotes.length}건` },
              { label: '질문하기 총 건수', value: `${totalQuestionCount}건` },
              { label: '교육자 메모 총 건수', value: `${memos.length}건` },
            ].map((s, i) => (
              <div key={i} className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--bg-elevated)', fontSize: 13 }}>
                <span className="stat-label" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                <span className="stat-value" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* 교육자 메모 분포 */}
          <div className="section" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
            <div className="section-title" style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.01em' }}>교육자 메모 분포</div>
            {memoDistribution.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>메모 데이터 없음</p>
            )}
            {memoDistribution.map((m) => (
              <div key={m.category} className="dist-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="dist-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                <span className="dist-label" style={{ fontSize: 13, color: 'var(--text-second)', minWidth: 50 }}>{m.label}</span>
                <div className="dist-bar-track" style={{ flex: 1, height: 12, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                  <div className="dist-bar-fill" style={{ width: `${m.pct}%`, height: '100%', background: m.color, borderRadius: 3 }} />
                </div>
                <span className="dist-count" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', minWidth: 50, textAlign: 'right' }}>{m.count}건 ({m.pct}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* 주의 교육생 유형 분포 */}
        {adaptationStats.attentionCount > 0 && (
          <div className="section" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 16 }}>
            <div className="section-title" style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.01em' }}>
              주의 교육생 유형 분포 ({adaptationStats.attentionCount}명)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {[...adaptationStats.typeCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} style={{
                    padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--text-second)' }}>{type}</span>
                    <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>{count}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>명</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div className="footer" style={{ textAlign: 'center', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
          일룸(iloom) LSA 입문교육 관리 시스템 — 생성일 {getKSTToday()}
        </div>
      </div>
    </div>
  );
}
