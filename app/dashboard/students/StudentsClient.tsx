'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Batch, Student, TestScore, Attendance } from '@/lib/types';
import { calculateRiskLevel, calculateAvgScore, calculateAdaptationIndex, calculateRiskChecklist } from '@/lib/analysis';
import RiskBadge from '@/components/RiskBadge';

type PageTab = 'list' | 'analysis';

interface NoteRow { id: string; student_id: string; title: string; content: string; created_at: string; }
interface AnalysisResponse { student_id: string; batch_id: string; session: string; question_id: string; is_correct: boolean; test_date: string; }
interface AnalysisQuestion { id: string; batch_id: string; session: string; question_id: string; category: string | null; series: string | null; detail: string | null; question_text: string | null; }

interface Props {
  batches: Batch[];
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
  notes: NoteRow[];
  testResponses: AnalysisResponse[];
  questions: AnalysisQuestion[];
  memos: { student_id: string; category: string }[];
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

const cardStyle: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 };

export default function StudentsClient({ batches, students: initialStudents, scores, attendance, notes, testResponses, questions, memos }: Props) {
  const [students] = useState(initialStudents);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showDropped, setShowDropped] = useState(false);
  const [search, setSearch] = useState('');
  const [pageTab, setPageTab] = useState<PageTab>('list');
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
      return calculateAdaptationIndex({ studentId: student.id, studentName: student.name, scores: sScores, attendance: sAttendance, notes: sNotes, totalEducationDays, categoryRates: catRates });
    }).sort((a, b) => b.total - a.total);
  }, [batchStudents, scores, attendance, notes, studentCategoryRates, totalEducationDays]);

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

  // 기존 테이블 데이터
  const studentsWithStats = useMemo(() => {
    return students.map((student) => {
      const ss = scores.filter((s) => s.student_id === student.id);
      const sa = attendance.filter((a) => a.student_id === student.id);
      return { ...student, avg_score: calculateAvgScore(ss), risk_level: calculateRiskLevel(ss, sa), absent_count: sa.filter((a) => a.status === 'absent').length, late_count: sa.filter((a) => a.status === 'late').length };
    });
  }, [students, scores, attendance]);

  const droppedCount = studentsWithStats.filter(s => s.is_dropped).length;

  const filtered = useMemo(() => {
    return studentsWithStats.filter((s) => {
      if (!showDropped && s.is_dropped) return false;
      if (showDropped && !s.is_dropped) return false;
      if (!showDropped && filter !== 'all' && s.risk_level !== filter) return false;
      if (search && !s.name.includes(search)) return false;
      return true;
    });
  }, [studentsWithStats, filter, showDropped, search]);

  const filterLabels: Record<string, string> = { all: '전체', high: '위험', medium: '주의', low: '양호' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          👥 교육생
        </h2>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 3 }}>
          {([['list', '명단'], ['analysis', '종합 분석']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setPageTab(key)} style={{
              padding: '8px 16px', borderRadius: 'var(--radius-sm)',
              background: pageTab === key ? 'var(--blue)' : 'transparent',
              color: pageTab === key ? '#fff' : 'var(--text-tertiary)',
              border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ════════ 분석 탭 ════════ */}
      {pageTab === 'analysis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 적응 지수 */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>🎯 입문교육 적응 지수</h3>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
              시험 평균(40%) + 하위 분야(20%) + 출석률(15%) + 교육일지 참여(15%) + 자신감 추이(10%)로 계산해요. 카드를 클릭하면 상세 근거를 볼 수 있어요.
            </p>
            {adaptationIndices.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>교육생 데이터가 없습니다.</p>
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
                      <div style={{ background: 'var(--bg-hover)', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 8 }}>
                        <div style={{ height: '100%', width: `${Math.min(idx.total, 100)}%`, background: gc.text, borderRadius: 6, transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
                        <span>시험 {idx.breakdown.examAvg}점</span>
                        <span>하위분야 {idx.breakdown.weakCategoryCount}/{idx.breakdown.totalCategories}개</span>
                        <span>출석 {idx.breakdown.attendanceRate}%</span>
                        <span>{isExpanded ? '▲ 접기' : '▼ 상세보기'}</span>
                      </div>
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

          {/* 위험 체크리스트 */}
          {riskChecks.length > 0 && (
            <div style={{ ...cardStyle, borderColor: 'var(--red)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>⚠️ 주의가 필요한 교육생 ({riskChecks.length}명)</h3>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>5개 항목 중 해당되는 것이 있는 교육생이에요.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                {riskChecks.map(r => {
                  const idx = adaptationIndices.find(a => a.studentId === r.studentId);
                  const isHighGroup = idx?.group === 'high';
                  let rCardBg = r.riskCount >= 3 ? 'var(--red-dim)' : r.riskCount >= 2 ? 'var(--orange-dim)' : 'var(--bg-elevated)';
                  let rCardBorder = r.riskCount >= 3 ? 'var(--red)' : r.riskCount >= 2 ? 'var(--orange)' : 'var(--border)';
                  let badgeBg = r.riskCount >= 3 ? 'var(--red)' : 'var(--orange)';
                  let badgeText = r.riskCount >= 3 ? '위험' : '주의';
                  if (isHighGroup) { rCardBg = 'var(--blue-dim)'; rCardBorder = 'var(--blue)'; badgeBg = 'var(--blue)'; badgeText = '부분 주의'; }

                  return (
                    <div key={r.studentId} style={{ background: rCardBg, border: `1px solid ${rCardBorder}`, borderRadius: 'var(--radius-md)', padding: 16 }}>
                      {isHighGroup && <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, marginBottom: 6 }}>💡 전체적으로 양호하지만 이 부분은 주의</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {r.studentName}
                          {idx && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>적응 {idx.total}점</span>}
                        </span>
                        <span style={{ background: badgeBg, color: '#fff', borderRadius: 'var(--radius-pill)', padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>{badgeText} {r.riskCount}개 해당</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {r.checks.filter(c => c.triggered).map((c, i) => {
                          let displayValue = c.value;
                          if (c.label.includes('자신감') && c.value !== '미입력') displayValue = c.value.split(', ').map(v => confToKor(v)).join(' → ');
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

          {/* 태도/참여 현황 */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>🙋 태도/참여 현황</h3>
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
            {confidenceTrendData.length > 0 && (
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-second)', marginBottom: 8 }}>자신감 추이 (일별 비율)</h4>
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
        </div>
      )}

      {/* ════════ 명단 탭 (기존) ════════ */}
      {pageTab === 'list' && (
        <>
          {/* 필터 + 상태 기준 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="이름 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: 280, padding: '12px 18px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: 15, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              {!showDropped && (['all', 'high', 'medium', 'low'] as const).map((level) => (
                <button key={level} onClick={() => setFilter(level)} style={{
                  padding: '10px 18px', borderRadius: 'var(--radius-md)',
                  border: filter === level ? 'none' : '1px solid var(--border)',
                  background: filter === level ? 'var(--blue)' : 'transparent',
                  color: filter === level ? '#fff' : 'var(--text-tertiary)',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease',
                }}>{filterLabels[level]}</button>
              ))}
              <button onClick={() => setShowDropped(!showDropped)} style={{
                padding: '10px 18px', borderRadius: 'var(--radius-md)',
                border: showDropped ? 'none' : '1px solid var(--border)',
                background: showDropped ? 'var(--red)' : 'transparent',
                color: showDropped ? '#fff' : 'var(--text-muted)',
                fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease',
              }}>퇴사자{droppedCount > 0 ? ` (${droppedCount})` : ''}</button>
            </div>
            <details style={{ cursor: 'pointer', marginLeft: 'auto' }}>
              <summary style={{ fontSize: 13, color: 'var(--text-muted)', listStyle: 'none' }}>ℹ️ 기준</summary>
              <div style={{ position: 'absolute', right: 40, marginTop: 8, padding: '14px 18px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', fontSize: 13, color: 'var(--text-second)', lineHeight: 1.8, zIndex: 10, width: 340 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div><span style={{ color: 'var(--red)', fontWeight: 700 }}>● 위험</span> — 결석 2회+ 또는 최근 3회 평균 60점 미만</div>
                  <div><span style={{ color: 'var(--orange)', fontWeight: 700 }}>● 주의</span> — 지각 3회+ 또는 최근 3회 평균 80점 미만</div>
                  <div><span style={{ color: 'var(--green)', fontWeight: 700 }}>● 양호</span> — 최근 3회 평균 80점 이상 + 출결 양호</div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>※ 평균 점수 = 전체 차시 평균 / 상태 = 최근 3회 기준</div>
              </div>
            </details>
          </div>

          {/* 테이블 */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['이름', '평균 점수', '결석', '지각', '상태'].map((h) => (
                      <th key={h} style={{ padding: '14px 20px', textAlign: h === '이름' ? 'left' : 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s ease', opacity: s.is_dropped ? 0.5 : 1 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ padding: '14px 20px' }}>
                        <Link href={`/dashboard/students/${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--text-primary)' }}>
                          <div style={{ width: 40, height: 40, borderRadius: '50%', background: s.is_dropped ? 'var(--bg-hover)' : 'var(--blue-dim)', color: s.is_dropped ? 'var(--text-muted)' : 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{s.name[0]}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 600, textDecoration: s.is_dropped ? 'line-through' : 'none' }}>{s.name}</span>
                            {s.is_dropped && <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, background: 'var(--red-dim)', color: 'var(--red)' }}>퇴사</span>}
                          </div>
                        </Link>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>{s.avg_score}점</td>
                      <td style={{ padding: '14px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>{s.absent_count}회</td>
                      <td style={{ padding: '14px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>{s.late_count}회</td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        {s.is_dropped ? <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.dropped_at}</span> : <RiskBadge level={s.risk_level} />}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 16 }}>교육생 데이터가 없어요.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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
