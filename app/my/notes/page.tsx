'use client';

import { useState, useEffect, useCallback } from 'react';

interface Note { id: string; title: string; content: string; tags: string[]; confidence: string | null; created_at: string; }

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

export default function MyNotesPage() {
  const [studentId, setStudentId] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [confidence, setConfidence] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) setStudentId(JSON.parse(auth).studentId);
  }, []);

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

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId, title, content,
          tags: tags ? tags.split(',').map(t => t.trim()) : [],
          confidence: confidence || null,
        }),
      });
      setShowForm(false);
      setTitle(''); setContent(''); setTags(''); setConfidence('');
      fetchNotes();
    } catch { /* */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제할까요?')) return;
    await fetch(`/api/notes?id=${id}`, { method: 'DELETE' });
    fetchNotes();
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중...</div>;

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

            <div>
              <label style={labelStyle}>핵심 필기</label>
              <textarea value={content} onChange={e => setContent(e.target.value)} rows={10}
                placeholder="오늘 배운 핵심 내용을 정리해보세요..."
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }} />
            </div>

            <button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()}
              style={{
                padding: '14px', borderRadius: 'var(--radius-md)', border: 'none',
                background: !title.trim() || !content.trim() ? 'var(--bg-elevated)' : 'var(--blue)',
                color: !title.trim() || !content.trim() ? 'var(--text-muted)' : '#fff',
                fontSize: 16, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {saving ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </div>
      )}

      {/* 노트 목록 */}
      {notes.length > 0 ? notes.map(note => (
        <div key={note.id} style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h4 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{note.title}</h4>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {new Date(note.created_at).toLocaleDateString('ko', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {note.confidence && (
                <span style={{
                  padding: '4px 12px', borderRadius: 'var(--radius-pill)',
                  background: 'var(--bg-elevated)', fontSize: 14,
                }}>
                  {CONFIDENCE.find(o => o.value === note.confidence)?.icon}{' '}
                  {CONFIDENCE.find(o => o.value === note.confidence)?.label}
                </span>
              )}
              <button onClick={() => handleDelete(note.id)}
                style={{ padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                삭제
              </button>
            </div>
          </div>
          {note.tags && note.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {note.tags.map(tag => (
                <span key={tag} style={{
                  padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                  background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 13, fontWeight: 600,
                }}>{tag}</span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 15, color: 'var(--text-second)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            {note.content}
          </div>
        </div>
      )) : (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>📓</p>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', marginBottom: 8 }}>아직 작성한 교육일지가 없어요</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>매일 배운 내용을 정리하면 실력이 쑥쑥 올라요!</p>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8,
};
