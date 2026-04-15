'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface AuthData {
  role: string;
  name: string;
  studentId: string;
  batchId: string;
}

interface AnsanSurvey {
  id?: string;
  batch_id: string;
  student_id: string;
  phase: 'pre' | 'post';
  // 자가진단 9문항
  know_products: number | null;
  know_factory: number | null;
  know_sofa: number | null;
  know_mattress: number | null;
  know_steel: number | null;
  know_quality: number | null;
  know_competitive: number | null;
  know_explain: number | null;
  know_value: number | null;
  // 사전 호기심
  curiosity_sofa: string;
  curiosity_mattress: string;
  curiosity_steel: string;
  curiosity_quality: string;
  curiosity_other: string;
  // 사후 만족도/NPS
  sat_process: number | null;
  sat_helpful: number | null;
  sat_guide: number | null;
  sat_operation: number | null;
  sat_duration: number | null;
  nps: number | null;
  // 사후 인상
  best_line: string;
  best_reason: string;
  learned_sofa: string;
  learned_mattress: string;
  learned_steel: string;
  confident_to_say: string;
  improvement: string;
}

const SCALE_LABELS = ['전혀 모름', '잘 모름', '보통', '잘 앎', '매우 잘 앎'] as const;
const SAT_LABELS = ['전혀 그렇지 않다', '그렇지 않다', '보통이다', '그렇다', '매우 그렇다'] as const;

const KNOW_QUESTIONS: { key: keyof AnsanSurvey; label: string }[] = [
  { key: 'know_products',    label: '안성공장에서 어떤 일룸 제품을 만드는지 알고 있다' },
  { key: 'know_factory',     label: '안성공장의 규모와 작업 환경을 대략 알고 있다' },
  { key: 'know_sofa',        label: '소파가 어떤 과정을 거쳐 만들어지는지 알고 있다' },
  { key: 'know_mattress',    label: '매트리스가 어떤 과정을 거쳐 만들어지는지 알고 있다' },
  { key: 'know_steel',       label: '철제 가구(책상/책장 등)가 어떤 과정을 거쳐 만들어지는지 알고 있다' },
  { key: 'know_quality',     label: '일룸 가구의 품질 검사가 어떻게 이뤄지는지 알고 있다' },
  { key: 'know_competitive', label: '타사 가구와 비교했을 때 일룸의 강점을 자신 있게 설명할 수 있다' },
  { key: 'know_explain',     label: '매장에서 고객에게 "공장에서 어떻게 만드냐"고 물어보면 답할 수 있다' },
  { key: 'know_value',       label: '일룸 가구의 가치를 내 언어로 설명할 수 있다' },
];

const CURIOSITY_QUESTIONS: { key: keyof AnsanSurvey; label: string; placeholder: string }[] = [
  { key: 'curiosity_sofa',     label: '소파 제작 과정에서 가장 보고 싶거나 궁금한 점은?',     placeholder: '예) 쿠션이 어떻게 채워지는지' },
  { key: 'curiosity_mattress', label: '매트리스 제작 과정에서 가장 보고 싶거나 궁금한 점은?', placeholder: '예) 스프링이 어떻게 만들어지는지' },
  { key: 'curiosity_steel',    label: '철제 가구 제작 과정에서 가장 보고 싶거나 궁금한 점은?', placeholder: '예) 철판이 어떻게 절단/도색되는지' },
  { key: 'curiosity_quality',  label: '일룸 품질 검사에 대해 가장 알고 싶은 점은?',           placeholder: '예) 어떤 항목을 어떻게 검사하는지' },
  { key: 'curiosity_other',    label: '그 외 안성공장에서 꼭 보고/배우고 싶은 점이 있다면?',    placeholder: '자유롭게 적어주세요' },
];

const SAT_QUESTIONS: { key: keyof AnsanSurvey; label: string }[] = [
  { key: 'sat_process',   label: '투어 진행 절차가 체계적이었다' },
  { key: 'sat_helpful',   label: '투어 내용이 매장 영업에 도움이 될 것 같다' },
  { key: 'sat_guide',     label: '가이드/설명이 이해하기 쉬웠다' },
  { key: 'sat_operation', label: '안전/이동/식사 등 운영에 만족한다' },
  { key: 'sat_duration',  label: '투어 시간이 적절했다' },
];

const BEST_LINE_OPTIONS = ['소파', '매트리스', '철제 가구', '품질 검사', '기타'] as const;

