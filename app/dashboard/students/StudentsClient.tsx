'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Batch, Student, TestScore, Attendance, TagTracking, HRAdvice } from '@/lib/types';
import { calculateAdaptationIndex, calculateRiskChecklist, generateHRAdvice } from '@/lib/analysis';

interface NoteRow { id: string; student_id: string; title: string; content: string; created_at: string; }
interface AnalysisResponse { student_id: string; batch_id: string; session: string; question_id: string; is_correct: boolean; test_date: string; }
interface AnalysisQuestion { id: string; batch_id: string; session: string; question_id: string; category: string | null; series: string | null; detail: string | null; question_text: string | null; }
interface CoachingReportRow { student_id: string; tag_tracking: TagTracking | null; created_at: string; }

interface Props {
  batches: Batch[];
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
  notes: NoteRow[];
  testResponses: AnalysisResponse[];
  questions: AnalysisQuestion[];
  memos: { student_id: string; category: string }[];
  coachingReports: CoachingReportRow[];
}

// 유틸
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

function confToKor(c: string | null | undefined): string {
  if (!c) return '';
  const lower = c.toLowerCase();
  if (lower === 'very_confident') return '자신만만';
  if (lower === 'confident' || lower === '높음') return '자신있어요';
  if (lower === 'understood') return '자신있어요';
  if (lower === 'normal' || lower === '보통') return '보통이에요';
  if (lower === 'uncertain' || lower === 'half') return '알쏭달쏭';
  if (lower === 'need_help' || lower === 'low' || lower === '낮음') return '도움요청';
  return c;
}

const GROUP_COLORS = {
  high: { bg: 'var(--green-dim)', text: 'var(--green)', label: '상' },
  mid: { bg: 'var(--orange-dim)', text: 'var(--orange)', label: '중' },
  low: { bg: 'var(--red-dim)', text: 'var(--red)', label: '하' },
};

const cardStyle: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' };

