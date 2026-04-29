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

// 시리즈명 별칭 매핑 — 카탈로그 시리즈명 → 분류 DB의 별칭 키 (일지 카운트 합산용)
// series-map.ts(분류 정규식)와 카탈로그 표기가 다를 때 발생하는 갭을 메움
const SERIES_ALIASES: Record<string, string[]> = {
  '글렌 라이브러리': ['글렌'],
  '케플러클래식': ['케플러 클래식'],
  '엘바 패밀리': ['엘바패밀리'],
  '업 모션': ['업모션'],
  '캐빈R': ['캐빈'],
  '멘디R': ['멘디'],
  '뉴트': ['뉴트 홈오피스'], // 뉴트 메인 페이지(p=54132) 안에 '뉴트 홈오피스 책상' sub
  '버튼': ['버튼스위블'], // HCH0020W는 단종이지만 캐스터/글라이드 모델(HCH0020WN/HCH0020G) 활성
};

// 카드 pumok에 맞는 sub-품목만 필터링하기 위한 키워드
// (같은 시리즈명 다중 카드 케이스에서 카드별로 sub 분리)
// 키워드 매칭이 안 맞는 케이스가 발견되면 여기 추가
const PUMOK_KEYWORDS: Record<string, string[]> = {
  '식탁': ['식탁', '테이블', '다이닝', '벤치'],
  '거실 테이블': ['테이블'],
  '거실 수납장': ['수납장', '식기장', '카페장', '진열장', '장식장', '선반장', '서랍장', '도어', 'AV장', '전시장'],
  '주방수납장': ['수납장', '식기장', '카페장'],
  '의자': ['의자', '체어', '스툴', '벤치'],
  '소파': ['소파', '리클라이너'],
  '침실': ['침실', '침대', '서랍장', '화장대', '풋보드', '가드', '옷장', '협탁'],
  '매트리스 / 토퍼': ['매트리스', '토퍼', '프로텍터', '패드'],
  '옷장': ['옷장', '드레스', '몸통', '도어'],
  '수납시리즈 / 스마티류': ['수납', '스마티', '서랍', '선반'],
  '드레스룸': ['드레스', '옷장'],
  '책상': ['책상', '데스크', '서랍'],
  '책장': ['책장', '선반', '액세서리'],
  '책상+책장': ['책상', '책장', '데스크', '선반'],
  '홈라이브러리': ['책상', '책장', '선반', '액세서리'],
  '홈 라이브러리': ['책상', '책장', '선반', '액세서리'],
};

// 검수중/완료만 우상단 뱃지 표시 (초안은 버튼 색상으로 구분되므로 뱃지 생략)
const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  reviewing: { text: '검수중', tone: 'blue' },
  final: { text: '완료', tone: 'green' },
};

