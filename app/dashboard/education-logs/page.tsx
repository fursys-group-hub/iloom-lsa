'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

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

export default function EducationLogsPage() {
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [students, setStudents] = useState<StudentBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [filterStudentId, setFilterStudentId] = useState('');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

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
          const dates = [...new Set(notesData.notes.map((n: StudentNote) => n.created_at.slice(0, 10)))].sort().reverse();
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
    return [...new Set(notes.map(n => n.created_at.slice(0, 10)))].sort().reverse();
  }, [notes]);

  // 선택된 날짜의 노트
  const notesByDate = useMemo(() => {
    let filtered = notes.filter(n => n.created_at.slice(0, 10) === selectedDate);
    if (filterStudentId) filtered = filtered.filter(n => n.student_id === filterStudentId);
    return filtered;
  }, [notes, selectedDate, filterStudentId]);

  // 제출/미제출 현황 (날짜 기준)
  const submissionStatus = useMemo(() => {
    const submittedIds = new Set(notes.filter(n => n.created_at.slice(0, 10) === selectedDate).map(n => n.student_id));
    const submitted = students.filter(s => submittedIds.has(s.id));
    const notSubmitted = students.filter(s => !submittedIds.has(s.id));
    return { submitted, notSubmitted };
  }, [notes, selectedDate, students]);

  // 이해도 요약
  const confidenceSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    notesByDate.forEach(n => {
      if (n.confidence) counts[n.confidence] = (counts[n.confidence] || 0) + 1;
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

            {/* 학생 필터 */}
            <select
              value={filterStudentId}
              onChange={e => { setFilterStudentId(e.target.value); setExpandedNoteId(null); }}
              style={{
                padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer',
              }}
            >
              <option value="">전체 교육생</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
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
                          background: 'var(--red-dim)', color: 'var(--red)',
                          fontSize: 13, fontWeight: 500,
                        }}>
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 이해도 분포 */}
              <div style={{ ...card, flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                const conf = note.confidence ? confidenceMap[note.confidence] : null;
                return (
                  <div key={note.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    {/* 헤더 */}
                    <div
                      onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '16px 20px', cursor: 'pointer', transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%',
                          background: conf?.bg || 'var(--blue-dim)', color: conf?.color || 'var(--blue-light)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 15, fontWeight: 700,
                        }}>
                          {note.students?.name?.[0] || '?'}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {note.students?.name || '알 수 없음'}
                            </span>
                            {conf && (
                              <span style={{
                                padding: '2px 10px', borderRadius: 'var(--radius-pill)',
                                fontSize: 12, fontWeight: 600, background: conf.bg, color: conf.color,
                              }}>
                                {conf.emoji} {conf.label}
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                            {note.title}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* 참여점수 */}
                        {note.participation_score != null && note.participation_score > 0 && (
                          <span style={{
                            padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 700,
                            background: note.participation_score >= 3 ? 'rgba(48,209,88,0.12)' : note.participation_score >= 1 ? 'rgba(255,159,10,0.12)' : 'rgba(255,69,58,0.12)',
                            color: note.participation_score >= 3 ? 'var(--green)' : note.participation_score >= 1 ? 'var(--orange)' : 'var(--red)',
                          }}>
                            {note.participation_score}/3
                          </span>
                        )}
                        {note.best_learning && (
                          <span style={{
                            padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 600,
                            background: 'rgba(255,159,10,0.12)', color: 'var(--orange)',
                          }}>
                            ⭐ 우수학습
                          </span>
                        )}
                        {note.tags && note.tags.length > 0 && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            {note.tags.slice(0, 3).map(tag => (
                              <span key={tag} style={{
                                padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                                fontSize: 12, fontWeight: 500, background: 'var(--bg-hover)',
                                color: 'var(--text-tertiary)', border: '1px solid var(--border)',
                              }}>
                                {tag}
                              </span>
                            ))}
                            {note.tags.length > 3 && (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{note.tags.length - 3}</span>
                            )}
                          </div>
                        )}
                        <span style={{
                          fontSize: 14, color: 'var(--text-muted)',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                        }}>▾</span>
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
                  background: completed ? 'rgba(48,209,88,0.06)' : 'var(--bg-elevated)',
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
