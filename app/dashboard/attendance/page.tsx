'use client';

import { useState, useCallback } from 'react';
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

function parseStatus(checkIn: string, raw?: string): { status: AttendanceRow['status']; label: string } {
  if (raw === '미출근' || raw === '-' || !raw) {
    if (!checkIn || checkIn === '-') return { status: 'absent', label: '미출근' };
  }
  if (raw?.includes('지각')) return { status: 'late', label: '지각' };
  if (raw?.includes('조퇴')) return { status: 'early_leave', label: '조퇴' };
  return { status: 'present', label: '출근' };
}

// Excel 시리얼 넘버 → 날짜 문자열
function excelSerialToDate(serial: number): string {
  // Excel epoch: 1899-12-30
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Excel 시리얼 넘버 → 시간 문자열 (HH:MM)
function excelSerialToTime(serial: number | string | undefined): string {
  if (!serial || serial === '-' || serial === '미출근' || serial === '') return '-';
  const num = Number(serial);
  if (isNaN(num)) return String(serial);
  // 소수 부분이 시간 (0.5 = 12:00)
  const fraction = num - Math.floor(num);
  const totalMinutes = Math.round(fraction * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export default function AttendancePage() {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
  const [fileName, setFileName] = useState('');

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
          // 날짜: Excel 시리얼 넘버 또는 문자열
          const dateRaw = r['날짜'];
          const date = typeof dateRaw === 'number'
            ? excelSerialToDate(dateRaw)
            : String(dateRaw).match(/(\d{4}-\d{2}-\d{2})/)?.[1] || String(dateRaw);

          // 출퇴근시간: 시리얼 넘버 (출퇴근시간 = 출근, 출퇴근시간_1 = 퇴근)
          const checkIn = excelSerialToTime(r['출퇴근시간']);
          const checkOut = excelSerialToTime(r['출퇴근시간_1']);

          // 상태: '출근' 컬럼 값 (출근/미출근)
          const statusRaw = String(r['출근'] || '');
          const { status, label } = parseStatus(checkIn, statusRaw);

          return {
            date,
            name: String(r['이름'] || ''),
            department: String(r['기본 부서'] || r['부서'] || ''),
            checkIn,
            checkOut,
            status,
            statusLabel: label,
            note: '',
          };
        });

      setRows(parsed);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      processExcel(file);
    }
  }, [processExcel]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processExcel(file);
  }, [processExcel]);

  const handleSave = async () => {
    if (rows.length === 0) return;
    setUploading(true);
    setResult(null);
    try {
      const records = rows.map((r) => ({
        name: r.name,
        date: r.date,
        status: r.status,
        note: r.note || `출근 ${r.checkIn} / 퇴근 ${r.checkOut}`,
      }));
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ inserted: 0, skipped: 0, errors: ['저장 중 오류 발생'] });
    } finally {
      setUploading(false);
    }
  };

  const summary = {
    total: rows.length,
    present: rows.filter((r) => r.status === 'present').length,
    late: rows.filter((r) => r.status === 'late').length,
    absent: rows.filter((r) => r.status === 'absent').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          📋 출결 관리
        </h2>
        <p style={{ fontSize: 17, color: 'var(--text-tertiary)', marginTop: 4 }}>
          타임인아웃 Excel을 업로드하면 자동으로 출결이 반영돼요
        </p>
      </div>

      {/* 드래그앤드롭 업로드 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '48px 24px',
          textAlign: 'center',
          background: dragOver ? 'var(--blue-dim)' : 'var(--bg-surface)',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
        }}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <p style={{ fontSize: 32, margin: '0 0 12px' }}>📎</p>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
          타임인아웃 Excel 파일을 드래그하거나 클릭해서 선택해요
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          .xlsx, .xls 파일 지원
        </p>
        {fileName && (
          <p style={{ fontSize: 14, color: 'var(--blue-light)', marginTop: 12 }}>
            📄 {fileName}
          </p>
        )}
      </div>

      {/* 파싱 결과 */}
      {rows.length > 0 && (
        <>
          {/* 요약 */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <SummaryPill icon="👥" label="전체" value={summary.total} />
            <SummaryPill icon="✅" label="출근" value={summary.present} color="var(--green)" />
            <SummaryPill icon="⏰" label="지각" value={summary.late} color="var(--orange)" />
            <SummaryPill icon="❌" label="미출근" value={summary.absent} color="var(--red)" />
          </div>

          {/* 테이블 */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['날짜', '이름', '부서', '출근', '퇴근', '상태'].map((h) => (
                      <th key={h} style={{
                        padding: '14px 16px',
                        textAlign: 'left',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s ease' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={tdStyle}>{r.date}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</td>
                      <td style={tdStyle}>{r.department}</td>
                      <td style={tdStyle}>{r.checkIn}</td>
                      <td style={tdStyle}>{r.checkOut}</td>
                      <td style={tdStyle}>
                        <StatusBadge status={r.status} label={r.statusLabel} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 저장 버튼 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button
              onClick={() => { setRows([]); setFileName(''); setResult(null); }}
              style={{
                padding: '12px 24px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              초기화
            </button>
            <button
              onClick={handleSave}
              disabled={uploading}
              style={{
                padding: '12px 28px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: uploading ? 'var(--border)' : 'var(--blue)',
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: uploading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {uploading ? '저장 중...' : `${rows.length}건 저장하기`}
            </button>
          </div>

          {/* 저장 결과 */}
          {result && (
            <div style={{
              padding: 20,
              borderRadius: 'var(--radius-md)',
              background: result.errors.length > 0 ? 'var(--orange-dim)' : 'var(--green-dim)',
              border: `1px solid ${result.errors.length > 0 ? 'var(--orange)' : 'var(--green)'}`,
            }}>
              <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                ✅ {result.inserted}건 저장 완료 {result.skipped > 0 && `/ ${result.skipped}건 스킵`}
              </p>
              {result.errors.length > 0 && (
                <div style={{ fontSize: 14, color: 'var(--text-second)', marginTop: 8 }}>
                  {result.errors.map((e, i) => (
                    <p key={i} style={{ margin: '4px 0' }}>⚠️ {e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  color: 'var(--text-second)',
  whiteSpace: 'nowrap',
};

function SummaryPill({ icon, label, value, color }: {
  icon: string; label: string; value: number; color?: string;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 20px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
    }}>
      <span>{icon}</span>
      <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
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
      display: 'inline-flex',
      padding: '4px 12px',
      borderRadius: 'var(--radius-pill)',
      fontSize: 13,
      fontWeight: 600,
      background: c.bg,
      color: c.color,
    }}>
      {label}
    </span>
  );
}