const POST_OPEN_QUESTIONS: { key: keyof AnsanSurvey; label: string; placeholder: string }[] = [
  { key: 'learned_sofa',     label: '소파 라인을 보고 새로 알게 된 점은?',                      placeholder: '인상 깊은 부분을 자유롭게 적어주세요' },
  { key: 'learned_mattress', label: '매트리스 라인을 보고 새로 알게 된 점은?',                  placeholder: '인상 깊은 부분을 자유롭게 적어주세요' },
  { key: 'learned_steel',    label: '철제 가구 라인을 보고 새로 알게 된 점은?',                placeholder: '인상 깊은 부분을 자유롭게 적어주세요' },
  { key: 'confident_to_say', label: '매장에서 고객에게 자신 있게 얘기할 수 있는 부분은?',        placeholder: '예) "이 책상 철판은 1.2mm 두께라 안 휘어요"' },
  { key: 'improvement',      label: '아쉽거나 더 보고 싶었던 점은?',                            placeholder: '솔직한 의견을 적어주세요' },
];

/* ── styles ── */
const card: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px 24px',
  boxShadow: 'var(--shadow-sm)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18, fontWeight: 600, lineHeight: 1.3, color: 'var(--text-primary)',
  margin: '0 0 16px', letterSpacing: '-0.015em',
};

const questionText: React.CSSProperties = {
  fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 12px',
};

const pillBase: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 'var(--radius-sm)',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-tertiary)', transition: 'all 0.15s ease',
  whiteSpace: 'nowrap',
};

const pillSelected: React.CSSProperties = {
  ...pillBase, background: 'var(--blue)', color: '#fff', border: '1px solid var(--blue)',
};

const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px',
  borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
  background: 'var(--bg-surface)', color: 'var(--text-primary)',
  fontSize: 15, fontFamily: 'inherit', lineHeight: 1.6,
  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
};

function emptyForm(phase: 'pre' | 'post', auth: AuthData): AnsanSurvey {
  return {
    batch_id: auth.batchId, student_id: auth.studentId, phase,
    know_products: null, know_factory: null, know_sofa: null, know_mattress: null,
    know_steel: null, know_quality: null, know_competitive: null, know_explain: null, know_value: null,
    curiosity_sofa: '', curiosity_mattress: '', curiosity_steel: '', curiosity_quality: '', curiosity_other: '',
    sat_process: null, sat_helpful: null, sat_guide: null, sat_operation: null, sat_duration: null, nps: null,
    best_line: '', best_reason: '', learned_sofa: '', learned_mattress: '', learned_steel: '',
    confident_to_say: '', improvement: '',
  };
}

