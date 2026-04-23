'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

type NavItem = { href: string; label: string; exact?: boolean };
type NavSection = { label: string | null; items: NavItem[] };

const nav: NavSection[] = [
  {
    label: null, // 홈은 그룹 없이
    items: [{ href: '/my', label: '홈', exact: true }],
  },
  {
    label: '입문교육',
    items: [
      { href: '/my/announcements', label: '공지사항' },
      { href: '/my/attendance', label: '출결' },
      { href: '/my/tests', label: '테스트' },
      { href: '/my/notes', label: '교육일지' },
      { href: '/my/practice', label: '실습일지' },
      { href: '/my/ask', label: '질문하기' },
    ],
  },
  {
    label: '심화교육',
    items: [
      { href: '/my/advanced-tests', label: '심화테스트' },
      { href: '/my/training', label: '벤치마킹' },
    ],
  },
  {
    label: null,
    items: [{ href: '/my/survey', label: '교육설문' }],
  },
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
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'var(--overlay)' }} />
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

        <nav style={{ flex: 1, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {nav.map((section, si) => (
            <div key={si} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: section.label ? 12 : 0 }}>
              {section.label && (
                <div style={{
                  padding: '6px 16px 4px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}>
                  {section.label}
                </div>
              )}
              {section.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href) && item.href !== '/my';
                return (
                  <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} style={{
                    display: 'flex', alignItems: 'center', padding: '11px 16px',
                    borderRadius: 'var(--radius-md)', fontSize: 15,
                    fontWeight: isActive ? 600 : 400,
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                    background: isActive ? 'var(--blue)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--text-tertiary)',
                  }}
                    onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-second)'; } }}
                    onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; } }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 하단 고정 영역 */}
        <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ padding: '6px 12px' }}>
            <a
              href="https://iloom-saleschatbot.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: 500, textDecoration: 'none',
                transition: 'all 0.15s ease',
                background: 'transparent', color: 'var(--text-muted)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              영업지원 챗봇
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>↗</span>
            </a>
          </div>
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)' }}>
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
        </div>
      </aside>

      {/* 메인 */}
      <div className="my-main" style={{ flex: 1, marginLeft: 220, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>

        {/* 모바일 헤더 */}
        <header className="my-mobile-header" style={{
          display: 'none', alignItems: 'center', gap: 12, padding: '0 20px', height: 56,
          background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, zIndex: 90,
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

        <main style={{ flex: 1 }}>
          <div className="my-content-wrapper" style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 40px' }}>
            {children}
          </div>
        </main>
      </div>

      {/* 반응형 CSS */}
      <style>{`
        @media (max-width: 1023px) {
          .my-sidebar { transform: translateX(-100%); }
          .my-sidebar.my-sidebar-open { transform: translateX(0); }
          .my-main { margin-left: 0 !important; padding-top: 56px !important; }
          .my-mobile-header { display: flex !important; position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; z-index: 90 !important; }
          .mobile-overlay { display: block; }
        }
        @media (max-width: 768px) {
          .my-content-wrapper { padding: 16px 12px !important; }
        }
        @media (min-width: 1024px) {
          .my-sidebar { transform: translateX(0) !important; }
          .mobile-overlay { display: none !important; }
        }
      `}</style>
    </div>
  );
}
