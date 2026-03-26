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

    if (password === '1230') {
      localStorage.setItem('iloom-auth', JSON.stringify({ name: name.trim(), role: 'admin' }));
      router.push('/dashboard');
      return;
    }

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
        maxWidth: 420,
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}>
        {/* 로그인 카드 */}
        <form
          onSubmit={handleLogin}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: '40px 36px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          {/* 아이콘 + 제목 */}
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <p style={{ fontSize: 48, margin: '0 0 16px' }}>📖</p>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              일룸 LSA 입문교육
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>
              일룸 영업전문직 LSA 교육 관리 시스템
            </p>
          </div>

          <div>
            <label style={labelStyle}>이름</label>
            <input
              type="text"
              placeholder="예: 김수지"
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading ? '로그인 중...' : '다음 →'}
          </button>
        </form>
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
  padding: '14px 16px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: 16,
  outline: 'none',
  boxSizing: 'border-box',
};
