'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import type { Student, TestScore, Attendance, StudentMemo, CoachingReport } from '@/lib/types';
import { MEMO_CATEGORIES } from '@/lib/types';
import { calculateRiskLevel, calculateAvgScore, calculateDailyAverages } from '@/lib/analysis';
import ScoreTrendChart from '@/components/charts/ScoreTrendChart';
import RiskBadge from '@/components/RiskBadge';

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

interface Props {
  student: Student;
  scores: TestScore[];
  attendance: Attendance[];
  memos: StudentMemo[];
  coachingReports: CoachingReport[];
  responses: TestResponse[];
  questions: Question[];
  allScores: TestScore[];
}

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px',
};

export default function StudentDetailClient({
  student, scores, allScores, attendance, memos, coachingReports, responses, questions,
}: Props) {
  const avgScore = useMemo(() => calculateAvgScore(scores), [scores]);
  const riskLevel = useMemo(() => calculateRiskLevel(scores, attendance), [scores, attendance]);
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

  // 탭 상태
  type TabKey = 'summary' | 'attendance' | 'tests' | 'notes' | 'questions';
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const tabs: [TabKey, string][] = [
    ['summary', '요약'],
    ['attendance', '출결'],
    ['tests', '테스트'],
    ['notes', '일지'],
    ['questions', '질문'],
  ];

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

      {/* 프로필 */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue-dim)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>{student.name[0]}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{student.name}</h2>
                {student.is_dropped && (
                  <span style={{
                    padding: '4px 12px', borderRadius: 'var(--radius-pill)',
                    fontSize: 13, fontWeight: 700,
                    background: 'var(--red-dim)', color: 'var(--red)',
                  }}>퇴사 ({student.dropped_at})</span>
                )}
              </div>
              {student.store_location && <p style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 2 }}>{student.store_location}</p>}
              {student.is_dropped && student.drop_reason && (
                <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>사유: {student.drop_reason}</p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <StatItem label="평균" value={`${avgScore}점`} />
            <StatItem label="출석" value={`${presentCount}일`} color="var(--green)" />
            <StatItem label="결석" value={`${absentCount}회`} color={absentCount > 0 ? 'var(--red)' : undefined} />
            <StatItem label="지각" value={`${lateCount}회`} color={lateCount > 0 ? 'var(--orange)' : undefined} />
            <RiskBadge level={riskLevel} />
          </div>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {tabs.map(([key, label], i) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,
            background: 'transparent',
            color: activeTab === key ? 'var(--text-primary)' : 'var(--text-muted)',
            border: 'none',
            borderBottom: activeTab === key ? '2px solid var(--blue)' : '2px solid transparent',
            fontSize: 15,
            fontWeight: activeTab === key ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {/* ━━━ 요약 탭 ━━━ */}
      {activeTab === 'summary' && (
        <>
          {/* 학습 피드백 */}
          <div style={card}>
            <h3 style={sectionTitle}>학습 피드백</h3>
            {tagAnalysis.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {weakTags.length > 0 && (
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)', marginBottom: 10 }}>이 부분을 더 공부하세요</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {weakTags.slice(0, 5).map((t) => (
                        <span key={t.label} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--red-dim)', color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>
                          {t.label} ({t.correct}/{t.total})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {midTags.length > 0 && (
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--orange)', marginBottom: 10 }}>조금 더 복습하면 좋아요</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {midTags.slice(0, 5).map((t) => (
                        <span key={t.label} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--orange-dim)', color: 'var(--orange)', fontSize: 12, fontWeight: 600 }}>
                          {t.label} ({t.correct}/{t.total})
                        </span>
                      ))}
                      {midTags.length > 5 && <span style={{ padding: '3px 10px', fontSize: 12, color: 'var(--text-muted)' }}>외 {midTags.length - 5}개</span>}
                    </div>
                  </div>
                )}
                {strongTags.length > 0 && (
                  <div style={{ fontSize: 14, color: 'var(--green)' }}>
                    <span style={{ fontWeight: 600 }}>{strongTags.length}개 영역</span> 잘하고 있어요
                  </div>
                )}
              </div>
            ) : (
              <p style={emptyStyle}>시험 데이터가 필요해요</p>
            )}
          </div>

          {/* 교육 메모 */}
          <MemoSection studentId={student.id} initialMemos={memos} />

          {/* AI 코칭 리포트 */}
          <div style={card}>
            <h3 style={sectionTitle}>AI 코칭 리포트</h3>
            {coachingReports.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {coachingReports.map((report) => {
                  const typeLabel: Record<string, string> = { daily: '일일', subject: '분야별', weekly: '주간', comprehensive: '종합' };
                  const typeColor: Record<string, { bg: string; color: string }> = {
                    comprehensive: { bg: 'var(--blue-dim)', color: 'var(--blue-light)' },
                    subject: { bg: 'rgba(191,90,242,0.15)', color: 'var(--purple)' },
                    daily: { bg: 'var(--green-dim)', color: 'var(--green)' },
                    weekly: { bg: 'var(--orange-dim)', color: 'var(--orange)' },
                  };
                  const rt = (report as { report_type?: string }).report_type || 'daily';
                  const tc = typeColor[rt] || typeColor.daily;
                  const tt = (report as { tag_tracking?: { overcome?: string[]; newWeak?: string[]; chronic?: string[] } | null }).tag_tracking;
                  return (
                    <details key={report.id}>
                      <summary style={{
                        padding: '10px 14px', borderRadius: 'var(--radius-md)',
                        fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
                        cursor: 'pointer', transition: 'background 0.15s ease',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: tc.bg, color: tc.color }}>{typeLabel[rt] || rt}</span>
                        {report.test_date} 분석
                        {(report as { subject?: string }).subject && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({(report as { subject?: string }).subject})</span>}
                      </summary>
                      <div style={{ marginTop: 6, padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--bg-hover)', fontSize: 13, color: 'var(--text-second)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {tt && (tt.overcome?.length || tt.chronic?.length || tt.newWeak?.length) ? (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                            {tt.overcome?.map(t => <span key={`o-${t}`} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--green-dim)', color: 'var(--green)' }}>{t}</span>)}
                            {tt.chronic?.map(t => <span key={`c-${t}`} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--red-dim)', color: 'var(--red)' }}>{t}</span>)}
                            {tt.newWeak?.map(t => <span key={`n-${t}`} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--orange-dim)', color: 'var(--orange)' }}>{t}</span>)}
                          </div>
                        ) : null}
                        {report.manager_report}
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : (
              <p style={emptyStyle}>아직 코칭 리포트가 없어요</p>
            )}
          </div>
        </>
      )}

      {/* ━━━ 테스트 탭 ━━━ */}
      {activeTab === 'tests' && (
        <>
          {/* 점수 추이 */}
          <div style={card}>
            <h3 style={sectionTitle}>차시별 점수 추이</h3>
            {dailyAverages.length > 0 ? (
              <ScoreTrendChart
                data={dailyAverages.map((d) => {
                  const classAvg = classAverages.find((c) => c.date === d.date);
                  return { ...d, classAvg: classAvg?.avg ?? 0 };
                })}
                lines={[
                  { key: 'avg', color: '#3b82f6', name: student.name },
                  { key: 'classAvg', color: '#6b7280', name: '반 평균' },
                ]}
              />
            ) : <p style={emptyStyle}>데이터 없음</p>}
          </div>

          {/* 2열: 카테고리별 학습 현황 + 차시별 오답 */}
          <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div style={card}>
              <h3 style={sectionTitle}>카테고리별 학습 현황</h3>
              {categoryGroups.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {categoryGroups.map(({ category, rate, totalQ, correctQ, tags: catTags }) => {
                    const catColor = rate >= 80 ? 'var(--green)' : rate >= 60 ? 'var(--orange)' : 'var(--red)';
                    return (
                      <details key={category}>
                        <summary style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 14px', borderRadius: 'var(--radius-md)',
                          cursor: 'pointer', transition: 'background 0.15s ease',
                          border: '1px solid var(--border)',
                        }}
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
                              const msg = t.correct === t.total ? '전문항 정답' : `${t.total - t.correct}문항 오답`;
                              return (
                                <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                                  <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{t.label}</span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color }}>{msg}</span>
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

            <div style={card}>
              <h3 style={sectionTitle}>차시별 오답 문항</h3>
              {sessionWrongs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sessionWrongs.map(({ session, total, wrongs }) => (
                    <details key={session}>
                      <summary style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 14px', borderRadius: 'var(--radius-md)',
                        fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                        cursor: 'pointer', transition: 'background 0.15s ease',
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span>{session}</span>
                        <span style={{
                          fontSize: 14, fontWeight: 600,
                          color: wrongs.length === 0 ? 'var(--green)' : wrongs.length > 5 ? 'var(--red)' : 'var(--orange)',
                        }}>
                          {wrongs.length === 0 ? '전문항 정답!' : `오답 ${wrongs.length}/${total}`}
                        </span>
                      </summary>
                      {wrongs.length > 0 && (
                        <div style={{ padding: '6px 14px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {wrongs.map((w) => (
                            <div key={w.id} style={{
                              padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                              background: 'var(--red-dim)', border: '1px solid var(--red-dim)',
                            }}>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 3 }}>
                                Q{w.question_id} · {w.question?.series || w.question?.category}
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>
                                {w.question?.question_text || ''}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                <div style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--red-dim)', fontSize: 12 }}>
                                  <span style={{ color: 'var(--text-muted)' }}>답: </span>
                                  <span style={{ color: 'var(--red)', fontWeight: 500 }}>{w.user_answer || '(미입력)'}</span>
                                </div>
                                <div style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--blue-dim)', fontSize: 12 }}>
                                  <span style={{ color: 'var(--text-muted)' }}>정답: </span>
                                  <span style={{ color: 'var(--blue-light)', fontWeight: 500 }}>{w.question?.correct_answer || ''}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                  ))}
                </div>
              ) : (
                <p style={emptyStyle}>시험 데이터가 없어요</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ━━━ 출결 탭 ━━━ */}
      {activeTab === 'attendance' && (
        <div style={card}>
          <h3 style={sectionTitle}>출결 이력</h3>
          {attendance.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>날짜</th>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle}>비고</th>
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
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{a.date}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
                      </td>
                      <td style={tdStyle}>{a.note || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p style={emptyStyle}>출결 데이터가 없어요</p>
          )}
        </div>
      )}

      {/* ━━━ 일지 탭 ━━━ */}
      {activeTab === 'notes' && (
        <NotesTab studentId={student.id} studentName={student.name} />
      )}

      {/* ━━━ 질문 탭 ━━━ */}
      {activeTab === 'questions' && (
        <QuestionsTab studentId={student.id} />
      )}

      <style>{`
        @media (max-width: 1024px) {
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
      <div style={{ marginBottom: 20 }}>
        {/* 카테고리 선택 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {(Object.entries(MEMO_CATEGORIES) as [MemoCategory, typeof MEMO_CATEGORIES[keyof typeof MEMO_CATEGORIES]][]).map(([key, cat]) => {
            const selected = category === key;
            return (
              <button
                key={key}
                onClick={() => setCategory(key)}
                style={{
                  padding: '6px 14px', borderRadius: 'var(--radius-pill)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: selected ? 'none' : '1px solid var(--border)',
                  background: selected ? cat.color : 'transparent',
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
              background: 'var(--bg-elevated)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              resize: 'vertical', lineHeight: 1.5, outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--blue)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
            }}
          />
          <button
            onClick={handleSave}
            disabled={!content.trim() || saving}
            style={{
              padding: '10px 20px', borderRadius: 'var(--radius-md)',
              background: content.trim() ? 'var(--blue)' : 'var(--bg-hover)',
              color: content.trim() ? '#fff' : 'var(--text-muted)',
              border: 'none', fontWeight: 600, fontSize: 14,
              cursor: content.trim() ? 'pointer' : 'default',
              alignSelf: 'flex-end', whiteSpace: 'nowrap',
            }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Ctrl+Enter로 빠르게 저장</p>
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
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 14px', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-hover)',
                }}
              >
                {/* 카테고리 뱃지 + 날짜 */}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 64 }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                    fontSize: 11, fontWeight: 600,
                    background: `color-mix(in srgb, ${cat.color} 15%, transparent)`,
                    color: cat.color,
                  }}>
                    {cat.label}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{memo.date}</span>
                </div>
                {/* 내용 */}
                <span style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, flex: 1, whiteSpace: 'pre-wrap' }}>
                  {memo.content}
                </span>
                {/* 삭제 */}
                <button
                  onClick={() => handleDelete(memo.id)}
                  title="삭제"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: 16, padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)', flexShrink: 0,
                    opacity: 0.4, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--red)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--text-muted)'; }}
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

function NotesTab({ studentId }: { studentId: string; studentName?: string }) {
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
          border: isSelected ? '2px solid var(--blue)' : isSelfStudy ? '1px solid var(--purple-dim)' : '1px solid var(--border)',
          background: isSelected ? 'var(--blue-dim)' : isSelfStudy ? 'var(--purple-dim)' : 'var(--bg-surface)',
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
        <h3 style={sectionTitle}>교육일지 ({educationNotes.length}건)</h3>
        {educationNotes.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {educationNotes.map(n => renderNoteCard(n, false))}
          </div>
        ) : (
          <p style={emptyStyle}>교육일지가 없어요</p>
        )}
      </div>

      {/* 실습일지 */}
      <div style={card}>
        <h3 style={sectionTitle}>실습일지 ({practiceNotes.length}건)</h3>
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
