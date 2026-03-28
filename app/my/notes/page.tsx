'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── 타입 ──
interface Note { id: string; title: string; content: string; tags: string[]; confidence: string | null; created_at: string; }

type BlockType = 'text' | 'numbered-list' | 'table' | 'quote';
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
    if (b.type === 'text' || b.type === 'quote') return b.content.trim().length > 0;
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

// ── 메인 ──
export default function MyNotesPage() {
  const [studentId, setStudentId] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([newBlock('text')]);
  const [tags, setTags] = useState('');
  const [confidence, setConfidence] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  const DRAFT_KEY = 'iloom-note-draft';

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) setStudentId(JSON.parse(auth).studentId);

    // 임시저장 복원
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const d = JSON.parse(draft);
        if (d.title || d.tags || d.confidence || (d.blocks && blocksHaveContent(d.blocks))) {
          setTitle(d.title || '');
          setBlocks(d.blocks || [newBlock('text')]);
          setTags(d.tags || '');
          setConfidence(d.confidence || '');
          setShowForm(true);
        }
      } catch { /* */ }
    }
  }, []);

  // 작성 중 자동 임시저장 (2초 디바운스)
  useEffect(() => {
    if (!showForm) return;
    const timer = setTimeout(() => {
      const hasContent = title.trim() || tags.trim() || confidence || blocksHaveContent(blocks);
      if (hasContent) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, blocks, tags, confidence }));
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [showForm, title, blocks, tags, confidence]);

  // 저장 완료 또는 폼 닫을 때 임시저장 삭제
  const clearDraft = () => localStorage.removeItem(DRAFT_KEY);

  const fetchNotes = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notes?studentId=${studentId}`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch { /* */ }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // 블록 조작
  const updateBlock = (id: string, patch: Partial<Block>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  };
  const addBlock = (type: BlockType) => {
    setBlocks(prev => [...prev, newBlock(type)]);
  };
  const removeBlock = (id: string) => {
    setBlocks(prev => prev.length <= 1 ? prev : prev.filter(b => b.id !== id));
  };
  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  const handleSave = async () => {
    if (!title.trim() || !blocksHaveContent(blocks)) return;
    setSaving(true);
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId, title,
          content: JSON.stringify(blocks),
          tags: tags ? tags.split(',').map(t => t.trim()) : [],
          confidence: confidence || null,
        }),
      });
      setShowForm(false);
      setTitle(''); setBlocks([newBlock('text')]); setTags(''); setConfidence('');
      clearDraft();
      fetchNotes();
    } catch { /* */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제할까요?')) return;
    await fetch(`/api/notes?id=${id}`, { method: 'DELETE' });
    fetchNotes();
  };

  // 검색 필터
  const filteredNotes = searchQuery.trim()
    ? notes.filter(n => {
        const q = searchQuery.toLowerCase();
        if (n.title.toLowerCase().includes(q)) return true;
        if (n.content.toLowerCase().includes(q)) return true;
        if (n.tags?.some(t => t.toLowerCase().includes(q))) return true;
        return false;
      })
    : notes;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중...</div>;

  const canSave = title.trim() && blocksHaveContent(blocks);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📓 교육일지</h2>
        <button
          onClick={() => setShowForm(!showForm)}
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

      {/* 작성 폼 */}
      {showForm && (
        <div style={card}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>
            ✨ 오늘의 교육일지
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>오늘 한마디</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="오늘의 학습을 한 문장으로!" style={{ ...inputStyle, fontSize: 16, fontWeight: 600 }} />
            </div>

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

            <div>
              <label style={labelStyle}>태그</label>
              <input value={tags} onChange={e => setTags(e.target.value)}
                placeholder="소재, 색상, 규격 (쉼표로 구분)" style={inputStyle} />
            </div>

            {/* 블록 에디터 */}
            <div>
              <label style={labelStyle}>핵심 필기</label>

              {/* 블록 목록 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {blocks.map((block, idx) => (
                  <div key={block.id} style={{
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-elevated)', overflow: 'hidden',
                  }}>
                    {/* 블록 헤더 */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 12px', background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)',
                    }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                        {BLOCK_TYPES.find(t => t.type === block.type)?.icon}{' '}
                        {BLOCK_TYPES.find(t => t.type === block.type)?.label}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {idx > 0 && (
                          <MiniBtn onClick={() => moveBlock(block.id, -1)}>↑</MiniBtn>
                        )}
                        {idx < blocks.length - 1 && (
                          <MiniBtn onClick={() => moveBlock(block.id, 1)}>↓</MiniBtn>
                        )}
                        {blocks.length > 1 && (
                          <MiniBtn onClick={() => removeBlock(block.id)} color="var(--red)">✕</MiniBtn>
                        )}
                      </div>
                    </div>

                    {/* 블록 에디터 */}
                    <div style={{ padding: 12 }}>
                      {block.type === 'text' && (
                        <TextBlockEditor block={block} onChange={patch => updateBlock(block.id, patch)} />
                      )}
                      {block.type === 'numbered-list' && (
                        <NumberedListEditor block={block} onChange={patch => updateBlock(block.id, patch)} />
                      )}
                      {block.type === 'table' && (
                        <TableEditor block={block} onChange={patch => updateBlock(block.id, patch)} />
                      )}
                      {block.type === 'quote' && (
                        <QuoteEditor block={block} onChange={patch => updateBlock(block.id, patch)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 블록 추가 툴바 */}
              <div style={{
                display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap',
              }}>
                {BLOCK_TYPES.map(bt => (
                  <button key={bt.type} onClick={() => addBlock(bt.type)} style={{
                    padding: '8px 14px', borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border)', background: 'transparent',
                    color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue-light)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    + {bt.icon} {bt.label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleSave} disabled={saving || !canSave}
              style={{
                padding: '14px', borderRadius: 'var(--radius-md)', border: 'none',
                background: canSave ? 'var(--blue)' : 'var(--bg-elevated)',
                color: canSave ? '#fff' : 'var(--text-muted)',
                fontSize: 16, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? '저장 중...' : '저장하기'}
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
              const conf = note.confidence ? CONFIDENCE.find(o => o.value === note.confidence) : null;
              const dateObj = new Date(note.created_at);
              const month = dateObj.getMonth() + 1;
              const day = dateObj.getDate();
              const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
              const dayName = dayNames[dateObj.getDay()];
              return (
                <button
                  key={note.id}
                  onClick={() => setExpandedNoteId(isSelected ? null : note.id)}
                  style={{
                    padding: 20, borderRadius: 'var(--radius-md)', textAlign: 'left',
                    border: isSelected ? '2px solid var(--blue)' : '1px solid var(--border)',
                    background: isSelected ? 'var(--blue-dim)' : 'var(--bg-surface)',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  {/* 날짜 */}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {month}/{day} ({dayName})
                  </div>
                  {/* 제목 */}
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {note.title}
                  </div>
                  {/* 자신감 */}
                  {conf && (
                    <div style={{ fontSize: 13 }}>
                      {conf.icon} {conf.label}
                    </div>
                  )}
                  {/* 태그 */}
                  {note.tags && note.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {note.tags.slice(0, 3).map(tag => (
                        <span key={tag} style={{
                          padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                          background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 11, fontWeight: 600,
                        }}>{tag}</span>
                      ))}
                      {note.tags.length > 3 && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{note.tags.length - 3}</span>
                      )}
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
            const conf = note.confidence ? CONFIDENCE.find(o => o.value === note.confidence) : null;
            return (
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                      {note.title}
                    </h3>
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
                <BlockRenderer content={note.content} searchQuery={searchQuery} />
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

// ── 블록 에디터 컴포넌트 ──

function TextBlockEditor({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  return (
    <textarea
      value={block.content}
      onChange={e => onChange({ content: e.target.value })}
      placeholder="내용을 입력하세요..."
      rows={4}
      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, border: 'none', background: 'transparent', padding: 0 }}
    />
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
      borderLeft: '3px solid var(--blue)', paddingLeft: 12,
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

function BlockRenderer({ content, searchQuery }: { content: string; searchQuery: string }) {
  const blocks = parseContent(content);

  // 검색어 하이라이트
  const highlight = (text: string) => {
    if (!searchQuery.trim()) return text;
    const q = searchQuery.trim();
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} style={{ background: 'var(--blue-dim)', color: 'var(--blue-light)', borderRadius: 2, padding: '0 2px' }}>{part}</mark>
        : part
    );
  };

  // 기존 플레인텍스트 (하위 호환)
  if (!blocks) {
    return (
      <div style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
        {highlight(content)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {blocks.map(block => {
        if (block.type === 'text') {
          return (
            <div key={block.id} style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {highlight(block.content)}
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
                    {highlight(item)}
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
                      }}>{highlight(h)}</th>
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
                        }}>{highlight(cell)}</td>
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
              borderLeft: '3px solid var(--blue)', paddingLeft: 16,
              fontSize: 15, color: 'var(--text-second)', lineHeight: 1.7,
              fontStyle: 'italic', whiteSpace: 'pre-wrap',
              background: 'var(--bg-hover)', padding: '12px 16px', borderRadius: '0 var(--radius-md) var(--radius-md) 0',
            }}>
              {highlight(block.content)}
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

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8,
};
