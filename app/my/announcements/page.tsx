'use client';

import { useState, useEffect, useCallback } from 'react';
import { SummaryRow } from '@/components/SummaryRow';
import type { Tone } from '@/components/SummaryCard';

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
  created_at: string;
}

const PRIORITY_TONE: Record<string, { tone: Tone; label: string }> = {
  normal: { tone: 'blue', label: '공지' },
  important: { tone: 'orange', label: '중요' },
  urgent: { tone: 'red', label: '긴급' },
};

export default function MyAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    const auth = localStorage.getItem('iloom-auth');
    if (!auth) return;
    const { batchId } = JSON.parse(auth);
    if (!batchId) return;

    try {
      const res = await fetch(`/api/announcements?batch_id=${batchId}`);
      const data = await res.json();
      if (Array.isArray(data)) setAnnouncements(data);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  if (loading) {
    return <p style={{ fontSize: 16, color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}>불러오는 중...</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
        공지사항
      </h2>

      {announcements.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 48, textAlign: 'center',
        }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}></p>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', margin: 0 }}>
            공지사항이 없어요
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {announcements.map(a => {
            const pt = PRIORITY_TONE[a.priority] || PRIORITY_TONE.normal;
            const isExpanded = expandedId === a.id;
            const dateStr = new Date(a.created_at).toLocaleString('ko-KR', {
              month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            const isNew = Date.now() - new Date(a.created_at).getTime() < 24 * 60 * 60 * 1000;

            return (
              <SummaryRow
                key={a.id}
                badge={{ text: pt.label, tone: pt.tone }}
                title={a.title}
                rightSlot={
                  <>
                    {isNew && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                        background: 'var(--red)', color: '#fff',
                        fontSize: 11, fontWeight: 700,
                      }}>NEW</span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dateStr}</span>
                  </>
                }
                expandable
                expanded={isExpanded}
                onToggle={() => setExpandedId(isExpanded ? null : a.id)}
              >
                <p style={{
                  fontSize: 15, color: 'var(--text-second)', lineHeight: 1.7,
                  margin: 0, whiteSpace: 'pre-wrap',
                }}>
                  {a.content}
                </p>
              </SummaryRow>
            );
          })}
        </div>
      )}
    </div>
  );
}
