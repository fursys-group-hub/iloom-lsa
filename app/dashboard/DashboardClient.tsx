'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Student, TestScore, Attendance, TagTracking } from '@/lib/types';
import { calculateAdaptationIndex, calculateRiskChecklist, generateHRAdvice } from '@/lib/analysis';
import { getDayType, DAY_TYPE_CONFIG } from '@/lib/schedule';
import type { ScheduleMap } from '@/lib/schedule';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';

interface BatchInfo {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  advanced_start: string | null;
  advanced_end: string | null;
  is_archived: boolean;
  schedule?: ScheduleMap;
}

interface NoteRow {
  id: string;
  student_id: string;
  title: string;
  content: string;
  created_at: string;
}

interface CommentRow {
  id: string;
  note_id: string;
  author_role: 'admin' | 'student';
  author_name: string;
  content: string;
  created_at: string;
}

interface QuestionRow {
  id: string;
  student_id: string;
  title: string;
  status: 'open' | 'answered' | 'archived';
  created_at: string;
  updated_at: string;
  student_name?: string;
}

interface AnalysisResponse {
  student_id: string;
  batch_id: string;
  session: string;
  question_id: string;
  is_correct: boolean;
  test_date: string;
}

interface AnalysisQuestion {
  id: string;
  batch_id: string;
  session: string;
  question_id: string;
  category: string | null;
}

interface CoachingReportRow {
  student_id: string;
  tag_tracking: TagTracking | null;
  created_at: string;
}

interface Props {
  batches: BatchInfo[];
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
  notes: NoteRow[];
  announcements: { id: string; title: string; created_at: string; batch_id: string }[];
  noteComments: CommentRow[];
  questions: QuestionRow[];
  memoCounts: Record<string, number>;
  memos: { student_id: string; category: string }[];
  testResponses: AnalysisResponse[];
  examQuestions: AnalysisQuestion[];
  coachingReports: CoachingReportRow[];
}

function getBatchStatus(batch: BatchInfo): { label: string; color: string; bg: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (today >= batch.start_date && today <= batch.end_date)
    return { label: '입문교육 진행중', color: 'var(--green)', bg: 'var(--green-dim)' };
  if (batch.advanced_start && batch.advanced_end && today >= batch.advanced_start && today <= batch.advanced_end)
    return { label: '심화교육 진행중', color: 'var(--purple)', bg: 'var(--purple-dim)' };
  if (batch.advanced_end && today > batch.advanced_end)
    return { label: '완료', color: 'var(--text-muted)', bg: 'var(--bg-hover)' };
  if (today > batch.end_date)
    return { label: '매장 배치 대기', color: 'var(--orange)', bg: 'var(--orange-dim)' };
  if (today < batch.start_date)
    return { label: '예정', color: 'var(--blue-light)', bg: 'var(--blue-dim)' };
  return { label: '', color: '', bg: '' };
}

function toKSTDate(utcStr: string): string {
  const d = new Date(utcStr);
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getDDay(targetDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate + 'T00:00:00');
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'D-DAY';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

function getEducationDay(startDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate + 'T00:00:00');
  const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff + 1, 0);
}

// 교육일지 노트 메타 파서 (StudentsClient와 동일)
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

