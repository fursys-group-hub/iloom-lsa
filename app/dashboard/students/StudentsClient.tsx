'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
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

  // 위험 체크리스트 + HR 조언 (카드 뱃지용)
  const studentHRAdvice = useMemo(() => {
    const result = new Map<string, HRAdvice>();
    for (const student of batchStudents) {
      const sScores = scores.filter(s => s.student_id === student.id);
      const sAttendance = attendance.filter(a => a.student_id === student.id);
      const sNotes = notes.filter(n => n.student_id === student.id).map(n => ({ ...parseNoteMeta(n.content), created_at: n.created_at }));
      const sMemoCategories = memos.filter(m => m.student_id === student.id).map(m => m.category);
      const catRates = studentCategoryRates.get(student.id) || [];
      const rc = calculateRiskChecklist({ studentId: student.id, studentName: student.name, scores: sScores, attendance: sAttendance, notes: sNotes, memoCategories: sMemoCategories, totalEducationDays, categoryRates: catRates });
      const idx = adaptationIndices.find(a => a.studentId === student.id);
      const advice = generateHRAdvice(rc, idx);
      if (advice) result.set(student.id, advice);
    }
    return result;
  }, [batchStudents, scores, attendance, notes, memos, studentCategoryRates, totalEducationDays, adaptationIndices]);

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

  // 비교 모드
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
        교육생 분석
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 적응 지수 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>입문교육 적응 지수</h3>
                <button
                  onClick={() => { setCompareMode(prev => !prev); setSelectedIds([]); }}
                  style={{
                    padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: 'none',
                    background: compareMode ? 'var(--blue)' : 'transparent',
                    color: compareMode ? '#fff' : 'var(--text-tertiary)',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  }}
                >{compareMode ? '비교 해제' : '비교'}</button>
              </div>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, maxWidth: '100%' }}>
                {adaptationIndices.map(idx => {
                  const gc = GROUP_COLORS[idx.group];
                  const student = batchStudents.find(s => s.id === idx.studentId);
                  const birthYear = student?.birth_date ? new Date(student.birth_date).getFullYear() : null;
                  const advice = studentHRAdvice.get(idx.studentId);
                  const adviceColorMap: Record<string, { bg: string; text: string }> = {
                    red: { bg: 'var(--red-dim)', text: 'var(--red)' },
                    orange: { bg: 'var(--orange-dim)', text: 'var(--orange)' },
                    blue: { bg: 'var(--blue-dim)', text: 'var(--blue)' },
                    purple: { bg: 'var(--purple-dim)', text: 'var(--purple)' },
                    green: { bg: 'var(--green-dim)', text: 'var(--green)' },
                  };
                  const ac = advice ? (adviceColorMap[advice.typeColor] || adviceColorMap.orange) : null;
                  const isSelected = selectedIds.includes(idx.studentId);

                  const handleCardClick = (e: React.MouseEvent) => {
                    if (!compareMode) return; // 일반 모드에서는 Link가 처리
                    e.preventDefault();
                    setSelectedIds(prev =>
                      prev.includes(idx.studentId)
                        ? prev.filter(id => id !== idx.studentId)
                        : prev.length < 3 ? [...prev, idx.studentId] : prev
                    );
                  };

                  const cardContent = (
                    <div style={{
                      background: advice?.typeColor === 'red' ? 'var(--red-dim)' : 'var(--bg-main)',
                      border: compareMode && isSelected ? '2px solid var(--blue)' : '2px solid transparent',
                      borderRadius: 'var(--radius-md)', padding: '16px 20px',
                      cursor: 'pointer',
                      transition: 'background 0.2s, border-color 0.2s',
                      height: '100%', display: 'flex', flexDirection: 'column',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = advice?.typeColor === 'red' ? 'var(--red-dim)' : 'var(--bg-main)'; }}
                    >
                      {/* 상단: 사진 + 이름 + 정보 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        {compareMode && (
                          <div style={{
                            width: 20, height: 20, borderRadius: 'var(--radius-xs)', flexShrink: 0,
                            border: isSelected ? 'none' : '2px solid var(--border)',
                            background: isSelected ? 'var(--blue)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isSelected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>V</span>}
                          </div>
                        )}
                        {student?.photo_url ? (
                          <img src={student.photo_url} alt={idx.studentName} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--blue-dim)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{idx.studentName[0]}</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idx.studentName}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[birthYear ? `${birthYear}년생` : null, student?.education].filter(Boolean).join(' · ') || '\u00A0'}
                          </div>
                        </div>
                      </div>
                      {/* 하단: 시험평균 + HR뱃지 + 적응지수 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          시험 <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{idx.breakdown.examAvg}</span>
                          <span style={{ margin: '0 6px', color: 'var(--border)' }}>|</span>
                          출석 <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{idx.breakdown.attendanceRate}%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {ac && advice && (
                            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: ac.bg, color: ac.text }}>{advice.typeLabel}</span>
                          )}
                          <span style={{ background: gc.bg, color: gc.text, borderRadius: 'var(--radius-pill)', padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{gc.label} {idx.total}점</span>
                        </div>
                      </div>
                    </div>
                  );

                  return compareMode ? (
                    <div key={idx.studentId} onClick={handleCardClick} style={{ minWidth: 0 }}>
                      {cardContent}
                    </div>
                  ) : (
                    <Link key={idx.studentId} href={`/dashboard/students/${idx.studentId}`} style={{ textDecoration: 'none', color: 'inherit', minWidth: 0 }}>
                      {cardContent}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* 비교 패널 */}
          {compareMode && selectedIds.length >= 2 && (() => {
            const COMPARE_COLORS = ['var(--blue)', 'var(--purple)', 'var(--orange)'];
            const selectedData = selectedIds.map((id, i) => {
              const idx = adaptationIndices.find(a => a.studentId === id);
              return idx ? { ...idx, color: COMPARE_COLORS[i] } : null;
            }).filter(Boolean) as (typeof adaptationIndices[0] & { color: string })[];

            const radarItems = ['시험', '하위분야', '출석', '일지참여', '성장', '자신감', '만성오답', '메모톤'];
            const radarData = radarItems.map((label, i) => {
              const keys = ['examAvg', 'weakCategories', 'attendanceRate', 'participation', 'growthSlope', 'confidenceTrend', 'chronicScore', 'memoBalance'] as const;
              const entry: Record<string, string | number> = { label };
              selectedData.forEach((d, j) => { entry[`s${j}`] = d.breakdown[keys[i]]; });
              return entry;
            });

            const compareItems = [
              { label: '시험 평균', key: 'examAvg' as const },
              { label: '출석률', key: 'attendanceRate' as const, suffix: '%' },
              { label: '성장 기울기', key: 'growthSlope' as const },
              { label: '교육일지 참여', key: 'participation' as const },
              { label: '자신감 추이', key: 'confidenceTrend' as const },
              { label: '하위 분야', key: 'weakCategories' as const },
            ];

            return (
              <div style={cardStyle}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>교육생 비교</h3>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 13 }}>
                  {selectedData.map(d => (
                    <span key={d.studentId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.studentName}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{d.total}점</span>
                    </span>
                  ))}
                </div>
                <div className="compare-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
                  {/* 레이더 차트 */}
                  <div>
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                        <PolarGrid stroke="var(--border)" gridType="polygon" />
                        <PolarAngleAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-tertiary)', fontWeight: 500 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                        {selectedData.map((d, j) => (
                          <Radar key={d.studentId} dataKey={`s${j}`} name={d.studentName} stroke={d.color} fill={d.color} fillOpacity={0.1} strokeWidth={2} dot={{ r: 3, fill: d.color, strokeWidth: 0 }} />
                        ))}
                        <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* 항목별 비교 테이블 */}
                  <div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>항목</th>
                          {selectedData.map(d => (
                            <th key={d.studentId} style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: d.color, borderBottom: '1px solid var(--border)' }}>{d.studentName}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {compareItems.map(item => {
                          const values = selectedData.map(d => d.breakdown[item.key]);
                          const max = Math.max(...values);
                          return (
                            <tr key={item.label} style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</td>
                              {selectedData.map((d, j) => {
                                const v = values[j];
                                return (
                                  <td key={d.studentId} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 14, fontWeight: v === max ? 700 : 500, color: v === max ? d.color : 'var(--text-tertiary)' }}>
                                    {v}{item.suffix || ''}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        <tr style={{ borderTop: '2px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>적응지수 합계</td>
                          {selectedData.map(d => (
                            <td key={d.studentId} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 16, fontWeight: 700, color: d.color }}>{d.total}점</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 태도/참여 현황 */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>태도/참여 현황</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: '평균 출석률', value: `${participationStats.avgAttendance}%`, color: 'var(--green)', desc: '지각=0.5 반영' },
                { label: '교육일지 제출률', value: `${participationStats.avgSubmitRate}%`, color: 'var(--blue)', desc: `교육일 ${totalEducationDays}일 기준` },
                { label: '평균 참여 점수', value: `${participationStats.avgParticipation}점`, color: 'var(--purple)', desc: 'STEP 1~3 작성 기준' },
              ].map(stat => (
                <div key={stat.label} style={{ background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', padding: 16, textAlign: 'center' }}>
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
