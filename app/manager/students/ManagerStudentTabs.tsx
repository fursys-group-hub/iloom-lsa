'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface StudentItem {
  id: string;
  name: string;
  store_location: string | null;
  is_dropped?: boolean;
}

export default function ManagerStudentTabs({ currentId }: { currentId: string }) {
  const router = useRouter();
  const [storeName, setStoreName] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentItem[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem('iloom-auth');
    if (raw) {
      try {
        const p = JSON.parse(raw);
        setStoreName(p.storeName || null);
      } catch { /* ignore */ }
    }
    fetch('/api/students').then(r => r.json()).then(setStudents);
  }, []);

  const myStudents = useMemo(
    () => students.filter(s => !s.is_dropped && storeName && s.store_location === storeName),
    [students, storeName]
  );

  if (myStudents.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 32 }}>
      {myStudents.map((s, i) => (
        <button
          key={s.id}
          onClick={() => router.push(`/manager/students/${s.id}`)}
          style={{
            padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,
            background: 'transparent',
            color: s.id === currentId ? 'var(--text-primary)' : 'var(--text-muted)',
            border: 'none',
            borderBottom: s.id === currentId ? '2px solid var(--blue)' : '2px solid transparent',
            fontSize: 15,
            fontWeight: s.id === currentId ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            marginBottom: -1,
          }}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}
