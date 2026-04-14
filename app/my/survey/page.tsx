'use client';

import { useState, useEffect, useCallback } from 'react';

/* ── types ── */
interface AuthData {
  role: string;
  name: string;
  studentId: string;
  batchId: string;
}

interface SurveyData {
  id?: string;
  batch_id: string;
  student_id: string;
  phase: string;
  eff_product: number | null;
  eff_customer: number | null;
  eff_sales: number | null;
  eff_teamwork: number | null;
  eff_overall: number | null;
  sat_content: number | null;
  sat_method: number | null;
  sat_duration: number | null;
  open_strength: string;
  open_worry: string;
  open_goal: string;
}

/* ── constants ── */
const SCALE_LABELS = ['전혀 그렇지 않다', '그렇지 않다', '보통이다', '그렇다', '매우 그렇다'] as const;

const EFF_QUESTIONS: { key: string; label: string; desc: string }[] = [
  { key: 'eff_product', label: '제품 지식에 대한 자신감', desc: '일룸 제품에 대해 고객에게 자신 있게 설명할 수 있다' },
  { key: 'eff_customer', label: '고객 응대에 대한 자신감', desc: '다양한 고객 유형에 맞춰 응대할 수 있다' },
  { key: 'eff_sales', label: '판매 성사에 대한 자신감', desc: '상담부터 수주까지 스스로 이끌 수 있다' },
  { key: 'eff_teamwork', label: '팀워크/조직 적응', desc: '매장 동료들과 잘 협력할 수 있다' },
  { key: 'eff_overall', label: '전반적인 준비도', desc: '매장에서 일할 준비가 되었다고 느낀다' },
];

const SAT_QUESTIONS: { key: string; desc: string }[] = [
  { key: 'sat_content', desc: '교육 내용이 실무에 도움이 되었다' },
  { key: 'sat_method', desc: '교육 방식(강의/실습 비율)이 적절했다' },
  { key: 'sat_duration', desc: '교육 기간이 적절했다' },
];

const OPEN_QUESTIONS: { key: string; label: string; placeholder: string }[] = [
  { key: 'open_strength', label: '내가 가장 성장한 부분', placeholder: '교육을 통해 가장 성장했다고 느끼는 점을 자유롭게 적어주세요' },
  { key: 'open_worry', label: '아직 걱정되는 부분', placeholder: '아직 부족하거나 걱정되는 점이 있다면 적어주세요' },
  { key: 'open_goal', label: '앞으로의 목표', placeholder: '매장 배치 후 이루고 싶은 목표를 적어주세요' },
];

const PHASE_INFO: Record<string, { title: string; subtitle: string }> = {
  intro_end: {
    title: '입문교육 설문',
    subtitle: '입문교육을 마무리하며, 자신의 성장을 돌아봐 주세요.',
  },
  advanced_end: {
    title: '심화교육 설문',
    subtitle: '심화교육을 마무리하며, 입문교육 때와 비교해 주세요.',
  },
};

/* ── styles ── */
const card: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px 24px',
  boxShadow: 'var(--shadow-sm)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: '0 0 16px',
  letterSpacing: '-0.01em',
};

const questionText: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  color: 'var(--text-primary)',
  margin: '0 0 4px',
};

const questionDesc: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
  color: 'var(--text-tertiary)',
  margin: '0 0 12px',
};

const pillBase: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 'var(--radius-sm)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  transition: 'all 0.15s ease',
  whiteSpace: 'nowrap',
};

const pillSelected: React.CSSProperties = {
  ...pillBase,
  background: 'var(--blue)',
  color: '#fff',
  border: '1px solid var(--blue)',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 15,
  fontFamily: 'inherit',
  lineHeight: 1.6,
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
};

function emptyForm(phase: string, auth: AuthData): SurveyData {
  return {
    batch_id: auth.batchId,
    student_id: auth.studentId,
    phase,
    eff_product: null,
    eff_customer: null,
    eff_sales: null,
    eff_teamwork: null,
    eff_overall: null,
    sat_content: null,
    sat_method: null,
    sat_duration: null,
    open_strength: '',
    open_worry: '',
    open_goal: '',
  };
}

