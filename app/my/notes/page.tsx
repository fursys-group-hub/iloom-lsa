'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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

type BlockType = 'heading' | 'text' | 'numbered-list' | 'table' | 'quote';
interface Block {
  id: string;
  type: BlockType;
  content: string;           // text, quote
  items: string[];            // numbered-list
  headers: string[];          // table
  rows: string[][];           // table
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

const CONFIDENCE = [
  { value: 'confident', label: '자신만만', icon: '😎', desc: '고객 앞에서 바로 답변 가능' },
  { value: 'understood', label: '이해완료', icon: '😊', desc: '혼자 복습하면 충분해요' },
  { value: 'half', label: '알쏭달쏭', icon: '🤔', desc: '실물 보면서 한번 더 봐야 할 것 같아요' },
  { value: 'need_help', label: '도움요청', icon: '😵', desc: '추가 설명이 필요해요' },
];

const BLOCK_TYPES: { type: BlockType; label: string; icon: string }[] = [
  { type: 'heading', label: '제목', icon: 'H' },
  { type: 'text', label: '텍스트', icon: 'T' },
  { type: 'numbered-list', label: '번호 리스트', icon: '1.' },
  { type: 'table', label: '표', icon: '▦' },
  { type: 'quote', label: '인용', icon: '>' },
];

// ── 유틸 ──
const uid = () => Math.random().toString(36).slice(2, 9);

function newBlock(type: BlockType): Block {
  return {
    id: uid(), type, content: '',
    items: type === 'numbered-list' ? [''] : [],
    headers: type === 'table' ? ['항목', '내용'] : [],
    rows: type === 'table' ? [['', '']] : [],
  };
}

function blocksHaveContent(blocks: Block[]): boolean {
  return blocks.some(b => {
    if (b.type === 'heading' || b.type === 'text' || b.type === 'quote') return b.content.trim().length > 0;
    if (b.type === 'numbered-list') return b.items.some(i => i.trim().length > 0);
    if (b.type === 'table') return b.rows.some(r => r.some(c => c.trim().length > 0));
    return false;
  });
}

function parseContent(content: string): Block[] | null {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) return parsed;
  } catch { /* plain text */ }
  return null;
}

// ── STEP 정의 ──
const STEP_DEFS = [
  {
    key: 'step1', label: 'STEP 1 — 핵심 필기', icon: '📝',
    desc: '오늘의 배움 쌓기',
    placeholder: '오늘 학습한 상세 내용을 자유롭게 적어주세요.\n\n현장 스케치: 매장의 실제 제품 사진을 찍어서 올려두면 나중에 훨씬 기억하기 좋습니다.',
  },
  {
    key: 'step2', label: 'STEP 2 — LSA 비법서', icon: '💡',
    desc: '나를 지켜주는 무기',
    placeholder: '고객님이 반드시 물어볼 핵심 스펙이나 수치를 적어보세요.\n\n"확인해 볼게요"보다 "이 제품은 ~입니다"라는 즉각적인 답변이 고객의 마음을 엽니다.\n한 달 뒤, 상담 중에 갑자기 기억이 안 날 때 꺼내 볼 수 있는 나만의 컨닝 페이퍼!',
  },
  {
    key: 'step3', label: 'STEP 3 — 실전 적용', icon: '🎯',
    desc: '내일 바로 써먹기',
    placeholder: '오늘의 가구 One-Pick: 오늘 배운 제품 중 고객에게 가장 추천하고 싶은 하나와 그 이유\n\n내일의 나에게: 오늘 놓쳤거나 내일 출근해서 가장 먼저 확인해야 할 한 가지는?',
  },
] as const;

