'use client';

import React from 'react';
import type { Tone } from './SummaryCard';

const TONE_BG: Record<Tone, string> = {
  blue: 'var(--blue-dim)',
  orange: 'var(--orange-dim)',
  purple: 'var(--purple-dim)',
  green: 'var(--green-dim)',
  red: 'var(--red-dim)',
  gray: 'var(--bg-hover)',
};
const TONE_FG: Record<Tone, string> = {
  blue: 'var(--blue)',
  orange: 'var(--orange)',
  purple: 'var(--purple)',
  green: 'var(--green)',
  red: 'var(--red)',
  gray: 'var(--text-tertiary)',
};

export interface RowBadge {
  text: string;
  tone?: Tone;
  dot?: boolean; // 좌측 작은 컬러 닷
}

export interface RowLeftLabel {
  primary: string;          // 큰 글씨 (예: 4/15)
  secondary?: string;        // 작은 보조 (예: 수요일)
  secondaryTone?: Tone;      // 토/일은 빨강 등
}

export interface SummaryRowProps {
  /** 좌측 라벨 (날짜 등) */
  leftLabel?: RowLeftLabel;
  /** 좌측 뱃지 (공지/중요/출근/지각 등) */
  badge?: RowBadge;
  /** 메인 텍스트 */
  title?: string;
  /** 우측 자유 ReactNode (시간/메타 등) */
  rightSlot?: React.ReactNode;
  /** 펼치기 가능 여부 */
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  /** 클릭 핸들러 (펼치기 외 일반 클릭) */
  onClick?: () => void;
  /** 펼침 본문 */
  children?: React.ReactNode;
}

export function SummaryRow(props: SummaryRowProps) {
  const {
    leftLabel, badge, title, rightSlot,
    expandable, expanded, onToggle, onClick,
    children,
  } = props;

  const handleClick = () => {
    if (expandable && onToggle) onToggle();
    else if (onClick) onClick();
  };

  const interactive = !!(expandable || onClick);

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
    }}>
      <div
        onClick={interactive ? handleClick : undefined}
        style={{
          display: 'grid',
          gridTemplateColumns: `${leftLabel ? '88px' : ''} ${badge ? 'auto' : ''} 1fr auto ${expandable ? 'auto' : ''}`.trim().replace(/\s+/g, ' '),
          alignItems: 'center', gap: 20,
          padding: '20px 24px',
          cursor: interactive ? 'pointer' : 'default',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => { if (interactive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { if (interactive) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* 좌측 라벨 (날짜) — 고정 너비 88px */}
        {leftLabel && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 2,
            paddingRight: 16, borderRight: '1px solid var(--border-light)',
          }}>
            <div style={{
              fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
              lineHeight: 1.15, letterSpacing: '-0.015em',
            }}>
              {leftLabel.primary}
            </div>
            {leftLabel.secondary && (
              <div style={{
                fontSize: 12, fontWeight: 500,
                color: leftLabel.secondaryTone ? TONE_FG[leftLabel.secondaryTone] : 'var(--text-muted)',
              }}>
                {leftLabel.secondary}
              </div>
            )}
          </div>
        )}

        {/* 뱃지 — 고정 너비 영역 */}
        {badge && (
          <span style={{
            padding: '5px 12px', borderRadius: 'var(--radius-pill)',
            fontSize: 12, fontWeight: 600,
            background: TONE_BG[badge.tone || 'gray'],
            color: TONE_FG[badge.tone || 'gray'],
            display: 'inline-flex', alignItems: 'center', gap: 6,
            whiteSpace: 'nowrap', justifySelf: 'start',
          }}>
            {badge.dot && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: TONE_FG[badge.tone || 'gray'],
              }} />
            )}
            {badge.text}
          </span>
        )}

        {/* 제목 (가운데 가변 영역) */}
        <div style={{
          minWidth: 0,
          fontSize: 15, fontWeight: 600, color: title ? 'var(--text-primary)' : 'transparent',
          lineHeight: 1.4, letterSpacing: '-0.005em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title || ' '}
        </div>

        {/* 우측 슬롯 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 13, color: 'var(--text-tertiary)',
          justifySelf: 'end',
        }}>
          {rightSlot}
        </div>

        {/* 펼치기 화살표 */}
        {expandable && (
          <span style={{
            fontSize: 11, color: 'var(--text-muted)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
            justifySelf: 'end',
          }}>▼</span>
        )}
      </div>

      {/* 펼침 본문 */}
      {expandable && expanded && children && (
        <div style={{
          padding: '20px 24px',
          borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-main)',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}
