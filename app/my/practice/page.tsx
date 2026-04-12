'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ── 타입 ──
interface NoteComment {
  id: string;
  note_id: string;
  author_role: 'admin' | 'student';
  author_name: string;
  content: string;
  created_at: string;
}

interface Note {
  id: string; title: string; content: string;
  content_type?: 'steps' | 'blocks' | 'text';
  tags: string[]; confidence: string | null;
  participation_score?: number | null;
  best_learning?: boolean;
  one_word?: string | null;
  created_at: string;
}

// ── 상수 ──
const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: 24,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
  color: 'var(--text-primary)', fontSize: 15, outline: 'none', boxSizing: 'border-box',
};

// 실습일지 섹션 정의
const PRACTICE_SECTIONS = [
  {
    key: 'step1', label: '기억에 남는 고객님', icon: '👥',
    desc: '오늘의 상담 기록',
    placeholder: '1. 상황/고객:\n(예: 신혼 가구를 고르러 오셨는데 두 분의 취향이 너무 달라 고민하심)\n\n2. 대응/결과:\n고객님의 고민을 어떻게 들어드렸고, 어떤 제품을 추천해 드렸을 때 반응이 좋았나요?',
  },
  {
    key: 'step2', label: '선배님에게 배운 한 끗 차이', icon: '💎',
    desc: '베테랑의 비법',
    placeholder: '1. 인상 깊었던 선배님의 모습:\n(예: "선배님이 고객님의 거절 의사를 부드럽게 넘기시는 걸 보고 정말 놀랐어요!")\n\n2. 나중에 꼭 해보고 싶은 것:\n다음 상담 때 직접 적용해보고 싶은 선배님의 멘트나 행동을 적어보세요.',
  },
  {
    key: 'step3', label: '오늘 나의 온도 — 칭찬할 점', icon: '📈',
    desc: '작은 성공도 기록!',
    placeholder: '스스로 칭찬할 점을 적어보세요.\n\n예: 처음으로 견적서를 직접 뽑아본 것, 고객님께 먼저 다가가 인사를 건넨 것 등',
  },
  {
    key: 'step4', label: '오늘 나의 온도 — 보완할 점', icon: '📝',
    desc: '내일의 성장 포인트',
    placeholder: '보완하고 싶은 점을 적어보세요.\n\n예: 원목 소재의 특징을 설명할 때 말이 좀 꼬였는데, 내일은 이 부분을 더 연습해 와야겠어요.',
  },
] as const;

// 실습일지 작성 가능 날짜 (2026년 4월)
const PRACTICE_DATES = ['2026-04-11', '2026-04-12', '2026-04-17', '2026-04-18'];

const STATS_FIELDS = [
  { key: 'stats_consult', label: '상담(건)', icon: '🗣️' },
  { key: 'stats_estimate', label: '견적(건)', icon: '📋' },
  { key: 'stats_order', label: '수주(건)', icon: '✅' },
  { key: 'stats_amount', label: '수주금액(원)', icon: '💰' },
] as const;

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8,
};

// ── 유틸 ──
function formatKRW(val: string): string {
  const num = val.replace(/[^0-9]/g, '');
  if (!num) return '';
  return Number(num).toLocaleString('ko-KR');
}

function unformatKRW(val: string): string {
  return val.replace(/[^0-9]/g, '');
}

/** KST 기준 오늘 날짜 (새벽 5시 이전이면 전날로 보정) */
function getKSTTodayWithCutoff(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // 새벽 5시 이전이면 전날
  if (kst.getUTCHours() < 5) {
    kst.setUTCDate(kst.getUTCDate() - 1);
  }
  return kst.toISOString().slice(0, 10);
}

