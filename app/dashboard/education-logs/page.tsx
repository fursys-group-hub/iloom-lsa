'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

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
            background: 'var(--overlay-heavy)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <img
            src={images[lightboxIdx]}
            alt="확대 보기"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 'var(--radius-sm)' }}
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
  // 5단계 (신규)
  very_confident: { label: '자신만만', emoji: '😎', color: 'var(--green)', bg: 'var(--green-dim)' },
  confident: { label: '자신있어요', emoji: '😊', color: 'var(--blue-light)', bg: 'var(--blue-dim)' },
  normal: { label: '보통이에요', emoji: '😐', color: 'var(--text-tertiary)', bg: 'var(--bg-hover)' },
  uncertain: { label: '알쏭달쏭', emoji: '🤔', color: 'var(--orange)', bg: 'var(--orange-dim)' },
  need_help: { label: '도움요청', emoji: '😵', color: 'var(--red)', bg: 'var(--red-dim)' },
  // 기존 데이터 호환
  understood: { label: '자신있어요', emoji: '😊', color: 'var(--blue-light)', bg: 'var(--blue-dim)' },
  confused: { label: '알쏭달쏭', emoji: '🤔', color: 'var(--orange)', bg: 'var(--orange-dim)' },
  half: { label: '알쏭달쏭', emoji: '🤔', color: 'var(--orange)', bg: 'var(--orange-dim)' },
  help_needed: { label: '도움요청', emoji: '😵', color: 'var(--red)', bg: 'var(--red-dim)' },
};

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '20px 24px',
  boxShadow: 'var(--shadow-sm)',
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
  const [editingDateNoteId, setEditingDateNoteId] = useState<string | null>(null);
  const [editingDateValue, setEditingDateValue] = useState('');
  const commentEndRef = useRef<HTMLDivElement>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

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
        setCommentCounts(prev => ({ ...prev, [noteId]: (prev[noteId] || 0) + 1 }));
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
      setCommentCounts(prev => ({ ...prev, [noteId]: Math.max((prev[noteId] || 1) - 1, 0) }));
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
        // 실습일지는 별도 페이지이므로 제외
        const filtered = notesData.notes.filter((n: StudentNote) => !n.tags?.includes('실습일지'));
        setNotes(filtered);
        // 최신 날짜 자동 선택
        if (filtered.length > 0 && !selectedDate) {
          const dates = [...new Set(filtered.map((n: StudentNote) => toKSTDate(n.created_at)))].sort().reverse();
          setSelectedDate(dates[0] as string);
        }
      }
      if (Array.isArray(studentsData)) setStudents(studentsData);
    } catch { /* */ }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 헤더 */}
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
        교육일지
      </h2>

      {notes.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}></p>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            아직 작성된 교육일지가 없어요
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            교육생들이 교육일지를 작성하면 여기에 표시됩니다
          </p>
        </div>
      ) : (
        <>
          {/* 날짜 선택 + 필터 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <select
              value={selectedDate}
              onChange={e => { setSelectedDate(e.target.value); setExpandedNoteId(null); }}
              style={{
                padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', background: 'var(--bg-surface)',
                color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', outline: 'none',
              }}
            >
              {availableDates.map(date => {
                const d = new Date(date + 'T00:00:00');
                const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
                return <option key={date} value={date}>{d.getMonth() + 1}/{d.getDate()} ({dayNames[d.getDay()]})</option>;
              })}
            </select>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* 필터: 밑줄 탭 */}
              <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
                {([
                  { key: '', label: '전체' },
                  { key: 'best', label: '우수' },
                  { key: 'incomplete', label: '미완료' },
                ] as const).map((f, i) => (
                  <button
                    key={f.key}
                    onClick={() => { setFilterType(filterType === f.key ? '' : f.key as '' | 'best' | 'incomplete'); setExpandedNoteId(null); }}
                    style={{
                      padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,
                      background: 'transparent', cursor: 'pointer',
                      border: 'none',
                      borderBottom: filterType === f.key ? '2px solid var(--blue)' : '2px solid transparent',
                      color: filterType === f.key ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontSize: 15, fontWeight: filterType === f.key ? 600 : 400,
                      transition: 'all 0.15s ease', marginBottom: -1,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {/* 학생 필터 */}
              <select
                value={filterStudentId}
                onChange={e => { setFilterStudentId(e.target.value); setExpandedNoteId(null); }}
                style={{
                  padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', background: 'var(--bg-surface)',
                  color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', outline: 'none',
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

          {/* 요약 카드 — 1개 카드에 통합 */}
          {selectedDate && !filterStudentId && (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {/* 상단: 제출 + 참여도 한 줄 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{submissionStatus.submitted.length}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>제출</div>
                </div>
                <div style={{ padding: '14px 12px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: submissionStatus.notSubmitted.length > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{submissionStatus.notSubmitted.length}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>미제출</div>
                </div>
                <div style={{ padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{participationSummary[3]}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>완벽 3/3</div>
                </div>
                <div style={{ padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--blue-light)' }}>{participationSummary[2]}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>거의다 2/3</div>
                </div>
                <div style={{ padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--orange)' }}>{participationSummary[1]}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>시작 1/3</div>
                </div>
                <div style={{ padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{activeStudents.length}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>전체</div>
                </div>
              </div>
              {/* 하단: 미제출 명단 + 추가 설명 필요 */}
              <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                {submissionStatus.notSubmitted.length > 0 && (
                  <span>미제출: {submissionStatus.notSubmitted.map(s => s.name).join(', ')}</span>
                )}
                {(() => {
                  const needHelp = notesByDate.filter(n => {
                    if (n.tags?.includes('자율학습')) return false;
                    return ['confused', 'half', 'help_needed', 'need_help', 'uncertain'].includes(n.confidence || '');
                  });
                  if (needHelp.length === 0) return null;
                  return (
                    <div style={{ width: '100%', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>추가 설명 필요:</span>
                      {needHelp.map(n => {
                        const c = n.confidence ? confidenceMap[n.confidence] : null;
                        return (
                          <span key={n.id} style={{
                            padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
                            background: c?.bg || 'var(--orange-dim)', color: c?.color || 'var(--orange)',
                          }}>
                            {c?.emoji} {n.students?.name || '?'}
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
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
                const displayTags = (note.tags || []).filter(t => t !== '자율학습');
                return (
                  <div key={note.id} style={{ opacity: isDropped ? 0.4 : 1 }}>
                    {/* 헤더 (한 줄) */}
                    <button
                      onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                      style={{
                        width: '100%', textAlign: 'left', cursor: 'pointer',
                        padding: '16px 20px',
                        borderRadius: isExpanded ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                        border: isExpanded ? '2px solid var(--blue)' : isSelfStudy ? '1px solid var(--purple-dim)' : '1px solid var(--border)',
                        borderBottom: isExpanded ? '1px solid var(--border)' : undefined,
                        background: isExpanded ? 'var(--blue-dim)' : isSelfStudy ? 'var(--purple-dim)' : 'var(--bg-surface)',
                        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                      }}
                    >
                      {/* 아바타 + 이름 */}
                      <div className="hide-mobile" style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: isSelfStudy ? 'var(--purple-dim)' : 'var(--blue-dim)',
                        color: isSelfStudy ? 'var(--purple)' : 'var(--blue)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700,
                      }}>
                        {isSelfStudy ? '자' : (note.students?.name?.[0] || '?')}
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 700, color: isDropped ? 'var(--text-muted)' : 'var(--text-primary)', minWidth: 50, textDecoration: isDropped ? 'line-through' : 'none' }}>
                        {note.students?.name || '?'}
                      </span>
                      {/* 제목 + 뱃지 */}
                      <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                        <span className="note-subtitle" style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                          {note.one_word || note.title}
                        </span>
                        {isDropped && (
                          <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--red-dim)', color: 'var(--red)' }}>퇴사</span>
                        )}
                        {isSelfStudy && (
                          <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--purple-dim)', color: 'var(--purple)' }}>자율학습</span>
                        )}
                        {displayTags.length > 0 && (
                          <span style={{
                            padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
                            background: isSelfStudy ? 'var(--purple-dim)' : 'var(--bg-hover)',
                            color: isSelfStudy ? 'var(--purple)' : 'var(--text-tertiary)',
                          }}>{displayTags[0]}{displayTags.length > 1 ? ` +${displayTags.length - 1}` : ''}</span>
                        )}
                      </div>
                      {/* 우측: STEP 아이콘 + 점수 + 코멘트 + 화살표 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {/* STEP 완료 아이콘 */}
                        {!isSelfStudy && note.content_type === 'steps' && (() => {
                          try {
                            const steps = JSON.parse(note.content);
                            const filled = [!!steps.step1?.trim(), !!steps.step2?.trim(), !!steps.step3?.trim()];
                            return (
                              <div style={{ display: 'flex', gap: 3 }}>
                                {['1', '2', '3'].map((num, i) => (
                                  <span key={i} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: filled[i] ? 'var(--green-dim)' : 'var(--bg-hover)', color: filled[i] ? 'var(--green)' : 'var(--text-muted)', opacity: filled[i] ? 1 : 0.3, fontWeight: 600 }}>{num}</span>
                                ))}
                              </div>
                            );
                          } catch { return null; }
                        })()}
                        {/* 이해도 이모지 */}
                        {!isSelfStudy && conf && <span title={conf.label} style={{ fontSize: 14 }}>{conf.emoji}</span>}
                        {/* 참여 점수 */}
                        {!isSelfStudy && (
                          <span style={{
                            padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
                            background: (note.participation_score || 0) >= 3 ? 'var(--green-dim)' : (note.participation_score || 0) >= 1 ? 'var(--orange-dim)' : 'var(--bg-hover)',
                            color: (note.participation_score || 0) >= 3 ? 'var(--green)' : (note.participation_score || 0) >= 1 ? 'var(--orange)' : 'var(--text-muted)',
                          }}>
                            {note.participation_score || 0}/3
                          </span>
                        )}
                        {/* 코멘트 */}
                        {(commentCounts[note.id] || 0) > 0 && (
                          <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 12, fontWeight: 600 }}>{commentCounts[note.id]}개 코멘트</span>
                        )}
                        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* 펼친 내용 */}
                    {isExpanded && (
                      <div style={{
                        padding: '16px 20px 20px',
                        border: '2px solid var(--blue)', borderTop: 'none',
                        borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                        background: 'var(--bg-surface)',
                      }}>
                        {note.tags && note.tags.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                            {note.tags.map(tag => (
                              <span key={tag} style={{
                                padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                                fontSize: 12, fontWeight: 600, background: 'var(--blue-dim)', color: 'var(--blue-light)',
                              }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <NoteContentRenderer content={note.content} contentType={note.content_type} />
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'right', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          {editingDateNoteId === note.id ? (
                            <>
                              <input
                                type="date"
                                value={editingDateValue}
                                onChange={e => setEditingDateValue(e.target.value)}
                                style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 13 }}
                              />
                              <button
                                onClick={async () => {
                                  if (!editingDateValue) return;
                                  const newCreatedAt = new Date(`${editingDateValue}T12:00:00+09:00`).toISOString();
                                  const res = await fetch('/api/notes', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: note.id, created_at: newCreatedAt }),
                                  });
                                  if (res.ok) {
                                    setEditingDateNoteId(null);
                                    fetchData();
                                  }
                                }}
                                style={{ padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
                              >
                                확인
                              </button>
                              <button
                                onClick={() => setEditingDateNoteId(null)}
                                style={{ padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}
                              >
                                취소
                              </button>
                            </>
                          ) : (
                            <>
                              작성: {note.created_at.slice(0, 10)}
                              <button
                                onClick={() => {
                                  setEditingDateNoteId(note.id);
                                  setEditingDateValue(note.created_at.slice(0, 10));
                                }}
                                style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer' }}
                              >
                                날짜 수정
                              </button>
                            </>
                          )}
                        </div>

                        {/* 코멘트 영역 */}
                        <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
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
                                    <span>{c.author_name}</span>
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
          <thead><tr>{data[0].map((h, i) => <th key={i} style={{ padding: '12px 16px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>{renderInline(h.trim())}</th>)}</tr></thead>
          <tbody>{data.slice(1).map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text-second)', fontSize: 13, lineHeight: 1.5 }}>{renderInline(cell.trim())}</td>)}</tr>)}</tbody>
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
        { key: 'step1', label: 'STEP 1 — 핵심 필기', completed: steps.step1_completed },
        { key: 'step2', label: 'STEP 2 — LSA 비법서', completed: steps.step2_completed },
        { key: 'step3', label: 'STEP 3 — 실전 적용', completed: steps.step3_completed },
      ];

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {stepSections.map(({ key, label, completed }) => {
            const text = steps[key] as string;
            const images = steps[`${key}_images`] as string[] | undefined;
            if (!text && (!images || images.length === 0)) return (
              <div key={key} style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', opacity: 0.5 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>미작성</span>
              </div>
            );
            return (
              <div key={key} style={{ borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                <div style={{
                  padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: completed ? 'var(--step-filled-bg)' : 'var(--bg-elevated)',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {images && images.length > 0 && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{images.length}장</span>
                    )}
                    {completed && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ 완료</span>}
                  </div>
                </div>
                <div style={{ padding: '12px 16px' }}>
                  {text && renderMdLines(text)}
                  <StepImagesGrid images={images || []} />
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
                <thead><tr>{block.headers.map((h, i) => <th key={i} style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>{block.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text-second)', fontSize: 13 }}>{cell}</td>)}</tr>)}</tbody>
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
