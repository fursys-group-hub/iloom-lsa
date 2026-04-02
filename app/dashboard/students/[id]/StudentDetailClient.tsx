'use client';

import { useMemo, useState, useCallback } from 'react';
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
  borderRadius: 'var(--radius-lg)', padding: 24,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px',
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

  // 약점 / 강점 분리
  const weakTags = tagAnalysis.filter((t) => t.rate < 60);
  const midTags = tagAnalysis.filter((t) => t.rate >= 60 && t.rate < 80);
  const strongTags = tagAnalysis.filter((t) => t.rate >= 80);

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
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue-dim)', color: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>{student.name[0]}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{student.name}</h2>
                {student.is_dropped && (
                  <span style={{
                    padding: '4px 12px', borderRadius: 'var(--radius-pill)',
                    fontSize: 13, fontWeight: 700,
                    background: 'rgba(255,69,58,0.12)', color: 'var(--red)',
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

      {/* 학습 피드백 (1열) */}
      <div style={card}>
          <h3 style={sectionTitle}>💬 학습 피드백</h3>
          {tagAnalysis.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {weakTags.length > 0 && (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)', marginBottom: 10 }}>🚨 이 부분을 더 공부하세요</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {weakTags.slice(0, 5).map((t) => (
                      <span key={t.label} style={{ padding: '5px 12px', borderRadius: 'var(--radius-pill)', background: 'rgba(255,69,58,0.1)', color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>
                        {t.label} ({t.correct}/{t.total})
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {midTags.length > 0 && (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--orange)', marginBottom: 10 }}>⚠️ 조금 더 복습하면 좋아요</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {midTags.slice(0, 5).map((t) => (
                      <span key={t.label} style={{ padding: '5px 12px', borderRadius: 'var(--radius-pill)', background: 'rgba(255,159,10,0.1)', color: 'var(--orange)', fontSize: 13, fontWeight: 600 }}>
                        {t.label} ({t.correct}/{t.total})
                      </span>
                    ))}
                    {midTags.length > 5 && <span style={{ padding: '5px 12px', fontSize: 13, color: 'var(--text-muted)' }}>외 {midTags.length - 5}개</span>}
                  </div>
                </div>
              )}
              {strongTags.length > 0 && (
                <div style={{ fontSize: 14, color: 'var(--green)' }}>
                  ✅ <span style={{ fontWeight: 600 }}>{strongTags.length}개 영역</span> 잘하고 있어요
                </div>
              )}
            </div>
          ) : (
            <p style={emptyStyle}>시험 데이터가 필요해요</p>
          )}
        </div>

      {/* 점수 추이 (1열) */}
      <div style={card}>
        <h3 style={sectionTitle}>📈 차시별 점수 추이</h3>
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
        {/* 카테고리별 학습 현황 */}
        <div style={card}>
          <h3 style={sectionTitle}>🏷️ 카테고리별 학습 현황</h3>
          {categoryGroups.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {categoryGroups.map(({ category, rate, totalQ, correctQ, tags }) => {
                const catColor = rate >= 80 ? 'var(--green)' : rate >= 60 ? 'var(--orange)' : 'var(--red)';
                const catIcon = rate >= 80 ? '✅' : rate >= 60 ? '⚠️' : '🚨';
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
                        <span>{catIcon}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{category}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{totalQ}문항</span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: catColor }}>{correctQ}/{totalQ}</span>
                    </summary>
                    {tags.length > 0 && (
                      <div style={{ padding: '6px 14px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {tags.map((t) => {
                          const icon = t.rate >= 80 ? '✅' : t.rate >= 60 ? '⚠️' : '❌';
                          const color = t.rate >= 80 ? 'var(--green)' : t.rate >= 60 ? 'var(--orange)' : 'var(--red)';
                          const msg = t.correct === t.total ? '전문항 정답' : `${t.total - t.correct}문항 오답`;
                          return (
                            <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                              <span style={{ fontSize: 12 }}>{icon}</span>
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

        {/* 차시별 오답 */}
        <div style={card}>
          <h3 style={sectionTitle}>❌ 차시별 오답 문항</h3>
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
                          background: 'rgba(255,69,58,0.05)', border: '1px solid rgba(255,69,58,0.15)',
                        }}>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 3 }}>
                            Q{w.question_id} · {w.question?.series || w.question?.category}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>
                            {w.question?.question_text || ''}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <div style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,69,58,0.08)', fontSize: 12 }}>
                              <span style={{ color: 'var(--text-muted)' }}>답: </span>
                              <span style={{ color: 'var(--red)', fontWeight: 500 }}>{w.user_answer || '(미입력)'}</span>
                            </div>
                            <div style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(10,132,255,0.08)', fontSize: 12 }}>
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

      {/* 교육 메모 (1열) */}
      <MemoSection studentId={student.id} initialMemos={memos} />

      {/* AI 코칭 (1열) */}
      <div style={card}>
        <h3 style={sectionTitle}>🤖 AI 코칭 리포트</h3>
        {coachingReports.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {coachingReports.map((report) => (
              <details key={report.id}>
                <summary style={{
                  padding: '10px 14px', borderRadius: 'var(--radius-md)',
                  fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
                  cursor: 'pointer', transition: 'background 0.15s ease',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {report.test_date} 분석
                </summary>
                <div style={{ marginTop: 6, padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--bg-hover)', fontSize: 13, color: 'var(--text-second)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {report.manager_report}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p style={emptyStyle}>아직 코칭 리포트가 없어요</p>
        )}
      </div>

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

  const todayStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

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
      <h3 style={sectionTitle}>📝 교육 메모</h3>

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
                {cat.emoji} {cat.label}
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
                    {cat.emoji} {cat.label}
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
