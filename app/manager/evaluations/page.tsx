'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  STRENGTH_TAG_OPTIONS,
  IMPROVEMENT_TAG_OPTIONS,
  RP_AREA_OPTIONS,
} from '@/lib/types';

interface StudentItem {
  id: string;
  name: string;
  store_location: string | null;
}

interface EvalData {
  id?: string;
  student_id: string;
  week_number: number;
  rp_area: string | null;
  status: string;
  strength_tags: string[];
  improvement_tags: string[];
  comment: string | null;
  managers?: { name: string; store_name: string };
}

export default function EvaluationsPage() {
  const searchParams = useSearchParams();
  const preSelectedStudentId = searchParams.get('studentId');

  const [auth, setAuth] = useState<{ managerId: string; storeName: string; name: string } | null>(null);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [evaluations, setEvaluations] = useState<EvalData[]>([]);
  const [benchmarks, setBenchmarks] = useState<{ student_id: string; week_number: number; target_name: string; learnings: string; action_plan: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  // 선택 상태
  const [selectedStudentId, setSelectedStudentId] = useState(preSelectedStudentId || '');
  const [selectedWeek, setSelectedWeek] = useState(1);

  // 평가 폼
  const [rpArea, setRpArea] = useState('');
  const [status, setStatus] = useState('completed');
  const [strengthTags, setStrengthTags] = useState<string[]>([]);
  const [improvementTags, setImprovementTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem('iloom-auth');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    setAuth({ managerId: parsed.managerId, storeName: parsed.storeName, name: parsed.name });
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [studentsRes, evalsRes, bmRes] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/evaluations'),
        fetch('/api/benchmarks'),
      ]);
      setStudents(await studentsRes.json());
      setEvaluations(await evalsRes.json());
      setBenchmarks(await bmRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // 학생 + 주차 변경 시 기존 평가 로드
  const loadExistingEval = useCallback(() => {
    if (!selectedStudentId) return;
    const existing = evaluations.find(
      (e) => e.student_id === selectedStudentId && e.week_number === selectedWeek
    );
    if (existing) {
      setRpArea(existing.rp_area || '');
      setStatus(existing.status || 'completed');
      setStrengthTags(existing.strength_tags || []);
      setImprovementTags(existing.improvement_tags || []);
      setComment(existing.comment || '');
    } else {
      setRpArea('');
      setStatus('completed');
      setStrengthTags([]);
      setImprovementTags([]);
      setComment('');
    }
    setSaveMessage('');
  }, [selectedStudentId, selectedWeek, evaluations]);

  useEffect(() => { loadExistingEval(); }, [loadExistingEval]);

  function toggleTag(tag: string, current: string[], setter: (v: string[]) => void) {
    setter(current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]);
  }

  async function handleSave() {
    if (!selectedStudentId || !auth) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const res = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId,
          managerId: auth.managerId,
          weekNumber: selectedWeek,
          rpArea: rpArea || null,
          status,
          strengthTags,
          improvementTags,
          comment: comment || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setSaveMessage(`저장 실패: ${err.message}`);
      } else {
        setSaveMessage('저장 완료!');
        // refresh evaluations
        const evalsRes = await fetch('/api/evaluations');
        setEvaluations(await evalsRes.json());
      }
    } catch {
      setSaveMessage('서버 연결 실패');
    } finally {
      setSaving(false);
    }
  }

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const existingEval = evaluations.find(
    (e) => e.student_id === selectedStudentId && e.week_number === selectedWeek
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>불러오는 중...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>주차별 평가</h1>
        <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>
          교육생을 선택하고 주차별 R&P 피드백을 남겨주세요
        </p>
      </div>

      {/* 교육생 + 주차 선택 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px' }}>
          <label style={labelStyle}>교육생 선택</label>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            style={selectStyle}
          >
            <option value="">교육생을 선택하세요</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.store_location || '미배정'})</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '0 0 180px' }}>
          <label style={labelStyle}>교육 주차</label>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
            style={selectStyle}
          >
            {Array.from({ length: 6 }, (_, i) => i + 1).map((w) => {
              const hasEval = evaluations.some(
                (e) => e.student_id === selectedStudentId && e.week_number === w
              );
              return (
                <option key={w} value={w}>
                  {w}주차 {hasEval ? '(작성됨)' : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {!selectedStudentId ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 60, textAlign: 'center',
        }}>
          <p style={{ fontSize: 40, margin: '0 0 16px' }}>👆</p>
          <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>위에서 교육생을 선택해주세요</p>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 32,
        }}>
          {/* 교육생 정보 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', background: 'var(--blue-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>
              👤
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{selectedStudent?.name}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                {selectedStudent?.store_location || '매장 미배정'} · {selectedWeek}주차 평가
                {existingEval && <span style={{ color: 'var(--green)', marginLeft: 8 }}>수정 모드</span>}
              </p>
            </div>
          </div>

          {/* 진행여부 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>진행여부</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'completed', label: '완료', color: 'var(--green)' },
                { value: 'partial', label: '일부 진행', color: 'var(--orange)' },
                { value: 'not_completed', label: '미진행', color: 'var(--red)' },
              ].map((opt) => (
                <button key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  style={{
                    padding: '8px 18px', borderRadius: 'var(--radius-pill)',
                    border: status === opt.value ? `2px solid ${opt.color}` : '1px solid var(--border)',
                    background: status === opt.value ? `${opt.color}20` : 'transparent',
                    color: status === opt.value ? opt.color : 'var(--text-tertiary)',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* R&P 영역 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>R&P 영역</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {RP_AREA_OPTIONS.map((area) => (
                <button key={area}
                  onClick={() => setRpArea(rpArea === area ? '' : area)}
                  style={{
                    padding: '8px 16px', borderRadius: 'var(--radius-pill)',
                    border: rpArea === area ? '2px solid var(--blue)' : '1px solid var(--border)',
                    background: rpArea === area ? 'var(--blue-dim)' : 'transparent',
                    color: rpArea === area ? 'var(--blue-light)' : 'var(--text-tertiary)',
                    fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {area}
                </button>
              ))}
            </div>
          </div>

          {/* 강점 태그 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>
              강점 <span style={{ color: 'var(--green)', fontWeight: 400 }}>({strengthTags.length}개 선택)</span>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STRENGTH_TAG_OPTIONS.map((tag) => {
                const selected = strengthTags.includes(tag);
                return (
                  <button key={tag}
                    onClick={() => toggleTag(tag, strengthTags, setStrengthTags)}
                    style={{
                      padding: '8px 14px', borderRadius: 'var(--radius-pill)',
                      border: selected ? '2px solid var(--green)' : '1px solid var(--border)',
                      background: selected ? 'var(--green-dim)' : 'transparent',
                      color: selected ? 'var(--green)' : 'var(--text-tertiary)',
                      fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                  >
                    {selected ? '✓ ' : ''}{tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 개선점 태그 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>
              개선점 <span style={{ color: 'var(--orange)', fontWeight: 400 }}>({improvementTags.length}개 선택)</span>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {IMPROVEMENT_TAG_OPTIONS.map((tag) => {
                const selected = improvementTags.includes(tag);
                return (
                  <button key={tag}
                    onClick={() => toggleTag(tag, improvementTags, setImprovementTags)}
                    style={{
                      padding: '8px 14px', borderRadius: 'var(--radius-pill)',
                      border: selected ? '2px solid var(--orange)' : '1px solid var(--border)',
                      background: selected ? 'var(--orange-dim)' : 'transparent',
                      color: selected ? 'var(--orange)' : 'var(--text-tertiary)',
                      fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                  >
                    {selected ? '✓ ' : ''}{tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 자유 코멘트 */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>상세 피드백</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="예: 제품 디테일 숙지가 더 필요하며, 고객 응대에서는 자신감 있고 책임감 있게 끝까지 친절하게 상담하는 장점이 있음..."
              rows={4}
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.6,
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* 저장 / 삭제 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '14px 36px', borderRadius: 'var(--radius-md)',
                border: 'none', background: saving ? 'var(--border)' : 'var(--blue)',
                color: '#fff', fontSize: 16, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '저장 중...' : existingEval ? '평가 수정' : '평가 저장'}
            </button>
            {existingEval && (
              <button
                onClick={async () => {
                  if (!confirm(`${selectedWeek}주차 평가를 삭제할까요?`)) return;
                  const res = await fetch(`/api/evaluations?id=${existingEval.id}`, { method: 'DELETE' });
                  if (res.ok) {
                    setSaveMessage('삭제 완료');
                    const evalsRes = await fetch('/api/evaluations');
                    setEvaluations(await evalsRes.json());
                  } else {
                    setSaveMessage('삭제 실패');
                  }
                }}
                style={{
                  padding: '14px 24px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--red)', background: 'transparent',
                  color: 'var(--red)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                삭제
              </button>
            )}
            {saveMessage && (
              <span style={{
                fontSize: 14, fontWeight: 600,
                color: saveMessage.includes('완료') ? 'var(--green)' : 'var(--red)',
              }}>
                {saveMessage}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 이 학생의 전체 주차 평가 요약 */}
      {selectedStudentId && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
            {selectedStudent?.name}님의 주차별 평가 기록
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {Array.from({ length: 6 }, (_, i) => i + 1).map((w) => {
              const ev = evaluations.find(
                (e) => e.student_id === selectedStudentId && e.week_number === w
              );
              return (
                <div key={w}
                  onClick={() => setSelectedWeek(w)}
                  style={{
                    padding: 16, borderRadius: 'var(--radius-md)',
                    border: selectedWeek === w ? '2px solid var(--blue)' : '1px solid var(--border)',
                    background: ev ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    opacity: ev ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{w}주차</span>
                    {ev ? (
                      <span style={{
                        padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                        background: ev.status === 'completed' ? 'var(--green-dim)' : 'var(--orange-dim)',
                        color: ev.status === 'completed' ? 'var(--green)' : 'var(--orange)',
                        fontSize: 12, fontWeight: 600,
                      }}>
                        {ev.status === 'completed' ? '완료' : ev.status === 'partial' ? '일부' : '미진행'}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>미작성</span>
                    )}
                  </div>
                  {ev && (
                    <>
                      {ev.rp_area && (
                        <p style={{ fontSize: 13, color: 'var(--blue-light)', margin: '0 0 4px' }}>R&P: {ev.rp_area}</p>
                      )}
                      {ev.strength_tags.length > 0 && (
                        <p style={{ fontSize: 12, color: 'var(--green)', margin: '0 0 2px' }}>
                          + {ev.strength_tags.join(', ')}
                        </p>
                      )}
                      {ev.improvement_tags.length > 0 && (
                        <p style={{ fontSize: 12, color: 'var(--orange)', margin: '0 0 2px' }}>
                          - {ev.improvement_tags.join(', ')}
                        </p>
                      )}
                      {ev.comment && (
                        <p style={{
                          fontSize: 13, color: 'var(--text-tertiary)', margin: '6px 0 0',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {ev.comment}
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 벤치마킹 기록 */}
      {selectedStudentId && (() => {
        const studentBMs = benchmarks.filter((b) => b.student_id === selectedStudentId);
        if (studentBMs.length === 0) return null;
        return (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
              {selectedStudent?.name}님의 벤치마킹 기록
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {studentBMs.map((bm) => (
                <div key={bm.week_number} style={{ padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{bm.week_number}주차</span>
                    <span style={{ fontSize: 14, color: 'var(--blue-light)', fontWeight: 600 }}>👤 {bm.target_name}</span>
                  </div>
                  <p style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.7, margin: 0 }}>{bm.learnings}</p>
                  {bm.action_plan && (
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>실천 계획: {bm.action_plan}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-second)', marginBottom: 10,
};

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
  color: 'var(--text-primary)', fontSize: 15, outline: 'none', boxSizing: 'border-box',
  cursor: 'pointer',
};
