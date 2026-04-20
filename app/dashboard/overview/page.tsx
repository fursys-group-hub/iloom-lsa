'use client';

import { useState, useEffect } from 'react';
import { useBatch } from '@/lib/batch-context';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { SummaryCard, type FooterItem } from '@/components/SummaryCard';

/* ── 타입 ── */
interface StudentItem { id: string; name: string; store_location: string | null; is_dropped?: boolean; }
interface EvalData {
  student_id: string; week_number: number; rp_area: string | null;
  status: string; strength_tags: string[]; improvement_tags: string[]; comment: string | null;
  managers?: { name: string; store_name: string } | null;
  updated_at?: string;
}
interface FinalEvalData {
  student_id: string; overall_rating: number; summary: string;
  strengths: string | null; areas_to_develop: string | null;
  recommended_position: string | null;
  store_fit_score: number; independence_score: number;
  customer_score: number; product_score: number;
  managers?: { name: string; store_name: string } | null;
}
interface BenchmarkData {
  student_id: string; week_number: number; target_name: string;
  learnings: string; action_plan: string | null;
}

/* ── 유틸 ── */
const DIMENSIONS = ['제품 지식', '고객 응대', '상담 자신감', '주문 정확도', 'SCT 활용', '업셀링'];
const strengthDimMap: Record<string, string> = {
  '제품 지식 풍부': '제품 지식', '고객 라포형성 우수': '고객 응대', '고객 니즈 파악 우수': '고객 응대',
  '자신감 있는 상담': '상담 자신감', '차분하고 친절한 응대': '상담 자신감',
  '주문서 작성 정확': '주문 정확도', 'SCT 활용 능숙': 'SCT 활용',
  '업셀링 적극적': '업셀링', '빠르고 정확한 상담': '상담 자신감', '자가 학습 의지 높음': '제품 지식',
};
const impDimMap: Record<string, string> = {
  '제품 디테일 미흡': '제품 지식', '소재/컬러 미숙지': '제품 지식', '옵션/액세서리 미숙지': '제품 지식',
  '사이즈 숙지 필요': '제품 지식', '자신감 부족': '상담 자신감', '상담 흐름 개선 필요': '상담 자신감',
  '주문서 작성 누락': '주문 정확도', '프로모션 등록 누락': '주문 정확도',
  'SCT 활용 미숙': 'SCT 활용', '업셀링 보완 필요': '업셀링',
};

function evalToRadar(evals: EvalData[]) {
  const scores: Record<string, number> = {};
  DIMENSIONS.forEach((d) => { scores[d] = 50; });
  for (const ev of evals) {
    for (const tag of ev.strength_tags) { const dim = strengthDimMap[tag]; if (dim) scores[dim] = Math.min(100, scores[dim] + 10); }
    for (const tag of ev.improvement_tags) { const dim = impDimMap[tag]; if (dim) scores[dim] = Math.max(0, scores[dim] - 8); }
  }
  return DIMENSIONS.map((d) => ({ dimension: d, score: scores[d] }));
}

/* R&P 영역별 — 잘함/보완필요 판정 */
function rpAreaSummary(evals: EvalData[]) {
  const areas: Record<string, { strengths: string[]; improvements: string[]; weeks: number[] }> = {};
  for (const ev of evals) {
    const area = ev.rp_area || '미지정';
    if (!areas[area]) areas[area] = { strengths: [], improvements: [], weeks: [] };
    areas[area].strengths.push(...ev.strength_tags);
    areas[area].improvements.push(...ev.improvement_tags);
    areas[area].weeks.push(ev.week_number);
  }
  return Object.entries(areas).map(([area, data]) => {
    const sCount = data.strengths.length;
    const iCount = data.improvements.length;
    let level: 'good' | 'normal' | 'weak';
    if (iCount === 0 || sCount >= iCount * 2) level = 'good';
    else if (sCount >= iCount) level = 'normal';
    else level = 'weak';
    return {
      area, weeks: data.weeks.sort(), level,
      topStrengths: [...new Set(data.strengths)].slice(0, 3),
      topImprovements: [...new Set(data.improvements)].slice(0, 3),
    };
  });
}

