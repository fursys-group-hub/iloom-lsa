'use client';

import { useState, useEffect, useCallback } from 'react';

interface Batch {
  id: string;
  name: string;
}

interface Announcement {
  id: string;
  batch_id: string;
  title: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
  created_at: string;
}

const PRIORITY_OPTIONS = [
  { value: 'normal', label: '일반', color: 'var(--blue-light)', bg: 'var(--blue-dim)' },
  { value: 'important', label: '중요', color: 'var(--orange)', bg: 'var(--orange-dim)' },
  { value: 'urgent', label: '긴급', color: 'var(--red)', bg: 'var(--red-dim)' },
];

export default function AnnouncementsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // 작성 폼
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<string>('normal');
  const [saving, setSaving] = useState(false);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch('/api/batches');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setBatches(data);
        // 진행중인 기수 자동 선택
        const today = new Date().toISOString().slice(0, 10);
        const active = data.find((b: Batch & { start_date: string; end_date: string; advanced_end?: string }) =>
          today >= b.start_date && (b.advanced_end ? today <= b.advanced_end : today <= b.end_date)
        );
        setSelectedBatchId(active?.id || data[0].id);
      }
    } catch { /* */ }
  }, []);

  const fetchAnnouncements = useCallback(async (batchId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/announcements?batch_id=${batchId}`);
      const data = await res.json();
      if (Array.isArray(data)) setAnnouncements(data);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);
  useEffect(() => {
    if (selectedBatchId) fetchAnnouncements(selectedBatchId);
  }, [selectedBatchId, fetchAnnouncements]);

  const resetForm = () => {
    setShowForm(false); setEditingId(null);
    setTitle(''); setContent(''); setPriority('normal');
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim() || !selectedBatchId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/announcements', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          batch_id: selectedBatchId,
          title: title.trim(),
          content: content.trim(),
          priority,
        }),
      });
      if (res.ok) {
        resetForm();
        await fetchAnnouncements(selectedBatchId);
      }
    } catch { /* */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 공지를 삭제할까요?')) return;
    await fetch(`/api/announcements?id=${id}`, { method: 'DELETE' });
    if (selectedBatchId) await fetchAnnouncements(selectedBatchId);
  };

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setTitle(a.title);
    setContent(a.content);
    setPriority(a.priority);
    setShowForm(true);
  };

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            공지사항
          </h2>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          style={{
            padding: '10px 20px', borderRadius: 'var(--radius-md)',
            border: 'none', background: 'var(--blue)', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + 공지 작성
        </button>
      </div>

      {/* 기수 선택 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={selectedBatchId}
          onChange={e => setSelectedBatchId(e.target.value)}
          style={{
            padding: '8px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', outline: 'none',
          }}
        >
          {batches.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* 작성/수정 폼 */}
      {showForm && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '20px 24px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {editingId ? '공지 수정' : '새 공지 작성'} — {selectedBatch?.name}
          </h3>

          {/* 우선순위 */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>우선순위</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORITY_OPTIONS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  style={{
                    padding: '8px 16px', borderRadius: 'var(--radius-md)',
                    border: priority === p.value ? 'none' : '1px solid var(--border)',
                    background: priority === p.value ? p.bg : 'transparent',
                    color: priority === p.value ? p.color : 'var(--text-tertiary)',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 제목 */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>제목</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="공지 제목을 입력해요"
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: 15, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 내용 */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>내용</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="공지 내용을 작성해요..."
              rows={5}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: 15, outline: 'none',
                resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={resetForm} style={{
              padding: '10px 20px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}>취소</button>
            <button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()} style={{
              padding: '10px 20px', borderRadius: 'var(--radius-md)',
              border: 'none', background: title.trim() && content.trim() ? 'var(--blue)' : 'var(--bg-hover)',
              color: title.trim() && content.trim() ? '#fff' : 'var(--text-muted)',
              fontSize: 14, fontWeight: 600, cursor: title.trim() && content.trim() ? 'pointer' : 'default',
            }}>
              {saving ? '저장 중...' : editingId ? '수정 완료' : '공지하기'}
            </button>
          </div>
        </div>
      )}

      {/* 공지 목록 */}
      {loading ? (
        <p style={{ fontSize: 15, color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}>불러오는 중...</p>
      ) : announcements.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 48, textAlign: 'center',
        }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}></p>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', margin: 0 }}>
            아직 작성된 공지가 없어요
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {announcements.map(a => {
            const p = PRIORITY_OPTIONS.find(o => o.value === a.priority) || PRIORITY_OPTIONS[0];
            const dateStr = new Date(a.created_at).toLocaleString('ko-KR', {
              month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            return (
              <div
                key={a.id}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', padding: '20px 24px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                        background: p.bg, color: p.color,
                        fontSize: 12, fontWeight: 600,
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', marginRight: 4 }} />{p.label}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dateStr}</span>
                    </div>
                    <h4 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                      {a.title}
                    </h4>
                    <p style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                      {a.content}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => startEdit(a)}
                      style={{
                        padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)', background: 'transparent',
                        color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                      }}
                    >수정</button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      style={{
                        padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)', background: 'transparent',
                        color: 'var(--red)', fontSize: 12, cursor: 'pointer',
                      }}
                    >삭제</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
