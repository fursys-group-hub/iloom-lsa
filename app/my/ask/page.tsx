'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { StudentQuestion, QuestionReply } from '@/lib/types';

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: 24,
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: '답변 대기', color: 'var(--orange)', bg: 'var(--orange-dim)' },
  answered: { label: '답변 완료', color: 'var(--green)', bg: 'var(--green-dim)' },
  archived: { label: '보관처리 됨', color: 'var(--text-muted)', bg: 'var(--bg-hover)' },
};
const DEFAULT_STATUS = { label: '답변 완료', color: 'var(--text-muted)', bg: 'var(--gray-dim)' };

export default function AskPage() {
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [questions, setQuestions] = useState<(StudentQuestion & { reply_count: number })[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replies, setReplies] = useState<QuestionReply[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [replyText, setReplyText] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingQuestionTitle, setEditingQuestionTitle] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (auth) {
      const p = JSON.parse(auth);
      setStudentId(p.studentId || '');
      setStudentName(p.name || '');
      if (p.isArchived) setIsArchived(true);
    }
  }, []);

  const fetchQuestions = useCallback(async () => {
    if (!studentId) return;
    try {
      const res = await fetch(`/api/student-questions?student_id=${studentId}`);
      const data = await res.json();
      setQuestions(data);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

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

  const handleCreateQuestion = async () => {
    if (!newTitle.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/student-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, title: newTitle.trim() }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setQuestions((prev) => [{ ...created, reply_count: 0 }, ...prev]);
      setNewTitle('');
      setShowForm(false);
      setSelectedId(created.id);
    } catch {
      alert('질문 등록에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/student-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: selectedId,
          author_role: 'student',
          author_name: studentName,
          content: replyText.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      const reply = await res.json();
      setReplies((prev) => [...prev, reply]);
      setReplyText('');
      // 질문 상태 갱신
      setQuestions((prev) => prev.map((q) =>
        q.id === selectedId ? { ...q, status: 'open' as const, reply_count: q.reply_count + 1 } : q
      ));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch {
      alert('전송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  const handleEditQuestion = async (id: string) => {
    if (!editingQuestionTitle.trim()) return;
    try {
      const res = await fetch(`/api/student-questions?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingQuestionTitle.trim() }),
      });
      if (!res.ok) throw new Error();
      setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, title: editingQuestionTitle.trim() } : q));
      setEditingQuestionId(null);
      setEditingQuestionTitle('');
    } catch {
      alert('수정에 실패했습니다.');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('이 질문을 삭제할까요?')) return;
    await fetch(`/api/student-questions?id=${id}`, { method: 'DELETE' });
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (selectedId === id) { setSelectedId(null); setReplies([]); }
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
    if (!confirm('이 메시지를 삭제할까요?')) return;
    await fetch(`/api/student-questions?reply_id=${replyId}`, { method: 'DELETE' });
    setReplies((prev) => prev.filter((r) => r.id !== replyId));
    if (selectedId) {
      setQuestions((prev) => prev.map((q) =>
        q.id === selectedId ? { ...q, reply_count: Math.max(0, q.reply_count - 1) } : q
      ));
    }
  };

  const selectedQ = questions.find((q) => q.id === selectedId);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>💬 질문하기</h2>
        {!showForm && !isArchived && (
          <button onClick={() => { setShowForm(true); setSelectedId(null); }} style={{
            padding: '10px 20px', borderRadius: 'var(--radius-md)',
            background: 'var(--blue)', color: '#fff', border: 'none',
            fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>
            + 새 질문
          </button>
        )}
      </div>

      {/* 새 질문 작성 폼 */}
      {showForm && !isArchived && (
        <div style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 12px' }}>새 질문 작성</h3>
          <textarea
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="궁금한 점을 자유롭게 질문해주세요!"
            rows={3}
            style={{
              width: '100%', padding: '12px 14px', fontSize: 15,
              background: 'var(--bg-elevated)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              resize: 'vertical', lineHeight: 1.5, outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--blue)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setNewTitle(''); }} style={{
              padding: '10px 20px', borderRadius: 'var(--radius-md)',
              background: 'transparent', color: 'var(--text-tertiary)',
              border: '1px solid var(--border)', fontWeight: 500, fontSize: 14, cursor: 'pointer',
            }}>
              취소
            </button>
            <button onClick={handleCreateQuestion} disabled={!newTitle.trim() || sending} style={{
              padding: '10px 20px', borderRadius: 'var(--radius-md)',
              background: newTitle.trim() ? 'var(--blue)' : 'var(--bg-hover)',
              color: newTitle.trim() ? '#fff' : 'var(--text-muted)',
              border: 'none', fontWeight: 600, fontSize: 14,
              cursor: newTitle.trim() ? 'pointer' : 'default',
            }}>
              {sending ? '등록 중...' : '질문 등록'}
            </button>
          </div>
        </div>
      )}

      <div className="ask-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, minHeight: 500 }}>
        {/* 질문 목록 (왼쪽) */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            내 질문 ({questions.length})
          </div>
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {questions.length === 0 ? (
              <p style={{ padding: 24, textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
                아직 질문이 없어요.<br />새 질문을 작성해보세요!
              </p>
            ) : questions.map((q) => {
              const st = STATUS_MAP[q.status] || DEFAULT_STATUS;
              const isSelected = q.id === selectedId;
              return (
                <div
                  key={q.id}
                  onClick={() => { setSelectedId(q.id); setShowForm(false); }}
                  style={{
                    padding: '14px 20px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    background: isSelected ? 'var(--blue-dim)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 6,
                    overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {q.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 'var(--radius-pill)',
                      fontSize: 12, fontWeight: 600, background: st.bg, color: st.color,
                    }}>
                      {st.label}
                    </span>
                    {q.reply_count > 0 && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>💬 {q.reply_count}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {new Date(q.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 대화 영역 (오른쪽) */}
        <div style={{ ...card, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {!selectedQ ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 15 }}>
              왼쪽에서 질문을 선택하세요
            </div>
          ) : (
            <>
              {/* 질문 헤더 */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedQ.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(selectedQ.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleDeleteQuestion(selectedQ.id)} style={{
                    padding: '6px 14px', borderRadius: 'var(--radius-pill)',
                    background: 'var(--red-dim)', color: 'var(--red)',
                    border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  }}>
                    삭제
                  </button>
                </div>
              </div>

              {/* 채팅 영역 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* 첫 질문 메시지 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {editingQuestionId === selectedQ.id ? (
                    <div style={{ maxWidth: '75%' }}>
                      <textarea
                        value={editingQuestionTitle}
                        onChange={(e) => setEditingQuestionTitle(e.target.value)}
                        rows={3}
                        style={{
                          width: '100%', padding: '10px 14px', fontSize: 14,
                          background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                          border: '1px solid var(--blue)', borderRadius: 'var(--radius-md)',
                          resize: 'vertical', lineHeight: 1.5, outline: 'none', boxSizing: 'border-box', minWidth: 280,
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            handleEditQuestion(selectedQ.id);
                          }
                        }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setEditingQuestionId(null); setEditingQuestionTitle(''); }} style={{
                          padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                          background: 'transparent', color: 'var(--text-muted)',
                          border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
                        }}>취소</button>
                        <button onClick={() => handleEditQuestion(selectedQ.id)} style={{
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
                        maxWidth: '75%', padding: '12px 16px', borderRadius: '18px 18px 4px 18px',
                        background: 'var(--blue)', color: '#fff', fontSize: 15, lineHeight: 1.6,
                        whiteSpace: 'pre-wrap', position: 'relative',
                      }}
                    >
                      {selectedQ.title}
                      <div className="reply-actions" style={{
                        position: 'absolute', top: -28, right: 0,
                        display: 'none', gap: 2, background: 'var(--bg-surface)',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                        padding: '3px 4px', boxShadow: 'var(--shadow-sm)', whiteSpace: 'nowrap',
                      }}>
                        <button onClick={() => { setEditingQuestionId(selectedQ.id); setEditingQuestionTitle(selectedQ.title); }} style={{
                          padding: '2px 8px', borderRadius: 4, background: 'transparent',
                          border: 'none', fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer',
                        }}>수정</button>
                        <button onClick={() => handleDeleteQuestion(selectedQ.id)} style={{
                          padding: '2px 8px', borderRadius: 4, background: 'transparent',
                          border: 'none', fontSize: 11, color: 'var(--red)', cursor: 'pointer',
                        }}>삭제</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 답글들 */}
                {replies.map((r) => {
                  const isMe = r.author_role === 'student';
                  const isEditing = editingReplyId === r.id;
                  return (
                    <div key={r.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
                      {!isMe && (
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: 'var(--blue-dim)', color: 'var(--blue)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                        }}>
                          👩‍🏫
                        </div>
                      )}
                      <div>
                        {!isMe && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, marginLeft: 4 }}>
                            {r.author_name}
                          </div>
                        )}
                        {isEditing ? (
                          <div style={{ maxWidth: 420 }}>
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
                              maxWidth: 420, padding: '12px 16px', position: 'relative',
                              borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                              background: isMe ? 'var(--blue)' : 'var(--bubble-assistant)',
                              color: isMe ? '#fff' : 'var(--text-primary)',
                              fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                            }}
                          >
                            {r.content}
                            {isMe && (
                              <div className="reply-actions" style={{
                                position: 'absolute', top: -28, right: 0,
                                display: 'none', gap: 2, background: 'var(--bg-surface)',
                                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                                padding: '3px 4px', boxShadow: 'var(--shadow-sm)', whiteSpace: 'nowrap',
                              }}>
                                <button onClick={(e) => { e.stopPropagation(); setEditingReplyId(r.id); setEditingContent(r.content); }} style={{
                                  padding: '2px 8px', borderRadius: 4, background: 'transparent',
                                  border: 'none', fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer',
                                }}>수정</button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteReply(r.id); }} style={{
                                  padding: '2px 8px', borderRadius: 4, background: 'transparent',
                                  border: 'none', fontSize: 11, color: 'var(--red)', cursor: 'pointer',
                                }}>삭제</button>
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{
                          fontSize: 11, color: 'var(--text-muted)', marginTop: 3,
                          textAlign: isMe ? 'right' : 'left', paddingInline: 4,
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
              {selectedQ.status === 'archived' ? (
                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{
                    padding: '10px 16px', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-hover)', color: 'var(--text-tertiary)', fontSize: 14,
                  }}>
                    📦 이 질문은 보관처리 되었습니다
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="추가 질문이나 답글을 입력하세요..."
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
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .ask-layout { grid-template-columns: 1fr !important; }
        }
        .reply-bubble:hover .reply-actions {
          display: flex !important;
        }
      `}</style>
    </div>
  );
}
