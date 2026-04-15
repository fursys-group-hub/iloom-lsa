'use client';

import { useState } from 'react';
import type { Lesson } from './lessons-data';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const cardShell: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
  overflow: 'hidden',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 17, fontWeight: 700, color: 'var(--text-primary)',
  margin: 0, letterSpacing: '-0.01em',
};

interface Props {
  lessons: Record<string, Lesson[]>;
  kstToday: string;
}

export default function LessonCalendar({ lessons, kstToday }: Props) {
  const [selectedDate, setSelectedDate] = useState(kstToday);
  const [viewMonth, setViewMonth] = useState(() => kstToday.slice(0, 7));

  const year = parseInt(viewMonth.split('-')[0]);
  const month = parseInt(viewMonth.split('-')[1]);
  const firstDayOfMonth = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => {
    const d = new Date(Date.UTC(year, month - 2, 1));
    setViewMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const d = new Date(Date.UTC(year, month, 1));
    setViewMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const selDay = new Date(selectedDate + 'T12:00:00Z');
  const selLessons = lessons[selectedDate] || [];
  const selLabel = `${selDay.getUTCMonth() + 1}월 ${selDay.getUTCDate()}일 (${WEEKDAYS[selDay.getUTCDay()]})`;
  const isSelToday = selectedDate === kstToday;

  return (
    <div className="lesson-cal-wrap" style={{ ...cardShell, display: 'flex', height: 420 }}>

      {/* 왼쪽: 파란 캘린더 */}
      <div className="lesson-cal-left" style={{
        background: 'var(--blue)',
        color: '#fff',
        padding: '20px 24px',
        width: 360,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'rgba(255,255,255,0.7)', padding: '2px 8px' }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>{year}년 {month}월</span>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'rgba(255,255,255,0.7)', padding: '2px 8px' }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 6 }}>
          {WEEKDAYS.map((w, i) => (
            <span key={w} style={{
              fontSize: 11, fontWeight: 600,
              color: i === 0 ? '#FFD6D6' : i === 6 ? '#D6E8FF' : 'rgba(255,255,255,0.7)',
              padding: '4px 0',
            }}>{w}</span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flex: 1, alignContent: 'start' }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} style={{ padding: '6px 0' }} />;
            const ds = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = ds === kstToday;
            const isSelected = ds === selectedDate;
            const hasLesson = (lessons[ds] || []).length > 0;
            const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
            const dayColor = dow === 0 ? '#FFD6D6' : dow === 6 ? '#D6E8FF' : '#fff';
            return (
              <div
                key={day}
                onClick={() => setSelectedDate(ds)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}
              >
                <span style={{
                  width: 30, height: 30, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: isSelected || isToday ? 700 : 500,
                  color: isSelected ? 'var(--blue)' : dayColor,
                  background: isSelected ? '#fff' : isToday ? 'rgba(255,255,255,0.2)' : 'transparent',
                  transition: 'all 0.1s ease',
                }}>{day}</span>
                <span style={{
                  width: 4, height: 4, borderRadius: '50%', marginTop: 3,
                  background: hasLesson ? (isSelected ? 'var(--blue)' : 'rgba(255,255,255,0.9)') : 'transparent',
                }} />
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: 12, color: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'inline-block' }} />
          <span>수업 있는 날</span>
        </div>
      </div>

      {/* 오른쪽: 테이블 형식의 수업 상세 */}
      <div style={{
        flex: 1, padding: '20px 24px',
        display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <h3 style={sectionTitle}>
            {isSelToday ? '오늘의 수업' : selLabel}
          </h3>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {isSelToday && <>{selLabel} · </>}{selLessons.length}개 수업
          </span>
        </div>

        {selLessons.length > 0 ? (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <table className="data-table" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap', width: 1 }}>시간</th>
                  <th>내용</th>
                  <th style={{ whiteSpace: 'nowrap', width: 1 }}>강사</th>
                </tr>
              </thead>
              <tbody>
                {selLessons.map((l, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {l.time === '종일' ? (
                        <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--purple-dim)', color: 'var(--purple)' }}>종일</span>
                      ) : (
                        <span style={{ fontWeight: 600, color: 'var(--blue-light)' }}>{l.time}</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {l.topic}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{l.instructor || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
              {isSelToday ? '오늘은 수업이 없어요' : '이 날은 수업이 없어요'}
            </p>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 1023px) {
          .lesson-cal-wrap { flex-direction: column !important; height: auto !important; }
          .lesson-cal-left { width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
