'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { SummaryCard, type FooterItem } from '@/components/SummaryCard';
import AdvancedScoreSection from '@/components/AdvancedScoreSection';

interface StudentItem { id: string; name: string; store_location: string | null; is_dropped?: boolean; }
interface EvalData {
  student_id: string; week_number: number; rp_area: string | null;
  status: string; strength_tags: string[]; improvement_tags: string[]; comment: string | null;
  managers?: { name: string; store_name: string } | null;
  updated_at?: string;
}
interface BenchmarkData {
  student_id: string; week_number: number; target_name: string;
  learnings: string; action_plan: string | null;
}

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
    return { area, weeks: data.weeks.sort(), level, topStrengths: [...new Set(data.strengths)].slice(0, 3), topImprovements: [...new Set(data.improvements)].slice(0, 3) };
  });
}

const LEVEL_CONFIG = {
  good:   { label: '잘함', bg: 'var(--green-dim)', border: 'var(--green)', color: 'var(--green)' },
  normal: { label: '보통', bg: 'var(--orange-dim)', border: 'var(--orange)', color: 'var(--orange)' },
  weak:   { label: '보완 필요', bg: 'var(--red-dim)', border: 'var(--red)', color: 'var(--red)' },
};

export default function ManagerHomePage() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [evaluations, setEvaluations] = useState<EvalData[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkData[]>([]);
  const [scores, setScores] = useState<{ student_id: string; subject: string; score: number; max_score: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/students').then((r) => r.json()),
      fetch('/api/evaluations').then((r) => r.json()),
      fetch('/api/benchmarks').then((r) => r.json()),
      fetch('/api/scores').then((r) => r.json()).then((d) => d.scores || d || []),
    ]).then(([s, e, b, sc]) => {
      setStudents(s); setEvaluations(e); setBenchmarks(b); setScores(sc);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // 퇴사자 제외
  const activeStudents = students.filter((s) => !s.is_dropped);
  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const studentEvals = evaluations.filter((e) => e.student_id === selectedStudentId).sort((a, b) => a.week_number - b.week_number);
  const studentBMs = benchmarks.filter((b) => b.student_id === selectedStudentId);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', minHeight: 400 }}><p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p></div>;

  void router;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.025em', lineHeight: 1.1 }}>홈</h1>

      {!selectedStudentId ? (
        /* ===== 전체 목록 — SummaryCard 그리드 ===== */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {activeStudents.map((st) => {
            const stEvals = evaluations.filter((e) => e.student_id === st.id);
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

            const headerLeft = (
              <span style={{
                padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                background: st.store_location ? 'var(--blue-dim)' : 'var(--bg-hover)',
                color: st.store_location ? 'var(--blue)' : 'var(--text-tertiary)',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              }}>{st.store_location || '매장 미배정'}</span>
            );

            const bodyExtra = (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>심화교육 R&amp;P 주차별 평가</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                    {[1, 2, 3, 4, 5, 6].map((w) => {
                      const ev = stEvals.find((e) => e.week_number === w);
                      const bg = !ev ? 'var(--bg-hover)'
                        : ev.status === 'completed' ? 'var(--green)'
                        : 'var(--orange)';
                      const label = !ev ? '미진행' : ev.status === 'completed' ? '완료' : '일부';
                      return <div key={w} title={`${w}주차 · ${label}`} style={{ height: 6, borderRadius: 'var(--radius-xs)', background: bg }} />;
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>벤치마킹 주차별 작성</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                    {[1, 2, 3, 4, 5, 6].map((w) => {
                      const bm = benchmarks.find((b) => b.student_id === st.id && b.week_number === w);
                      return <div key={w} title={`${w}주차 · ${bm ? '작성' : '미작성'}`} style={{ height: 6, borderRadius: 'var(--radius-xs)', background: bm ? 'var(--purple)' : 'var(--bg-hover)' }} />;
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
                onClick={() => setSelectedStudentId(st.id)}
                bodyExtra={bodyExtra}
                footerSignals={signals}
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

          {/* 심화교육 시험 점수 (재시험 횟수 추적) */}
          <SectionBox title="심화교육 시험 점수">
            <AdvancedScoreSection
              studentId={selectedStudentId}
              studentName={selectedStudent?.name ?? ''}
            />
          </SectionBox>

          {/* 주차별 성장 기록 */}
          <SectionBox title="주차별 성장 기록" subtitle="6주간 관리자 피드백을 따라 어떻게 성장했는지 볼 수 있어요">
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
                        {s.value}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 3 }}>{s.unit}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 6 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ position: 'relative', paddingLeft: 28 }}>
              <div style={{ position: 'absolute', left: 10, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />
              {[1, 2, 3, 4, 5, 6].map((w) => {
                const ev = studentEvals.find((e) => e.week_number === w);
                const prev = studentEvals.find((e) => e.week_number === w - 1);
                const resolved = prev && ev && ev.status !== 'not_started'
                  ? prev.improvement_tags.filter((t) => !ev.improvement_tags.includes(t))
                  : [];
                return (
                  <div key={w} style={{ position: 'relative', marginBottom: 16 }}>
                    <div style={{ position: 'absolute', left: -23, top: 18, width: 14, height: 14, borderRadius: '50%', background: ev ? 'var(--green)' : 'var(--bg-hover)', border: '2px solid var(--bg-main)' }} />
                    <div style={{
                      padding: 20, borderRadius: 'var(--radius-md)',
                      background: ev ? 'var(--bg-main)' : 'transparent',
                      border: ev ? 'none' : '1px dashed var(--border)',
                      opacity: ev ? 1 : 0.4,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: ev ? 12 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 16, fontWeight: 600, color: ev ? 'var(--text-primary)' : 'var(--text-muted)', letterSpacing: '-0.01em' }}>{w}주차</span>
                          {ev?.rp_area && <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue)', fontSize: 12, fontWeight: 600 }}>{ev.rp_area}</span>}
                        </div>
                        {ev ? (
                          <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: ev.status === 'completed' ? 'var(--green-dim)' : 'var(--orange-dim)', color: ev.status === 'completed' ? 'var(--green)' : 'var(--orange)' }}>
                            {ev.status === 'completed' ? '완료' : ev.status === 'partial' ? '일부' : '미진행'}
                          </span>
                        ) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>미작성</span>}
                      </div>
                      {ev && (
                        <>
                          {resolved.length > 0 && (
                            <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 12, background: 'var(--green-dim)' }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', marginRight: 8 }}>지난주 대비 해결됨:</span>
                              {resolved.map((t) => <span key={t} style={{ fontSize: 12, color: 'var(--green)', marginRight: 8 }}>{t}</span>)}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                            {ev.strength_tags.map((t) => <span key={`s-${t}`} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--green-dim)', color: 'var(--green)', fontSize: 12, fontWeight: 600 }}>{t}</span>)}
                            {ev.improvement_tags.map((t) => <span key={`i-${t}`} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--orange-dim)', color: 'var(--orange)', fontSize: 12, fontWeight: 600 }}>{t}</span>)}
                          </div>
                          {ev.comment && (
                            <div style={{ padding: '14px 18px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
                              <p style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.75, margin: 0 }}>{ev.comment}</p>
                            </div>
                          )}
                          {ev.managers && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>— {ev.managers.name} ({ev.managers.store_name})</p>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionBox>

          {/* 차트 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 24 }}>
            <SectionBox title="종합 역량" subtitle="모든 주차 평가를 종합한 역량 분포예요">
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={evalToRadar(studentEvals)}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--text-second)', fontSize: 13 }} />
                    <Radar dataKey="score" stroke="#007AFF" fill="#007AFF" fillOpacity={0.25} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </SectionBox>
            <SectionBox title="주차별 변화" subtitle="강점이 늘고 개선점이 줄면 성장하고 있다는 뜻이에요">
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
            </SectionBox>
          </div>

          {/* 벤치마킹 — 타임라인 구조 */}
          <SectionBox title="벤치마킹 기록" subtitle="교육생이 직접 작성한 우수 직원 벤치마킹 기록이에요">
            {studentBMs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>아직 교육생이 작성한 벤치마킹 기록이 없어요</p>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 28 }}>
                <div style={{ position: 'absolute', left: 10, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />
                {[...studentBMs].sort((a, b) => a.week_number - b.week_number).map((bm) => (
                  <div key={bm.week_number} style={{ position: 'relative', marginBottom: 16 }}>
                    <div style={{ position: 'absolute', left: -23, top: 18, width: 14, height: 14, borderRadius: '50%', background: 'var(--purple)', border: '2px solid var(--bg-main)' }} />
                    <div style={{ padding: 20, borderRadius: 'var(--radius-md)', background: 'var(--bg-main)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{bm.week_number}주차</span>
                        <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--purple-dim)', color: 'var(--purple)', fontSize: 12, fontWeight: 600 }}>{bm.target_name}</span>
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
          </SectionBox>
        </div>
      )}
    </div>
  );
}

/* ── 공용 Section 박스 (overview와 동일 규격) ── */
function SectionBox({ title, subtitle, badge, children }: { title: string; subtitle?: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: subtitle ? 6 : 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.015em', lineHeight: 1.3 }}>{title}</h3>
        {badge && (
          <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>{badge}</span>
        )}
      </div>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 16px' }}>{subtitle}</p>}
      {children}
    </div>
  );
}

