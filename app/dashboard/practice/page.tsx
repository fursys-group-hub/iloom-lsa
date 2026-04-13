'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// ── 타입 ──
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

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: 24,
};

const STATS_FIELDS = [
  { key: 'stats_consult', label: '상담(건)' },
  { key: 'stats_estimate', label: '견적(건)' },
  { key: 'stats_order', label: '수주(건)' },
  { key: 'stats_amount', label: '수주금액(원)' },
] as const;

const SECTION_DEFS = [
  { key: 'step1', label: '기억에 남는 고객님' },
  { key: 'step2', label: '선배님에게 배운 한 끗 차이' },
  { key: 'step3', label: '칭찬할 점' },
  { key: 'step4', label: '보완할 점' },
];

function toKSTDate(utcStr: string): string {
  const d = new Date(utcStr);
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ── 이미지 그리드 ──
function StepImagesGrid({ images }: { images: string[] }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  if (!images || images.length === 0) return null;
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0 4px' }}>
        {images.map((url, i) => (
          <img key={i} src={url} alt={`첨부 ${i + 1}`}
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
        <div onClick={() => setLightboxIdx(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--overlay-heavy)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <img src={images[lightboxIdx]} alt="확대 보기" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
          {images.length > 1 && (
            <div style={{ position: 'absolute', bottom: 32, display: 'flex', gap: 12 }}>
              <button onClick={e => { e.stopPropagation(); setLightboxIdx((lightboxIdx - 1 + images.length) % images.length); }}
                style={{ padding: '10px 20px', borderRadius: 'var(--radius-md)', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>◀ 이전</button>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, alignSelf: 'center' }}>{lightboxIdx + 1} / {images.length}</span>
              <button onClick={e => { e.stopPropagation(); setLightboxIdx((lightboxIdx + 1) % images.length); }}
                style={{ padding: '10px 20px', borderRadius: 'var(--radius-md)', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>다음 ▶</button>
            </div>
          )}
          <button onClick={() => setLightboxIdx(null)}
            style={{ position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
      )}
    </>
  );
}

// ── 메인 ──
export default function DashboardPracticePage() {
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [students, setStudents] = useState<StudentBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [filterStudentId, setFilterStudentId] = useState('');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // 보고서
  const [reportStatus, setReportStatus] = useState<Record<string, { exists: boolean; groupId: string | null; practiceCount: number }>>({});
  const [copyingPrompt, setCopyingPrompt] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // 해당 날짜 보고서 존재 여부 확인
  const checkReportStatus = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/practice-report?date=${date}`);
      const data = await res.json();
      setReportStatus(prev => ({ ...prev, [date]: { exists: data.exists, groupId: data.groupId, practiceCount: data.practiceCount } }));
    } catch {
      setReportStatus(prev => ({ ...prev, [date]: { exists: false, groupId: null, practiceCount: 0 } }));
    }
  }, []);

  useEffect(() => {
    if (selectedDate) checkReportStatus(selectedDate);
  }, [selectedDate, checkReportStatus]);

  // 프롬프트 복사
  const copyPracticePrompt = useCallback(async () => {
    if (!selectedDate || copyingPrompt) return;
    setCopyingPrompt(true);
    try {
      const res = await fetch(`/api/practice-report?date=${selectedDate}`);
      const data = await res.json();
      if (!data.students || data.students.length === 0) {
        showToast('해당 날짜에 실습일지가 없습니다.');
        setCopyingPrompt(false);
        return;
      }

      const d = new Date(selectedDate + 'T00:00:00');
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      const dateLabel = `${d.getMonth() + 1}/${d.getDate()} (${dayNames[d.getDay()]})`;

      const totalConsult = data.students.reduce((s: number, a: { consult: number }) => s + a.consult, 0);
      const totalEstimate = data.students.reduce((s: number, a: { estimate: number }) => s + a.estimate, 0);
      const totalOrder = data.students.reduce((s: number, a: { order: number }) => s + a.order, 0);
      const totalAmount = data.students.reduce((s: number, a: { amount: number }) => s + a.amount, 0);

      let studentSections = '';
      for (const s of data.students) {
        studentSections += `
===== ${s.name} (id: ${s.studentId}) =====
실적: 어프로치 ${s.consult} / 견적 ${s.estimate} / 수주 ${s.order} / 수주금액 ${s.amount.toLocaleString()}원
${s.orderDetail ? `상담/수주 내역: ${s.orderDetail}` : ''}
[기억에 남는 고객] ${(s.step1 || '').substring(0, 1000)}
[선배에게 배운 점] ${(s.step2 || '').substring(0, 800)}
[칭찬할 점] ${(s.step3 || '').substring(0, 800)}
[보완할 점] ${(s.step4 || '').substring(0, 800)}

`;
      }

      const prompt = `# 일룸 매장 실습 보고서 생성 — ${dateLabel}

## 역할
당신은 일룸(iloom) 가구 브랜드의 신입 영업사원 입문교육 트레이너입니다.
아래는 ${dateLabel} 매장 실습 후 교육생들이 작성한 실습일지 데이터입니다.

## 전체 현황
총 ${data.students.length}명 / 어프로치 ${totalConsult}건 / 견적 ${totalEstimate}건 / 수주 ${totalOrder}건 / 수주금액 ${totalAmount.toLocaleString()}원

## 교육생별 실습일지 데이터
${studentSections}

## 작업 지시

위 데이터를 바탕으로 각 교육생에 대해 **전문적인 코칭 피드백**을 작성하고 Supabase \`coaching_reports\` 테이블에 저장하세요.

### 피드백 작성 규칙
1. 각 교육생의 피드백은 "→"로 시작하는 3~5줄
2. 첫 줄: **핵심 강점** (예: "고객지향적인 응대로 편안한 분위기 속에서 대화를 잘 이끌며 공감 능력이 우수함")
3. 중간: **구체적 칭찬 포인트** (실습일지 내용에서 근거를 찾아 언급)
4. 마지막: **보완 포인트** (부정적이 아닌 건설적인 톤, "~보완 시 ~기대됨" 형식)
5. 톤: 공식 보고서 문체 ("~함", "~됨", "~임")
6. 수주 실적 없는 교육생도 성장 가능성이나 태도 측면에서 긍정 포인트 찾기

### DB 저장 형식
각 교육생별로 \`coaching_reports\`에 INSERT:
- \`student_id\`: 위 데이터의 id
- \`report_type\`: 'practice'
- \`report_group_id\`: 'practice_${selectedDate}_' + Date.now()
- \`test_date\`: '${selectedDate}'
- \`subject\`: '매장 실습'
- \`student_message\`: '' (빈 문자열)
- \`manager_report\`: 아래 형식의 마크다운

\`\`\`
📋 인원별 코칭 피드백

어프로치 N / 견적 N / 수주 N / 수주금액 N원
상담/수주 품목: ...

→ 피드백 1
→ 피드백 2
→ 피드백 3
\`\`\`

모든 교육생에 대해 한 번에 INSERT하세요.`;

      await navigator.clipboard.writeText(prompt);
      showToast(`${data.students.length}명 실습일지 프롬프트가 복사되었습니다!`);
    } catch {
      showToast('프롬프트 복사에 실패했습니다.');
    }
    setCopyingPrompt(false);
  }, [selectedDate, copyingPrompt]);

  // 코멘트
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const commentEndRef = useRef<HTMLDivElement>(null);

  const fetchComments = useCallback(async (noteId: string) => {
    try {
      const res = await fetch(`/api/note-comments?note_id=${noteId}`);
      const data = await res.json();
      if (Array.isArray(data)) setComments(data);
    } catch { /* */ }
  }, []);

  const sendComment = useCallback(async (noteId: string) => {
    if (!commentInput.trim() || sendingComment) return;
    setSendingComment(true);
    try {
      const res = await fetch('/api/note-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId, author_role: 'admin', author_name: '관리자', content: commentInput.trim() }),
      });
      if (res.ok) {
        setCommentInput('');
        await fetchComments(noteId);
        setCommentCounts(prev => ({ ...prev, [noteId]: (prev[noteId] || 0) + 1 }));
        setTimeout(() => commentEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch { /* */ }
    setSendingComment(false);
  }, [commentInput, sendingComment, fetchComments]);

  const deleteComment = useCallback(async (commentId: string, noteId: string) => {
    if (!confirm('이 코멘트를 삭제할까요?')) return;
    try {
      await fetch(`/api/note-comments?id=${commentId}`, { method: 'DELETE' });
      await fetchComments(noteId);
      setCommentCounts(prev => ({ ...prev, [noteId]: Math.max((prev[noteId] || 1) - 1, 0) }));
    } catch { /* */ }
  }, [fetchComments]);

  useEffect(() => {
    if (expandedNoteId) { fetchComments(expandedNoteId); setCommentInput(''); }
    else setComments([]);
  }, [expandedNoteId, fetchComments]);

  const fetchData = useCallback(async () => {
    try {
      const [notesRes, studentsRes] = await Promise.all([
        fetch('/api/notes?all=true'),
        fetch('/api/students'),
      ]);
      const [notesData, studentsData] = await Promise.all([notesRes.json(), studentsRes.json()]);
      if (notesData?.notes) {
        // 실습일지만 필터
        const practiceNotes = notesData.notes.filter((n: StudentNote) => n.tags?.includes('실습일지'));
        setNotes(practiceNotes);
        if (practiceNotes.length > 0 && !selectedDate) {
          const dates = [...new Set(practiceNotes.map((n: StudentNote) => toKSTDate(n.created_at)))].sort().reverse();
          setSelectedDate(dates[0] as string);
        }
      }
      if (Array.isArray(studentsData)) setStudents(studentsData);
    } catch { /* */ }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  // 코멘트 수
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

  // 날짜 목록
  const availableDates = useMemo(() => {
    return [...new Set(notes.map(n => toKSTDate(n.created_at)))].sort().reverse();
  }, [notes]);

  // 선택 날짜 노트
  const notesByDate = useMemo(() => {
    let filtered = notes.filter(n => toKSTDate(n.created_at) === selectedDate);
    if (filterStudentId) filtered = filtered.filter(n => n.student_id === filterStudentId);
    return filtered;
  }, [notes, selectedDate, filterStudentId]);

  const activeStudents = useMemo(() => students.filter(s => !s.is_dropped), [students]);

  // 제출 현황
  const submissionStatus = useMemo(() => {
    const submittedIds = new Set(notesByDate.map(n => n.student_id));
    return {
      submitted: activeStudents.filter(s => submittedIds.has(s.id)),
      notSubmitted: activeStudents.filter(s => !submittedIds.has(s.id)),
    };
  }, [notesByDate, activeStudents]);

  // 전체 실적 합계
  const totalStats = useMemo(() => {
    const totals = { stats_consult: 0, stats_estimate: 0, stats_order: 0, stats_amount: 0 };
    notesByDate.forEach(n => {
      try {
        const steps = JSON.parse(n.content);
        totals.stats_consult += steps.stats_consult || 0;
        totals.stats_estimate += steps.stats_estimate || 0;
        totals.stats_order += steps.stats_order || 0;
        totals.stats_amount += steps.stats_amount || 0;
      } catch { /* */ }
    });
    return totals;
  }, [notesByDate]);

  if (loading) return <p style={{ fontSize: 16, color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}>불러오는 중...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>실습일지</h2>

      {notes.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}></p>
          <p style={{ fontSize: 16, color: 'var(--text-second)' }}>아직 제출된 실습일지가 없어요</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>교육생이 매장 실습일에 작성하면 여기에 표시됩니다</p>
        </div>
      ) : (
        <>
          {/* 날짜 선택 */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <select
              value={selectedDate}
              onChange={e => { setSelectedDate(e.target.value); setExpandedNoteId(null); }}
              style={{
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
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
            {/* 보고서 버튼 */}
            {reportStatus[selectedDate]?.exists && (
              <a
                href="/dashboard/reports"
                style={{
                  padding: '8px 16px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--green)', background: 'transparent',
                  color: 'var(--green)', fontSize: 13, fontWeight: 600,
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                보고서 보기
              </a>
            )}
            <button
              onClick={copyPracticePrompt}
              disabled={copyingPrompt}
              style={{
                padding: '8px 16px', borderRadius: 'var(--radius-md)',
                border: 'none', background: copyingPrompt ? 'var(--bg-hover)' : 'var(--blue)',
                color: copyingPrompt ? 'var(--text-muted)' : '#fff',
                fontSize: 13, fontWeight: 600, cursor: copyingPrompt ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {copyingPrompt ? '준비 중...' : '보고서 프롬프트 복사'}
            </button>

            {/* 학생 필터 */}
            <select value={filterStudentId} onChange={e => setFilterStudentId(e.target.value)}
              style={{
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)', background: 'var(--bg-surface)',
                color: 'var(--text-primary)', fontSize: 14, marginLeft: 'auto',
                cursor: 'pointer', outline: 'none',
              }}>
              <option value="">전체 교육생</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name}{s.is_dropped ? ' (퇴사)' : ''}</option>
              ))}
            </select>
          </div>

          {/* 요약 카드 */}
          {!filterStudentId && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {/* 제출 현황 */}
              <div style={{ ...card, padding: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>제출 현황</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--blue)' }}>{submissionStatus.submitted.length}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>제출</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--red)' }}>{submissionStatus.notSubmitted.length}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>미제출</div>
                  </div>
                </div>
                {submissionStatus.notSubmitted.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    미제출: {submissionStatus.notSubmitted.map(s => s.name).join(', ')}
                  </div>
                )}
              </div>
              {/* 실적 합계 */}
              {STATS_FIELDS.map(sf => (
                <div key={sf.key} style={{ ...card, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{sf.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {sf.key === 'stats_amount'
                      ? totalStats[sf.key].toLocaleString()
                      : totalStats[sf.key]}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 노트 목록 */}
          {notesByDate.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {notesByDate.map(note => {
                const isExpanded = expandedNoteId === note.id;
                const studentName = note.students?.name || '알 수 없음';
                const isDropped = students.find(s => s.id === note.student_id)?.is_dropped;

                let statsData: Record<string, number> = {};
                try {
                  const steps = JSON.parse(note.content);
                  statsData = {
                    stats_consult: steps.stats_consult || 0,
                    stats_estimate: steps.stats_estimate || 0,
                    stats_order: steps.stats_order || 0,
                    stats_amount: steps.stats_amount || 0,
                  };
                } catch { /* */ }

                return (
                  <div key={note.id} style={{ opacity: isDropped ? 0.4 : 1 }}>
                    {/* 카드 헤더 (클릭으로 펼침) */}
                    <button
                      onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                      style={{
                        width: '100%', textAlign: 'left', cursor: 'pointer',
                        padding: '16px 20px', borderRadius: isExpanded ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                        border: isExpanded ? '2px solid var(--blue)' : '1px solid var(--border)',
                        borderBottom: isExpanded ? '1px solid var(--border)' : undefined,
                        background: isExpanded ? 'var(--blue-dim)' : 'var(--bg-surface)',
                        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                      }}>
                      {/* 아바타 + 이름 */}
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--blue-dim)', color: 'var(--blue)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700,
                      }}>
                        {studentName?.[0] || '?'}
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', minWidth: 60 }}>
                        {studentName}
                      </span>
                      {/* 실적 뱃지 */}
                      <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                        {statsData.stats_consult > 0 && <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue)', fontWeight: 600 }}>상담 {statsData.stats_consult}</span>}
                        {statsData.stats_estimate > 0 && <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue-light)', fontWeight: 600 }}>견적 {statsData.stats_estimate}</span>}
                        {statsData.stats_order > 0 && <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--orange-dim)', color: 'var(--orange)', fontWeight: 600 }}>수주 {statsData.stats_order}</span>}
                        {statsData.stats_amount > 0 && <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--purple-dim)', color: 'var(--purple)', fontWeight: 600 }}>{statsData.stats_amount.toLocaleString()}원</span>}
                      </div>
                      {/* 섹션 완료 + 코멘트 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {note.content_type === 'steps' && (() => {
                          try {
                            const steps = JSON.parse(note.content);
                            const filled = [!!steps.step1?.trim(), !!steps.step2?.trim(), !!steps.step3?.trim(), !!steps.step4?.trim()];
                            const done = filled.filter(Boolean).length;
                            return (
                              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                {['1', '2', '3', '4'].map((num, i) => (
                                  <span key={i} style={{
                                    fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                                    background: filled[i] ? 'var(--blue-dim)' : 'var(--bg-hover)',
                                    color: filled[i] ? 'var(--blue)' : 'var(--text-muted)',
                                    opacity: filled[i] ? 1 : 0.3, fontWeight: 700,
                                  }}>{num}</span>
                                ))}
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>{done}/4</span>
                              </div>
                            );
                          } catch { return null; }
                        })()}
                        {(commentCounts[note.id] || 0) > 0 && (
                          <span style={{
                            padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                            background: 'var(--blue-dim)', color: 'var(--blue-light)',
                            fontSize: 11, fontWeight: 700,
                          }}>{commentCounts[note.id]}개 코멘트</span>
                        )}
                        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* 펼친 상세 */}
                    {isExpanded && (
                      <div style={{
                        padding: 20, border: '2px solid var(--blue)', borderTop: 'none',
                        borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                        background: 'var(--bg-surface)',
                      }}>
                        {/* 실적 상세 */}
                        {(() => {
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
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{sf.label}</div>
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
                        {(() => {
                          try {
                            const steps = JSON.parse(note.content);
                            if (!steps.order_detail) return null;
                            return (
                              <div style={{
                                padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)',
                                marginBottom: 12, border: '1px solid var(--border)',
                              }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>상담/수주 내역</div>
                                <div style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{steps.order_detail}</div>
                              </div>
                            );
                          } catch { return null; }
                        })()}

                        {/* 섹션 내용 */}
                        {note.content_type === 'steps' && (() => {
                          try {
                            const steps = JSON.parse(note.content);
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {SECTION_DEFS.map(({ key, label }) => {
                                  const text = steps[key] as string;
                                  const images = steps[`${key}_images`] as string[] | undefined;
                                  if (!text && (!images || images.length === 0)) return (
                                    <div key={key} style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', opacity: 0.5 }}>
                                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
                                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>미작성</span>
                                    </div>
                                  );
                                  return (
                                    <div key={key} style={{ borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                                      <div style={{ padding: '10px 16px', background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
                                        {images && images.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{images.length}장</span>}
                                      </div>
                                      <div style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text-second)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                        {text}
                                        <StepImagesGrid images={images || []} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          } catch { return <div style={{ fontSize: 14, color: 'var(--text-second)', whiteSpace: 'pre-wrap' }}>{note.content}</div>; }
                        })()}

                        {/* 코멘트 영역 */}
                        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                              코멘트 {comments.length > 0 ? `(${comments.length})` : ''}
                            </span>
                          </div>
                          {/* 기존 코멘트 */}
                          {comments.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 300, overflowY: 'auto' }}>
                              {comments.map(c => (
                                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: c.author_role === 'admin' ? 'flex-end' : 'flex-start' }}>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span>{c.author_name}</span>
                                    <span>{new Date(c.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                    {c.author_role === 'admin' && (
                                      <button onClick={() => deleteComment(c.id, note.id)}
                                        style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>삭제</button>
                                    )}
                                  </div>
                                  <div style={{
                                    maxWidth: '80%', padding: '10px 14px',
                                    borderRadius: c.author_role === 'admin' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                    background: c.author_role === 'admin' ? 'var(--blue)' : 'var(--bg-elevated)',
                                    color: c.author_role === 'admin' ? '#fff' : 'var(--text-primary)',
                                    fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                  }}>{c.content}</div>
                                </div>
                              ))}
                              <div ref={commentEndRef} />
                            </div>
                          )}
                          {/* 입력 */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                            <textarea
                              value={commentInput}
                              onChange={e => setCommentInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(note.id); } }}
                              placeholder="코멘트를 남겨보세요... (Enter로 전송)"
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
                              onClick={() => sendComment(note.id)}
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ ...card, textAlign: 'center', padding: 32 }}>
              <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>이 날짜에 제출된 실습일지가 없어요</p>
            </div>
          )}
        </>
      )}

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 24px', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
          boxShadow: 'var(--shadow-lg)', zIndex: 9999,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