// ── 메인 ──
export default function MyNotesPage() {
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [pledge, setPledge] = useState(''); // 오늘의 다짐
  const [step1, setStep1] = useState('');
  const [step2, setStep2] = useState('');
  const [step3, setStep3] = useState('');
  const [tags, setTags] = useState('');
  const [confidence, setConfidence] = useState('');
  const [isSelfStudyMode, setIsSelfStudyMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stepImages, setStepImages] = useState<Record<string, string[]>>({ step1: [], step2: [], step3: [] });
  const [uploadingStep, setUploadingStep] = useState<string | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const commentEndRef = useRef<HTMLDivElement>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const fetchComments = useCallback(async (noteId: string) => {
    try {
      const res = await fetch(`/api/note-comments?note_id=${noteId}`);
      const data = await res.json();
      if (Array.isArray(data)) setComments(data);
    } catch { /* silent */ }
  }, []);

  const sendStudentComment = useCallback(async (noteId: string) => {
    if (!commentInput.trim() || sendingComment || !studentName) return;
    setSendingComment(true);
    try {
      const res = await fetch('/api/note-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_id: noteId,
          author_role: 'student',
          author_name: studentName,
          content: commentInput.trim(),
        }),
      });
      if (res.ok) {
        setCommentInput('');
        await fetchComments(noteId);
        setTimeout(() => commentEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch { /* silent */ }
    setSendingComment(false);
  }, [commentInput, sendingComment, studentName, fetchComments]);

  const DRAFT_KEY = 'iloom-note-draft-v2';

  const resetForm = () => {
    setPledge(''); setStep1(''); setStep2(''); setStep3('');
    setTags(''); setConfidence(''); setIsSelfStudyMode(false); setEditingNoteId(null); setSaveError('');
    setStepImages({ step1: [], step2: [], step3: [] });
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


  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) {
      const parsed = JSON.parse(auth);
      setStudentId(parsed.studentId);
      setStudentName(parsed.name || '');
    }

    // 임시저장 복원
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const d = JSON.parse(draft);
        if (d.pledge || d.step1 || d.step2 || d.step3) {
          setPledge(d.pledge || '');
          setStep1(d.step1 || ''); setStep2(d.step2 || ''); setStep3(d.step3 || '');
          setTags(d.tags || ''); setConfidence(d.confidence || '');
          setShowForm(true);
        }
      } catch { /* */ }
    }
  }, []);

  // 작성 중 자동 임시저장 (2초 디바운스)
  useEffect(() => {
    if (!showForm || editingNoteId) return;
    const timer = setTimeout(() => {
      const hasContent = pledge.trim() || step1.trim() || step2.trim() || step3.trim();
      if (hasContent) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          pledge, step1, step2, step3, tags, confidence,
        }));
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [showForm, editingNoteId, pledge, step1, step2, step3, tags, confidence]);

  const clearDraft = () => localStorage.removeItem(DRAFT_KEY);

  const fetchNotes = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notes?studentId=${studentId}`);
      const data = await res.json();
      // 실습일지는 별도 페이지이므로 제외
      setNotes((data.notes || []).filter((n: Note) => !n.tags?.includes('실습일지')));
    } catch { /* */ }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // 노트 목록이 바뀌면 코멘트 수 조회
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

  // 노트 펼칠 때 코멘트 불러오기
  useEffect(() => {
    if (expandedNoteId) {
      fetchComments(expandedNoteId);
      setCommentInput('');
    } else {
      setComments([]);
    }
  }, [expandedNoteId, fetchComments]);

  // 수정 모드 진입
  const startEdit = (note: Note) => {
    setEditingNoteId(note.id);
    // title이 "날짜 이름 / 교육일지" 형식이면 다짐은 비움, 아니면 title이 다짐
    const isAutoTitle = /^\d{4}-\d{2}-\d{2}\s.+\/\s교육일지$/.test(note.title);
    setPledge(isAutoTitle ? '' : note.title);
    const selfStudy = note.tags?.includes('자율학습') || false;
    setIsSelfStudyMode(selfStudy);
    setTags((note.tags || []).filter(t => t !== '자율학습').join(', '));
    setConfidence(selfStudy ? '' : (note.confidence || ''));
    setSaveError('');

    if (note.content_type === 'steps') {
      try {
        const steps = JSON.parse(note.content);
        setStep1(steps.step1 || ''); setStep2(steps.step2 || ''); setStep3(steps.step3 || '');
        setStepImages({
          step1: steps.step1_images || [],
          step2: steps.step2_images || [],
          step3: steps.step3_images || [],
        });
      } catch {
        setStep1(note.content); setStep2(''); setStep3('');
        setStepImages({ step1: [], step2: [], step3: [] });
      }
    } else {
      // blocks/text → step1에 텍스트로 넣기
      try {
        const parsed = JSON.parse(note.content);
        if (Array.isArray(parsed)) {
          setStep1(parsed.map(b => b.content || b.items?.join('\n') || '').join('\n\n'));
        } else {
          setStep1(note.content);
        }
      } catch {
        setStep1(note.content);
      }
      setStep2(''); setStep3('');
    }
    setShowForm(true);
    setExpandedNoteId(null);
  };

  const stepsHaveContent = step1.trim() || step2.trim() || step3.trim();

  // 자동 제목 생성: YYYY-MM-DD 이름 / 교육일지
  const autoTitle = (() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d} ${studentName || '교육생'} / 교육일지`;
  })();

  const handleSave = async () => {
    if (!stepsHaveContent) return;
    setSaving(true);
    setSaveError('');

    const stepsData = {
      step1: step1.trim(), step2: step2.trim(), step3: step3.trim(),
      step1_completed: !!step1.trim(),
      step2_completed: !!step2.trim(),
      step3_completed: !!step3.trim(),
      step1_images: stepImages.step1,
      step2_images: stepImages.step2,
      step3_images: stepImages.step3,
    };

    try {
      const isEdit = !!editingNoteId;
      const res = await fetch('/api/notes', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: editingNoteId } : { student_id: studentId }),
          title: pledge.trim() || (isSelfStudyMode ? autoTitle.replace('교육일지', '자율학습') : autoTitle),
          content: JSON.stringify(stepsData),
          content_type: 'steps',
          tags: [...(tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []), ...(isSelfStudyMode ? ['자율학습'] : [])],
          confidence: isSelfStudyMode ? null : (confidence || null),
          one_word: pledge.trim() || null,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setSaveError(result.message || '저장에 실패했어요');
        setSaving(false);
        return;
      }
      setShowForm(false);
      resetForm();
      clearDraft();
      fetchNotes();
    } catch { setSaveError('네트워크 오류가 발생했어요'); }
    setSaving(false);
  };

  // one_word를 pledge/다짐으로 API에 전달하기 위해 packContent 호환
  // (API의 packContent에서 extraMeta.one_word로 저장됨)

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제할까요?')) return;
    await fetch(`/api/notes?id=${id}`, { method: 'DELETE' });
    if (editingNoteId === id) { setShowForm(false); resetForm(); }
    fetchNotes();
  };

  // 검색 필터
  const filteredNotes = searchQuery.trim()
    ? notes.filter(n => {
        const q = searchQuery.toLowerCase();
        if (n.title.toLowerCase().includes(q)) return true;
        if (n.tags?.some(t => t.toLowerCase().includes(q))) return true;
        if (n.one_word?.toLowerCase().includes(q)) return true;
        // steps 타입이면 steps 내부 텍스트도 검색
        if (n.content_type === 'steps') {
          try {
            const steps = JSON.parse(n.content);
            if ([steps.step1, steps.step2, steps.step3].some(s => s && s.toLowerCase().includes(q))) return true;
          } catch { /* */ }
        }
        if (n.content.toLowerCase().includes(q)) return true;
        return false;
      })
    : notes;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📓 교육일지</h2>
        <div style={{ display: 'flex', gap: 8 }}>
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
            {showForm ? '✕ 닫기' : '✏️ 새 교육일지'}
          </button>
        </div>
      </div>

      {/* 검색 */}
      {!showForm && notes.length > 0 && (
        <div style={{ position: 'relative' }}>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="교육일지 검색... (제목, 내용, 태그)"
            style={{ ...inputStyle, paddingLeft: 40 }}
          />
          <span style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            fontSize: 16, color: 'var(--text-muted)', pointerEvents: 'none',
          }}>🔍</span>
        </div>
      )}

      {/* 작성 폼 — STEP 구조 */}
      {showForm && (
        <div style={{ ...card, ...(isSelfStudyMode ? { border: '1px solid rgba(191,90,242,0.4)', background: 'rgba(191,90,242,0.04)' } : {}) }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {isSelfStudyMode ? '📚 자율학습 노트' : editingNoteId ? '✏️ 교육일지 수정' : '✨ 오늘의 교육일지'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!isSelfStudyMode && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, textAlign: 'right', lineHeight: 1.3 }}>
                  따로 공부한 내용은 자율학습으로!
                </span>
              )}
              <button
                onClick={() => setIsSelfStudyMode(!isSelfStudyMode)}
                style={{
                  padding: '6px 16px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  border: isSelfStudyMode ? '2px solid var(--purple)' : '1px solid var(--border)',
                  background: isSelfStudyMode ? 'rgba(191,90,242,0.15)' : 'transparent',
                  color: isSelfStudyMode ? 'var(--purple)' : 'var(--text-tertiary)',
                  fontSize: 13, fontWeight: 600, transition: 'all 0.15s ease', whiteSpace: 'nowrap',
                }}
              >
                {isSelfStudyMode ? '📚 자율학습 ON' : '📚 자율학습'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 오늘의 다짐 (선택) */}
            <div>
              <label style={labelStyle}>{isSelfStudyMode ? '학습 주제' : '오늘의 다짐'} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(선택)</span></label>
              <input value={pledge} onChange={e => setPledge(e.target.value)}
                placeholder={isSelfStudyMode ? '무엇을 공부했나요? (안 쓰면 자동 제목)' : '오늘의 각오나 다짐을 한 문장으로! (안 쓰면 자동 제목)'}
                style={{ ...inputStyle, fontSize: 15 }} />
            </div>

            {/* 오늘의 자신감 (자율학습이면 숨김) */}
            {!isSelfStudyMode && (
              <div>
                <label style={labelStyle}>오늘의 자신감</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {CONFIDENCE.map(opt => (
                    <button key={opt.value}
                      onClick={() => setConfidence(confidence === opt.value ? '' : opt.value)}
                      style={{
                        padding: '12px 8px', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'center',
                        border: confidence === opt.value ? '2px solid var(--blue)' : '1px solid var(--border)',
                        background: confidence === opt.value ? 'var(--blue-dim)' : 'var(--bg-elevated)',
                      }}
                    >
                      <div style={{ fontSize: 24, marginBottom: 4 }}>{opt.icon}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 태그 */}
            <div>
              <label style={labelStyle}>태그</label>
              <input value={tags} onChange={e => setTags(e.target.value)}
                placeholder="소재, 색상, 규격 (쉼표로 구분)" style={inputStyle} />
            </div>

            {/* STEP 1/2/3 에디터 (자율학습이면 STEP 1만) */}
            {(isSelfStudyMode ? [STEP_DEFS[0]] : STEP_DEFS).map(({ key, label, icon, desc, placeholder }) => {
              const val = key === 'step1' ? step1 : key === 'step2' ? step2 : step3;
              const setVal = key === 'step1' ? setStep1 : key === 'step2' ? setStep2 : setStep3;
              const textareaId = `step-textarea-${key}`;

              const insertFormat = (prefix: string, suffix?: string) => {
                const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
                if (!el) return;
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const selected = val.slice(start, end);
                const before = val.slice(0, start);
                const after = val.slice(end);
                if (suffix !== undefined) {
                  // 감싸기 (볼드)
                  setVal(before + prefix + (selected || '텍스트') + suffix + after);
                } else {
                  // 줄 시작에 삽입 (불릿, 제목)
                  const lineStart = before.lastIndexOf('\n') + 1;
                  const newVal = val.slice(0, lineStart) + prefix + val.slice(lineStart);
                  setVal(newVal);
                }
                setTimeout(() => el.focus(), 50);
              };

              const stepLabel = isSelfStudyMode ? '📚 학습 내용' : `${icon} ${label}`;
              const stepDesc = isSelfStudyMode ? '자유롭게 정리해보세요' : desc;
              const stepPlaceholder = isSelfStudyMode ? '공부한 내용을 자유롭게 정리해주세요.\n\n표, 목록, 제목 등 서식을 활용하면 나중에 찾아보기 좋아요!' : placeholder;

              return (
                <div key={key} style={{
                  border: isSelfStudyMode ? '1px solid rgba(191,90,242,0.3)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-elevated)', overflow: 'hidden',
                }}>
                  {/* STEP 헤더 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: val.trim() ? (isSelfStudyMode ? 'rgba(191,90,242,0.06)' : 'var(--step-filled-bg)') : 'var(--bg-hover)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{stepLabel}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{stepDesc}</span>
                    </div>
                    {val.trim() && (
                      <span style={{
                        padding: '2px 10px', borderRadius: 'var(--radius-pill)',
                        background: isSelfStudyMode ? 'var(--purple)' : 'var(--step-filled-badge-bg)', color: '#fff',
                        fontSize: 12, fontWeight: 600,
                      }}>✓ 작성됨</span>
                    )}
                  </div>
                  {/* 서식 도구 바 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '6px 16px',
                    borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)',
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>서식:</span>
                    <FormatBtn label="● 목록" title="줄 앞에 - 추가" onClick={() => insertFormat('- ')} />
                    <FormatBtn label="B 굵게" title="선택한 텍스트를 굵게" onClick={() => insertFormat('**', '**')} />
                    <FormatBtn label="# 제목" title="줄을 제목으로" onClick={() => insertFormat('### ')} />
                    <FormatBtn label="1. 번호" title="줄 앞에 번호 추가" onClick={() => insertFormat('1. ')} />
                  </div>
                  {/* STEP 텍스트 입력 */}
                  <textarea
                    id={textareaId}
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    placeholder={stepPlaceholder}
                    rows={5}
                    style={{
                      ...inputStyle, resize: 'vertical', lineHeight: 1.6,
                      border: 'none', borderRadius: 0, background: 'transparent',
                      padding: '14px 16px', minHeight: 120,
                    }}
                  />
                  {/* 이미지 첨부 영역 */}
                  <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: stepImages[key]?.length > 0 ? 10 : 0 }}>
                      <label style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)', background: 'transparent',
                        color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600,
                        cursor: uploadingStep === key ? 'wait' : 'pointer',
                        transition: 'all 0.15s ease',
                      }}>
                        {uploadingStep === key ? '업로드 중...' : '📷 사진 첨부'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          style={{ display: 'none' }}
                          onChange={e => handleImageUpload(key, e.target.files)}
                          disabled={uploadingStep === key}
                        />
                      </label>
                      {stepImages[key]?.length > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {stepImages[key].length}장 첨부됨
                        </span>
                      )}
                    </div>
                    {/* 첨부된 이미지 미리보기 */}
                    {stepImages[key]?.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {stepImages[key].map((url, imgIdx) => (
                          <div key={imgIdx} style={{ position: 'relative', width: 80, height: 80 }}>
                            <img
                              src={url}
                              alt={`첨부 ${imgIdx + 1}`}
                              style={{
                                width: 80, height: 80, objectFit: 'cover',
                                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                              }}
                            />
                            <button
                              onClick={() => removeImage(key, imgIdx)}
                              style={{
                                position: 'absolute', top: -6, right: -6,
                                width: 20, height: 20, borderRadius: '50%',
                                background: 'var(--red)', color: '#fff',
                                border: 'none', fontSize: 12, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 에러 메시지 */}
            {saveError && (
              <div style={{
                padding: '10px 16px', borderRadius: 'var(--radius-md)',
                background: 'rgba(255,69,58,0.12)', color: 'var(--red)',
                fontSize: 14, fontWeight: 600,
              }}>
                {saveError}
              </div>
            )}

            {/* 저장 버튼 */}
            <button onClick={handleSave} disabled={saving || !stepsHaveContent}
              style={{
                padding: '14px', borderRadius: 'var(--radius-md)', border: 'none',
                background: stepsHaveContent ? 'var(--blue)' : 'var(--bg-elevated)',
                color: stepsHaveContent ? '#fff' : 'var(--text-muted)',
                fontSize: 16, fontWeight: 600,
                cursor: stepsHaveContent ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? '저장 중...' : editingNoteId ? '수정 완료' : '저장하기'}
            </button>
          </div>
        </div>
      )}

      {/* 검색 결과 안내 */}
      {searchQuery.trim() && (
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          &quot;{searchQuery}&quot; 검색 결과: {filteredNotes.length}건
        </div>
      )}

      {/* 노트 카드 그리드 */}
      {filteredNotes.length > 0 ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {filteredNotes.map(note => {
              const isSelected = expandedNoteId === note.id;
              const isSelfStudy = note.tags?.includes('자율학습');
              const conf = (!isSelfStudy && note.confidence) ? CONFIDENCE.find(o => o.value === note.confidence) : null;
              const dateObj = new Date(note.created_at);
              const month = dateObj.getMonth() + 1;
              const day = dateObj.getDate();
              const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
              const dayName = dayNames[dateObj.getDay()];
              const displayTags = (note.tags || []).filter(t => t !== '자율학습');
              return (
                <button
                  key={note.id}
                  onClick={() => setExpandedNoteId(isSelected ? null : note.id)}
                  style={{
                    padding: 20, borderRadius: 'var(--radius-md)', textAlign: 'left',
                    border: isSelected ? '2px solid var(--blue)' : isSelfStudy ? '1px solid rgba(191,90,242,0.4)' : '1px solid var(--border)',
                    background: isSelected ? 'var(--blue-dim)' : isSelfStudy ? 'rgba(191,90,242,0.06)' : 'var(--bg-surface)',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  {/* 날짜 + 자율학습 배지 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {month}/{day} ({dayName})
                    </span>
                    {isSelfStudy && (
                      <span style={{
                        padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700,
                        background: 'rgba(191,90,242,0.15)', color: 'var(--purple)',
                      }}>📚 자율학습</span>
                    )}
                  </div>
                  {/* 제목 */}
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {note.title}
                  </div>
                  {/* 자신감 + 메타 (자율학습이면 숨김) */}
                  {!isSelfStudy && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {conf && (
                        <span style={{ fontSize: 13 }}>
                          {conf.icon} {conf.label}
                        </span>
                      )}
                      {note.participation_score != null && note.participation_score > 0 && (
                        <span style={{
                          padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700,
                          background: note.participation_score >= 3 ? 'rgba(48,209,88,0.12)' : note.participation_score >= 1 ? 'rgba(255,159,10,0.12)' : 'rgba(255,69,58,0.12)',
                          color: note.participation_score >= 3 ? 'var(--green)' : note.participation_score >= 1 ? 'var(--orange)' : 'var(--red)',
                        }}>
                          참여 {note.participation_score}/3
                        </span>
                      )}
                      {note.best_learning && (
                        <span style={{ fontSize: 12 }}>⭐ 우수</span>
                      )}
                    </div>
                  )}
                  {/* STEP 완료 현황 (steps 타입, 자율학습 제외) */}
                  {!isSelfStudy && note.content_type === 'steps' && (() => {
                    try {
                      const steps = JSON.parse(note.content);
                      const filled = [!!steps.step1?.trim(), !!steps.step2?.trim(), !!steps.step3?.trim()];
                      const done = filled.filter(Boolean).length;
                      return (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {['📝', '💡', '🎯'].map((icon, i) => {
                            const completed = filled[i];
                            return (
                              <span key={i} style={{
                                fontSize: 15, padding: '2px 6px', borderRadius: 'var(--radius-pill)',
                                background: completed ? 'rgba(48,209,88,0.12)' : 'var(--bg-hover)',
                                opacity: completed ? 1 : 0.3,
                              }}>
                                {icon}
                              </span>
                            );
                          })}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{done}/3</span>
                        </div>
                      );
                    } catch { return null; }
                  })()}
                  {/* 태그 (자율학습 태그는 배지로 이미 표시했으므로 제외) */}
                  {displayTags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {displayTags.slice(0, 3).map(tag => (
                        <span key={tag} style={{
                          padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                          background: isSelfStudy ? 'rgba(191,90,242,0.12)' : 'var(--blue-dim)',
                          color: isSelfStudy ? 'var(--purple)' : 'var(--blue-light)',
                          fontSize: 11, fontWeight: 600,
                        }}>{tag}</span>
                      ))}
                      {displayTags.length > 3 && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{displayTags.length - 3}</span>
                      )}
                    </div>
                  )}
                  {/* 코멘트 뱃지 */}
                  {(commentCounts[note.id] || 0) > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                        background: 'rgba(0,122,255,0.1)', color: 'var(--blue-light)',
                        fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                        💬 {commentCounts[note.id]}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* 선택된 노트 상세 */}
          {expandedNoteId && (() => {
            const note = filteredNotes.find(n => n.id === expandedNoteId);
            if (!note) return null;
            const isSelfStudy = note.tags?.includes('자율학습');
            const conf = (!isSelfStudy && note.confidence) ? CONFIDENCE.find(o => o.value === note.confidence) : null;
            return (
              <div style={{ ...card, ...(isSelfStudy ? { border: '1px solid rgba(191,90,242,0.3)', background: 'rgba(191,90,242,0.04)' } : {}) }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        {note.title}
                      </h3>
                      {isSelfStudy && (
                        <span style={{
                          padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700,
                          background: 'rgba(191,90,242,0.15)', color: 'var(--purple)',
                        }}>📚 자율학습</span>
                      )}
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {new Date(note.created_at).toLocaleDateString('ko', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {conf && (
                      <span style={{
                        padding: '4px 12px', borderRadius: 'var(--radius-pill)',
                        background: 'var(--bg-elevated)', fontSize: 14,
                      }}>
                        {conf.icon} {conf.label}
                      </span>
                    )}
                    {!isSelfStudy && note.participation_score != null && (
                      <span style={{
                        padding: '4px 12px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 700,
                        background: note.participation_score >= 3 ? 'rgba(48,209,88,0.12)' : 'rgba(255,159,10,0.12)',
                        color: note.participation_score >= 3 ? 'var(--green)' : 'var(--orange)',
                      }}>
                        참여 {note.participation_score}/3
                      </span>
                    )}
                    {!isSelfStudy && note.best_learning && (
                      <span style={{
                        padding: '4px 12px', borderRadius: 'var(--radius-pill)',
                        background: 'rgba(255,159,10,0.12)', color: 'var(--orange)', fontSize: 13, fontWeight: 600,
                      }}>
                        ⭐ 우수학습
                      </span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); startEdit(note); }}
                      style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 13, cursor: 'pointer' }}>
                      수정
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}
                      style={{ padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                      삭제
                    </button>
                  </div>
                </div>
                {note.tags && note.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                    {note.tags.map(tag => (
                      <span key={tag} style={{
                        padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                        background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 13, fontWeight: 600,
                      }}>{tag}</span>
                    ))}
                  </div>
                )}
                <BlockRenderer content={note.content} contentType={note.content_type} searchQuery={searchQuery} />

                {/* 코멘트 영역 — 관리자 코멘트가 있을 때만 표시 */}
                {comments.length > 0 && (
                <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>💬</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      코멘트 ({comments.length})
                    </span>
                  </div>

                  {/* 코멘트 목록 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 300, overflowY: 'auto', padding: '0 4px' }}>
                    {comments.map(c => (
                      <div
                        key={c.id}
                        style={{
                          display: 'flex', flexDirection: 'column',
                          alignItems: c.author_role === 'student' ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span>{c.author_role === 'admin' ? '🧑‍🏫' : '🧑‍🎓'} {c.author_name}</span>
                          <span>{new Date(c.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div style={{
                          maxWidth: '80%', padding: '10px 14px',
                          borderRadius: c.author_role === 'student' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          background: c.author_role === 'student' ? 'var(--blue)' : 'var(--bg-elevated)',
                          color: c.author_role === 'student' ? '#fff' : 'var(--text-primary)',
                          fontSize: 14, lineHeight: 1.5,
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          {c.content}
                        </div>
                      </div>
                    ))}
                    <div ref={commentEndRef} />
                  </div>

                  {/* 답글 입력란 */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea
                      value={commentInput}
                      onChange={e => setCommentInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendStudentComment(note.id);
                        }
                      }}
                      placeholder="답글을 남겨보세요... (Enter로 전송)"
                      rows={1}
                      style={{
                        flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                        resize: 'none', minHeight: 42, maxHeight: 120,
                        fontFamily: 'inherit', boxSizing: 'border-box',
                      }}
                      onInput={e => {
                        const t = e.currentTarget;
                        t.style.height = 'auto';
                        t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                      }}
                    />
                    <button
                      onClick={() => sendStudentComment(note.id)}
                      disabled={!commentInput.trim() || sendingComment}
                      style={{
                        padding: '10px 18px', borderRadius: 'var(--radius-md)',
                        border: 'none', background: commentInput.trim() ? 'var(--blue)' : 'var(--bg-hover)',
                        color: commentInput.trim() ? '#fff' : 'var(--text-muted)',
                        fontSize: 14, fontWeight: 600, cursor: commentInput.trim() ? 'pointer' : 'default',
                        transition: 'all 0.15s ease', flexShrink: 0,
                      }}
                    >
                      {sendingComment ? '...' : '전송'}
                    </button>
                  </div>
                </div>
                )}
              </div>
            );
          })()}
        </>
      ) : (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>📓</p>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', marginBottom: 8 }}>
            {searchQuery ? '검색 결과가 없어요' : '아직 작성한 교육일지가 없어요'}
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {searchQuery ? '다른 키워드로 검색해보세요' : '매일 배운 내용을 정리하면 실력이 쑥쑥 올라요!'}
          </p>
        </div>
      )}
    </div>
  );
}

// ── 인라인 서식 파서 ──
// **볼드**, *기울임*, __밑줄__, ~~취소선~~, `코드`

function renderInlineFormat(text: string, searchQuery?: string): React.ReactNode {
  // 검색어 하이라이트 + 인라인 서식 처리
  const formatRegex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(__(.+?)__)|(\~\~(.+?)\~\~)|(`(.+?)`)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  const highlightText = (t: string) => {
    if (!searchQuery?.trim()) return t;
    const q = searchQuery.trim();
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const segs = t.split(regex);
    return segs.map((seg, i) =>
      regex.test(seg)
        ? <mark key={i} style={{ background: 'rgba(255,230,0,0.35)', color: 'var(--text-primary)', borderRadius: 3, padding: '1px 3px', fontWeight: 600 }}>{seg}</mark>
        : seg
    );
  };

  while ((match = formatRegex.exec(text)) !== null) {
    // 매치 전 텍스트
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{highlightText(text.slice(lastIndex, match.index))}</span>);
    }

    if (match[2]) {
      // **볼드**
      parts.push(<strong key={key++}>{highlightText(match[2])}</strong>);
    } else if (match[4]) {
      // *기울임*
      parts.push(<em key={key++}>{highlightText(match[4])}</em>);
    } else if (match[6]) {
      // __밑줄__
      parts.push(<span key={key++} style={{ textDecoration: 'underline' }}>{highlightText(match[6])}</span>);
    } else if (match[8]) {
      // ~~취소선~~
      parts.push(<del key={key++} style={{ color: 'var(--text-muted)' }}>{highlightText(match[8])}</del>);
    } else if (match[10]) {
      // `코드`
      parts.push(
        <code key={key++} style={{
          background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: 4,
          fontFamily: 'monospace', fontSize: '0.9em', color: 'var(--blue-light)',
        }}>{highlightText(match[10])}</code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // 나머지 텍스트
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{highlightText(text.slice(lastIndex))}</span>);
  }

  return parts.length > 0 ? parts : highlightText(text);
}

// ── 블록 에디터 컴포넌트 ──

function HeadingEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  return (
    <input
      value={block.content}
      onChange={e => onChange({ content: e.target.value })}
      placeholder="섹션 제목을 입력하세요..."
      style={{
        ...inputStyle, border: 'none', background: 'transparent', padding: 0,
        fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
      }}
    />
  );
}

function TextBlockEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  return (
    <div>
      <textarea
        value={block.content}
        onChange={e => onChange({ content: e.target.value })}
        placeholder="내용을 입력하세요... (**볼드**, *기울임*, __밑줄__, `코드`)"
        rows={4}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, border: 'none', background: 'transparent', padding: 0 }}
      />
      {/* 서식 미리보기 */}
      {block.content.trim() && /[*_~`]/.test(block.content) && (
        <div style={{
          marginTop: 8, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-hover)', fontSize: 14, color: 'var(--text-second)',
          lineHeight: 1.7,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>미리보기</div>
          {block.content.split('\n').map((line, i) => (
            <div key={i}>{renderInlineFormat(line)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function NumberedListEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const updateItem = (idx: number, val: string) => {
    const items = [...block.items];
    items[idx] = val;
    onChange({ items });
  };
  const addItem = (afterIdx: number) => {
    const items = [...block.items];
    items.splice(afterIdx + 1, 0, '');
    onChange({ items });
    setTimeout(() => inputRefs.current[afterIdx + 1]?.focus(), 50);
  };
  const removeItem = (idx: number) => {
    if (block.items.length <= 1) return;
    const items = block.items.filter((_, i) => i !== idx);
    onChange({ items });
  };
  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(idx);
    }
    if (e.key === 'Backspace' && block.items[idx] === '' && block.items.length > 1) {
      e.preventDefault();
      removeItem(idx);
      setTimeout(() => inputRefs.current[Math.max(0, idx - 1)]?.focus(), 50);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {block.items.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            minWidth: 24, height: 24, borderRadius: '50%',
            background: 'var(--blue-dim)', color: 'var(--blue-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, flexShrink: 0,
          }}>{idx + 1}</span>
          <input
            ref={el => { inputRefs.current[idx] = el; }}
            value={item}
            onChange={e => updateItem(idx, e.target.value)}
            onKeyDown={e => handleKeyDown(e, idx)}
            placeholder={`${idx + 1}번 항목을 입력하세요 (Enter로 다음 항목)`}
            style={{ ...inputStyle, border: 'none', background: 'transparent', padding: '8px 0', flex: 1 }}
          />
        </div>
      ))}
      <button onClick={() => addItem(block.items.length - 1)} style={{
        padding: '6px 12px', border: 'none', background: 'transparent',
        color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
      }}>
        + 항목 추가
      </button>
    </div>
  );
}

function TableEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  const updateHeader = (idx: number, val: string) => {
    const headers = [...block.headers];
    headers[idx] = val;
    onChange({ headers });
  };
  const updateCell = (rowIdx: number, colIdx: number, val: string) => {
    const rows = block.rows.map(r => [...r]);
    rows[rowIdx][colIdx] = val;
    onChange({ rows });
  };
  const addRow = () => {
    const rows = [...block.rows, Array(block.headers.length).fill('')];
    onChange({ rows });
  };
  const removeRow = (idx: number) => {
    if (block.rows.length <= 1) return;
    onChange({ rows: block.rows.filter((_, i) => i !== idx) });
  };
  const addCol = () => {
    onChange({
      headers: [...block.headers, `열${block.headers.length + 1}`],
      rows: block.rows.map(r => [...r, '']),
    });
  };
  const removeCol = (idx: number) => {
    if (block.headers.length <= 2) return;
    onChange({
      headers: block.headers.filter((_, i) => i !== idx),
      rows: block.rows.map(r => r.filter((_, i) => i !== idx)),
    });
  };

  const cellStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: 14, color: 'var(--text-primary)',
    background: 'transparent', border: 'none', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  };

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              {block.headers.map((h, ci) => (
                <th key={ci} style={{
                  padding: 0, borderBottom: '2px solid var(--border)',
                  background: 'var(--bg-hover)', position: 'relative',
                }}>
                  <input value={h} onChange={e => updateHeader(ci, e.target.value)}
                    style={{ ...cellStyle, fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}
                    placeholder="열 이름"
                  />
                  {block.headers.length > 2 && (
                    <button onClick={() => removeCol(ci)} style={{
                      position: 'absolute', top: 2, right: 2, border: 'none', background: 'transparent',
                      color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer', padding: '2px 4px',
                    }}>✕</button>
                  )}
                </th>
              ))}
              <th style={{ width: 32, borderBottom: '2px solid var(--border)', background: 'var(--bg-hover)' }} />
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                    <input value={cell} onChange={e => updateCell(ri, ci, e.target.value)}
                      style={cellStyle} placeholder="입력..."
                    />
                  </td>
                ))}
                <td style={{ borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                  {block.rows.length > 1 && (
                    <button onClick={() => removeRow(ri)} style={{
                      border: 'none', background: 'transparent',
                      color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                    }}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={addRow} style={{
          padding: '6px 12px', border: 'none', background: 'transparent',
          color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
        }}>+ 행 추가</button>
        <button onClick={addCol} style={{
          padding: '6px 12px', border: 'none', background: 'transparent',
          color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
        }}>+ 열 추가</button>
      </div>
    </div>
  );
}

function QuoteEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 12px',
    }}>
      <textarea
        value={block.content}
        onChange={e => onChange({ content: e.target.value })}
        placeholder="강조하고 싶은 내용을 입력하세요..."
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, border: 'none', background: 'transparent', padding: 0, fontStyle: 'italic' }}
      />
    </div>
  );
}

// ── 블록 렌더러 (저장된 노트 표시용) ──

// ── 마크다운 라인 렌더러 (STEP 내용용) ──
function renderMarkdownLines(text: string, searchQuery: string): React.ReactNode {
  // 멀티라인 테이블 셀 병합: |로 시작하지만 |로 안 끝나는 줄 → 다음 줄과 합침
  const rawLines = text.split('\n');
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    if (t.startsWith('|') && !t.endsWith('|')) {
      // |로 시작했지만 |로 안 끝남 → 다음 줄들과 합쳐서 |로 끝날 때까지
      let merged = rawLines[i];
      while (i + 1 < rawLines.length && !merged.trim().endsWith('|')) {
        i++;
        merged += ' ' + rawLines[i].trim();
      }
      lines.push(merged);
    } else {
      lines.push(rawLines[i]);
    }
  }
  const elements: React.ReactNode[] = [];
  let bulletGroup: { text: string; indent: number }[] = [];
  let tableRows: string[][] = [];
  let key = 0;

  const flushBullets = () => {
    if (bulletGroup.length === 0) return;
    elements.push(
      <div key={key++} style={{ display: 'flex', flexDirection: 'column', gap: 3, margin: '3px 0' }}>
        {bulletGroup.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingLeft: b.indent * 16 }}>
            <span style={{
              minWidth: 5, height: 5, borderRadius: '50%', flexShrink: 0, marginTop: 7,
              background: b.indent > 0 ? 'var(--text-muted)' : 'var(--blue-light)',
            }} />
            <span style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.55 }}>
              {renderInlineFormat(b.text, searchQuery)}
            </span>
          </div>
        ))}
      </div>
    );
    bulletGroup = [];
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const dataRows = tableRows.filter(row => !row.every(cell => /^[-:\s]+$/.test(cell)));
    if (dataRows.length === 0) { tableRows = []; return; }
    const headers = dataRows[0];
    const body = dataRows.slice(1);
    elements.push(
      <div key={key++} style={{ overflowX: 'auto', margin: '6px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={{
                  padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap',
                  borderBottom: '2px solid var(--border)', background: 'var(--bg-hover)',
                  color: 'var(--text-muted)', fontSize: 12, fontWeight: 700,
                }}>{renderInlineFormat(h.trim(), searchQuery)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '6px 10px', borderBottom: '1px solid var(--border)',
                    color: 'var(--text-second)', fontSize: 13, lineHeight: 1.4,
                  }}>{renderInlineFormat(cell.trim(), searchQuery)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  for (const line of lines) {
    // 마크다운 표: | col1 | col2 |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushBullets();
      const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
      tableRows.push(cells);
      continue;
    }
    if (tableRows.length > 0) flushTable();

    // 불릿 라인: - 또는 • 로 시작 (띄어쓰기 있든 없든)
    const bulletMatch = line.match(/^(\s*)[•\-]\s*(.+)/);
    if (bulletMatch && !line.trim().startsWith('---')) {
      flushTable();
      const indent = Math.floor(bulletMatch[1].length / 2);
      bulletGroup.push({ text: bulletMatch[2], indent });
      continue;
    }

    flushBullets();

    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={key++} style={{ height: 6 }} />);
      continue;
    }

    // ### 마크다운 제목
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      elements.push(
        <div key={key++} style={{
          fontSize: level <= 2 ? 16 : level === 3 ? 15 : 14,
          fontWeight: 700, color: 'var(--text-primary)',
          marginTop: level <= 2 ? 10 : 6,
          paddingBottom: level <= 2 ? 4 : 0,
          borderBottom: level <= 2 ? '2px solid var(--border)' : 'none',
        }}>
          {renderInlineFormat(headingMatch[2], searchQuery)}
        </div>
      );
      continue;
    }

    // 번호 리스트: 1. 2. 3.
    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
    if (numMatch) {
      elements.push(
        <div key={key++} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{
            minWidth: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
            background: 'var(--blue-dim)', color: 'var(--blue-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
          }}>{numMatch[1]}</span>
          <span style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.5 }}>
            {renderInlineFormat(numMatch[2], searchQuery)}
          </span>
        </div>
      );
      continue;
    }

    // 일반 텍스트 (### 헤딩만 제목, 나머지는 본문)
    elements.push(
      <div key={key++} style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6 }}>
        {renderInlineFormat(trimmed, searchQuery)}
      </div>
    );
  }
  flushBullets();
  flushTable();

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{elements}</div>;
}

function StepImagesGrid({ images }: { images: string[] }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  if (!images || images.length === 0) return null;
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0 4px' }}>
        {images.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`첨부 ${i + 1}`}
            onClick={() => setLightboxIdx(i)}
            style={{
              width: 120, height: 120, objectFit: 'cover',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              cursor: 'pointer', transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          />
        ))}
      </div>
      {lightboxIdx !== null && (
        <div
          onClick={() => setLightboxIdx(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <img
            src={images[lightboxIdx]}
            alt="확대 보기"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }}
            onClick={e => e.stopPropagation()}
          />
          {images.length > 1 && (
            <div style={{ position: 'absolute', bottom: 32, display: 'flex', gap: 12 }}>
              <button
                onClick={e => { e.stopPropagation(); setLightboxIdx((lightboxIdx - 1 + images.length) % images.length); }}
                style={{ padding: '10px 20px', borderRadius: 'var(--radius-md)', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 16, cursor: 'pointer' }}
              >◀ 이전</button>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, alignSelf: 'center' }}>{lightboxIdx + 1} / {images.length}</span>
              <button
                onClick={e => { e.stopPropagation(); setLightboxIdx((lightboxIdx + 1) % images.length); }}
                style={{ padding: '10px 20px', borderRadius: 'var(--radius-md)', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 16, cursor: 'pointer' }}
              >다음 ▶</button>
            </div>
          )}
          <button
            onClick={() => setLightboxIdx(null)}
            style={{
              position: 'absolute', top: 20, right: 20,
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: 'none', fontSize: 20, cursor: 'pointer',
            }}
          >×</button>
        </div>
      )}
    </>
  );
}

function StepsRenderer({ content, searchQuery }: { content: string; searchQuery: string }) {
  try {
    const steps = JSON.parse(content);
    const stepSections = [
      { key: 'step1', label: 'STEP 1 — 핵심 필기', icon: '📝', completed: steps.step1_completed },
      { key: 'step2', label: 'STEP 2 — LSA 비법서', icon: '💡', completed: steps.step2_completed },
      { key: 'step3', label: 'STEP 3 — 실전 적용', icon: '🎯', completed: steps.step3_completed },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {stepSections.map(({ key, label, icon, completed }) => {
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
                background: completed ? 'var(--step-filled-bg)' : 'var(--bg-elevated)',
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{icon} {label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {images && images.length > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📷 {images.length}장</span>
                  )}
                  {completed && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ 완료</span>}
                </div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {text && renderMarkdownLines(text, searchQuery)}
                <StepImagesGrid images={images || []} />
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

function BlockRenderer({ content, contentType, searchQuery }: { content: string; contentType?: string; searchQuery: string }) {
  // STEP 구조 (노션 임포트)
  if (contentType === 'steps') {
    return <StepsRenderer content={content} searchQuery={searchQuery} />;
  }

  const blocks = parseContent(content);

  // 기존 플레인텍스트 (하위 호환)
  if (!blocks) {
    return (
      <div style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.8 }}>
        {content.split('\n').map((line, i) => (
          <div key={i}>{line.trim() ? renderInlineFormat(line, searchQuery) : <br />}</div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {blocks.map(block => {
        if (block.type === 'heading') {
          return (
            <h3 key={block.id} style={{
              fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
              margin: 0, paddingBottom: 8, borderBottom: '2px solid var(--border)',
            }}>
              {renderInlineFormat(block.content, searchQuery)}
            </h3>
          );
        }

        if (block.type === 'text') {
          return (
            <div key={block.id} style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.8 }}>
              {block.content.split('\n').map((line, i) => (
                <div key={i}>{line.trim() ? renderInlineFormat(line, searchQuery) : <br />}</div>
              ))}
            </div>
          );
        }

        if (block.type === 'numbered-list') {
          return (
            <div key={block.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {block.items.filter(i => i.trim()).map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{
                    minWidth: 24, height: 24, borderRadius: '50%',
                    background: 'var(--blue-dim)', color: 'var(--blue-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2,
                  }}>{idx + 1}</span>
                  <span style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.7 }}>
                    {renderInlineFormat(item, searchQuery)}
                  </span>
                </div>
              ))}
            </div>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={block.id} style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    {block.headers.map((h, i) => (
                      <th key={i} style={{
                        padding: '10px 14px', textAlign: 'left',
                        borderBottom: '2px solid var(--border)',
                        background: 'var(--bg-hover)', color: 'var(--text-muted)',
                        fontSize: 13, fontWeight: 700,
                      }}>{renderInlineFormat(h, searchQuery)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{
                          padding: '10px 14px', borderBottom: '1px solid var(--border)',
                          color: 'var(--text-second)', fontSize: 14,
                        }}>{renderInlineFormat(cell, searchQuery)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'quote') {
          return (
            <div key={block.id} style={{
              fontSize: 15, color: 'var(--text-second)', lineHeight: 1.7,
              fontStyle: 'italic',
              background: 'var(--bg-hover)', padding: '12px 16px', borderRadius: 'var(--radius-md)',
            }}>
              {block.content.split('\n').map((line, i) => (
                <div key={i}>{line.trim() ? renderInlineFormat(line, searchQuery) : <br />}</div>
              ))}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

// ── 공용 ──

function MiniBtn({ onClick, children, color }: { onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '2px 6px', border: 'none', background: 'transparent',
      color: color || 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
    }}>{children}</button>
  );
}

function FormatBtn({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: '3px 10px', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)', background: 'transparent',
        color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue-light)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
    >
      {label}
    </button>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8,
};
