'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface Chapter {
  id: string;
  series_name: string;
  category: string | null;
  status: string;
  html_content: string;
  generated_at: string | null;
  updated_at: string;
}

function PrintContent() {
  const sp = useSearchParams();
  const series = sp.get('series');
  const all = sp.get('all') === '1';
  const finalOnly = sp.get('final') === '1';

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (series) {
        const res = await fetch(`/api/textbook?series=${encodeURIComponent(series)}`).then((r) => r.json());
        setChapters(res.chapter ? [res.chapter] : []);
      } else {
        const res = await fetch('/api/textbook').then((r) => r.json());
        let list: Chapter[] = res.chapters || [];
        if (finalOnly) list = list.filter((c) => c.status === 'final');
        setChapters(list);
      }
      setLoading(false);
    }
    load();
  }, [series, all, finalOnly]);

  if (loading) {
    return <div style={{ padding: 40 }}>불러오는 중...</div>;
  }

  if (chapters.length === 0) {
    return <div style={{ padding: 40 }}>표시할 챕터가 없습니다.</div>;
  }

  return (
    <div className="print-root">
      <style jsx global>{`
        /* 16:9 가로 슬라이드 (PowerPoint 표준 사이즈 13.333×7.5 inch = 1920×1080 비율) */
        @page {
          size: 13.333in 7.5in landscape;
          margin: 0.4in 0.5in;
        }
        html, body {
          background: #fff;
          margin: 0;
          padding: 0;
          font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #1C1C1E;
          font-size: 10pt;
          line-height: 1.55;
        }
        /* dashboard layout 덮어버리기 */
        .print-root {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #fff;
          overflow-y: auto;
          padding: 24px;
        }
        @media print {
          /* 모든 요소 안 보이게 */
          html, body { visibility: hidden !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          /* print-root만 다시 보이게 */
          .print-root, .print-root * { visibility: visible !important; }
          /* print-root를 페이지 좌상단부터 그리도록 */
          .print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
            overflow: visible !important;
            z-index: 0 !important;
          }
        }
        /* 본문 안의 주요 단위가 페이지 안에서 잘리지 않도록 */
        @media print {
          .chapter-body section,
          .chapter-body table,
          .chapter-body blockquote,
          .chapter-body .alert-note,
          .chapter-body figure {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .chapter-body section {
            page-break-before: auto;
          }
          /* 각 주요 섹션 시작 전에 새 페이지 (h2 기준) */
          .chapter-body h2 {
            page-break-before: always;
            break-before: page;
          }
          .chapter-body section:first-of-type h2,
          .chapter-body h2:first-of-type {
            page-break-before: auto;
            break-before: auto;
          }
        }
        .cover {
          text-align: center;
          padding: 60px 0 30px;
          page-break-after: always;
          height: 6.5in;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        .cover-title {
          font-size: 56pt;
          font-weight: 800;
          margin: 0 0 16px;
          letter-spacing: -0.03em;
        }
        .cover-subtitle {
          font-size: 20pt;
          color: #6B7280;
          margin: 0 0 60px;
        }
        .cover-meta {
          font-size: 12pt;
          color: #6B7280;
          margin-top: auto;
        }
        .toc {
          page-break-after: always;
          padding-top: 24px;
        }
        .toc-title {
          font-size: 22pt;
          font-weight: 700;
          margin-bottom: 24px;
          padding-bottom: 12px;
          border-bottom: 2px solid #1C1C1E;
        }
        .toc-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px dotted #ccc;
          font-size: 12pt;
        }
        .toc-item-cat {
          color: #6B7280;
          font-size: 10pt;
          margin-right: 12px;
        }
        .chapter {
          page-break-before: always;
          padding-top: 8px;
        }
        .chapter:first-of-type {
          page-break-before: auto;
        }
        .chapter-header {
          margin-bottom: 16px;
          padding-bottom: 10px;
          border-bottom: 2px solid #1C1C1E;
        }
        .chapter-cat {
          font-size: 10pt;
          color: #6B7280;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .chapter-title {
          font-size: 32pt;
          font-weight: 800;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .chapter-body section {
          margin-bottom: 24px;
          page-break-inside: avoid;
        }
        .chapter-body h2 {
          font-size: 16pt;
          font-weight: 700;
          margin: 24px 0 12px;
          padding-bottom: 6px;
          border-bottom: 1px solid #ccc;
          letter-spacing: -0.01em;
        }
        .chapter-body h3 {
          font-size: 13pt;
          font-weight: 700;
          margin: 16px 0 8px;
        }
        .chapter-body p {
          margin: 8px 0;
        }
        .chapter-body ul, .chapter-body ol {
          padding-left: 24px;
          margin: 8px 0;
        }
        .chapter-body li {
          margin: 4px 0;
        }
        .chapter-body blockquote {
          margin: 12px 0;
          padding: 12px 16px;
          background: #F7F8FA;
          border-left: 3px solid #3B82F6;
          font-style: italic;
        }
        .chapter-body cite {
          color: #6B7280;
          font-size: 9pt;
          font-style: normal;
          margin-left: 4px;
        }
        .chapter-body cite.source-pptx {
          color: #A855F7;
        }
        .chapter-body strong {
          font-weight: 700;
        }
        @media print {
          .no-print { display: none !important; }
          /* 인쇄에서는 width 제한 해제 */
          .cover, .toc, .chapter {
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            min-height: auto !important;
          }
        }
        @media screen {
          .print-root {
            background: #E5E7EB;
            padding: 24px 0;
          }
          /* 화면 미리보기는 16:9 비율 카드로 (1280×720) */
          .cover, .toc, .chapter {
            background: #fff;
            width: 1280px;
            min-height: 720px;
            margin: 0 auto 24px;
            padding: 48px 64px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.12);
            border-radius: 6px;
            box-sizing: border-box;
          }
        }
      `}</style>

      {/* 인쇄 안내 (화면에서만) */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, zIndex: 100 }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: '#3B82F6',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          🖨️ PDF로 저장 (Ctrl+P)
        </button>
      </div>

      {/* 표지 */}
      <div className="cover">
        <h1 className="cover-title">
          {chapters.length === 1 ? chapters[0].series_name : '일룸 LSA 통합 교재'}
        </h1>
        <p className="cover-subtitle">
          {chapters.length === 1 ? `${chapters[0].category} 시리즈` : `시리즈별 통합 교재 (${chapters.length}개 챕터)`}
        </p>
        <div className="cover-meta">
          교육생 일지 · 기존 PPT 자료 통합<br />
          출력일: {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* 목차 (전체 출력일 때만) */}
      {chapters.length > 1 && (
        <div className="toc">
          <h2 className="toc-title">목차</h2>
          {chapters.map((c, i) => (
            <div key={c.id} className="toc-item">
              <span>
                <span className="toc-item-cat">[{c.category || '기타'}]</span>
                <strong>{i + 1}. {c.series_name}</strong>
              </span>
              <span style={{ color: '#6B7280', fontSize: '10pt' }}>{c.status === 'final' ? '완료' : '초안'}</span>
            </div>
          ))}
        </div>
      )}

      {/* 챕터들 */}
      {chapters.map((c) => (
        <div key={c.id} className="chapter">
          <div className="chapter-header">
            <div className="chapter-cat">{c.category || '기타'}</div>
            <h1 className="chapter-title">{c.series_name}</h1>
          </div>
          <div className="chapter-body" dangerouslySetInnerHTML={{ __html: c.html_content || '' }} />
        </div>
      ))}
    </div>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>불러오는 중...</div>}>
      <PrintContent />
    </Suspense>
  );
}
