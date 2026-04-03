'use client';

import { useState, useEffect } from 'react';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

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
  good:   { label: '잘함',     emoji: '🟢', bg: 'var(--green-dim)',  border: 'var(--green)',  color: 'var(--green)' },
  normal: { label: '보통',     emoji: '🟡', bg: 'var(--orange-dim)', border: 'var(--orange)', color: 'var(--orange)' },
  weak:   { label: '보완 필요', emoji: '🔴', bg: 'var(--red-dim)',  border: 'var(--red)',    color: 'var(--red)' },
};

/* ── 메인 ── */
export default function OverviewPage() {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [evaluations, setEvaluations] = useState<EvalData[]>([]);
  const [finals, setFinals] = useState<FinalEvalData[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkData[]>([]);
  const [scores, setScores] = useState<{ student_id: string; subject: string; score: number; max_score: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [filterStore, setFilterStore] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/students').then((r) => r.json()),
      fetch('/api/evaluations').then((r) => r.json()),
      fetch('/api/final-evaluations').then((r) => r.json()),
      fetch('/api/benchmarks').then((r) => r.json()),
      fetch('/api/scores').then((r) => r.json()).then((d) => d.scores || d || []),
    ]).then(([s, e, f, b, sc]) => {
      setStudents(s); setEvaluations(e); setFinals(f); setBenchmarks(b); setScores(sc);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

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
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>🏪 심화교육</h1>
      </div>

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 24 }}>
        <SumCard label="전체 교육생" value={activeStudents.length} unit="명" color="var(--blue)" />
        <SumCard label="주차 평가" value={evaluations.length} unit="건" color="var(--green)" />
        <SumCard label="총평 완료" value={new Set(finals.map((f) => f.student_id)).size} unit="명" color="var(--purple)" />
        <SumCard label="벤치마킹" value={benchmarks.length} unit="건" color="var(--orange)" />
      </div>

      {/* 매장 필터 + 교육생 선택 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={miniLabel}>매장</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <FilterBtn active={!filterStore} onClick={() => setFilterStore('')}>전체</FilterBtn>
            {stores.map((s) => <FilterBtn key={s} active={filterStore === s} onClick={() => setFilterStore(s)}>{s}</FilterBtn>)}
          </div>
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

      {!selectedStudentId ? (
        /* ===== 전체 목록 ===== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 매트릭스 */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <Th>교육생</Th><Th>매장</Th>
                  {[1, 2, 3, 4, 5, 6].map((w) => <Th key={w} align="center">{w}주차</Th>)}
                  <Th align="center">총평</Th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((st) => {
                  const stEvals = evaluations.filter((e) => e.student_id === st.id);
                  const stFinal = finals.find((f) => f.student_id === st.id);
                  return (
                    <tr key={st.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <Td>
                        <button onClick={() => setSelectedStudentId(st.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--blue-light)', fontWeight: 600, fontSize: 15, cursor: 'pointer', padding: 0 }}>
                          {st.name}
                        </button>
                      </Td>
                      <Td><StoreBadge>{st.store_location || '-'}</StoreBadge></Td>
                      {[1, 2, 3, 4, 5, 6].map((w) => {
                        const ev = stEvals.find((e) => e.week_number === w);
                        return (
                          <Td key={w} align="center">
                            {ev ? (
                              <span title={`${ev.rp_area || ''} — 강점 ${ev.strength_tags.length} / 개선 ${ev.improvement_tags.length}`}
                                style={{ display: 'inline-block', width: 28, height: 28, borderRadius: '50%', lineHeight: '28px', textAlign: 'center', fontSize: 13,
                                  background: ev.status === 'completed' ? 'var(--green-dim)' : 'var(--orange-dim)',
                                  color: ev.status === 'completed' ? 'var(--green)' : 'var(--orange)',
                                }}>{ev.status === 'completed' ? '✓' : '△'}</span>
                            ) : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>-</span>}
                          </Td>
                        );
                      })}
                      <Td align="center">
                        {stFinal ? (
                          <span style={{ fontSize: 13 }}>{Array.from({ length: stFinal.overall_rating }, () => '⭐').join('')}</span>
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>미작성</span>}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {filteredStudents.map((st) => {
              const stEvals = evaluations.filter((e) => e.student_id === st.id);
              const stFinal = finals.find((f) => f.student_id === st.id);
              const bmCount = benchmarks.filter((b) => b.student_id === st.id).length;
              const rpAreas = rpAreaSummary(stEvals);
              return (
                <div key={st.id} onClick={() => setSelectedStudentId(st.id)}
                  style={{
                    background: stFinal ? 'var(--bg-surface)' : 'var(--bg-surface)',
                    border: stFinal ? '1px solid var(--green)' : '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)', padding: 24, cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--blue)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontSize: 17, fontWeight: 700 }}>{st.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--blue-light)', marginLeft: 8 }}>{st.store_location}</span>
                    </div>
                    {stFinal && <span style={{ fontSize: 13 }}>{Array.from({ length: stFinal.overall_rating }, () => '⭐').join('')}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                    <MiniStat label="평가" value={`${stEvals.length}/6주`} color="var(--blue)" />
                    <MiniStat label="벤치마킹" value={`${bmCount}건`} color="var(--purple)" />
                    <MiniStat label="총평" value={stFinal ? '완료' : '미작성'} color={stFinal ? 'var(--green)' : 'var(--text-muted)'} />
                  </div>
                  {rpAreas.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {rpAreas.map((rp) => {
                        const cfg = LEVEL_CONFIG[rp.level];
                        return (
                          <span key={rp.area} style={{
                            padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
                            background: cfg.bg, color: cfg.color,
                          }}>{cfg.emoji} {rp.area}</span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ===== 교육생 상세 ===== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <button onClick={() => setSelectedStudentId('')}
            style={{ alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 13, cursor: 'pointer' }}>
            ← 전체 목록
          </button>

          {/* 이름 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>👤</div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{selectedStudent?.name}</h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>{selectedStudent?.store_location || '매장 미배정'} · {studentEvals.length}주차 평가 완료</p>
            </div>
          </div>

          {/* ① 시험 점수 */}
          {(() => {
            const studentScores = scores.filter((s) => s.student_id === selectedStudentId);
            const hasScores = studentScores.length > 0;
            return (
              <Section icon="📝" title="심화교육 시험 점수" badge={hasScores ? undefined : '연동 예정'} badgeColor="var(--text-muted)">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
                  {[1, 2, 3, 4, 5, 6].map((w) => {
                    const sc = studentScores.find((s) => s.subject === `${w}주차`);
                    return (
                      <div key={w} style={{ padding: 16, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', textAlign: 'center', opacity: sc ? 1 : 0.5 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>{w}주차</p>
                        <p style={{
                          fontSize: 24, fontWeight: 700, margin: 0,
                          color: sc ? (sc.score >= 80 ? 'var(--green)' : sc.score >= 60 ? 'var(--orange)' : 'var(--red)') : 'var(--text-muted)',
                        }}>
                          {sc ? sc.score : '—'}
                        </p>
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

          {/* ② R&P 영역별 — 잘함/보통/보완필요 카드 */}
          <Section icon="🏪" title="R&P 영역별 상담 역량" subtitle="각 영역에서 롤플레잉 후 관리자가 평가한 결과예요">
            {studentEvals.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>평가 데이터가 없어요</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {rpAreaSummary(studentEvals).map((rp) => {
                  const cfg = LEVEL_CONFIG[rp.level];
                  return (
                    <div key={rp.area} style={{
                      padding: 20, borderRadius: 'var(--radius-md)',
                      background: cfg.bg, border: `1px solid ${cfg.border}30`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 17, fontWeight: 700 }}>{rp.area}</span>
                        <span style={{ padding: '4px 12px', borderRadius: 'var(--radius-pill)', background: cfg.border, color: '#fff', fontSize: 13, fontWeight: 700 }}>
                          {cfg.emoji} {cfg.label}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>
                        {rp.weeks.map((w) => `${w}주차`).join(', ')}에서 진행
                      </p>
                      {rp.topStrengths.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <p style={{ fontSize: 12, color: 'var(--green)', margin: '0 0 4px', fontWeight: 600 }}>잘하는 점</p>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {rp.topStrengths.map((t) => <TagPill key={t} type="strength">{t}</TagPill>)}
                          </div>
                        </div>
                      )}
                      {rp.topImprovements.length > 0 && (
                        <div>
                          <p style={{ fontSize: 12, color: 'var(--orange)', margin: '0 0 4px', fontWeight: 600 }}>보완할 점</p>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {rp.topImprovements.map((t) => <TagPill key={t} type="improvement">{t}</TagPill>)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ③ 주차별 평가 기록 (타임라인 + 해결됨 표시 포함) */}
          <Section icon="📋" title="주차별 평가 기록" subtitle="관리자가 매주 작성한 R&P 피드백이에요. 이전 주차의 개선점이 해결되면 ✅로 표시됩니다">
            <div style={{ position: 'relative', paddingLeft: 28 }}>
              {/* 타임라인 세로선 */}
              <div style={{ position: 'absolute', left: 10, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />

              {[1, 2, 3, 4, 5, 6].map((w) => {
                const ev = studentEvals.find((e) => e.week_number === w);
                const prev = studentEvals.find((e) => e.week_number === w - 1);
                const resolved = prev && ev ? prev.improvement_tags.filter((t) => !ev.improvement_tags.includes(t)) : [];

                return (
                  <div key={w} style={{ position: 'relative', marginBottom: 16 }}>
                    {/* 타임라인 점 */}
                    <div style={{
                      position: 'absolute', left: -23, top: 18, width: 14, height: 14, borderRadius: '50%',
                      background: ev ? 'var(--green)' : 'var(--bg-hover)', border: '2px solid var(--bg-main)',
                    }} />

                    <div style={{
                      padding: 20, borderRadius: 'var(--radius-md)',
                      background: ev ? 'var(--bg-surface)' : 'transparent',
                      border: ev ? '1px solid var(--border)' : '1px dashed var(--border)',
                      opacity: ev ? 1 : 0.4,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: ev ? 12 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: ev ? 'var(--text-primary)' : 'var(--text-muted)' }}>{w}주차</span>
                          {ev?.rp_area && (
                            <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 13, fontWeight: 600 }}>
                              {ev.rp_area}
                            </span>
                          )}
                        </div>
                        {ev ? (
                          <span style={{
                            padding: '4px 12px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
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
                                <span key={t} style={{ fontSize: 12, color: 'var(--green)', marginRight: 8 }}>✅ {t}</span>
                              ))}
                            </div>
                          )}

                          {/* 강점/개선점 태그 */}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                            {ev.strength_tags.map((t) => <TagPill key={`s-${t}`} type="strength">👍 {t}</TagPill>)}
                            {ev.improvement_tags.map((t) => <TagPill key={`i-${t}`} type="improvement">📌 {t}</TagPill>)}
                          </div>

                          {/* 코멘트 */}
                          {ev.comment && (
                            <div style={{
                              padding: '14px 18px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
                            }}>
                              <p style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.75, margin: 0 }}>
                                {ev.comment}
                              </p>
                            </div>
                          )}

                          {ev.managers && (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                              — {ev.managers.name} ({ev.managers.store_name}){ev.updated_at && ` · ${new Date(ev.updated_at).toLocaleDateString('ko-KR')}`}
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
            <Section icon="🕸️" title="종합 역량" subtitle="모든 주차 평가를 종합한 역량 분포예요">
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

            <Section icon="📊" title="주차별 변화" subtitle="강점이 늘고 개선점이 줄면 성장하고 있다는 뜻이에요">
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Array.from({ length: 6 }, (_, i) => {
                    const ev = studentEvals.find((e) => e.week_number === i + 1);
                    return { week: `${i + 1}주차`, 강점: ev?.strength_tags.length || 0, 개선점: ev?.improvement_tags.length || 0 };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="week" tick={{ fill: 'var(--text-muted)', fontSize: 13 }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 13 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="강점" fill="#30D158" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="개선점" fill="#FF9F0A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>

          {/* ⑤ 벤치마킹 */}
          <Section icon="🔍" title="벤치마킹 기록" subtitle="교육생이 직접 작성한 우수 직원 벤치마킹 기록이에요">
            {studentBMs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>아직 교육생이 작성한 벤치마킹 기록이 없어요</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {studentBMs.map((bm) => (
                  <div key={bm.week_number} style={{ padding: 20, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{bm.week_number}주차</span>
                      <span style={{ fontSize: 14, color: 'var(--blue-light)', fontWeight: 600 }}>👤 {bm.target_name}</span>
                    </div>
                    <p style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.7, margin: 0 }}>{bm.learnings}</p>
                    {bm.action_plan && (
                      <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
                        <p style={{ fontSize: 13, color: 'var(--purple)', margin: 0, fontWeight: 600 }}>💡 실천 계획</p>
                        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>{bm.action_plan}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ⑥ 교육 총평 — 가장 크고 눈에 띄게 */}
          {studentFinals.length > 0 ? (
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,122,255,0.08), rgba(191,90,242,0.08))',
              border: '2px solid var(--blue)', borderRadius: 'var(--radius-lg)', padding: 32,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <span style={{ fontSize: 32 }}>🎓</span>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>교육 총평</h2>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>6주간의 심화교육을 마친 종합 평가예요</p>
                </div>
              </div>

              {studentFinals.map((fe, idx) => (
                <div key={idx}>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 20, alignItems: 'center' }}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} style={{ fontSize: 28, opacity: i < fe.overall_rating ? 1 : 0.2 }}>⭐</span>
                    ))}
                    <span style={{ fontSize: 16, color: 'var(--text-muted)', marginLeft: 12 }}>
                      {['', '많이 부족', '부족', '보통', '우수', '매우 우수'][fe.overall_rating]}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                    <ScoreCard label="매장 적응" score={fe.store_fit_score} color="var(--blue)" />
                    <ScoreCard label="독립 업무" score={fe.independence_score} color="var(--green)" />
                    <ScoreCard label="고객 응대" score={fe.customer_score} color="var(--purple)" />
                    <ScoreCard label="제품 지식" score={fe.product_score} color="var(--orange)" />
                  </div>

                  <div style={{ padding: 20, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
                    <p style={{ fontSize: 17, lineHeight: 1.8, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>
                      {fe.summary}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    {fe.strengths && (
                      <div style={{ padding: 20, background: 'var(--green-dim)', borderRadius: 'var(--radius-md)' }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', margin: '0 0 8px' }}>💪 핵심 강점</p>
                        <p style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.6, margin: 0 }}>{fe.strengths}</p>
                      </div>
                    )}
                    {fe.areas_to_develop && (
                      <div style={{ padding: 20, background: 'var(--orange-dim)', borderRadius: 'var(--radius-md)' }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--orange)', margin: '0 0 8px' }}>🎯 발전 방향</p>
                        <p style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.6, margin: 0 }}>{fe.areas_to_develop}</p>
                      </div>
                    )}
                  </div>

                  {fe.recommended_position && (
                    <p style={{ fontSize: 15, color: 'var(--blue-light)', fontWeight: 700 }}>📍 추천 배치: {fe.recommended_position}</p>
                  )}
                  {fe.managers && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>작성: {fe.managers.name} ({fe.managers.store_name})</p>}
                </div>
              ))}
            </div>
          ) : (
            <Section icon="🎓" title="교육 총평" badge="미작성" badgeColor="var(--text-muted)">
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
function Section({ icon, title, subtitle, badge, badgeColor, children }: {
  icon: string; title: string; subtitle?: string; badge?: string; badgeColor?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: subtitle ? 6 : 16 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h2>
        {badge && (
          <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--bg-elevated)', color: badgeColor || 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
            {badge}
          </span>
        )}
      </div>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', paddingLeft: 30 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function SumCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px 24px' }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color, margin: 0 }}>{value}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span></p>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 15, fontWeight: 700, color, margin: 0 }}>{value}</p>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{label}</p>
    </div>
  );
}

function ScoreCard({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 14, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
      <p style={{ fontSize: 26, fontWeight: 800, color, margin: '0 0 4px' }}>{score}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>/5</span></p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{label}</p>
      <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => <div key={n} style={{ width: 18, height: 5, borderRadius: 2, background: n <= score ? color : 'var(--bg-hover)' }} />)}
      </div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: string }) {
  return <th style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textAlign: (align as 'left' | 'center') || 'left', background: 'var(--bg-elevated)' }}>{children}</th>;
}
function Td({ children, align }: { children: React.ReactNode; align?: string }) {
  return <td style={{ padding: '12px 16px', fontSize: 15, color: 'var(--text-primary)', textAlign: (align as 'left' | 'center') || 'left' }}>{children}</td>;
}
function StoreBadge({ children }: { children: React.ReactNode }) {
  return <span style={{ padding: '3px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 12, fontWeight: 500 }}>{children}</span>;
}
function TagPill({ children, type }: { children: React.ReactNode; type: 'strength' | 'improvement' }) {
  const c = type === 'strength' ? { bg: 'var(--green-dim)', color: 'var(--green)' } : { bg: 'var(--orange-dim)', color: 'var(--orange)' };
  return <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: c.bg, color: c.color, fontSize: 12, fontWeight: 600 }}>{children}</span>;
}
function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ padding: '6px 14px', borderRadius: 'var(--radius-pill)', border: active ? '1px solid var(--blue)' : '1px solid var(--border)', background: active ? 'var(--blue-dim)' : 'transparent', color: active ? 'var(--blue-light)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{children}</button>;
}

const miniLabel: React.CSSProperties = { fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 };
const selectStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 15, outline: 'none' };
