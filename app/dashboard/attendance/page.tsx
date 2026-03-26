'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';

interface AttendanceRow {
  date: string;
  name: string;
  department: string;
  checkIn: string;
  checkOut: string;
  status: 'present' | 'late' | 'early_leave' | 'absent';
  statusLabel: string;
  note: string;
}

interface SavedAttendance {
  id: string;
  student_id: string;
  date: string;
  status: string;
  note: string;
  students: { name: string; department: string } | null;
}

type StatusType = 'present' | 'late' | 'early_leave' | 'absent';

const statusOptions: { value: StatusType; label: string }[] = [
  { value: 'present', label: '출근' },
  { value: 'late', label: '지각' },
  { value: 'early_leave', label: '조퇴' },
  { value: 'absent', label: '미출근' },
];

function parseStatus(checkIn: string, raw?: string): { status: AttendanceRow['status']; label: string } {
  if (raw === '미출근' || raw === '-' || !raw) {
    if (!checkIn || checkIn === '-') return { status: 'absent', label: '미출근' };
  }
  if (raw?.includes('지각')) return { status: 'late', label: '지각' };
  if (raw?.includes('조퇴')) return { status: 'early_leave', label: '조퇴' };
  return { status: 'present', label: '출근' };
}

function excelSerialToDate(serial: number): string {
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function excelSerialToTime(serial: number | string | undefined): string {
  if (!serial || serial === '-' || serial === '미출근' || serial === '') return '-';
  const num = Number(serial);
  if (isNaN(num)) return String(serial);
  const fraction = num - Math.floor(num);
  const totalMinutes = Math.round(fraction * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = { present: '출근', late: '지각', early_leave: '조퇴', absent: '미출근' };
  return map[status] || status;
}

function parseNoteToTimes(note: string | null): { checkIn: string; checkOut: string } {
  if (!note) return { checkIn: '-', checkOut: '-' };
  // "출근 08:04 / 퇴근 17:30" 형식 파싱
  const checkInMatch = note.match(/출근\s*([\d:]+)/);
  const checkOutMatch = note.match(/퇴근\s*([\d:]+)/);
  return {
    checkIn: checkInMatch?.[1] || '-',
    checkOut: checkOutMatch?.[1] || '-',
  };
}

export default function AttendancePage() {
  // ── DB 데이터 ──
  const [savedData, setSavedData] = useState<SavedAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<StatusType>('present');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // ── Excel 업로드 ──
  const [showUpload, setShowUpload] = useState(false);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
  const [fileName, setFileName] = useState('');
  const [editMode, setEditMode] = useState(false);

  // DB 데이터 불러오기
  const fetchAttendance = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance');
      const data = await res.json();
      if (Array.isArray(data)) {
        setSavedData(data);
        // 첫 로드 시 가장 최근 날짜 선택
        if (data.length > 0 && !selectedDate) {
          const dates = [...new Set(data.map((d: SavedAttendance) => d.date))].sort().reverse();
          setSelectedDate(dates[0] as string);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  // 날짜 목록
  const availableDates = useMemo(() => {
    return [...new Set(savedData.map((d) => d.date))].sort().reverse();
  }, [savedData]);

  // 선택된 날짜 데이터
  const filteredData = useMemo(() => {
    return savedData.filter((d) => d.date === selectedDate);
  }, [savedData, selectedDate]);

  // 요약
  const summary = useMemo(() => ({
    total: filteredData.length,
    present: filteredData.filter((d) => d.status === 'present').length,
    late: filteredData.filter((d) => d.status === 'late').length,
    earlyLeave: filteredData.filter((d) => d.status === 'early_leave').length,
    absent: filteredData.filter((d) => d.status === 'absent').length,
  }), [filteredData]);

  // 문제 있는 교육생
  const issues = useMemo(() => {
    return filteredData.filter((d) => d.status !== 'present');
  }, [filteredData]);

  // DB 레코드 수정 저장
  const handleEditSave = async (record: SavedAttendance) => {
    setSavingEdit(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, status: editStatus, note: editNote }),
      });
      if (res.ok) {
        setSavedData((prev) =>
          prev.map((d) => d.id === record.id ? { ...d, status: editStatus, note: editNote } : d)
        );
        setEditingId(null);
      }
    } catch {
      // silent
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Excel 처리 ──
  const processExcel = useCallback((file: File) => {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });

      const parsed: AttendanceRow[] = json
        .filter((r) => r['이름'] && r['날짜'])
        .map((r) => {
          const dateRaw = r['날짜'];
          const date = typeof dateRaw === 'number'
            ? excelSerialToDate(dateRaw)
            : String(dateRaw).match(/(\d{4}-\d{2}-\d{2})/)?.[1] || String(dateRaw);
          const checkIn = excelSerialToTime(r['출퇴근시간']);
          const checkOut = excelSerialToTime(r['출퇴근시간_1']);
          const statusRaw = String(r['출근'] || '');
          const { status, label } = parseStatus(checkIn, statusRaw);
          return { date, name: String(r['이름'] || ''), department: String(r['기본 부서'] || r['부서'] || ''), checkIn, checkOut, status, statusLabel: label, note: '' };
        });
      setRows(parsed);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) processExcel(file);
  }, [processExcel]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processExcel(file);
  }, [processExcel]);

  const handleUploadStatusChange = (index: number, newStatus: StatusType) => {
    setRows((prev) => prev.map((r, i) =>
      i === index ? { ...r, status: newStatus, statusLabel: getStatusLabel(newStatus) } : r
    ));
  };

  const handleSave = async () => {
    if (rows.length === 0) return;
    setUploading(true);
    setResult(null);
    try {
      const records = rows.map((r) => ({
        name: r.name, date: r.date, status: r.status,
        note: r.note || `출근 ${r.checkIn} / 퇴근 ${r.checkOut}`,
      }));
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });
      const data = await res.json();
      setResult(data);
      fetchAttendance();
    } catch {
      setResult({ inserted: 0, skipped: 0, errors: ['저장 중 오류 발생'] });
    } finally {
      setUploading(false);
    }
  };

  const uploadSummary = {
    total: rows.length,
    present: rows.filter((r) => r.status === 'present').length,
    late: rows.filter((r) => r.status === 'late').length,
    absent: rows.filter((r) => r.status === 'absent').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            📋 출결 관리
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-tertiary)', marginTop: 4 }}>
            출결 현황을 확인하고 수정할 수 있어요
          </p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--radius-md)',
            border: showUpload ? 'none' : '1px solid var(--border)',
            background: showUpload ? 'var(--blue)' : 'transparent',
            color: showUpload ? '#fff' : 'var(--text-tertiary)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          📎 Excel 업로드
        </button>
      </div>

      {/* ═══ Excel 업로드 (접이식) ═══ */}
      {showUpload && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              타임인아웃 Excel 업로드
            </h3>
            <button
              onClick={() => { setShowUpload(false); setRows([]); setFileName(''); setResult(null); setEditMode(false); }}
              style={{ ...smallBtnStyle, fontSize: 14 }}
            >
              닫기
            </button>
          </div>

          {/* 드래그앤드롭 */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '32px 24px',
              textAlign: 'center',
              background: dragOver ? 'var(--blue-dim)' : 'var(--bg-hover)',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
            }}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input id="file-input" type="file" accept=".xlsx,.xls" onChange={handleFileSelect} style={{ display: 'none' }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Excel 파일을 드래그하거나 클릭해서 선택
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>.xlsx, .xls 파일 지원</p>
            {fileName && (
              <p style={{ fontSize: 14, color: 'var(--blue-light)', marginTop: 8, margin: '8px 0 0' }}>📄 {fileName}</p>
            )}
          </div>

          {/* 업로드 미리보기 */}
          {rows.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <MiniPill label="전체" value={uploadSummary.total} />
                  <MiniPill label="출근" value={uploadSummary.present} color="var(--green)" />
                  <MiniPill label="지각" value={uploadSummary.late} color="var(--orange)" />
                  <MiniPill label="미출근" value={uploadSummary.absent} color="var(--red)" />
                </div>
                <button
                  onClick={() => setEditMode(!editMode)}
                  style={{
                    ...smallBtnStyle,
                    background: editMode ? 'var(--orange)' : 'transparent',
                    color: editMode ? '#fff' : 'var(--text-tertiary)',
                    border: editMode ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {editMode ? '수정 완료' : '✏️ 수정'}
                </button>
              </div>

              <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['날짜', '이름', '부서', '출근', '퇴근', '상태'].map((h) => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={tdCompact}>{r.date}</td>
                        <td style={{ ...tdCompact, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</td>
                        <td style={tdCompact}>{r.department}</td>
                        <td style={tdCompact}>{r.checkIn}</td>
                        <td style={tdCompact}>{r.checkOut}</td>
                        <td style={tdCompact}>
                          {editMode ? (
                            <select
                              value={r.status}
                              onChange={(e) => handleUploadStatusChange(i, e.target.value as StatusType)}
                              style={selectStyle}
                            >
                              {statusOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          ) : (
                            <StatusBadge status={r.status} label={r.statusLabel} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => { setRows([]); setFileName(''); setResult(null); setEditMode(false); }} style={smallBtnStyle}>
                  초기화
                </button>
                <button
                  onClick={handleSave}
                  disabled={uploading}
                  style={{
                    ...smallBtnStyle,
                    background: uploading ? 'var(--border)' : 'var(--blue)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    padding: '8px 20px',
                  }}
                >
                  {uploading ? '저장 중...' : `${rows.length}건 저장하기`}
                </button>
              </div>

              {result && (
                <div style={{
                  padding: 16,
                  borderRadius: 'var(--radius-md)',
                  background: result.errors.length > 0 ? 'var(--orange-dim)' : 'var(--green-dim)',
                  border: `1px solid ${result.errors.length > 0 ? 'var(--orange)' : 'var(--green)'}`,
                }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    ✅ {result.inserted}건 저장 완료 {result.skipped > 0 && `/ ${result.skipped}건 스킵`}
                  </p>
                  {result.errors.length > 0 && (
                    <div style={{ fontSize: 13, color: 'var(--text-second)', marginTop: 8 }}>
                      {result.errors.map((e, i) => (
                        <p key={i} style={{ margin: '2px 0' }}>⚠️ {e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ 출결 현황 (메인) ═══ */}
      {loading ? (
        <p style={{ fontSize: 16, color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}>불러오는 중...</p>
      ) : savedData.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 64 }}>
          <p style={{ fontSize: 48, margin: '0 0 16px' }}>📭</p>
          <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            아직 출결 데이터가 없어요
          </p>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: '0 0 20px' }}>
            위의 Excel 업로드 버튼으로 타임인아웃 파일을 올려주세요
          </p>
          <button
            onClick={() => setShowUpload(true)}
            style={{
              padding: '12px 28px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--blue)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📎 Excel 업로드하기
          </button>
        </div>
      ) : (
        <>
          {/* 날짜 선택 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>날짜</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {availableDates.slice(0, 14).map((date) => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: selectedDate === date ? 'none' : '1px solid var(--border)',
                    background: selectedDate === date ? 'var(--blue)' : 'transparent',
                    color: selectedDate === date ? '#fff' : 'var(--text-tertiary)',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {date.slice(5)}
                </button>
              ))}
            </div>
          </div>

          {/* 요약 카드 */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <SummaryPill icon="👥" label="전체" value={summary.total} />
            <SummaryPill icon="✅" label="출근" value={summary.present} color="var(--green)" />
            <SummaryPill icon="⏰" label="지각" value={summary.late} color="var(--orange)" />
            <SummaryPill icon="❌" label="미출근" value={summary.absent} color="var(--red)" />
            {summary.earlyLeave > 0 && (
              <SummaryPill icon="🚪" label="조퇴" value={summary.earlyLeave} color="var(--orange)" />
            )}
          </div>

          {/* 알림: 지각/결석자 */}
          {issues.length > 0 && (
            <div style={card}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
                ⚠️ 확인이 필요한 교육생
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {issues.map((d) => (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-hover)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: 'var(--blue-dim)', color: 'var(--blue-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700,
                      }}>
                        {d.students?.name?.[0] || '?'}
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {d.students?.name || '알 수 없음'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {d.note && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{d.note}</span>}
                      <StatusBadge status={d.status} label={getStatusLabel(d.status)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 출결 테이블 */}
          {filteredData.length > 0 && (
            <div style={card}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
                📊 {selectedDate} 출결 내역
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['이름', '부서', '출근', '퇴근', '상태', ''].map((h) => (
                        <th key={h} style={{
                          padding: '12px 16px',
                          textAlign: h === '' ? 'right' : 'left',
                          fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((d) => {
                      const isEditing = editingId === d.id;
                      const times = parseNoteToTimes(d.note);
                      return (
                        <tr
                          key={d.id}
                          style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s ease' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {d.students?.name || '알 수 없음'}
                          </td>
                          <td style={tdStyle}>
                            {d.students?.department || '-'}
                          </td>
                          <td style={tdStyle}>{times.checkIn}</td>
                          <td style={tdStyle}>{times.checkOut}</td>
                          <td style={tdStyle}>
                            {isEditing ? (
                              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as StatusType)} style={selectStyle}>
                                {statusOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            ) : (
                              <StatusBadge status={d.status} label={getStatusLabel(d.status)} />
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button onClick={() => setEditingId(null)} style={smallBtnStyle}>취소</button>
                                <button
                                  onClick={() => handleEditSave(d)}
                                  disabled={savingEdit}
                                  style={{ ...smallBtnStyle, background: 'var(--blue)', color: '#fff', border: 'none' }}
                                >
                                  {savingEdit ? '...' : '저장'}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingId(d.id); setEditStatus(d.status as StatusType); setEditNote(d.note || `출근 ${times.checkIn} / 퇴근 ${times.checkOut}`); }}
                                style={{ ...smallBtnStyle, opacity: 0.5 }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
                              >
                                수정
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
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
  padding: '14px 16px',
  color: 'var(--text-second)',
  whiteSpace: 'nowrap',
};

const tdCompact: React.CSSProperties = {
  padding: '10px 14px',
  color: 'var(--text-second)',
  whiteSpace: 'nowrap',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const selectStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: 14,
  cursor: 'pointer',
};

// ── 컴포넌트 ──
function SummaryPill({ icon, label, value, color }: { icon: string; label: string; value: number; color?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 20px', borderRadius: 'var(--radius-pill)',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
    }}>
      <span>{icon}</span>
      <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function MiniPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
      {label} <span style={{ fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</span>
    </span>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    present: { bg: 'var(--green-dim)', color: 'var(--green)' },
    late: { bg: 'var(--orange-dim)', color: 'var(--orange)' },
    early_leave: { bg: 'var(--orange-dim)', color: 'var(--orange)' },
    absent: { bg: 'var(--red-dim)', color: 'var(--red)' },
  };
  const c = colors[status] || colors.present;
  return (
    <span style={{
      display: 'inline-flex', padding: '4px 12px',
      borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 600,
      background: c.bg, color: c.color,
    }}>
      {label}
    </span>
  );
}
