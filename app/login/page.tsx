'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) {
      setError('이름과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    // 관리자 비밀번호
    if (password === '1230') {
      localStorage.setItem('iloom-auth', JSON.stringify({ name: name.trim(), role: 'admin' }));
      router.push('/dashboard');
      return;
    }

    // TODO: 교육생 로그인 (추후 구현)
    setError('비밀번호가 올바르지 않아요.');
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-main)',
      padding: 20,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}>
        {/* 로고 */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            일룸 입문교육
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>
            교육 관리 시스템
          </p>
        </div>

        {/* 로그인 카드 */}
        <form
          onSubmit={handleLogin}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div>
            <label style={labelStyle}>이름</label>
            <input
              type="text"
              placeholder="이름을 입력하세요"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              autoFocus
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>비밀번호</label>
            <input
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ fontSize: 14, color: 'var(--red)', margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '14px 0',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: loading ? 'var(--border)' : 'var(--blue)',
              color: '#fff',
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
          일룸 가구 · 입문교육 관리 도구
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: 16,
  outline: 'none',
  boxSizing: 'border-box',
};
