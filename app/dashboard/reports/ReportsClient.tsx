'use client';

import { useState, useEffect, useCallback } from 'react';
import { buildComprehensivePrompt, buildSubjectPrompt, REPORT_CATEGORIES, REPORT_TYPE_LABELS } from '@/lib/report-prompts';

interface BatchItem { id: string; name: string; start_date: string; end_date: string; }
interface StudentItem { id: string; name: string; store_location: string | null; is_dropped?: boolean; }
interface ReportGroup { groupId: string; reportType: string; subject: string | null; testDate: string; createdAt: string; studentCount: number; }
interface ReportDetail {
  id: string; student_id: string; manager_report: string; tag_tracking: { overcome?: string[]; newWeak?: string[]; chronic?: string[] } | null;
  report_type: string; subject: string | null; test_date: string; created_at: string;
  students: { name: string; store_location: string | null };
}

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 };
const sTitle: React.CSSProperties = { fontSize: 17, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 };

// 리포트 텍스트를 섹션으로 파싱
// 섹션 헤더: 줄 맨 앞에 이모지 + 한글 제목이 있는 경우만 (인라인 💡 해설 등은 무시)
function parseSections(text: string) {
  const headerPatterns: [string, RegExp][] = [
    ['📋', /^📋\s+(.+)/],
    ['📊', /^📊\s+(.+)/],
    ['📈', /^📈\s+(.+)/],
    ['🚨', /^🚨\s+(.+)/],
    ['🏷️', /^🏷️\s+(.+)/],
    ['📝', /^📝\s+(.+)/],
    ['💡', /^💡\s+추천/],  // "💡 추천 교육 스타일"만 매칭 (해설의 💡는 무시)
    ['🎯', /^🎯\s+(.+)/],
  ];
  const sections: { icon: string; title: string; content: string }[] = [];
  const lines = text.split('\n');
  let current: { icon: string; title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    let matched = false;
    for (const [icon, regex] of headerPatterns) {
      if (regex.test(trimmed)) {
        if (current) sections.push({ icon: current.icon, title: current.title, content: current.lines.join('\n').trim() });
        const title = trimmed.replace(icon, '').trim();
        current = { icon, title, lines: [] };
        matched = true;
        break;
      }
    }
    if (!matched && current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ icon: current.icon, title: current.title, content: current.lines.join('\n').trim() });
  return sections;
}

// ── 섹션별 스마트 렌더러 ──

