'use client';

import { useState, useMemo } from 'react';
import type { Batch, Student, TestScore, Attendance } from '@/lib/types';
import { calculateAdaptationIndex, calculateAvgScore, calculateDailyAverages } from '@/lib/analysis';
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
  memos: { student_id: string; category: string }[];
}

// ── 가상 수주 데이터 ──
interface SalesData {
  studentId: string;
  studentName: string;
  week: string;
  consultCount: number;
  orderCount: number;
  orderAmount: number;
  orderCategories: string[];
}

function generateMockSalesData(students: Student[]): SalesData[] {
  const weeks = ['W1', 'W2', 'W3', 'W4'];
  const categories = ['학생방', '침실', '거실', '키즈룸', '서재', '다이닝', '옷장', '조명'];
  const data: SalesData[] = [];

  // 시드 기반 랜덤 (동일한 결과 유지)
  let seed = 42;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  for (const student of students) {
    // 교육생별 기본 역량 (이름 해시 기반)
    const nameHash = student.name.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    const baseSkill = 0.3 + (nameHash % 50) / 100; // 0.3~0.8

    for (let wi = 0; wi < weeks.length; wi++) {
      const growth = 1 + wi * 0.15; // 주차별 성장
      const consultCount = Math.floor((3 + rand() * 8) * growth);
      const conversionRate = baseSkill * (0.6 + wi * 0.1) * (0.8 + rand() * 0.4);
      const orderCount = Math.max(0, Math.floor(consultCount * Math.min(conversionRate, 0.7)));
      const avgAmount = 150 + rand() * 400;
      const orderAmount = Math.round(orderCount * avgAmount);

      const numCats = Math.min(orderCount, 1 + Math.floor(rand() * 3));
      const shuffled = [...categories].sort(() => rand() - 0.5);
      const orderCategories = shuffled.slice(0, numCats);

      data.push({
        studentId: student.id,
        studentName: student.name,
        week: weeks[wi],
        consultCount,
        orderCount,
        orderAmount,
        orderCategories,
      });
    }
  }
  return data;
}

// ── 스타일 ──
const cardStyle: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' };
const sectionTitle: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 };

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

function rateColor(rate: number) {
  if (rate >= 80) return { bg: '#30D15833', text: 'var(--green)' };
  if (rate >= 60) return { bg: '#FF9F0A33', text: 'var(--orange)' };
  return { bg: '#FF453A33', text: 'var(--red)' };
}

