'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

interface NoteComment {
  id: string;
  note_id: string;
  author_role: 'admin' | 'student';
  author_name: string;
  content: string;
  created_at: string;
}

interface StudentNote {
  id: string;
  student_id: string;
  title: string;
  content: string;
  content_type?: 'steps' | 'blocks' | 'text';
  tags: string[];
  confidence: string | null;
  participation_score?: number | null;
  best_learning?: boolean;
  one_word?: string | null;
  created_at: string;
  students: { name: string } | null;
}

interface StudentBasic {
  id: string;
  name: string;
  department: string | null;
  is_dropped: boolean;
}

const confidenceMap: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  confident: { label: '자신만만', emoji: '🔥', color: 'var(--green)', bg: 'var(--green-dim)' },
  understood: { label: '이해완료', emoji: '✅', color: 'var(--blue-light)', bg: 'var(--blue-dim)' },
  confused: { label: '알쏭달쏭', emoji: '🤔', color: 'var(--orange)', bg: 'var(--orange-dim)' },
  half: { label: '알쏭달쏭', emoji: '🤔', color: 'var(--orange)', bg: 'var(--orange-dim)' },
  help_needed: { label: '도움요청', emoji: '🆘', color: 'var(--red)', bg: 'var(--red-dim)' },
  need_help: { label: '도움요청', emoji: '🆘', color: 'var(--red)', bg: 'var(--red-dim)' },
};

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: 24,
};

