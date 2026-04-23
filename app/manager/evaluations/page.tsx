'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  STRENGTH_TAG_GROUPS,
  IMPROVEMENT_TAG_GROUPS,
  RP_AREA_OPTIONS,
  RP_TYPE_OPTIONS,
} from '@/lib/types';

interface StudentItem {
  id: string;
  name: string;
  store_location: string | null;
  is_dropped?: boolean;
}

interface EvalData {
  id?: string;
  student_id: string;
  week_number: number;
  rp_area: string | null;
  rp_type: string | null;
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

  const [rpArea, setRpArea] = useState('');
  const [rpType, setRpType] = useState('');
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
      setRpType(existing.rp_type || '');
      setStatus(existing.status || 'completed');
      setStrengthTags(existing.strength_tags || []);
      setImprovementTags(existing.improvement_tags || []);
      setComment(existing.comment || '');
    } else {
      setRpArea('');
      setRpType('');
      setStatus('completed');
      setStrengthTags([]);
      setImprovementTags([]);
      setComment('');
    }
    setSaveMessage('');
  }, [selectedStudentId, selectedWeek, evaluations]);

  useEffect(() => { loadExistingEval(); }, [loadExistingEval]);

  function toggleTag(tag: string, current: string[], setter: (v: string[]) => void) {
    if (tag === '없음') {
      setter(current.includes('없음') ? [] : ['없음']);
    } else {
      const withoutNone = current.filter((t) => t !== '없음');
      setter(withoutNone.includes(tag) ? withoutNone.filter((t) => t !== tag) : [...withoutNone, tag]);
    }
  }

  async function handleSave() {
    if (!selectedStudentId || !auth) return;
    // 필수 항목 검증
    if (!status) { setSaveMessage('진행여부를 선택해주세요.'); return; }
    if (!rpArea) { setSaveMessage('R&P 영역을 선택해주세요.'); return; }
    if (!rpType) { setSaveMessage('R&P 구분을 선택해주세요.'); return; }
    if (strengthTags.length === 0) { setSaveMessage('강점을 1개 이상 선택해주세요.'); return; }
    if (improvementTags.length === 0) { setSaveMessage('개선점을 1개 이상 선택해주세요.'); return; }
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
          rpType: rpType || null,
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

  const myStudents = students.filter((s) => !s.is_dropped && auth?.storeName && s.store_location === auth.storeName);

  // 내 매장 학생 로드 시 첫 번째 자동 선택
  useEffect(() => {
    if (!selectedStudentId && myStudents.length > 0) {
      setSelectedStudentId(myStudents[0].id);
    }
  }, [myStudents.length, selectedStudentId]);

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
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>주차별 R&P 평가</h1>
      </div>

      {/* 교육생 탭 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {myStudents.map((s, i) => (
          <button key={s.id} onClick={() => setSelectedStudentId(s.id)} style={{
            padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,
            background: 'transparent',
            color: selectedStudentId === s.id ? 'var(--text-primary)' : 'var(--text-muted)',
            border: 'none',
            borderBottom: selectedStudentId === s.id ? '2px solid var(--blue)' : '2px solid transparent',
            fontSize: 15,
            fontWeight: selectedStudentId === s.id ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            marginBottom: -1,
          }}>{s.name}</button>
        ))}
      </div>

      {/* 주차별 평가 기록 카드 그리드 */}
      {selectedStudentId && (
        <div style={{ marginBottom: 24 }}>
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
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{w}주차</span>
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

      {!selectedStudentId ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 60, textAlign: 'center', boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: 40, margin: '0 0 16px' }}>👆</p>
          <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>위에서 교육생을 선택해주세요</p>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)',
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
              <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{selectedStudent?.name}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                {selectedStudent?.store_location || '매장 미배정'} · {selectedWeek}주차 평가
                {existingEval && <span style={{ color: 'var(--green)', marginLeft: 8 }}>수정 모드</span>}
              </p>
            </div>
          </div>

          {/* 진행여부 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>진행여부 <span style={{ padding: '2px 7px', borderRadius: 'var(--radius-pill)', background: 'var(--red)', color: '#fff', fontSize: 12, fontWeight: 600 }}>필수</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'completed', label: '완료', color: 'var(--green)', dim: 'var(--green-dim)' },
                { value: 'partial', label: '일부 진행', color: 'var(--orange)', dim: 'var(--orange-dim)' },
                { value: 'not_completed', label: '미진행', color: 'var(--red)', dim: 'var(--red-dim)' },
              ].map((opt) => (
                <button key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  style={{
                    padding: '8px 18px', borderRadius: 'var(--radius-sm)',
                    border: status === opt.value ? `2px solid ${opt.color}` : '1px solid var(--border)',
                    background: status === opt.value ? opt.dim : 'transparent',
                    color: status === opt.value ? opt.color : 'var(--text-tertiary)',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {status === opt.value ? '✓ ' : ''}{opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* R&P 구분 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>R&P 구분 <span style={{ padding: '2px 7px', borderRadius: 'var(--radius-pill)', background: 'var(--red)', color: '#fff', fontSize: 12, fontWeight: 600 }}>필수</span></label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {RP_TYPE_OPTIONS.map((type) => (
                <button key={type}
                  onClick={() => setRpType(rpType === type ? '' : type)}
                  style={{
                    padding: '8px 18px', borderRadius: 'var(--radius-sm)',
                    border: rpType === type ? '2px solid var(--purple)' : '1px solid var(--border)',
                    background: rpType === type ? 'var(--purple-dim)' : 'transparent',
                    color: rpType === type ? 'var(--purple)' : 'var(--text-tertiary)',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {rpType === type ? '✓ ' : ''}{type}
                </button>
              ))}
              <input
                type="text"
                placeholder="기타 직접 입력"
                value={RP_TYPE_OPTIONS.includes(rpType as (typeof RP_TYPE_OPTIONS)[number]) ? '' : rpType}
                onChange={(e) => setRpType(e.target.value)}
                onFocus={() => { if (RP_TYPE_OPTIONS.includes(rpType as (typeof RP_TYPE_OPTIONS)[number])) setRpType(''); }}
                style={{
                  padding: '7px 12px', borderRadius: 'var(--radius-sm)',
                  border: !RP_TYPE_OPTIONS.includes(rpType as (typeof RP_TYPE_OPTIONS)[number]) && rpType
                    ? '2px solid var(--purple)' : '1px solid var(--border)',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)',
                  fontSize: 14, outline: 'none', width: 130,
                }}
              />
            </div>
          </div>

          {/* R&P 영역 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>R&P 영역 <span style={{ padding: '2px 7px', borderRadius: 'var(--radius-pill)', background: 'var(--red)', color: '#fff', fontSize: 12, fontWeight: 600 }}>필수</span></label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {RP_AREA_OPTIONS.map((area) => (
                <button key={area}
                  onClick={() => setRpArea(rpArea === area ? '' : area)}
                  style={{
                    padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                    border: rpArea === area ? '2px solid var(--blue)' : '1px solid var(--border)',
                    background: rpArea === area ? 'var(--blue-dim)' : 'transparent',
                    color: rpArea === area ? 'var(--blue)' : 'var(--text-tertiary)',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {rpArea === area ? '✓ ' : ''}{area}
                </button>
              ))}
              <input
                type="text"
                placeholder="기타 직접 입력"
                value={RP_AREA_OPTIONS.includes(rpArea as (typeof RP_AREA_OPTIONS)[number]) ? '' : rpArea}
                onChange={(e) => setRpArea(e.target.value)}
                onFocus={() => { if (RP_AREA_OPTIONS.includes(rpArea as (typeof RP_AREA_OPTIONS)[number])) setRpArea(''); }}
                style={{
                  padding: '7px 12px', borderRadius: 'var(--radius-sm)',
                  border: !RP_AREA_OPTIONS.includes(rpArea as (typeof RP_AREA_OPTIONS)[number]) && rpArea
                    ? '2px solid var(--blue)' : '1px solid var(--border)',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)',
                  fontSize: 14, outline: 'none', width: 140,
                }}
              />
            </div>
          </div>

          {/* 강점 태그 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>
              강점 <span style={{ padding: '2px 7px', borderRadius: 'var(--radius-pill)', background: 'var(--red)', color: '#fff', fontSize: 12, fontWeight: 600 }}>필수</span>
              {' '}<span style={{ color: 'var(--green)', fontWeight: 400 }}>({strengthTags.filter(t => t !== '없음').length}개 선택)</span>
            </label>
            <div style={{
              display: 'flex', overflowX: 'auto', gap: 0,
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)',
            }}>
              {STRENGTH_TAG_GROUPS.map((group, gi) => (
                <div key={group.label} style={{
                  flex: '0 0 auto', minWidth: 140,
                  borderRight: gi < STRENGTH_TAG_GROUPS.length - 1 ? '1px solid var(--border)' : 'none',
                  padding: '14px 16px',
                }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                    letterSpacing: '0.04em', display: 'block', marginBottom: 10,
                    textTransform: 'uppercase',
                  }}>
                    {group.label}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {group.tags.map((tag) => {
                      const selected = strengthTags.includes(tag);
                      return (
                        <button key={tag}
                          onClick={() => toggleTag(tag, strengthTags, setStrengthTags)}
                          style={{
                            padding: '7px 12px', borderRadius: 'var(--radius-sm)',
                            border: selected ? '2px solid var(--green)' : '1px solid var(--border)',
                            background: selected ? 'var(--green-dim)' : 'var(--bg-surface)',
                            color: selected ? 'var(--green)' : 'var(--text-tertiary)',
                            fontSize: 13, fontWeight: 500, cursor: 'pointer',
                            transition: 'all 0.15s ease', textAlign: 'left', whiteSpace: 'nowrap',
                          }}
                        >
                          {selected ? '✓ ' : ''}{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* 없음 컬럼 */}
              <div style={{ flex: '0 0 auto', minWidth: 100, padding: '14px 16px', borderLeft: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', display: 'block', marginBottom: 10, textTransform: 'uppercase' }}>없음</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={() => toggleTag('없음', strengthTags, setStrengthTags)} style={{
                    padding: '7px 12px', borderRadius: 'var(--radius-sm)',
                    border: strengthTags.includes('없음') ? '2px solid var(--text-secondary)' : '1px solid var(--border)',
                    background: strengthTags.includes('없음') ? 'var(--bg-hover)' : 'var(--bg-surface)',
                    color: strengthTags.includes('없음') ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'left', whiteSpace: 'nowrap',
                  }}>
                    {strengthTags.includes('없음') ? '✓ ' : ''}없음
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 개선점 태그 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>
              개선점 <span style={{ padding: '2px 7px', borderRadius: 'var(--radius-pill)', background: 'var(--red)', color: '#fff', fontSize: 12, fontWeight: 600 }}>필수</span>
              {' '}<span style={{ color: 'var(--orange)', fontWeight: 400 }}>({improvementTags.filter(t => t !== '없음').length}개 선택)</span>
            </label>
            <div style={{
              display: 'flex', overflowX: 'auto', gap: 0,
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)',
            }}>
              {IMPROVEMENT_TAG_GROUPS.map((group, gi) => (
                <div key={group.label} style={{
                  flex: '0 0 auto', minWidth: 160,
                  borderRight: gi < IMPROVEMENT_TAG_GROUPS.length - 1 ? '1px solid var(--border)' : 'none',
                  padding: '14px 16px',
                }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                    letterSpacing: '0.04em', display: 'block', marginBottom: 10,
                    textTransform: 'uppercase',
                  }}>
                    {group.label}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {group.tags.map((tag) => {
                      const selected = improvementTags.includes(tag);
                      return (
                        <button key={tag}
                          onClick={() => toggleTag(tag, improvementTags, setImprovementTags)}
                          style={{
                            padding: '7px 12px', borderRadius: 'var(--radius-sm)',
                            border: selected ? '2px solid var(--orange)' : '1px solid var(--border)',
                            background: selected ? 'var(--orange-dim)' : 'var(--bg-surface)',
                            color: selected ? 'var(--orange)' : 'var(--text-tertiary)',
                            fontSize: 13, fontWeight: 500, cursor: 'pointer',
                            transition: 'all 0.15s ease', textAlign: 'left', whiteSpace: 'nowrap',
                          }}
                        >
                          {selected ? '✓ ' : ''}{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* 없음 컬럼 */}
              <div style={{ flex: '0 0 auto', minWidth: 100, padding: '14px 16px', borderLeft: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', display: 'block', marginBottom: 10, textTransform: 'uppercase' }}>없음</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={() => toggleTag('없음', improvementTags, setImprovementTags)} style={{
                    padding: '7px 12px', borderRadius: 'var(--radius-sm)',
                    border: improvementTags.includes('없음') ? '2px solid var(--text-secondary)' : '1px solid var(--border)',
                    background: improvementTags.includes('없음') ? 'var(--bg-hover)' : 'var(--bg-surface)',
                    color: improvementTags.includes('없음') ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'left', whiteSpace: 'nowrap',
                  }}>
                    {improvementTags.includes('없음') ? '✓ ' : ''}없음
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 자유 코멘트 */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>상세 피드백 <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 400 }}>선택</span></label>
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

      {/* 벤치마킹 기록 */}
      {selectedStudentId && (() => {
        const studentBMs = benchmarks.filter((b) => b.student_id === selectedStudentId);
        if (studentBMs.length === 0) return null;
        return (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, letterSpacing: '-0.02em' }}>
              {selectedStudent?.name}님의 벤치마킹 기록
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {studentBMs.map((bm) => (
                <div key={bm.week_number} style={{ padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{bm.week_number}주차</span>
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
  display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 10,
};

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
  color: 'var(--text-primary)', fontSize: 15, outline: 'none', boxSizing: 'border-box',
  cursor: 'pointer',
};
