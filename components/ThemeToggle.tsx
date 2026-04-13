'use client';

import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('iloom-theme');
    if (saved === 'dark') {
      document.body.classList.add('dark');
      setDark(true);
    }
    // 기본값: 라이트모드 (클래스 없음 = :root 라이트)
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.body.classList.add('dark');
      localStorage.setItem('iloom-theme', 'dark');
    } else {
      document.body.classList.remove('dark');
      localStorage.setItem('iloom-theme', 'light');
    }
  };

  return (
    <button
      onClick={toggle}
      title={dark ? '라이트모드로 전환' : '다크모드로 전환'}
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        width: 44, height: 44, borderRadius: '50%',
        border: '1px solid var(--border)', background: 'var(--bg-surface)',
        color: 'var(--text-primary)', fontSize: 20,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'var(--shadow-md)', transition: 'all 0.2s ease',
      }}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}
