'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

interface CatalogSeries {
  series_name: string;
  url: string;
  page_id: number;
  category: string;
  pumok: string;
  gubun: string;
  label: string;
  is_discontinued: boolean;
  is_online_only: boolean;
  is_new_2025: boolean;
  is_new_2026: boolean;
  is_old_version: boolean;
  is_new_version: boolean;
  is_target: boolean;
  extra_label?: string;
}

interface Chapter {
  id: string;
  series_name: string;
  category: string | null;
  status: 'draft' | 'reviewing' | 'final';
  generated_at: string | null;
  updated_at: string;
}

const CATEGORY_ORDER = ['리빙룸', '다이닝룸', '침실·옷장', '키즈룸·틴즈룸', '워크룸·멀티룸'];

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  draft: { text: '초안', tone: 'blue' },
  reviewing: { text: '검수중', tone: 'orange' },
  final: { text: '완료', tone: 'green' },
};

const TONE_BG: Record<string, string> = {
  blue: 'var(--blue-dim)',
  orange: 'var(--orange-dim)',
  green: 'var(--green-dim)',
  purple: 'var(--purple-dim)',
  gray: 'var(--bg-hover)',
};
const TONE_FG: Record<string, string> = {
  blue: 'var(--blue)',
  orange: 'var(--orange)',
  green: 'var(--green)',
  purple: 'var(--purple)',
  gray: 'var(--text-tertiary)',
};