export default function StudentsClient({ batches, students: initialStudents, scores, attendance, notes, testResponses, questions, memos, coachingReports }: Props) {
  const [students] = useState(initialStudents);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // 활성 기수
  const activeBatch = batches.find(b => !b.is_archived);
  const batchId = activeBatch?.id || batches[0]?.id || '';

  // 기수별 활성 학생
  const batchStudents = useMemo(() => students.filter(s => s.batch_id === batchId && !s.is_dropped), [students, batchId]);

  // 교육일수
  const totalEducationDays = useMemo(() => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return 20;
    const start = new Date(batch.start_date);
    const end = new Date(batch.end_date);
    const today = new Date();
    const effectiveEnd = today < end ? today : end;
    let days = 0;
    const d = new Date(start);
    while (d <= effectiveEnd) { if (d.getDay() !== 0 && d.getDay() !== 6) days++; d.setDate(d.getDate() + 1); }
    return Math.max(days, 1);
  }, [batches, batchId]);

  // 학생별 카테고리 정답률
  const studentCategoryRates = useMemo(() => {
    const result = new Map<string, { category: string; rate: number }[]>();
    const batchStudentIds = new Set(batchStudents.map(s => s.id));
    const qMap = new Map<string, AnalysisQuestion>();
    for (const q of questions) { if (q.batch_id === batchId) qMap.set(`${q.session}_${q.question_id}`, q); }
    for (const studentId of batchStudentIds) {
      const catMap = new Map<string, { correct: number; total: number }>();
      const sResponses = testResponses.filter(r => r.student_id === studentId);
      for (const r of sResponses) {
        const q = qMap.get(`${r.session}_${r.question_id}`);
        if (!q || !q.category) continue;
        const cell = catMap.get(q.category) || { correct: 0, total: 0 };
        cell.total++; if (r.is_correct) cell.correct++;
        catMap.set(q.category, cell);
      }
      result.set(studentId, [...catMap.entries()].map(([category, v]) => ({ category, rate: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0 })));
    }
    return result;
  }, [batchStudents, testResponses, questions, batchId]);

  // 적응 지수
  const adaptationIndices = useMemo(() => {
    return batchStudents.map(student => {
      const sScores = scores.filter(s => s.student_id === student.id);
      const sAttendance = attendance.filter(a => a.student_id === student.id);
      const sNotes = notes.filter(n => n.student_id === student.id).map(n => ({ ...parseNoteMeta(n.content), created_at: n.created_at }));
      const catRates = studentCategoryRates.get(student.id) || [];
      const sMemoCategories = memos.filter(m => m.student_id === student.id).map(m => m.category);
      const sTagTrackings = coachingReports.filter(r => r.student_id === student.id).map(r => r.tag_tracking);
      return calculateAdaptationIndex({
        studentId: student.id, studentName: student.name,
        scores: sScores, attendance: sAttendance, notes: sNotes,
        totalEducationDays, categoryRates: catRates,
        memoCategories: sMemoCategories,
        tagTrackings: sTagTrackings,
      });
    }).sort((a, b) => b.total - a.total);
  }, [batchStudents, scores, attendance, notes, studentCategoryRates, totalEducationDays, memos, coachingReports]);

  // 위험 체크리스트
  const riskChecks = useMemo(() => {
    return batchStudents.map(student => {
      const sScores = scores.filter(s => s.student_id === student.id);
      const sAttendance = attendance.filter(a => a.student_id === student.id);
      const sNotes = notes.filter(n => n.student_id === student.id).map(n => ({ ...parseNoteMeta(n.content), created_at: n.created_at }));
      const sMemoCategories = memos.filter(m => m.student_id === student.id).map(m => m.category);
      const catRates = studentCategoryRates.get(student.id) || [];
      return calculateRiskChecklist({ studentId: student.id, studentName: student.name, scores: sScores, attendance: sAttendance, notes: sNotes, memoCategories: sMemoCategories, totalEducationDays, categoryRates: catRates });
    }).filter(r => r.riskCount > 0).sort((a, b) => b.riskCount - a.riskCount);
  }, [batchStudents, scores, attendance, notes, memos, studentCategoryRates, totalEducationDays]);

  // 태도/참여 통계
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

  // 자신감 추이 (5단계 → 차트는 높음/보통/낮음 3색으로 그룹핑)
  const confidenceTrendData = useMemo(() => {
    const dateMap = new Map<string, { high: number; mid: number; low: number; total: number }>();
    for (const student of batchStudents) {
      for (const note of notes.filter(n => n.student_id === student.id)) {
        const meta = parseNoteMeta(note.content);
        if (meta.tags?.includes('실습일지') || meta.tags?.includes('자율학습')) continue;
        const conf = (meta.confidence || '').toLowerCase();
        if (!conf) continue;
        const date = note.created_at.slice(0, 10);
        const entry = dateMap.get(date) || { high: 0, mid: 0, low: 0, total: 0 };
        entry.total++;
        // 5단계 → 3그룹: 높음(very_confident+confident), 보통(normal), 낮음(uncertain+need_help)
        if (conf === 'very_confident' || conf === 'confident' || conf === '높음' || conf === 'understood') entry.high++;
        else if (conf === 'normal' || conf === '보통') entry.mid++;
        else if (conf === 'uncertain' || conf === 'half' || conf === 'need_help' || conf === 'low' || conf === '낮음') entry.low++;
        dateMap.set(date, entry);
      }
    }
    return [...dateMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
      date: date.slice(5),
      높음: v.total > 0 ? Math.round((v.high / v.total) * 100) : 0,
      보통: v.total > 0 ? Math.round((v.mid / v.total) * 100) : 0,
      낮음: v.total > 0 ? Math.round((v.low / v.total) * 100) : 0,
    }));
  }, [batchStudents, notes]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
        개별분석
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 적응 지수 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, position: 'relative' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>입문교육 적응 지수</h3>
              <details style={{ cursor: 'pointer', position: 'relative' }}>
                <summary style={{ fontSize: 13, color: 'var(--text-muted)', listStyle: 'none' }}>계산 기준</summary>
                <div style={{ position: 'absolute', right: 0, marginTop: 8, padding: '16px 18px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', fontSize: 13, color: 'var(--text-second)', zIndex: 10, width: 480 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>
                    적응 지수는 8가지를 종합해서 계산해요
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    각 항목의 점수에 아래 비율을 곱해서 100점 만점으로 합산해요
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>항목</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)', width: 60 }}>비율</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>무엇을 보나요?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: '시험 평균',     weight: '30%', note: '전체 차시 시험 점수의 평균' },
                        { name: '하위 분야',     weight: '15%', note: '60점 미만인 제품 카테고리 개수' },
                        { name: '출석률',        weight: '13%', note: '출석/지각/결석 (지각은 0.5로 계산)' },
                        { name: '교육일지 참여', weight: '15%', note: '일지 제출과 STEP 작성 충실도' },
                        { name: '성장 기울기',   weight: '10%', note: '최근 3차시와 초반 3차시 점수 비교' },
                        { name: '자신감 추이',   weight: '8%',  note: '일지 자신감 단계의 변화 (상승/유지/하락)' },
                        { name: '만성 오답',     weight: '5%',  note: '계속 반복해서 틀리는 문항이 얼마나 되는지' },
                        { name: '메모 톤',       weight: '4%',  note: '교육자가 남긴 칭찬/주의 메모의 비율' },
                      ].map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {row.name}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-primary)', fontWeight: 700 }}>{row.weight}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-tertiary)', fontSize: 12 }}>{row.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* 부정 신호 감점 — 강조 박스 */}
                  <div style={{
                    marginTop: 12,
                    padding: '12px 14px',
                    background: 'var(--red-dim)',
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>
                      최근 무너지는 신호가 있으면 추가 감점돼요 <span style={{ fontSize: 11, fontWeight: 500 }}>(최대 −8점)</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                      점수가 괜찮아도 &quot;조용히 무너지는&quot; 학생을 놓치지 않기 위해서예요
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-second)', lineHeight: 1.7 }}>
                      • 최근 시험 점수가 <strong style={{ color: 'var(--red)' }}>초반보다 5점 넘게 떨어짐</strong> → <strong>−5점</strong><br/>
                      • 일지 자신감이 <strong style={{ color: 'var(--red)' }}>계속 낮은 상태로 유지</strong> → <strong>−3점</strong>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    학생 카드를 클릭하면 각 항목의 상세 근거를 볼 수 있어요
                  </div>
                </div>
              </details>
            </div>
            {adaptationIndices.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>교육생 데이터가 없습니다.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {adaptationIndices.map(idx => {
                  const gc = GROUP_COLORS[idx.group];
                  const isExpanded = expandedCard === idx.studentId;
                  return (
                    <div key={idx.studentId} onClick={() => setExpandedCard(isExpanded ? null : idx.studentId)} style={{ background: idx.group === 'low' ? gc.bg : 'var(--bg-elevated)', border: `1px solid ${isExpanded ? gc.text : idx.group === 'low' ? gc.text : 'var(--border)'}`, borderRadius: 'var(--radius-md)', padding: 16, cursor: 'pointer', transition: 'border-color 0.2s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Link href={`/dashboard/students/${idx.studentId}`} onClick={e => e.stopPropagation()} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }} onMouseEnter={e => { e.currentTarget.style.color = 'var(--blue)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}>{idx.studentName}</Link>
                        <span style={{ background: gc.bg, color: gc.text, borderRadius: 'var(--radius-pill)', padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{gc.label} {idx.total}점</span>
                      </div>
                      <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius-xs)', height: 8, overflow: 'hidden', marginBottom: 8 }}>
                        <div style={{ height: '100%', width: `${Math.min(idx.total, 100)}%`, background: gc.text, borderRadius: 'var(--radius-xs)', transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
                        <span>시험 {idx.breakdown.examAvg}점</span>
                        <span>하위분야 {idx.breakdown.weakCategoryCount}/{idx.breakdown.totalCategories}개</span>
                        <span>출석 {idx.breakdown.attendanceRate}%</span>
                        <span>{isExpanded ? '▲ 접기' : '▼ 상세보기'}</span>
                      </div>
                      {isExpanded && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <DetailRow label="시험 평균" score={idx.breakdown.examAvg} detail={`전체 시험 평균 ${idx.breakdown.examAvg}점`} />
                          <DetailRow label="하위 분야" score={idx.breakdown.weakCategories} detail={`${idx.breakdown.totalCategories}개 분야 중 60점 미만 ${idx.breakdown.weakCategoryCount}개${idx.breakdown.weakCategoryNames.length > 0 ? ` (${idx.breakdown.weakCategoryNames.slice(0, 3).join('/')}${idx.breakdown.weakCategoryNames.length > 3 ? '…' : ''})` : ''}`} />
                          <DetailRow label="출석률" score={idx.breakdown.attendanceRate} detail={`출석률 ${idx.breakdown.attendanceRate}% (지각=0.5 반영)`} />
                          <DetailRow label="교육일지 참여" score={idx.breakdown.participation} detail={idx.breakdown.participationDetail} />
                          <DetailRow label="성장 기울기" score={idx.breakdown.growthSlope} detail={idx.breakdown.growthDetail} />
                          <DetailRow label={`자신감 추이${!idx.breakdown.hasConfidenceData ? ' (미입력)' : ''}`} score={idx.breakdown.confidenceTrend} detail={`${idx.breakdown.confidenceDetail}${!idx.breakdown.hasConfidenceData ? ' → 시험/참여로 분산' : ''}`} />
                          <DetailRow label="만성 오답" score={idx.breakdown.chronicScore} detail={idx.breakdown.chronicDetail} />
                          <DetailRow label="메모 톤" score={idx.breakdown.memoBalance} detail={idx.breakdown.memoBalanceDetail} />
                          {idx.breakdown.deltaDeduction > 0 && (
                            <div style={{ marginTop: 4, padding: '8px 10px', background: 'var(--red-dim)', borderRadius: 'var(--radius-xs)', fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
                              부정 신호 감점 −{idx.breakdown.deltaDeduction}점 ({idx.breakdown.deltaDetail})
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 위험 체크리스트 */}
          {riskChecks.length > 0 && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, position: 'relative' }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>주의가 필요한 교육생 ({riskChecks.length}명)</h3>
                <details style={{ cursor: 'pointer', position: 'relative' }}>
                  <summary style={{ fontSize: 13, color: 'var(--text-muted)', listStyle: 'none' }}>판정 기준</summary>
                  <div style={{ position: 'absolute', right: 0, marginTop: 8, padding: '16px 18px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', fontSize: 13, color: 'var(--text-second)', zIndex: 10, width: 520 }}>

                    {/* Part 1: 체크 항목 */}
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>
                      먼저 6가지 신호를 체크해요
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                      하나라도 해당되면 주의 교육생으로 표시해요
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>체크 항목</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>해당 조건</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { name: '시험 평균',     cond: '전체 차시 평균이 60점 미만' },
                          { name: '하위 분야',     cond: '60점 미만인 제품 카테고리가 4개 이상' },
                          { name: '출석률',        cond: '출석률이 80% 미만 (지각 0.5 반영)' },
                          { name: '자신감',        cond: '최근 일지 자신감이 3회 연속 낮음' },
                          { name: '주의 메모',     cond: '교육자 주의 메모가 2건 이상' },
                          { name: '최근 하락 신호', cond: '성적 5점↓ 하락 또는 자신감 급락' },
                        ].map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{row.name}</td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-tertiary)', fontSize: 12 }}>{row.cond}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Part 2: 유형 판정 */}
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>
                      해당된 신호 조합으로 유형을 정해요
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                      각 유형에 맞춰 맞춤 HR 조언이 자동으로 붙어요
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>유형</th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>언제 이 유형이 되나요?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { name: '복합 위기형',    when: '주의 신호 3개 이상 동시 해당' },
                          { name: '지식 부족형',    when: '시험 낮음 + 하위 분야 많음' },
                          { name: '약점 편중형',    when: '시험은 양호한데 하위 분야만 많음' },
                          { name: '심리 위축형',    when: '자신감이 계속 낮은 상태' },
                          { name: '하락 징후형',    when: '성적이나 자신감이 최근 하락 중' },
                          { name: '근태/동기 이슈형', when: '출석률만 낮은 경우' },
                          { name: '행동 관찰형',    when: '주의 메모만 쌓인 경우' },
                          { name: '부분 주의형',    when: '적응 점수 \'상\' 그룹인데 한두 가지 주의' },
                        ].map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {row.name}
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-tertiary)', fontSize: 12 }}>{row.when}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                      카드 배경색: <strong style={{ color: 'var(--red)' }}>빨강</strong> = 3개+ 위험 · <strong style={{ color: 'var(--orange)' }}>주황</strong> = 1~2개 주의 · <strong style={{ color: 'var(--blue)' }}>파랑</strong> = 부분 주의
                    </div>
                  </div>
                </details>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {riskChecks.map(r => {
                  const idx = adaptationIndices.find(a => a.studentId === r.studentId);
                  const isHighGroup = idx?.group === 'high';
                  const hasDescent = r.checks.some(c => c.label === '최근 하락 신호' && c.triggered);

                  // 기본 색상 — 바탕색으로만 구분 (외곽선 없음)
                  // 1개 해당: 바깥 카드와 구분되도록 elevated 배경
                  let rCardBg = r.riskCount >= 3 ? 'var(--red-dim)' : r.riskCount >= 2 ? 'var(--orange-dim)' : 'var(--bg-elevated)';
                  let badgeBg = r.riskCount >= 3 ? 'var(--red)' : 'var(--orange)';
                  let badgeText = r.riskCount >= 3 ? '위험' : '주의';
                  let topHint: { text: string; color: string } | null = null;

                  if (isHighGroup) {
                    if (hasDescent) {
                      // 🌊 상 그룹인데 조용히 무너지는 중 — 주황색 경고
                      rCardBg = 'var(--orange-dim)';
                      badgeBg = 'var(--orange)';
                      badgeText = '하락 경고';
                      topHint = { text: '전반은 양호하나 최근 하락 징후가 있어요', color: 'var(--orange)' };
                    } else {
                      rCardBg = 'var(--blue-dim)';
                      badgeBg = 'var(--blue)';
                      badgeText = '부분 주의';
                      topHint = { text: '전체적으로 양호하지만 이 부분은 주의', color: 'var(--blue)' };
                    }
                  }

                  // 🆕 HR 조언 자동 생성
                  const advice = generateHRAdvice(r, idx);

                  return (
                    <div key={r.studentId} style={{ background: rCardBg, borderRadius: 'var(--radius-md)', padding: 16 }}>
                      {topHint && <div style={{ fontSize: 12, color: topHint.color, fontWeight: 600, marginBottom: 6 }}>{topHint.text}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {r.studentName}
                          {idx && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>적응 {idx.total}점</span>}
                        </span>
                        <span style={{ background: badgeBg, color: '#fff', borderRadius: 'var(--radius-pill)', padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{badgeText} {r.riskCount}개 해당</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {r.checks.filter(c => c.triggered).map((c, i) => {
                          let displayValue = c.value;
                          if (c.label.includes('자신감') && c.value !== '미입력') displayValue = c.value.split(', ').map(v => confToKor(v)).join(' → ');
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', flexShrink: 0 }} />
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

                      {/* 🆕 HR 조언 박스 */}
                      {advice && <HRAdviceBox advice={advice} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 태도/참여 현황 */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>태도/참여 현황</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
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
            {confidenceTrendData.length > 0 && (
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-second)', marginBottom: 8 }}>자신감 추이 (일별 비율)</h4>
                <div style={{ display: 'flex', gap: 3, alignItems: 'end', minHeight: 120, padding: '0 4px' }}>
                  {confidenceTrendData.map(d => (
                    <div key={d.date} style={{ flex: 1, minWidth: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {d.높음 > 0 && <div style={{ height: Math.max(d.높음 * 0.8, 3), background: 'var(--green)', borderRadius: 'var(--radius-xs)' }} title={`높음 ${d.높음}%`} />}
                        {d.보통 > 0 && <div style={{ height: Math.max(d.보통 * 0.8, 3), background: 'var(--orange)', borderRadius: 'var(--radius-xs)' }} title={`보통 ${d.보통}%`} />}
                        {d.낮음 > 0 && <div style={{ height: Math.max(d.낮음 * 0.8, 3), background: 'var(--red)', borderRadius: 'var(--radius-xs)' }} title={`낮음 ${d.낮음}%`} />}
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>{d.date}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--green)', borderRadius: 'var(--radius-xs)', marginRight: 4 }} />높음</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--orange)', borderRadius: 'var(--radius-xs)', marginRight: 4 }} />보통</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--red)', borderRadius: 'var(--radius-xs)', marginRight: 4 }} />낮음</span>
                </div>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

function DetailRow({ label, score, detail }: { label: string; score: number; detail: string }) {
  const color = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--orange)' : 'var(--red)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--text-second)', minWidth: 130 }}>{label}</span>
        <div style={{ flex: 1, background: 'var(--bg-hover)', borderRadius: 'var(--radius-xs)', height: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(score, 100)}%`, background: color, borderRadius: 'var(--radius-xs)' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 40, textAlign: 'right' }}>{score}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 140 }}>{detail}</div>
    </div>
  );
}

// HR 조언 박스 (주의 교육생 카드 하단)
function HRAdviceBox({ advice }: { advice: HRAdvice }) {
  // 유형별 색상 토큰 매핑
  const colorMap: Record<HRAdvice['typeColor'], { bg: string; border: string; text: string }> = {
    red:    { bg: 'var(--red-dim)',    border: 'var(--red)',    text: 'var(--red)' },
    orange: { bg: 'var(--orange-dim)', border: 'var(--orange)', text: 'var(--orange)' },
    blue:   { bg: 'var(--blue-dim)',   border: 'var(--blue)',   text: 'var(--blue)' },
    purple: { bg: 'var(--purple-dim, rgba(191,90,242,0.15))', border: 'var(--purple)', text: 'var(--purple)' },
    green:  { bg: 'var(--green-dim)',  border: 'var(--green)',  text: 'var(--green)' },
  };
  const c = colorMap[advice.typeColor];

  return (
    <div style={{
      marginTop: 12,
      padding: 12,
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius-sm)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* 유형 뱃지 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          background: c.bg,
          color: c.text,
          fontSize: 12,
          fontWeight: 600,
          padding: '3px 10px',
          borderRadius: 'var(--radius-pill)',
        }}>
          {advice.typeLabel}
        </span>
      </div>

      {/* 어려움 서술 */}
      <div style={{ fontSize: 12.5, color: 'var(--text-second)', lineHeight: 1.55 }}>
        <strong style={{ color: 'var(--text-primary)' }}>어려움</strong> — {advice.difficulty}
      </div>

      {/* 권장 액션 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>권장 액션</div>
        {advice.actions.map((action, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            fontSize: 12.5,
            color: 'var(--text-second)',
            lineHeight: 1.5,
            paddingLeft: 4,
          }}>
            <span style={{ color: c.text, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
            <span>{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
