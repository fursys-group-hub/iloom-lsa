'use client';

import React from 'react';
import Link from 'next/link';

// 배너 톤 (SummaryCard와 같은 체계)
export type BannerTone = 'blue' | 'orange' | 'purple' | 'green' | 'red' | 'gray';

const TONE_CONFIG: Record<BannerTone, { bg: string; border: string; fg: string; btnBg: string }> = {
  blue:   { bg: 'var(--blue-dim)',   border: 'var(--blue)',   fg: 'var(--blue)',   btnBg: 'var(--blue)' },
  orange: { bg: 'var(--orange-dim)', border: 'var(--orange)', fg: 'var(--orange)', btnBg: 'var(--orange)' },
  purple: { bg: 'var(--purple-dim)', border: 'var(--purple)', fg: 'var(--purple)', btnBg: 'var(--purple)' },
  green:  { bg: 'var(--green-dim)',  border: 'var(--green)',  fg: 'var(--green)',  btnBg: 'var(--green)' },
  red:    { bg: 'var(--red-dim)',    border: 'var(--red)',    fg: 'var(--red)',    btnBg: 'var(--red)' },
  gray:   { bg: 'var(--bg-hover)',   border: 'var(--border)', fg: 'var(--text-tertiary)', btnBg: 'var(--text-tertiary)' },
};

export interface BannerProps {
  /** 좌측 이모지/아이콘 (선택) */
  icon?: string;
  /** 굵은 제목 */
  title: string;
  /** 보조 설명 */
  description?: string;
  /** 톤 (bg/border/text 색상) */
  tone?: BannerTone;
  /** CTA 버튼 텍스트 */
  actionText?: string;
  /** CTA 버튼 링크 */
  actionHref?: string;
  /** 또는 onClick 핸들러 */
  onAction?: () => void;
  /** 닫기 버튼 */
  onClose?: () => void;
}

export function Banner({
  icon, title, description, tone = 'blue',
  actionText, actionHref, onAction, onClose,
}: BannerProps) {
  const config = TONE_CONFIG[tone];

  const actionButton = actionText ? (
    actionHref ? (
      <Link href={actionHref} style={{
        padding: '8px 16px', borderRadius: 'var(--radius-md)',
        background: config.btnBg, color: '#fff',
        fontSize: 14, fontWeight: 600,
        textDecoration: 'none', whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', lineHeight: 1.2,
      }}>
        {actionText}
      </Link>
    ) : (
      <button
        type="button"
        onClick={onAction}
        style={{
          padding: '8px 16px', borderRadius: 'var(--radius-md)',
          background: config.btnBg, color: '#fff', border: 'none',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit', whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', lineHeight: 1.2,
        }}
      >
        {actionText}
      </button>
    )
  ) : null;

  return (
    <div style={{
      background: config.bg,
      border: `1px solid ${config.border}`,
      borderRadius: 'var(--radius-lg)',
      padding: '16px 20px',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        {icon && <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: config.fg }}>{title}</div>
          {description && (
            <div style={{ fontSize: 13, color: 'var(--text-second)', marginTop: 2 }}>
              {description}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {actionButton}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