// ── 메인 ──
export default function MyPracticePage() {
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // 폼 상태
  const [sections, setSections] = useState<Record<string, string>>({ step1: '', step2: '', step3: '', step4: '' });
  const [stats, setStats] = useState<Record<string, string>>({ stats_consult: '', stats_estimate: '', stats_order: '', stats_amount: '' });
  const [orderDetail, setOrderDetail] = useState('');
  const [stepImages, setStepImages] = useState<Record<string, string[]>>({ step1: [], step2: [], step3: [], step4: [] });
  const [uploadingStep, setUploadingStep] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // 날짜 선택 (새벽 5시 보정 + 실습일 중 가장 가까운 날짜)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = getKSTTodayWithCutoff();
    // 오늘이 실습일이면 그대로, 아니면 가장 가까운 과거 실습일 선택
    if (PRACTICE_DATES.includes(today)) return today;
    const past = PRACTICE_DATES.filter(d => d <= today);
    if (past.length > 0) return past[past.length - 1];
    return PRACTICE_DATES[0];
  });

  // 코멘트
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const commentEndRef = useRef<HTMLDivElement>(null);

  // 실습일지는 항상 작성 가능 (실습일 이후에도 작성 허용)
  const isPracticeDay = true;

  // 날짜 드롭다운 옵션: 실습일만 표시
  const dateOptions = useMemo(() => {
    const todayStr = getKSTTodayWithCutoff();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return [...PRACTICE_DATES].sort().map(dateStr => {
      const d = new Date(dateStr + 'T12:00:00+09:00');
      const dayName = dayNames[d.getDay()];
      const isToday = dateStr === todayStr;
      const label = `${d.getMonth() + 1}/${d.getDate()} (${dayName})${isToday ? '  ← 오늘' : ''}`;
      return { value: dateStr, label };
    });
  }, []);

  // ── 인증 ──
  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) {
      const parsed = JSON.parse(auth);
      setStudentId(parsed.studentId);
      setStudentName(parsed.name || '');
      if (parsed.isArchived) setIsArchived(true);
    }
  }, []);

  // ── 데이터 로드 ──
  const fetchNotes = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notes?studentId=${studentId}`);
      const data = await res.json();
      // 실습일지 태그가 있는 노트만 필터링
      const practiceNotes = (data.notes || []).filter((n: Note) => n.tags?.includes('실습일지'));
      setNotes(practiceNotes);
    } catch { /* */ }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // 코멘트 수 조회
  useEffect(() => {
    if (notes.length === 0) return;
    const ids = notes.map(n => n.id).join(',');
    fetch(`/api/note-comments?note_ids=${ids}`)
      .then(r => r.json())
      .then((data: NoteComment[]) => {
        if (!Array.isArray(data)) return;
        const counts: Record<string, number> = {};
        data.forEach(c => { counts[c.note_id] = (counts[c.note_id] || 0) + 1; });
        setCommentCounts(counts);
      })
      .catch(() => {});
  }, [notes]);

  const fetchComments = useCallback(async (noteId: string) => {
    try {
      const res = await fetch(`/api/note-comments?note_id=${noteId}`);
      const data = await res.json();
      if (Array.isArray(data)) setComments(data);
    } catch { /* */ }
  }, []);

  useEffect(() => {
    if (expandedNoteId) { fetchComments(expandedNoteId); setCommentInput(''); }
    else setComments([]);
  }, [expandedNoteId, fetchComments]);

  const sendStudentComment = useCallback(async (noteId: string) => {
    if (!commentInput.trim() || sendingComment || !studentName) return;
    setSendingComment(true);
    try {
      const res = await fetch('/api/note-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId, author_role: 'student', author_name: studentName, content: commentInput.trim() }),
      });
      if (res.ok) {
        setCommentInput('');
        await fetchComments(noteId);
        setTimeout(() => commentEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch { /* */ }
    setSendingComment(false);
  }, [commentInput, sendingComment, studentName, fetchComments]);

  // ── 폼 ──
  const resetForm = () => {
    setSections({ step1: '', step2: '', step3: '', step4: '' });
    setStats({ stats_consult: '', stats_estimate: '', stats_order: '', stats_amount: '' });
    setOrderDetail('');
    setStepImages({ step1: [], step2: [], step3: [], step4: [] });
    setEditingNoteId(null); setSaveError('');
  };

  const handleImageUpload = async (stepKey: string, files: FileList | null) => {
    if (!files || files.length === 0 || !studentId) return;
    setUploadingStep(stepKey);
    const newUrls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 5 * 1024 * 1024) { setSaveError('이미지는 5MB 이하만 가능해요'); continue; }
      const form = new FormData();
      form.append('file', file);
      form.append('student_id', studentId);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (res.ok && data.url) newUrls.push(data.url);
        else setSaveError(data.message || '업로드 실패');
      } catch { setSaveError('이미지 업로드 중 오류가 발생했어요'); }
    }
    if (newUrls.length > 0) {
      setStepImages(prev => ({ ...prev, [stepKey]: [...prev[stepKey], ...newUrls] }));
    }
    setUploadingStep(null);
  };

  const removeImage = (stepKey: string, idx: number) => {
    setStepImages(prev => ({ ...prev, [stepKey]: prev[stepKey].filter((_, i) => i !== idx) }));
  };

  const startEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setSaveError('');
    if (note.content_type === 'steps') {
      try {
        const steps = JSON.parse(note.content);
        setSections({
          step1: steps.step1 || '', step2: steps.step2 || '',
          step3: steps.step3 || '', step4: steps.step4 || '',
        });
        setStats({
          stats_consult: steps.stats_consult?.toString() || '',
          stats_estimate: steps.stats_estimate?.toString() || '',
          stats_order: steps.stats_order?.toString() || '',
          stats_amount: steps.stats_amount?.toString() || '',
        });
        setOrderDetail(steps.order_detail || '');
        setStepImages({
          step1: steps.step1_images || [], step2: steps.step2_images || [],
          step3: steps.step3_images || [], step4: steps.step4_images || [],
        });
      } catch {
        setSections({ step1: note.content, step2: '', step3: '', step4: '' });
      }
    }
    setShowForm(true);
    setExpandedNoteId(null);
  };

  const hasContent = Object.values(sections).some(v => v.trim());

  const autoTitle = `${selectedDate} ${studentName || '교육생'} / 실습일지`;

  const handleSave = async () => {
    if (!hasContent) return;
    setSaving(true);
    setSaveError('');

    const stepsData: Record<string, unknown> = {
      step1: sections.step1.trim(), step2: sections.step2.trim(),
      step3: sections.step3.trim(), step4: sections.step4.trim(),
      step1_completed: !!sections.step1.trim(), step2_completed: !!sections.step2.trim(),
      step3_completed: !!sections.step3.trim(), step4_completed: !!sections.step4.trim(),
      step1_images: stepImages.step1, step2_images: stepImages.step2,
      step3_images: stepImages.step3, step4_images: stepImages.step4,
      stats_consult: Number(stats.stats_consult) || 0,
      stats_estimate: Number(stats.stats_estimate) || 0,
      stats_order: Number(stats.stats_order) || 0,
      stats_amount: Number(stats.stats_amount) || 0,
      order_detail: orderDetail.trim(),
    };

    try {
      const isEdit = !!editingNoteId;
      const res = await fetch('/api/notes', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: editingNoteId } : { student_id: studentId }),
          title: autoTitle,
          content: JSON.stringify(stepsData),
          content_type: 'steps',
          tags: ['실습일지'],
          confidence: null,
          one_word: null,
          ...(!isEdit && { target_date: selectedDate }),
        }),
      });
      const result = await res.json();
      if (!res.ok) { setSaveError(result.message || '저장에 실패했어요'); setSaving(false); return; }
      setShowForm(false);
      resetForm();
      fetchNotes();
    } catch { setSaveError('네트워크 오류가 발생했어요'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제할까요?')) return;
    await fetch(`/api/notes?id=${id}`, { method: 'DELETE' });
    if (editingNoteId === id) { setShowForm(false); resetForm(); }
    fetchNotes();
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>🏪 실습일지</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isArchived && (isPracticeDay || showForm) && (
            <button
              onClick={() => {
                if (showForm) { setShowForm(false); resetForm(); }
                else { resetForm(); setShowForm(true); }
              }}
              style={{
                padding: '10px 20px', borderRadius: 'var(--radius-md)',
                border: showForm ? 'none' : '1px solid var(--border)',
                background: showForm ? 'var(--red)' : 'transparent',
                color: showForm ? '#fff' : 'var(--text-tertiary)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {showForm ? '✕ 닫기' : '✏️ 새 실습일지'}
            </button>
          )}
        </div>
      </div>

      {/* 작성 가능일 안내 */}
      {!showForm && !isPracticeDay && notes.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>🏪</p>
          <p style={{ fontSize: 16, color: 'var(--text-second)', marginBottom: 8 }}>
            실습일지는 매장 실습일에 작성할 수 있어요
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            작성 가능일: {PRACTICE_DATES.map(d => d.slice(5).replace('-', '/')).join(', ')}
          </p>
        </div>
      )}

      {/* ── 작성 폼 ── */}
      {showForm && (
        <div style={{ ...card, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {editingNoteId ? '✏️ 실습일지 수정' : '✨ 오늘의 실습일지'}
            </h3>
          </div>

          {/* 날짜 선택 드롭다운 (새 작성 시에만 표시) */}
          {!editingNoteId && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                📅 작성 날짜
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>
                  새벽 5시 이전에 쓰면 전날로 자동 선택돼요
                </span>
              </label>
              <select
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{
                  ...inputStyle,
                  width: 'auto', minWidth: 220, cursor: 'pointer',
                  appearance: 'none', WebkitAppearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: 36,
                }}
              >
                {dateOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* 안내 카드 */}
          {!editingNoteId && (
            <div style={{
              padding: '14px 18px', borderRadius: 'var(--radius-md)', marginBottom: 20,
              background: 'var(--blue-dim)', border: '1px solid var(--blue-dim)',
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue)', marginBottom: 6 }}>
                🐣 신입 LSA님, 매장은 여러분의 가장 큰 교실입니다!
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-second)', lineHeight: 1.6 }}>
                <strong>1. 관찰이 실력입니다.</strong> 선배님이 고객님과 눈을 맞추는 법, 태블릿을 보여드리는 타이밍 하나하나가 다 소중한 교재예요.<br/>
                <strong>2. 구체적으로 적으세요.</strong> &quot;상담을 잘했다&quot;보다는 &quot;고객님이 원목 이색을 걱정하실 때 ~라고 설명해 드렸다&quot;처럼 구체적인 상황을 적어야 나중에 내 비법서가 됩니다.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 숫자 실적 */}
            <div>
              <label style={labelStyle}>📊 오늘의 실적</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {STATS_FIELDS.map(stat => {
                  const isAmount = stat.key === 'stats_amount';
                  return (
                    <div key={stat.key}>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4, textAlign: 'center' }}>
                        {stat.icon} {stat.label}
                      </div>
                      <input
                        type={isAmount ? 'text' : 'number'}
                        inputMode="numeric"
                        min={isAmount ? undefined : '0'}
                        value={isAmount ? formatKRW(stats[stat.key]) : stats[stat.key]}
                        onChange={e => {
                          if (isAmount) {
                            setStats(prev => ({ ...prev, [stat.key]: unformatKRW(e.target.value) }));
                          } else {
                            setStats(prev => ({ ...prev, [stat.key]: e.target.value }));
                          }
                        }}
                        placeholder="0"
                        style={{ ...inputStyle, textAlign: 'center', fontSize: 18, fontWeight: 700, padding: '10px 8px' }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 상담/수주 내역 (선택) */}
            <div>
              <label style={labelStyle}>📦 상담/수주 내역 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(선택)</span></label>
              <textarea
                value={orderDetail}
                onChange={e => setOrderDetail(e.target.value)}
                placeholder={"상담 — 모션데스크 1200, 로이 6인 식탁\n견적 — 링키 플러스 책상+책장 세트\n수주 — 쿠시노 소파 3인 (1,200,000원)"}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, minHeight: 80 }}
              />
            </div>

            {/* 텍스트 섹션 */}
            {PRACTICE_SECTIONS.map(({ key, label, icon, desc, placeholder }) => {
              const val = sections[key];
              return (
                <div key={key} style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-elevated)', overflow: 'hidden',
                }}>
                  {/* 섹션 헤더 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: val.trim() ? 'var(--blue-dim)' : 'var(--bg-hover)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{icon} {label}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{desc}</span>
                    </div>
                    {val.trim() && (
                      <span style={{
                        padding: '2px 10px', borderRadius: 'var(--radius-pill)',
                        background: 'var(--blue)', color: '#fff', fontSize: 12, fontWeight: 600,
                      }}>✓ 작성됨</span>
                    )}
                  </div>
                  {/* 텍스트 입력 */}
                  <textarea
                    value={val}
                    onChange={e => setSections(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    rows={5}
                    style={{
                      ...inputStyle, resize: 'vertical', lineHeight: 1.6,
                      border: 'none', borderRadius: 0, background: 'transparent',
                      padding: '14px 16px', minHeight: 120,
                    }}
                  />
                  {/* 이미지 첨부 */}
                  <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: stepImages[key]?.length > 0 ? 10 : 0 }}>
                      <label style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)', background: 'transparent',
                        color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600,
                        cursor: uploadingStep === key ? 'wait' : 'pointer',
                      }}>
                        {uploadingStep === key ? '업로드 중...' : '📷 사진 첨부'}
                        <input
                          type="file" accept="image/*" multiple
                          style={{ display: 'none' }}
                          onChange={e => handleImageUpload(key, e.target.files)}
                          disabled={uploadingStep === key}
                        />
                      </label>
                      {stepImages[key]?.length > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{stepImages[key].length}장 첨부됨</span>
                      )}
                    </div>
                    {stepImages[key]?.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {stepImages[key].map((url, imgIdx) => (
                          <div key={imgIdx} style={{ position: 'relative', width: 80, height: 80 }}>
                            <img src={url} alt={`첨부 ${imgIdx + 1}`}
                              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                            <button onClick={() => removeImage(key, imgIdx)}
                              style={{
                                position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                                background: 'var(--red)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 에러 */}
            {saveError && (
              <div style={{
                padding: '10px 16px', borderRadius: 'var(--radius-md)',
                background: 'var(--red-dim)', color: 'var(--red)', fontSize: 14, fontWeight: 600,
              }}>
                {saveError}
              </div>
            )}

            {/* 저장 버튼 */}
            <button onClick={handleSave} disabled={saving || !hasContent}
              style={{
                padding: '14px', borderRadius: 'var(--radius-md)', border: 'none',
                background: hasContent ? 'var(--blue)' : 'var(--bg-elevated)',
                color: hasContent ? '#fff' : 'var(--text-muted)',
                fontSize: 16, fontWeight: 600,
                cursor: hasContent ? 'pointer' : 'not-allowed',
              }}>
              {saving ? '저장 중...' : editingNoteId ? '수정 완료' : '저장하기'}
            </button>
          </div>
        </div>
      )}

      {/* ── 노트 카드 목록 ── */}
      {notes.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {notes.map(note => {
              const isSelected = expandedNoteId === note.id;
              const dateObj = new Date(note.created_at);
              const month = dateObj.getMonth() + 1;
              const day = dateObj.getDate();
              const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
              const dayName = dayNames[dateObj.getDay()];

              // 실적 숫자 파싱
              let statsData: Record<string, number> = {};
              let noteOrderDetail = '';
              try {
                const steps = JSON.parse(note.content);
                statsData = {
                  stats_consult: steps.stats_consult || 0,
                  stats_estimate: steps.stats_estimate || 0,
                  stats_order: steps.stats_order || 0,
                  stats_amount: steps.stats_amount || 0,
                };
                noteOrderDetail = steps.order_detail || '';
              } catch { /* */ }

              return (
                <button key={note.id}
                  onClick={() => setExpandedNoteId(isSelected ? null : note.id)}
                  style={{
                    padding: 20, borderRadius: 'var(--radius-md)', textAlign: 'left',
                    border: isSelected ? '2px solid var(--blue)' : '1px solid var(--border)',
                    background: isSelected ? 'var(--blue-dim)' : 'var(--bg-surface)',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                  {/* 날짜 + 뱃지 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{month}/{day} ({dayName})</span>
                    <span style={{
                      padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700,
                      background: 'var(--blue-dim)', color: 'var(--blue)',
                    }}>🏪 실습일지</span>
                  </div>
                  {/* 실적 요약 */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {statsData.stats_consult > 0 && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue)' }}>🗣️ {statsData.stats_consult}</span>}
                    {statsData.stats_estimate > 0 && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue-light)' }}>📋 {statsData.stats_estimate}</span>}
                    {statsData.stats_order > 0 && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--orange-dim)', color: 'var(--orange)' }}>✅ {statsData.stats_order}</span>}
                    {statsData.stats_amount > 0 && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--purple-dim)', color: 'var(--purple)' }}>💰 {statsData.stats_amount.toLocaleString()}</span>}
                  </div>
                  {/* 수주 내역 미리보기 */}
                  {noteOrderDetail && (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      📦 {noteOrderDetail.split('\n')[0]}
                    </div>
                  )}
                  {/* 섹션 완료 현황 */}
                  {note.content_type === 'steps' && (() => {
                    try {
                      const steps = JSON.parse(note.content);
                      const filled = [!!steps.step1?.trim(), !!steps.step2?.trim(), !!steps.step3?.trim(), !!steps.step4?.trim()];
                      const done = filled.filter(Boolean).length;
                      return (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {['👥', '💎', '📈', '📝'].map((icon, i) => (
                            <span key={i} style={{
                              fontSize: 14, padding: '2px 6px', borderRadius: 'var(--radius-pill)',
                              background: filled[i] ? 'var(--blue-dim)' : 'var(--bg-hover)',
                              opacity: filled[i] ? 1 : 0.3,
                            }}>{icon}</span>
                          ))}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{done}/4</span>
                        </div>
                      );
                    } catch { return null; }
                  })()}
                  {/* 코멘트 뱃지 */}
                  {(commentCounts[note.id] || 0) > 0 && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                      background: 'var(--blue-dim)', color: 'var(--blue-light)',
                      fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}>💬 {commentCounts[note.id]}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── 선택된 노트 상세 ── */}
          {expandedNoteId && (() => {
            const note = notes.find(n => n.id === expandedNoteId);
            if (!note) return null;
            return (
              <div style={{ ...card, border: '1px solid var(--border)' }}>
                {/* 헤더 */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{note.title}</h3>
                      <span style={{
                        padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700,
                        background: 'var(--blue-dim)', color: 'var(--blue)',
                      }}>🏪 실습일지</span>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {new Date(note.created_at).toLocaleDateString('ko', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => startEdit(note)}
                      style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 13, cursor: 'pointer' }}>수정</button>
                    <button onClick={() => handleDelete(note.id)}
                      style={{ padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>삭제</button>
                  </div>
                </div>

                {/* 실적 카드 */}
                {note.content_type === 'steps' && (() => {
                  try {
                    const steps = JSON.parse(note.content);
                    const hasStats = steps.stats_consult || steps.stats_estimate || steps.stats_order || steps.stats_amount;
                    if (!hasStats) return null;
                    return (
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
                        padding: 16, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)',
                        marginBottom: 16,
                      }}>
                        {STATS_FIELDS.map(sf => (
                          <div key={sf.key} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{sf.icon} {sf.label}</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {sf.key === 'stats_amount' ? (steps[sf.key] || 0).toLocaleString() : steps[sf.key] || 0}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch { return null; }
                })()}

                {/* 수주 내역 */}
                {note.content_type === 'steps' && (() => {
                  try {
                    const steps = JSON.parse(note.content);
                    if (!steps.order_detail) return null;
                    return (
                      <div style={{
                        padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)',
                        marginBottom: 16, border: '1px solid var(--border)',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>📦 상담/수주 내역</div>
                        <div style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{steps.order_detail}</div>
                      </div>
                    );
                  } catch { return null; }
                })()}

                {/* 섹션 내용 */}
                <PracticeStepsRenderer content={note.content} />

                {/* 코멘트 영역 */}
                {comments.length > 0 && (
                  <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                      <span style={{ fontSize: 14 }}>💬</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>코멘트 ({comments.length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 300, overflowY: 'auto', padding: '0 4px' }}>
                      {comments.map(c => (
                        <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: c.author_role === 'student' ? 'flex-end' : 'flex-start' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', gap: 6 }}>
                            <span>{c.author_role === 'admin' ? '🧑‍🏫' : '🧑‍🎓'} {c.author_name}</span>
                            <span>{new Date(c.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div style={{
                            maxWidth: '80%', padding: '10px 14px',
                            borderRadius: c.author_role === 'student' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            background: c.author_role === 'student' ? 'var(--blue)' : 'var(--bg-elevated)',
                            color: c.author_role === 'student' ? '#fff' : 'var(--text-primary)',
                            fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          }}>{c.content}</div>
                        </div>
                      ))}
                      <div ref={commentEndRef} />
                    </div>
                    {/* 답글 입력 */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <textarea
                        value={commentInput}
                        onChange={e => setCommentInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendStudentComment(note.id); } }}
                        placeholder="답글을 남겨보세요... (Enter로 전송)"
                        rows={1}
                        style={{
                          flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                          color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                          resize: 'none', minHeight: 42, maxHeight: 120, fontFamily: 'inherit', boxSizing: 'border-box',
                        }}
                        onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
                      />
                      <button
                        onClick={() => sendStudentComment(note.id)}
                        disabled={!commentInput.trim() || sendingComment}
                        style={{
                          padding: '10px 18px', borderRadius: 'var(--radius-md)', border: 'none',
                          background: commentInput.trim() ? 'var(--blue)' : 'var(--bg-hover)',
                          color: commentInput.trim() ? '#fff' : 'var(--text-muted)',
                          fontSize: 14, fontWeight: 600, cursor: commentInput.trim() ? 'pointer' : 'default', flexShrink: 0,
                        }}>
                        {sendingComment ? '...' : '전송'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* 비어있을 때 (실습일자이면서 노트 없음) */}
      {notes.length === 0 && isPracticeDay && !showForm && (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>🏪</p>
          <p style={{ fontSize: 16, color: 'var(--text-second)', marginBottom: 8 }}>아직 작성한 실습일지가 없어요</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>오늘 매장에서 배운 것을 기록해보세요!</p>
        </div>
      )}
    </div>
  );
}

// ── 실습일지 렌더러 ──
function PracticeStepsRenderer({ content }: { content: string }) {
  try {
    const steps = JSON.parse(content);
    const sectionDefs = [
      { key: 'step1', label: '기억에 남는 고객님', icon: '👥' },
      { key: 'step2', label: '선배님에게 배운 한 끗 차이', icon: '💎' },
      { key: 'step3', label: '오늘 나의 온도 — 칭찬할 점', icon: '📈' },
      { key: 'step4', label: '오늘 나의 온도 — 보완할 점', icon: '📝' },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sectionDefs.map(({ key, label, icon }) => {
          const text = steps[key] as string;
          const images = steps[`${key}_images`] as string[] | undefined;
          if (!text && (!images || images.length === 0)) return (
            <div key={key} style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', opacity: 0.5 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>{icon} {label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>미작성</span>
            </div>
          );
          return (
            <div key={key} style={{ borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
              <div style={{
                padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--blue-dim)',
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{icon} {label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {images && images.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📷 {images.length}장</span>}
                  <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>✓ 완료</span>
                </div>
              </div>
              <div style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text-second)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {text}
                {images && images.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8 }}>
                    {images.map((url: string, i: number) => (
                      <img key={i} src={url} alt={`첨부 ${i + 1}`}
                        style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  } catch {
    return <div style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{content}</div>;
  }
}
