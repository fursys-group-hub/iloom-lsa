'use client';

import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('iloom-theme');
    if (saved === 'light') {
      document.body.classList.add('light');
      setLight(true);
    }
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    if (next) {
      document.body.classList.add('light');
      localStorage.setItem('iloom-theme', 'light');
    } else {
      document.body.classList.remove('light');
      localStorage.setItem('iloom-theme', 'dark');
    }
  };

  return (
    <button
      onClick={toggle}
      title={light ? '다크모드로 전환' : '라이트모드로 전환'}
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        width: 44, height: 44, borderRadius: '50%',
        border: '1px solid var(--border)', background: 'var(--bg-surface)',
        color: 'var(--text-primary)', fontSize: 20,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'var(--shadow-md)', transition: 'all 0.2s ease',
      }}
    >
      {light ? '🌙' : '☀️'}
    </button>
  );
}
