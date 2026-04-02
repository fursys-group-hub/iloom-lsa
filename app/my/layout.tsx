'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

const nav = [
  { href: '/my', label: '홈', icon: '🏠', exact: true },
  { href: '/my/announcements', label: '공지사항', icon: '📢' },
  { href: '/my/attendance', label: '출결', icon: '📋' },
  { href: '/my/tests', label: '테스트', icon: '📝' },
  { href: '/my/notes', label: '교육일지', icon: '📓' },
  { href: '/my/practice', label: '실습일지', icon: '🏪' },
  { href: '/my/ask', label: '질문하기', icon: '💬' },
  { href: '/my/training', label: '심화교육', icon: '🏪', disabled: true },
];

export default function MyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authName, setAuthName] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)' }}>

      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div className="mobile-overlay" onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.6)' }} />
      )}

      {/* 사이드바 */}
      <aside className={`my-sidebar ${sidebarOpen ? 'my-sidebar-open' : ''}`} style={{
        width: 220, flexShrink: 0, background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
        transition: 'transform 0.2s ease',
      }}>
        <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>일룸 LSA 입문교육</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{authName}님</p>
        </div>

        <nav style={{ flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {nav.map((item) => {
            const isDisabled = 'disabled' in item && item.disabled;
            const isActive = !isDisabled && (
              item.exact ? pathname === item.href : pathname.startsWith(item.href) && (item.exact || item.href !== '/my')
            );

            if (isDisabled) {
              return (
                <div key={item.href} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                  borderRadius: 'var(--radius-md)', fontSize: 15, fontWeight: 500,
                  color: 'var(--text-muted)', opacity: 0.5, cursor: 'default',
                }}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  {item.label}
                  <span style={{ fontSize: 11, marginLeft: 'auto', color: 'var(--text-muted)' }}>준비중</span>
                </div>
              );
            }

            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                borderRadius: 'var(--radius-md)', fontSize: 15, fontWeight: 500, textDecoration: 'none',
                transition: 'all 0.15s ease',
                background: isActive ? 'var(--blue)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-tertiary)',
              }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
          {/* 외부 링크 */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
            <a
              href="https://iloom-saleschatbot.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 16px', borderRadius: 'var(--radius-md)',
                fontSize: 14, fontWeight: 500, textDecoration: 'none',
                transition: 'all 0.15s ease',
                background: 'transparent', color: 'var(--text-muted)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 16 }}>💬</span>
              영업지원 챗봇
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>↗</span>
            </a>
          </div>
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => { localStorage.removeItem('iloom-auth'); router.replace('/login'); }}
            style={{
              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', width: '100%',
            }}
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 */}
      <div className="my-main" style={{ flex: 1, marginLeft: 220, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* 모바일 헤더 */}
        <header className="my-mobile-header" style={{
          display: 'none', alignItems: 'center', gap: 12, padding: '0 20px', height: 56,
          background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        }}>
          <button onClick={() => setSidebarOpen(true)} style={{
            padding: 8, borderRadius: 'var(--radius-sm)', background: 'transparent',
            border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer',
          }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h16M3 11h16M3 16h16" />
            </svg>
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>일룸 LSA 입문교육</span>
        </header>

        <main style={{ flex: 1, overflow: 'auto' }}>
          <div className="my-content-wrapper" style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 40px' }}>
            {children}
          </div>
        </main>
      </div>

      {/* 반응형 CSS */}
      <style>{`
        @media (max-width: 768px) {
          .my-sidebar { transform: translateX(-100%); }
          .my-sidebar.my-sidebar-open { transform: translateX(0); }
          .my-main { margin-left: 0 !important; }
          .my-mobile-header { display: flex !important; }
          .mobile-overlay { display: block; }
          .my-content-wrapper { padding: 16px 12px !important; }
        }
        @media (min-width: 769px) {
          .my-sidebar { transform: translateX(0) !important; }
          .mobile-overlay { display: none !important; }
        }
      `}</style>
    </div>
  );
}
