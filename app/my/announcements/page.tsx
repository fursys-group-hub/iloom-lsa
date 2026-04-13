'use client';

import { useState, useEffect, useCallback } from 'react';

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
  created_at: string;
}

const PRIORITY_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  normal: { color: 'var(--blue-light)', bg: 'var(--blue-dim)', label: '공지' },
  important: { color: 'var(--orange)', bg: 'var(--orange-dim)', label: '중요' },
  urgent: { color: 'var(--red)', bg: 'var(--red-dim)', label: '긴급' },
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
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
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
            const ps = PRIORITY_STYLE[a.priority] || PRIORITY_STYLE.normal;
            const isExpanded = expandedId === a.id;
            const dateStr = new Date(a.created_at).toLocaleString('ko-KR', {
              month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            // 최근 24시간 이내면 NEW 뱃지
            const isNew = Date.now() - new Date(a.created_at).getTime() < 24 * 60 * 60 * 1000;

            return (
              <div
                key={a.id}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}
                  style={{
                    padding: '16px 20px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                      background: ps.bg, color: ps.color,
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>
                      {ps.label}
                    </span>
                    <span style={{
                      fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {a.title}
                    </span>
                    {isNew && (
                      <span style={{
                        padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                        background: 'var(--red)', color: '#fff',
                        fontSize: 10, fontWeight: 700, flexShrink: 0,
                      }}>NEW</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dateStr}</span>
                    <span style={{
                      fontSize: 14, color: 'var(--text-muted)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease', display: 'inline-block',
                    }}>▾</span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{
                    padding: '16px 20px 20px', borderTop: '1px solid var(--border)',
                  }}>
                    <p style={{
                      fontSize: 15, color: 'var(--text-second)', lineHeight: 1.7,
                      margin: 0, whiteSpace: 'pre-wrap',
                    }}>
                      {a.content}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
