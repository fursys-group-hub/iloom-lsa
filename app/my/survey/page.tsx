'use client';

import { useState, useEffect, useCallback } from 'react';
import { SummaryCard, type Tone, type FooterItem } from '@/components/SummaryCard';

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
  period: string;     // 응답 기간 (예: "4/10 ~ 4/15")
  status: 'available' | 'locked' | 'done';
  statusText: string;
  disabled?: boolean;
}

export default function SurveyHubPage() {
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ansanDone, setAnsanDone] = useState({ pre: false, post: false });
  const [efficacyIntroDone, setEfficacyIntroDone] = useState(false);

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
      const [preRes, postRes, introRes] = await Promise.all([
        fetch(`/api/ansan-tour-surveys?studentId=${auth.studentId}&phase=pre`).then(r => r.json()),
        fetch(`/api/ansan-tour-surveys?studentId=${auth.studentId}&phase=post`).then(r => r.json()),
        fetch(`/api/education-surveys?studentId=${auth.studentId}&phase=intro_end`).then(r => r.json()),
      ]);
      const has = (r: unknown) => Array.isArray(r) ? r.length > 0 : !!r;
      setAnsanDone({ pre: has(preRes), post: has(postRes) });
      setEfficacyIntroDone(has(introRes));
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
        href: '/my/survey/ansan-tour?phase=pre',
        emoji: '',
        title: '안성공장 인프라 투어',
        subtitle: '사전 설문',
        desc: '투어 가기 전 지금 알고 있는 정도와 궁금한 점을 적었어요.',
        duration: '약 5분',
        period: '4/15 ~ 4/15 자정',
        status: 'done',
        statusText: '완료',
      }
    : {
        href: '/my/survey/ansan-tour?phase=pre',
        emoji: '',
        title: '안성공장 인프라 투어',
        subtitle: '사전 설문',
        desc: '투어 가기 전 지금 알고 있는 정도와 가장 궁금한 점을 알려주세요.',
        duration: '약 5분',
        period: '4/15 ~ 4/15 자정',
        status: 'available',
        statusText: '참여 가능',
      };

  // 사후 설문 카드 (사전 완료 후 활성화)
  const postCard: SurveyCard = ansanDone.post
    ? {
        href: '/my/survey/ansan-tour?phase=post',
        emoji: '',
        title: '안성공장 인프라 투어',
        subtitle: '사후 설문',
        desc: '투어 후 가장 인상 깊었던 점과 새로 알게 된 점을 적었어요.',
        duration: '약 7분',
        period: '4/15 ~ 4/15 자정',
        status: 'done',
        statusText: '완료',
      }
    : ansanDone.pre
    ? {
        href: '/my/survey/ansan-tour?phase=post',
        emoji: '',
        title: '안성공장 인프라 투어',
        subtitle: '사후 설문',
        desc: '투어를 마치고 가장 인상 깊었던 점과 새로 알게 된 점을 알려주세요.',
        duration: '약 7분',
        period: '4/15 ~ 4/15 자정',
        status: 'available',
        statusText: '참여 가능',
      }
    : {
        href: '/my/survey/ansan-tour?phase=post',
        emoji: '',
        title: '안성공장 인프라 투어',
        subtitle: '사후 설문',
        desc: '사전 설문을 먼저 작성하면 열려요.',
        duration: '약 7분',
        period: '4/15 ~ 4/15 자정',
        status: 'locked',
        statusText: '사전 설문 후 가능',
        disabled: true,
      };

  // 자기효능감 설문 (입문교육)
  const efficacyIntroCard: SurveyCard = efficacyIntroDone
    ? {
        href: '/my/survey/efficacy',
        emoji: '',
        title: '자기효능감 설문',
        subtitle: '입문교육',
        desc: '입문교육을 마무리하며 자신의 자신감과 만족도를 돌아봤어요.',
        duration: '약 5분',
        period: '4/22 ~ 4/22 자정',
        status: 'done',
        statusText: '완료',
      }
    : {
        href: '/my/survey/efficacy',
        emoji: '',
        title: '자기효능감 설문',
        subtitle: '입문교육',
        desc: '입문교육을 마무리하며 지금 자신의 자신감과 교육 만족도를 알려주세요.',
        duration: '약 5분',
        period: '4/22 ~ 4/22 자정',
        status: 'available',
        statusText: '참여 가능',
      };

  const cards = [preCard, postCard, efficacyIntroCard];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
          교육 설문
        </h2>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>불러오는 중...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, maxWidth: 1280 }}>
          {cards.map((c, i) => <SurveyCardItem key={i} card={c} />)}
        </div>
      )}
    </div>
  );
}

function SurveyCardItem({ card }: { card: SurveyCard }) {
  const statusTone: Tone = card.status === 'done' ? 'green' : card.status === 'locked' ? 'gray' : 'blue';
  const actionLabel = card.status === 'done' ? '내 답변 보기 →' : card.status === 'locked' ? '잠김' : '참여하기 →';

  const footerSignals: FooterItem[] = [
    { type: 'pill', text: card.statusText, tone: statusTone },
    { type: 'pill', text: card.duration, tone: 'gray' },
  ];
  const footerRight = (
    <span style={{ fontSize: 13, fontWeight: 600, color: card.disabled ? 'var(--text-muted)' : 'var(--blue)' }}>
      {actionLabel}
    </span>
  );

  return (
    <SummaryCard
      date={card.period}
      typeBadge={{ text: card.subtitle, tone: 'blue' }}
      title={card.title}
      sub={card.desc}
      disabled={card.disabled}
      href={card.disabled ? undefined : card.href}
      footerSignals={footerSignals}
      footerRight={footerRight}
    />
  );
}
