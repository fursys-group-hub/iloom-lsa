'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const nav = [
  { href: '/dashboard', label: '홈', icon: '🏠' },
  { href: '/dashboard/students', label: '교육생', icon: '👥' },
  { href: '/dashboard/attendance', label: '출결', icon: '📋' },
  { href: '/dashboard/reports', label: '리포트', icon: '📈' },
  { href: '/dashboard/settings', label: '설정', icon: '⚙️' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      {/* 상단 헤더 */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: 65,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: 'rgba(10, 10, 10, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* 로고 */}
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            일룸 입문교육
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--blue)',
              color: '#fff',
            }}
          >
            교육 도구
          </span>
        </Link>

        {/* 데스크탑 네비 */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="desktop-nav">
          {nav.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 15,
                  fontWeight: 500,
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                  background: isActive ? 'var(--blue)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-tertiary)',
                }}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* 모바일 햄버거 */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="mobile-menu-btn"
          style={{
            display: 'none',
            padding: 8,
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
          }}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen
              ? <path d="M6 6l10 10M16 6L6 16" />
              : <path d="M3 6h16M3 11h16M3 16h16" />
            }
          </svg>
        </button>
      </header>

      {/* 모바일 메뉴 */}
      {menuOpen && (
        <div
          className="mobile-dropdown"
          style={{
            position: 'fixed',
            top: 65,
            left: 0,
            right: 0,
            zIndex: 99,
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
            padding: '8px 16px 16px',
          }}
        >
          {nav.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 16,
                  fontWeight: 500,
                  textDecoration: 'none',
                  background: isActive ? 'var(--blue)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-tertiary)',
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* 메인 */}
      <main style={{ maxWidth: 1600, margin: '0 auto', padding: '32px 40px' }}>
        {children}
      </main>

      {/* 반응형 CSS */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
        @media (min-width: 769px) {
          .mobile-dropdown { display: none !important; }
        }
      `}</style>
    </div>
  );
}
