'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

const nav = [
  { href: '/dashboard', label: '홈', icon: '🏠' },
  { href: '/dashboard/students', label: '교육생', icon: '👥' },
  { href: '/dashboard/attendance', label: '출결', icon: '📋' },
  { href: '/dashboard/tests', label: '테스트', icon: '📝' },
  { href: '/dashboard/education-logs', label: '교육일지', icon: '📓' },
  { href: '/dashboard/practice', label: '실습', icon: '🔧', disabled: true },
  { href: '/dashboard/reports', label: '리포트', icon: '📈' },
  { href: '/dashboard/announcements', label: '공지사항', icon: '📢' },
  { href: '/dashboard/overview', label: '심화교육', icon: '🏪' },
  { href: '/dashboard/settings', label: '기수 관리', icon: '📚' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authName, setAuthName] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem('iloom-auth');
    if (!auth) {
      router.replace('/login');
      return;
    }
    try {
      const parsed = JSON.parse(auth);
      if (parsed.role === 'admin') {
        setAuthName(parsed.name);
        setChecked(true);
      } else {
        router.replace('/login');
      }
    } catch {
      router.replace('/login');
    }
  }, [router]);

  if (!checked) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg-main)' }} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)' }}>

      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(0,0,0,0.6)',
          }}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}
        style={{
          width: 240,
          flexShrink: 0,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 50,
          transition: 'transform 0.2s ease',
        }}
      >
        {/* 로고 */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              일룸 LSA 입문교육
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>교육 관리 시스템</p>
        </div>

        {/* 네비게이션 */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {nav.map((item) => {
            const isDisabled = 'disabled' in item && item.disabled;
            const isActive = !isDisabled && (
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href)
            );

            if (isDisabled) {
              return (
                <div
                  key={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', borderRadius: 'var(--radius-md)',
                    fontSize: 15, fontWeight: 500,
                    color: 'var(--text-muted)', opacity: 0.5,
                    cursor: 'default',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  {item.label}
                  <span style={{ fontSize: 11, marginLeft: 'auto', color: 'var(--text-muted)' }}>준비중</span>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 15,
                  fontWeight: 500,
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                  background: isActive ? 'var(--blue)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-tertiary)',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
          </div>

          {/* 외부 링크 */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <a
            href="https://iloom-education-settlement-production.up.railway.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
              background: 'transparent',
              color: 'var(--text-muted)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 16 }}>💰</span>
            교육비용 정산 비서
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>↗</span>
          </a>
          <a
            href="https://iloom-saleschatbot.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
              background: 'transparent',
              color: 'var(--text-muted)',
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

        {/* 하단 정보 */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>교육자: {authName || '관리자'}</p>
          <button
            onClick={() => { localStorage.removeItem('iloom-auth'); router.replace('/login'); }}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 영역 */}
      <div className="main-area" style={{ flex: 1, marginLeft: 240, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* 모바일 헤더 */}
        <header
          className="mobile-header"
          style={{
            display: 'none',
            alignItems: 'center',
            gap: 12,
            padding: '0 20px',
            height: 56,
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              padding: 8, borderRadius: 'var(--radius-sm)',
              background: 'transparent', border: 'none',
              color: 'var(--text-tertiary)', cursor: 'pointer',
            }}
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h16M3 11h16M3 16h16" />
            </svg>
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>일룸 LSA 입문교육</span>
        </header>

        {/* 콘텐츠 */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          <div className="content-wrapper" style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 40px' }}>
            {children}
          </div>
        </main>
      </div>

      {/* 반응형 CSS */}
      <style>{`
        @media (max-width: 768px) {
          .sidebar {
            transform: translateX(-100%);
          }
          .sidebar.sidebar-open {
            transform: translateX(0);
          }
          .main-area {
            margin-left: 0 !important;
          }
          .mobile-header {
            display: flex !important;
          }
          .mobile-overlay {
            display: block;
          }
          .content-wrapper {
            padding: 16px 12px !important;
          }
        }
        @media (min-width: 769px) {
          .sidebar {
            transform: translateX(0) !important;
          }
          .mobile-overlay {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
