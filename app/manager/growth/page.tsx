'use client';

import { useState, useEffect } from 'react';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

interface StudentItem { id: string; name: string; store_location: string | null; }
interface EvalData {
  student_id: string; week_number: number; rp_area: string | null;
  status: string; strength_tags: string[]; improvement_tags: string[]; comment: string | null;
}
interface BenchmarkData {
  student_id: string; week_number: number; target_name: string;
  learnings: string; action_plan: string | null;
  students: { name: string };
}

const DIMENSIONS = ['제품 지식', '고객 응대', '상담 자신감', '주문 정확도', 'SCT 활용', '업셀링'];

function evalToRadar(evals: EvalData[]) {
  const strengthMap: Record<string, string> = {
    '제품 지식 풍부': '제품 지식', '고객 라포형성 우수': '고객 응대', '고객 니즈 파악 우수': '고객 응대',
    '자신감 있는 상담': '상담 자신감', '차분하고 친절한 응대': '상담 자신감',
    '주문서 작성 정확': '주문 정확도', 'SCT 활용 능숙': 'SCT 활용',
    '업셀링 적극적': '업셀링', '빠르고 정확한 상담': '상담 자신감', '자가 학습 의지 높음': '제품 지식',
  };
  const impMap: Record<string, string> = {
    '제품 디테일 미흡': '제품 지식', '소재/컬러 미숙지': '제품 지식', '옵션/액세서리 미숙지': '제품 지식',
    '사이즈 숙지 필요': '제품 지식', '자신감 부족': '상담 자신감', '상담 흐름 개선 필요': '상담 자신감',
    '주문서 작성 누락': '주문 정확도', '프로모션 등록 누락': '주문 정확도',
    'SCT 활용 미숙': 'SCT 활용', '업셀링 보완 필요': '업셀링',
  };

  const scores: Record<string, number> = {};
  DIMENSIONS.forEach((d) => { scores[d] = 50; });

  for (const ev of evals) {
    for (const tag of ev.strength_tags) {
      const dim = strengthMap[tag];
      if (dim) scores[dim] = Math.min(100, scores[dim] + 10);
    }
    for (const tag of ev.improvement_tags) {
      const dim = impMap[tag];
      if (dim) scores[dim] = Math.max(0, scores[dim] - 8);
    }
  }

  return DIMENSIONS.map((d) => ({ dimension: d, score: scores[d] }));
}

function weeklyGrowthData(evals: EvalData[]) {
  return Array.from({ length: 6 }, (_, i) => {
    const w = i + 1;
    const ev = evals.find((e) => e.week_number === w);
    return {
      week: `${w}주차`,
      강점: ev?.strength_tags.length || 0,
      개선점: ev?.improvement_tags.length || 0,
    };
  });
}

export default function GrowthPage() {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [evaluations, setEvaluations] = useState<EvalData[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/students').then((r) => r.json()),
      fetch('/api/evaluations').then((r) => r.json()),
      fetch('/api/benchmarks').then((r) => r.json()),
    ]).then(([s, e, b]) => {
      setStudents(s); setEvaluations(e); setBenchmarks(b);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const studentEvals = evaluations.filter((e) => e.student_id === selectedStudentId);
  const studentBMs = benchmarks.filter((b) => b.student_id === selectedStudentId);
  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', minHeight: 400 }}><p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p></div>;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>성장 추이</h1>
        <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>교육생의 주차별 성장 과정을 확인하세요</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}
          style={{
            padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 15, outline: 'none', minWidth: 280,
          }}>
          <option value="">교육생을 선택하세요</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.store_location || '미배정'})</option>)}
        </select>
      </div>

      {!selectedStudentId ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 60, textAlign: 'center' }}>
          <p style={{ fontSize: 40, margin: '0 0 16px' }}></p>
          <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>교육생을 선택하면 성장 차트를 볼 수 있어요</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 역량 레이더 차트 */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
              {selectedStudent?.name}님의 역량 레이더
            </h2>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={evalToRadar(studentEvals)}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--text-second)', fontSize: 13 }} />
                  <Radar dataKey="score" stroke="#007AFF" fill="#007AFF" fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 주차별 강점/개선점 추이 */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>주차별 강점 / 개선점 변화</h2>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyGrowthData(studentEvals)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fill: 'var(--text-muted)', fontSize: 13 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 13 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Bar dataKey="강점" fill="#30D158" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="개선점" fill="#FF9F0A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>
              강점이 늘고 개선점이 줄어들면 성장하고 있다는 뜻이에요
            </p>
          </div>

          {/* 주차별 개선점 변화 트래킹 */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>개선점 변화 추적</h2>
            {studentEvals.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>아직 평가 데이터가 없어요</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {studentEvals.sort((a, b) => a.week_number - b.week_number).map((ev, idx) => {
                  const prevEv = idx > 0 ? studentEvals[idx - 1] : null;
                  const resolved = prevEv ? prevEv.improvement_tags.filter((t) => !ev.improvement_tags.includes(t)) : [];
                  const newIssues = prevEv ? ev.improvement_tags.filter((t) => !prevEv.improvement_tags.includes(t)) : ev.improvement_tags;

                  return (
                    <div key={ev.week_number} style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{ev.week_number}주차</span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 8 }}>{ev.rp_area}</span>
                      {resolved.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {resolved.map((t) => (
                            <span key={t} style={{ padding: '3px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--green-dim)', color: 'var(--green)', fontSize: 12 }}>
                              ✓ {t} 해결
                            </span>
                          ))}
                        </div>
                      )}
                      {newIssues.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {newIssues.map((t) => (
                            <span key={t} style={{ padding: '3px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--orange-dim)', color: 'var(--orange)', fontSize: 12 }}>
                              {idx === 0 ? '' : '+ '}{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 벤치마킹 기록 (교육생이 작성한 것) */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>벤치마킹 기록</h2>
            {studentBMs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>아직 교육생이 작성한 벤치마킹이 없어요</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {studentBMs.map((bm) => (
                  <div key={bm.week_number} style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{bm.week_number}주차</span>
                      <span style={{ fontSize: 13, color: 'var(--blue-light)' }}>
                        대상: {bm.target_name}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, margin: '0 0 6px' }}>{bm.learnings}</p>
                    {bm.action_plan && (
                      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, fontStyle: 'italic' }}>
                        실천 계획: {bm.action_plan}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
