'use client';

import { useState, useEffect, useCallback } from 'react';

interface BenchmarkData {
  id?: string;
  week_number: number;
  target_name: string;
  target_role: string | null;
  store_name: string | null;
  learnings: string;
  action_plan: string | null;
}

export default function TrainingPage() {
  const [studentId, setStudentId] = useState('');
  const [benchmarks, setBenchmarks] = useState<BenchmarkData[]>([]);
  const [loading, setLoading] = useState(true);

  // 선택
  const [selectedWeek, setSelectedWeek] = useState(4); // 벤치마킹은 보통 4주차부터
  const [targetName, setTargetName] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [storeName, setStoreName] = useState('');
  const [learnings, setLearnings] = useState('');
  const [actionPlan, setActionPlan] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem('iloom-auth');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.studentId) setStudentId(parsed.studentId);
  }, []);

  useEffect(() => {
    if (!studentId) return;
    fetch(`/api/benchmarks?studentId=${studentId}`)
      .then((r) => r.json())
      .then(setBenchmarks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [studentId]);

  const loadExisting = useCallback(() => {
    const existing = benchmarks.find((b) => b.week_number === selectedWeek);
    if (existing) {
      setTargetName(existing.target_name);
      setTargetRole(existing.target_role || '');
      setStoreName(existing.store_name || '');
      setLearnings(existing.learnings);
      setActionPlan(existing.action_plan || '');
    } else {
      setTargetName('');
      setTargetRole('');
      setStoreName('');
      setLearnings('');
      setActionPlan('');
    }
    setSaveMsg('');
  }, [selectedWeek, benchmarks]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  async function handleSave() {
    if (!targetName.trim() || !learnings.trim()) {
      setSaveMsg('벤치마킹 대상과 배운 점을 입력해주세요.');
      return;
    }
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          weekNumber: selectedWeek,
          targetName: targetName.trim(),
          targetRole: targetRole.trim() || null,
          storeName: storeName.trim() || null,
          learnings: learnings.trim(),
          actionPlan: actionPlan.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setSaveMsg(`저장 실패: ${err.message}`);
      } else {
        setSaveMsg('저장 완료!');
        const refreshed = await fetch(`/api/benchmarks?studentId=${studentId}`).then((r) => r.json());
        setBenchmarks(refreshed);
      }
    } catch {
      setSaveMsg('서버 연결 실패');
    } finally {
      setSaving(false);
    }
  }

  const existing = benchmarks.find((b) => b.week_number === selectedWeek);

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
        <h1 style={{ fontSize: 'clamp(1.75rem, 1.5rem + 1.25vw, 2.5rem)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.025em', margin: '0 0 8px' }}>심화교육</h1>
        <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>
          매장에서 우수 직원을 벤치마킹하고 배운 점을 기록하세요
        </p>
      </div>

      {/* 주차 선택 탭 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {Array.from({ length: 6 }, (_, i) => i + 1).map((w) => {
          const hasBM = benchmarks.some((b) => b.week_number === w);
          return (
            <button key={w}
              onClick={() => setSelectedWeek(w)}
              style={{
                padding: '10px 20px', borderRadius: 'var(--radius-pill)',
                border: selectedWeek === w ? '2px solid var(--blue)' : '1px solid var(--border)',
                background: selectedWeek === w ? 'var(--blue-dim)' : hasBM ? 'var(--bg-surface)' : 'transparent',
                color: selectedWeek === w ? 'var(--blue-light)' : hasBM ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
                position: 'relative',
              }}
            >
              {w}주차
              {hasBM && (
                <span style={{
                  position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                  borderRadius: '50%', background: 'var(--green)',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* 벤치마킹 작성 폼 */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 32,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ fontSize: 'clamp(1.375rem, 1.2rem + 0.75vw, 1.75rem)', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', margin: 0 }}>{selectedWeek}주차 벤치마킹</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {existing ? '작성된 내용을 수정할 수 있어요' : '매장에서 관찰한 우수 직원의 노하우를 기록하세요'}
            </p>
          </div>
        </div>

        {/* 벤치마킹 대상 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>벤치마킹 대상 *</label>
            <input type="text" value={targetName} onChange={(e) => setTargetName(e.target.value)}
              placeholder="예: 김지영 선배" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>직급/역할</label>
            <input type="text" value={targetRole} onChange={(e) => setTargetRole(e.target.value)}
              placeholder="예: 매니저, 시니어" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>매장</label>
            <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)}
              placeholder="예: 논현점" style={inputStyle} />
          </div>
        </div>

        {/* 배운 점 */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>배운 점 *</label>
          <textarea value={learnings} onChange={(e) => setLearnings(e.target.value)}
            placeholder="이 분에게서 어떤 점을 배웠나요? 상담 방법, 고객 응대 스킬, 제품 설명 방식 등..."
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, fontFamily: 'inherit' }} />
        </div>

        {/* 실천 계획 */}
        <div style={{ marginBottom: 28 }}>
          <label style={labelStyle}>실천 계획</label>
          <textarea value={actionPlan} onChange={(e) => setActionPlan(e.target.value)}
            placeholder="배운 점을 어떻게 내 상담에 적용할 건가요?"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, fontFamily: 'inherit' }} />
        </div>

        {/* 저장 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={handleSave} disabled={saving}
            style={{
              padding: '14px 36px', borderRadius: 'var(--radius-md)', border: 'none',
              background: saving ? 'var(--border)' : 'var(--blue)', color: '#fff',
              fontSize: 16, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            }}>
            {saving ? '저장 중...' : existing ? '수정 저장' : '저장'}
          </button>
          {saveMsg && (
            <span style={{ fontSize: 14, fontWeight: 600, color: saveMsg.includes('완료') ? 'var(--green)' : 'var(--red)' }}>
              {saveMsg}
            </span>
          )}
        </div>
      </div>

      {/* 기록 요약 */}
      {benchmarks.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 'clamp(1.375rem, 1.2rem + 0.75vw, 1.75rem)', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 16 }}>내 벤치마킹 기록</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {benchmarks.map((bm) => (
              <div key={bm.week_number}
                onClick={() => setSelectedWeek(bm.week_number)}
                style={{
                  padding: 20, borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)', border: selectedWeek === bm.week_number ? '2px solid var(--blue)' : '1px solid var(--border)',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{bm.week_number}주차</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {bm.target_name} {bm.target_role && `(${bm.target_role})`} {bm.store_name && `· ${bm.store_name}`}
                  </span>
                </div>
                <p style={{
                  fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, margin: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {bm.learnings}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-second)', marginBottom: 8,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
  color: 'var(--text-primary)', fontSize: 15, outline: 'none', boxSizing: 'border-box',
};