// 마크다운 테이블 → HTML table
function renderTable(text: string) {
  const lines = text.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return null;
  const parseRow = (line: string) => line.split('|').filter(c => c.trim()).map(c => c.trim());
  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow); // skip separator row

  return (
    <table className="rpt-table">
      <thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={row[1] === 'X' ? 'row-x' : row[1] === '△' ? 'row-tri' : ''}>
            {row.map((cell, j) => <td key={j}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 오답 문항 → 카드형 렌더링 (최대 maxItems개)
function renderWrongAnswers(text: string, maxItems = 5) {
  const blocks = text.split(/(?=Q\. )/).filter(b => b.trim().startsWith('Q.'));
  const shown = blocks.slice(0, maxItems);
  const remaining = blocks.length - maxItems;

  return (
    <div className="rpt-wrong-list">
      {shown.map((block, i) => {
        const lines = block.split('\n').filter(l => l.trim());
        const question = lines[0]?.replace('Q. ', '').trim() || '';
        const optLine = lines.find(l => l.trim().startsWith('보기:'));
        const wrongLine = lines.find(l => l.includes('❌'));
        const correctLine = lines.find(l => l.includes('✅'));
        const explainLine = lines.find(l => l.includes('▸ 해설'));
        const metaLine = lines.find(l => l.includes('📌'));

        return (
          <div key={i} className="rpt-wrong-card">
            <div className="rpt-wrong-q">{question.length > 100 ? question.substring(0, 100) + '...' : question}</div>
            {optLine && <div className="rpt-wrong-opts">{optLine.replace('보기:', '').trim()}</div>}
            <div className="rpt-wrong-answers">
              {wrongLine && <span className="rpt-wrong-x">{wrongLine.replace(/^\s+/, '').trim()}</span>}
              {correctLine && <span className="rpt-wrong-o">{correctLine.replace(/^\s+/, '').trim()}</span>}
            </div>
            {explainLine && <div className="rpt-wrong-explain">{explainLine.replace(/^\s+/, '').trim()}</div>}
            {metaLine && <div className="rpt-wrong-meta">{metaLine.replace(/^\s+/, '').trim()}</div>}
          </div>
        );
      })}
      {remaining > 0 && <div className="rpt-wrong-more">외 {remaining}건</div>}
      {blocks.length === 0 && <div className="rpt-empty">반복 오답 없음</div>}
    </div>
  );
}

// 일반 텍스트 → 줄바꿈 + 리스트 렌더링 (maxLines로 제한)
function renderText(text: string, maxLines?: number) {
  let lines = text.split('\n').filter(l => l.trim());
  const total = lines.length;
  if (maxLines && lines.length > maxLines) lines = lines.slice(0, maxLines);
  return (
    <div className="rpt-text">
      {lines.map((line, i) => {
        if (line.trim().startsWith('- ')) return <div key={i} className="rpt-li">• {formatInline(line.replace(/^-\s*/, '').trim())}</div>;
        return <div key={i}>{formatInline(line.trim())}</div>;
      })}
      {maxLines && total > maxLines && <div className="rpt-wrong-more">외 {total - maxLines}건</div>}
    </div>
  );
}

// 인라인 마크다운 → HTML 변환 (**볼드**, ==형광펜==)
function formatInline(text: string) {
  const parts: (string | React.ReactElement)[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // ==형광펜== 먼저 (더 긴 패턴)
    const hlMatch = remaining.match(/==(.+?)==/);
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);

    // 가장 먼저 나오는 패턴 찾기
    const hlIdx = hlMatch ? remaining.indexOf(hlMatch[0]) : Infinity;
    const boldIdx = boldMatch ? remaining.indexOf(boldMatch[0]) : Infinity;

    if (hlIdx === Infinity && boldIdx === Infinity) {
      parts.push(remaining);
      break;
    }

    if (hlIdx <= boldIdx && hlMatch) {
      parts.push(remaining.substring(0, hlIdx));
      parts.push(<mark key={key++} className="rpt-highlight">{hlMatch[1]}</mark>);
      remaining = remaining.substring(hlIdx + hlMatch[0].length);
    } else if (boldMatch) {
      parts.push(remaining.substring(0, boldIdx));
      parts.push(<strong key={key++} className="rpt-bold">{boldMatch[1]}</strong>);
      remaining = remaining.substring(boldIdx + boldMatch[0].length);
    }
  }

  return parts;
}

// 피드백(긴 문단)
function renderFeedback(text: string) {
  // [매장 실습 관찰] 기준으로 분리
  const practiceMarker = '**[매장 실습 관찰]**';
  const practiceIdx = text.indexOf(practiceMarker);

  if (practiceIdx === -1) {
    return <div className="rpt-feedback">{formatInline(text)}</div>;
  }

  const mainText = text.substring(0, practiceIdx).trim();
  const practiceText = text.substring(practiceIdx + practiceMarker.length).trim();

  // 실습 관찰 텍스트를 줄 단위로 파싱
  const practiceLines = practiceText.split('\n').filter(l => l.trim());

  // 첫 줄 = 실적 요약, 나머지 = 관찰 항목
  const statsLine = practiceLines[0] || '';
  const observationLines = practiceLines.slice(1);

  return (
    <div className="rpt-feedback">
      <div>{formatInline(mainText)}</div>
      <div className="rpt-practice-section">
        <div className="rpt-practice-header">매장 실습 관찰</div>
        <div className="rpt-practice-stats">{formatInline(statsLine)}</div>
        {observationLines.length > 0 && (
          <div className="rpt-practice-observations">
            {observationLines.map((line, i) => (
              <div key={i} className="rpt-practice-item">{formatInline(line.trim())}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 성적 요약 + 차시별 바 차트
function renderScoreSummary(content: string) {
  const textLines = content.split('\n').filter(l => l.trim() && !l.startsWith('CHART:'));
  const chartLine = content.split('\n').find(l => l.startsWith('CHART:'));

  // CHART:1차시:95:73:+22|2차시:82:71:+11|... 파싱
  const chartData: { session: string; score: number; classAvg: number; gap: number }[] = [];
  if (chartLine) {
    chartLine.replace('CHART:', '').split('|').forEach(item => {
      const [session, score, classAvg, gap] = item.split(':');
      chartData.push({ session, score: parseInt(score), classAvg: parseInt(classAvg), gap: parseInt(gap) });
    });
  }

  return (
    <div>
      <div className="rpt-text">
        {textLines.map((line, i) => <div key={i}>{line.trim()}</div>)}
      </div>
      {chartData.length > 0 && (
        <div className="rpt-chart">
          <div className="rpt-chart-header">
            <span>차시별 성적 (반 평균 대비)</span>
          </div>
          {chartData.map((d, i) => (
            <div key={i} className="rpt-chart-row">
              <div className="rpt-chart-label">{d.session.replace('차시', '차')}</div>
              <div className="rpt-chart-bar-wrap">
                <div className="rpt-chart-avg-line" style={{ left: `${d.classAvg}%` }} />
                <div
                  className={`rpt-chart-bar ${d.gap >= 10 ? 'bar-great' : d.gap >= 0 ? 'bar-good' : d.gap >= -10 ? 'bar-warn' : 'bar-bad'}`}
                  style={{ width: `${Math.min(d.score, 100)}%` }}
                />
              </div>
              <div className="rpt-chart-score">{d.score}</div>
              <div className={`rpt-chart-gap ${d.gap >= 0 ? 'gap-pos' : 'gap-neg'}`}>
                {d.gap >= 0 ? '+' : ''}{d.gap}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 섹션 내용을 타입에 따라 렌더링
function renderSectionContent(icon: string, content: string, isPrint = false) {
  if (icon === '📊') return renderTable(content) || renderText(content);
  if (icon === '🚨') return renderWrongAnswers(content, isPrint ? 2 : 3);
  if (icon === '📋') return renderFeedback(content);
  if (icon === '📈') return renderScoreSummary(content);
  if (icon === '🎯') return renderTable(content) || renderText(content);
  return renderText(content);
}

// Practice 보고서 전용 렌더러 (일자별 통합)
function PracticeReportView({ text }: { text: string }) {
  const blocks = text.split('\n---\n');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        return (
          <div key={bi} style={{
            padding: '20px 0',
            borderBottom: bi < blocks.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            {lines.map((line, li) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={li} style={{ height: 8 }} />;

              // 📋 제목 (큰 헤더)
              if (trimmed.startsWith('📋 매장')) {
                return <h3 key={li} style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>{trimmed.replace(/^📋\s*/, '')}</h3>;
              }
              // 📊 전체 현황
              if (trimmed.startsWith('📊')) {
                return <div key={li} style={{ fontSize: 15, fontWeight: 600, color: 'var(--blue-light)', marginBottom: 4 }}>{formatInline(trimmed.replace(/^📊\s*/, ''))}</div>;
              }
              // 📌 이름 헤더
              if (trimmed.startsWith('📌')) {
                return <div key={li} style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{formatInline(trimmed.replace(/^📌\s*/, ''))}</div>;
              }
              // → 피드백 라인
              if (trimmed.startsWith('→')) {
                return (
                  <div key={li} style={{
                    fontSize: 14, color: 'var(--text-second)', lineHeight: 1.7,
                    paddingLeft: 16, position: 'relative', marginBottom: 4,
                  }}>
                    <span style={{ position: 'absolute', left: 0, color: 'var(--blue)' }}>→</span>
                    {formatInline(trimmed.substring(1).trim())}
                  </div>
                );
              }
              // 어프로치 N / ... 실적 라인
              if (trimmed.startsWith('어프로치') || trimmed.startsWith('상담 품목')) {
                return <div key={li} style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 2 }}>{formatInline(trimmed)}</div>;
              }
              // 견적 전환율 등 부가 정보
              if (trimmed.startsWith('견적 전환율') || trimmed.startsWith('총 ')) {
                return <div key={li} style={{ fontSize: 14, color: 'var(--text-second)', marginBottom: 4 }}>{formatInline(trimmed)}</div>;
              }
              // 기본
              return <div key={li} style={{ fontSize: 14, color: 'var(--text-second)', lineHeight: 1.6 }}>{formatInline(trimmed)}</div>;
            })}
          </div>
        );
      })}
    </div>
  );
}

// 인쇄용 학생 카드 (A4 가로 2단)
function PrintCard({ r, isPrint = true }: { r: ReportDetail; isPrint?: boolean }) {
  const sections = parseSections(r.manager_report);
  // 왼쪽: 피드백 + 추천 교육 + 첫 주 교육 (하나의 흐름)
  const leftOrder = ['📋', '💡', '🎯'];
  // 오른쪽: 체크리스트 + 성적 + 반복 오답
  const rightOrder = ['📊', '📈', '🚨'];
  const leftSections = leftOrder.map(icon => sections.find(s => s.icon === icon)).filter(Boolean) as typeof sections;
  const rightSections = rightOrder.map(icon => sections.find(s => s.icon === icon)).filter(Boolean) as typeof sections;

  return (
    <div className="print-card">
      <div className="print-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="print-avatar"></div>
          <div>
            <div className="print-name">{r.students.name}</div>
            {r.students.store_location && <div className="print-store">{r.students.store_location}</div>}
          </div>
        </div>
        <div className="print-meta">
          {r.tag_tracking?.overcome?.map(t => <span key={`o-${t}`} className="tag tag-green">{t}</span>)}
          {r.tag_tracking?.chronic?.map(t => <span key={`c-${t}`} className="tag tag-red">● {t}</span>)}
        </div>
      </div>
      <div className="print-body">
        <div className="print-col">
          {leftSections.map((s, i) => (
            <div key={i} className="print-section">
              <div className="print-section-title">{s.title}</div>
              {renderSectionContent(s.icon, s.content, isPrint)}
            </div>
          ))}
        </div>
        <div className="print-col">
          {rightSections.map((s, i) => (
            <div key={i} className="print-section">
              <div className="print-section-title">{s.title}</div>
              {renderSectionContent(s.icon, s.content, isPrint)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ReportsClient({ batches }: { batches: BatchItem[] }) {
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id || '');
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [reportGroups, setReportGroups] = useState<ReportGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupReports, setGroupReports] = useState<ReportDetail[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [subjectCategory, setSubjectCategory] = useState<typeof REPORT_CATEGORIES[number]>(REPORT_CATEGORIES[0]);
  const [toast, setToast] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  useEffect(() => {
    if (!selectedBatchId) return;
    Promise.all([
      fetch(`/api/students?batchId=${selectedBatchId}`).then(r => r.json()),
      fetch(`/api/reports?batchId=${selectedBatchId}`).then(r => r.json()),
    ]).then(([s, g]) => {
      const active = (Array.isArray(s) ? s : []).filter((st: StudentItem) => !st.is_dropped);
      setStudents(active);
      setReportGroups(g.groups || []);
      setSelectedGroupId(null);
      setGroupReports([]);
    });
  }, [selectedBatchId]);

  const loadGroupDetail = useCallback(async (groupId: string) => {
    if (selectedGroupId === groupId) { setSelectedGroupId(null); return; }
    setLoadingGroup(true);
    setSelectedGroupId(groupId);
    const res = await fetch(`/api/reports?groupId=${groupId}`);
    const data = await res.json();
    setGroupReports(data.reports || []);
    setLoadingGroup(false);
  }, [selectedGroupId]);

  const copyPrompt = async (type: 'comprehensive' | 'subject') => {
    if (!selectedBatch || students.length === 0) { showToast('기수와 교육생이 필요합니다'); return; }
    const prompt = type === 'comprehensive'
      ? buildComprehensivePrompt(selectedBatch, students)
      : buildSubjectPrompt(selectedBatch, students, subjectCategory);
    await navigator.clipboard.writeText(prompt);
    showToast(`${type === 'comprehensive' ? '종합 분석' : `${subjectCategory} 분야별 분석`} 프롬프트가 복사되었습니다!`);
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    await fetch('/api/reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, manager_report: editText }) });
    setGroupReports(prev => prev.map(r => r.id === id ? { ...r, manager_report: editText } : r));
    setEditingId(null);
    setSaving(false);
    showToast('리포트가 수정되었습니다');
  };

  // PDF: 새 창에 흰 배경 HTML만 넣고 인쇄
  const printToPDF = () => {
    // 미리보기 모드가 아니면 자동 전환 후 약간 대기
    if (!previewMode) {
      setPreviewMode(true);
      setTimeout(() => printToPDF(), 300);
      return;
    }
    const previewEl = document.querySelector('.print-preview-container');
    if (!previewEl) return;

    const html = previewEl.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // 현재 페이지의 스타일 중 필요한 것만 가져오기
    const styles = document.querySelectorAll('style');
    let styleText = '';
    styles.forEach(s => { styleText += s.textContent || ''; });

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>일룸 LSA 입문교육 종합 리포트</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #fff; color: #1a1a1a;
    font-family: 'Pretendard', -apple-system, sans-serif;
    font-size: 10pt; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  @page { size: A4 landscape; margin: 10mm 14mm; }

  .print-card { page-break-after: always; padding: 0; margin: 0; }
  .print-card:last-child { page-break-after: auto; }

  .print-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5px solid #1D4ED8; padding-bottom: 8px; margin-bottom: 12px; }
  .print-avatar { width: 28px; height: 28px; border-radius: 50%; background: #EFF6FF; display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .print-name { font-size: 16pt; font-weight: 800; color: #1a1a1a; }
  .print-store { font-size: 9pt; color: #6B7280; }
  .print-meta { display: flex; gap: 6px; }
  .tag { padding: 2px 8px; border-radius: 99px; font-size: 8pt; font-weight: 600; }
  .tag-green { background: #ECFDF5; color: #059669; }
  .tag-red { background: #FEF2F2; color: #DC2626; }

  .print-body { display: grid; grid-template-columns: 2fr 3fr; column-gap: 28px; font-size: 8.5pt; line-height: 1.5; }
  .print-col { display: flex; flex-direction: column; gap: 8px; }
  .print-col:last-child { border-left: 1.5px solid #E5E7EB; padding-left: 20px; }
  .print-section { page-break-inside: avoid; }
  .print-section-title { font-size: 9pt; font-weight: 700; color: #1D4ED8; border-bottom: 1px solid #E5E7EB; padding-bottom: 3px; margin-bottom: 4px; }
  .print-section-content { color: #374151; }

  .rpt-feedback { color: #374151; line-height: 1.55; }

  .rpt-practice-section { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border, #D1D5DB); }
  .rpt-practice-header { font-size: 8.5pt; font-weight: 700; color: var(--blue, #1D4ED8); margin-bottom: 4px; letter-spacing: 0.3px; }
  .rpt-practice-stats { font-size: 8pt; color: var(--text-second, #374151); margin-bottom: 6px; padding: 4px 8px; background: var(--blue-dim, #F0F4FF); border-radius: 4px; line-height: 1.5; }
  .rpt-practice-observations { display: flex; flex-direction: column; gap: 3px; }
  .rpt-practice-item { font-size: 8pt; color: var(--text-second, #374151); padding-left: 10px; position: relative; line-height: 1.5; }
  .rpt-practice-item::before { content: '▸'; position: absolute; left: 0; color: var(--blue, #1D4ED8); font-weight: 700; }

  .rpt-text { display: flex; flex-direction: column; gap: 2px; color: #374151; }
  .rpt-li { padding-left: 8px; }
  .rpt-bold { font-weight: 700; }
  .rpt-highlight { background: linear-gradient(transparent 40%, #FDE68A 40%); padding: 0 2px; font-weight: 600; }

  .rpt-table { width: 100%; border-collapse: collapse; }
  .rpt-table th { text-align: left; font-weight: 700; padding: 3px 6px; border-bottom: 2px solid #1D4ED8; color: #1D4ED8; white-space: nowrap; font-size: 8.5pt; }
  .rpt-table td { padding: 3px 6px; border-bottom: 1px solid #E5E7EB; color: #374151; vertical-align: top; }
  .rpt-table td:nth-child(1), .rpt-table td:nth-child(2), .rpt-table td:nth-child(3), .rpt-table td:nth-child(4) { white-space: nowrap; }
  .rpt-table tr.row-x { background: #FEF2F2; }
  .rpt-table tr.row-tri { background: #FFFBEB; }

  .rpt-chart { margin-top: 6px; }
  .rpt-chart-header { font-size: 8.5pt; font-weight: 600; color: #6B7280; margin-bottom: 3px; }
  .rpt-chart-row { display: flex; align-items: center; gap: 4px; height: 16px; margin-bottom: 2px; }
  .rpt-chart-label { width: 24px; font-size: 8pt; font-weight: 600; color: #6B7280; text-align: right; flex-shrink: 0; }
  .rpt-chart-bar-wrap { flex: 1; height: 12px; background: #F3F4F6; border-radius: 3px; position: relative; overflow: hidden; }
  .rpt-chart-bar { height: 100%; border-radius: 3px; }
  .rpt-chart-avg-line { position: absolute; top: 0; bottom: 0; width: 1.5px; background: #9CA3AF; z-index: 1; }
  .rpt-chart-score { width: 22px; font-size: 8pt; font-weight: 700; color: #374151; text-align: right; flex-shrink: 0; }
  .rpt-chart-gap { width: 28px; font-size: 8pt; font-weight: 700; text-align: right; flex-shrink: 0; }
  .gap-pos { color: #059669; }
  .gap-neg { color: #DC2626; }
  .bar-great { background: #22C55E; }
  .bar-good { background: #60A5FA; }
  .bar-warn { background: #F59E0B; }
  .bar-bad { background: #EF4444; }

  .rpt-wrong-list { display: flex; flex-direction: column; gap: 8px; }
  .rpt-wrong-card { padding: 8px 10px; border-radius: 6px; background: #F9FAFB; border: 1px solid #E5E7EB; }
  .rpt-wrong-q { font-weight: 600; margin-bottom: 3px; line-height: 1.4; color: #1a1a1a; }
  .rpt-wrong-opts { font-size: 0.9em; color: #6B7280; margin-bottom: 3px; }
  .rpt-wrong-answers { display: flex; flex-direction: column; gap: 2px; }
  .rpt-wrong-x { color: #DC2626; font-size: 0.9em; }
  .rpt-wrong-o { color: #059669; font-size: 0.9em; font-weight: 600; }
  .rpt-wrong-explain { font-size: 0.85em; color: #1D4ED8; margin-top: 3px; padding: 3px 6px; background: #EFF6FF; border-radius: 4px; }
  .rpt-wrong-meta { font-size: 0.8em; color: #9CA3AF; margin-top: 2px; }
  .rpt-wrong-more { text-align: center; color: #6B7280; font-size: 0.85em; }
  .rpt-empty { color: #9CA3AF; }

  .print-card::after {
    content: "일룸(iloom) LSA 입문교육 종합 리포트 | 시험·교육일지·출결 데이터 기반 자동 생성";
    display: block; font-size: 7pt; color: #9CA3AF;
    margin-top: 8px; padding-top: 4px; border-top: 1px solid #E5E7EB;
    text-align: right;
  }
</style>
</head>
<body>${html}</body>
</html>`);
    printWindow.document.close();
    // 폰트 로딩 대기 후 인쇄
    setTimeout(() => { printWindow.print(); }, 500);
  };

  const refreshReports = async () => {
    const res = await fetch(`/api/reports?batchId=${selectedBatchId}`);
    const data = await res.json();
    setReportGroups(data.groups || []);
    showToast('새로고침 완료');
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* 헤더 */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>AI 분석 리포트</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14 }}>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={refreshReports}
            style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 14, cursor: 'pointer' }}>
            새로고침
          </button>
        </div>
      </div>

      {/* 분석 카드 */}
      <div className="report-cards-grid no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ ...card, borderColor: 'var(--blue)' }}>
          <h3 style={sTitle}>종합 분석</h3>
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '0 0 8px', lineHeight: 1.6 }}>
            매장 관리자에게 전달하는 인수인계 리포트. 교육생 {students.length}명 대상
          </p>
          <button onClick={() => copyPrompt('comprehensive')}
            style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            프롬프트 복사
          </button>
        </div>
        <div style={card}>
          <h3 style={sTitle}>분야별 분석</h3>
          <select value={subjectCategory} onChange={e => setSubjectCategory(e.target.value as typeof REPORT_CATEGORIES[number])}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, marginBottom: 12 }}>
            {REPORT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => copyPrompt('subject')}
            style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            프롬프트 복사
          </button>
        </div>
      </div>

      {/* 리포트 목록 */}
      <div className="no-print" style={card}>
        <h3 style={sTitle}>생성된 리포트</h3>
        {reportGroups.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
            아직 생성된 리포트가 없습니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reportGroups.map(g => (
              <div key={g.groupId}>
                <div onClick={() => loadGroupDetail(g.groupId)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: selectedGroupId === g.groupId ? 'var(--bg-hover)' : 'transparent' }}
                  onMouseEnter={e => { if (selectedGroupId !== g.groupId) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (selectedGroupId !== g.groupId) e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: g.reportType === 'practice' ? 'rgba(48,209,88,0.15)' : g.reportType === 'comprehensive' ? 'var(--blue-dim)' : 'rgba(191,90,242,0.15)', color: g.reportType === 'practice' ? 'var(--green)' : g.reportType === 'comprehensive' ? 'var(--blue-light)' : 'var(--purple)' }}>
                      {REPORT_TYPE_LABELS[g.reportType] || g.reportType}
                    </span>
                    {g.subject && <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{g.subject}</span>}
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{g.testDate}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{g.studentCount}명</span>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{selectedGroupId === g.groupId ? '▲' : '▼'}</span>
                </div>

                {selectedGroupId === g.groupId && !loadingGroup && (
                  <div style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <button onClick={() => setPreviewMode(!previewMode)}
                        style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: previewMode ? 'var(--blue)' : 'transparent', color: previewMode ? '#fff' : 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        {previewMode ? '편집 모드' : '인쇄 미리보기'}
                      </button>
                      <button onClick={() => printToPDF()}
                        style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        PDF 다운로드
                      </button>
                    </div>

                    {/* 기본: 구조화된 뷰 (편집 시만 텍스트) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      {groupReports.map(r => (
                        <div key={r.id}>
                          {editingId === r.id ? (
                            <div style={{ padding: 20, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                <span style={{ fontSize: 16, fontWeight: 700 }}>{r.students.name}</span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>원본 텍스트 편집 중</span>
                              </div>
                              <textarea value={editText} onChange={e => setEditText(e.target.value)}
                                style={{ width: '100%', minHeight: 400, padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--blue)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.7, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
                              <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                                <button onClick={() => setEditingId(null)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 13, cursor: 'pointer' }}>취소</button>
                                <button onClick={() => saveEdit(r.id)} disabled={saving} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? '저장 중...' : '💾 저장'}</button>
                              </div>
                            </div>
                          ) : (
                            <div className={previewMode ? 'print-preview-container' : ''}>
                              {g.reportType === 'practice' ? (
                                <div style={{ ...card, padding: 28 }}>
                                  <PracticeReportView text={r.manager_report} />
                                </div>
                              ) : (
                                <PrintCard r={r} isPrint={false} />
                              )}
                              {!previewMode && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                                  <button onClick={() => { setEditingId(r.id); setEditText(r.manager_report); }}
                                    style={{ padding: '5px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer' }}>
                                    원본 수정
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 인쇄 전용: 항상 렌더링 (화면에서는 숨김, 인쇄 시만 표시) */}
      <div className="print-only">
        {groupReports.map(r => <PrintCard key={r.id} r={r} />)}
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="no-print" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', borderRadius: 'var(--radius-md)', background: 'var(--blue)', color: '#fff', fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: 'var(--shadow-lg)' }}>
          {toast}
        </div>
      )}

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
        .print-preview-container .print-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #1D4ED8;
          padding-bottom: 10px;
          margin-bottom: 14px;
        }
        .print-preview-container .print-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: #EFF6FF; display: flex; align-items: center;
          justify-content: center; font-size: 16px;
        }
        .print-preview-container .print-name { font-size: 18px; font-weight: 800; color: #1a1a1a; }
        .print-preview-container .print-store { font-size: 12px; color: #6B7280; }
        .print-preview-container .print-meta { display: flex; gap: 6px; flex-wrap: wrap; }
        .print-preview-container .tag { padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; }
        .print-preview-container .tag-green { background: #ECFDF5; color: #059669; }
        .print-preview-container .tag-red { background: #FEF2F2; color: #DC2626; }
        .print-preview-container .print-body {
          display: grid;
          grid-template-columns: 2fr 3fr;
          column-gap: 28px;
          gap: 20px;
          font-size: 11px;
          line-height: 1.55;
        }
        .print-preview-container .print-col { display: flex; flex-direction: column; gap: 10px; }
        .print-preview-container .print-col:last-child { border-left: 1.5px solid #E5E7EB; padding-left: 24px; }
        .print-preview-container .print-section-title {
          font-size: 12px; font-weight: 700; color: #1D4ED8;
          border-bottom: 1px solid #E5E7EB; padding-bottom: 3px; margin-bottom: 4px;
        }
        .print-preview-container .print-section-content {
          color: #374151; font-size: 10.5px; line-height: 1.5;
        }
        .print-preview-container .rpt-table { font-size: 11px; }
        .print-preview-container .rpt-table th { color: #1D4ED8; }
        .print-preview-container .rpt-wrong-card { font-size: 11px; }
        .print-preview-container .rpt-text { font-size: 11px; }

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

          /* 폰트 */
          body { font-family: 'Pretendard', -apple-system, sans-serif !important; }

          /* 색상 인쇄 허용 */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          /* 색상이 필요한 요소만 복원 */
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

          /* 모든 텍스트 검은색 강제 */
          .print-card, .print-card * { color: #1a1a1a !important; }
          .print-card .print-name { color: #1a1a1a !important; font-size: 18pt !important; }
          .print-card .print-store { color: #6B7280 !important; }
          .print-card .print-header { border-bottom: 2.5px solid #1D4ED8 !important; }
          .print-card .print-section-title { color: #1D4ED8 !important; }
          .print-card .rpt-feedback { color: #374151 !important; }
          .print-card .rpt-text, .print-card .rpt-text * { color: #374151 !important; }
          .print-card .rpt-li { color: #374151 !important; }

          /* 태그 뱃지 색상 */
          .print-card .tag-green { color: #059669 !important; background: #ECFDF5 !important; }
          .print-card .tag-red { color: #DC2626 !important; background: #FEF2F2 !important; }

          /* 차트 색상 */
          .print-card .rpt-chart-label { color: #6B7280 !important; }
          .print-card .rpt-chart-score { color: #374151 !important; }
          .print-card .rpt-chart-header { color: #6B7280 !important; }
          .print-card .gap-pos { color: #059669 !important; }
          .print-card .gap-neg { color: #DC2626 !important; }
          .print-card .rpt-chart-bar-wrap { background: #F3F4F6 !important; }

          /* 오답 카드 */
          .print-card .rpt-wrong-q { color: #1a1a1a !important; }
          .print-card .rpt-wrong-opts { color: #6B7280 !important; }
          .print-card .rpt-wrong-x { color: #DC2626 !important; }
          .print-card .rpt-wrong-o { color: #059669 !important; }
          .print-card .rpt-wrong-meta { color: #9CA3AF !important; }
          .print-card .rpt-wrong-card { background: #F9FAFB !important; border-color: #E5E7EB !important; }
          .print-card .rpt-wrong-explain { background: #EFF6FF !important; color: #1D4ED8 !important; }
          .print-card .rpt-highlight { background: linear-gradient(transparent 40%, #FDE68A 40%) !important; }
          .print-card .rpt-bold { font-weight: 700 !important; }

          /* 테이블 */
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

          /* 인쇄 테이블 */
          .rpt-table { font-size: 7pt !important; }
          .rpt-table th { padding: 2px 4px !important; font-size: 7pt !important; color: #1D4ED8 !important; border-bottom-width: 1.5px !important; }
          .rpt-table td { padding: 2px 4px !important; font-size: 6.5pt !important; }
          .rpt-table tr.row-x { background: #FEF2F2 !important; }
          .rpt-table tr.row-tri { background: #FFFBEB !important; }

          /* 인쇄 오답 카드 */
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

          /* 인쇄 차트 */
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

          /* 섹션 단위로 페이지 나뉨 방지 */
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
    </div>
  );
}
