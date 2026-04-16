// PrintCard 렌더링에 필요한 공유 스타일 (ReportsClient / ManagerReportsClient 둘 다 사용)
export function ReportStyles() {
  return (
    <style>{`
        /* ── 인쇄 전용 영역: 화면에서 숨김 ── */
        .print-only { display: none; }

        /* ── 체크리스트 테이블 ── */
        .rpt-table { width: 100%; border-collapse: collapse; font-size: inherit; }
        .rpt-table th { text-align: left; font-weight: 700; padding: 4px 6px; border-bottom: 2px solid #1D4ED8; font-size: 0.95em; color: #1D4ED8; white-space: nowrap; }
        .rpt-table td { padding: 3px 6px; border-bottom: 1px solid #E5E7EB; vertical-align: top; }
        .rpt-table td:nth-child(1),
        .rpt-table td:nth-child(2),
        .rpt-table td:nth-child(3),
        .rpt-table td:nth-child(4) { white-space: nowrap; }
        .rpt-table tr.row-x { background: #FEF2F2; }
        .rpt-table tr.row-tri { background: #FFFBEB; }
        .rpt-table tr:last-child td { border-bottom: none; }

        /* ── 오답 카드 ── */
        .rpt-wrong-list { display: flex; flex-direction: column; gap: 8px; }
        .rpt-wrong-card { padding: 8px 10px; border-radius: 6px; background: #F9FAFB; border: 1px solid #E5E7EB; }
        .rpt-wrong-q { font-weight: 600; margin-bottom: 4px; line-height: 1.4; }
        .rpt-wrong-opts { font-size: 0.9em; color: #6B7280; margin-bottom: 4px; line-height: 1.35; }
        .rpt-wrong-answers { display: flex; flex-direction: column; gap: 2px; }
        .rpt-wrong-x { color: #DC2626; font-size: 0.9em; }
        .rpt-wrong-o { color: #059669; font-size: 0.9em; font-weight: 600; }
        .rpt-wrong-explain { font-size: 0.85em; color: #2563EB; margin-top: 3px; padding: 3px 6px; background: #EFF6FF; border-radius: 4px; }
        .rpt-wrong-meta { font-size: 0.8em; color: #9CA3AF; margin-top: 2px; }
        .rpt-wrong-more { text-align: center; color: #6B7280; font-size: 0.85em; padding: 4px; }
        .rpt-empty { color: #9CA3AF; font-size: 0.9em; }

        /* ── 차시별 바 차트 ── */
        .rpt-chart { margin-top: 8px; }
        .rpt-chart-header { font-size: 0.85em; font-weight: 600; color: #6B7280; margin-bottom: 4px; }
        .rpt-chart-row { display: flex; align-items: center; gap: 4px; height: 18px; margin-bottom: 2px; }
        .rpt-chart-label { width: 28px; font-size: 10px; font-weight: 600; color: #6B7280; text-align: right; flex-shrink: 0; }
        .rpt-chart-bar-wrap { flex: 1; height: 14px; background: #F3F4F6; border-radius: 3px; position: relative; overflow: hidden; }
        .rpt-chart-bar { height: 100%; border-radius: 3px; transition: width 0.3s; }
        .rpt-chart-avg-line { position: absolute; top: 0; bottom: 0; width: 1.5px; background: #9CA3AF; z-index: 1; }
        .rpt-chart-score { width: 24px; font-size: 10px; font-weight: 700; color: #374151; text-align: right; flex-shrink: 0; }
        .rpt-chart-gap { width: 30px; font-size: 10px; font-weight: 700; text-align: right; flex-shrink: 0; }
        .gap-pos { color: #059669; }
        .gap-neg { color: #DC2626; }
        .bar-great { background: #22C55E; }
        .bar-good { background: #60A5FA; }
        .bar-warn { background: #F59E0B; }
        .bar-bad { background: #EF4444; }

        /* ── 볼드 + 형광펜 ── */
        .rpt-bold { font-weight: 700; }
        .rpt-highlight { background: linear-gradient(transparent 40%, #FDE68A 40%); padding: 0 2px; font-weight: 600; }

        /* ── 텍스트 리스트 ── */
        .rpt-text { display: flex; flex-direction: column; gap: 2px; }
        .rpt-li { padding-left: 8px; }

        /* ── 기본 뷰: 다크모드에서도 카드 형태 ── */
        .print-card {
          background: var(--bg-surface);
          color: var(--text-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 24px 28px;
          margin-bottom: 8px;
        }
        .print-header { border-bottom-color: var(--blue) !important; }
        .print-section-title { color: var(--blue-light) !important; border-bottom-color: var(--border) !important; }
        .print-section-content { color: var(--text-second) !important; }
        .rpt-table th { color: var(--blue-light) !important; border-bottom-color: var(--blue) !important; }
        .rpt-table td { border-bottom-color: var(--border) !important; color: var(--text-second) !important; }
        .rpt-table tr.row-x { background: var(--red-dim) !important; }
        .rpt-table tr.row-tri { background: var(--orange-dim) !important; }
        .rpt-wrong-card { background: var(--bg-elevated) !important; border-color: var(--border) !important; }
        .rpt-wrong-explain { background: var(--blue-dim) !important; color: var(--blue-light) !important; }
        .rpt-chart-bar-wrap { background: var(--bg-hover) !important; }
        .rpt-feedback { color: var(--text-second) !important; }

        /* ── 기본 뷰의 헤더/아바타/태그/body (이전에는 @media print 안에만 정의되어 화면에서 스타일 없음) ── */
        .print-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2.5px solid #1D4ED8;
          padding-bottom: 10px;
          margin-bottom: 14px;
        }
        .print-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: var(--blue-dim);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
        }
        .print-name { font-size: 20px; font-weight: 800; color: var(--text-primary); }
        .print-store { font-size: 13px; color: var(--text-tertiary); margin-top: 2px; }
        .print-meta { display: flex; gap: 6px; flex-wrap: wrap; }
        .tag { padding: 2px 8px; border-radius: 99px; font-size: 12px; font-weight: 600; }
        .tag-green { background: var(--green-dim); color: var(--green); }
        .tag-red { background: var(--red-dim); color: var(--red); }
        .print-body {
          display: grid;
          grid-template-columns: 2fr 3fr;
          column-gap: 28px;
          gap: 20px;
          font-size: 14px;
          line-height: 1.6;
        }
        .print-col { display: flex; flex-direction: column; gap: 14px; }
        .print-col:last-child { border-left: 1.5px solid var(--border); padding-left: 24px; }
        .print-section-title {
          font-size: 14px; font-weight: 700;
          border-bottom: 1px solid var(--border);
          padding-bottom: 4px; margin-bottom: 6px;
        }
        .print-section-content { font-size: 13px; line-height: 1.55; }

        /* ── 인쇄 미리보기 (A4 흰색 - 라이트모드 강제) ── */
        .print-preview-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .print-preview-container .print-card {
          background: #fff !important;
          color: #1a1a1a !important;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 32px 40px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        }
        /* 미리보기 내부 모든 텍스트 검은색 */
        .print-preview-container .print-card * { color: #1a1a1a; }
        .print-preview-container .print-name { color: #1a1a1a !important; font-size: 20px !important; }
        .print-preview-container .print-store { color: #6B7280 !important; }
        .print-preview-container .print-header { border-bottom-color: #1D4ED8 !important; }
        .print-preview-container .print-section-title { color: #1D4ED8 !important; border-bottom-color: #E5E7EB !important; }
        .print-preview-container .rpt-feedback { color: #374151 !important; }
        .print-preview-container .rpt-text, .print-preview-container .rpt-text * { color: #374151 !important; }
        .print-preview-container .rpt-li { color: #374151 !important; }
        .print-preview-container .rpt-practice-section { border-top-color: #D1D5DB !important; }
        .print-preview-container .rpt-practice-header { color: #1D4ED8 !important; }
        .print-preview-container .rpt-practice-stats { background: #F0F4FF !important; color: #374151 !important; }
        .print-preview-container .rpt-practice-item { color: #374151 !important; }
        .print-preview-container .rpt-practice-item::before { color: #1D4ED8 !important; }
        /* 테이블 */
        .print-preview-container .rpt-table th { color: #1D4ED8 !important; border-bottom-color: #1D4ED8 !important; }
        .print-preview-container .rpt-table td { color: #374151 !important; border-bottom-color: #E5E7EB !important; }
        .print-preview-container .rpt-table tr.row-x { background: #FEF2F2 !important; }
        .print-preview-container .rpt-table tr.row-tri { background: #FFFBEB !important; }
        /* 차트 */
        .print-preview-container .rpt-chart-label { color: #6B7280 !important; }
        .print-preview-container .rpt-chart-score { color: #374151 !important; }
        .print-preview-container .rpt-chart-header { color: #6B7280 !important; }
        .print-preview-container .gap-pos { color: #059669 !important; }
        .print-preview-container .gap-neg { color: #DC2626 !important; }
        .print-preview-container .rpt-chart-bar-wrap { background: #F3F4F6 !important; }
        .print-preview-container .rpt-chart-avg-line { background: #9CA3AF !important; }
        /* 오답 */
        .print-preview-container .rpt-wrong-card { background: #F9FAFB !important; border-color: #E5E7EB !important; }
        .print-preview-container .rpt-wrong-q { color: #1a1a1a !important; }
        .print-preview-container .rpt-wrong-opts { color: #6B7280 !important; }
        .print-preview-container .rpt-wrong-x { color: #DC2626 !important; }
        .print-preview-container .rpt-wrong-o { color: #059669 !important; }
        .print-preview-container .rpt-wrong-meta { color: #9CA3AF !important; }
        .print-preview-container .rpt-wrong-explain { background: #EFF6FF !important; color: #1D4ED8 !important; }
        .print-preview-container .rpt-wrong-more { color: #6B7280 !important; }
        /* 태그 */
        .print-preview-container .tag-green { color: #059669 !important; background: #ECFDF5 !important; }
        .print-preview-container .tag-red { color: #DC2626 !important; background: #FEF2F2 !important; }
        .print-preview-container .print-avatar { background: #EFF6FF !important; }

        /* ── @media print ── */
        @media print {
          .no-print, nav, aside, header, [class*="sidebar"], [class*="Sidebar"], button, select,
          [style*="position: fixed"] { display: none !important; }
          .print-only { display: block !important; }

          @page { size: A4 landscape; margin: 8mm 12mm; }

          /* html/body 전체 흰색 (마진 영역까지) */
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #fff !important;
          }

          /* 모든 배경 흰색 강제 */
          *, *::before, *::after { background: #fff !important; }
          body, html { background: #fff !important; }

          /* 레이아웃 래퍼 전부 흰 배경 + 전체 너비 강제 */
          body > div, #__next, [style*="min-height"], [style*="background"],
          main, [class*="layout"], [class*="Layout"] {
            background: #fff !important;
            color: #1a1a1a !important;
          }
          /* 사이드바 마진/패딩 제거 → 전체 너비 */
          body > div > div, [style*="margin-left"], [style*="padding-left"],
          [style*="max-width"], [style*="maxWidth"] {
            margin-left: 0 !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }

          body { font-family: 'Pretendard', -apple-system, sans-serif !important; }

          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          .rpt-table tr.row-x { background: #FEF2F2 !important; }
          .rpt-table tr.row-tri { background: #FFFBEB !important; }
          .rpt-wrong-card { background: #F9FAFB !important; }
          .rpt-wrong-explain { background: #EFF6FF !important; }
          .rpt-chart-bar-wrap { background: #F3F4F6 !important; }
          .bar-great { background: #22C55E !important; }
          .bar-good { background: #60A5FA !important; }
          .bar-warn { background: #F59E0B !important; }
          .bar-bad { background: #EF4444 !important; }
          .tag-green { background: #ECFDF5 !important; }
          .tag-red { background: #FEF2F2 !important; }
          .print-avatar { background: #EFF6FF !important; }

          .print-card {
            page-break-after: always;
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
            border: none !important;
            border-radius: 0 !important;
            width: 100% !important;
          }

          .print-card, .print-card * { color: #1a1a1a !important; }
          .print-card .print-name { color: #1a1a1a !important; font-size: 18pt !important; }
          .print-card .print-store { color: #6B7280 !important; }
          .print-card .print-header { border-bottom: 2.5px solid #1D4ED8 !important; }
          .print-card .print-section-title { color: #1D4ED8 !important; }
          .print-card .rpt-feedback { color: #374151 !important; }
          .print-card .rpt-text, .print-card .rpt-text * { color: #374151 !important; }
          .print-card .rpt-li { color: #374151 !important; }

          .print-card .tag-green { color: #059669 !important; background: #ECFDF5 !important; }
          .print-card .tag-red { color: #DC2626 !important; background: #FEF2F2 !important; }

          .print-card .rpt-chart-label { color: #6B7280 !important; }
          .print-card .rpt-chart-score { color: #374151 !important; }
          .print-card .rpt-chart-header { color: #6B7280 !important; }
          .print-card .gap-pos { color: #059669 !important; }
          .print-card .gap-neg { color: #DC2626 !important; }
          .print-card .rpt-chart-bar-wrap { background: #F3F4F6 !important; }

          .print-card .rpt-wrong-q { color: #1a1a1a !important; }
          .print-card .rpt-wrong-opts { color: #6B7280 !important; }
          .print-card .rpt-wrong-x { color: #DC2626 !important; }
          .print-card .rpt-wrong-o { color: #059669 !important; }
          .print-card .rpt-wrong-meta { color: #9CA3AF !important; }
          .print-card .rpt-wrong-card { background: #F9FAFB !important; border-color: #E5E7EB !important; }
          .print-card .rpt-wrong-explain { background: #EFF6FF !important; color: #1D4ED8 !important; }
          .print-card .rpt-highlight { background: linear-gradient(transparent 40%, #FDE68A 40%) !important; }
          .print-card .rpt-bold { font-weight: 700 !important; }

          .print-card .rpt-table th { color: #1D4ED8 !important; border-bottom-color: #1D4ED8 !important; }
          .print-card .rpt-table td { color: #374151 !important; border-bottom-color: #E5E7EB !important; }
          .print-card:last-child { page-break-after: auto; }

          .print-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2.5px solid #1D4ED8;
            padding-bottom: 8px;
            margin-bottom: 10px;
          }
          .print-avatar {
            width: 28px; height: 28px; border-radius: 50%;
            background: #EFF6FF; display: flex; align-items: center;
            justify-content: center; font-size: 14px;
          }
          .print-name { font-size: 16pt; font-weight: 800; }
          .print-store { font-size: 8pt; color: #6B7280; }
          .print-meta { display: flex; gap: 4px; }
          .tag { padding: 1px 6px; border-radius: 99px; font-size: 7pt; font-weight: 600; }
          .tag-green { background: #ECFDF5 !important; color: #059669 !important; }
          .tag-red { background: #FEF2F2 !important; color: #DC2626 !important; }

          .print-body {
            display: grid;
            grid-template-columns: 2fr 3fr;
            column-gap: 28px;
            gap: 24px;
            font-size: 8pt;
            line-height: 1.5;
            width: 100%;
          }
          .print-col { display: flex; flex-direction: column; gap: 6px; }
          .print-col:last-child { border-left: 1.5px solid #E5E7EB; padding-left: 20px; }
          .print-section-title {
            font-size: 8pt; font-weight: 700; color: #1D4ED8 !important;
            border-bottom: 1px solid #E5E7EB; padding-bottom: 2px; margin-bottom: 2px;
          }
          .print-section-content {
            color: #374151 !important; font-size: 7pt; line-height: 1.4;
          }

          .rpt-table { font-size: 7pt !important; }
          .rpt-table th { padding: 2px 4px !important; font-size: 7pt !important; color: #1D4ED8 !important; border-bottom-width: 1.5px !important; }
          .rpt-table td { padding: 2px 4px !important; font-size: 6.5pt !important; }
          .rpt-table tr.row-x { background: #FEF2F2 !important; }
          .rpt-table tr.row-tri { background: #FFFBEB !important; }

          .rpt-wrong-card { padding: 4px 6px !important; border: 1px solid #E5E7EB !important; background: #F9FAFB !important; margin-bottom: 4px; }
          .rpt-wrong-q { font-size: 7pt !important; }
          .rpt-wrong-opts { font-size: 6pt !important; }
          .rpt-wrong-answers { font-size: 6.5pt !important; }
          .rpt-wrong-x { color: #DC2626 !important; }
          .rpt-wrong-o { color: #059669 !important; }
          .rpt-wrong-explain { font-size: 6pt !important; background: #EFF6FF !important; color: #2563EB !important; }
          .rpt-wrong-meta { font-size: 5.5pt !important; color: #9CA3AF !important; }

          .rpt-text { font-size: 7pt !important; }
          .rpt-li { padding-left: 6px !important; }

          .rpt-feedback { font-size: 7pt !important; line-height: 1.45 !important; }

          .rpt-chart-row { height: 12px !important; margin-bottom: 1px !important; }
          .rpt-chart-label { font-size: 6.5pt !important; width: 22px !important; }
          .rpt-chart-bar-wrap { height: 10px !important; }
          .rpt-chart-score { font-size: 6.5pt !important; width: 18px !important; }
          .rpt-chart-gap { font-size: 6.5pt !important; width: 22px !important; }
          .bar-great { background: #22C55E !important; }
          .bar-good { background: #60A5FA !important; }
          .bar-warn { background: #F59E0B !important; }
          .bar-bad { background: #EF4444 !important; }
          .gap-pos { color: #059669 !important; }
          .gap-neg { color: #DC2626 !important; }
          .rpt-chart-avg-line { background: #9CA3AF !important; }

          .print-section { page-break-inside: avoid; }

          .print-card::after {
            content: "일룸(iloom) LSA 입문교육 종합 리포트 | 시험·교육일지·출결 데이터 기반 자동 생성";
            display: block; font-size: 6.5pt; color: #9CA3AF !important;
            margin-top: 6px; padding-top: 4px; border-top: 1px solid #E5E7EB;
            text-align: right;
          }
        }

        @media (max-width: 768px) {
          .report-cards-grid { grid-template-columns: 1fr !important; }
        }
    `}</style>
  );
}
