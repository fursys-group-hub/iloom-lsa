'use client';

import { useState, useEffect, useCallback } from 'react';

interface Batch {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  advanced_start: string | null;
  advanced_end: string | null;
  sheet_id: string | null;
  is_archived: boolean;
  archived_at: string | null;
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
  const [batchForm, setBatchForm] = useState({ name: '', start_date: '', end_date: '', advanced_start: '', advanced_end: '' });
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [savingBatch, setSavingBatch] = useState(false);

  // ── 교육생 ──
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);
  const [dropModal, setDropModal] = useState<{ student: StudentRow; show: boolean } | null>(null);
  const [dropDate, setDropDate] = useState(new Date().toISOString().slice(0, 10));
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
        }),
      });
      if (res.ok) {
        await fetchBatches();
        setShowBatchForm(false);
        setEditingBatchId(null);
        setBatchForm({ name: '', start_date: '', end_date: '', advanced_start: '', advanced_end: '' });
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
      setDropDate(new Date().toISOString().slice(0, 10));
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
          📚 기수 관리
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-tertiary)', marginTop: 4 }}>
          기수와 교육생을 등록하고 관리해요
        </p>
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
              setBatchForm({ name: '', start_date: '', end_date: '', advanced_start: '', advanced_end: '' });
            }}
            style={primaryBtnStyle}
          >
            + 기수 등록
          </button>
        </div>

        {/* 기수 등록/수정 폼 */}
        {showBatchForm && (
          <div style={{ marginBottom: 20, padding: 20, borderRadius: 'var(--radius-md)', background: 'var(--bg-hover)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 기수명 */}
            <div>
              <label style={labelStyle}>기수명 *</label>
              <input
                type="text"
                placeholder="26년 3월"
                value={batchForm.name}
                onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
                style={inputStyle}
              />
            </div>
            {/* 입문교육 일정 */}
            <div>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ padding: '1px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--blue-dim)', color: 'var(--blue-light)', fontSize: 11, fontWeight: 700 }}>입문</span>
                입문교육 일정 *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input type="date" value={batchForm.start_date} onChange={(e) => setBatchForm({ ...batchForm, start_date: e.target.value })} style={inputStyle} />
                <input type="date" value={batchForm.end_date} onChange={(e) => setBatchForm({ ...batchForm, end_date: e.target.value })} style={inputStyle} />
              </div>
            </div>
            {/* 심화교육 일정 */}
            <div>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ padding: '1px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--purple-dim)', color: 'var(--purple)', fontSize: 11, fontWeight: 700 }}>심화</span>
                심화교육 일정 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(선택)</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input type="date" value={batchForm.advanced_start} onChange={(e) => setBatchForm({ ...batchForm, advanced_start: e.target.value })} style={inputStyle} placeholder="매장 배치 시작일" />
                <input type="date" value={batchForm.advanced_end} onChange={(e) => setBatchForm({ ...batchForm, advanced_end: e.target.value })} style={inputStyle} placeholder="심화교육 종료일" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowBatchForm(false); setEditingBatchId(null); }} style={smallBtnStyle}>취소</button>
              <button onClick={handleBatchSave} disabled={savingBatch} style={{ ...smallBtnStyle, background: 'var(--blue)', color: '#fff', border: 'none' }}>
                {savingBatch ? '...' : editingBatchId ? '수정 저장' : '등록하기'}
              </button>
            </div>
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
                      if (batch.is_archived) return <span style={{ padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>📦 보관됨</span>;
                      const today = new Date().toISOString().slice(0, 10);
                      if (today >= batch.start_date && today <= batch.end_date) return <span style={{ padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, background: 'var(--green-dim)', color: 'var(--green)' }}>입문교육 진행중</span>;
                      if (batch.advanced_start && batch.advanced_end && today >= batch.advanced_start && today <= batch.advanced_end) return <span style={{ padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, background: 'var(--purple-dim)', color: 'var(--purple)' }}>심화교육 진행중</span>;
                      if (batch.advanced_end && today > batch.advanced_end) return <span style={{ padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>완료</span>;
                      if (today > batch.end_date && (!batch.advanced_start || today < batch.advanced_start)) return <span style={{ padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, background: 'var(--orange-dim)', color: 'var(--orange)' }}>매장 배치 대기</span>;
                      if (today < batch.start_date) return <span style={{ padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, background: 'var(--blue-dim)', color: 'var(--blue-light)' }}>예정</span>;
                      return null;
                    })()}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                    입문 {batch.start_date} ~ {batch.end_date}
                    {batch.advanced_start && ` · 심화 ${batch.advanced_start} ~ ${batch.advanced_end}`}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
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
                          });
                          setShowBatchForm(true);
                        }}
                        style={tinyBtnStyle}
                      >
                        수정
                      </button>
                      {(() => {
                        const today = new Date().toISOString().slice(0, 10);
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
                            📦 보관
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
                👥 {selectedBatch?.name} 교육생
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['이름', '비밀번호', '회사 이메일', '개인 이메일', '전화번호', '배치 매장', '관리'].map((h) => (
                      <th key={h} style={{
                        padding: '12px 14px', textAlign: h === '관리' ? 'right' : 'left',
                        fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap',
                      }}>
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
                          <div style={{
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
                              padding: '1px 7px', borderRadius: 'var(--radius-pill)', fontSize: 10, fontWeight: 700,
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
                            🔑
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
              padding: 32, width: 420, maxWidth: '90vw',
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
  padding: 24,
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  color: 'var(--text-second)',
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
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};