export default function AnsanTourSurveyPage() {
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingPre, setExistingPre] = useState<AnsanSurvey | null>(null);
  const [existingPost, setExistingPost] = useState<AnsanSurvey | null>(null);
  const [currentPhase, setCurrentPhase] = useState<'pre' | 'post' | null>(null);
  const [form, setForm] = useState<AnsanSurvey | null>(null);
  const [editing, setEditing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('iloom-auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.role === 'student' && parsed.studentId) setAuth(parsed as AuthData);
      }
    } catch { /* */ }
  }, []);

  const fetchSurveys = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    try {
      const [preRes, postRes] = await Promise.all([
        fetch(`/api/ansan-tour-surveys?studentId=${auth.studentId}&phase=pre`).then(r => r.json()),
        fetch(`/api/ansan-tour-surveys?studentId=${auth.studentId}&phase=post`).then(r => r.json()),
      ]);
      const preData = Array.isArray(preRes) && preRes.length > 0 ? preRes[0] : null;
      const postData = Array.isArray(postRes) && postRes.length > 0 ? postRes[0] : null;
      setExistingPre(preData);
      setExistingPost(postData);

      if (!preData) {
        setCurrentPhase('pre'); setForm(emptyForm('pre', auth)); setEditing(false);
      } else if (!postData) {
        setCurrentPhase('post'); setForm(emptyForm('post', auth)); setEditing(false);
      } else {
        setCurrentPhase(null); setForm(null); setEditing(false);
      }
    } catch {
      setError('설문 데이터를 불러오지 못했어요');
    }
    setLoading(false);
  }, [auth]);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  const setField = <K extends keyof AnsanSurvey>(key: K, val: AnsanSurvey[K]) => {
    if (!form) return;
    setForm({ ...form, [key]: val });
  };

  const startEdit = (phase: 'pre' | 'post') => {
    const existing = phase === 'pre' ? existingPre : existingPost;
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
    // 자가진단 9문항 필수
    for (const q of KNOW_QUESTIONS) {
      if (form[q.key] == null) return '자가진단 9문항을 모두 응답해주세요';
    }
    if (form.phase === 'post') {
      for (const q of SAT_QUESTIONS) {
        if (form[q.key] == null) return '만족도 5문항을 모두 응답해주세요';
      }
      if (form.nps == null) return 'NPS(추천도) 점수를 선택해주세요';
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    if (!form || !auth) return;
    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/ansan-tour-surveys', {
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
  const renderScale = (key: keyof AnsanSurvey, value: number | null, readOnly: boolean, labels: readonly string[]) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {labels.map((label, i) => {
        const val = i + 1;
        const selected = value === val;
        return (
          <button key={val} type="button" disabled={readOnly}
            onClick={() => !readOnly && setField(key, val as AnsanSurvey[typeof key])}
            style={{
              ...(selected ? pillSelected : pillBase),
              opacity: readOnly && !selected ? 0.4 : 1,
              cursor: readOnly ? 'default' : 'pointer',
              flex: '1 1 auto', minWidth: 0, textAlign: 'center',
            }}>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>{val}</span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 400, marginTop: 2 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderNps = (value: number | null, readOnly: boolean) => (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {Array.from({ length: 11 }, (_, i) => i).map(val => {
        const selected = value === val;
        return (
          <button key={val} type="button" disabled={readOnly}
            onClick={() => !readOnly && setField('nps', val)}
            style={{
              width: 40, height: 40, padding: 0,
              borderRadius: 'var(--radius-sm)',
              border: selected ? '1px solid var(--blue)' : '1px solid var(--border)',
              background: selected ? 'var(--blue)' : 'transparent',
              color: selected ? '#fff' : 'var(--text-tertiary)',
              fontSize: 14, fontWeight: 600, cursor: readOnly ? 'default' : 'pointer',
              opacity: readOnly && !selected ? 0.4 : 1,
            }}>{val}</button>
        );
      })}
    </div>
  );

  const renderTextarea = (key: keyof AnsanSurvey, value: string, placeholder: string, readOnly: boolean) => (
    readOnly ? (
      <p style={{ fontSize: 15, color: 'var(--text-second)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {value || '(미작성)'}
      </p>
    ) : (
      <textarea rows={2} placeholder={placeholder} value={value}
        onChange={e => setField(key, e.target.value as AnsanSurvey[typeof key])}
        style={textareaStyle}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }} />
    )
  );

  const renderForm = (data: AnsanSurvey, readOnly: boolean) => {
    const isPre = data.phase === 'pre';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* A. 자가진단 9문항 (사전/사후 공통) */}
        <div style={card}>
          <h3 style={sectionTitle}>지금 내가 알고 있는 정도</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {KNOW_QUESTIONS.map(q => (
              <div key={q.key}>
                <p style={questionText}>{q.label}</p>
                {renderScale(q.key, data[q.key] as number | null, readOnly, SCALE_LABELS)}
              </div>
            ))}
          </div>
        </div>

        {/* B. 사전: 호기심 */}
        {isPre && (
          <div style={card}>
            <h3 style={sectionTitle}>가장 알고 싶은 것</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {CURIOSITY_QUESTIONS.map(q => (
                <div key={q.key}>
                  <p style={questionText}>{q.label}</p>
                  {renderTextarea(q.key, (data[q.key] as string) || '', q.placeholder, readOnly)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* C. 사후: 만족도 + NPS */}
        {!isPre && (
          <>
            <div style={card}>
              <h3 style={sectionTitle}>투어는 어땠나요?</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {SAT_QUESTIONS.map(q => (
                  <div key={q.key}>
                    <p style={questionText}>{q.label}</p>
                    {renderScale(q.key, data[q.key] as number | null, readOnly, SAT_LABELS)}
                  </div>
                ))}
                <div>
                  <p style={questionText}>다음 기수에게 이 투어를 추천하시겠어요? (0~10)</p>
                  {renderNps(data.nps, readOnly)}
                </div>
              </div>
            </div>

            {/* D. 사후: 가장 인상 깊은 라인 */}
            <div style={card}>
              <h3 style={sectionTitle}>가장 인상 깊었던 라인</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <p style={questionText}>가장 인상 깊었던 라인을 선택해주세요</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {BEST_LINE_OPTIONS.map(opt => {
                      const selected = data.best_line === opt;
                      return (
                        <button key={opt} type="button" disabled={readOnly}
                          onClick={() => !readOnly && setField('best_line', opt)}
                          style={{
                            ...(selected ? pillSelected : pillBase),
                            opacity: readOnly && !selected ? 0.4 : 1,
                            cursor: readOnly ? 'default' : 'pointer',
                          }}>{opt}</button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p style={questionText}>그 라인이 인상 깊었던 이유는?</p>
                  {renderTextarea('best_reason', data.best_reason, '한 줄로 적어주세요', readOnly)}
                </div>
              </div>
            </div>

            {/* E. 사후: 라인별 알게 된 점 + 자신감 + 아쉬운 점 */}
            <div style={card}>
              <h3 style={sectionTitle}>새로 알게 된 점</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {POST_OPEN_QUESTIONS.map(q => (
                  <div key={q.key}>
                    <p style={questionText}>{q.label}</p>
                    {renderTextarea(q.key, (data[q.key] as string) || '', q.placeholder, readOnly)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderCompletedView = (data: AnsanSurvey, phase: 'pre' | 'post') => {
    const title = phase === 'pre' ? '안성공장 투어 — 사전 설문' : '안성공장 투어 — 사후 설문';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 'clamp(1.375rem, 1.2rem + 0.75vw, 1.75rem)', fontWeight: 700, lineHeight: 1.2, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              {title}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>제출 완료</p>
          </div>
          <button type="button" onClick={() => startEdit(phase)}
            style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            수정하기
          </button>
        </div>
        {renderForm(data, true)}
      </div>
    );
  };

  if (loading) {
    return <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}><p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>불러오는 중...</p></div>;
  }
  if (!auth) {
    return <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}><p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>로그인이 필요해요</p></div>;
  }

  const showForm = currentPhase && form && (
    (!existingPre && currentPhase === 'pre') ||
    (!existingPost && currentPhase === 'post') ||
    editing
  );
  const phaseTitle = currentPhase === 'pre' ? '안성공장 투어 — 사전 설문' : currentPhase === 'post' ? '안성공장 투어 — 사후 설문' : '';
  const phaseSub = currentPhase === 'pre'
    ? '투어 가기 전, 지금 알고 있는 정도와 궁금한 점을 알려주세요.'
    : '투어를 마치고 무엇이 가장 인상 깊었는지 알려주세요.';

  return (
    <div style={{ padding: '24px 16px 64px', maxWidth: 720, margin: '0 auto' }}>
      {/* 상단 뒤로가기 */}
      <Link href="/my/survey" style={{ fontSize: 14, color: 'var(--text-tertiary)', textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}>
        ← 설문 목록으로
      </Link>

      {success && (
        <div style={{ ...card, background: 'var(--green-dim, rgba(34,197,94,0.1))', border: '1px solid var(--green)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>설문이 저장되었어요</span>
        </div>
      )}
      {error && (
        <div style={{ ...card, background: 'var(--red-dim, rgba(239,68,68,0.1))', border: '1px solid var(--red)', marginBottom: 24 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--red)' }}>{error}</span>
        </div>
      )}

      {showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 1.5rem + 1.25vw, 2.5rem)', fontWeight: 700, lineHeight: 1.1, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.025em' }}>
              {phaseTitle}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>{phaseSub}</p>
          </div>

          {renderForm(form!, false)}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {editing && (
              <button type="button" onClick={cancelEdit}
                style={{ padding: '10px 24px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>
                취소
              </button>
            )}
            <button type="button" onClick={handleSubmit} disabled={submitting}
              style={{ padding: '10px 32px', borderRadius: 'var(--radius-sm)', border: 'none', background: submitting ? 'var(--text-muted)' : 'var(--blue)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', transition: 'background 0.15s ease' }}>
              {submitting ? '저장 중...' : editing ? '수정 완료' : '제출하기'}
            </button>
          </div>
        </div>
      )}

      {!showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 1.5rem + 1.25vw, 2.5rem)', fontWeight: 700, lineHeight: 1.1, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.025em' }}>
              안성공장 인프라 투어 설문
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>제출한 설문을 확인할 수 있어요</p>
          </div>

          {existingPre && renderCompletedView(existingPre, 'pre')}
          {existingPost && renderCompletedView(existingPost, 'post')}
        </div>
      )}
    </div>
  );
}
