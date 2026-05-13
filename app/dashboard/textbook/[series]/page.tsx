'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Chapter {
  id: string;
  series_name: string;
  category: string | null;
  status: 'draft' | 'reviewing' | 'final';
  html_content: string;
  source_note_ids: string[];
  generated_at: string | null;
  updated_at: string;
}

interface PoolNote {
  id: string;
  student_name: string;
  batch_label: string;
  date_label: string;
  is_self_study: boolean;
  step1: string;
  step2: string;
  step3: string;
  series: string[];
  classify_confidence: number;
}

const STATUS_FLOW: Array<'draft' | 'reviewing' | 'final'> = ['draft', 'reviewing', 'final'];
const STATUS_LABEL: Record<string, string> = { draft: '초안', reviewing: '검수중', final: '완료' };

export default function TextbookSeriesPage() {
  const params = useParams();
  const seriesName = decodeURIComponent(String(params.series || ''));

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [notes, setNotes] = useState<PoolNote[]>([]);
  const [editing, setEditing] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const reload = useCallback(async () => {
    // chapter와 notes-pool 독립 fetch — notes-pool이 느려도 챕터 즉시 표시
    fetch(`/api/textbook?series=${encodeURIComponent(seriesName)}`)
      .then((r) => r.json())
      .then((chRes) => {
        setChapter(chRes.chapter);
        setEditing(chRes.chapter?.html_content || '');
        setDirty(false);
      })
      .catch(() => {});

    fetch('/api/textbook/notes-pool')
      .then((r) => r.json())
      .then((poolRes) => {
        const all: PoolNote[] = poolRes.notes || [];
        setNotes(all.filter((n) => n.series.includes(seriesName)));
      })
      .catch(() => {});
  }, [seriesName]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 챕터 미리보기 안 이미지 클릭 시 lightbox (크게 보기)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === 'IMG' && el.closest('.tb-chapter')) {
        const src = (el as HTMLImageElement).src;
        if (!src) return;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:40px;';
        const big = document.createElement('img');
        big.src = src;
        big.style.cssText = 'max-width:90vw;max-height:90vh;object-fit:contain;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.5);';
        overlay.appendChild(big);
        overlay.addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [editing]);

  async function saveContent() {
    if (!chapter || busy) return;
    setBusy('저장 중...');
    try {
      const res = await fetch('/api/textbook', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_name: seriesName, html_content: editing }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || '저장 실패');
      setDirty(false);
      setToast('저장 완료');
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(next: 'draft' | 'reviewing' | 'final') {
    if (!chapter || busy) return;
    if (dirty && !confirm('편집 중인 내용이 저장되지 않았어요. 그래도 상태를 바꿀까요?')) return;
    setBusy('상태 변경 중...');
    try {
      const res = await fetch('/api/textbook', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_name: seriesName, status: next }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message);
      }
      setToast(`상태가 ${STATUS_LABEL[next]}로 변경됐어요`);
      await reload();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function regenerateDraft() {
    if (!confirm('AI 초안을 다시 생성합니다. 현재 편집 내용은 사라져요. 진행할까요?')) return;
    setBusy('AI 초안 재생성 중... (10~30초)');
    try {
      const res = await fetch('/api/textbook/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_name: seriesName, force: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || '재생성 실패');
      setToast(`재생성 완료 (${d.html_length}자)`);
      await reload();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteChapter() {
    if (!chapter || busy) return;
    if (!confirm(`'${seriesName}' 챕터를 완전히 삭제할까요?\n\n초안 + 편집 내용 모두 사라지며 되돌릴 수 없어요.\n메인 페이지에서 다시 '초안 생성'으로 새로 만들 수 있어요.`)) return;
    setBusy('챕터 삭제 중...');
    try {
      const res = await fetch(`/api/textbook?series=${encodeURIComponent(seriesName)}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || '삭제 실패');
      setToast('챕터 삭제 완료. 메인으로 돌아갑니다.');
      setTimeout(() => { window.location.href = '/dashboard/textbook'; }, 800);
    } catch (e) {
      setToast((e as Error).message);
      setBusy(null);
    }
  }

  function openPrint() {
    window.open(`/dashboard/textbook/print?series=${encodeURIComponent(seriesName)}`, '_blank', 'noopener');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard/textbook" style={{ color: 'var(--text-tertiary)', textDecoration: 'none', fontSize: 14 }}>
            ← 통합 교재
          </Link>
          <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{seriesName}</h2>
          {chapter?.category && (
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 'var(--radius-pill)',
                fontSize: 12,
                fontWeight: 600,
                background: 'var(--blue-dim)',
                color: 'var(--blue)',
              }}
            >
              {chapter.category}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {chapter && (
            <>
              <select
                value={chapter.status}
                onChange={(e) => changeStatus(e.target.value as 'draft' | 'reviewing' | 'final')}
                disabled={!!busy}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {STATUS_FLOW.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              <button onClick={regenerateDraft} disabled={!!busy} style={btnGhost}>AI 초안 다시 생성</button>
              <button onClick={openPrint} disabled={!!busy} style={btnGhost}>인쇄 미리보기</button>
              <button
                onClick={deleteChapter}
                disabled={!!busy}
                style={{ ...btnGhost, color: 'var(--red)' }}
                title="챕터 완전 삭제 (되돌릴 수 없음)"
              >
                챕터 삭제
              </button>
              <button onClick={saveContent} disabled={!!busy || !dirty} style={btnPrimary}>
                {dirty ? '저장' : '저장됨'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 메타 */}
      <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
        분류된 일지 <strong style={{ color: 'var(--text-primary)' }}>{notes.length}</strong>건
        {chapter?.generated_at && <> · 생성 {new Date(chapter.generated_at).toLocaleString('ko-KR')}</>}
        {chapter?.updated_at && <> · 수정 {new Date(chapter.updated_at).toLocaleString('ko-KR')}</>}
        {busy && <> · <span style={{ color: 'var(--blue)' }}>{busy}</span></>}
      </div>

      {/* 챕터 없으면 안내 */}
      {!chapter && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 32,
            textAlign: 'center',
            color: 'var(--text-tertiary)',
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
            아직 초안이 없어요
          </div>
          <div style={{ fontSize: 14, marginBottom: 20 }}>
            &lsquo;통합 교재&rsquo; 메인 페이지에서 이 시리즈를 선택하고 &lsquo;선택 초안 생성&rsquo; 버튼을 눌러주세요.
          </div>
          <Link href="/dashboard/textbook" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>
            메인으로 돌아가기
          </Link>
        </div>
      )}

      {/* 2열 레이아웃: 좌(원본 노트) / 우(편집기) */}
      {chapter && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
          {/* 좌측: 원본 노트 */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 16,
              boxShadow: 'var(--shadow-sm)',
              maxHeight: 'calc(100vh - 200px)',
              overflowY: 'auto',
            }}
          >
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-primary)' }}>
              원본 일지 ({notes.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notes.map((n) => (
                <NoteCard key={n.id} note={n} />
              ))}
              {notes.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 16, textAlign: 'center' }}>
                  분류된 일지가 없습니다.
                </div>
              )}
            </div>
          </div>

          {/* 우측: 편집기 */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              boxShadow: 'var(--shadow-sm)',
              minHeight: 600,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                챕터 본문 (HTML)
              </h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {dirty ? '편집 중' : ''}
              </span>
            </div>
            <textarea
              value={editing}
              onChange={(e) => { setEditing(e.target.value); setDirty(true); }}
              style={{
                width: '100%',
                minHeight: 400,
                padding: 16,
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: 1.6,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-main)',
                color: 'var(--text-primary)',
                resize: 'vertical',
              }}
            />
            {/* 미리보기 */}
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-primary)' }}>
                미리보기
              </h3>
              <div
                className="textbook-preview"
                style={{
                  padding: 24,
                  background: '#FFFFFF',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: '#1C1C1E',
                  fontSize: 15,
                  lineHeight: 1.65,
                }}
                dangerouslySetInnerHTML={{ __html: editing }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div
          onClick={() => setToast('')}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            maxWidth: 480,
            padding: '16px 20px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            fontSize: 14,
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
            cursor: 'pointer',
            zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}

      <style jsx>{`
        .textbook-preview :global(h2) {
          font-size: 20px;
          font-weight: 700;
          margin: 24px 0 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #ddd;
        }
        .textbook-preview :global(h2:first-child) { margin-top: 0; }
        .textbook-preview :global(section) { margin-bottom: 32px; }
        .textbook-preview :global(p) { margin: 8px 0; }
        .textbook-preview :global(ul) { padding-left: 20px; }
        .textbook-preview :global(li) { margin: 4px 0; }
        .textbook-preview :global(blockquote) {
          margin: 12px 0;
          padding: 12px 16px;
          background: #F7F8FA;
          border-left: 3px solid var(--blue);
          border-radius: 4px;
        }
        .textbook-preview :global(cite) {
          color: #6B7280;
          font-size: 13px;
          font-style: normal;
          margin-left: 6px;
        }
        .textbook-preview :global(.source-pptx) {
          color: var(--purple);
        }
        .textbook-preview :global(table) {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
          font-size: 14px;
        }
        .textbook-preview :global(th),
        .textbook-preview :global(td) {
          border: 1px solid #D1D5DB;
          padding: 8px 12px;
          text-align: left;
          vertical-align: top;
        }
        .textbook-preview :global(th) {
          background: #F3F4F6;
          font-weight: 600;
          color: #1F2937;
        }
        .textbook-preview :global(tbody tr:nth-child(odd)) {
          background: #FAFBFC;
        }
        .textbook-preview :global(.photo-placeholder) {
          margin: 16px 0;
          padding: 48px 16px;
          background: #F9FAFB;
          border: 2px dashed #9CA3AF;
          border-radius: 8px;
          text-align: center;
          color: #6B7280;
          font-size: 14px;
          font-weight: 500;
        }
        .textbook-preview :global(.source-note) {
          font-size: 12px;
          color: #6B7280;
          font-style: italic;
          margin: 4px 0 8px;
        }
        .textbook-preview :global(del) {
          color: #DC2626;
          text-decoration: line-through;
        }
        .textbook-preview :global(.alert-note) {
          padding: 8px 12px;
          background: #FEF3C7;
          border-left: 3px solid #F59E0B;
          border-radius: 4px;
          font-size: 13px;
          margin: 4px 0 12px;
        }
      `}</style>
    </div>
  );
}

function NoteCard({ note }: { note: PoolNote }) {
  const [expanded, setExpanded] = useState(false);
  const preview = (note.step1 || note.step2 || note.step3 || '').slice(0, 80);

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      style={{
        padding: 12,
        background: note.is_self_study ? 'var(--purple-dim)' : 'var(--bg-main)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-light)',
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <strong style={{ color: 'var(--text-primary)' }}>{note.student_name}</strong>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {note.batch_label} · {note.date_label}
          {note.is_self_study && <span style={{ marginLeft: 6, color: 'var(--purple)' }}>자율</span>}
        </span>
      </div>
      {!expanded && (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.5 }}>
          {preview}{preview.length >= 80 ? '...' : ''}
        </div>
      )}
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-second)', marginTop: 6 }}>
          {note.step1 && <div><strong>STEP 1:</strong> {note.step1}</div>}
          {note.step2 && <div><strong>STEP 2:</strong> {note.step2}</div>}
          {note.step3 && <div><strong>STEP 3:</strong> {note.step3}</div>}
        </div>
      )}
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};
const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'var(--blue)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
