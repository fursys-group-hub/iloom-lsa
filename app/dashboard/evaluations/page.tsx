'use client';

import { useState, useEffect } from 'react';

interface StudentItem {
  id: string;
  name: string;
  store_location: string | null;
}

interface EvalData {
  id: string;
  student_id: string;
  week_number: number;
  rp_area: string | null;
  status: string;
  strength_tags: string[];
  improvement_tags: string[];
  comment: string | null;
  created_at: string;
  updated_at: string;
  students: { id: string; name: string; store_location: string | null };
  managers: { name: string; store_name: string } | null;
}

export default function AdminEvaluationsPage() {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [evaluations, setEvaluations] = useState<EvalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'student'>('table');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [filterStore, setFilterStore] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [studentsRes, evalsRes] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/evaluations'),
      ]);
      setStudents(await studentsRes.json());
      setEvaluations(await evalsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const stores = [...new Set(students.map((s) => s.store_location).filter(Boolean))] as string[];
  const filteredStudents = filterStore
    ? students.filter((s) => s.store_location === filterStore)
    : students;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>불러오는 중...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>매장 교육 평가 현황</h1>
          <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>
            매장 관리자들이 작성한 주차별 교육생 평가를 종합적으로 확인합니다
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setViewMode('table')} style={tabBtnStyle(viewMode === 'table')}>전체 현황</button>
          <button onClick={() => setViewMode('student')} style={tabBtnStyle(viewMode === 'student')}>교육생별</button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <SummaryCard label="전체 교육생" value={students.length} unit="명" color="var(--blue)" />
        <SummaryCard label="평가 건수" value={evaluations.length} unit="건" color="var(--green)" />
        <SummaryCard label="평가 완료율" value={students.length ? Math.round((new Set(evaluations.map((e) => e.student_id)).size / students.length) * 100) : 0} unit="%" color="var(--purple)" />
        <SummaryCard label="매장" value={stores.length} unit="개" color="var(--orange)" />
      </div>

      {/* 매장 필터 */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setFilterStore('')} style={filterBtnStyle(!filterStore)}>전체</button>
        {stores.map((store) => (
          <button key={store} onClick={() => setFilterStore(store)} style={filterBtnStyle(filterStore === store)}>
            {store}
          </button>
        ))}
      </div>

      {viewMode === 'table' ? (
        /* ===== 전체 현황: 매트릭스 뷰 ===== */
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', overflow: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <Th>교육생</Th>
                <Th>매장</Th>
                {[1, 2, 3, 4, 5, 6].map((w) => <Th key={w} align="center">{w}주차</Th>)}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((st) => {
                const studentEvals = evaluations.filter((e) => e.student_id === st.id);
                return (
                  <tr key={st.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <Td>
                      <button
                        onClick={() => { setSelectedStudentId(st.id); setViewMode('student'); }}
                        style={{ background: 'none', border: 'none', color: 'var(--blue-light)', fontWeight: 600, fontSize: 15, cursor: 'pointer', padding: 0 }}
                      >
                        {st.name}
                      </button>
                    </Td>
                    <Td>
                      <span style={{
                        padding: '3px 8px', borderRadius: 'var(--radius-pill)',
                        background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 12, fontWeight: 500,
                      }}>
                        {st.store_location || '-'}
                      </span>
                    </Td>
                    {[1, 2, 3, 4, 5, 6].map((w) => {
                      const ev = studentEvals.find((e) => e.week_number === w);
                      return (
                        <Td key={w} align="center">
                          {ev ? (
                            <span style={{
                              display: 'inline-block', width: 28, height: 28,
                              borderRadius: '50%', lineHeight: '28px', textAlign: 'center', fontSize: 13,
                              background: ev.status === 'completed' ? 'rgba(48,209,88,0.15)' : 'rgba(255,159,10,0.15)',
                              color: ev.status === 'completed' ? 'var(--green)' : 'var(--orange)',
                            }} title={ev.rp_area || ''}>
                              {ev.status === 'completed' ? '✓' : '△'}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>-</span>
                          )}
                        </Td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ===== 교육생별 상세 뷰 ===== */
        <div>
          <div style={{ marginBottom: 20 }}>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              style={{
                padding: '12px 16px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: 15, outline: 'none', minWidth: 280,
              }}
            >
              <option value="">교육생을 선택하세요</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.store_location || '미배정'})</option>
              ))}
            </select>
          </div>

          {selectedStudentId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[1, 2, 3, 4, 5, 6].map((w) => {
                const ev = evaluations.find(
                  (e) => e.student_id === selectedStudentId && e.week_number === w
                );
                const student = students.find((s) => s.id === selectedStudentId);
                return (
                  <div key={w} style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', padding: 24,
                    opacity: ev ? 1 : 0.5,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: ev ? 16 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 17, fontWeight: 700 }}>{w}주차</span>
                        {ev?.rp_area && (
                          <span style={{
                            padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                            background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 13,
                          }}>
                            {ev.rp_area}
                          </span>
                        )}
                      </div>
                      {ev ? (
                        <span style={{
                          padding: '4px 12px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
                          background: ev.status === 'completed' ? 'rgba(48,209,88,0.15)' : 'rgba(255,159,10,0.15)',
                          color: ev.status === 'completed' ? 'var(--green)' : 'var(--orange)',
                        }}>
                          {ev.status === 'completed' ? '완료' : ev.status === 'partial' ? '일부 진행' : '미진행'}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>평가 미작성</span>
                      )}
                    </div>

                    {ev && (
                      <>
                        {ev.strength_tags.length > 0 && (
                          <div style={{ marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {ev.strength_tags.map((tag) => (
                              <span key={tag} style={{
                                padding: '4px 10px', borderRadius: 'var(--radius-pill)',
                                background: 'rgba(48,209,88,0.12)', color: 'var(--green)', fontSize: 12, fontWeight: 500,
                              }}>
                                + {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {ev.improvement_tags.length > 0 && (
                          <div style={{ marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {ev.improvement_tags.map((tag) => (
                              <span key={tag} style={{
                                padding: '4px 10px', borderRadius: 'var(--radius-pill)',
                                background: 'rgba(255,159,10,0.12)', color: 'var(--orange)', fontSize: 12, fontWeight: 500,
                              }}>
                                - {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {ev.comment && (
                          <p style={{
                            fontSize: 14, color: 'var(--text-second)', lineHeight: 1.7,
                            margin: '12px 0 0', padding: '12px 16px',
                            background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
                          }}>
                            {ev.comment}
                          </p>
                        )}
                        {ev.managers && (
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                            작성: {ev.managers.name} ({ev.managers.store_name}) · {new Date(ev.updated_at).toLocaleDateString('ko-KR')}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 60, textAlign: 'center',
            }}>
              <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>교육생을 선택하면 주차별 상세 평가를 볼 수 있어요</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: '20px 24px',
    }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color, margin: 0 }}>
        {value}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span>
      </p>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: string }) {
  return (
    <th style={{
      padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
      textAlign: (align as 'left' | 'center') || 'left', background: 'var(--bg-elevated)',
    }}>
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: string }) {
  return (
    <td style={{
      padding: '12px 16px', fontSize: 15, color: 'var(--text-primary)',
      textAlign: (align as 'left' | 'center') || 'left',
    }}>
      {children}
    </td>
  );
}

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 18px', borderRadius: 'var(--radius-pill)',
    border: active ? '2px solid var(--blue)' : '1px solid var(--border)',
    background: active ? 'var(--blue-dim)' : 'transparent',
    color: active ? 'var(--blue-light)' : 'var(--text-tertiary)',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  };
}

function filterBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 14px', borderRadius: 'var(--radius-pill)',
    border: active ? '1px solid var(--blue)' : '1px solid var(--border)',
    background: active ? 'var(--blue-dim)' : 'transparent',
    color: active ? 'var(--blue-light)' : 'var(--text-tertiary)',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
  };
}
