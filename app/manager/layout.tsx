'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

const nav = [
  { href: '/manager', label: '홈' },
  { href: '/manager/tests', label: '테스트', disabled: true },
  { href: '/manager/evaluations', label: 'R&P' },
  { href: '/manager/final', label: '교육 총평' },
];

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [auth, setAuth] = useState<{ name: string; storeName: string } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem('iloom-auth');
    if (!raw) { router.replace('/login'); return; }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.role === 'manager') {
        setAuth({ name: parsed.name, storeName: parsed.storeName });
        setChecked(true);
      } else {
        router.replace('/login');
      }
    } catch { router.replace('/login'); }
  }, [router]);

  if (!checked) return <div style={{ minHeight: '100vh', background: 'var(--bg-main)' }} />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      {sidebarOpen && (
        <div className="mobile-overlay" onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'var(--overlay)' }} />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}
        style={{
          width: 240, flexShrink: 0, background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, transition: 'transform 0.2s ease',
        }}>
        <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>매장 교육 관리</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--blue)', marginTop: 4, fontWeight: 600 }}>
            {auth?.storeName || auth?.name}
          </p>
        </div>

        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {nav.map((item) => {
            const isDisabled = 'disabled' in item && item.disabled;
            const isActive = !isDisabled && (item.href === '/manager' ? pathname === '/manager' : pathname.startsWith(item.href));

            if (isDisabled) {
              return (
                <div key={item.href} style={{
                  display: 'flex', alignItems: 'center', padding: '12px 16px',
                  borderRadius: 'var(--radius-md)', fontSize: 15, fontWeight: 400,
                  color: 'var(--text-muted)', opacity: 0.5, cursor: 'default',
                }}>
                  {item.label}
                  <span style={{ fontSize: 11, marginLeft: 'auto', color: 'var(--text-muted)' }}>준비중</span>
                </div>
              );
            }

            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', padding: '12px 16px',
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
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{auth?.name}</p>
          <button onClick={() => { localStorage.removeItem('iloom-auth'); router.replace('/login'); }}
            style={{
              padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            로그아웃
          </button>
        </div>
      </aside>

      <div className="main-area" style={{ flex: 1, marginLeft: 240, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header className="mobile-header"
          style={{ display: 'none', alignItems: 'center', gap: 12, padding: '0 20px', height: 56, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => setSidebarOpen(true)}
            style={{ padding: 8, borderRadius: 'var(--radius-sm)', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h16M3 11h16M3 16h16" /></svg>
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>매장 교육 관리</span>
        </header>
        <main style={{ flex: 1, overflow: 'auto' }}>
          <div className="mgr-content-wrapper" style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 40px' }}>{children}</div>
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .sidebar { transform: translateX(-100%); }
          .sidebar.sidebar-open { transform: translateX(0); }
          .main-area { margin-left: 0 !important; }
          .mobile-header { display: flex !important; }
          .mgr-content-wrapper { padding: 16px 12px !important; }
        }
        @media (min-width: 769px) {
          .sidebar { transform: translateX(0) !important; }
          .mobile-overlay { display: none !important; }
        }
      `}</style>
    </div>
  );
}
