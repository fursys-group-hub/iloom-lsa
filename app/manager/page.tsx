'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

interface StudentItem { id: string; name: string; store_location: string | null; }
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

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const studentEvals = evaluations.filter((e) => e.student_id === selectedStudentId).sort((a, b) => a.week_number - b.week_number);
  const studentBMs = benchmarks.filter((b) => b.student_id === selectedStudentId);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', minHeight: 400 }}><p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p></div>;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 24px' }}>홈</h1>

      {/* 교육생 선택 */}
      <div style={{ marginBottom: 24 }}>
        <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}
          style={{ width: '100%', maxWidth: 360, padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 15, outline: 'none' }}>
          <option value="">교육생을 선택하세요</option>
          {students.map((s) => {
            const cnt = evaluations.filter((e) => e.student_id === s.id).length;
            return <option key={s.id} value={s.id}>{s.name} ({s.store_location || '미배정'}) — {cnt}주 평가</option>;
          })}
        </select>
      </div>

      {!selectedStudentId ? (
        /* 전체 교육생 카드 */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {students.map((st) => {
            const stEvals = evaluations.filter((e) => e.student_id === st.id);
            const rpAreas = rpAreaSummary(stEvals);
            return (
              <div key={st.id} onClick={() => setSelectedStudentId(st.id)}
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--blue)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>{st.name}</span>
                  <span style={{ fontSize: 13, color: 'var(--blue-light)' }}>{st.store_location}</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px' }}>{stEvals.length}/6주 평가 완료</p>
                {rpAreas.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {rpAreas.map((rp) => {
                      const cfg = LEVEL_CONFIG[rp.level];
                      return <span key={rp.area} style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: cfg.bg, color: cfg.color }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, display: 'inline-block', marginRight: 4 }} />{rp.area}</span>;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* 교육생 상세 — 성장 추이 */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <button onClick={() => setSelectedStudentId('')}
            style={{ alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 13, cursor: 'pointer' }}>
            ← 전체 목록
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>👤</div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{selectedStudent?.name}</h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>{selectedStudent?.store_location} · {studentEvals.length}주차 평가 완료</p>
            </div>
          </div>

          {/* 시험 점수 */}
          {(() => {
            const studentScores = scores.filter((s) => s.student_id === selectedStudentId);
            const hasScores = studentScores.length > 0;
            return (
              <div style={{ background: 'var(--bg-surface)', border: hasScores ? '1px solid var(--border)' : '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>심화교육 시험 점수</h3>
                  {!hasScores && <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 11 }}>연동 예정</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                  {[1, 2, 3, 4, 5, 6].map((w) => {
                    const sc = studentScores.find((s) => s.subject === `${w}주차`);
                    return (
                      <div key={w} style={{ padding: '12px 0', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', textAlign: 'center', opacity: sc ? 1 : 0.5 }}>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>{w}주차</p>
                        <p style={{
                          fontSize: 20, fontWeight: 700, margin: 0,
                          color: sc ? (sc.score >= 80 ? 'var(--green)' : sc.score >= 60 ? 'var(--orange)' : 'var(--red)') : 'var(--text-muted)',
                        }}>
                          {sc ? sc.score : '—'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* R&P 영역별 */}
          {studentEvals.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>R&P 영역별 상담 역량</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {rpAreaSummary(studentEvals).map((rp) => {
                  const cfg = LEVEL_CONFIG[rp.level];
                  return (
                    <div key={rp.area} style={{ padding: 18, borderRadius: 'var(--radius-md)', background: cfg.bg, border: `1px solid ${cfg.border}30` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 16, fontWeight: 700 }}>{rp.area}</span>
                        <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: cfg.border, color: '#fff', fontSize: 12, fontWeight: 700 }}>{cfg.label}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>{rp.weeks.map((w) => `${w}주차`).join(', ')}</p>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {rp.topStrengths.map((t) => <span key={t} style={{ padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--green-dim)', color: 'var(--green)', fontSize: 11, fontWeight: 600 }}>{t}</span>)}
                        {rp.topImprovements.map((t) => <span key={t} style={{ padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--orange-dim)', color: 'var(--orange)', fontSize: 11, fontWeight: 600 }}>{t}</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 주차별 타임라인 */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>주차별 평가 기록</h3>
            <div style={{ position: 'relative', paddingLeft: 28 }}>
              <div style={{ position: 'absolute', left: 10, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />
              {[1, 2, 3, 4, 5, 6].map((w) => {
                const ev = studentEvals.find((e) => e.week_number === w);
                const prev = studentEvals.find((e) => e.week_number === w - 1);
                const resolved = prev && ev ? prev.improvement_tags.filter((t) => !ev.improvement_tags.includes(t)) : [];
                return (
                  <div key={w} style={{ position: 'relative', marginBottom: 16 }}>
                    <div style={{ position: 'absolute', left: -23, top: 18, width: 14, height: 14, borderRadius: '50%', background: ev ? 'var(--green)' : 'var(--bg-hover)', border: '2px solid var(--bg-main)' }} />
                    <div style={{ padding: 20, borderRadius: 'var(--radius-md)', background: ev ? 'var(--bg-elevated)' : 'transparent', border: ev ? '1px solid var(--border)' : '1px dashed var(--border)', opacity: ev ? 1 : 0.4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: ev ? 12 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 16, fontWeight: 800 }}>{w}주차</span>
                          {ev?.rp_area && <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 13, fontWeight: 600 }}>{ev.rp_area}</span>}
                        </div>
                        {ev ? (
                          <span style={{ padding: '4px 12px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: ev.status === 'completed' ? 'var(--green-dim)' : 'var(--orange-dim)', color: ev.status === 'completed' ? 'var(--green)' : 'var(--orange)' }}>
                            {ev.status === 'completed' ? '완료' : ev.status === 'partial' ? '일부' : '미진행'}
                          </span>
                        ) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>미작성</span>}
                      </div>
                      {ev && (
                        <>
                          {resolved.length > 0 && (
                            <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 12, background: 'var(--green-dim)', border: '1px solid var(--green-dim)' }}>
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
          </div>

          {/* 차트 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>종합 역량</h3>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={evalToRadar(studentEvals)}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--text-second)', fontSize: 13 }} />
                    <Radar dataKey="score" stroke="#007AFF" fill="#007AFF" fillOpacity={0.25} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>주차별 변화</h3>
              <div style={{ height: 280 }}>
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
            </div>
          </div>

          {/* 벤치마킹 */}
          {studentBMs.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>벤치마킹 기록</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {studentBMs.map((bm) => (
                  <div key={bm.week_number} style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700 }}>{bm.week_number}주차</span>
                      <span style={{ fontSize: 13, color: 'var(--blue-light)' }}>👤 {bm.target_name}</span>
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, margin: 0 }}>{bm.learnings}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
