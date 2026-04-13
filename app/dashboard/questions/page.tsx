'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { StudentQuestion, QuestionReply } from '@/lib/types';

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: '답변 대기', color: 'var(--orange)', bg: 'var(--orange-dim)' },
  answered: { label: '답변 완료', color: 'var(--green)', bg: 'var(--green-dim)' },
  archived: { label: '보관됨', color: 'var(--text-muted)', bg: 'var(--bg-hover)' },
};
const DEFAULT_STATUS = { label: '답변 완료', color: 'var(--text-muted)', bg: 'var(--gray-dim)' };

type QuestionWithMeta = StudentQuestion & { reply_count: number; student_name?: string };

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<QuestionWithMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replies, setReplies] = useState<QuestionReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'answered' | 'archived'>('all');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [adminName, setAdminName] = useState('관리자');
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) {
      const p = JSON.parse(auth);
      setAdminName(p.name || '관리자');
    }
  }, []);

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch('/api/student-questions?all=true');
      const data = await res.json();
      setQuestions(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  const fetchReplies = useCallback(async (qId: string) => {
    const res = await fetch(`/api/student-questions?question_id=${qId}`);
    const data = await res.json();
    setReplies(data.replies || []);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  useEffect(() => {
    if (selectedId) fetchReplies(selectedId);
  }, [selectedId, fetchReplies]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/student-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: selectedId,
          author_role: 'admin',
          author_name: adminName,
          content: replyText.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      const reply = await res.json();
      setReplies((prev) => [...prev, reply]);
      setReplyText('');
      setQuestions((prev) => prev.map((q) =>
        q.id === selectedId ? { ...q, status: 'answered' as const, reply_count: q.reply_count + 1 } : q
      ));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch {
      alert('전송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  const handleEditReply = async (replyId: string) => {
    if (!editingContent.trim()) return;
    try {
      const res = await fetch(`/api/student-questions?reply_id=${replyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingContent.trim() }),
      });
      if (!res.ok) throw new Error();
      setReplies((prev) => prev.map((r) => r.id === replyId ? { ...r, content: editingContent.trim() } : r));
      setEditingReplyId(null);
      setEditingContent('');
    } catch {
      alert('수정에 실패했습니다.');
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!confirm('이 답변을 삭제할까요?')) return;
    try {
      await fetch(`/api/student-questions?reply_id=${replyId}`, { method: 'DELETE' });
      setReplies((prev) => prev.filter((r) => r.id !== replyId));
      if (selectedId) {
        setQuestions((prev) => prev.map((q) =>
          q.id === selectedId ? { ...q, reply_count: Math.max(0, q.reply_count - 1) } : q
        ));
      }
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 질문을 삭제할까요?')) return;
    await fetch(`/api/student-questions?id=${id}`, { method: 'DELETE' });
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (selectedId === id) { setSelectedId(null); setReplies([]); }
  };

  const filtered = filter === 'all' ? questions.filter((q) => q.status !== 'archived') : questions.filter((q) => q.status === filter);
  const selectedQ = questions.find((q) => q.id === selectedId);
  const openCount = questions.filter((q) => q.status === 'open').length;

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>질문 관리</h2>
        {openCount > 0 && (
          <span style={{
            padding: '3px 10px', borderRadius: 'var(--radius-pill)',
            background: 'var(--red-dim)', color: 'var(--red)',
            fontSize: 12, fontWeight: 600,
          }}>
            {openCount}개 답변 대기
          </span>
        )}
      </div>

      {/* 필터 탭 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {([['all', '전체'], ['open', '답변 대기'], ['answered', '답변 완료'], ['archived', '보관됨']] as const).map(([key, label], i) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,
              background: 'transparent',
              color: filter === key ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none',
              borderBottom: filter === key ? '2px solid var(--blue)' : '2px solid transparent',
              fontSize: 15, fontWeight: filter === key ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.15s ease',
              marginBottom: -1,
            }}
          >
            {label}{key === 'open' && openCount > 0 ? ` (${openCount})` : ''}
          </button>
        ))}
      </div>

      <div className="questions-layout" style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, minHeight: 600 }}>
        {/* 질문 목록 (왼쪽) */}
        <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)' }}>
            질문 {filtered.length}개
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <p style={{ padding: 32, textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
                {filter === 'all' ? '아직 질문이 없습니다.' : '해당 상태의 질문이 없습니다.'}
              </p>
            ) : filtered.map((q) => {
              const st = STATUS_MAP[q.status] || DEFAULT_STATUS;
              const isSelected = q.id === selectedId;
              return (
                <div
                  key={q.id}
                  onClick={() => setSelectedId(q.id)}
                  style={{
                    padding: '14px 20px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    background: isSelected ? 'var(--blue-dim)' : 'transparent',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'var(--blue-dim)' : 'transparent'; }}
                >
                  {/* 학생 이름 + 상태 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--blue-dim)', color: 'var(--blue)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700,
                      }}>
                        {(q.student_name || '?')[0]}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {q.student_name || '알 수 없음'}
                      </span>
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                      fontSize: 12, fontWeight: 600, background: st.bg, color: st.color,
                    }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, display: 'inline-block', marginRight: 4 }} />{st.label}
                    </span>
                  </div>
                  {/* 질문 내용 미리보기 */}
                  <div style={{
                    fontSize: 13, color: 'var(--text-second)', lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {q.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    {q.reply_count > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{q.reply_count}개 답변</span>}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {timeAgo(q.updated_at || q.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* iMessage 대화 영역 (오른쪽) */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          {!selectedQ ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 18, color: 'var(--text-muted)' }}></span>
              <span style={{ fontSize: 15 }}>왼쪽에서 질문을 선택하세요</span>
            </div>
          ) : (
            <>
              {/* 대화 헤더 */}
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'var(--blue-dim)', color: 'var(--blue)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                  }}>
                    {(selectedQ.student_name || '?')[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {selectedQ.student_name || '알 수 없음'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(selectedQ.created_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {selectedQ.status === 'archived' ? (
                    <button onClick={async () => {
                      const res = await fetch(`/api/student-questions?id=${selectedQ.id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'answered' }),
                      });
                      if (res.ok) setQuestions(prev => prev.map(q => q.id === selectedQ.id ? { ...q, status: 'answered' } : q));
                    }} style={{
                      padding: '6px 14px', borderRadius: 'var(--radius-pill)',
                      background: 'var(--blue-dim)', color: 'var(--blue)',
                      border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    }}>
                      보관 해제
                    </button>
                  ) : (
                    <button onClick={async () => {
                      const res = await fetch(`/api/student-questions?id=${selectedQ.id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'archived' }),
                      });
                      if (res.ok) setQuestions(prev => prev.map(q => q.id === selectedQ.id ? { ...q, status: 'archived' } : q));
                    }} style={{
                      padding: '6px 14px', borderRadius: 'var(--radius-pill)',
                      background: 'var(--bg-hover)', color: 'var(--text-tertiary)',
                      border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    }}>
                      보관
                    </button>
                  )}
                  <button onClick={() => handleDelete(selectedQ.id)} style={{
                    padding: '6px 14px', borderRadius: 'var(--radius-pill)',
                    background: 'var(--red-dim)', color: 'var(--red)',
                    border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  }}>
                    삭제
                  </button>
                </div>
              </div>

              {/* 채팅 메시지 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 10px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 날짜 구분선 */}
                <div style={{ textAlign: 'center', margin: '4px 0 8px' }}>
                  <span style={{
                    padding: '4px 14px', borderRadius: 'var(--radius-pill)',
                    background: 'var(--bg-elevated)', fontSize: 12, color: 'var(--text-muted)',
                  }}>
                    {new Date(selectedQ.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>

                {/* 첫 질문 (학생 — 좌측 회색) */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--blue-dim)', color: 'var(--blue)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {(selectedQ.student_name || '?')[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, marginLeft: 4 }}>
                      {selectedQ.student_name}
                    </div>
                    <div style={{
                      maxWidth: 480, padding: '12px 16px',
                      borderRadius: '18px 18px 18px 4px',
                      background: 'var(--bubble-assistant)',
                      color: 'var(--text-primary)',
                      fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap',
                    }}>
                      {selectedQ.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, marginLeft: 4 }}>
                      {new Date(selectedQ.created_at).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                {/* 답글들 */}
                {replies.map((r) => {
                  const isAdmin = r.author_role === 'admin';
                  const isEditing = editingReplyId === r.id;
                  return (
                    <div key={r.id} style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
                      {!isAdmin && (
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: 'var(--blue-dim)', color: 'var(--blue)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                        }}>
                          {(r.author_name || '?')[0]}
                        </div>
                      )}
                      <div>
                        {!isAdmin && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, marginLeft: 4 }}>
                            {r.author_name}
                          </div>
                        )}
                        {isEditing ? (
                          <div style={{ maxWidth: 480 }}>
                            <textarea
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              rows={3}
                              style={{
                                width: '100%', padding: '10px 14px', fontSize: 14,
                                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                                border: '1px solid var(--blue)', borderRadius: 'var(--radius-md)',
                                resize: 'vertical', lineHeight: 1.5, outline: 'none', boxSizing: 'border-box',
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleEditReply(r.id); }}
                            />
                            <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                              <button onClick={() => { setEditingReplyId(null); setEditingContent(''); }} style={{
                                padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                                background: 'transparent', color: 'var(--text-muted)',
                                border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
                              }}>취소</button>
                              <button onClick={() => handleEditReply(r.id)} style={{
                                padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                                background: 'var(--blue)', color: '#fff',
                                border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              }}>저장</button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="reply-bubble"
                            style={{
                              maxWidth: 480, padding: '12px 16px', position: 'relative',
                              borderRadius: isAdmin ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                              background: isAdmin ? 'var(--blue)' : 'var(--bubble-assistant)',
                              color: isAdmin ? '#fff' : 'var(--text-primary)',
                              fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap',
                            }}
                          >
                            {r.content}
                            {/* 관리자 자기 답글에만 수정/삭제 */}
                            {isAdmin && (
                              <div className="reply-actions" style={{
                                position: 'absolute', top: -28, right: 0,
                                display: 'none', gap: 2, background: 'var(--bg-surface)',
                                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                                padding: '3px 4px', boxShadow: 'var(--shadow-sm)', whiteSpace: 'nowrap',
                              }}>
                                <button onClick={(e) => { e.stopPropagation(); setEditingReplyId(r.id); setEditingContent(r.content); }} style={{
                                  padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'transparent',
                                  border: 'none', fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer',
                                }}>수정</button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteReply(r.id); }} style={{
                                  padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'transparent',
                                  border: 'none', fontSize: 11, color: 'var(--red)', cursor: 'pointer',
                                }}>삭제</button>
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{
                          fontSize: 11, color: 'var(--text-muted)', marginTop: 3,
                          textAlign: isAdmin ? 'right' : 'left', paddingInline: 4,
                        }}>
                          {new Date(r.created_at).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* 입력 영역 */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="답변을 입력하세요..."
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                    style={{
                      flex: 1, padding: '10px 16px', fontSize: 15,
                      background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)',
                      outline: 'none',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--blue)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                  />
                  <button onClick={handleSendReply} disabled={!replyText.trim() || sending} style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: replyText.trim() ? 'var(--blue)' : 'var(--bg-hover)',
                    color: '#fff', border: 'none', cursor: replyText.trim() ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
                  }}>
                    ↑
                  </button>
                </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .questions-layout { grid-template-columns: 1fr !important; }
        }
        .reply-bubble:hover .reply-actions {
          display: flex !important;
        }
      `}</style>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
