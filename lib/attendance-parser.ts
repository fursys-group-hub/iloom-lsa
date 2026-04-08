// 출결 Excel 파싱 유틸리티
// 타임인아웃(timeinout.kr) Excel 포맷 → 출결 레코드 변환

export type StatusType = 'present' | 'late' | 'early_leave' | 'absent';

export interface AttendanceRow {
  date: string;
  name: string;
  department: string;
  checkIn: string;
  checkOut: string;
  status: StatusType;
  statusLabel: string;
  note: string;
}

export function parseStatus(checkIn: string, raw?: string): { status: StatusType; label: string } {
  if (raw === '미출근' || raw === '-' || !raw) {
    if (!checkIn || checkIn === '-') return { status: 'absent', label: '미출근' };
  }
  if (raw?.includes('지각')) return { status: 'late', label: '지각' };
  if (raw?.includes('조퇴')) return { status: 'early_leave', label: '조퇴' };
  return { status: 'present', label: '출근' };
}

export function excelSerialToDate(serial: number): string {
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function excelSerialToTime(serial: number | string | undefined): string {
  if (!serial || serial === '-' || serial === '미출근' || serial === '') return '-';
  const num = Number(serial);
  if (isNaN(num)) return String(serial);
  const fraction = num - Math.floor(num);
  const totalMinutes = Math.round(fraction * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = { present: '출근', late: '지각', early_leave: '조퇴', absent: '미출근' };
  return map[status] || status;
}

export function parseNoteToTimes(note: string | null): { checkIn: string; checkOut: string } {
  if (!note) return { checkIn: '-', checkOut: '-' };
  const checkInMatch = note.match(/출근\s*([\d:]+)/);
  const checkOutMatch = note.match(/퇴근\s*([\d:]+)/);
  return {
    checkIn: checkInMatch?.[1] || '-',
    checkOut: checkOutMatch?.[1] || '-',
  };
}

/** 타임인아웃 Excel JSON 행 → AttendanceRow 배열 변환 */
export function parseTimeinoutExcel(rows: Record<string, unknown>[]): AttendanceRow[] {
  return rows
    .filter((r) => r['이름'] && r['날짜'])
    .map((r) => {
      const dateRaw = r['날짜'];
      const date = typeof dateRaw === 'number'
        ? excelSerialToDate(dateRaw)
        : String(dateRaw).match(/(\d{4}-\d{2}-\d{2})/)?.[1] || String(dateRaw);
      const checkIn = excelSerialToTime(r['출퇴근시간'] as number | string | undefined);
      const checkOut = excelSerialToTime(r['출퇴근시간_1'] as number | string | undefined);
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
        note: `출근 ${checkIn} / 퇴근 ${checkOut}`,
      };
    });
}
