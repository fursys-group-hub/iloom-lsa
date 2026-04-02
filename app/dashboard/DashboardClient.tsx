'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Student, TestScore, Attendance } from '@/lib/types';
import { calculateRiskLevel, calculateDailyAverages, calculateAvgScore } from '@/lib/analysis';
import ScoreTrendChart from '@/components/charts/ScoreTrendChart';
import RiskBadge from '@/components/RiskBadge';

interface BatchInfo {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  advanced_start: string | null;
  advanced_end: string | null;
}

interface NoteRow {
  id: string;
  student_id: string;
  title: string;
  content: string;
  created_at: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
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
  status: 'open' | 'answered';
  created_at: string;
  updated_at: string;
  student_name?: string;
}

interface Props {
  batches: BatchInfo[];
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
  notes: NoteRow[];
  announcements: AnnouncementRow[];
  noteComments: CommentRow[];
  questions: QuestionRow[];
  memoCounts: Record<string, number>;
}

function getBatchStatus(batch: BatchInfo): { label: string; color: string; bg: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (today >= batch.start_date && today <= batch.end_date)
    return { label: '입문교육 진행중', color: 'var(--green)', bg: 'rgba(48,209,88,0.12)' };
  if (batch.advanced_start && batch.advanced_end && today >= batch.advanced_start && today <= batch.advanced_end)
    return { label: '심화교육 진행중', color: 'var(--purple)', bg: 'rgba(191,90,242,0.15)' };
  if (batch.advanced_end && today > batch.advanced_end)
    return { label: '완료', color: 'var(--text-muted)', bg: 'var(--bg-hover)' };
  if (today > batch.end_date)
    return { label: '매장 배치 대기', color: 'var(--orange)', bg: 'rgba(255,159,10,0.12)' };
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

export default function DashboardClient({ batches, students: allStudents, scores: allScores, attendance: allAttendance, notes: allNotes, announcements, noteComments, questions, memoCounts }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id || '');
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

  const dailyAverages = useMemo(() => calculateDailyAverages(scores), [scores]);

  const studentsWithStats = useMemo(() => {
    return students.map((student) => {
      const ss = scores.filter((s) => s.student_id === student.id);
      const sa = attendance.filter((a) => a.student_id === student.id);
      return { ...student, avg_score: calculateAvgScore(ss), risk_level: calculateRiskLevel(ss, sa) };
    });
  }, [students, scores, attendance]);

  const riskStudents = studentsWithStats.filter((s) => s.risk_level !== 'low');

  const subjectAverages = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of scores) { const a = m.get(s.subject) || []; a.push(s.score); m.set(s.subject, a); }
    return [...m.entries()]
      .map(([subject, vals]) => ({ subject, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [scores]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* 인사 + 기수 선택 + D-day */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            안녕하세요, 수지님 👋
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-tertiary)', marginTop: 4 }}>
            오늘의 교육 현황이에요
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {dDayInfo && (
            <div style={{
              padding: '8px 16px', borderRadius: 'var(--radius-md)',
              background: 'var(--blue-dim)', border: '1px solid rgba(0,122,255,0.2)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{dDayInfo.label}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--blue-light)' }}>{dDayInfo.dday}</span>
            </div>
          )}
          <select
            value={selectedBatchId}
            onChange={e => setSelectedBatchId(e.target.value)}
            style={{
              padding: '10px 16px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', background: 'var(--bg-surface)',
              color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              minWidth: 180,
            }}
          >
            {batches.map(b => (
              <option key={b.id} value={b.id}>{b.name} 기수</option>
            ))}
          </select>
          {selectedBatch && (() => {
            const status = getBatchStatus(selectedBatch);
            return (
              <span style={{
                padding: '6px 14px', borderRadius: 'var(--radius-pill)',
                fontSize: 13, fontWeight: 700, background: status.bg, color: status.color,
                whiteSpace: 'nowrap',
              }}>
                {status.label}
              </span>
            );
          })()}
        </div>
      </div>

      {/* 교육 일정 타임라인 */}
      {selectedBatch && (
        <div style={{
          display: 'flex', gap: 12, padding: '16px 20px', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700, background: 'var(--blue-dim)', color: 'var(--blue-light)' }}>입문</span>
            <span style={{ fontSize: 14, color: today >= selectedBatch.start_date && today <= selectedBatch.end_date ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: today >= selectedBatch.start_date && today <= selectedBatch.end_date ? 600 : 400 }}>
              {selectedBatch.start_date} ~ {selectedBatch.end_date}
            </span>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700, background: 'rgba(191,90,242,0.15)', color: 'var(--purple)' }}>심화</span>
            {selectedBatch.advanced_start ? (
              <span style={{ fontSize: 14, color: today >= (selectedBatch.advanced_start||'') && today <= (selectedBatch.advanced_end||'') ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: today >= (selectedBatch.advanced_start||'') && today <= (selectedBatch.advanced_end||'') ? 600 : 400 }}>
                {selectedBatch.advanced_start} ~ {selectedBatch.advanced_end}
              </span>
            ) : (
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>미정</span>
            )}
          </div>
        </div>
      )}

      {/* 출결 요약 카드 */}
      <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: droppedStudents.length > 0 ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard icon="👥" label="교육 인원" value={todayAttendance.total} unit="명" />
        <StatCard icon="✅" label="출석" value={todayAttendance.present} unit="명" accent="var(--green)" />
        <StatCard icon="⏰" label="지각" value={todayAttendance.late} unit="명" accent="var(--orange)" />
        <StatCard icon="❌" label="결석" value={todayAttendance.absent} unit="명" accent="var(--red)" />
        {droppedStudents.length > 0 && (
          <StatCard icon="🚪" label="퇴사" value={droppedStudents.length} unit="명" accent="var(--text-muted)" />
        )}
      </div>

      {/* 2컬럼 메인 */}
      <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ─── 왼쪽 ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 차시별 평균 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}>📊 차시별 평균</h3>
              <Link href="/dashboard/tests" style={{ fontSize: 13, color: 'var(--blue-light)', textDecoration: 'none' }}>전체보기 →</Link>
            </div>
            {subjectAverages.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {subjectAverages.map((s) => (
                  <div key={s.subject} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-tertiary)', width: 50, textAlign: 'right', flexShrink: 0 }}>
                      {s.subject}
                    </span>
                    <div style={{ flex: 1, height: 28, background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${Math.max(s.avg, 8)}%`, borderRadius: 'var(--radius-sm)',
                        background: s.avg >= 80 ? 'var(--green)' : s.avg >= 60 ? 'var(--blue)' : 'var(--red)',
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8,
                        transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{s.avg}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>데이터 없음</p>
            )}
          </div>

          {/* 평균 추이 */}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>📈 평균 추이</h3>
            {dailyAverages.length > 0 ? (
              <ScoreTrendChart data={dailyAverages} height={180} />
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>데이터 없음</p>
            )}
          </div>

          {/* 주의 교육생 */}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>⚠️ 주의 교육생</h3>
            {riskStudents.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {riskStudents.map((s) => (
                  <Link key={s.id} href={`/dashboard/students/${s.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 12px', borderRadius: 'var(--radius-pill)',
                      background: 'var(--bg-elevated)', textDecoration: 'none',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: 'var(--red-solid-bg)', color: 'var(--red-solid-text)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>{s.name[0]}</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.avg_score}점</span>
                    {memoCounts[s.id] ? (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📝{memoCounts[s.id]}</span>
                    ) : null}
                    <span style={{ marginLeft: 'auto' }}><RiskBadge level={s.risk_level} /></span>
                  </Link>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-tertiary)', padding: '16px 0' }}>모든 교육생이 양호해요! 🎉</p>
            )}
          </div>
        </div>

        {/* ─── 오른쪽 ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 교육일지 제출 현황 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}>📓 오늘 교육일지</h3>
              <Link href="/dashboard/education-logs" style={{ fontSize: 13, color: 'var(--blue-light)', textDecoration: 'none' }}>전체보기 →</Link>
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-second)', marginBottom: noteNotSubmitted.length > 0 ? 8 : 0 }}>
              제출 <span style={{ fontWeight: 700, color: 'var(--green)' }}>{noteSubmitted.size}</span> / 미제출 <span style={{ fontWeight: 700, color: noteNotSubmitted.length > 0 ? 'var(--red)' : 'var(--green)' }}>{noteNotSubmitted.length}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({students.length}명)</span>
            </div>
            {noteNotSubmitted.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {noteNotSubmitted.map(s => (
                  <span key={s.id} style={{
                    padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
                    background: 'rgba(255,69,58,0.1)', color: 'var(--red)',
                  }}>{s.name}</span>
                ))}
              </div>
            )}
            {noteNotSubmitted.length === 0 && students.length > 0 && (
              <div style={{ fontSize: 13, color: 'var(--green)' }}>전원 제출 완료! 🎉</div>
            )}
          </div>

          {/* 실습일지 실적 요약 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}>🏪 실습일지 실적</h3>
              <Link href="/dashboard/practice" style={{ fontSize: 13, color: 'var(--blue-light)', textDecoration: 'none' }}>전체보기 →</Link>
            </div>
            {practiceStats.count > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <MiniStat icon="🗣️" label="상담" value={practiceStats.consult} unit="건" color="var(--green)" />
                <MiniStat icon="📋" label="견적" value={practiceStats.estimate} unit="건" color="var(--blue-light)" />
                <MiniStat icon="✅" label="수주" value={practiceStats.order} unit="건" color="var(--orange)" />
                <MiniStat icon="💰" label="수주금액" value={practiceStats.amount} unit="원" color="var(--purple)" isAmount />
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', padding: '16px 0' }}>아직 실습일지가 없어요</p>
            )}
            {practiceStats.count > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>총 {practiceStats.count}건 작성됨</div>
            )}
          </div>

          {/* 질문 현황 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ ...sectionTitle, margin: 0 }}>💬 질문관리</h3>
                {questions.filter(q => q.status === 'open').length > 0 && (
                  <span style={{
                    padding: '2px 10px', borderRadius: 'var(--radius-pill)',
                    background: 'rgba(255,69,58,0.12)', color: 'var(--red)',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {questions.filter(q => q.status === 'open').length}개 대기
                  </span>
                )}
              </div>
              <Link href="/dashboard/questions" style={{ fontSize: 13, color: 'var(--blue-light)', textDecoration: 'none' }}>전체보기 →</Link>
            </div>
            {questions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questions.slice(0, 4).map(q => {
                  const st = q.status === 'open'
                    ? { bg: 'rgba(255,159,10,0.12)', color: 'var(--orange)', label: '대기' }
                    : { bg: 'rgba(48,209,88,0.12)', color: 'var(--green)', label: '답변' };
                  return (
                    <Link key={q.id} href="/dashboard/questions" style={{
                      padding: '10px 14px', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', gap: 8,
                      textDecoration: 'none', transition: 'background 0.15s ease',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                    >
                      <span style={{
                        padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                        fontSize: 11, fontWeight: 700, background: st.bg, color: st.color, flexShrink: 0,
                      }}>{st.label}</span>
                      <span style={{
                        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--blue-dim)', color: 'var(--blue)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
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
                {questions.length === 0 && (
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', padding: '8px 0' }}>대기 중인 질문이 없어요</p>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', padding: '16px 0' }}>아직 질문이 없어요</p>
            )}
          </div>

          {/* 최근 공지사항 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}>📢 최근 공지</h3>
              <Link href="/dashboard/announcements" style={{ fontSize: 13, color: 'var(--blue-light)', textDecoration: 'none' }}>전체보기 →</Link>
            </div>
            {announcements.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {announcements.slice(0, 3).map(a => {
                  const priorityStyle = a.priority === 'urgent'
                    ? { bg: 'rgba(255,69,58,0.12)', color: 'var(--red)', label: '긴급' }
                    : a.priority === 'important'
                    ? { bg: 'rgba(255,159,10,0.12)', color: 'var(--orange)', label: '중요' }
                    : null;
                  return (
                    <div key={a.id} style={{
                      padding: '10px 14px', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'background 0.15s ease', cursor: 'default',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                    >
                      {priorityStyle && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                          fontSize: 11, fontWeight: 700, background: priorityStyle.bg, color: priorityStyle.color,
                          flexShrink: 0,
                        }}>{priorityStyle.label}</span>
                      )}
                      <span style={{ fontSize: 14, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.title}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {new Date(a.created_at).toLocaleDateString('ko', { month: 'numeric', day: 'numeric' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', padding: '16px 0' }}>공지가 없어요</p>
            )}
          </div>

          {/* 미확인 코멘트 */}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>💬 최근 교육생 답글</h3>
            {studentComments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {studentComments.map(c => {
                  const studentName = allStudents.find(s => {
                    const note = allNotes.find(n => n.id === c.note_id);
                    return note && s.id === note.student_id;
                  })?.name;
                  return (
                    <div key={c.id} style={{
                      padding: '10px 14px', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue-light)' }}>🧑‍🎓 {c.author_name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(c.created_at).toLocaleDateString('ko', { month: 'numeric', day: 'numeric' })}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-second)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.content}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', padding: '16px 0' }}>아직 교육생 답글이 없어요</p>
            )}
          </div>
        </div>
      </div>

      {/* 반응형 */}
      <style>{`
        @media (max-width: 768px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .main-grid { grid-template-columns: 1fr !important; }
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
  padding: 20,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: '0 0 16px',
};

/* ─── 하위 컴포넌트 ─── */

function StatCard({ icon, label, value, unit, accent }: {
  icon: string; label: string; value: number; unit: string; accent?: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <p style={{ fontSize: 28, fontWeight: 800, color: accent || 'var(--text-primary)', margin: 0 }}>
        {value}
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span>
      </p>
    </div>
  );
}

function MiniStat({ icon, label, value, unit, color, isAmount }: {
  icon: string; label: string; value: number; unit: string; color: string; isAmount?: boolean;
}) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 'var(--radius-md)',
      background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color }}>
          {isAmount ? value.toLocaleString() : value}
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>{unit}</span>
        </div>
      </div>
    </div>
  );
}
