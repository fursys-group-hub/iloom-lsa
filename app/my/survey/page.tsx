'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface AuthData {
  role: string;
  name: string;
  studentId: string;
  batchId: string;
}

interface SurveyCard {
  href: string;
  emoji: string;
  title: string;
  subtitle: string;
  desc: string;
  duration: string;
  status: 'available' | 'locked' | 'done';
  statusText: string;
  disabled?: boolean;
}

export default function SurveyHubPage() {
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ansanDone, setAnsanDone] = useState({ pre: false, post: false });

  useEffect(() => {
    try {
      const raw = localStorage.getItem('iloom-auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.role === 'student' && parsed.studentId) {
          setAuth(parsed as AuthData);
        }
      }
    } catch { /* */ }
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    try {
      const [preRes, postRes] = await Promise.all([
        fetch(`/api/ansan-tour-surveys?studentId=${auth.studentId}&phase=pre`).then(r => r.json()),
        fetch(`/api/ansan-tour-surveys?studentId=${auth.studentId}&phase=post`).then(r => r.json()),
      ]);
      const has = (r: unknown) => Array.isArray(r) ? r.length > 0 : !!r;
      setAnsanDone({ pre: has(preRes), post: has(postRes) });
    } catch { /* */ }
    setLoading(false);
  }, [auth]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  if (!auth) {
    return (
      <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>로그인이 필요해요</p>
      </div>
    );
  }

  // 사전 설문 카드
  const preCard: SurveyCard = ansanDone.pre
    ? {
        href: '/my/survey/ansan-tour',
        emoji: '🏭',
        title: '안성공장 인프라 투어',
        subtitle: '사전 설문',
        desc: '투어 가기 전 지금 알고 있는 정도와 궁금한 점을 적었어요.',
        duration: '약 5분',
        status: 'done',
        statusText: '완료',
      }
    : {
        href: '/my/survey/ansan-tour',
        emoji: '🏭',
        title: '안성공장 인프라 투어',
        subtitle: '사전 설문',
        desc: '투어 가기 전 지금 알고 있는 정도와 가장 궁금한 점을 알려주세요.',
        duration: '약 5분',
        status: 'available',
        statusText: '참여 가능',
      };

  // 사후 설문 카드 (사전 완료 후 활성화)
  const postCard: SurveyCard = ansanDone.post
    ? {
        href: '/my/survey/ansan-tour',
        emoji: '🏭',
        title: '안성공장 인프라 투어',
        subtitle: '사후 설문',
        desc: '투어 후 가장 인상 깊었던 점과 새로 알게 된 점을 적었어요.',
        duration: '약 7분',
        status: 'done',
        statusText: '완료',
      }
    : ansanDone.pre
    ? {
        href: '/my/survey/ansan-tour',
        emoji: '🏭',
        title: '안성공장 인프라 투어',
        subtitle: '사후 설문',
        desc: '투어를 마치고 가장 인상 깊었던 점과 새로 알게 된 점을 알려주세요.',
        duration: '약 7분',
        status: 'available',
        statusText: '참여 가능',
      }
    : {
        href: '/my/survey/ansan-tour',
        emoji: '🏭',
        title: '안성공장 인프라 투어',
        subtitle: '사후 설문',
        desc: '사전 설문을 먼저 작성하면 열려요.',
        duration: '약 7분',
        status: 'locked',
        statusText: '사전 설문 후 가능',
        disabled: true,
      };

  const cards = [preCard, postCard];

  return (
    <div style={{ padding: '24px 16px 64px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontSize: 'clamp(1.5rem, 1.3rem + 0.9vw, 2rem)',
          fontWeight: 700, color: 'var(--text-primary)',
          margin: '0 0 8px', letterSpacing: '-0.02em',
        }}>
          교육 설문
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>
          참여할 수 있는 설문을 선택해주세요
        </p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>불러오는 중...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {cards.map((c, i) => <SurveyCardItem key={i} card={c} />)}
        </div>
      )}
    </div>
  );
}

function SurveyCardItem({ card }: { card: SurveyCard }) {
  const statusColor = card.status === 'done'
    ? { bg: 'var(--green-dim)', text: 'var(--green)' }
    : card.status === 'locked'
    ? { bg: 'var(--bg-elevated)', text: 'var(--text-muted)' }
    : { bg: 'var(--blue-dim)', text: 'var(--blue)' };

  const cardInner = (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
        transition: 'all 0.15s ease',
        cursor: card.disabled ? 'not-allowed' : 'pointer',
        opacity: card.disabled ? 0.55 : 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
      onMouseEnter={(e) => { if (!card.disabled) { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
      onMouseLeave={(e) => { if (!card.disabled) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 36, lineHeight: 1 }}>{card.emoji}</div>
        <span style={{
          padding: '4px 12px',
          borderRadius: 'var(--radius-pill)',
          background: statusColor.bg,
          color: statusColor.text,
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}>
          {card.statusText}
        </span>
      </div>

      <div>
        <h3 style={{
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: '0 0 4px',
          letterSpacing: '-0.015em',
        }}>
          {card.title}
        </h3>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--blue-light)', margin: 0 }}>
          {card.subtitle}
        </p>
      </div>

      <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6, flex: 1 }}>
        {card.desc}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>⏱ {card.duration}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: card.disabled ? 'var(--text-muted)' : 'var(--blue)' }}>
          {card.status === 'done' ? '내 답변 보기 →' : card.status === 'locked' ? '잠김' : '참여하기 →'}
        </span>
      </div>
    </div>
  );

  if (card.disabled) {
    return cardInner;
  }
  return (
    <Link href={card.href} style={{ textDecoration: 'none' }}>
      {cardInner}
    </Link>
  );
}
