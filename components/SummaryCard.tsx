'use client';

import React from 'react';

// 공통 카드 톤
export type Tone = 'blue' | 'orange' | 'purple' | 'green' | 'red' | 'gray';

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

export interface BadgeSpec {
  text: string;
  tone?: Tone;
}

export type FooterItem =
  | { type: 'pill'; text: string; tone?: Tone }
  | { type: 'emoji'; value: string }
  | { type: 'tag'; text: string }
  | { type: 'commentCount'; count: number };

export interface SummaryCardProps {
  /** 좌상단 날짜/라벨 — 문자열이면 기본 스타일, ReactNode면 그대로 렌더 (아바타 등) */
  date?: string | React.ReactNode;
  /** 우상단 유형 뱃지 */
  typeBadge?: BadgeSpec;
  /** 굵은 메인 제목 */
  title: string;
  /** 보조 텍스트 (3줄 자동 클램프) */
  sub?: string;
  /** 본문 좌측 썸네일 이미지 URL */
  thumbnail?: string;
  /** 카드 선택 상태 (파란 테두리) */
  selected?: boolean;
  /** 변형: default(흰 배경) | self-study(보라 테두리) */
  variant?: 'default' | 'self-study';
  /** 카드 클릭 핸들러 (button 모드) */
  onClick?: () => void;
  /** Link href (anchor 모드 — onClick과 동시 사용 X) */
  href?: string;
  /** 비활성화 (잠김) */
  disabled?: boolean;
  /** 푸터 좌측 신호 칩들 (없으면 푸터 자체 미표시) */
  footerSignals?: FooterItem[];
  /** 푸터 우측 — 코멘트 수 또는 자유 ReactNode */
  footerRight?: FooterItem | React.ReactNode;
  /** 제목 크기 — default(18px) | lg(22px) | xl(28px) */
  titleSize?: 'default' | 'lg' | 'xl';
  /** 카드 배경을 bg-main(회색)으로 — 흰 카드 안에 넣을 때 사용 */
  subtle?: boolean;
  /** 본문 추가 영역 (sub 아래, footer 위) — 주차 히트맵 등 커스텀 시각화 */
  bodyExtra?: React.ReactNode;
}

function renderFooterItem(item: FooterItem, key: string | number) {
  if (item.type === 'emoji') {
    return <span key={key} style={{ fontSize: 13 }}>{item.value}</span>;
  }
  if (item.type === 'pill') {
    const tone = item.tone || 'gray';
    return (
      <span key={key} style={{
        padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
        background: TONE_BG[tone], color: TONE_FG[tone], whiteSpace: 'nowrap',
      }}>{item.text}</span>
    );
  }
  if (item.type === 'tag') {
    return (
      <span key={key} style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
        #{item.text}
      </span>
    );
  }
  if (item.type === 'commentCount') {
    return (
      <span key={key} style={{
        padding: '3px 10px', borderRadius: 'var(--radius-pill)',
        background: 'var(--blue-dim)', color: 'var(--blue)',
        fontSize: 12, fontWeight: 600,
      }}>💬 {item.count}</span>
    );
  }
  return null;
}

function isFooterItem(value: unknown): value is FooterItem {
  return !!value && typeof value === 'object' && 'type' in (value as object);
}

export function SummaryCard(props: SummaryCardProps) {
  const {
    date, typeBadge, title, sub, thumbnail,
    selected, variant = 'default', onClick, href, disabled,
    footerSignals = [], footerRight,
    titleSize = 'default', subtle, bodyExtra,
  } = props;
  const titleFontSize = titleSize === 'xl' ? 28 : titleSize === 'lg' ? 22 : 18;
  const defaultBg = subtle ? 'var(--bg-main)' : 'var(--bg-surface)';

  const isSelfStudy = variant === 'self-study';
  const hasFooter = footerSignals.length > 0 || !!footerRight;

  const containerStyle: React.CSSProperties = {
    padding: '24px', borderRadius: 'var(--radius-lg)', textAlign: 'left',
    border: selected
      ? '2px solid var(--blue)'
      : subtle ? 'none'
      : isSelfStudy ? '1px solid var(--purple-dim)' : '1px solid var(--border)',
    background: selected
      ? 'var(--blue-dim)'
      : isSelfStudy ? 'var(--purple-dim)' : defaultBg,
    cursor: disabled ? 'not-allowed' : (onClick || href ? 'pointer' : 'default'),
    opacity: disabled ? 0.55 : 1,
    transition: 'all 0.15s ease',
    display: 'flex', flexDirection: 'column', gap: 16,
    boxShadow: 'var(--shadow-sm)',
    width: '100%', boxSizing: 'border-box',
    fontFamily: 'inherit', color: 'inherit',
    textDecoration: 'none',
  };

  const inner = (
    <>
      {/* 1) 헤더 */}
      {(date || typeBadge) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          {date ? (
            typeof date === 'string'
              ? <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)' }}>{date}</span>
              : <>{date}</>
          ) : <span />}
          {typeBadge && (
            <span style={{
              padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600,
              background: TONE_BG[typeBadge.tone || 'blue'],
              color: TONE_FG[typeBadge.tone || 'blue'],
            }}>{typeBadge.text}</span>
          )}
        </div>
      )}

      {/* 2) 본문 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 88, flex: 1 }}>
        <div style={{
          fontSize: titleFontSize, fontWeight: 700, color: 'var(--text-primary)',
          lineHeight: 1.3, letterSpacing: '-0.015em',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {title}
        </div>
        {thumbnail ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <img
              src={thumbnail}
              alt=""
              style={{
                width: 72, height: 72, objectFit: 'cover', flexShrink: 0,
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)',
              }}
            />
            {sub && (
              <div style={{
                fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.55, flex: 1, minWidth: 0,
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>{sub}</div>
            )}
          </div>
        ) : sub && (
          <div style={{
            fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.55,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{sub}</div>
        )}
        {bodyExtra && <div>{bodyExtra}</div>}
      </div>

      {/* 3) 푸터 */}
      {hasFooter && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          paddingTop: 12, borderTop: '1px solid var(--border-light)',
        }}>
          {footerSignals.map((item, i) => renderFooterItem(item, i))}
          {footerRight && (
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {isFooterItem(footerRight) ? renderFooterItem(footerRight, 'right') : footerRight}
            </span>
          )}
        </div>
      )}
    </>
  );

  if (href && !disabled) {
    return <a href={href} style={containerStyle}>{inner}</a>;
  }
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} style={containerStyle}>
      {inner}
    </button>
  );
}