const LEVEL_CONFIG = {
  good:   { label: '잘함',     bg: 'var(--green-dim)',  border: 'var(--green)',  color: 'var(--green)' },
  normal: { label: '보통',     bg: 'var(--orange-dim)', border: 'var(--orange)', color: 'var(--orange)' },
  weak:   { label: '보완 필요', bg: 'var(--red-dim)',  border: 'var(--red)',    color: 'var(--red)' },
};

/* ── 메인 ── */
export default function OverviewPage() {
  const { selectedBatchId } = useBatch();
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [evaluations, setEvaluations] = useState<EvalData[]>([]);
  const [finals, setFinals] = useState<FinalEvalData[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkData[]>([]);
  const [scores, setScores] = useState<{ student_id: string; subject: string; score: number; max_score: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [filterStore, setFilterStore] = useState('');

  useEffect(() => {
    if (!selectedBatchId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/students?batch_id=${selectedBatchId}`).then((r) => r.json()),
      fetch('/api/evaluations').then((r) => r.json()),
      fetch('/api/final-evaluations').then((r) => r.json()),
      fetch('/api/benchmarks').then((r) => r.json()),
      fetch('/api/scores').then((r) => r.json()).then((d) => d.scores || d || []),
    ]).then(([s, e, f, b, sc]) => {
      const studentList = (s as StudentItem[]) || [];
      const batchIds = new Set(studentList.map(st => st.id));
      const evalList = ((e as EvalData[]) || []).filter(x => batchIds.has(x.student_id));
      const finalList = ((f as FinalEvalData[]) || []).filter(x => batchIds.has(x.student_id));
      const bmList = ((b as BenchmarkData[]) || []).filter(x => batchIds.has(x.student_id));
      const scoreList = ((sc as { student_id: string; subject: string; score: number; max_score: number }[]) || []).filter(x => batchIds.has(x.student_id));
      setStudents(studentList); setEvaluations(evalList); setFinals(finalList);
      setBenchmarks(bmList); setScores(scoreList);
    }).catch(console.error).finally(() => setLoading(false));
  }, [selectedBatchId]);

  // 퇴사자 제외
  const activeStudents = students.filter(s => !s.is_dropped);
  const stores = [...new Set(activeStudents.map((s) => s.store_location).filter(Boolean))] as string[];
  const filteredStudents = filterStore ? activeStudents.filter((s) => s.store_location === filterStore) : activeStudents;
  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const studentEvals = evaluations.filter((e) => e.student_id === selectedStudentId).sort((a, b) => a.week_number - b.week_number);
  const studentFinals = finals.filter((f) => f.student_id === selectedStudentId);
  const studentBMs = benchmarks.filter((b) => b.student_id === selectedStudentId);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', minHeight: 400 }}><p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.025em', lineHeight: 1.1 }}>심화교육</h2>

      {!selectedStudentId && (
        <>
          {/* 요약 카드 — 1개 통합 */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', overflow: 'hidden' }}>
            {[
              { label: '교육생', value: activeStudents.length, unit: '명', color: 'var(--blue)' },
              { label: '평가', value: evaluations.length, unit: '건', color: 'var(--green)' },
              { label: '총평', value: new Set(finals.map((f) => f.student_id)).size, unit: '명', color: 'var(--purple)' },
              { label: '벤치마킹', value: benchmarks.length, unit: '건', color: 'var(--orange)' },
            ].map((s, i) => (
              <div key={i} style={{ padding: '14px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, letterSpacing: '-0.02em' }}>{s.value}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>{s.unit}</span></div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* 매장 필터 + 교육생 선택 */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 200 }}>
              <label style={miniLabel}>매장</label>
              <select value={filterStore} onChange={(e) => setFilterStore(e.target.value)} style={selectStyle}>
                <option value="">전체</option>
                {stores.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={miniLabel}>교육생</label>
              <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} style={selectStyle}>
                <option value="">교육생을 선택하세요</option>
                {filteredStudents.map((s) => {
                  const hasFinal = finals.some((f) => f.student_id === s.id);
                  const evalCount = evaluations.filter((e) => e.student_id === s.id).length;
                  return <option key={s.id} value={s.id}>{s.name} ({s.store_location || '미배정'}) — {evalCount}주 평가{hasFinal ? ' · 총평 ✓' : ''}</option>;
                })}
              </select>
            </div>
          </div>
        </>
      )}

      {!selectedStudentId ? (
        /* ===== 전체 목록 — 카드 그리드 ===== */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filteredStudents.map((st) => {
            const stEvals = evaluations.filter((e) => e.student_id === st.id);
            const stFinal = finals.find((f) => f.student_id === st.id);
            const rpAreas = rpAreaSummary(stEvals);
            const levelOrder: Record<'weak' | 'normal' | 'good', number> = { weak: 0, normal: 1, good: 2 };

            const signals: FooterItem[] = rpAreas
              .slice()
              .sort((a, b) => levelOrder[a.level] - levelOrder[b.level])
              .map((rp): FooterItem => ({
                type: 'pill',
                text: `${rp.area} ${LEVEL_CONFIG[rp.level].label}`,
                tone: rp.level === 'good' ? 'green' : rp.level === 'normal' ? 'orange' : 'red',
              }));

            // 좌상단: 매장 뱃지
            const headerLeft = (
              <span style={{
                padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                background: st.store_location ? 'var(--blue-dim)' : 'var(--bg-hover)',
                color: st.store_location ? 'var(--blue)' : 'var(--text-tertiary)',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              }}>{st.store_location || '매장 미배정'}</span>
            );

            // 본문: R&P 주차별 바 + 벤치마킹 주차별 바
            const bodyExtra = (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    심화교육 R&amp;P 주차별 평가
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                    {[1, 2, 3, 4, 5, 6].map((w) => {
                      const ev = stEvals.find((e) => e.week_number === w);
                      const bg = !ev ? 'var(--bg-hover)'
                        : ev.status === 'completed' ? 'var(--green)'
                        : 'var(--orange)';
                      const label = !ev ? '미진행'
                        : ev.status === 'completed' ? '완료'
                        : '일부';
                      return (
                        <div
                          key={w}
                          title={`${w}주차 · ${label}`}
                          style={{ height: 6, borderRadius: 'var(--radius-xs)', background: bg }}
                        />
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    벤치마킹 주차별 작성
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                    {[1, 2, 3, 4, 5, 6].map((w) => {
                      const bm = benchmarks.find((b) => b.student_id === st.id && b.week_number === w);
                      return (
                        <div
                          key={w}
                          title={`${w}주차 · ${bm ? '작성' : '미작성'}`}
                          style={{
                            height: 6, borderRadius: 'var(--radius-xs)',
                            background: bm ? 'var(--purple)' : 'var(--bg-hover)',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            );

            return (
              <SummaryCard
                key={st.id}
                date={headerLeft}
                title={st.name}
                typeBadge={{
                  text: stFinal ? '총평 ✓' : '총평 미작성',
                  tone: stFinal ? 'green' : 'gray',
                }}
                onClick={() => setSelectedStudentId(st.id)}
                bodyExtra={bodyExtra}
                footerSignals={signals}
                footerRight={stFinal ? (
                  <span style={{ fontSize: 14, color: 'var(--orange)', letterSpacing: 2 }}>
                    {'★'.repeat(stFinal.overall_rating)}
                  </span>
                ) : undefined}
              />
            );
          })}
        </div>
      ) : (
        /* ===== 교육생 상세 ===== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <button onClick={() => setSelectedStudentId('')}
            style={{ alignSelf: 'flex-start', padding: 0, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 14, cursor: 'pointer' }}>
            ← 교육생 목록
          </button>

          {/* 이름 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>{selectedStudent?.name?.charAt(0) || '?'}</div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{selectedStudent?.name}</h2>
              <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>{selectedStudent?.store_location || '매장 미배정'} · {studentEvals.length}주차 평가 완료</p>
            </div>
          </div>

          {/* ① 시험 점수 */}
          {(() => {
            const studentScores = scores.filter((s) => s.student_id === selectedStudentId);
            const hasScores = studentScores.length > 0;
            return (
              <Section title="심화교육 시험 점수" badge={hasScores ? undefined : '연동 예정'} badgeColor="var(--text-muted)">
                <div style={{ display: 'flex', gap: 16 }}>
                  {[1, 2, 3, 4, 5, 6].map((w) => {
                    const sc = studentScores.find((s) => s.subject === `${w}주차`);
                    const color = sc
                      ? (sc.score >= 80 ? 'var(--green)' : sc.score >= 60 ? 'var(--orange)' : 'var(--red)')
                      : 'var(--text-muted)';
                    return (
                      <div key={w} style={{ flex: 1, textAlign: 'center', padding: '4px 0', opacity: sc ? 1 : 0.5 }}>
                        <div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                          {sc ? sc.score : '—'}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 6 }}>{w}주차</div>
                      </div>
                    );
                  })}
                </div>
                {!hasScores && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '12px 0 0', textAlign: 'center' }}>
                    구글 시트 연동 후 주차별 시험 점수가 여기에 표시됩니다
                  </p>
                )}
              </Section>
            );
          })()}

          {/* ② 주차별 성장 기록 (타임라인 + 성장 요약) */}
          <Section title="주차별 성장 기록" subtitle="6주간 관리자 피드백을 따라 어떻게 성장했는지 볼 수 있어요">
            {studentEvals.length > 0 && (() => {
              const completedCount = studentEvals.filter((e) => e.status === 'completed').length;
              let totalResolved = 0;
              const strengthSet = new Set<string>();
              const sorted = [...studentEvals].sort((a, b) => a.week_number - b.week_number);
              for (let i = 0; i < sorted.length; i++) {
                const ev = sorted[i];
                const prev = i > 0 ? sorted[i - 1] : null;
                if (prev && ev.status !== 'not_started') {
                  totalResolved += prev.improvement_tags.filter((t) => !ev.improvement_tags.includes(t)).length;
                }
                ev.strength_tags.forEach((t) => strengthSet.add(t));
              }
              return (
                <div style={{
                  display: 'flex', gap: 16,
                  padding: '16px 20px', marginBottom: 24,
                  background: 'var(--bg-main)', borderRadius: 'var(--radius-md)',
                }}>
                  {[
                    { value: completedCount, unit: '주', label: '평가 완료', color: 'var(--blue)' },
                    { value: totalResolved, unit: '개', label: '해결한 개선점', color: 'var(--green)' },
                    { value: strengthSet.size, unit: '개', label: '쌓은 강점', color: 'var(--purple)' },
                  ].map((s) => (
                    <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: s.color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        {s.value}
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 3 }}>{s.unit}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 6 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ position: 'relative', paddingLeft: 28 }}>
              {/* 타임라인 세로선 */}
              <div style={{ position: 'absolute', left: 10, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />

              {[1, 2, 3, 4, 5, 6].map((w) => {
                const ev = studentEvals.find((e) => e.week_number === w);
                const prev = studentEvals.find((e) => e.week_number === w - 1);
                const resolved = prev && ev && ev.status !== 'not_started'
                  ? prev.improvement_tags.filter((t) => !ev.improvement_tags.includes(t))
                  : [];

                return (
                  <div key={w} style={{ position: 'relative', marginBottom: 16 }}>
                    {/* 타임라인 점 */}
                    <div style={{
                      position: 'absolute', left: -23, top: 18, width: 14, height: 14, borderRadius: '50%',
                      background: ev ? 'var(--green)' : 'var(--bg-hover)', border: '2px solid var(--bg-main)',
                    }} />

                    <div style={{
                      padding: 20, borderRadius: 'var(--radius-md)',
                      background: ev ? 'var(--bg-main)' : 'transparent',
                      border: ev ? 'none' : '1px dashed var(--border)',
                      opacity: ev ? 1 : 0.4,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: ev ? 12 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 16, fontWeight: 600, color: ev ? 'var(--text-primary)' : 'var(--text-muted)', letterSpacing: '-0.01em' }}>{w}주차</span>
                          {ev?.rp_area && (
                            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue)', fontSize: 12, fontWeight: 600 }}>
                              {ev.rp_area}
                            </span>
                          )}
                        </div>
                        {ev ? (
                          <span style={{
                            padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
                            background: ev.status === 'completed' ? 'var(--green-dim)' : 'var(--orange-dim)',
                            color: ev.status === 'completed' ? 'var(--green)' : 'var(--orange)',
                          }}>{ev.status === 'completed' ? '완료' : ev.status === 'partial' ? '일부' : '미진행'}</span>
                        ) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>미작성</span>}
                      </div>

                      {ev && (
                        <>
                          {/* 해결된 개선점 */}
                          {resolved.length > 0 && (
                            <div style={{
                              padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 12,
                              background: 'var(--green-dim)', border: '1px solid var(--green-dim)',
                            }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', marginRight: 8 }}>지난주 대비 해결됨:</span>
                              {resolved.map((t) => (
                                <span key={t} style={{ fontSize: 12, color: 'var(--green)', marginRight: 8 }}>{t}</span>
                              ))}
                            </div>
                          )}

                          {/* 강점/개선점 태그 */}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                            {ev.strength_tags.map((t) => <TagPill key={`s-${t}`} type="strength">{t}</TagPill>)}
                            {ev.improvement_tags.map((t) => <TagPill key={`i-${t}`} type="improvement">{t}</TagPill>)}
                          </div>

                          {/* 코멘트 */}
                          {ev.comment && (
                            <div style={{
                              padding: '14px 18px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
                            }}>
                              <p style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.75, margin: 0 }}>
                                {ev.comment}
                              </p>
                            </div>
                          )}

                          {ev.managers && (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                              — {ev.managers.name} ({ev.managers.store_name}){ev.updated_at && ` · ${new Date(ev.updated_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}`}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ④ 성장 차트 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 24 }}>
            <Section title="종합 역량" subtitle="모든 주차 평가를 종합한 역량 분포예요">
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={evalToRadar(studentEvals)}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--text-second)', fontSize: 13 }} />
                    <Radar dataKey="score" stroke="#007AFF" fill="#007AFF" fillOpacity={0.25} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="주차별 변화" subtitle="강점이 늘고 개선점이 줄면 성장하고 있다는 뜻이에요">
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Array.from({ length: 6 }, (_, i) => {
                    const ev = studentEvals.find((e) => e.week_number === i + 1);
                    return { week: `${i + 1}주차`, 강점: ev?.strength_tags.length || 0, 개선점: ev?.improvement_tags.length || 0 };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="week" tick={{ fill: 'var(--text-muted)', fontSize: 13 }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 13 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="강점" fill="#30D158" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="개선점" fill="#FF9F0A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>

          {/* ⑤ 벤치마킹 — 주차별 성장 기록과 동일한 타임라인 구조 */}
          <Section title="벤치마킹 기록" subtitle="교육생이 직접 작성한 우수 직원 벤치마킹 기록이에요">
            {studentBMs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>아직 교육생이 작성한 벤치마킹 기록이 없어요</p>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 28 }}>
                {/* 타임라인 세로선 */}
                <div style={{ position: 'absolute', left: 10, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />

                {[...studentBMs].sort((a, b) => a.week_number - b.week_number).map((bm) => (
                  <div key={bm.week_number} style={{ position: 'relative', marginBottom: 16 }}>
                    {/* 타임라인 점 — purple */}
                    <div style={{
                      position: 'absolute', left: -23, top: 18, width: 14, height: 14, borderRadius: '50%',
                      background: 'var(--purple)', border: '2px solid var(--bg-main)',
                    }} />

                    <div style={{
                      padding: 20, borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-main)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{bm.week_number}주차</span>
                        <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--purple-dim)', color: 'var(--purple)', fontSize: 12, fontWeight: 600 }}>
                          {bm.target_name}
                        </span>
                      </div>

                      <p style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.7, margin: 0 }}>{bm.learnings}</p>

                      {bm.action_plan && (
                        <div style={{ padding: '14px 18px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', marginTop: 12 }}>
                          <p style={{ fontSize: 13, color: 'var(--purple)', margin: 0, fontWeight: 600 }}>실천 계획</p>
                          <p style={{ fontSize: 14, color: 'var(--text-second)', margin: '4px 0 0', lineHeight: 1.6 }}>{bm.action_plan}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ⑥ 교육 총평 — 가장 크고 눈에 띄게 */}
          {studentFinals.length > 0 ? (
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-sm)',
              padding: '20px 24px',
            }}>
              {studentFinals.map((fe, idx) => (
                <div key={idx}>
                  {/* 헤더: 제목 + 별점 한 줄 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.015em', lineHeight: 1.3 }}>교육 총평</h3>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20, color: 'var(--orange)', letterSpacing: 3, lineHeight: 1 }}>
                        {'★'.repeat(fe.overall_rating)}
                        <span style={{ color: 'var(--bg-hover)' }}>{'★'.repeat(5 - fe.overall_rating)}</span>
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                        {['', '많이 부족', '부족', '보통', '우수', '매우 우수'][fe.overall_rating]}
                      </span>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 20px' }}>6주간의 심화교육을 마친 종합 평가예요</p>

                  {/* 4개 점수 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                    <ScoreCard label="매장 적응" score={fe.store_fit_score} color="var(--blue)" />
                    <ScoreCard label="독립 업무" score={fe.independence_score} color="var(--green)" />
                    <ScoreCard label="고객 응대" score={fe.customer_score} color="var(--purple)" />
                    <ScoreCard label="제품 지식" score={fe.product_score} color="var(--orange)" />
                  </div>

                  {/* 요약문 */}
                  <div style={{ padding: '16px 20px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
                    <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-primary)', margin: 0 }}>
                      {fe.summary}
                    </p>
                  </div>

                  {/* 강점 / 발전 방향 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {fe.strengths && (
                      <div style={{ padding: '16px 20px', background: 'var(--green-dim)', borderRadius: 'var(--radius-md)' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', margin: '0 0 6px' }}>핵심 강점</p>
                        <p style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, margin: 0 }}>{fe.strengths}</p>
                      </div>
                    )}
                    {fe.areas_to_develop && (
                      <div style={{ padding: '16px 20px', background: 'var(--orange-dim)', borderRadius: 'var(--radius-md)' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)', margin: '0 0 6px' }}>발전 방향</p>
                        <p style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, margin: 0 }}>{fe.areas_to_develop}</p>
                      </div>
                    )}
                  </div>

                  {/* 추천 배치 + 작성자 한 줄 */}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    {fe.recommended_position ? (
                      <p style={{ fontSize: 14, margin: 0 }}>
                        <span style={{ color: 'var(--text-tertiary)', marginRight: 6 }}>추천 배치</span>
                        <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{fe.recommended_position}</span>
                      </p>
                    ) : <span />}
                    {fe.managers && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        작성: {fe.managers.name} ({fe.managers.store_name})
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Section title="교육 총평" badge="미작성" badgeColor="var(--text-muted)">
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20, fontSize: 15 }}>
                아직 교육 총평이 작성되지 않았어요. 매장 관리자가 총평을 작성하면 여기에 표시됩니다.
              </p>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 공용 컴포넌트 ── */
function Section({ title, subtitle, badge, badgeColor, children, ...rest }: {
  icon?: string; title: string; subtitle?: string; badge?: string; badgeColor?: string; children: React.ReactNode;
}) {
  void rest;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: subtitle ? 6 : 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.015em', lineHeight: 1.3 }}>{title}</h3>
        {badge && (
          <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--bg-elevated)', color: badgeColor || 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
            {badge}
          </span>
        )}
      </div>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 16px' }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function SumCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color, margin: 0 }}>{value}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span></p>
    </div>
  );
}

function ScoreCard({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 14, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
      <p style={{ fontSize: 26, fontWeight: 700, color, margin: '0 0 4px', letterSpacing: '-0.02em' }}>{score}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>/5</span></p>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>{label}</p>
      <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => <div key={n} style={{ width: 18, height: 5, borderRadius: 'var(--radius-xs)', background: n <= score ? color : 'var(--bg-hover)' }} />)}
      </div>
    </div>
  );
}

function TagPill({ children, type }: { children: React.ReactNode; type: 'strength' | 'improvement' }) {
  const c = type === 'strength' ? { bg: 'var(--green-dim)', color: 'var(--green)' } : { bg: 'var(--orange-dim)', color: 'var(--orange)' };
  return <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: c.bg, color: c.color, fontSize: 12, fontWeight: 600 }}>{children}</span>;
}
const miniLabel: React.CSSProperties = { fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 };
const selectStyle: React.CSSProperties = { width: '100%', padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', outline: 'none' };