// UTC → 한국시간(KST) 날짜 문자열 (YYYY-MM-DD)
function toKSTDate(utcStr: string): string {
  const d = new Date(utcStr);
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function EducationLogsPage() {
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [students, setStudents] = useState<StudentBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [filterStudentId, setFilterStudentId] = useState('');
  const [filterType, setFilterType] = useState<'' | 'best' | 'incomplete'>('');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const commentEndRef = useRef<HTMLDivElement>(null);

  // 코멘트 불러오기 (펼친 노트)
  const fetchComments = useCallback(async (noteId: string) => {
    try {
      const res = await fetch(`/api/note-comments?note_id=${noteId}`);
      const data = await res.json();
      if (Array.isArray(data)) setComments(data);
    } catch { /* silent */ }
  }, []);

  // 코멘트 보내기
  const sendComment = useCallback(async (noteId: string) => {
    if (!commentInput.trim() || sendingComment) return;
    setSendingComment(true);
    try {
      const res = await fetch('/api/note-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_id: noteId,
          author_role: 'admin',
          author_name: '관리자',
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
  }, [commentInput, sendingComment, fetchComments]);

  // 코멘트 삭제
  const deleteComment = useCallback(async (commentId: string, noteId: string) => {
    if (!confirm('이 코멘트를 삭제할까요?')) return;
    try {
      await fetch(`/api/note-comments?id=${commentId}`, { method: 'DELETE' });
      await fetchComments(noteId);
    } catch { /* silent */ }
  }, [fetchComments]);

  // 노트 펼칠 때 코멘트 불러오기
  useEffect(() => {
    if (expandedNoteId) {
      fetchComments(expandedNoteId);
      setCommentInput('');
    } else {
      setComments([]);
    }
  }, [expandedNoteId, fetchComments]);

  const fetchData = useCallback(async () => {
    try {
      const [notesRes, studentsRes] = await Promise.all([
        fetch('/api/notes?all=true'),
        fetch('/api/students'),
      ]);
      const [notesData, studentsData] = await Promise.all([notesRes.json(), studentsRes.json()]);
      if (notesData?.notes) {
        setNotes(notesData.notes);
        // 최신 날짜 자동 선택
        if (notesData.notes.length > 0 && !selectedDate) {
          const dates = [...new Set(notesData.notes.map((n: StudentNote) => toKSTDate(n.created_at)))].sort().reverse();
          setSelectedDate(dates[0] as string);
        }
      }
      if (Array.isArray(studentsData)) setStudents(studentsData);
    } catch { /* */ }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  // 날짜 목록 (created_at에서 YYYY-MM-DD 추출)
  const availableDates = useMemo(() => {
    return [...new Set(notes.map(n => toKSTDate(n.created_at)))].sort().reverse();
  }, [notes]);

  // 선택된 날짜의 노트
  const notesByDate = useMemo(() => {
    let filtered = notes.filter(n => toKSTDate(n.created_at) === selectedDate);
    if (filterStudentId) filtered = filtered.filter(n => n.student_id === filterStudentId);
    if (filterType === 'best') filtered = filtered.filter(n => n.best_learning);
    if (filterType === 'incomplete') filtered = filtered.filter(n => (n.participation_score || 0) < 3);
    return filtered;
  }, [notes, selectedDate, filterStudentId, filterType]);

  // 재학 중인 학생만 (퇴사자 제외)
  const activeStudents = useMemo(() => students.filter(s => !s.is_dropped), [students]);

  // 제출/미제출 현황 (날짜 기준, 퇴사자 제외)
  const submissionStatus = useMemo(() => {
    const submittedIds = new Set(notes.filter(n => toKSTDate(n.created_at) === selectedDate).map(n => n.student_id));
    const submitted = activeStudents.filter(s => submittedIds.has(s.id));
    const notSubmitted = activeStudents.filter(s => !submittedIds.has(s.id));
    return { submitted, notSubmitted };
  }, [notes, selectedDate, activeStudents]);

  // 이해도 요약
  const confidenceSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    notesByDate.forEach(n => {
      if (n.confidence) counts[n.confidence] = (counts[n.confidence] || 0) + 1;
    });
    return counts;
  }, [notesByDate]);

  // 참여도 요약 (STEP 1/3, 2/3, 3/3 분포 — 자율학습 제외)
  const participationSummary = useMemo(() => {
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    notesByDate.forEach(n => {
      if (n.tags?.includes('자율학습')) return;
      const score = n.participation_score || 0;
      const key = Math.min(score, 3) as 0 | 1 | 2 | 3;
      counts[key]++;
    });
    return counts;
  }, [notesByDate]);

  if (loading) {
    return <p style={{ fontSize: 16, color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}>불러오는 중...</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* 헤더 */}
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
        📓 교육일지
      </h2>

      {notes.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 64 }}>
          <p style={{ fontSize: 48, margin: '0 0 16px' }}>📭</p>
          <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            아직 작성된 교육일지가 없어요
          </p>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>
            교육생들이 교육일지를 작성하면 여기에 표시됩니다
          </p>
        </div>
      ) : (
        <>
          {/* 날짜 선택 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {availableDates.slice(0, 14).map(date => (
                <button
                  key={date}
                  onClick={() => { setSelectedDate(date); setExpandedNoteId(null); }}
                  style={{
                    padding: '12px 20px', borderRadius: 'var(--radius-md)',
                    border: selectedDate === date ? 'none' : '1px solid var(--border)',
                    background: selectedDate === date ? 'var(--blue)' : 'transparent',
                    color: selectedDate === date ? '#fff' : 'var(--text-tertiary)',
                    fontSize: 15, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {date.slice(5)}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* 필터 버튼 */}
              {([
                { key: '', label: '전체' },
                { key: 'best', label: '⭐ 우수' },
                { key: 'incomplete', label: '미완료' },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => { setFilterType(filterType === f.key ? '' : f.key as '' | 'best' | 'incomplete'); setExpandedNoteId(null); }}
                  style={{
                    padding: '6px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: filterType === f.key ? 'none' : '1px solid var(--border)',
                    background: filterType === f.key ? (f.key === 'best' ? 'rgba(48,209,88,0.15)' : f.key === 'incomplete' ? 'rgba(255,159,10,0.12)' : 'var(--blue)') : 'transparent',
                    color: filterType === f.key ? (f.key === 'best' ? 'var(--green)' : f.key === 'incomplete' ? 'var(--orange)' : '#fff') : 'var(--text-tertiary)',
                    fontSize: 13, fontWeight: 600,
                  }}
                >
                  {f.label}
                </button>
              ))}
              {/* 학생 필터 */}
              <select
                value={filterStudentId}
                onChange={e => { setFilterStudentId(e.target.value); setExpandedNoteId(null); }}
                style={{
                  padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
                }}
              >
                <option value="">전체 교육생</option>
                {activeStudents.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                {students.filter(s => s.is_dropped).length > 0 && (
                  <optgroup label="── 퇴사자 ──">
                    {students.filter(s => s.is_dropped).map(s => (
                      <option key={s.id} value={s.id}>{s.name} (퇴사)</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* 요약 카드: 제출 현황 + 이해도 */}
          {selectedDate && !filterStudentId && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {/* 제출 현황 */}
              <div style={{ ...card, flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>제출 현황</h3>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--green)' }}>{submissionStatus.submitted.length}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>제출</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: submissionStatus.notSubmitted.length > 0 ? 'var(--red)' : 'var(--green)' }}>
                      {submissionStatus.notSubmitted.length}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>미제출</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>{students.length}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>전체</div>
                  </div>
                </div>
                {submissionStatus.notSubmitted.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>미제출 학생</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {submissionStatus.notSubmitted.map(s => (
                        <span key={s.id} style={{
                          padding: '4px 10px', borderRadius: 'var(--radius-pill)',
                          background: 'var(--red-solid-bg)', color: 'var(--red-solid-text)',
                          fontSize: 13, fontWeight: 600,
                        }}>
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 참여도 분포 */}
              <div style={{ ...card, flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>참여도 분포</h3>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {([
                    { key: 3, label: '3/3', color: 'var(--green)', bg: 'rgba(48,209,88,0.12)', icon: '🔥' },
                    { key: 2, label: '2/3', color: 'var(--blue-light)', bg: 'var(--blue-dim)', icon: '💪' },
                    { key: 1, label: '1/3', color: 'var(--orange)', bg: 'rgba(255,159,10,0.12)', icon: '📝' },
                  ] as const).map(item => (
                    <div key={item.key} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 14px', borderRadius: 'var(--radius-md)',
                      background: item.bg,
                    }}>
                      <span>{item.icon}</span>
                      <span style={{ fontSize: 13, color: item.color, fontWeight: 600 }}>{item.label}</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: item.color }}>
                        {participationSummary[item.key]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 이해도 분포 */}
              <div style={{ ...card, flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>이해도 분포</h3>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {Object.entries(confidenceMap)
                    .filter(([key]) => ['confident', 'understood', 'confused', 'help_needed'].includes(key))
                    .map(([key, info]) => (
                    <div key={key} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 14px', borderRadius: 'var(--radius-md)',
                      background: info.bg,
                    }}>
                      <span>{info.emoji}</span>
                      <span style={{ fontSize: 13, color: info.color, fontWeight: 600 }}>{info.label}</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: info.color }}>
                        {(confidenceSummary[key] || 0) + (key === 'confused' ? (confidenceSummary['half'] || 0) : key === 'help_needed' ? (confidenceSummary['need_help'] || 0) : 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 노트 목록 */}
          {notesByDate.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {notesByDate.map(note => {
                const isExpanded = expandedNoteId === note.id;
                const isSelfStudy = note.tags?.includes('자율학습');
                const conf = (!isSelfStudy && note.confidence) ? confidenceMap[note.confidence] : null;
                const isDropped = students.find(s => s.id === note.student_id)?.is_dropped || false;
                return (
                  <div key={note.id} style={{ ...card, padding: 0, overflow: 'hidden', opacity: isDropped ? 0.4 : 1, ...(isSelfStudy ? { borderColor: 'rgba(191,90,242,0.3)' } : {}), ...(isDropped ? { borderColor: 'var(--border)' } : {}) }}>
                    {/* 헤더 */}
                    <div
                      onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '16px 20px', cursor: 'pointer', transition: 'background 0.15s ease',
                        ...(isSelfStudy ? { background: 'rgba(191,90,242,0.04)' } : {}),
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = isSelfStudy ? 'rgba(191,90,242,0.08)' : 'var(--bg-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isSelfStudy ? 'rgba(191,90,242,0.04)' : 'transparent'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          background: isSelfStudy ? 'rgba(191,90,242,0.15)' : (conf?.bg || 'var(--blue-dim)'),
                          color: isSelfStudy ? 'var(--purple)' : (conf?.color || 'var(--blue-light)'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, fontWeight: 700,
                        }}>
                          {isSelfStudy ? '📚' : (note.students?.name?.[0] || '?')}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: isDropped ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: isDropped ? 'line-through' : 'none' }}>
                              {note.students?.name || '알 수 없음'}
                            </span>
                            {isDropped && (
                              <span style={{
                                padding: '1px 6px', borderRadius: 'var(--radius-pill)', fontSize: 10, fontWeight: 700,
                                background: 'rgba(255,69,58,0.12)', color: 'var(--red)',
                              }}>퇴사</span>
                            )}
                            {isSelfStudy && (
                              <span style={{
                                padding: '1px 7px', borderRadius: 'var(--radius-pill)', fontSize: 10, fontWeight: 700,
                                background: 'rgba(191,90,242,0.15)', color: 'var(--purple)',
                              }}>자율학습</span>
                            )}
                          </div>
                          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {note.title}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
                        {/* 슬롯1: 태그 (가변, 모바일 숨김) */}
                        <div className="note-tag-desktop" style={{ display: 'flex', gap: 4, marginRight: 8 }}>
                          {note.tags && note.tags.filter(t => t !== '자율학습').length > 0 && (
                            <span style={{
                              padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                              fontSize: 11, fontWeight: 500,
                              background: isSelfStudy ? 'rgba(191,90,242,0.1)' : 'var(--bg-hover)',
                              color: isSelfStudy ? 'var(--purple)' : 'var(--text-tertiary)',
                              border: isSelfStudy ? '1px solid rgba(191,90,242,0.2)' : '1px solid var(--border)',
                              whiteSpace: 'nowrap',
                            }}>{note.tags.filter(t => t !== '자율학습')[0]}{note.tags.filter(t => t !== '자율학습').length > 1 ? ` +${note.tags.filter(t => t !== '자율학습').length - 1}` : ''}</span>
                          )}
                        </div>
                        {/* 슬롯2: 이해도 (고정 28px) — 자율학습이면 빈칸 */}
                        <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
                          {!isSelfStudy && conf && <span title={conf.label} style={{ fontSize: 15 }}>{conf.emoji}</span>}
                        </div>
                        {/* 슬롯3: 점수 + 우수 (고정 66px) — 자율학습이면 빈칸 */}
                        <div style={{ width: 66, textAlign: 'center', flexShrink: 0 }}>
                          {!isSelfStudy && (
                            <span style={{
                              padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 700,
                              background: (note.participation_score || 0) >= 3 ? 'rgba(48,209,88,0.15)' : (note.participation_score || 0) >= 1 ? 'rgba(255,159,10,0.12)' : 'var(--bg-hover)',
                              color: (note.participation_score || 0) >= 3 ? 'var(--green)' : (note.participation_score || 0) >= 1 ? 'var(--orange)' : 'var(--text-muted)',
                              whiteSpace: 'nowrap',
                            }}>
                              {note.best_learning ? '⭐' : ''} {note.participation_score || 0}/3
                            </span>
                          )}
                        </div>
                        {/* 슬롯4: 화살표 (고정 20px) */}
                        <div style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>
                          <span style={{
                            fontSize: 14, color: 'var(--text-muted)',
                            display: 'inline-block',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                          }}>▾</span>
                        </div>
                      </div>
                    </div>

                    {/* 펼친 내용 */}
                    {isExpanded && (
                      <div style={{ padding: '16px 20px 20px', borderTop: '1px solid var(--border)' }}>
                        {note.tags && note.tags.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                            {note.tags.map(tag => (
                              <span key={tag} style={{
                                padding: '4px 12px', borderRadius: 'var(--radius-pill)',
                                fontSize: 13, fontWeight: 500, background: 'var(--blue-dim)', color: 'var(--blue-light)',
                              }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <NoteContentRenderer content={note.content} contentType={note.content_type} />
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right', marginTop: 12 }}>
                          작성: {new Date(note.created_at).toLocaleString('ko-KR')}
                        </div>

                        {/* 코멘트 영역 */}
                        <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                            <span style={{ fontSize: 14 }}>💬</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                              코멘트 {comments.length > 0 ? `(${comments.length})` : ''}
                            </span>
                          </div>

                          {/* 코멘트 목록 */}
                          {comments.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 300, overflowY: 'auto', padding: '0 4px' }}>
                              {comments.map(c => (
                                <div
                                  key={c.id}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: c.author_role === 'admin' ? 'flex-end' : 'flex-start',
                                  }}
                                >
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span>{c.author_role === 'admin' ? '🧑‍🏫' : '🧑‍🎓'} {c.author_name}</span>
                                    <span>{new Date(c.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <div
                                    style={{
                                      maxWidth: '80%',
                                      padding: '10px 14px',
                                      borderRadius: c.author_role === 'admin' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                      background: c.author_role === 'admin' ? 'var(--blue)' : 'var(--bg-elevated)',
                                      color: c.author_role === 'admin' ? '#fff' : 'var(--text-primary)',
                                      fontSize: 14, lineHeight: 1.5,
                                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                      position: 'relative',
                                    }}
                                    onMouseEnter={e => {
                                      const del = e.currentTarget.querySelector('.del-btn') as HTMLElement;
                                      if (del) del.style.opacity = '1';
                                    }}
                                    onMouseLeave={e => {
                                      const del = e.currentTarget.querySelector('.del-btn') as HTMLElement;
                                      if (del) del.style.opacity = '0';
                                    }}
                                  >
                                    {c.content}
                                    {c.author_role === 'admin' && (
                                      <button
                                        className="del-btn"
                                        onClick={() => deleteComment(c.id, note.id)}
                                        style={{
                                          position: 'absolute', top: -6, right: -6,
                                          width: 20, height: 20, borderRadius: '50%',
                                          background: 'var(--red)', color: '#fff',
                                          border: 'none', fontSize: 11, cursor: 'pointer',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          opacity: 0, transition: 'opacity 0.15s ease',
                                        }}
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                              <div ref={commentEndRef} />
                            </div>
                          )}

                          {/* 입력란 */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                            <textarea
                              value={commentInput}
                              onChange={e => setCommentInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  sendComment(note.id);
                                }
                              }}
                              placeholder="코멘트를 남겨보세요... (Enter로 전송)"
                              rows={1}
                              style={{
                                flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                                color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                                resize: 'none', minHeight: 42, maxHeight: 120,
                                fontFamily: 'inherit',
                              }}
                              onInput={e => {
                                const t = e.currentTarget;
                                t.style.height = 'auto';
                                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                              }}
                            />
                            <button
                              onClick={() => sendComment(note.id)}
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ ...card, textAlign: 'center', padding: 48 }}>
              <p style={{ fontSize: 16, color: 'var(--text-muted)', margin: 0 }}>
                {filterStudentId ? '해당 교육생의 노트가 없어요' : '이 날짜에 작성된 노트가 없어요'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── 인라인 서식 (볼드, 기울임) ──
function renderInline(text: string): React.ReactNode {
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match;
  let k = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={k++}>{text.slice(last, match.index)}</span>);
    if (match[2]) parts.push(<strong key={k++}>{match[2]}</strong>);
    else if (match[4]) parts.push(<em key={k++}>{match[4]}</em>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>);
  return parts.length > 0 ? parts : text;
}

// ── 마크다운 라인 렌더러 (관리자 STEP용) ──
function renderMdLines(text: string): React.ReactNode {
  // 멀티라인 테이블 셀 병합
  const rawLines = text.split('\n');
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    if (t.startsWith('|') && !t.endsWith('|')) {
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
  const els: React.ReactNode[] = [];
  let bullets: { text: string; indent: number }[] = [];
  let tblRows: string[][] = [];
  let k = 0;

  const flushB = () => {
    if (!bullets.length) return;
    els.push(
      <div key={k++} style={{ display: 'flex', flexDirection: 'column', gap: 3, margin: '3px 0' }}>
        {bullets.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingLeft: b.indent * 16 }}>
            <span style={{ minWidth: 5, height: 5, borderRadius: '50%', flexShrink: 0, marginTop: 7, background: b.indent > 0 ? 'var(--text-muted)' : 'var(--blue-light)' }} />
            <span style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.55 }}>{renderInline(b.text)}</span>
          </div>
        ))}
      </div>
    );
    bullets = [];
  };
  const flushT = () => {
    if (!tblRows.length) return;
    const data = tblRows.filter(r => !r.every(c => /^[-:\s]+$/.test(c)));
    if (!data.length) { tblRows = []; return; }
    els.push(
      <div key={k++} style={{ overflowX: 'auto', margin: '8px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>{data[0].map((h, i) => <th key={i} style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>{renderInline(h.trim())}</th>)}</tr></thead>
          <tbody>{data.slice(1).map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-second)', fontSize: 13, lineHeight: 1.5 }}>{renderInline(cell.trim())}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    tblRows = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushB();
      tblRows.push(line.trim().slice(1, -1).split('|').map(c => c.trim()));
      continue;
    }
    if (tblRows.length) flushT();

    const bm = line.match(/^(\s*)[•\-]\s*(.+)/);
    if (bm && !line.trim().startsWith('---')) { flushT(); bullets.push({ text: bm[2], indent: Math.floor(bm[1].length / 2) }); continue; }
    flushB();

    const t = line.trim();
    if (!t) { els.push(<div key={k++} style={{ height: 6 }} />); continue; }

    const hm = t.match(/^(#{1,4})\s+(.+)/);
    if (hm) {
      const lv = hm[1].length;
      els.push(<div key={k++} style={{ fontSize: lv <= 2 ? 16 : 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: lv <= 2 ? 10 : 6, paddingBottom: lv <= 2 ? 4 : 0, borderBottom: lv <= 2 ? '2px solid var(--border)' : 'none' }}>{renderInline(hm[2])}</div>);
      continue;
    }
    const nm = t.match(/^(\d+)\.\s+(.+)/);
    if (nm) {
      els.push(
        <div key={k++} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '2px 0' }}>
          <span style={{ minWidth: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 2, background: 'var(--blue-dim)', color: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{nm[1]}</span>
          <span style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.7 }}>{renderInline(nm[2])}</span>
        </div>
      );
      continue;
    }

    els.push(<div key={k++} style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.55 }}>{renderInline(t)}</div>);
  }
  flushB(); flushT();
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{els}</div>;
}

// ── 블록 렌더러 ──
function NoteContentRenderer({ content, contentType }: { content: string; contentType?: string }) {
  // STEP 구조 (노션 임포트 + 앱 작성)
  if (contentType === 'steps') {
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
            if (!text) return (
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
                  {completed && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ 완료</span>}
                </div>
                <div style={{ padding: '12px 16px' }}>
                  {renderMdLines(text)}
                </div>
              </div>
            );
          })}
        </div>
      );
    } catch { /* fallback */ }
  }

  // 기존 블록 배열 구조
  let blocks: { id: string; type: string; content: string; items: string[]; headers: string[]; rows: string[][] }[] | null = null;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) blocks = parsed;
  } catch { /* plain text */ }

  if (!blocks) {
    return (
      <div style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
        {content}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {blocks.map(block => {
        if (block.type === 'text') {
          return <div key={block.id} style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{block.content}</div>;
        }
        if (block.type === 'numbered-list') {
          return (
            <div key={block.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {block.items.filter(i => i.trim()).map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ minWidth: 22, height: 22, borderRadius: '50%', background: 'var(--blue-dim)', color: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{idx + 1}</span>
                  <span style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.7 }}>{item}</span>
                </div>
              ))}
            </div>
          );
        }
        if (block.type === 'table') {
          return (
            <div key={block.id} style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{block.headers.map((h, i) => <th key={i} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>{h}</th>)}</tr></thead>
                <tbody>{block.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-second)', fontSize: 13 }}>{cell}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        if (block.type === 'quote') {
          return <div key={block.id} style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: 'var(--bg-hover)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>{block.content}</div>;
        }
        return null;
      })}
    </div>
  );
}