// 카드 액션 버튼 — 상태별 텍스트 + 색상
const STATUS_BUTTON: Record<string, { text: string; bg: string; fg: string; border?: string }> = {
  draft: {
    text: '초안 작성 중',
    bg: 'var(--bg-hover)',
    fg: 'var(--text-tertiary)',
    border: '1px solid var(--border)',
  },
  reviewing: {
    text: '검수중 →',
    bg: 'var(--blue)',
    fg: '#fff',
  },
  final: {
    text: '완료 (편집)',
    bg: 'var(--green)',
    fg: '#fff',
  },
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

  // 같은 시리즈명을 가진 카드들의 sub 합치기 (예: 레마 식탁 + 레마 거실수납장 → 합쳐진 sub 목록)
  // 일룸 사이트가 한 페이지에 sub를 몰아놨어도, 시리즈명이 같으면 모든 sub를 공유
  const subsBySeriesName = useMemo(() => {
    const map: Record<string, Array<{ page_id: number; title: string; url: string }>> = {};
    for (const s of catalog) {
      const subs = subPagesByPid[s.page_id] || [];
      if (!map[s.series_name]) map[s.series_name] = [];
      for (const sp of subs) {
        if (!map[s.series_name].some((e) => e.page_id === sp.page_id)) {
          map[s.series_name].push(sp);
        }
      }
    }
    return map;
  }, [catalog, subPagesByPid]);

  // 같은 시리즈명 카드가 여러 개 있을 때, 카드 pumok에 맞는 sub만 분리해서 보여주는 키워드
  const subsByNameCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of catalog) {
      if (!s.is_target) continue;
      m[s.series_name] = (m[s.series_name] || 0) + 1;
    }
    return m;
  }, [catalog]);

  // sub-품목 owner 시리즈 결정용 — 카탈로그의 모든 시리즈명을 길이 내림차순 정렬
  // 'sub.title' 안에 가장 긴 시리즈명이 매칭되는 시리즈가 owner.
  // (헤이즐R 우드헤드 침대 → '헤이즐R'이 owner. '헤이즐'이 아님)
  const allSeriesNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of catalog) names.add(s.series_name);
    return Array.from(names).sort((a, b) => b.length - a.length);
  }, [catalog]);

  function findSubOwner(subTitle: string): string | null {
    for (const name of allSeriesNames) {
      if (subTitle.includes(name)) return name;
    }
    return null;
  }

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

      {/* 카테고리 시리즈 카운트 */}
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
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
                  // 일지 카운트 합산 — 슬래시 묶음(쿠시노/쿠시노코지) + SERIES_ALIASES(글렌 라이브러리 ← 글렌 등)
                  const slashAliases = s.series_name.split('/').map((x) => x.trim()).filter(Boolean);
                  const explicitAliases = SERIES_ALIASES[s.series_name] || [];
                  const allAliases = [...new Set([...slashAliases, ...explicitAliases])];
                  const noteCount = allAliases.reduce((sum, name) => sum + (noteCounts[name] || 0), 0);
                  // sub-품목 필터링 정책:
                  //   1) 같은 시리즈명의 모든 카드 sub를 합쳐서 출처로 사용 (레마처럼 사이트가 한 페이지에 묶어둔 경우 대응)
                  //   2) sub.title의 owner = 가장 긴 매칭 시리즈명 (헤이즐R 우드헤드 침대 → owner '헤이즐R', 헤이즐 카드엔 안 보임)
                  //   3) 같은 시리즈명 카드 다중 + 같은 pumok이면 pumok 키워드 + 온라인 여부로 추가 필터
                  //   4) 단종 sub 제외 — sub.title에 '단종' 키워드 들어있으면 필터링 (예: '테일러 멀티장(단종)')
                  const allSubsForName = subsBySeriesName[s.series_name] || [];
                  let subs = allSubsForName.filter((sp) => findSubOwner(sp.title) === s.series_name);
                  subs = subs.filter((sp) => !/단종/.test(sp.title));
                  if ((subsByNameCount[s.series_name] || 0) > 1) {
                    const kws = PUMOK_KEYWORDS[s.pumok];
                    if (kws) subs = subs.filter((sp) => kws.some((k) => sp.title.includes(k)));
                    const cardOnline = s.is_online_only || (s.gubun || '').includes('온라인');
                    subs = subs.filter((sp) => sp.title.includes('온라인') === cardOnline);
                  }
                  const status = ch?.status;
                  const statusBadge = status ? STATUS_LABEL[status] : null;

                  return (
                    <div
                      key={`${s.category}-${s.page_id}-${s.series_name}`}
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
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
                        </div>
                        {statusBadge && (
                          <span style={{ ...pillStyle(statusBadge.tone), flexShrink: 0 }}>{statusBadge.text}</span>
                        )}
                      </div>

                      {/* 메타 정보 — 일지 N건 · M품목 · 수정 X */}
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        일지 <strong style={{ color: 'var(--text-primary)' }}>{noteCount}</strong>건
                        {subs.length >= 2 && (
                          <>
                            {' · '}
                            <strong
                              style={{
                                color: 'var(--text-primary)',
                                borderBottom: '1px dotted var(--text-tertiary)',
                                cursor: 'help',
                              }}
                              title={subs.map((sp) => sp.title).join('\n')}
                            >
                              {subs.length}품목
                            </strong>
                          </>
                        )}
                        {ch?.updated_at && (
                          <> · 수정 {formatRelativeTime(ch.updated_at)}</>
                        )}
                      </div>

                      {/* 액션 — 상태별 색상 (draft=회색 / reviewing=파랑 / final=초록) */}
                      <div style={{ marginTop: 'auto', width: '100%' }}>
                        {ch ? (() => {
                          const btnCfg = STATUS_BUTTON[ch.status] || STATUS_BUTTON.draft;
                          return (
                            <Link
                              href={`/dashboard/textbook/${encodeURIComponent(s.series_name)}`}
                              style={{
                                height: 36,
                                padding: '0 12px',
                                borderRadius: 'var(--radius-sm)',
                                border: btnCfg.border || '1px solid transparent',
                                background: btnCfg.bg,
                                color: btnCfg.fg,
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxSizing: 'border-box',
                                width: '100%',
                                textDecoration: 'none',
                              }}
                            >
                              {btnCfg.text}
                            </Link>
                          );
                        })() : (
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
