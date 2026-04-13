'use client';

import { useState, useEffect, useCallback } from 'react';

interface StudentItem { id: string; name: string; store_location: string | null; }
interface FinalEval {
  id?: string; student_id: string; manager_id: string;
  overall_rating: number; summary: string; strengths: string | null;
  areas_to_develop: string | null; recommended_position: string | null;
  store_fit_score: number; independence_score: number;
  customer_score: number; product_score: number;
}

const SCORE_LABELS = ['', '많이 부족', '부족', '보통', '우수', '매우 우수'];

export default function FinalEvalPage() {
  const [auth, setAuth] = useState<{ managerId: string; name: string } | null>(null);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [finals, setFinals] = useState<FinalEval[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const [overallRating, setOverallRating] = useState(3);
  const [summary, setSummary] = useState('');
  const [strengths, setStrengths] = useState('');
  const [areasToDevelop, setAreasToDevelop] = useState('');
  const [recommendedPosition, setRecommendedPosition] = useState('');
  const [storeFitScore, setStoreFitScore] = useState(3);
  const [independenceScore, setIndependenceScore] = useState(3);
  const [customerScore, setCustomerScore] = useState(3);
  const [productScore, setProductScore] = useState(3);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem('iloom-auth');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    setAuth({ managerId: parsed.managerId, name: parsed.name });
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/students').then((r) => r.json()),
      fetch('/api/final-evaluations').then((r) => r.json()),
    ]).then(([s, f]) => { setStudents(s); setFinals(f); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  const loadExisting = useCallback(() => {
    if (!selectedStudentId || !auth) return;
    const existing = finals.find((f) => f.student_id === selectedStudentId && f.manager_id === auth.managerId);
    if (existing) {
      setOverallRating(existing.overall_rating);
      setSummary(existing.summary);
      setStrengths(existing.strengths || '');
      setAreasToDevelop(existing.areas_to_develop || '');
      setRecommendedPosition(existing.recommended_position || '');
      setStoreFitScore(existing.store_fit_score);
      setIndependenceScore(existing.independence_score);
      setCustomerScore(existing.customer_score);
      setProductScore(existing.product_score);
    } else {
      setOverallRating(3); setSummary(''); setStrengths(''); setAreasToDevelop('');
      setRecommendedPosition(''); setStoreFitScore(3); setIndependenceScore(3);
      setCustomerScore(3); setProductScore(3);
    }
    setSaveMsg('');
  }, [selectedStudentId, finals, auth]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  async function handleSave() {
    if (!selectedStudentId || !auth || !summary.trim()) {
      setSaveMsg('종합 평가를 입력해주세요.'); return;
    }
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch('/api/final-evaluations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId, managerId: auth.managerId,
          overallRating, summary: summary.trim(),
          strengths: strengths.trim() || null, areasToDevelop: areasToDevelop.trim() || null,
          recommendedPosition: recommendedPosition.trim() || null,
          storeFitScore, independenceScore, customerScore, productScore,
        }),
      });
      if (!res.ok) { const err = await res.json(); setSaveMsg(`저장 실패: ${err.message}`); }
      else {
        setSaveMsg('저장 완료!');
        const refreshed = await fetch('/api/final-evaluations').then((r) => r.json());
        setFinals(refreshed);
      }
    } catch { setSaveMsg('서버 연결 실패'); }
    finally { setSaving(false); }
  }

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const existingFinal = auth ? finals.find((f) => f.student_id === selectedStudentId && f.manager_id === auth.managerId) : null;

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', minHeight: 400 }}><p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p></div>;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>교육 총평</h1>
        <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>6주 교육이 끝난 후 교육생에 대한 종합 평가를 남겨주세요</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}
          style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 15, outline: 'none', minWidth: 280 }}>
          <option value="">교육생을 선택하세요</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.store_location || '미배정'})
              {finals.some((f) => f.student_id === s.id) ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </div>

      {!selectedStudentId ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 60, textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
          <p style={{ fontSize: 40, margin: '0 0 16px' }}></p>
          <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>교육생을 선택하면 총평을 작성할 수 있어요</p>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--blue)', fontWeight: 700 }}>{selectedStudent?.name?.[0] || '?'}</div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{selectedStudent?.name} 교육 총평</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                {selectedStudent?.store_location} {existingFinal && <span style={{ color: 'var(--green)', marginLeft: 8 }}>수정 모드</span>}
              </p>
            </div>
          </div>

          {/* 종합 별점 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>종합 평가</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setOverallRating(n)}
                  style={{ fontSize: 28, background: 'none', border: 'none', cursor: 'pointer', opacity: n <= overallRating ? 1 : 0.3, transition: 'all 0.15s' }}>
                  ⭐
                </button>
              ))}
              <span style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 8 }}>{SCORE_LABELS[overallRating]}</span>
            </div>
          </div>

          {/* 세부 역량 점수 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>세부 역량 평가</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <ScoreSlider label="매장 적응도" value={storeFitScore} onChange={setStoreFitScore} color="var(--blue)" />
              <ScoreSlider label="독립 업무 능력" value={independenceScore} onChange={setIndependenceScore} color="var(--green)" />
              <ScoreSlider label="고객 응대 능력" value={customerScore} onChange={setCustomerScore} color="var(--purple)" />
              <ScoreSlider label="제품 지식 수준" value={productScore} onChange={setProductScore} color="var(--orange)" />
            </div>
          </div>

          {/* 종합 평가 */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>종합 평가 *</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="6주간의 교육을 마친 이 교육생에 대한 종합적인 의견을 남겨주세요..."
              rows={5} style={textareaStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>핵심 강점</label>
              <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)}
                placeholder="이 교육생의 가장 큰 장점은..." rows={3} style={textareaStyle} />
            </div>
            <div>
              <label style={labelStyle}>향후 발전 방향</label>
              <textarea value={areasToDevelop} onChange={(e) => setAreasToDevelop(e.target.value)}
                placeholder="앞으로 더 발전시키면 좋을 부분은..." rows={3} style={textareaStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>추천 포지션/매장</label>
            <input type="text" value={recommendedPosition} onChange={(e) => setRecommendedPosition(e.target.value)}
              placeholder="예: 키즈 전문, 침실 담당, 논현점 배치 추천" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '14px 36px', borderRadius: 'var(--radius-md)', border: 'none', background: saving ? 'var(--border)' : 'var(--blue)', color: '#fff', fontSize: 16, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? '저장 중...' : existingFinal ? '총평 수정' : '총평 저장'}
            </button>
            {saveMsg && <span style={{ fontSize: 14, fontWeight: 600, color: saveMsg.includes('완료') ? 'var(--green)' : 'var(--red)' }}>{saveMsg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreSlider({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)' }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}/5</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n)}
            style={{
              flex: 1, height: 18, borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              background: n <= value ? color : 'var(--bg-hover)',
              opacity: n <= value ? 1 : 0.4, transition: 'all 0.15s',
            }} />
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>{SCORE_LABELS[value]}</p>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical' as const, lineHeight: 1.7, fontFamily: 'inherit' };