export default function TextbookPage() {
  const [catalog, setCatalog] = useState<CatalogSeries[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const [subPagesByPid, setSubPagesByPid] = useState<Record<number, Array<{ page_id: number; title: string; url: string }>>>({});
  const [activeCat, setActiveCat] = useState<string>('리빙룸');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [collapsedPumok, setCollapsedPumok] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string>('');

  // localStorage에서 숨긴 시리즈 page_id + 접힌 품목 그룹 불러오기
  useEffect(() => {
    try {
      const raw = localStorage.getItem('iloom-textbook-hidden-pages');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setHidden(new Set(arr.filter((x) => typeof x === 'number')));
      }
    } catch {}
    try {
      const raw = localStorage.getItem('iloom-textbook-collapsed-pumok');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setCollapsedPumok(new Set(arr.filter((x) => typeof x === 'string')));
      }
    } catch {}
  }, []);

  // 첫 방문 시 — 카테고리별 1위 외 모든 품목 그룹은 기본 접힘
  // (사용자가 한 번이라도 토글하면 -init 마커가 'done'으로 바뀌어 재계산 안 함)
  useEffect(() => {
    if (catalog.length === 0) return;
    if (localStorage.getItem('iloom-textbook-collapsed-pumok-init') === 'done') return;

    const grouped: Record<string, Record<string, number>> = {};
    for (const s of catalog) {
      if (!s.is_target) continue;
      const cat = s.category;
      const pumok = s.pumok || '기타';
      if (!grouped[cat]) grouped[cat] = {};
      grouped[cat][pumok] = (grouped[cat][pumok] || 0) + 1;
    }

    const defaultCollapsed = new Set<string>();
    for (const cat of Object.keys(grouped)) {
      const sorted = Object.entries(grouped[cat]).sort((a, b) => b[1] - a[1]);
      for (let i = 1; i < sorted.length; i++) {
        defaultCollapsed.add(`${cat}::${sorted[i][0]}`);
      }
    }

    setCollapsedPumok(defaultCollapsed);
    localStorage.setItem('iloom-textbook-collapsed-pumok', JSON.stringify([...defaultCollapsed]));
    localStorage.setItem('iloom-textbook-collapsed-pumok-init', 'done');
  }, [catalog]);

  function togglePumok(category: string, pumok: string) {
    const key = `${category}::${pumok}`;
    const next = new Set(collapsedPumok);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedPumok(next);
    localStorage.setItem('iloom-textbook-collapsed-pumok', JSON.stringify(Array.from(next)));
  }

  function hideSeries(s: CatalogSeries) {
    if (!confirm(`"${s.series_name}" 카드를 숨기시겠어요? 부속품/프로텍터 등 별도 시리즈가 아닌 항목을 정리할 때 사용하세요. (브라우저에 저장되며 언제든 복구 가능)`)) return;
    const next = new Set(hidden);
    next.add(s.page_id);
    setHidden(next);
    localStorage.setItem('iloom-textbook-hidden-pages', JSON.stringify(Array.from(next)));
    setToast(`"${s.series_name}" 카드 숨김. (총 ${next.size}개 숨김)`);
  }

  function restoreAllHidden() {
    if (hidden.size === 0) return;
    if (!confirm(`숨긴 카드 ${hidden.size}개를 모두 복구하시겠어요?`)) return;
    setHidden(new Set());
    localStorage.removeItem('iloom-textbook-hidden-pages');
    setToast('모든 숨긴 카드 복구됨');
  }

  async function reload() {
    const [chRes, catRes] = await Promise.all([
      fetch('/api/textbook').then((r) => r.json()),
      fetch('/api/textbook/catalog').then((r) => r.json()),
    ]);
    setChapters(chRes.chapters || []);
    setNoteCounts(chRes.note_counts || {});
    setSubPagesByPid(chRes.sub_pages_by_pid || {});
    setCatalog(catRes.list || []);
  }

  useEffect(() => {
    reload();
  }, []);

  const seriesByCategory = useMemo(() => {
    const grouped: Record<string, CatalogSeries[]> = {};
    for (const cat of CATEGORY_ORDER) grouped[cat] = [];
    for (const s of catalog) {
      if (hidden.has(s.page_id)) continue; // 사용자가 숨긴 시리즈 제외
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    }
    return grouped;
  }, [catalog, hidden]);

  // 같은 카테고리의 품목/구분 그룹핑 (소파 > 리클라이너 / 모듈 / 베이직)
  const groupedByPumokGubun = useMemo(() => {
    const groups: Record<string, Record<string, CatalogSeries[]>> = {};
    const list = seriesByCategory[activeCat] || [];
    for (const s of list) {
      const pumok = s.pumok || '기타';
      const gubun = s.gubun || '-';
      if (!groups[pumok]) groups[pumok] = {};
      if (!groups[pumok][gubun]) groups[pumok][gubun] = [];
      groups[pumok][gubun].push(s);
    }
    return groups;
  }, [seriesByCategory, activeCat]);

  const chapterMap = useMemo(() => {
    const m = new Map<string, Chapter>();
    for (const c of chapters) m.set(c.series_name, c);
    return m;
  }, [chapters]);

  async function runClassify() {
    if (busy) return;
    if (!confirm('전체 일지를 시리즈별로 자동 분류합니다 (정규식 매칭, 5초 안에 끝남). 진행할까요?')) return;
    setBusy('분류 중...');
    try {
      const res = await fetch('/api/textbook/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '분류 실패');
      setToast(
        `분류 완료\n` +
        `총 ${data.processed_notes}개 일지 처리\n` +
        `매칭됨: ${data.regex_matched}건 / 매칭 없음: ${data.regex_unmatched}건\n` +
        `(노트, 시리즈) 쌍: ${data.classified_pairs}건`
      );
      await reload();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generateDrafts() {
    if (busy) return;
    if (selected.size === 0) {
      setToast('초안을 생성할 시리즈를 카드 체크박스로 선택하세요.');
      return;
    }
    if (!confirm(`선택한 ${selected.size}개 시리즈의 초안을 생성합니다. 진행할까요?`)) return;
    setBusy('초안 생성 중...');
    const list = Array.from(selected);
    const results: string[] = [];
    for (let i = 0; i < list.length; i += 5) {
      const chunk = list.slice(i, i + 5);
      const settled = await Promise.allSettled(
        chunk.map((s) =>
          fetch('/api/textbook/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ series_name: s, force: true }),
          }).then(async (r) => {
            const d = await r.json();
            if (!r.ok) throw new Error(`${s}: ${d.message || r.statusText}`);
            return `${s}: OK`;
          }),
        ),
      );
      for (const r of settled) {
        results.push(r.status === 'fulfilled' ? r.value : `실패: ${(r.reason as Error).message}`);
      }
    }
    setToast(`초안 생성 결과:\n${results.join('\n')}`);
    setSelected(new Set());
    await reload();
    setBusy(null);
  }

  function toggleSelect(series: string) {
    const next = new Set(selected);
    if (next.has(series)) next.delete(series);
    else next.add(series);
    setSelected(next);
  }

  function selectAllInCategory() {
    const next = new Set(selected);
    for (const s of seriesByCategory[activeCat] || []) next.add(s.series_name);
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const stats = useMemo(() => {
    return {
      total: catalog.length,
      drafted: chapters.length,
      final: chapters.filter((c) => c.status === 'final').length,
      totalNotes: Object.values(noteCounts).reduce((a, b) => a + b, 0),
    };
  }, [catalog, chapters, noteCounts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>통합 교재</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {hidden.size > 0 && (
            <button onClick={restoreAllHidden} disabled={!!busy} style={btnGhost} title="숨긴 카드 모두 복구">
              숨긴 카드 복구 ({hidden.size})
            </button>
          )}
          <button onClick={runClassify} disabled={!!busy} style={btnGhost}>
            전체 일지 분류
          </button>
          <button onClick={generateDrafts} disabled={!!busy || selected.size === 0} style={btnPrimary}>
            선택 초안 생성 ({selected.size})
          </button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatBox label="판매 시리즈" value={stats.total} unit="개" />
        <StatBox label="분류된 일지" value={stats.totalNotes} unit="건" accent="blue" />
        <StatBox label="초안 작성됨" value={stats.drafted} unit="개" accent="orange" />
        <StatBox label="검수 완료" value={stats.final} unit="개" accent="green" />
      </div>

      {/* 카테고리 탭 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {CATEGORY_ORDER.map((cat, i) => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            style={{
              padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,
              background: 'transparent',
              color: activeCat === cat ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none',
              borderBottom: activeCat === cat ? '2px solid var(--blue)' : '2px solid transparent',
              fontSize: 15,
              fontWeight: activeCat === cat ? 600 : 400,
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {cat} ({(seriesByCategory[cat] || []).length})
          </button>
        ))}
      </div>

      {/* 다중 선택 도구 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
        <button onClick={selectAllInCategory} style={btnText}>이 카테고리 전체 선택</button>
        <span>·</span>
        <button onClick={clearSelection} style={btnText}>선택 해제</button>
        <span style={{ marginLeft: 'auto' }}>{busy ?? `${(seriesByCategory[activeCat] || []).length}개 시리즈`}</span>
      </div>

      {/* 품목 > 구분 > 시리즈 그룹핑 — 품목 헤더 클릭으로 접기/펼치기 */}
      {Object.entries(groupedByPumokGubun).map(([pumok, gubunMap]) => {
        const collapseKey = `${activeCat}::${pumok}`;
        const isCollapsed = collapsedPumok.has(collapseKey);
        const totalCount = Object.values(gubunMap).reduce((sum, items) => sum + items.length, 0);
        return (
        <div key={pumok} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button
            onClick={() => togglePumok(activeCat, pumok)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '4px 0',
              margin: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              textAlign: 'left',
            }}
            title={isCollapsed ? '펼치기' : '접기'}
          >
            <span style={{ display: 'inline-block', width: 12, fontSize: 11, color: 'var(--text-tertiary)', transition: 'transform 0.15s ease' }}>
              {isCollapsed ? '▶' : '▼'}
            </span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{pumok}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-tertiary)' }}>({totalCount})</span>
          </button>
          {!isCollapsed && Object.entries(gubunMap).map(([gubun, items]) => (
            <div key={gubun} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gubun !== '-' && (
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-second)' }}>
                  {gubun} ({items.length})
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {items.map((s) => {
                  const ch = chapterMap.get(s.series_name);
                  // '쿠시노/쿠시노코지', '미엘/미엘갤러리'처럼 슬래시 묶음은 별칭별로 합산
                  const aliases = s.series_name.split('/').map((x) => x.trim()).filter(Boolean);
                  const noteCount = aliases.reduce((sum, name) => sum + (noteCounts[name] || 0), 0);
                  const isSelected = selected.has(s.series_name);
                  const status = ch?.status;
                  const statusBadge = status ? STATUS_LABEL[status] : null;

                  return (
                    <div
                      key={`${s.category}-${s.page_id}-${s.series_name}`}
                      style={{
                        background: 'var(--bg-surface)',
                        border: isSelected ? '2px solid var(--blue)' : '1px solid var(--border)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 16,
                        boxShadow: 'var(--shadow-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        position: 'relative',
                      }}
                    >
                      {/* 카드 숨김 버튼 (우상단, hover 시 표시) */}
                      <button
                        onClick={(e) => { e.stopPropagation(); hideSeries(s); }}
                        title="이 카드 숨기기 (부속품/프로텍터 등 정리용)"
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 22,
                          height: 22,
                          padding: 0,
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          fontSize: 16,
                          lineHeight: 1,
                          cursor: 'pointer',
                          borderRadius: 4,
                          opacity: 0.4,
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--red)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        ×
                      </button>
                      {/* 시리즈명 + 온라인 뱃지(가이드링크) + 검수 상태 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(s.series_name)}
                            style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                          />
                          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.series_name}
                          </span>
                          {s.extra_label && (
                            <span style={pillStyle('gray')}>{s.extra_label}</span>
                          )}
                          {s.is_online_only && (
                            <span style={pillStyle('purple')}>온라인</span>
                          )}
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              flexShrink: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 20,
                              height: 20,
                              fontSize: 12,
                              color: 'var(--text-muted)',
                              textDecoration: 'none',
                              borderRadius: 4,
                              lineHeight: 1,
                            }}
                            title="일룸 가이드 사이트 열기"
                          >
                            ↗
                          </a>
                        </label>
                        {statusBadge && (
                          <span style={{ ...pillStyle(statusBadge.tone), flexShrink: 0 }}>{statusBadge.text}</span>
                        )}
                      </div>

                      {/* 메타 정보 */}
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        일지 <strong style={{ color: 'var(--text-primary)' }}>{noteCount}</strong>건
                        {ch?.updated_at && (
                          <> · 수정 {formatRelativeTime(ch.updated_at)}</>
                        )}
                      </div>

                      {/* sub-품목 (있을 때만, hover로 전체 리스트) */}
                      {(() => {
                        const subs = subPagesByPid[s.page_id] || [];
                        if (subs.length === 0) return null;
                        return (
                          <div
                            title={subs.map((sp) => sp.title).join('\n')}
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: 'var(--text-second)',
                              padding: '4px 8px',
                              background: 'var(--bg-main)',
                              borderRadius: 'var(--radius-sm)',
                              alignSelf: 'flex-start',
                            }}
                          >
                            {subs.length}품목
                          </div>
                        );
                      })()}

                      {/* 액션 — 두 버튼 정확히 동일 사이즈 (wrapper로 감쌈) */}
                      <div style={{ marginTop: 'auto', width: '100%' }}>
                        {ch ? (
                          <Link
                            href={`/dashboard/textbook/${encodeURIComponent(s.series_name)}`}
                            style={{ ...btnPrimarySm, width: '100%', textDecoration: 'none' }}
                          >
                            검수 / 편집 →
                          </Link>
                        ) : (
                          <div style={{ ...btnGhostSm, width: '100%', color: 'var(--text-muted)' }}>
                            초안 없음
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        );
      })}

      {/* 토스트 */}
      {toast && (
        <div
          onClick={() => setToast('')}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            maxWidth: 480,
            padding: '16px 20px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            fontSize: 14,
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
            cursor: 'pointer',
            zIndex: 100,
            lineHeight: 1.5,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, unit, accent }: { label: string; value: number; unit?: string; accent?: string }) {
  const color = accent ? `var(--${accent})` : 'var(--text-primary)';
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, marginTop: 4 }}>
        {value.toLocaleString()}
        {unit && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

function pillStyle(tone: string): React.CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 11,
    fontWeight: 600,
    background: TONE_BG[tone] || 'var(--bg-hover)',
    color: TONE_FG[tone] || 'var(--text-tertiary)',
    whiteSpace: 'nowrap',
  };
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '?';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const btnGhost: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};
const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'var(--blue)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
const btnGhostSm: React.CSSProperties = {
  height: 36,
  padding: '0 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
};
const btnPrimarySm: React.CSSProperties = {
  height: 36,
  padding: '0 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid transparent',
  background: 'var(--blue)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
};
const btnText: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};
