'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ScheduleMap, DayType } from '@/lib/schedule';
import { DAY_TYPE_CONFIG } from '@/lib/schedule';

interface Batch {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  advanced_start: string | null;
  advanced_end: string | null;
  sheet_id: string | null;
  advanced_sheet_id: string | null;
  advanced_pass_score: number | null;
  is_archived: boolean;
  archived_at: string | null;
  schedule?: ScheduleMap;
}

interface StudentRow {
  id: string;
  batch_id: string;
  name: string;
  department: string | null;
  company_email: string | null;
  email: string | null;
  phone: string | null;
  store_location: string | null;
  password: string | null;
  is_dropped: boolean;
  dropped_at: string | null;
  drop_reason: string | null;
}

const emptyStudentForm = { name: '', department: '', company_email: '', email: '', phone: '', store_location: '', password: '0000' };

export default function SettingsPage() {
  // ── 기수 ──
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchForm, setBatchForm] = useState({ name: '', start_date: '', end_date: '', advanced_start: '', advanced_end: '', advanced_sheet_id: '', advanced_pass_score: 80 });
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [savingBatch, setSavingBatch] = useState(false);
  const [scheduleEdit, setScheduleEdit] = useState<ScheduleMap>({});
  const [paintMode, setPaintMode] = useState<DayType>('education');
  const [isDragging, setIsDragging] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1: 기본정보, 2: 스케줄, 3: 심화교육

  // ── 교육생 ──
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);
  const [dropModal, setDropModal] = useState<{ student: StudentRow; show: boolean } | null>(null);
  const [dropDate, setDropDate] = useState(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }));
  const [dropReason, setDropReason] = useState('');

  // 기수 불러오기
  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch('/api/batches');
      const data = await res.json();
      if (Array.isArray(data)) setBatches(data);
    } catch { /* silent */ }
  }, []);

  // 교육생 불러오기
  const fetchStudents = useCallback(async (batchId: string) => {
    setLoadingStudents(true);
    try {
      const res = await fetch(`/api/students?batch_id=${batchId}`);
      const data = await res.json();
      if (Array.isArray(data)) setStudents(data);
    } catch { /* silent */ }
    finally { setLoadingStudents(false); }
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  useEffect(() => {
    if (selectedBatchId) fetchStudents(selectedBatchId);
  }, [selectedBatchId, fetchStudents]);

  // 기본 스케줄 생성 (평일=education, 주말=off)
  const generateDefaultSchedule = (startStr: string, endStr: string) => {
    const sch: ScheduleMap = {};
    const start = new Date(startStr + 'T12:00:00Z');
    const end = new Date(endStr + 'T12:00:00Z');
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const day = d.getUTCDay();
      sch[dateStr] = (day === 0 || day === 6) ? 'off' : 'education';
    }
    setScheduleEdit(sch);
  };

  // 기수 저장
  const handleBatchSave = async () => {
    if (!batchForm.name || !batchForm.start_date || !batchForm.end_date) return;
    setSavingBatch(true);
    try {
      const res = await fetch('/api/batches', {
        method: editingBatchId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingBatchId ? { id: editingBatchId } : {}),
          name: batchForm.name,
          start_date: batchForm.start_date,
          end_date: batchForm.end_date,
          advanced_start: batchForm.advanced_start || null,
          advanced_end: batchForm.advanced_end || null,
          advanced_sheet_id: batchForm.advanced_sheet_id || null,
          advanced_pass_score: Number(batchForm.advanced_pass_score) || 80,
        }),
      });
      if (res.ok) {
        // 스케줄 저장 (편집한 경우)
        if (Object.keys(scheduleEdit).length > 0) {
          const batchData = editingBatchId ? { id: editingBatchId } : await res.json();
          const batchId = editingBatchId || batchData?.id;
          if (batchId) {
            await fetch('/api/batches', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: batchId, schedule: scheduleEdit }),
            });
          }
        }
        await fetchBatches();
        setShowBatchForm(false);
        setEditingBatchId(null);
        setScheduleEdit({});
        setWizardStep(1);
        setBatchForm({ name: '', start_date: '', end_date: '', advanced_start: '', advanced_end: '', advanced_sheet_id: '', advanced_pass_score: 80 });
      }
    } catch { /* silent */ }
    finally { setSavingBatch(false); }
  };

  // 기수 삭제
  const handleBatchDelete = async (id: string) => {
    if (!confirm('이 기수를 삭제하면 소속 교육생도 함께 삭제돼요. 계속할까요?')) return;
    try {
      await fetch('/api/batches', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await fetchBatches();
      if (selectedBatchId === id) {
        setSelectedBatchId(null);
        setStudents([]);
      }
    } catch { /* silent */ }
  };

  // 교육생 저장
  const handleStudentSave = async () => {
    if (!studentForm.name || !selectedBatchId) return;
    setSavingStudent(true);
    try {
      const res = await fetch('/api/students', {
        method: editingStudentId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingStudentId ? { id: editingStudentId } : {}),
          batch_id: selectedBatchId,
          name: studentForm.name,
          department: studentForm.department || null,
          company_email: studentForm.company_email || null,
          email: studentForm.email || null,
          phone: studentForm.phone || null,
          store_location: studentForm.store_location || null,
        }),
      });
      if (res.ok) {
        await fetchStudents(selectedBatchId);
        setShowStudentForm(false);
        setEditingStudentId(null);
        setStudentForm(emptyStudentForm);
      }
    } catch { /* silent */ }
    finally { setSavingStudent(false); }
  };

  // 교육생 삭제
  const handleStudentDelete = async (id: string) => {
    if (!confirm('이 교육생을 삭제할까요?')) return;
    try {
      await fetch('/api/students', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (selectedBatchId) await fetchStudents(selectedBatchId);
    } catch { /* silent */ }
  };

  // 퇴사 처리
  const handleDrop = async (student: StudentRow) => {
    if (student.is_dropped) {
      // 복구
      const res = await fetch('/api/students', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: student.id, is_dropped: false }),
      });
      if (res.ok && selectedBatchId) await fetchStudents(selectedBatchId);
    } else {
      setDropReason('');
      setDropDate(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }));
      setDropModal({ student, show: true });
    }
  };

  const confirmDrop = async () => {
    if (!dropModal) return;
    const res = await fetch('/api/students', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: dropModal.student.id,
        is_dropped: true,
        dropped_at: dropDate,
        drop_reason: dropReason || null,
      }),
    });
    if (res.ok) {
      setDropModal(null);
      if (selectedBatchId) await fetchStudents(selectedBatchId);
    }
  };

  // 비밀번호 초기화
  const handleResetPassword = async (student: StudentRow) => {
    if (!confirm(`${student.name}님의 비밀번호를 '0000'으로 초기화할까요?`)) return;
    const res = await fetch('/api/students', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: student.id, password: '0000' }),
    });
    if (res.ok) {
      alert(`${student.name}님의 비밀번호가 '0000'으로 초기화되었어요.`);
      if (selectedBatchId) await fetchStudents(selectedBatchId);
    }
  };

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          기수 관리
        </h2>
      </div>

      {/* ═══ 기수 목록 ═══ */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            기수 목록
          </h3>
          <button
            onClick={() => {
              setShowBatchForm(true);
              setEditingBatchId(null);
              setBatchForm({ name: '', start_date: '', end_date: '', advanced_start: '', advanced_end: '', advanced_sheet_id: '', advanced_pass_score: 80 });
              setScheduleEdit({});
              setWizardStep(1);
            }}
            style={primaryBtnStyle}
          >
            + 기수 등록
          </button>
        </div>

        {/* 기수 등록/수정 — 단계별 마법사 */}
        {showBatchForm && (
          <div style={{ marginBottom: 20, padding: '20px 24px', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: 'var(--shadow-sm)' }}>

            {/* 스텝 인디케이터 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 4 }}>
              {[
                { step: 1, label: '기본 정보' },
                { step: 2, label: '교육 스케줄' },
                { step: 3, label: '심화교육' },
              ].map((s, i) => (
                <div key={s.step} style={{ display: 'flex', alignItems: 'center' }}>
                  <div
                    onClick={() => { if (s.step < wizardStep || (s.step === 2 && batchForm.start_date && batchForm.end_date) || s.step === 1) setWizardStep(s.step); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                      borderRadius: 'var(--radius-pill)', cursor: s.step <= wizardStep ? 'pointer' : 'default',
                      background: wizardStep === s.step ? 'var(--blue)' : wizardStep > s.step ? 'var(--green-dim)' : 'var(--bg-hover)',
                      color: wizardStep === s.step ? '#fff' : wizardStep > s.step ? 'var(--green)' : 'var(--text-muted)',
                      fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                    }}
                  >
                    {wizardStep > s.step && <span>{'✓'}</span>}
                    <span>{s.label}</span>
                  </div>
                  {i < 2 && <div style={{ width: 24, height: 2, background: wizardStep > s.step ? 'var(--green)' : 'var(--border)', margin: '0 4px' }} />}
                </div>
              ))}
            </div>

            {/* ── STEP 1: 기본 정보 ── */}
            {wizardStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>기수명 *</label>
                  <input type="text" placeholder="26년 3월" value={batchForm.name}
                    onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 12, fontWeight: 600 }}>입문</span>
                    입문교육 일정 *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
                    <input type="date" value={batchForm.start_date} onChange={(e) => setBatchForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
                    <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>~</span>
                    <input type="date" value={batchForm.end_date} onChange={(e) => setBatchForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowBatchForm(false); setEditingBatchId(null); setWizardStep(1); }} style={smallBtnStyle}>취소</button>
                  <button
                    onClick={() => {
                      if (!batchForm.name || !batchForm.start_date || !batchForm.end_date) return;
                      if (Object.keys(scheduleEdit).length === 0) generateDefaultSchedule(batchForm.start_date, batchForm.end_date);
                      setWizardStep(2);
                    }}
                    disabled={!batchForm.name || !batchForm.start_date || !batchForm.end_date}
                    style={{ ...smallBtnStyle, background: (batchForm.name && batchForm.start_date && batchForm.end_date) ? 'var(--blue)' : 'var(--bg-hover)', color: (batchForm.name && batchForm.start_date && batchForm.end_date) ? '#fff' : 'var(--text-muted)', border: 'none' }}
                  >
                    다음: 스케줄 설정 →
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: 교육 스케줄 ── */}
            {wizardStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* 요약 정보 */}
                <div style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-hover)', fontSize: 14, color: 'var(--text-second)' }}>
                  <strong>{batchForm.name}</strong> · 입문교육 {batchForm.start_date} ~ {batchForm.end_date}
                </div>

                {/* 페인트 모드 선택 */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    날짜 유형을 선택하고 달력을 드래그하세요
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    {([
                      { type: 'education' as DayType, label: '정규교육', bg: 'var(--blue)', bgDim: 'var(--blue-dim)', color: 'var(--blue)' },
                      { type: 'practice' as DayType, label: '매장실습', bg: 'var(--orange)', bgDim: 'var(--orange-dim)', color: 'var(--orange)' },
                      { type: 'off' as DayType, label: '🌙 휴무', bg: 'var(--text-muted)', bgDim: 'var(--bg-hover)', color: 'var(--text-muted)' },
                    ]).map(opt => (
                      <button key={opt.type} type="button" onClick={() => setPaintMode(opt.type)}
                        style={{
                          padding: '10px 20px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                          fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
                          border: paintMode === opt.type ? `2px solid ${opt.bg}` : '1px solid var(--border)',
                          background: paintMode === opt.type ? opt.bgDim : 'transparent',
                          color: paintMode === opt.type ? opt.color : 'var(--text-tertiary)',
                          boxShadow: paintMode === opt.type ? `0 0 0 1px ${opt.bg}` : 'none',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 달력 그리드 */}
                {(() => {
                  const allDays: { date: string; day: number; month: number; year: number; dayOfWeek: number }[] = [];
                  const start = new Date(batchForm.start_date + 'T12:00:00Z');
                  const end = new Date(batchForm.end_date + 'T12:00:00Z');
                  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
                    allDays.push({ date: d.toISOString().slice(0, 10), day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear(), dayOfWeek: d.getUTCDay() });
                  }
                  const months = new Map<string, typeof allDays>();
                  allDays.forEach(d => { const key = `${d.year}-${String(d.month).padStart(2, '0')}`; if (!months.has(key)) months.set(key, []); months.get(key)!.push(d); });

                  const bgMap: Record<string, string> = { education: 'var(--blue)', practice: 'var(--orange)', off: 'var(--bg-elevated)' };
                  const colorMap: Record<string, string> = { education: '#fff', practice: '#fff', off: 'var(--text-muted)' };
                  const dayHeaders = ['일', '월', '화', '수', '목', '금', '토'];
                  const handlePaint = (date: string) => setScheduleEdit(prev => ({ ...prev, [date]: paintMode }));

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, userSelect: 'none' }}
                      onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}>
                      {[...months.entries()].map(([monthKey, days]) => (
                        <div key={monthKey}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{days[0].year}년 {days[0].month}월</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
                            {dayHeaders.map(h => (
                              <div key={h} style={{ textAlign: 'center', fontSize: 12, color: h === '일' ? 'var(--red)' : h === '토' ? 'var(--blue-light)' : 'var(--text-muted)', fontWeight: 600, padding: '4px 0' }}>{h}</div>
                            ))}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                            {Array.from({ length: days[0].dayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
                            {days.map(d => {
                              const type = (scheduleEdit[d.date] as DayType) || 'off';
                              return (
                                <div key={d.date}
                                  onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); handlePaint(d.date); }}
                                  onMouseEnter={() => { if (isDragging) handlePaint(d.date); }}
                                  style={{
                                    height: 44, borderRadius: 'var(--radius-sm)',
                                    border: type === 'off' ? '1px solid var(--border)' : '1px solid transparent',
                                    background: bgMap[type], color: colorMap[type],
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', transition: 'background 0.1s',
                                    fontSize: 14, fontWeight: 600,
                                  }}
                                  title={`${d.date} — ${DAY_TYPE_CONFIG[type].label}`}
                                >
                                  {d.day}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* 합계 */}
                <div style={{ display: 'flex', gap: 16, fontSize: 14, color: 'var(--text-second)', padding: '10px 16px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-md)' }}>
                  {(() => {
                    const counts = { education: 0, practice: 0, off: 0 };
                    Object.values(scheduleEdit).forEach(t => counts[t as DayType]++);
                    return <>
                      <span style={{ fontWeight: 700 }}>정규 {counts.education}일</span>
                      <span style={{ fontWeight: 700 }}>실습 {counts.practice}일</span>
                      <span style={{ fontWeight: 700 }}>🌙 휴무 {counts.off}일</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>총 {counts.education + counts.practice + counts.off}일</span>
                    </>;
                  })()}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setWizardStep(1)} style={smallBtnStyle}>← 이전</button>
                  <button onClick={() => setWizardStep(3)}
                    style={{ ...smallBtnStyle, background: 'var(--blue)', color: '#fff', border: 'none' }}>
                    다음: 심화교육 →
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 3: 심화교육 ── */}
            {wizardStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* 요약 */}
                <div style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-hover)', fontSize: 14, color: 'var(--text-second)' }}>
                  <strong>{batchForm.name}</strong> · 입문 {batchForm.start_date} ~ {batchForm.end_date}
                  {(() => {
                    const counts = { education: 0, practice: 0, off: 0 };
                    Object.values(scheduleEdit).forEach(t => counts[t as DayType]++);
                    return <span style={{ marginLeft: 12, color: 'var(--text-muted)' }}>교육{counts.education} 실습{counts.practice} 휴무{counts.off}</span>;
                  })()}
                </div>

                <div>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--purple-dim)', color: 'var(--purple)', fontSize: 12, fontWeight: 600 }}>심화</span>
                    심화교육 일정 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(선택 — 나중에 설정해도 돼요)</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
                    <input type="date" value={batchForm.advanced_start} onChange={(e) => setBatchForm({ ...batchForm, advanced_start: e.target.value })} style={inputStyle} placeholder="시작일" />
                    <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>~</span>
                    <input type="date" value={batchForm.advanced_end} onChange={(e) => setBatchForm({ ...batchForm, advanced_end: e.target.value })} style={inputStyle} placeholder="종료일" />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>
                    심화교육 구글 시트 ID <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(재시험 점수 동기화용)</span>
                  </label>
                  <input
                    type="text"
                    value={batchForm.advanced_sheet_id}
                    onChange={(e) => setBatchForm({ ...batchForm, advanced_sheet_id: e.target.value })}
                    style={inputStyle}
                    placeholder="예: 1XsKAgClhL5AFvpigYArCJEjjmD9HCVtHKjftOVGdmCY"
                  />
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    시트 URL <code>docs.google.com/spreadsheets/d/<strong>[이 부분]</strong>/edit</code>에서 복사해서 붙여넣어요.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, alignItems: 'end' }}>
                  <div>
                    <label style={labelStyle}>통과 기준 점수</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={batchForm.advanced_pass_score}
                      onChange={(e) => setBatchForm({ ...batchForm, advanced_pass_score: Number(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </div>
                  {editingBatchId && batchForm.advanced_sheet_id && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/sync-advanced', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ batch_id: editingBatchId }),
                          });
                          const json = await res.json();
                          if (!res.ok) {
                            alert(`동기화 실패: ${json.message || '알 수 없는 오류'}`);
                            return;
                          }
                          const unmatched = (json.unmatched_names || []).length;
                          alert(
                            `심화교육 동기화 완료\n\n` +
                            `- 총 행: ${json.total_rows}\n` +
                            `- 점수 저장: ${json.synced}\n` +
                            (typeof json.synced_questions === 'number'
                              ? `- 문제은행 저장: ${json.synced_questions}\n`
                              : '') +
                            (json.questions_note ? `- ${json.questions_note}\n` : '') +
                            (unmatched > 0 ? `- 매칭 실패 이름: ${json.unmatched_names.join(', ')}\n` : '')
                          );
                        } catch (err) {
                          alert(`오류: ${err instanceof Error ? err.message : String(err)}`);
                        }
                      }}
                      style={{
                        padding: '10px 18px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--purple)',
                        background: 'var(--purple-dim)',
                        color: 'var(--purple)',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      심화교육 시험 동기화
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setWizardStep(2)} style={smallBtnStyle}>← 이전</button>
                  <button onClick={handleBatchSave} disabled={savingBatch}
                    style={{ ...smallBtnStyle, background: 'var(--green)', color: '#fff', border: 'none', padding: '8px 24px', fontSize: 14 }}>
                    {savingBatch ? '저장 중...' : editingBatchId ? '수정 완료' : '등록 완료'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 기수 목록 */}
        {batches.length === 0 ? (
          <p style={{ fontSize: 15, color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
            등록된 기수가 없어요. 위의 버튼으로 기수를 등록해주세요.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {batches.map((batch) => (
              <div
                key={batch.id}
                onClick={() => setSelectedBatchId(selectedBatchId === batch.id ? null : batch.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 18px', borderRadius: 'var(--radius-md)',
                  background: selectedBatchId === batch.id ? 'var(--blue-dim)' : 'var(--bg-hover)',
                  border: selectedBatchId === batch.id ? '1px solid var(--blue)' : '1px solid transparent',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      {batch.name}
                    </p>
                    {(() => {
                      if (batch.is_archived) return <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>보관됨</span>;
                      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
                      if (today >= batch.start_date && today <= batch.end_date) return <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--green-dim)', color: 'var(--green)' }}>입문교육 진행중</span>;
                      if (batch.advanced_start && batch.advanced_end && today >= batch.advanced_start && today <= batch.advanced_end) return <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--purple-dim)', color: 'var(--purple)' }}>심화교육 진행중</span>;
                      if (batch.advanced_end && today > batch.advanced_end) return <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>완료</span>;
                      if (today > batch.end_date && (!batch.advanced_start || today < batch.advanced_start)) return <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--orange-dim)', color: 'var(--orange)' }}>매장 배치 대기</span>;
                      if (today < batch.start_date) return <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--blue-dim)', color: 'var(--blue-light)' }}>예정</span>;
                      return null;
                    })()}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                    입문 {batch.start_date} ~ {batch.end_date}
                    {batch.advanced_start && ` · 심화 ${batch.advanced_start} ~ ${batch.advanced_end}`}
                    {batch.schedule && Object.keys(batch.schedule).length > 0 && (() => {
                      const counts = { education: 0, practice: 0, off: 0 };
                      Object.values(batch.schedule).forEach(t => counts[t as DayType]++);
                      return <span style={{ marginLeft: 8 }}>교육{counts.education} 실습{counts.practice} 휴무{counts.off}</span>;
                    })()}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {batch.is_archived ? (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await fetch('/api/batches', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: batch.id, is_archived: false }),
                        });
                        fetchBatches();
                      }}
                      style={{ ...tinyBtnStyle, color: 'var(--blue-light)' }}
                    >
                      복구
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingBatchId(batch.id);
                          setBatchForm({
                            name: batch.name,
                            start_date: batch.start_date,
                            end_date: batch.end_date,
                            advanced_start: batch.advanced_start || '',
                            advanced_end: batch.advanced_end || '',
                            advanced_sheet_id: batch.advanced_sheet_id || '',
                            advanced_pass_score: batch.advanced_pass_score ?? 80,
                          });
                          setScheduleEdit(batch.schedule || {});
                          setWizardStep(1);
                          setShowBatchForm(true);
                        }}
                        style={tinyBtnStyle}
                      >
                        수정
                      </button>
                      {(() => {
                        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
                        const isCompleted = (batch.advanced_end && today > batch.advanced_end) ||
                          (!batch.advanced_end && today > batch.end_date);
                        if (!isCompleted) return null;
                        return (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`"${batch.name}" 기수를 보관 처리하시겠어요?\n학생은 읽기 전용으로 전환됩니다.`)) return;
                              await fetch('/api/batches', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: batch.id, is_archived: true }),
                              });
                              fetchBatches();
                            }}
                            style={{ ...tinyBtnStyle, color: 'var(--text-muted)' }}
                          >
                            보관
                          </button>
                        );
                      })()}
                    </>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBatchDelete(batch.id); }}
                    style={{ ...tinyBtnStyle, color: 'var(--red)' }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ 교육생 관리 ═══ */}
      {selectedBatchId && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {selectedBatch?.name} 교육생
              </h3>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 2 }}>
                {students.length}명 등록됨
              </p>
            </div>
            <button
              onClick={() => {
                setShowStudentForm(true);
                setEditingStudentId(null);
                setStudentForm(emptyStudentForm);
              }}
              style={primaryBtnStyle}
            >
              + 교육생 등록
            </button>
          </div>

          {/* 교육생 등록/수정 폼 */}
          {showStudentForm && (
            <div style={{ marginBottom: 20, padding: 20, borderRadius: 'var(--radius-md)', background: 'var(--bg-hover)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="student-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>이름 *</label>
                  <input type="text" placeholder="홍길동" value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>회사 이메일</label>
                  <input type="email" placeholder="name@iloomstore.co.kr" value={studentForm.company_email} onChange={(e) => setStudentForm({ ...studentForm, company_email: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>개인 이메일</label>
                  <input type="email" placeholder="name@naver.com" value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>전화번호</label>
                  <input type="tel" placeholder="010-1234-5678" value={studentForm.phone} onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>배치 매장</label>
                  <input type="text" placeholder="노원점, 논현점..." value={studentForm.store_location} onChange={(e) => setStudentForm({ ...studentForm, store_location: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>비밀번호 (숫자 4자리)</label>
                  <input type="text" placeholder="0000" maxLength={4} value={studentForm.password} onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowStudentForm(false); setEditingStudentId(null); }} style={smallBtnStyle}>취소</button>
                <button onClick={handleStudentSave} disabled={savingStudent} style={{ ...smallBtnStyle, background: 'var(--blue)', color: '#fff', border: 'none' }}>
                  {savingStudent ? '...' : editingStudentId ? '수정 저장' : '등록하기'}
                </button>
              </div>
            </div>
          )}

          {/* 교육생 테이블 */}
          {loadingStudents ? (
            <p style={{ fontSize: 15, color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>불러오는 중...</p>
          ) : students.length === 0 ? (
            <p style={{ fontSize: 15, color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
              등록된 교육생이 없어요
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {['이름', '비밀번호', '회사 이메일', '개인 이메일', '전화번호', '배치 매장', '관리'].map((h) => (
                      <th key={h} style={{ textAlign: h === '관리' ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: '1px solid var(--border)', transition: 'background 0.15s ease',
                        opacity: s.is_dropped ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="hide-mobile" style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: s.is_dropped ? 'var(--bg-hover)' : 'var(--blue-dim)',
                            color: s.is_dropped ? 'var(--text-muted)' : 'var(--blue-light)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 700, flexShrink: 0,
                          }}>
                            {s.name[0]}
                          </div>
                          <span style={{ textDecoration: s.is_dropped ? 'line-through' : 'none' }}>{s.name}</span>
                          {s.is_dropped && (
                            <span style={{
                              padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
                              background: 'var(--red-dim)', color: 'var(--red)',
                            }}>퇴사{s.dropped_at ? ` ${s.dropped_at.slice(5)}` : ''}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', letterSpacing: 2 }}>{s.password || '0000'}</td>
                      <td style={{ ...tdStyle, fontSize: 13 }}>{s.company_email || '-'}</td>
                      <td style={{ ...tdStyle, fontSize: 13 }}>{s.email || '-'}</td>
                      <td style={tdStyle}>{s.phone || '-'}</td>
                      <td style={tdStyle}>{s.store_location || '-'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleResetPassword(s)}
                            title="비밀번호 초기화"
                            style={{ ...tinyBtnStyle, opacity: 0.5, fontSize: 13, padding: '4px 8px' }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
                          >
                            비번 초기화
                          </button>
                          <button
                            onClick={() => handleDrop(s)}
                            style={{
                              ...tinyBtnStyle,
                              border: 'none',
                              background: s.is_dropped ? 'var(--green-dim)' : 'var(--red-dim)',
                              color: s.is_dropped ? 'var(--green)' : 'var(--red)',
                              fontWeight: 600,
                            }}
                          >
                            {s.is_dropped ? '복구' : '퇴사'}
                          </button>
                          <button
                            onClick={() => {
                              setEditingStudentId(s.id);
                              setStudentForm({
                                name: s.name,
                                department: s.department || '',
                                company_email: s.company_email || '',
                                email: s.email || '',
                                phone: s.phone || '',
                                store_location: s.store_location || '',
                                password: s.password || '0000',
                              });
                              setShowStudentForm(true);
                            }}
                            style={{ ...tinyBtnStyle, opacity: 0.5 }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleStudentDelete(s.id)}
                            style={{ ...tinyBtnStyle, color: 'var(--red)', opacity: 0.5 }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 퇴사 처리 모달 */}
      {dropModal?.show && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'var(--overlay)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setDropModal(null)}
        >
          <div
            style={{
              background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
              padding: 28, width: 420, maxWidth: '90vw',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              퇴사 처리
            </h3>
            <p style={{ fontSize: 15, color: 'var(--text-second)', margin: '0 0 24px' }}>
              <span style={{ fontWeight: 700, color: 'var(--red)' }}>{dropModal.student.name}</span>님을 퇴사 처리할까요?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ ...labelStyle }}>퇴사일</label>
                <input
                  type="date"
                  value={dropDate}
                  onChange={e => setDropDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ ...labelStyle }}>사유 (선택)</label>
                <input
                  type="text"
                  placeholder="예: 개인사유, 적응 어려움 등"
                  value={dropReason}
                  onChange={e => setDropReason(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 28 }}>
              <button onClick={() => setDropModal(null)} style={smallBtnStyle}>취소</button>
              <button
                onClick={confirmDrop}
                style={{ ...smallBtnStyle, background: 'var(--red)', color: '#fff', border: 'none' }}
              >
                퇴사 처리
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 반응형 + 날짜 입력 크기 */}
      <style>{`
        @media (max-width: 768px) {
          .student-form-grid { grid-template-columns: 1fr !important; }
          .batch-form-grid { grid-template-columns: 1fr !important; }
        }
        input[type="date"] {
          font-size: 16px !important;
          min-height: 44px;
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          width: 24px;
          height: 24px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

// ── 스타일 ──
const card: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px 24px',
  boxShadow: 'var(--shadow-sm)',
};

const tdStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--blue)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const tinyBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};
