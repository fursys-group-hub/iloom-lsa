'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import type { Student, TestScore, Attendance, StudentMemo, CoachingReport, Batch } from '@/lib/types';
import { MEMO_CATEGORIES } from '@/lib/types';
import { calculateAvgScore, calculateDailyAverages, calculateAdaptationIndex, calculateRiskChecklist, generateHRAdvice } from '@/lib/analysis';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

interface Question {
  id: string;
  session: string;
  question_id: string;
  question_text: string;
  correct_answer: string;
  category: string;
  series: string;
  detail: string;
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
}

interface NoteForAnalysis {
  id: string;
  student_id: string;
  content: string;
  created_at: string;
}

interface Props {
  student: Student;
  batch?: Batch | null;
  scores: TestScore[];
  attendance: Attendance[];
  memos: StudentMemo[];
  coachingReports: CoachingReport[];
  responses: TestResponse[];
  questions: Question[];
  allScores: TestScore[];
  allAttendance?: { student_id: string; status: string }[];
  allNotes?: { student_id: string; content: string }[];
  notes?: NoteForAnalysis[];
}

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px',
};

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

export default function StudentDetailClient({
  student, batch, scores, allScores, attendance, allAttendance = [], allNotes: allRawNotes = [], memos, coachingReports, responses, questions, notes: rawNotes = [],
}: Props) {
  const avgScore = useMemo(() => calculateAvgScore(scores), [scores]);
  const dailyAverages = useMemo(() => calculateDailyAverages(scores), [scores]);

  // 반 평균 (차시별)
  const classAverages = useMemo(() => calculateDailyAverages(allScores), [allScores]);

  const absentCount = attendance.filter((a) => a.status === 'absent').length;
  const lateCount = attendance.filter((a) => a.status === 'late').length;
  const presentCount = attendance.filter((a) => a.status === 'present').length;

  // 태그별 정답률 분석
  const tagAnalysis = useMemo(() => {
    const tagMap = new Map<string, { correct: number; total: number; label: string; detail: string }>();

    for (const r of responses) {
      const q = questions.find((qq) => qq.question_id === r.question_id && qq.session === r.session);
      if (!q) continue;

      const detail = q.detail || '기타';
      const series = q.series && q.series !== '공통' ? q.series : '';
      const tagKey = series ? `${series} > ${detail.split('(')[0].trim()}` : detail.split('(')[0].trim();

      if (!tagMap.has(tagKey)) {
        tagMap.set(tagKey, { correct: 0, total: 0, label: tagKey, detail });
      }
      const t = tagMap.get(tagKey)!;
      t.total++;
      if (r.is_correct) t.correct++;
    }

    return [...tagMap.values()]
      .filter((t) => t.total >= 2) // 2문항 이상인 태그만
      .map((t) => ({ ...t, rate: Math.round((t.correct / t.total) * 100) }))
      .sort((a, b) => a.rate - b.rate);
  }, [responses, questions]);

  const weakTags = tagAnalysis.filter((t) => t.rate < 60);
  const midTags = tagAnalysis.filter((t) => t.rate >= 60 && t.rate < 80);
  const strongTags = tagAnalysis.filter((t) => t.rate >= 80);

  // 적응지수 계산
  const totalEducationDays = useMemo(() => {
    if (!batch) return 20;
    const start = new Date(batch.start_date);
    const end = new Date(batch.end_date);
    const today = new Date();
    const effectiveEnd = today < end ? today : end;
    let days = 0;
    const d = new Date(start);
    while (d <= effectiveEnd) { if (d.getDay() !== 0 && d.getDay() !== 6) days++; d.setDate(d.getDate() + 1); }
    return Math.max(days, 1);
  }, [batch]);

  const parsedNotes = useMemo(() => rawNotes.map(n => ({ ...parseNoteMeta(n.content), created_at: n.created_at })), [rawNotes]);

  // 반 평균 출석률/제출률 계산
  const classAvgStats = useMemo(() => {
    const studentIds = [...new Set(allAttendance.map(a => a.student_id))];
    const count = studentIds.length || 1;
    let totalAttRate = 0, totalSubmitRate = 0, totalPart = 0;
    for (const sid of studentIds) {
      const sAtt = allAttendance.filter(a => a.student_id === sid);
      let attScore = 0;
      for (const a of sAtt) { if (a.status === 'present') attScore += 1; else if (a.status === 'late' || a.status === 'early_leave') attScore += 0.5; }
      totalAttRate += totalEducationDays > 0 ? (attScore / totalEducationDays) * 100 : 0;
      const sNotes = allRawNotes.filter(n => n.student_id === sid).map(n => parseNoteMeta(n.content));
      const eduNotes = sNotes.filter(n => !n.tags?.includes('실습일지') && !n.tags?.includes('자율학습'));
      totalSubmitRate += totalEducationDays > 0 ? (eduNotes.length / totalEducationDays) * 100 : 0;
      totalPart += eduNotes.length > 0 ? (eduNotes.reduce((s, n) => s + (n.participation_score || 0), 0) / eduNotes.length / 3) * 100 : 0;
    }
    return { attRate: Math.round(totalAttRate / count), submitRate: Math.round(totalSubmitRate / count), partRate: Math.round(totalPart / count) };
  }, [allAttendance, allRawNotes, totalEducationDays]);

  const studentCategoryRates = useMemo(() => {
    const catMap = new Map<string, { correct: number; total: number }>();
    for (const r of responses) {
      const q = questions.find(qq => qq.question_id === r.question_id && qq.session === r.session);
      if (!q?.category) continue;
      const cell = catMap.get(q.category) || { correct: 0, total: 0 };
      cell.total++; if (r.is_correct) cell.correct++;
      catMap.set(q.category, cell);
    }
    return [...catMap.entries()].map(([category, v]) => ({ category, rate: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0 }));
  }, [responses, questions]);

  const adaptationIdx = useMemo(() => calculateAdaptationIndex({
    studentId: student.id, studentName: student.name,
    scores, attendance, notes: parsedNotes,
    totalEducationDays, categoryRates: studentCategoryRates,
    memoCategories: memos.map(m => m.category),
    tagTrackings: coachingReports.map(r => r.tag_tracking),
  }), [student, scores, attendance, parsedNotes, totalEducationDays, studentCategoryRates, memos, coachingReports]);

  const riskCheck = useMemo(() => calculateRiskChecklist({
    studentId: student.id, studentName: student.name,
    scores, attendance, notes: parsedNotes,
    memoCategories: memos.map(m => m.category),
    totalEducationDays, categoryRates: studentCategoryRates,
  }), [student, scores, attendance, parsedNotes, memos, totalEducationDays, studentCategoryRates]);

  const hrAdvice = useMemo(() => generateHRAdvice(riskCheck, adaptationIdx), [riskCheck, adaptationIdx]);

  // 카테고리별 그룹 (영역별 정답률용)
  const categoryGroups = useMemo(() => {
    const catMap = new Map<string, { tags: typeof tagAnalysis; totalQ: number; correctQ: number }>();
    for (const r of responses) {
      const q = questions.find((qq) => qq.question_id === r.question_id && qq.session === r.session);
      if (!q) continue;
      const cat = mapCategory(q.category || '기타');
      if (!catMap.has(cat)) catMap.set(cat, { tags: [], totalQ: 0, correctQ: 0 });
      const c = catMap.get(cat)!;
      c.totalQ++;
      if (r.is_correct) c.correctQ++;
    }
    // 각 카테고리에 세부 태그 연결
    for (const t of tagAnalysis) {
      const matchQ = questions.find((q) => {
        const s = q.series && q.series !== '공통' ? q.series : '';
        const d = (q.detail || '').split('(')[0].trim();
        const tagKey = s ? `${s} > ${d}` : d;
        return tagKey === t.label;
      });
      const cat = mapCategory(matchQ?.category || '기타');
      if (catMap.has(cat)) {
        const existing = catMap.get(cat)!;
        if (!existing.tags.find((et) => et.label === t.label)) {
          existing.tags.push(t);
        }
      }
    }
    return [...catMap.entries()]
      .filter(([, data]) => data.totalQ >= 5) // 5문항 이상 응시한 카테고리만
      .map(([cat, data]) => ({
        category: cat,
        rate: data.totalQ > 0 ? Math.round((data.correctQ / data.totalQ) * 100) : 0,
        totalQ: data.totalQ,
        correctQ: data.correctQ,
        tags: data.tags.sort((a, b) => a.rate - b.rate),
      }))
      .sort((a, b) => a.rate - b.rate);
  }, [tagAnalysis, responses, questions]);

  // 차시별 오답 문항
  const sessionWrongs = useMemo(() => {
    const sessions = [...new Set(responses.map((r) => r.session))].sort((a, b) => {
      const na = parseInt(a.replace(/[^0-9]/g, '')) || 0;
      const nb = parseInt(b.replace(/[^0-9]/g, '')) || 0;
      return nb - na; // 최신 먼저
    });
    return sessions.map((session) => {
      const sessionResp = responses.filter((r) => r.session === session);
      const wrongs = sessionResp.filter((r) => !r.is_correct).map((r) => {
        const q = questions.find((qq) => qq.question_id === r.question_id && qq.session === r.session);
        return { ...r, question: q };
      });
      return { session, total: sessionResp.length, wrongs };
    });
  }, [responses, questions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Link href="/dashboard/students" style={{ fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none' }}>← 교육생 목록</Link>

      {/* 프로필 + HR 조언 통합 카드 */}
      <div style={card}>
        <div>
          {/* 인적사항 */}
          <div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
              {student.photo_url ? (
                <img src={student.photo_url} alt={student.name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--blue-dim)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>{student.name[0]}</div>
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{student.name}</h2>
                  {student.is_dropped && (
                    <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--red-dim)', color: 'var(--red)' }}>퇴사</span>
                  )}
                  {(() => {
                    const gc = { high: { bg: 'var(--green-dim)', text: 'var(--green)', label: '상' }, mid: { bg: 'var(--orange-dim)', text: 'var(--orange)', label: '중' }, low: { bg: 'var(--red-dim)', text: 'var(--red)', label: '하' } }[adaptationIdx.group];
                    return <span style={{ background: gc.bg, color: gc.text, borderRadius: 'var(--radius-pill)', padding: '3px 12px', fontSize: 13, fontWeight: 700 }}>{gc.label} {adaptationIdx.total}점</span>;
                  })()}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
                  {[
                    student.birth_date ? `${new Date(student.birth_date).getFullYear()}년생 (${new Date().getFullYear() - new Date(student.birth_date).getFullYear() + 1}세)` : null,
                    student.store_location ? `${student.store_location} 배치` : null,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
            {/* 학력/경력 — 2열 */}
            {(student.education || student.experience) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
                {student.education && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>학력</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {student.education.split('\n').map((line, i) => {
                        const parts = line.split('|').map(s => s.trim());
                        if (parts.length >= 3) {
                          return (
                            <div key={i}>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{parts[0]}</div>
                              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{parts[1]} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>{parts[2]}</span></div>
                            </div>
                          );
                        }
                        return <div key={i} style={{ fontSize: 13, color: 'var(--text-second)' }}>{line}</div>;
                      })}
                    </div>
                  </div>
                )}
                {student.experience && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>경력</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {student.experience.split('\n').map((line, i) => {
                        const parts = line.split('|').map(s => s.trim());
                        if (parts.length >= 3) {
                          return (
                            <div key={i}>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{parts[0]}</div>
                              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{parts[1]} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>{parts[2]}</span></div>
                            </div>
                          );
                        }
                        return <div key={i} style={{ fontSize: 13, color: 'var(--text-second)' }}>{line}</div>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ━━━ 2열 레이아웃 ━━━ */}
      <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 4fr) minmax(0, 6fr)', gap: 20, alignItems: 'start' }}>

        {/* ── 왼쪽: HR 조언 + 적응지수 + 출결 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* HR 조언 (있을 때만) */}
          {hrAdvice && (() => {
            const dimMap: Record<string, string> = { red: 'var(--red-dim)', orange: 'var(--orange-dim)', blue: 'var(--blue-dim)', purple: 'var(--purple-dim)', green: 'var(--green-dim)' };
            const colorMap: Record<string, string> = { red: 'var(--red)', orange: 'var(--orange)', blue: 'var(--blue)', purple: 'var(--purple)', green: 'var(--green)' };
            const c = colorMap[hrAdvice.typeColor] || 'var(--blue)';
            const d = dimMap[hrAdvice.typeColor] || 'var(--blue-dim)';
            return (
              <div style={{ ...card, background: d, border: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: d, color: c }}>{hrAdvice.typeLabel}</span>
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, margin: '0 0 10px' }}>{hrAdvice.difficulty}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {hrAdvice.actions.map((action, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: 'var(--text-primary)' }}>
                      <span style={{ color: c, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 적응지수 산정 근거 */}
          <div style={card}>
            <h3 style={sectionTitle}>적응지수 산정 근거</h3>
            {(() => {
              const items = [
                { label: '시험', score: adaptationIdx.breakdown.examAvg, detail: `평균 ${adaptationIdx.breakdown.examAvg}점` },
                { label: '하위분야', score: adaptationIdx.breakdown.weakCategories, detail: `60점 미만 ${adaptationIdx.breakdown.weakCategoryCount}개${adaptationIdx.breakdown.weakCategoryNames.length > 0 ? ` (${adaptationIdx.breakdown.weakCategoryNames.slice(0, 2).join('/')})` : ''}` },
                { label: '출석', score: adaptationIdx.breakdown.attendanceRate, detail: `${adaptationIdx.breakdown.attendanceRate}%` },
                { label: '일지참여', score: adaptationIdx.breakdown.participation, detail: adaptationIdx.breakdown.participationDetail },
                { label: '성장', score: adaptationIdx.breakdown.growthSlope, detail: adaptationIdx.breakdown.growthDetail },
                { label: '자신감', score: adaptationIdx.breakdown.confidenceTrend, detail: adaptationIdx.breakdown.confidenceDetail },
                { label: '만성오답', score: adaptationIdx.breakdown.chronicScore, detail: adaptationIdx.breakdown.chronicDetail },
                { label: '메모톤', score: adaptationIdx.breakdown.memoBalance, detail: adaptationIdx.breakdown.memoBalanceDetail },
              ];
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart data={items} cx="50%" cy="50%" outerRadius="75%">
                        <PolarGrid stroke="var(--border)" gridType="polygon" />
                        <PolarAngleAxis dataKey="label" tick={{ fontSize: 13, fill: 'var(--text-tertiary)', fontWeight: 500 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar dataKey="score" stroke="var(--blue)" fill="var(--blue)" fillOpacity={0.15} strokeWidth={2} dot={{ r: 4, fill: 'var(--blue)', strokeWidth: 0 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>항목</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', width: 60 }}>점수</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>상세</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(it => {
                        const color = it.score >= 75 ? 'var(--green)' : it.score >= 60 ? 'var(--orange)' : 'var(--red)';
                        return (
                          <tr key={it.label} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{it.label}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 13, fontWeight: 700, color }}>{it.score}</td>
                            <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>{it.detail}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {adaptationIdx.breakdown.deltaDeduction > 0 && (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--red-dim)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
                      부정 신호 감점 −{adaptationIdx.breakdown.deltaDeduction}점 ({adaptationIdx.breakdown.deltaDetail})
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* 출결 이력 */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}>출결 이력</h3>
              {(() => {
                let attScore = 0;
                for (const a of attendance) { if (a.status === 'present') attScore += 1; else if (a.status === 'late' || a.status === 'early_leave') attScore += 0.5; }
                const attRate = totalEducationDays > 0 ? Math.round((attScore / totalEducationDays) * 100) : 0;
                const color = attRate >= 90 ? 'var(--green)' : attRate >= 80 ? 'var(--orange)' : 'var(--red)';
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>출석률 </span><span style={{ fontSize: 16, fontWeight: 700, color }}>{attRate}%</span></span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>반 평균 {classAvgStats.attRate}%</span>
                  </div>
                );
              })()}
            </div>
            {attendance.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>날짜</th>
                    <th style={thStyle}>출근</th>
                    <th style={thStyle}>퇴근</th>
                    <th style={thStyle}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {[...attendance].reverse().map((a) => {
                    const statusMap: Record<string, { label: string; color: string; bg: string }> = {
                      present: { label: '출석', color: 'var(--green)', bg: 'var(--green-dim)' },
                      late: { label: '지각', color: 'var(--orange)', bg: 'var(--orange-dim)' },
                      absent: { label: '결석', color: 'var(--red)', bg: 'var(--red-dim)' },
                      early_leave: { label: '조퇴', color: 'var(--purple)', bg: 'var(--purple-dim)' },
                    };
                    const st = statusMap[a.status] || statusMap.present;
                    let checkIn = '-', checkOut = '-';
                    if (a.note) {
                      const inMatch = a.note.match(/출근\s*([0-9:]+)/);
                      const outMatch = a.note.match(/퇴근\s*([0-9:]+)/);
                      if (inMatch) checkIn = inMatch[1];
                      if (outMatch) checkOut = outMatch[1] === '-' ? '-' : outMatch[1];
                    }
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={tdStyle}>{a.date}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{checkIn}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{checkOut}</td>
                        <td style={tdStyle}>
                          <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p style={emptyStyle}>출결 데이터가 없어요</p>
            )}
          </div>
        </div>

        {/* ── 오른쪽: 달력 + 점수추이 + 카테고리 + 취약부분 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 교육 캘린더 + 메모 */}
          <CalendarWithMemo batch={batch} scores={scores} attendance={attendance} notes={rawNotes} studentId={student.id} initialMemos={memos} />

          {/* 차시별 점수 추이 */}
          <div style={card}>
            <h3 style={sectionTitle}>차시별 점수 추이</h3>
            {dailyAverages.length > 0 ? (() => {
              const chartData = dailyAverages.map((d) => {
                const classAvg = classAverages.find((c) => c.date === d.date);
                const dt = new Date(d.date + 'T00:00:00');
                return { date: `${dt.getMonth() + 1}/${dt.getDate()}`, score: d.avg, classAvg: classAvg?.avg ?? 0 };
              });
              return (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#d1d5db', display: 'inline-block' }} />반 평균</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--blue)', display: 'inline-block' }} />{student.name}</span>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} formatter={(value) => [`${value}점`]} />
                      <Bar dataKey="classAvg" name="반 평균" fill="#d1d5db" radius={[4, 4, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="score" name={student.name} radius={[4, 4, 0, 0]} maxBarSize={20}>
                        {chartData.map((d, i) => (
                          <Cell key={i} fill={d.score >= d.classAvg ? 'var(--blue)' : 'var(--red)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })() : <p style={emptyStyle}>데이터 없음</p>}
          </div>

          {/* 카테고리별 학습 현황 */}
          <div style={card}>
            <h3 style={sectionTitle}>카테고리별 학습 현황 및 취약 영역</h3>
            {categoryGroups.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {categoryGroups.map(({ category, rate, totalQ, correctQ, tags: catTags }) => {
                  const catColor = rate >= 80 ? 'var(--green)' : rate >= 60 ? 'var(--orange)' : 'var(--red)';
                  return (
                    <details key={category}>
                      <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'background 0.15s ease', background: 'var(--bg-main)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: catColor, display: 'inline-block' }} />
                          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{category}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{totalQ}문항</span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: catColor }}>{correctQ}/{totalQ}</span>
                      </summary>
                      {catTags.length > 0 && (
                        <div style={{ padding: '6px 14px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {catTags.map((t) => {
                            const color = t.rate >= 80 ? 'var(--green)' : t.rate >= 60 ? 'var(--orange)' : 'var(--red)';
                            const isWeak = t.rate < 60;
                            return (
                              <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: isWeak ? 'var(--red-dim)' : 'transparent' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, fontWeight: isWeak ? 600 : 400 }}>{t.label}{isWeak ? ' ← 취약' : ''}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color }}>{t.rate}% ({t.correct}/{t.total})</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </details>
                  );
                })}
              </div>
            ) : (
              <p style={emptyStyle}>데이터 없음</p>
            )}
          </div>

          {/* 일지 */}
          <NotesTab studentId={student.id} submitInfo={(() => {
            const eduNotes = parsedNotes.filter(n => !n.tags?.includes('실습일지') && !n.tags?.includes('자율학습'));
            const submitRate = totalEducationDays > 0 ? Math.round((eduNotes.length / totalEducationDays) * 100) : 0;
            const avgPart = eduNotes.length > 0 ? Math.round((eduNotes.reduce((s, n) => s + (n.participation_score || 0), 0) / eduNotes.length / 3) * 100) : 0;
            return { submitRate, avgPart, classSubmitRate: classAvgStats.submitRate, classPartRate: classAvgStats.partRate };
          })()} />

          {/* 질문 이력 */}
          <QuestionsTab studentId={student.id} />
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .profile-grid { grid-template-columns: 1fr !important; }
          .calendar-combo { flex-direction: column !important; }
          .calendar-combo-left { width: 100% !important; min-width: 0 !important; }
          .detail-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

/* ── MemoSection ── */
type MemoCategory = StudentMemo['category'];

function MemoSection({ studentId, initialMemos }: { studentId: string; initialMemos: StudentMemo[] }) {
  const [memoList, setMemoList] = useState<StudentMemo[]>(initialMemos);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<MemoCategory>('general');
  const [saving, setSaving] = useState(false);

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD KST

  const handleSave = useCallback(async () => {
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/student-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, date: todayStr, content: content.trim(), category }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const saved = await res.json();
      setMemoList((prev) => [saved, ...prev]);
      setContent('');
      setCategory('general');
    } catch {
      alert('메모 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [content, category, studentId, todayStr, saving]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('이 메모를 삭제할까요?')) return;
    try {
      const res = await fetch(`/api/student-memos?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMemoList((prev) => prev.filter((m) => m.id !== id));
    } catch {
      alert('삭제에 실패했습니다.');
    }
  }, []);

  return (
    <div style={card}>
      <h3 style={sectionTitle}>교육 메모</h3>

      {/* 입력 영역 */}
      <div style={{ marginBottom: 16 }}>
        {/* 카테고리 선택 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {(Object.entries(MEMO_CATEGORIES) as [MemoCategory, typeof MEMO_CATEGORIES[keyof typeof MEMO_CATEGORIES]][]).map(([key, cat]) => {
            const selected = category === key;
            return (
              <button
                key={key}
                onClick={() => setCategory(key)}
                style={{
                  padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                  fontSize: 13, fontWeight: selected ? 600 : 500, cursor: 'pointer',
                  border: 'none',
                  background: selected ? cat.color : 'var(--bg-main)',
                  color: selected ? '#fff' : 'var(--text-tertiary)',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* 메모 입력 + 저장 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="메모를 입력하세요..."
            rows={2}
            style={{
              flex: 1, padding: '10px 14px', fontSize: 14,
              background: 'var(--bg-main)', color: 'var(--text-primary)',
              border: 'none', borderRadius: 'var(--radius-sm)',
              resize: 'vertical', lineHeight: 1.5, outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
            onBlur={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
            }}
          />
          <button
            onClick={handleSave}
            disabled={!content.trim() || saving}
            style={{
              padding: '10px 20px', borderRadius: 'var(--radius-sm)',
              background: content.trim() ? 'var(--blue)' : 'var(--bg-main)',
              color: content.trim() ? '#fff' : 'var(--text-muted)',
              border: 'none', fontWeight: 600, fontSize: 14,
              cursor: content.trim() ? 'pointer' : 'default',
              alignSelf: 'flex-end', whiteSpace: 'nowrap',
            }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* 메모 타임라인 */}
      {memoList.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {memoList.map((memo) => {
            const cat = MEMO_CATEGORIES[memo.category as keyof typeof MEMO_CATEGORIES] || MEMO_CATEGORIES.general;
            return (
              <div
                key={memo.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: '1px solid var(--border-light)',
                }}
              >
                <span style={{
                  padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                  fontSize: 12, fontWeight: 600, flexShrink: 0,
                  background: `color-mix(in srgb, ${cat.color} 15%, transparent)`,
                  color: cat.color,
                }}>
                  {cat.label}
                </span>
                <span style={{ fontSize: 14, color: 'var(--text-primary)', flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {memo.content}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{memo.date}</span>
                <button
                  onClick={() => handleDelete(memo.id)}
                  title="삭제"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: 16, padding: '2px 6px',
                    flexShrink: 0, opacity: 0.3, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--red)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={emptyStyle}>아직 메모가 없어요. 학생에 대한 관찰 기록을 남겨보세요!</p>
      )}
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  padding: '32px 0', textAlign: 'center', fontSize: 15, color: 'var(--text-muted)',
};

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

// 카테고리 통합 매핑
const CATEGORY_MAP: Record<string, string> = {
  '브랜드': '브랜드/공통',
  '공통': '브랜드/공통',
  'A/S': '브랜드/공통',
  '납기/발주': '브랜드/공통',
  '영업 정책': '브랜드/공통',
  '가구 소재/공법': '브랜드/공통',
  '주문/발주': '브랜드/공통',
  '사용툴': '브랜드/공통',
  '멀티탭': '브랜드/공통',
  '시공/설치': '브랜드/공통',
  '학생방': '스터디',
  '주방': '다이닝',
};

function mapCategory(raw: string): string {
  return CATEGORY_MAP[raw] || raw;
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)', margin: 0 }}>{value}</p>
    </div>
  );
}

/* ── 테이블 스타일 ── */
const thStyle: React.CSSProperties = {
  padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)',
};
const tdStyle: React.CSSProperties = {
  padding: '12px 16px', color: 'var(--text-second)', fontSize: 14,
};

/* ── 일지 탭 컴포넌트 ── */
interface NoteData {
  id: string;
  title: string;
  content: string;
  created_at: string;
  content_type?: string;
  participation_score?: number;
  participation_max?: number;
  tags?: string[];
  confidence?: string;
}

function NotesTab({ studentId, submitInfo }: { studentId: string; studentName?: string; submitInfo?: { submitRate: number; avgPart: number; classSubmitRate?: number; classPartRate?: number } }) {
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/notes?studentId=${studentId}&all=true`)
      .then(res => res.json())
      .then(data => {
        const arr = data?.notes || (Array.isArray(data) ? data : []);
        setNotes(arr);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [studentId]);

  if (loading) return <p style={{ ...emptyStyle, padding: '48px 0' }}>불러오는 중...</p>;

  const educationNotes = notes.filter(n => !(n.tags || []).includes('실습일지'));
  const practiceNotes = notes.filter(n => (n.tags || []).includes('실습일지'));

  const formatDate = (d: string) => {
    const date = new Date(d);
    const m = Number(date.toLocaleDateString('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }));
    const day = Number(date.toLocaleDateString('en-US', { timeZone: 'Asia/Seoul', day: 'numeric' }));
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dow = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getDay();
    return `${m}/${day} (${dayNames[dow]})`;
  };

  const parseSteps = (content: string) => {
    try { const p = JSON.parse(content); return p.steps || p; } catch { return {}; }
  };

  const confMap: Record<string, { icon: string; label: string; color: string }> = {
    very_high: { icon: '😎', label: '매우 높음', color: 'var(--blue)' },
    high: { icon: '😊', label: '높음', color: 'var(--green)' },
    confident: { icon: '😊', label: '자신 있어요', color: 'var(--green)' },
    medium: { icon: '😐', label: '보통', color: 'var(--orange)' },
    normal: { icon: '🤔', label: '보통이에요', color: 'var(--orange)' },
    low: { icon: '😟', label: '낮음', color: 'var(--red)' },
    not_confident: { icon: '😟', label: '자신 없어요', color: 'var(--red)' },
    very_low: { icon: '😵', label: '매우 낮음', color: 'var(--red)' },
  };

  const renderNoteCard = (n: NoteData, isPractice: boolean) => {
    const isSelfStudy = (n.tags || []).includes('자율학습');
    const isSelected = expandedId === n.id;
    const conf = n.confidence ? confMap[n.confidence] : null;
    const steps = parseSteps(n.content);
    const displayTags = (n.tags || []).filter(t => t !== '자율학습' && t !== '실습일지');

    return (
      <button
        key={n.id}
        onClick={() => setExpandedId(isSelected ? null : n.id)}
        style={{
          padding: 20, borderRadius: 'var(--radius-md)', textAlign: 'left',
          border: isSelected ? '2px solid var(--blue)' : 'none',
          background: isSelected ? 'var(--blue-dim)' : isSelfStudy ? 'var(--purple-dim)' : 'var(--bg-main)',
          cursor: 'pointer', transition: 'all 0.15s ease',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(n.created_at)}</span>
          {isSelfStudy && <span style={{ padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, background: 'var(--purple-dim)', color: 'var(--purple)' }}>자율학습</span>}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
          {n.title || (isPractice ? '실습일지' : '교육일지')}
        </div>
        {!isSelfStudy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {conf && <span style={{ fontSize: 13 }}>{conf.icon} {conf.label}</span>}
            {n.participation_score != null && n.participation_score > 0 && (
              <span style={{
                padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700,
                background: n.participation_score >= (n.participation_max || 3) ? 'var(--green-dim)' : n.participation_score >= 1 ? 'var(--orange-dim)' : 'var(--red-dim)',
                color: n.participation_score >= (n.participation_max || 3) ? 'var(--green)' : n.participation_score >= 1 ? 'var(--orange)' : 'var(--red)',
              }}>참여 {n.participation_score}/{n.participation_max || 3}</span>
            )}
          </div>
        )}
        {isPractice && (
          <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            {steps.stats_consult != null && <span>상담 {steps.stats_consult}</span>}
            {steps.stats_order != null && <span>수주 {steps.stats_order}</span>}
            {steps.stats_amount != null && <span>{Number(steps.stats_amount).toLocaleString()}원</span>}
          </div>
        )}
        {displayTags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {displayTags.slice(0, 3).map(tag => (
              <span key={tag} style={{ padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 11, fontWeight: 600 }}>{tag}</span>
            ))}
          </div>
        )}
      </button>
    );
  };

  const expandedNote = expandedId ? notes.find(n => n.id === expandedId) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 교육일지 */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>교육일지 ({educationNotes.length}건)</h3>
          {submitInfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>제출률 </span><span style={{ fontSize: 16, fontWeight: 700, color: submitInfo.submitRate >= 90 ? 'var(--green)' : submitInfo.submitRate >= 70 ? 'var(--orange)' : 'var(--red)' }}>{submitInfo.submitRate}%</span></span>
              <span><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>참여 </span><span style={{ fontSize: 16, fontWeight: 700, color: submitInfo.avgPart >= 80 ? 'var(--green)' : submitInfo.avgPart >= 60 ? 'var(--orange)' : 'var(--red)' }}>{submitInfo.avgPart}%</span></span>
              {submitInfo.classSubmitRate != null && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>반 평균 {submitInfo.classSubmitRate}%</span>}
            </div>
          )}
        </div>
        {educationNotes.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {educationNotes.map(n => renderNoteCard(n, false))}
          </div>
        ) : (
          <p style={emptyStyle}>교육일지가 없어요</p>
        )}
      </div>

      {/* 실습일지 + 전환율 */}
      <div style={card}>
        <h3 style={sectionTitle}>실습일지 ({practiceNotes.length}건)</h3>
        {/* 상담→견적→수주 전환율 */}
        {practiceNotes.length > 0 && (() => {
          let totalConsult = 0, totalEstimate = 0, totalOrder = 0, totalAmount = 0;
          for (const n of practiceNotes) {
            const s = parseSteps(n.content);
            totalConsult += Number(s.stats_consult) || 0;
            totalEstimate += Number(s.stats_estimate) || 0;
            totalOrder += Number(s.stats_order) || 0;
            totalAmount += Number(s.stats_amount) || 0;
          }
          const consultToEstimate = totalConsult > 0 ? Math.round((totalEstimate / totalConsult) * 100) : 0;
          const estimateToOrder = totalEstimate > 0 ? Math.round((totalOrder / totalEstimate) * 100) : 0;
          const consultToOrder = totalConsult > 0 ? Math.round((totalOrder / totalConsult) * 100) : 0;
          return (
            <div style={{ marginBottom: 16 }}>
              {/* 퍼널 요약 — 라벨+건수 / 전환율 / 수주금액 */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', paddingBottom: 12 }}>
                {[
                  { label: '상담', value: `${totalConsult}건`, pct: '100%', color: 'var(--text-primary)' },
                  { label: '견적', value: `${totalEstimate}건`, pct: `${consultToEstimate}%`, color: consultToEstimate >= 50 ? 'var(--green)' : consultToEstimate >= 30 ? 'var(--orange)' : 'var(--red)' },
                  { label: '수주', value: `${totalOrder}건`, pct: `${consultToOrder}%`, color: consultToOrder >= 30 ? 'var(--green)' : consultToOrder >= 15 ? 'var(--orange)' : 'var(--red)' },
                  { label: '수주금액', value: `${totalAmount.toLocaleString()}원`, pct: null, color: 'var(--text-primary)' },
                ].map((s, i) => (
                  <div key={s.label} style={{ flex: 1, textAlign: 'center', borderRight: i < 3 ? '1px solid var(--border-light)' : 'none', padding: '0 4px' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label} {i < 3 ? `(${[totalConsult, totalEstimate, totalOrder][i]})` : ''}</div>
                    {s.pct ? (
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.pct}</div>
                    ) : (
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{totalAmount.toLocaleString()}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>원</span></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        {practiceNotes.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {practiceNotes.map(n => renderNoteCard(n, true))}
          </div>
        ) : (
          <p style={emptyStyle}>실습일지가 없어요</p>
        )}
      </div>

      {/* 선택된 노트 상세 */}
      {expandedNote && (() => {
        const steps = parseSteps(expandedNote.content);
        const isPractice = (expandedNote.tags || []).includes('실습일지');
        const isSelfStudy = (expandedNote.tags || []).includes('자율학습');
        const conf = expandedNote.confidence ? confMap[expandedNote.confidence] : null;
        return (
          <div style={{ ...card, ...(isSelfStudy ? { border: '1px solid var(--purple-dim)' } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                  {expandedNote.title || (isPractice ? '실습일지' : '교육일지')}
                </h3>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {new Date(expandedNote.created_at).toLocaleDateString('ko', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {conf && <span style={{ padding: '4px 12px', borderRadius: 'var(--radius-pill)', background: 'var(--bg-elevated)', fontSize: 14 }}>{conf.icon} {conf.label}</span>}
                {!isSelfStudy && expandedNote.participation_score != null && (
                  <span style={{ padding: '4px 12px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 700, background: expandedNote.participation_score >= (expandedNote.participation_max || 3) ? 'var(--green-dim)' : 'var(--orange-dim)', color: expandedNote.participation_score >= (expandedNote.participation_max || 3) ? 'var(--green)' : 'var(--orange)' }}>참여 {expandedNote.participation_score}/{expandedNote.participation_max || 3}</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isPractice ? (
                <>
                  {steps.step1 && <NoteStep label="기억에 남는 고객" content={steps.step1} />}
                  {steps.step2 && <NoteStep label="선배의 비법" content={steps.step2} />}
                  {steps.step3 && <NoteStep label="칭찬할 점" content={steps.step3} />}
                  {steps.step4 && <NoteStep label="보완할 점" content={steps.step4} />}
                  {steps.order_detail && <NoteStep label="상담/수주 내역" content={steps.order_detail} />}
                </>
              ) : (
                <>
                  {steps.step1 && <NoteStep label="STEP 1 — 오늘 배운 것" content={steps.step1} />}
                  {steps.step2 && <NoteStep label="STEP 2 — 궁금한 점" content={steps.step2} />}
                  {steps.step3 && <NoteStep label="STEP 3 — 소감" content={steps.step3} />}
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function NoteStep({ label, content }: { label: string; content: string }) {
  return (
    <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{String(content)}</div>
    </div>
  );
}

/* ── 질문 탭 컴포넌트 ── */
interface QuestionThread {
  id: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  replies?: { id: string; content: string; author_role: string; author_name: string; created_at: string }[];
}

function QuestionsTab({ studentId }: { studentId: string }) {
  const [threadList, setThreadList] = useState<QuestionThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/student-questions?student_id=${studentId}`)
      .then(res => res.json())
      .then(data => { setThreadList(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [studentId]);

  if (loading) return <p style={{ ...emptyStyle, padding: '48px 0' }}>불러오는 중...</p>;

  return (
    <div style={card}>
      <h3 style={sectionTitle}>질문 이력 ({threadList.length}건)</h3>
      {threadList.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {threadList.map(q => {
            const statusStyle = q.status === 'open'
              ? { label: '대기', bg: 'var(--orange-dim)', color: 'var(--orange)' }
              : { label: '답변완료', bg: 'var(--green-dim)', color: 'var(--green)' };
            return (
              <details key={q.id}>
                <summary style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', transition: 'background 0.15s ease',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: statusStyle.bg, color: statusStyle.color }}>{statusStyle.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{q.title}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(q.created_at).toLocaleDateString('ko', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })}
                    {q.replies && q.replies.length > 0 && ` · 답글 ${q.replies.length}`}
                  </span>
                </summary>
                <div style={{ padding: '8px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* 질문 본문 */}
                  <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {q.content}
                  </div>
                  {/* 답글 */}
                  {q.replies?.map(r => (
                    <div key={r.id} style={{
                      padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                      background: r.author_role === 'admin' ? 'var(--blue-dim)' : 'var(--bg-elevated)',
                      marginLeft: r.author_role === 'admin' ? 20 : 0,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: r.author_role === 'admin' ? 'var(--blue)' : 'var(--text-muted)', marginBottom: 4 }}>
                        {r.author_name} · {new Date(r.created_at).toLocaleDateString('ko', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.content}</div>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <p style={emptyStyle}>질문이 없어요</p>
      )}
    </div>
  );
}

/* ── 교육 캘린더 + 메모 통합 (홈 달력 스타일) ── */
function CalendarWithMemo({ batch, scores, attendance, notes, studentId, initialMemos }: {
  batch?: Batch | null;
  scores: TestScore[];
  attendance: Attendance[];
  notes: NoteForAnalysis[];
  studentId: string;
  initialMemos: StudentMemo[];
}) {
  // 메모 state
  const [memoList, setMemoList] = useState<StudentMemo[]>(initialMemos);
  const [memoContent, setMemoContent] = useState('');
  const [memoCategory, setMemoCategory] = useState<StudentMemo['category']>('general');
  const [saving, setSaving] = useState(false);
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

  const handleSaveMemo = useCallback(async () => {
    if (!memoContent.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/student-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, date: todayStr, content: memoContent.trim(), category: memoCategory }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const saved = await res.json();
      setMemoList(prev => [saved, ...prev]);
      setMemoContent('');
      setMemoCategory('general');
    } catch {
      alert('메모 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [memoContent, memoCategory, studentId, todayStr, saving]);

  const handleDeleteMemo = useCallback(async (id: string) => {
    if (!confirm('이 메모를 삭제할까요?')) return;
    try {
      const res = await fetch(`/api/student-memos?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMemoList(prev => prev.filter(m => m.id !== id));
    } catch {
      alert('삭제에 실패했습니다.');
    }
  }, []);

  const memos = memoList;
  // 교육 기간에 포함된 월 목록 계산
  const months = useMemo(() => {
    if (!batch) return [];
    const start = new Date(batch.start_date + 'T00:00:00');
    const end = new Date(batch.end_date + 'T00:00:00');
    const result: { year: number; month: number }[] = [];
    const d = new Date(start.getFullYear(), start.getMonth(), 1);
    while (d <= end) {
      result.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
      d.setMonth(d.getMonth() + 1);
    }
    return result;
  }, [batch]);

  const [monthIdx, setMonthIdx] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 현재 보는 달이 교육 기간의 마지막 달이면 거기서 시작
  useEffect(() => {
    if (months.length > 0) setMonthIdx(months.length - 1);
  }, [months.length]);

  // 날짜별 데이터 맵 구축
  const dataMap = useMemo(() => {
    const scoreMap = new Map<string, number>();
    const dateScores = new Map<string, number[]>();
    for (const s of scores) {
      const arr = dateScores.get(s.test_date) || [];
      arr.push(s.score);
      dateScores.set(s.test_date, arr);
    }
    for (const [date, arr] of dateScores) {
      scoreMap.set(date, Math.round(arr.reduce((a, b) => a + b, 0) / arr.length));
    }

    const attMap = new Map<string, string>();
    for (const a of attendance) attMap.set(a.date, a.status);

    const noteSet = new Set<string>();
    for (const n of notes) {
      const meta = parseNoteMeta(n.content);
      if (meta.tags?.includes('실습일지') || meta.tags?.includes('자율학습')) continue;
      noteSet.add(n.created_at.slice(0, 10));
    }

    const memoMap = new Map<string, string[]>();
    for (const m of memos) {
      const arr = memoMap.get(m.date) || [];
      arr.push(m.category);
      memoMap.set(m.date, arr);
    }

    return { scoreMap, attMap, noteSet, memoMap };
  }, [scores, attendance, notes, memos]);

  if (months.length === 0) return null;

  const current = months[Math.min(monthIdx, months.length - 1)];
  const { year, month } = current;

  // 달력 셀 생성 (홈 달력과 동일 패턴)
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=일
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const kstToday = new Date(today.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const attColors: Record<string, string> = { present: '#22C55E', late: '#F59E0B', absent: '#EF4444', early_leave: '#A855F7' };

  const getDots = (dateStr: string) => {
    const dots: string[] = [];
    const att = dataMap.attMap.get(dateStr);
    if (att) dots.push(attColors[att] || '#22C55E');
    if (dataMap.noteSet.has(dateStr)) dots.push('#A855F7');
    if (dataMap.scoreMap.has(dateStr)) dots.push('#3B82F6');
    if (dataMap.memoMap.has(dateStr)) {
      const cats = dataMap.memoMap.get(dateStr)!;
      dots.push(cats.includes('caution') ? '#EF4444' : cats.includes('praise') ? '#22C55E' : '#6B7280');
    }
    return dots;
  };

  // 교육 기간 범위 체크
  const batchStart = batch!.start_date;
  const batchEnd = batch!.end_date;

  // 선택 날짜 상세 데이터
  const selectedInfo = useMemo(() => {
    if (!selectedDate) return null;
    const dt = new Date(selectedDate + 'T00:00:00');
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const att = dataMap.attMap.get(selectedDate);
    const score = dataMap.scoreMap.get(selectedDate) ?? null;
    const hasNote = dataMap.noteSet.has(selectedDate);
    const dayMemos = memos.filter(m => m.date === selectedDate);
    const attRecord = attendance.find(a => a.date === selectedDate);
    let checkIn = '', checkOut = '';
    if (attRecord?.note) {
      const inM = attRecord.note.match(/출근\s*([0-9:]+)/);
      const outM = attRecord.note.match(/퇴근\s*([0-9:]+)/);
      if (inM) checkIn = inM[1];
      if (outM && outM[1] !== '-') checkOut = outM[1];
    }
    return { dt, dayName: dayNames[dt.getDay()], att, score, hasNote, dayMemos, checkIn, checkOut };
  }, [selectedDate, dataMap, memos, attendance]);

  const attInfoMap: Record<string, { label: string; color: string }> = {
    present: { label: '출석', color: '#22C55E' },
    late: { label: '지각', color: '#F59E0B' },
    absent: { label: '결석', color: '#EF4444' },
    early_leave: { label: '조퇴', color: '#A855F7' },
  };

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', display: 'flex' }} className="calendar-combo">
      {/* 왼쪽: 파란 패널 — 선택 날짜 정보 + 메모 */}
      <div className="calendar-combo-left" style={{
        background: 'var(--blue)', color: '#fff',
        padding: '20px 20px', minWidth: 200, width: '35%', flexShrink: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        {selectedInfo ? (
          <>
            {/* 날짜 숫자 */}
            <div style={{ fontSize: 56, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.03em' }}>
              {selectedInfo.dt.getDate()}
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, opacity: 0.5, marginBottom: 16 }}>
              {selectedInfo.dt.getMonth() + 1}월 {selectedInfo.dayName}요일
            </div>

            {/* 이벤트 목록 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              {selectedInfo.att && (() => {
                const ai = attInfoMap[selectedInfo.att!] || attInfoMap.present;
                let timeStr = '';
                if (selectedInfo.checkIn) timeStr = selectedInfo.checkIn;
                if (selectedInfo.checkOut) timeStr += ` ~ ${selectedInfo.checkOut}`;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: ai.color, flexShrink: 0 }} />
                    <span>{ai.label}{timeStr ? ` ${timeStr}` : ''}</span>
                  </div>
                );
              })()}
              {selectedInfo.score !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', flexShrink: 0 }} />
                  <span>시험 {selectedInfo.score}점</span>
                </div>
              )}
              {selectedInfo.hasNote ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A855F7', flexShrink: 0 }} />
                  <span>교육일지 제출</span>
                </div>
              ) : selectedInfo.att ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: 0.5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', flexShrink: 0 }} />
                  <span>교육일지 미제출</span>
                </div>
              ) : null}
              {selectedInfo.dayMemos.map(m => {
                const catLabels: Record<string, string> = { praise: '칭찬', caution: '주의', behavior: '수업태도', counsel: '상담', general: '일반' };
                return (
                  <div key={m.id} style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.9 }}>
                    <span style={{ fontWeight: 600 }}>{catLabels[m.category] || '메모'}</span> {m.content.length > 30 ? m.content.slice(0, 30) + '...' : m.content}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>교육 캘린더</div>
            <div style={{ fontSize: 13, opacity: 0.6, lineHeight: 1.6 }}>
              날짜를 클릭하면<br />그 날의 출결, 시험, 일지,<br />메모를 확인할 수 있어요
            </div>
          </>
        )}

        {/* 메모 입력 — 하단 */}
        <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select
            value={memoCategory}
            onChange={e => setMemoCategory(e.target.value as StudentMemo['category'])}
            style={{
              padding: '8px 10px', fontSize: 12, fontWeight: 600, width: '100%',
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: 'var(--radius-sm)',
              outline: 'none', cursor: 'pointer',
            }}
          >
            {(Object.entries(MEMO_CATEGORIES) as [StudentMemo['category'], typeof MEMO_CATEGORIES[keyof typeof MEMO_CATEGORIES]][]).map(([key, cat]) => (
              <option key={key} value={key} style={{ color: '#000' }}>{cat.label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={memoContent}
              onChange={e => setMemoContent(e.target.value)}
              placeholder="메모 입력..."
              style={{
                flex: 1, padding: '8px 10px', fontSize: 13, minWidth: 0,
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-sm)',
                outline: 'none',
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveMemo(); }}
            />
            <button
              onClick={handleSaveMemo}
              disabled={!memoContent.trim() || saving}
              style={{
                padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                background: memoContent.trim() ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                color: '#fff', border: 'none', fontWeight: 600, fontSize: 12, cursor: memoContent.trim() ? 'pointer' : 'default',
                flexShrink: 0,
              }}
            >{saving ? '...' : '저장'}</button>
          </div>
        </div>
      </div>

      {/* 오른쪽: 달력 그리드 */}
      <div style={{ flex: 1, padding: '20px 24px' }}>
        {/* 월 네비게이션 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
          <button
            onClick={() => setMonthIdx(prev => Math.max(0, prev - 1))}
            disabled={monthIdx === 0}
            style={{ background: 'none', border: 'none', cursor: monthIdx === 0 ? 'default' : 'pointer', fontSize: 18, color: monthIdx === 0 ? 'var(--border)' : 'var(--text-muted)', padding: '2px 8px' }}
          >‹</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{year}년 {month}월</span>
          <button
            onClick={() => setMonthIdx(prev => Math.min(months.length - 1, prev + 1))}
            disabled={monthIdx >= months.length - 1}
            style={{ background: 'none', border: 'none', cursor: monthIdx >= months.length - 1 ? 'default' : 'pointer', fontSize: 18, color: monthIdx >= months.length - 1 ? 'var(--border)' : 'var(--text-muted)', padding: '2px 8px' }}
          >›</button>
        </div>

        {/* 요일 헤더 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 6 }}>
          {WEEKDAYS.map((w, i) => (
            <span key={w} style={{ fontSize: 12, fontWeight: 600, color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--blue)' : 'var(--text-muted)', padding: '2px 0' }}>{w}</span>
          ))}
        </div>

        {/* 달력 그리드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} style={{ padding: '5px 0' }} />;
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === kstToday;
            const isInRange = dateStr >= batchStart && dateStr <= batchEnd;
            const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
            const dots = isInRange ? getDots(dateStr) : [];
            const score = dataMap.scoreMap.get(dateStr) ?? null;
            const isOutOfRange = !isInRange;
            const isFuture = dateStr > kstToday;
            const isSelected = dateStr === selectedDate;

            return (
              <div key={day} onClick={() => {
                if (!isOutOfRange && !isFuture) setSelectedDate(prev => prev === dateStr ? null : dateStr);
              }} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5px 0',
                opacity: isOutOfRange || isFuture ? 0.3 : 1,
                cursor: isOutOfRange || isFuture ? 'default' : 'pointer',
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
                  {dots.slice(0, 4).map((c, di) => (
                    <span key={di} style={{ width: 3, height: 3, borderRadius: '50%', background: c }} />
                  ))}
                </div>
                {score !== null && !isFuture && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, marginTop: 1,
                    color: score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--orange)' : 'var(--red)',
                  }}>{score}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* 범례 */}
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          <span><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#22C55E', marginRight: 3 }} />출석</span>
          <span><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#F59E0B', marginRight: 3 }} />지각</span>
          <span><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#EF4444', marginRight: 3 }} />결석</span>
          <span><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#A855F7', marginRight: 3 }} />일지</span>
          <span><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#3B82F6', marginRight: 3 }} />시험</span>
        </div>
      </div>
    </div>
  );
}

