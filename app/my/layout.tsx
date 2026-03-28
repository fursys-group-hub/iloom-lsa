'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function MyLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authName, setAuthName] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (!auth) { router.replace('/login'); return; }
    try {
      const parsed = JSON.parse(auth);
      if (parsed.role === 'student' && parsed.studentId) {
        setAuthName(parsed.name);
        setChecked(true);
      } else {
        router.replace('/login');
      }
    } catch {
      router.replace('/login');
    }
  }, [router]);

  if (!checked) return <div style={{ minHeight: '100vh', background: 'var(--bg-main)' }} />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      {/* 상단 바 */}
      <header style={{
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>📖</span>
          <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>일룸 LSA 입문교육</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{authName}</span>
          <button
            onClick={() => { localStorage.removeItem('iloom-auth'); router.replace('/login'); }}
            style={{
              padding: '6px 12px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
            }}
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 콘텐츠 */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {children}
      </main>
    </div>
  );
}