// ── 메인 ──
export default function AnalyticsClient({ batches, students, scores, attendance, notes, testResponses, questions, memos }: Props) {
  const activeBatches = batches.filter(b => !b.is_archived);
  const archivedBatches = batches.filter(b => b.is_archived);
  const [selectedBatchId, setSelectedBatchId] = useState(activeBatches[0]?.id || batches[0]?.id || '');

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

  // 가상 수주 데이터
  const salesData = useMemo(() => generateMockSalesData(batchStudents), [batchStudents]);

  // 카테고리별 정답률
  const categoryRates = useMemo(() => {
    const qMap = new Map<string, Question>();
    for (const q of questions) { if (q.batch_id === selectedBatchId) qMap.set(`${q.session}_${q.question_id}`, q); }
    const catMap = new Map<string, { correct: number; total: number }>();
    const batchStudentIds = new Set(batchStudents.map(s => s.id));
    for (const r of testResponses) {
      if (!batchStudentIds.has(r.student_id)) continue;
      const q = qMap.get(`${r.session}_${r.question_id}`);
      if (!q || !q.category) continue;
      const cell = catMap.get(q.category) || { correct: 0, total: 0 };
      cell.total++; if (r.is_correct) cell.correct++;
      catMap.set(q.category, cell);
    }
    return [...catMap.entries()].map(([category, v]) => ({
      category, rate: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0, total: v.total,
    })).sort((a, b) => b.rate - a.rate);
  }, [batchStudents, testResponses, questions, selectedBatchId]);

  // 학생별 카테고리 정답률 (적응 지수용)
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

  // 적응 지수 (교차 분석용)
  const adaptationIndices = useMemo(() => {
    return batchStudents.map(student => {
      const sScores = scores.filter(s => s.student_id === student.id);
      const sAttendance = attendance.filter(a => a.student_id === student.id);
      const sNotes = notes.filter(n => n.student_id === student.id).map(n => ({ ...parseNoteMeta(n.content), created_at: n.created_at }));
      const catRates = studentCategoryRates.get(student.id) || [];
      return calculateAdaptationIndex({ studentId: student.id, studentName: student.name, scores: sScores, attendance: sAttendance, notes: sNotes, totalEducationDays, categoryRates: catRates });
    }).sort((a, b) => b.total - a.total);
  }, [batchStudents, scores, attendance, notes, studentCategoryRates, totalEducationDays]);

  // ── 교차 분석 1: 시험 성적 그룹별 수주 전환율 ──
  const crossScoreVsSales = useMemo(() => {
    const groups: { label: string; students: string[]; avgConversion: number; avgAmount: number }[] = [];
    const sorted = [...adaptationIndices].sort((a, b) => b.breakdown.examAvg - a.breakdown.examAvg);
    const third = Math.ceil(sorted.length / 3);
    const labels = ['상위 (시험 우수)', '중위', '하위 (시험 부진)'];
    for (let i = 0; i < 3; i++) {
      const slice = sorted.slice(i * third, (i + 1) * third);
      const ids = slice.map(s => s.studentId);
      const groupSales = salesData.filter(s => ids.includes(s.studentId));
      const totalConsult = groupSales.reduce((s, d) => s + d.consultCount, 0);
      const totalOrder = groupSales.reduce((s, d) => s + d.orderCount, 0);
      const totalAmount = groupSales.reduce((s, d) => s + d.orderAmount, 0);
      groups.push({ label: labels[i], students: ids, avgConversion: totalConsult > 0 ? Math.round((totalOrder / totalConsult) * 100) : 0, avgAmount: ids.length > 0 ? Math.round(totalAmount / ids.length) : 0 });
    }
    return groups;
  }, [adaptationIndices, salesData]);

  // ── 교차 분석 2: 카테고리 정답률 vs 수주 분야 ──
  const crossCategoryVsSales = useMemo(() => {
    const salesByCategory = new Map<string, number>();
    for (const s of salesData) {
      for (const cat of s.orderCategories) {
        salesByCategory.set(cat, (salesByCategory.get(cat) || 0) + s.orderAmount);
      }
    }
    return categoryRates.map(cr => ({
      category: cr.category,
      examRate: cr.rate,
      salesAmount: salesByCategory.get(cr.category) || 0,
    }));
  }, [categoryRates, salesData]);

  // ── 교차 분석 3: 적응 지수 vs 수주 전환율 (교육생별) ──
  const crossAdaptationVsSales = useMemo(() => {
    return adaptationIndices.map(idx => {
      const studentSales = salesData.filter(s => s.studentId === idx.studentId);
      const totalConsult = studentSales.reduce((s, d) => s + d.consultCount, 0);
      const totalOrder = studentSales.reduce((s, d) => s + d.orderCount, 0);
      const totalAmount = studentSales.reduce((s, d) => s + d.orderAmount, 0);
      return {
        name: idx.studentName,
        adaptationScore: idx.total,
        group: idx.group,
        conversionRate: totalConsult > 0 ? Math.round((totalOrder / totalConsult) * 100) : 0,
        totalAmount,
      };
    });
  }, [adaptationIndices, salesData]);

  // ── 교차 분석 4: 태도(출석률/일지) vs 수주 ──
  const crossAttitudeVsSales = useMemo(() => {
    return batchStudents.map(student => {
      const sAtt = attendance.filter(a => a.student_id === student.id);
      let attScore = 0;
      for (const a of sAtt) { if (a.status === 'present') attScore += 1; else if (a.status === 'late' || a.status === 'early_leave') attScore += 0.5; }
      const attRate = totalEducationDays > 0 ? Math.round((attScore / totalEducationDays) * 100) : 0;

      const sNotes = notes.filter(n => n.student_id === student.id);
      const eduNotes = sNotes.filter(n => { const m = parseNoteMeta(n.content); return !m.tags?.includes('실습일지') && !m.tags?.includes('자율학습'); });
      const submitRate = totalEducationDays > 0 ? Math.round((eduNotes.length / totalEducationDays) * 100) : 0;

      const studentSales = salesData.filter(s => s.studentId === student.id);
      const totalOrder = studentSales.reduce((s, d) => s + d.orderCount, 0);
      const totalConsult = studentSales.reduce((s, d) => s + d.consultCount, 0);

      return {
        name: student.name,
        attRate,
        submitRate,
        conversionRate: totalConsult > 0 ? Math.round((totalOrder / totalConsult) * 100) : 0,
      };
    }).sort((a, b) => b.conversionRate - a.conversionRate);
  }, [batchStudents, attendance, notes, totalEducationDays, salesData]);

  // ── 주간 수주 추이 ──
  const weeklySalesTrend = useMemo(() => {
    const weeks = ['W1', 'W2', 'W3', 'W4'];
    return weeks.map(w => {
      const weekData = salesData.filter(s => s.week === w);
      const totalConsult = weekData.reduce((s, d) => s + d.consultCount, 0);
      const totalOrder = weekData.reduce((s, d) => s + d.orderCount, 0);
      const totalAmount = weekData.reduce((s, d) => s + d.orderAmount, 0);
      return {
        date: w,
        avg: batchStudents.length > 0 ? Math.round(totalAmount / batchStudents.length) : 0,
        conversion: totalConsult > 0 ? Math.round((totalOrder / totalConsult) * 100) : 0,
      };
    });
  }, [salesData, batchStudents]);

  // ── 렌더 ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>교육 효과 분석</h2>
          <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)} style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
            {activeBatches.length > 0 && <optgroup label="진행 중">{activeBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>}
            {archivedBatches.length > 0 && <optgroup label="보관됨">{archivedBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>}
          </select>
        </div>
        <div style={{ background: 'var(--orange-dim)', color: 'var(--orange)', borderRadius: 'var(--radius-pill)', padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
          가상 수주 데이터로 미리보기
        </div>
      </div>

      {/* 안내 배너 */}
      <div style={{ ...cardStyle, marginBottom: 20, borderColor: 'var(--blue)', background: 'var(--blue-dim)' }}>
        <p style={{ fontSize: 15, color: 'var(--text-primary)', margin: 0, lineHeight: 1.7 }}>
          <b>이 페이지는 &quot;교육 프로그램 자체의 효과&quot;를 분석하는 곳이에요.</b><br />
          <span style={{ color: 'var(--text-second)' }}>
            &quot;이 교육생이 잘하나?&quot;가 아니라 <b>&quot;이 교육이 진짜 효과가 있나?&quot;</b>를 증명하는 데이터예요.<br />
            지금은 <span style={{ color: 'var(--orange)', fontWeight: 600 }}>가상 수주 데이터</span>로 미리보기 중이에요. 실제 수주 데이터가 입력되면 자동으로 반영돼요.
          </span>
        </p>
      </div>

      {/* ── 1. 주간 수주 추이 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={cardStyle}>
          <h2 style={sectionTitle}>주간 수주 금액 추이</h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>교육생 1인 평균 주간 수주 금액 (만원)</p>
          <ScoreTrendChart data={weeklySalesTrend} height={220} />
        </div>
        <div style={cardStyle}>
          <h2 style={sectionTitle}>주간 전환율 추이</h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>상담 건수 대비 수주 건수 비율</p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {weeklySalesTrend.map(w => (
              <div key={w.date} style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{w.date}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--blue)' }}>{w.conversion}%</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>평균 {w.avg}만원</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 2. 교차 분석: 시험 성적 그룹 vs 수주 ── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={sectionTitle}>교차 분석 1: 시험 성적이 수주에 영향을 줄까?</h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          교육생을 시험 성적 상/중/하로 나누고, 각 그룹의 수주 전환율과 수주 금액을 비교해요.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {crossScoreVsSales.map((group, i) => {
            const colors = [{ bg: 'var(--green-dim)', border: 'var(--green)', text: 'var(--green)' }, { bg: 'var(--orange-dim)', border: 'var(--orange)', text: 'var(--orange)' }, { bg: 'var(--red-dim)', border: 'var(--red)', text: 'var(--red)' }];
            const c = colors[i];
            return (
              <div key={group.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 'var(--radius-md)', padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 8 }}>{group.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{group.students.length}명</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>{group.avgConversion}%</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>전환율</div>
                <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: c.text }}>{group.avgAmount.toLocaleString()}만원</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>1인 평균 총 수주</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, padding: 14, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6 }}>
          <b>인사이트:</b> {(() => {
            const top = crossScoreVsSales[0];
            const bottom = crossScoreVsSales[2];
            if (!top || !bottom) return '데이터 부족';
            const gap = top.avgConversion - bottom.avgConversion;
            if (gap > 10) return `시험 성적 상위 그룹이 하위보다 전환율이 ${gap}%p 높아요. 시험 성적이 실전 성과를 예측하는 좋은 지표예요!`;
            if (gap > 0) return `시험 성적 상위와 하위 간 전환율 차이가 ${gap}%p로 크지 않아요. 시험 방식이 실전 역량을 충분히 측정하지 못할 수 있어요.`;
            return '시험 성적과 수주 전환율 사이에 역상관이 나타나요. 시험 방식을 재검토할 필요가 있어요.';
          })()}
        </div>
      </div>

      {/* ── 3. 교차 분석: 카테고리 정답률 vs 수주 분야 ── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={sectionTitle}>교차 분석 2: 잘 아는 분야를 잘 팔까?</h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          카테고리별 시험 정답률과 해당 분야의 수주 금액을 비교해요. 정답률이 높은 분야에서 수주도 많다면, 교육이 실전에 효과가 있다는 증거예요.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-second)' }}>카테고리</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--text-second)' }}>시험 정답률</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-second)' }}>정답률 바</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--text-second)' }}>수주 금액 (만원)</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-second)' }}>수주 바</th>
              </tr>
            </thead>
            <tbody>
              {crossCategoryVsSales.map(row => {
                const rc = rateColor(row.examRate);
                const maxAmount = Math.max(...crossCategoryVsSales.map(r => r.salesAmount), 1);
                return (
                  <tr key={row.category} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.category}</td>
                    <td style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, color: rc.text }}>{row.examRate}%</td>
                    <td style={{ padding: '10px 14px', width: 120 }}>
                      <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius-xs)', height: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${row.examRate}%`, background: rc.text, borderRadius: 'var(--radius-xs)' }} />
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 600, color: 'var(--blue)' }}>{row.salesAmount.toLocaleString()}</td>
                    <td style={{ padding: '10px 14px', width: 120 }}>
                      <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius-xs)', height: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round((row.salesAmount / maxAmount) * 100)}%`, background: 'var(--blue)', borderRadius: 'var(--radius-xs)' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 4. 교차 분석: 적응 지수 vs 수주 전환율 ── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={sectionTitle}>교차 분석 3: 적응 지수가 수주를 예측할 수 있을까?</h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          교육생별 적응 지수(종합 점수)와 수주 전환율을 비교해요. 이 둘이 비례한다면, 적응 지수로 2기 위험 교육생을 조기 발견할 수 있어요.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {crossAdaptationVsSales.map(row => {
            const gc = { high: 'var(--green)', mid: 'var(--orange)', low: 'var(--red)' }[row.group];
            return (
              <div key={row.name} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{row.name}</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ background: `${gc}33`, color: gc, borderRadius: 'var(--radius-pill)', padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>적응 {row.adaptationScore}</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--blue)' }}>{row.conversionRate}%</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>전환율</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-second)', marginTop: 4 }}>{row.totalAmount.toLocaleString()}만원</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 5. 교차 분석: 태도 vs 수주 ── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={sectionTitle}>교차 분석 4: 성실한 교육생이 수주도 잘할까?</h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          출석률과 교육일지 제출률이 높은 교육생이 실전에서도 잘하는지 확인해요.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-second)' }}>교육생</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--text-second)' }}>출석률</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--text-second)' }}>일지 제출률</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--text-second)' }}>수주 전환율</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--text-second)' }}>상관 신호</th>
              </tr>
            </thead>
            <tbody>
              {crossAttitudeVsSales.map(row => {
                const attColor = rateColor(row.attRate);
                const subColor = rateColor(row.submitRate);
                // 출석+일지 둘 다 높은데 전환율도 높으면 ✓, 둘 다 높은데 전환율 낮으면 ✗
                const isHighAtt = row.attRate >= 80 && row.submitRate >= 60;
                const signal = isHighAtt && row.conversionRate >= 30 ? '일치' : isHighAtt && row.conversionRate < 20 ? '불일치' : row.attRate < 70 && row.conversionRate >= 30 ? '역전' : '—';
                return (
                  <tr key={row.name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.name}</td>
                    <td style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: attColor.text }}>{row.attRate}%</td>
                    <td style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: subColor.text }}>{row.submitRate}%</td>
                    <td style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, color: 'var(--blue)' }}>{row.conversionRate}%</td>
                    <td style={{ textAlign: 'center', padding: '10px 14px', fontSize: 13 }}>{signal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, padding: 14, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6 }}>
          <b>읽는 법:</b> 일치 = 성실한 교육생이 실전에서도 잘한다, 불일치 = 성실했지만 수주가 부진하다 (교육 방식 재검토), 역전 = 태도가 아쉬웠지만 수주는 잘한다 (재능형)
        </div>
      </div>

      {/* ── 6. 2기 교육 설계 근거 (예측 요약) ── */}
      <div style={{ ...cardStyle, borderColor: 'var(--purple)' }}>
        <h2 style={sectionTitle}>2기 교육 설계를 위한 핵심 질문 (1기 데이터 기반)</h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          실제 수주 데이터가 쌓이면, 아래 질문에 데이터로 답할 수 있어요.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { q: '시험 성적이 매장 성과를 예측하나?', status: '분석 3 참고' },
            { q: '어떤 카테고리 교육이 수주에 효과적인가?', status: '분석 2 참고' },
            { q: '적응 지수로 위험 교육생을 조기 발견할 수 있나?', status: '분석 3 참고' },
            { q: '성실한 태도가 실전 성과와 관련 있나?', status: '분석 4 참고' },
            { q: '교육 시간 배분을 어떻게 바꿔야 하나?', status: '수주 후 확인' },
            { q: '2기 위험 교육생 체크리스트 기준값은?', status: '수주 후 확정' },
          ].map(item => (
            <div key={item.q} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{item.q}</div>
                <span style={{ fontSize: 12, color: 'var(--purple)', fontWeight: 600 }}>{item.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
