'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface StudentItem {
  id: string;
  name: string;
  store_location: string | null;
  is_dropped?: boolean;
}

export default function ManagerStudentsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'empty'>('loading');

  useEffect(() => {
    const raw = localStorage.getItem('iloom-auth');
    let storeName: string | null = null;
    if (raw) {
      try { storeName = JSON.parse(raw).storeName || null; } catch { /* ignore */ }
    }

    fetch('/api/students')
      .then(r => r.json())
      .then((students: StudentItem[]) => {
        const mine = students.filter(s => !s.is_dropped && storeName && s.store_location === storeName);
        if (mine.length > 0) {
          router.replace(`/manager/students/${mine[0].id}`);
        } else {
          setStatus('empty');
        }
      })
      .catch(() => setStatus('empty'));
  }, [router]);

  if (status === 'empty') {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 32px', letterSpacing: '-0.025em' }}>입문교육 기록 확인</h1>
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          배정된 교육생이 없어요.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', minHeight: 400 }}>
      <p style={{ color: 'var(--text-muted)', marginTop: 80 }}>불러오는 중...</p>
    </div>
  );
}