/* ── component ── */
export default function SurveyPage() {
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // survey states per phase
  const [existingIntro, setExistingIntro] = useState<SurveyData | null>(null);
  const [existingAdvanced, setExistingAdvanced] = useState<SurveyData | null>(null);

  // current phase to show form for
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [form, setForm] = useState<SurveyData | null>(null);
  const [editing, setEditing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // read auth
  useEffect(() => {
    try {
      const raw = localStorage.getItem('iloom-auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.role === 'student' && parsed.studentId) {
          setAuth(parsed as AuthData);
        }
      }
    } catch { /* */ }
  }, []);

  // fetch existing surveys
  const fetchSurveys = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    try {
      const [introRes, advRes] = await Promise.all([
        fetch(`/api/education-surveys?studentId=${auth.studentId}&phase=intro_end`).then(r => r.json()),
        fetch(`/api/education-surveys?studentId=${auth.studentId}&phase=advanced_end`).then(r => r.json()),
      ]);

      const introData = introRes?.survey || introRes?.data || null;
      const advData = advRes?.survey || advRes?.data || null;

      setExistingIntro(introData);
      setExistingAdvanced(advData);

      // determine current phase
      if (!introData) {
        setCurrentPhase('intro_end');
        setForm(emptyForm('intro_end', auth));
        setEditing(false);
      } else if (!advData) {
        setCurrentPhase('advanced_end');
        setForm(emptyForm('advanced_end', auth));
        setEditing(false);
      } else {
        // both done — read-only by default
        setCurrentPhase(null);
        setForm(null);
        setEditing(false);
      }
    } catch {
      setError('설문 데이터를 불러오지 못했어요');
    }
    setLoading(false);
  }, [auth]);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  /* ── handlers ── */
  const setScale = (key: string, val: number) => {
    if (!form) return;
    setForm({ ...form, [key]: val });
  };

  const setText = (key: string, val: string) => {
    if (!form) return;
    setForm({ ...form, [key]: val });
  };

  const startEdit = (phase: string) => {
    const existing = phase === 'intro_end' ? existingIntro : existingAdvanced;
    if (existing && auth) {
      setCurrentPhase(phase);
      setForm({ ...existing });
      setEditing(true);
      setSuccess(false);
      setError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setCurrentPhase(null);
    setForm(null);
    setSuccess(false);
    setError('');
  };

  const validate = (): string | null => {
    if (!form) return '폼 데이터가 없어요';
    const scaleKeys = [...EFF_QUESTIONS.map(q => q.key), ...SAT_QUESTIONS.map(q => q.key)];
    for (const k of scaleKeys) {
      if ((form as unknown as unknown as Record<string, unknown>)[k] == null) {
        return '모든 객관식 문항에 응답해주세요';
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    if (!form || !auth) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/education-surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || '저장에 실패했어요');
      }
      setSuccess(true);
      setEditing(false);
      await fetchSurveys();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장에 실패했어요');
    }
    setSubmitting(false);
  };

  /* ── render helpers ── */
  const renderScaleRow = (key: string, value: number | null, readOnly: boolean) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {SCALE_LABELS.map((label, i) => {
        const val = i + 1;
        const selected = value === val;
        return (
          <button
            key={val}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && setScale(key, val)}
            style={{
              ...(selected ? pillSelected : pillBase),
              opacity: readOnly && !selected ? 0.4 : 1,
              cursor: readOnly ? 'default' : 'pointer',
              flex: '1 1 auto',
              minWidth: 0,
              textAlign: 'center',
            }}
          >
            <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>{val}</span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 400, marginTop: 2 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderForm = (data: SurveyData, readOnly: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Part A */}
      <div style={card}>
        <h3 style={sectionTitle}>지금 나의 자신감은?</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {EFF_QUESTIONS.map(q => (
            <div key={q.key}>
              <p style={questionText}>{q.label}</p>
              <p style={questionDesc}>{q.desc}</p>
              {renderScaleRow(q.key, (data as unknown as Record<string, unknown>)[q.key] as number | null, readOnly)}
            </div>
          ))}
        </div>
      </div>

      {/* Part B */}
      <div style={card}>
        <h3 style={sectionTitle}>교육은 어땠나요?</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {SAT_QUESTIONS.map(q => (
            <div key={q.key}>
              <p style={questionText}>{q.desc}</p>
              {renderScaleRow(q.key, (data as unknown as Record<string, unknown>)[q.key] as number | null, readOnly)}
            </div>
          ))}
        </div>
      </div>

      {/* Part C */}
      <div style={card}>
        <h3 style={sectionTitle}>자유롭게 적어주세요</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {OPEN_QUESTIONS.map(q => (
            <div key={q.key}>
              <p style={questionText}>{q.label}</p>
              {readOnly ? (
                <p style={{ fontSize: 15, color: 'var(--text-second)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {(data as unknown as Record<string, unknown>)[q.key] as string || '(미작성)'}
                </p>
              ) : (
                <textarea
                  rows={3}
                  placeholder={q.placeholder}
                  value={(data as unknown as Record<string, unknown>)[q.key] as string || ''}
                  onChange={e => setText(q.key, e.target.value)}
                  style={textareaStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderCompletedView = (data: SurveyData, phase: string) => {
    const info = PHASE_INFO[phase];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.015em' }}>
              {info?.title || phase}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>제출 완료</p>
          </div>
          <button
            type="button"
            onClick={() => startEdit(phase)}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            수정하기
          </button>
        </div>
        {renderForm(data, true)}
      </div>
    );
  };

  /* ── main render ── */
  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>불러오는 중...</p>
      </div>
    );
  }

  if (!auth) {
    return (
      <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>로그인이 필요해요</p>
      </div>
    );
  }

  // If editing or filling new form
  const showForm = currentPhase && form && (!existingIntro && currentPhase === 'intro_end' || !existingAdvanced && currentPhase === 'advanced_end' || editing);
  const phaseInfo = currentPhase ? PHASE_INFO[currentPhase] : null;

  return (
    <div style={{ padding: '24px 16px 64px', maxWidth: 720, margin: '0 auto' }}>
      {/* Success toast */}
      {success && (
        <div style={{
          ...card,
          background: 'var(--green-dim, rgba(34,197,94,0.1))',
          border: '1px solid var(--green)',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>
            설문이 저장되었어요
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          ...card,
          background: 'var(--red-dim, rgba(239,68,68,0.1))',
          border: '1px solid var(--red)',
          marginBottom: 24,
        }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--red)' }}>{error}</span>
        </div>
      )}

      {/* Form mode */}
      {showForm && phaseInfo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Header */}
          <div>
            <h1 style={{
              fontSize: 'clamp(1.375rem, 1.2rem + 0.75vw, 1.75rem)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}>
              {phaseInfo.title}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>
              {phaseInfo.subtitle}
            </p>
          </div>

          {renderForm(form!, false)}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {editing && (
              <button
                type="button"
                onClick={cancelEdit}
                style={{
                  padding: '10px 24px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-tertiary)',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                취소
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: '10px 32px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: submitting ? 'var(--text-muted)' : 'var(--blue)',
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: submitting ? 'default' : 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              {submitting ? '저장 중...' : editing ? '수정 완료' : '제출하기'}
            </button>
          </div>
        </div>
      )}

      {/* Read-only views when not in form mode */}
      {!showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div>
            <h1 style={{
              fontSize: 'clamp(1.375rem, 1.2rem + 0.75vw, 1.75rem)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}>
              교육 설문
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>
              제출한 설문을 확인할 수 있어요
            </p>
          </div>

          {existingIntro && renderCompletedView(existingIntro, 'intro_end')}
          {existingAdvanced && renderCompletedView(existingAdvanced, 'advanced_end')}

          {!existingIntro && !existingAdvanced && (
            <div style={{ ...card, textAlign: 'center' as const, padding: '40px 24px' }}>
              <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>
                아직 제출할 수 있는 설문이 없어요
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