export default function DashboardClient({ batches, students: allStudents, scores: allScores, attendance: allAttendance, notes: allNotes, announcements, noteComments, questions, memos, testResponses, examQuestions, coachingReports }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id || '');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  // 선택된 기수의 학생만 필터 (퇴사자 제외)
  const students = useMemo(() => allStudents.filter(s => s.batch_id === selectedBatchId && !s.is_dropped), [allStudents, selectedBatchId]);
  const droppedStudents = useMemo(() => allStudents.filter(s => s.batch_id === selectedBatchId && s.is_dropped), [allStudents, selectedBatchId]);
  const studentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);
  const scores = useMemo(() => allScores.filter(s => studentIds.has(s.student_id)), [allScores, studentIds]);
  const attendance = useMemo(() => allAttendance.filter(a => studentIds.has(a.student_id)), [allAttendance, studentIds]);

  // 노트 (기수 학생 필터)
  const notes = useMemo(() => allNotes.filter(n => studentIds.has(n.student_id)), [allNotes, studentIds]);

  const todayAttendance = useMemo(() => {
    const recs = attendance.filter((a) => a.date === today);
    return {
      present: recs.filter((a) => a.status === 'present').length,
      late: recs.filter((a) => a.status === 'late').length,
      absent: recs.filter((a) => a.status === 'absent').length,
      total: students.length,
    };
  }, [attendance, today, students.length]);

  // 오늘의 출결 상세 (미출근/지각자 이름)
  const todayAttendanceDetail = useMemo(() => {
    const recs = attendance.filter(a => a.date === today);
    const lateStudents = students.filter(s => recs.some(r => r.student_id === s.id && r.status === 'late'));
    const absentStudents = students.filter(s => recs.some(r => r.student_id === s.id && r.status === 'absent'));
    const checkedIds = new Set(recs.map(a => a.student_id));
    const uncheckedStudents = students.filter(s => !checkedIds.has(s.id));
    return {
      late: lateStudents,
      absent: absentStudents,
      unchecked: uncheckedStudents,
      allPresent: lateStudents.length === 0 && absentStudents.length === 0 && uncheckedStudents.length === 0,
      hasData: recs.length > 0,
    };
  }, [attendance, today, students]);

  // 🆕 교육일수 (적응 지수 계산용)
  const totalEducationDays = useMemo(() => {
    if (!selectedBatch) return 20;
    const start = new Date(selectedBatch.start_date);
    const end = new Date(selectedBatch.end_date);
    const todayDate = new Date();
    const effectiveEnd = todayDate < end ? todayDate : end;
    let days = 0;
    const d = new Date(start);
    while (d <= effectiveEnd) { if (d.getDay() !== 0 && d.getDay() !== 6) days++; d.setDate(d.getDate() + 1); }
    return Math.max(days, 1);
  }, [selectedBatch]);

  // 🆕 학생별 카테고리 정답률 (주의 교육생 판정용)
  const studentCategoryRates = useMemo(() => {
    const result = new Map<string, { category: string; rate: number }[]>();
    const qMap = new Map<string, AnalysisQuestion>();
    for (const q of examQuestions) { if (q.batch_id === selectedBatchId) qMap.set(`${q.session}_${q.question_id}`, q); }
    for (const student of students) {
      const catMap = new Map<string, { correct: number; total: number }>();
      const sResponses = testResponses.filter(r => r.student_id === student.id);
      for (const r of sResponses) {
        const q = qMap.get(`${r.session}_${r.question_id}`);
        if (!q || !q.category) continue;
        const cell = catMap.get(q.category) || { correct: 0, total: 0 };
        cell.total++; if (r.is_correct) cell.correct++;
        catMap.set(q.category, cell);
      }
      result.set(student.id, [...catMap.entries()].map(([category, v]) => ({ category, rate: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0 })));
    }
    return result;
  }, [students, testResponses, examQuestions, selectedBatchId]);

  // 🆕 적응 지수 + 위험 체크리스트 (교육생 종합 분석과 동일 로직)
  const riskStudentsDetailed = useMemo(() => {
    return students.map((student) => {
      const sScores = scores.filter(s => s.student_id === student.id);
      const sAttendance = attendance.filter(a => a.student_id === student.id);
      const sNotes = notes.filter(n => n.student_id === student.id).map(n => ({ ...parseNoteMeta(n.content), created_at: n.created_at }));
      const catRates = studentCategoryRates.get(student.id) || [];
      const sMemoCategories = memos.filter(m => m.student_id === student.id).map(m => m.category);
      const sTagTrackings = coachingReports.filter(r => r.student_id === student.id).map(r => r.tag_tracking);

      const adaptation = calculateAdaptationIndex({
        studentId: student.id, studentName: student.name,
        scores: sScores, attendance: sAttendance, notes: sNotes,
        totalEducationDays, categoryRates: catRates,
        memoCategories: sMemoCategories,
        tagTrackings: sTagTrackings,
      });

      const riskCheck = calculateRiskChecklist({
        studentId: student.id, studentName: student.name,
        scores: sScores, attendance: sAttendance, notes: sNotes,
        memoCategories: sMemoCategories,
        totalEducationDays, categoryRates: catRates,
      });

      const advice = generateHRAdvice(riskCheck, adaptation);

      return { student, adaptation, riskCheck, advice };
    }).filter(r => r.riskCheck.riskCount > 0)
      .sort((a, b) => b.riskCheck.riskCount - a.riskCheck.riskCount || a.adaptation.total - b.adaptation.total);
  }, [students, scores, attendance, notes, studentCategoryRates, memos, coachingReports, totalEducationDays]);

  const subjectAverages = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of scores) { const a = m.get(s.subject) || []; a.push(s.score); m.set(s.subject, a); }
    return [...m.entries()]
      .map(([subject, vals]) => ({ subject, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 }))
      .sort((a, b) => {
        const numA = parseInt(a.subject.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.subject.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });
  }, [scores]);

  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  // KST 기준 날짜 (스케줄 조회 전용 — 스케줄 키가 KST 날짜로 저장됨)
  const kstToday = useMemo(() => {
    const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  }, []);
  const kstYesterday = useMemo(() => {
    const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  // 오늘 교육일지 제출 현황
  const todayNotes = useMemo(() => {
    return notes.filter(n => {
      const kstDate = toKSTDate(n.created_at);
      if (kstDate !== today) return false;
      try { const p = JSON.parse(n.content); return !(p.meta?.tags || []).includes('실습일지'); } catch { return true; }
    });
  }, [notes, today]);

  const noteSubmitted = useMemo(() => new Set(todayNotes.map(n => n.student_id)), [todayNotes]);
  const noteNotSubmitted = useMemo(() => students.filter(s => !noteSubmitted.has(s.id)), [students, noteSubmitted]);

  // 어제 교육일지 미제출자
  const yesterdayNotes = useMemo(() => {
    return notes.filter(n => {
      const kstDate = toKSTDate(n.created_at);
      if (kstDate !== yesterday) return false;
      try { const p = JSON.parse(n.content); return !(p.meta?.tags || []).includes('실습일지'); } catch { return true; }
    });
  }, [notes, yesterday]);

  const yesterdaySubmitted = useMemo(() => new Set(yesterdayNotes.map(n => n.student_id)), [yesterdayNotes]);
  const yesterdayNotSubmitted = useMemo(() => students.filter(s => !yesterdaySubmitted.has(s.id)), [students, yesterdaySubmitted]);

  // 실습일지 실적 합산
  const practiceStats = useMemo(() => {
    const practiceNotes = notes.filter(n => {
      try { const p = JSON.parse(n.content); return (p.meta?.tags || []).includes('실습일지'); } catch { return false; }
    });
    const totals = { count: practiceNotes.length, consult: 0, estimate: 0, order: 0, amount: 0 };
    practiceNotes.forEach(n => {
      try {
        const p = JSON.parse(n.content);
        const s = p.steps || {};
        totals.consult += s.stats_consult || 0;
        totals.estimate += s.stats_estimate || 0;
        totals.order += s.stats_order || 0;
        totals.amount += s.stats_amount || 0;
      } catch { /* */ }
    });
    return totals;
  }, [notes]);

  // 미확인 코멘트 (교육생이 남긴 답글 중 최근 것)
  const studentComments = useMemo(() => {
    return noteComments
      .filter(c => c.author_role === 'student')
      .slice(0, 5);
  }, [noteComments]);

  // D-day 계산
  const dDayInfo = useMemo(() => {
    if (!selectedBatch) return null;
    const status = getBatchStatus(selectedBatch);
    if (status.label === '입문교육 진행중') {
      return { label: `입문교육 ${getEducationDay(selectedBatch.start_date)}일차`, dday: getDDay(selectedBatch.end_date) };
    }
    if (status.label === '심화교육 진행중' && selectedBatch.advanced_end) {
      return { label: '심화교육 진행중', dday: getDDay(selectedBatch.advanced_end) };
    }
    if (status.label === '예정') {
      return { label: '입문교육 시작까지', dday: getDDay(selectedBatch.start_date) };
    }
    return null;
  }, [selectedBatch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* 인사 + 기수 선택 + D-day */}
      <div className="greeting-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            안녕하세요, 수지님
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-tertiary)', marginTop: 4 }}>
            오늘의 교육 현황이에요
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {dDayInfo && (
            <span style={{
              padding: '6px 14px', borderRadius: 'var(--radius-sm)',
              background: 'var(--blue-dim)',
              fontSize: 13, fontWeight: 600, color: 'var(--blue)',
              whiteSpace: 'nowrap',
            }}>
              {dDayInfo.label} <span style={{ fontWeight: 800 }}>{dDayInfo.dday}</span>
            </span>
          )}
          <select
            value={selectedBatchId}
            onChange={e => setSelectedBatchId(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'var(--bg-surface)',
              color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              outline: 'none',
            }}
          >
            {batches.filter(b => !b.is_archived).map(b => (
              <option key={b.id} value={b.id}>{b.name} 기수</option>
            ))}
            {batches.some(b => b.is_archived) && (
              <optgroup label="보관된 기수">
                {batches.filter(b => b.is_archived).map(b => (
                  <option key={b.id} value={b.id}>{b.name} 기수 (보관)</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {/* 2컬럼 */}
      <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }}>

        {/* ─── 왼쪽: 운영 ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 0. 교육 일정 달력 */}
          {selectedBatch && (
            <ScheduleCalendar
              batch={selectedBatch}
              kstToday={kstToday}
              testDates={scores.map(s => s.test_date).filter(Boolean)}
              announcementItems={announcements.filter(a => a.batch_id === selectedBatchId).map(a => ({ date: a.created_at.slice(0, 10), title: a.title }))}
            />
          )}

          {/* 1. 차시별 평균 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed.scores ? 0 : 16, cursor: 'pointer' }} onClick={() => toggle('scores')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsed.scores ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
                <h3 style={{ ...sectionTitle, margin: 0 }}>차시별 평균</h3>
              </div>
              <Link href="/dashboard/tests" style={cardLinkStyle} onClick={e => e.stopPropagation()}>전체보기 →</Link>
            </div>
            {!collapsed.scores && (subjectAverages.length > 0 ? (
              <div style={{ width: '100%', height: Math.max(180, subjectAverages.length * 20 + 60) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subjectAverages} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="subject" axisLine={false} tickLine={false}
                      tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                    />
                    <YAxis
                      domain={[0, 100]} axisLine={false} tickLine={false}
                      tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                      ticks={[0, 20, 40, 60, 80, 100]}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--bg-hover)' }}
                      contentStyle={{
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        borderRadius: 8, fontSize: 13, boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value) => [`${value}점`, '평균']}
                    />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]} maxBarSize={36}>
                      {subjectAverages.map((s, i) => (
                        <Cell
                          key={i}
                          fill={s.avg >= 80 ? '#22C55E' : s.avg >= 70 ? '#3B82F6' : s.avg >= 60 ? '#F59E0B' : '#EF4444'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>데이터 없음</p>
            ))}
          </div>

          {/* 2. 교육일지 — 어제/오늘 2컬럼 */}
          {(() => {
            // 스케줄은 KST 날짜 기준 (노트/출결 필터와 별개)
            const yesterdayEduType = getDayType(selectedBatch?.schedule, kstYesterday);
            const yesterdayEduConfig = DAY_TYPE_CONFIG[yesterdayEduType];
            const todayEduType = getDayType(selectedBatch?.schedule, kstToday);
            const todayEduConfig = DAY_TYPE_CONFIG[todayEduType];
            return (
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed.notes ? 0 : 16, cursor: 'pointer' }} onClick={() => toggle('notes')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsed.notes ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
                    <h3 style={{ ...sectionTitle, margin: 0 }}>교육일지</h3>
                  </div>
                  <Link href="/dashboard/education-logs" style={cardLinkStyle} onClick={e => e.stopPropagation()}>전체보기 →</Link>
                </div>

                {!collapsed.notes && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {/* 어제 */}
                  <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-main)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>어제</span>
                      <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 600, background: yesterdayEduConfig.bg, color: yesterdayEduConfig.color }}>
                        {yesterdayEduConfig.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-second)', marginBottom: yesterdayNotSubmitted.length > 0 ? 8 : 0 }}>
                      제출 <span style={{ fontWeight: 700, color: 'var(--green)' }}>{yesterdaySubmitted.size}</span> / 미제출 <span style={{ fontWeight: 700, color: yesterdayNotSubmitted.length > 0 ? 'var(--red)' : 'var(--green)' }}>{yesterdayNotSubmitted.length}</span>
                    </div>
                    {yesterdayNotSubmitted.length > 0 ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {yesterdayNotSubmitted.map(s => (
                          <span key={s.id} style={{
                            padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
                            background: 'var(--red-dim)', color: 'var(--red)',
                          }}>{s.name}</span>
                        ))}
                      </div>
                    ) : yesterdaySubmitted.size > 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--green)' }}>전원 제출 완료</div>
                    ) : null}
                  </div>

                  {/* 오늘 */}
                  <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-main)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>오늘</span>
                      <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 600, background: todayEduConfig.bg, color: todayEduConfig.color }}>
                        {todayEduConfig.label}
                      </span>
                    </div>
                    {todayEduType === 'off' ? (
                      <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>휴무일</div>
                    ) : todayEduType === 'practice' ? (
                      <div style={{ fontSize: 14, color: 'var(--text-second)' }}>
                        <Link href="/dashboard/practice" style={{ color: 'var(--blue-light)', textDecoration: 'underline' }}>실습일지</Link> 확인
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, color: 'var(--text-second)' }}>
                        제출 <span style={{ fontWeight: 700 }}>{noteSubmitted.size}</span> / 미제출 <span style={{ fontWeight: 700 }}>{noteNotSubmitted.length}</span>
                      </div>
                    )}
                  </div>
                </div>}
              </div>
            );
          })()}

          {/* 3. 질문관리 + 교육일지 답글 통합 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed.questions ? 0 : 16, cursor: 'pointer' }} onClick={() => toggle('questions')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsed.questions ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
                <h3 style={{ ...sectionTitle, margin: 0 }}>질문관리</h3>
                {questions.filter(q => q.status === 'open').length > 0 && (
                  <span style={{ ...badgeBase, background: 'var(--red-dim)', color: 'var(--red)' }}>
                    {questions.filter(q => q.status === 'open').length}개 대기
                  </span>
                )}
                {studentComments.length > 0 && (
                  <span style={{ ...badgeBase, background: 'var(--blue-dim)', color: 'var(--blue)' }}>
                    답글 {studentComments.length}건
                  </span>
                )}
              </div>
              <Link href="/dashboard/questions" style={cardLinkStyle} onClick={e => e.stopPropagation()}>전체보기 →</Link>
            </div>
            {!collapsed.questions && (questions.filter(q => q.status !== 'archived').length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questions.filter(q => q.status !== 'archived').slice(0, 4).map(q => {
                  const st = q.status === 'open'
                    ? { bg: 'var(--orange-dim)', color: 'var(--orange)', label: '대기' }
                    : { bg: 'var(--green-dim)', color: 'var(--green)', label: '답변' };
                  return (
                    <Link key={q.id} href="/dashboard/questions" style={{
                      padding: '10px 14px', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-main)', display: 'flex', alignItems: 'center', gap: 8,
                      textDecoration: 'none', transition: 'background 0.15s ease',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; }}
                    >
                      <span style={{ ...badgeBase, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
                      <span className="hide-mobile" style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--blue-dim)', color: 'var(--blue)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700,
                      }}>{(q.student_name || '?')[0]}</span>
                      <span style={{ fontSize: 14, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.title}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {q.student_name}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', padding: '32px 0', textAlign: 'center' }}>아직 질문이 없어요</p>
            ))}
          </div>
        </div>

        {/* ─── 오른쪽: 분석/참고 ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 0. 출결 요약 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}>오늘의 출결</h3>
              <Link href="/dashboard/attendance" style={cardLinkStyle}>전체보기 →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: droppedStudents.length > 0 ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: 4 }}>
              {[
                { label: '교육 인원', value: todayAttendance.total, color: 'var(--text-primary)' },
                { label: '출석', value: todayAttendance.present, color: 'var(--green)' },
                { label: '지각', value: todayAttendance.late, color: 'var(--orange)' },
                { label: '결석', value: todayAttendance.absent, color: 'var(--red)' },
                ...(droppedStudents.length > 0 ? [{ label: '퇴사', value: droppedStudents.length, color: 'var(--text-muted)' }] : []),
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>명</span></div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {(todayAttendanceDetail.absent.length > 0 || todayAttendanceDetail.late.length > 0) && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {todayAttendanceDetail.absent.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>결석</span>
                    {todayAttendanceDetail.absent.map(s => (
                      <span key={s.id} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--red-dim)', color: 'var(--red)' }}>{s.name}</span>
                    ))}
                  </div>
                )}
                {todayAttendanceDetail.late.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--orange)' }}>지각</span>
                    {todayAttendanceDetail.late.map(s => (
                      <span key={s.id} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--orange-dim)', color: 'var(--orange)' }}>{s.name}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 1. 주의 교육생 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed.risk ? 0 : 12, cursor: 'pointer' }} onClick={() => toggle('risk')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsed.risk ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
                <h3 style={{ ...sectionTitle, marginBottom: 0 }}>주의 교육생 ({riskStudentsDetailed.length}명)</h3>
              </div>
              <Link href="/dashboard/students?tab=analysis" style={cardLinkStyle} onClick={e => e.stopPropagation()}>전체보기 →</Link>
            </div>
            {!collapsed.risk && (riskStudentsDetailed.length > 0 ? (
              <div className="risk-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {riskStudentsDetailed.map(({ student, adaptation, riskCheck, advice }) => {
                  const typeColorMap: Record<string, { bg: string; text: string }> = {
                    red:    { bg: 'var(--red-dim)',    text: 'var(--red)' },
                    orange: { bg: 'var(--orange-dim)', text: 'var(--orange)' },
                    blue:   { bg: 'var(--blue-dim)',   text: 'var(--blue)' },
                    purple: { bg: 'var(--purple-dim, rgba(191,90,242,0.15))', text: 'var(--purple)' },
                    green:  { bg: 'var(--green-dim)',  text: 'var(--green)' },
                  };
                  const badgeColor = advice ? typeColorMap[advice.typeColor] : typeColorMap.orange;
                  const badgeLabel = advice ? advice.typeLabel : '주의';

                  return (
                    <Link key={student.id} href="/dashboard/students?tab=analysis"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-main)', textDecoration: 'none',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; }}
                    >
                      <div className="hide-mobile" style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--blue-dim)', color: 'var(--blue)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, flexShrink: 0,
                      }}>{student.name[0]}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {student.name}
                          <span className="hide-mobile" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 5 }}>
                            적응 {adaptation.total}점 · {riskCheck.riskCount}개 해당
                          </span>
                        </span>
                      </div>
                      <span style={{
                        ...badgeBase,
                        flexShrink: 0,
                        background: badgeColor.bg,
                        color: badgeColor.text,
                      }}>
                        {badgeLabel}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-tertiary)', padding: '16px 0', textAlign: 'center' }}>모든 교육생이 양호해요</p>
            ))}
          </div>

          {/* 2. 실습일지 실적 요약 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed.practice ? 0 : 16, cursor: 'pointer' }} onClick={() => toggle('practice')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsed.practice ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
                <h3 style={{ ...sectionTitle, margin: 0 }}>실습일지 실적</h3>
              </div>
              <Link href="/dashboard/practice" style={cardLinkStyle} onClick={e => e.stopPropagation()}>전체보기 →</Link>
            </div>
            {!collapsed.practice && (practiceStats.count > 0 ? (
              (() => {
                const c = practiceStats.consult, e = practiceStats.estimate, o = practiceStats.order;
                return (
                  <div>
                    {/* 퍼널: 4컬럼 구분선 + 숫자 + 차트 */}
                    <div style={{ display: 'flex' }}>
                      {[
                        { label: '상담', value: c },
                        { label: '견적', value: e },
                        { label: '수주', value: o },
                        { label: '수주금액', value: practiceStats.amount, isAmount: true },
                      ].map((item, i) => (
                        <div key={item.label} style={{ flex: 1, padding: i === 0 ? '0 12px 0 0' : '0 12px', borderLeft: i > 0 ? '1px dashed var(--border)' : 'none' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{item.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: item.isAmount ? 'var(--purple)' : 'var(--text-primary)' }}>
                            {item.isAmount ? item.value.toLocaleString() : item.value}
                            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>{item.isAmount ? '원' : '건'}</span>
                          </div>
                          {/* 각 컬럼 아래에 차트 영역 배치 */}
                          {!item.isAmount && i < 3 && (
                            <div style={{ height: 80 }} />
                          )}
                          {item.isAmount && <div style={{ height: 80 }} />}
                        </div>
                      ))}
                    </div>
                    {/* 퍼널 영역 차트 — 숫자 위에 오버레이 */}
                    <div style={{ width: '100%', height: 80, marginTop: -80, pointerEvents: 'none' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={[
                          { name: '상담', value: c },
                          { name: '견적', value: e },
                          { name: '수주', value: o },
                          { name: '수주금액', value: Math.max(o * 0.7, 1) },
                        ]} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="funnelGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <Area
                            type="monotone" dataKey="value"
                            stroke="#3B82F6" strokeWidth={2}
                            fill="url(#funnelGrad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', padding: '32px 0', textAlign: 'center' }}>아직 실습일지가 없어요</p>
            ))}
          </div>
        </div>
      </div>

      {/* 반응형 */}
      <style>{`
        @media (max-width: 1023px) {
          .main-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .greeting-row { flex-direction: column; align-items: center !important; text-align: center; }
          .risk-grid { grid-template-columns: 1fr !important; }
          .hide-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── 공통 스타일 ─── */

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px 24px',
  boxShadow: 'var(--shadow-sm)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: '0 0 16px',
  letterSpacing: '-0.01em',
};

const cardLinkStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: 'var(--text-muted)',
  textDecoration: 'none',
};

/* 통일 뱃지 스타일 (pill 형태 태그) */
const badgeBase: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 'var(--radius-pill)',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

/* ─── 스케줄 달력 ─── */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SCHEDULE_COLORS: Record<string, { bg: string; text: string }> = {
  education: { bg: 'var(--blue)', text: '#fff' },
  practice: { bg: 'var(--orange)', text: '#fff' },
  off: { bg: 'transparent', text: 'var(--text-muted)' },
};

function ScheduleCalendar({ batch, kstToday, testDates = [], announcementItems = [] }: {
  batch: BatchInfo; kstToday: string; testDates?: string[]; announcementItems?: { date: string; title: string }[];
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    const target = kstToday >= batch.start_date && kstToday <= batch.end_date ? kstToday : batch.start_date;
    return target.slice(0, 7);
  });
  const [selectedDate, setSelectedDate] = useState<string>(kstToday);

  type MemoItem = { text: string; done: boolean };
  const storageKey = 'iloom-calendar-memos';
  const [calMemos, setCalMemos] = useState<Record<string, MemoItem[]>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
      // 기존 string[] 호환
      const result: Record<string, MemoItem[]> = {};
      for (const [k, v] of Object.entries(raw)) {
        result[k] = (v as (string | MemoItem)[]).map(item => typeof item === 'string' ? { text: item, done: false } : item);
      }
      return result;
    } catch { return {}; }
  });
  const [memoInput, setMemoInput] = useState('');
  const saveMemos = (next: Record<string, MemoItem[]>) => { setCalMemos(next); localStorage.setItem(storageKey, JSON.stringify(next)); };
  const addMemo = () => { if (!memoInput.trim()) return; saveMemos({ ...calMemos, [selectedDate]: [...(calMemos[selectedDate] || []), { text: memoInput.trim(), done: false }] }); setMemoInput(''); };
  const toggleMemo = (date: string, idx: number) => { const list = [...(calMemos[date] || [])]; list[idx] = { ...list[idx], done: !list[idx].done }; saveMemos({ ...calMemos, [date]: list }); };
  const removeMemo = (date: string, idx: number) => { const list = [...(calMemos[date] || [])]; list.splice(idx, 1); const next = { ...calMemos }; if (list.length > 0) next[date] = list; else delete next[date]; saveMemos(next); };
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const startEdit = (idx: number, text: string) => { setEditIdx(idx); setEditText(text); };
  const saveEdit = () => { if (editIdx === null || !editText.trim()) return; const list = [...(calMemos[selectedDate] || [])]; list[editIdx] = { ...list[editIdx], text: editText.trim() }; saveMemos({ ...calMemos, [selectedDate]: list }); setEditIdx(null); setEditText(''); };

  const year = parseInt(viewMonth.split('-')[0]);
  const month = parseInt(viewMonth.split('-')[1]);
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prevMonth = () => { const d = new Date(Date.UTC(year, month - 2, 1)); setViewMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`); };
  const nextMonth = () => { const d = new Date(Date.UTC(year, month, 1)); setViewMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`); };

  const testSet = useMemo(() => new Set(testDates), [testDates]);
  const annSet = useMemo(() => new Set(announcementItems.map(a => a.date)), [announcementItems]);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedEvents = useMemo(() => {
    if (!selectedDate) return [];
    const events: { label: string; color: string }[] = [];
    const s = batch.schedule?.[selectedDate] as string || '';
    if (s === 'education') events.push({ label: '정규교육', color: '#3B82F6' });
    if (s === 'practice') events.push({ label: '매장실습', color: '#F59E0B' });
    if (testSet.has(selectedDate)) events.push({ label: '테스트 시행', color: '#22C55E' });
    announcementItems.filter(a => a.date === selectedDate).forEach(a => events.push({ label: a.title, color: '#EF4444' }));
    if (batch.advanced_start && batch.advanced_end && selectedDate >= batch.advanced_start && selectedDate <= batch.advanced_end)
      events.push({ label: '심화교육', color: '#A855F7' });
    return events;
  }, [selectedDate, batch, testSet, annSet, announcementItems]);

  const getDots = (dateStr: string) => {
    const dots: string[] = [];
    const s = batch.schedule?.[dateStr] as string || '';
    if (s === 'education') dots.push('#3B82F6');
    if (s === 'practice') dots.push('#F59E0B');
    if (testSet.has(dateStr)) dots.push('#22C55E');
    if (annSet.has(dateStr)) dots.push('#EF4444');
    return dots;
  };

  const selDay = new Date(selectedDate + 'T12:00:00Z');

  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', display: 'flex' }}>
      {/* 왼쪽: 파란 패널 — 선택 날짜 + 일정 + 할 일 */}
      <div style={{
        background: 'var(--blue)', color: '#fff',
        padding: '20px 20px', display: 'flex', flexDirection: 'column',
        minWidth: 200, width: '40%', flexShrink: 0,
      }}>
        <div style={{ fontSize: 56, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.03em' }}>
          {selDay.getUTCDate()}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, marginTop: 6, color: 'rgba(255,255,255,0.5)' }}>
          {WEEKDAYS[selDay.getUTCDay()]}요일
        </div>

        <div style={{ marginTop: 16 }}>
          {selectedEvents.map((ev, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
            </div>
          ))}
          {selectedEvents.length === 0 && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>일정 없음</div>}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 10, overflow: 'hidden' }}>
          {(calMemos[selectedDate] || []).map((m, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 24 }}>
              <span
                onClick={() => toggleMemo(selectedDate, idx)}
                style={{
                  width: 12, height: 12, borderRadius: 2, flexShrink: 0, cursor: 'pointer',
                  border: m.done ? 'none' : '1.5px solid rgba(255,255,255,0.3)',
                  background: m.done ? 'rgba(255,255,255,0.6)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: 'var(--blue)',
                }}>{m.done ? '✓' : ''}</span>
              {editIdx === idx ? (
                <input value={editText} onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditIdx(null); }}
                  onBlur={saveEdit} autoFocus
                  style={{ flex: 1, fontSize: 12, background: 'rgba(255,255,255,0.15)', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.4)', color: '#fff', outline: 'none', padding: '1px 0' }}
                />
              ) : (
                <span onDoubleClick={() => startEdit(idx, m.text)} style={{ fontSize: 12, flex: 1, textDecoration: m.done ? 'line-through' : 'none', opacity: m.done ? 0.45 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'default' }}>{m.text}</span>
              )}
              <button onClick={() => removeMemo(selectedDate, idx)} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'rgba(255,255,255,0.25)',
                padding: 0, flexShrink: 0, lineHeight: 1,
              }}>×</button>
            </div>
          ))}
          <input
            value={memoInput} onChange={e => setMemoInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addMemo(); }}
            placeholder="+ 할 일 추가"
            style={{
              width: '100%', padding: '8px 0', fontSize: 13, marginTop: 4,
              border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: '#fff', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* 오른쪽: 달력 그리드 */}
      <div style={{ flex: 1, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', padding: '2px 8px' }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{year}년 {month}월</span>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', padding: '2px 8px' }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 6 }}>
          {WEEKDAYS.map((w, i) => (
            <span key={w} style={{ fontSize: 12, fontWeight: 600, color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--blue)' : 'var(--text-muted)', padding: '2px 0' }}>{w}</span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} style={{ padding: '5px 0' }} />;
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === kstToday;
            const isSelected = dateStr === selectedDate;
            const dots = getDots(dateStr);
            const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
            return (
              <div key={day} onClick={() => setSelectedDate(dateStr)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5px 0', cursor: 'pointer',
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: isToday || isSelected ? 700 : 400,
                  color: isSelected ? '#fff' : isToday ? 'var(--blue)' : dow === 0 ? 'var(--red)' : dow === 6 ? 'var(--blue)' : 'var(--text-primary)',
                  background: isSelected ? 'var(--blue)' : isToday ? 'var(--blue-dim)' : 'transparent',
                  transition: 'all 0.1s ease',
                }}>{day}</span>
                <div style={{ display: 'flex', gap: 2, marginTop: 2, height: 4 }}>
                  {dots.slice(0, 3).map((c, di) => (
                    <span key={di} style={{ width: 3, height: 3, borderRadius: '50%', background: c }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          <span><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#3B82F6', marginRight: 3 }} />정규</span>
          <span><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#F59E0B', marginRight: 3 }} />실습</span>
          <span><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#22C55E', marginRight: 3 }} />테스트</span>
          <span><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#EF4444', marginRight: 3 }} />공지</span>
        </div>
      </div>
    </div>
  );
}
