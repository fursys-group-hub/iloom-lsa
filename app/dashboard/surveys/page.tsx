'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from 'recharts';

/* ── types ── */
interface Batch {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_archived?: boolean;
}
interface Student {
  id: string;
  name: string;
  batch_id: string;
  is_dropped?: boolean;
  store_name?: string;
}
interface EducationSurvey {
  id: string;
  batch_id: string;
  student_id: string;
  phase: string;
  eff_product: number | null;
  eff_customer: number | null;
  eff_sales: number | null;
  eff_teamwork: number | null;
  eff_overall: number | null;
  sat_content: number | null;
  sat_method: number | null;
  sat_duration: number | null;
  open_strength: string | null;
  open_worry: string | null;
  open_goal: string | null;
  created_at: string;
}
interface AnsanSurvey {
  id: string;
  batch_id: string;
  student_id: string;
  phase: 'pre' | 'post';
  know_products: number | null;
  know_factory: number | null;
  know_sofa: number | null;
  know_mattress: number | null;
  know_steel: number | null;
  know_quality: number | null;
  know_competitive: number | null;
  know_explain: number | null;
  know_value: number | null;
  curiosity_sofa: string | null;
  curiosity_mattress: string | null;
  curiosity_steel: string | null;
  curiosity_quality: string | null;
  curiosity_other: string | null;
  sat_process: number | null;
  sat_helpful: number | null;
  sat_guide: number | null;
  sat_operation: number | null;
  sat_duration: number | null;
  nps: number | null;
  best_line: string | null;
  best_reason: string | null;
  learned_sofa: string | null;
  learned_mattress: string | null;
  learned_steel: string | null;
  confident_to_say: string | null;
  improvement: string | null;
  created_at: string;
}

/* ── constants ── */
const EFF_LABELS: { key: string; label: string; question: string }[] = [
  { key: 'eff_product', label: '제품 지식', question: '일룸 제품에 대해 고객에게 자신 있게 설명할 수 있다' },
  { key: 'eff_customer', label: '고객 응대', question: '다양한 고객 유형에 맞춰 응대할 수 있다' },
  { key: 'eff_sales', label: '판매 성사', question: '상담부터 수주까지 스스로 이끌 수 있다' },
  { key: 'eff_teamwork', label: '팀워크', question: '매장 동료들과 잘 협력할 수 있다' },
  { key: 'eff_overall', label: '전반적 준비도', question: '매장에서 일할 준비가 되었다고 느낀다' },
];
const SAT_LABELS: { key: string; label: string; question: string }[] = [
  { key: 'sat_content', label: '교육 내용', question: '교육 내용이 실무에 도움이 되었다' },
  { key: 'sat_method', label: '교육 방식', question: '교육 방식(강의/실습 비율)이 적절했다' },
  { key: 'sat_duration', label: '교육 기간', question: '교육 기간이 적절했다' },
];
const OPEN_LABELS: { key: string; label: string; question: string }[] = [
  { key: 'open_strength', label: '가장 성장한 부분', question: '교육을 통해 가장 성장했다고 느끼는 점' },
  { key: 'open_worry', label: '아직 걱정되는 부분', question: '아직 부족하거나 걱정되는 점' },
  { key: 'open_goal', label: '앞으로의 목표', question: '매장 배치 후 이루고 싶은 목표' },
];

const KNOW_LABELS: { key: string; label: string; question: string }[] = [
  { key: 'know_products', label: '제품 종류', question: '안성공장에서 어떤 일룸 제품을 만드는지 알고 있다' },
  { key: 'know_factory', label: '공장 규모', question: '안성공장의 규모와 작업 환경을 대략 알고 있다' },
  { key: 'know_sofa', label: '소파 공정', question: '소파가 어떤 과정을 거쳐 만들어지는지 알고 있다' },
  { key: 'know_mattress', label: '매트리스 공정', question: '매트리스가 어떤 과정을 거쳐 만들어지는지 알고 있다' },
  { key: 'know_steel', label: '철제 공정', question: '철제 가구(책상/책장 등)가 어떤 과정을 거쳐 만들어지는지 알고 있다' },
  { key: 'know_quality', label: '품질 검사', question: '일룸 가구의 품질 검사가 어떻게 이뤄지는지 알고 있다' },
  { key: 'know_competitive', label: '경쟁 강점', question: '타사 가구와 비교했을 때 일룸의 강점을 자신 있게 설명할 수 있다' },
  { key: 'know_explain', label: '고객 설명', question: '매장에서 고객에게 "공장에서 어떻게 만드냐"고 물어보면 답할 수 있다' },
  { key: 'know_value', label: '가치 설명', question: '일룸 가구의 가치를 내 언어로 설명할 수 있다' },
];
const ANSAN_SAT_LABELS: { key: string; label: string; question: string }[] = [
  { key: 'sat_process', label: '진행 절차', question: '투어 진행 절차가 체계적이었다' },
  { key: 'sat_helpful', label: '영업 도움', question: '투어 내용이 매장 영업에 도움이 될 것 같다' },
  { key: 'sat_guide', label: '가이드 설명', question: '가이드/설명이 이해하기 쉬웠다' },
  { key: 'sat_operation', label: '운영 만족', question: '안전/이동/식사 등 운영에 만족한다' },
  { key: 'sat_duration', label: '시간 적절', question: '투어 시간이 적절했다' },
];
const ANSAN_CURIOSITY_LABELS: { key: string; label: string; question: string }[] = [
  { key: 'curiosity_sofa', label: '소파 공정', question: '소파 제작 과정에서 가장 보고 싶거나 궁금한 점은?' },
  { key: 'curiosity_mattress', label: '매트리스 공정', question: '매트리스 제작 과정에서 가장 보고 싶거나 궁금한 점은?' },
  { key: 'curiosity_steel', label: '철제 공정', question: '철제 가구 제작 과정에서 가장 보고 싶거나 궁금한 점은?' },
  { key: 'curiosity_quality', label: '품질 검사', question: '일룸 품질 검사에 대해 가장 알고 싶은 점은?' },
  { key: 'curiosity_other', label: '기타', question: '그 외 안성공장에서 꼭 보고/배우고 싶은 점이 있다면?' },
];
const ANSAN_POST_LABELS: { key: string; label: string; question: string }[] = [
  { key: 'learned_sofa', label: '소파 라인', question: '소파 라인을 보고 새로 알게 된 점은?' },
  { key: 'learned_mattress', label: '매트리스 라인', question: '매트리스 라인을 보고 새로 알게 된 점은?' },
  { key: 'learned_steel', label: '철제 라인', question: '철제 가구 라인을 보고 새로 알게 된 점은?' },
  { key: 'confident_to_say', label: '자신 있게 얘기할 부분', question: '매장에서 고객에게 자신 있게 얘기할 수 있는 부분은?' },
  { key: 'improvement', label: '아쉬운 점', question: '아쉽거나 더 보고 싶었던 점은?' },
];

/* ── styles ── */
const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px 24px',
  boxShadow: 'var(--shadow-sm)',
};

const badgeBase: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 'var(--radius-pill)',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const selectStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  outline: 'none',
};

/* ── helpers ── */
function avg(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n != null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function fmtAvg(val: number | null): string {
  if (val == null) return '-';
  return val.toFixed(1);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ── component ── */
export default function SurveysPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<'efficacy' | 'ansan'>('ansan');

  // survey data
  const [eduSurveys, setEduSurveys] = useState<EducationSurvey[]>([]);
  const [ansanSurveys, setAnsanSurveys] = useState<AnsanSurvey[]>([]);

  // modal
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [modalTab, setModalTab] = useState<string>('intro_end');

  // fetch batches & students
  useEffect(() => {
    (async () => {
      try {
        const [bRes, sRes] = await Promise.all([
          fetch('/api/batches').then(r => r.json()),
          fetch('/api/students').then(r => r.json()),
        ]);
        const bList = (bRes.batches || bRes || []) as Batch[];
        const sList = (sRes.students || sRes || []) as Student[];
        setBatches(bList);
        setStudents(sList);
        if (bList.length > 0) {
          const active = bList.find(b => !b.is_archived) || bList[0];
          setSelectedBatchId(active.id);
        }
      } catch { /* */ }
      setLoading(false);
    })();
  }, []);

  // fetch surveys when batch changes
  const fetchSurveys = useCallback(async () => {
    if (!selectedBatchId) return;
    try {
      const [eduRes, ansanRes] = await Promise.all([
        fetch(`/api/education-surveys?batchId=${selectedBatchId}`).then(r => r.json()),
        fetch(`/api/ansan-tour-surveys?batchId=${selectedBatchId}`).then(r => r.json()),
      ]);
      setEduSurveys(Array.isArray(eduRes) ? eduRes : []);
      setAnsanSurveys(Array.isArray(ansanRes) ? ansanRes : []);
    } catch { /* */ }
  }, [selectedBatchId]);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  // filtered students for selected batch (exclude dropped)
  const batchStudents = useMemo(() =>
    students.filter(s => s.batch_id === selectedBatchId && !s.is_dropped).sort((a, b) => a.name.localeCompare(b.name)),
    [students, selectedBatchId]
  );

  /* ── efficacy survey stats ── */
  const eduByStudent = useMemo(() => {
    const map: Record<string, { intro?: EducationSurvey; advanced?: EducationSurvey }> = {};
    for (const s of eduSurveys) {
      if (!map[s.student_id]) map[s.student_id] = {};
      if (s.phase === 'intro_end') map[s.student_id].intro = s;
      else if (s.phase === 'advanced_end') map[s.student_id].advanced = s;
    }
    return map;
  }, [eduSurveys]);

  const eduStats = useMemo(() => {
    const introCount = Object.values(eduByStudent).filter(v => v.intro).length;
    const advancedCount = Object.values(eduByStudent).filter(v => v.advanced).length;
    const total = batchStudents.length;

    // avg scores for intro
    const introSurveys = Object.values(eduByStudent).map(v => v.intro).filter(Boolean) as EducationSurvey[];
    const effAvg = introSurveys.length > 0
      ? avg(introSurveys.map(s => avg([s.eff_product, s.eff_customer, s.eff_sales, s.eff_teamwork, s.eff_overall])))
      : null;
    const satAvg = introSurveys.length > 0
      ? avg(introSurveys.map(s => avg([s.sat_content, s.sat_method, s.sat_duration])))
      : null;

    return { introCount, advancedCount, total, effAvg, satAvg };
  }, [eduByStudent, batchStudents]);

  /* ── ansan survey stats ── */
  const ansanByStudent = useMemo(() => {
    const map: Record<string, { pre?: AnsanSurvey; post?: AnsanSurvey }> = {};
    for (const s of ansanSurveys) {
      if (!map[s.student_id]) map[s.student_id] = {};
      if (s.phase === 'pre') map[s.student_id].pre = s;
      else if (s.phase === 'post') map[s.student_id].post = s;
    }
    return map;
  }, [ansanSurveys]);

  const ansanStats = useMemo(() => {
    const preCount = Object.values(ansanByStudent).filter(v => v.pre).length;
    const postCount = Object.values(ansanByStudent).filter(v => v.post).length;
    const total = batchStudents.length;

    // avg knowledge for pre
    const preSurveys = Object.values(ansanByStudent).map(v => v.pre).filter(Boolean) as AnsanSurvey[];
    const knowAvg = preSurveys.length > 0
      ? avg(preSurveys.map(s => avg([s.know_products, s.know_factory, s.know_sofa, s.know_mattress, s.know_steel, s.know_quality, s.know_competitive, s.know_explain, s.know_value])))
      : null;

    // avg satisfaction for post
    const postSurveys = Object.values(ansanByStudent).map(v => v.post).filter(Boolean) as AnsanSurvey[];
    const satAvg = postSurveys.length > 0
      ? avg(postSurveys.map(s => avg([s.sat_process, s.sat_helpful, s.sat_guide, s.sat_operation, s.sat_duration])))
      : null;
    const npsAvg = postSurveys.length > 0
      ? avg(postSurveys.map(s => s.nps))
      : null;

    return { preCount, postCount, total, knowAvg, satAvg, npsAvg };
  }, [ansanByStudent, batchStudents]);

  /* ── modal helpers ── */
  const getStudentEduSurvey = (studentId: string, phase: string) =>
    eduByStudent[studentId]?.[phase === 'intro_end' ? 'intro' : 'advanced'];

  const getStudentAnsanSurvey = (studentId: string, phase: string) =>
    ansanByStudent[studentId]?.[phase === 'pre' ? 'pre' : 'post'];

  /* ── render ── */
  if (loading) {
    return <div style={{ padding: 32 }}><p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>불러오는 중...</p></div>;
  }

  const tabs: [string, string][] = [['ansan', '안성공장 투어'], ['efficacy', '자기효능감 설문']];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          교육설문
        </h2>
        <select
          value={selectedBatchId}
          onChange={e => setSelectedBatchId(e.target.value)}
          style={selectStyle}
        >
          {batches.map(b => (
            <option key={b.id} value={b.id}>{b.name}{b.is_archived ? ' (보관)' : ''}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {tabs.map(([key, label], i) => (
          <button
            key={key}
            onClick={() => setTab(key as 'efficacy' | 'ansan')}
            style={{
              padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,
              background: 'transparent',
              color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none',
              borderBottom: tab === key ? '2px solid var(--blue)' : '2px solid transparent',
              fontSize: 15,
              fontWeight: tab === key ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              marginBottom: -1,
            }}
          >{label}</button>
        ))}
      </div>

      {/* Content */}
      {tab === 'efficacy' ? (
        <EfficacyTab
          students={batchStudents}
          stats={eduStats}
          byStudent={eduByStudent}
          onClickStudent={(s) => { setSelectedStudent(s); setModalTab('intro_end'); }}
        />
      ) : (
        <AnsanTab
          students={batchStudents}
          stats={ansanStats}
          byStudent={ansanByStudent}
          onClickStudent={(s) => { setSelectedStudent(s); setModalTab('pre'); }}
        />
      )}

      {/* Modal */}
      {selectedStudent && (
        <DetailModal
          student={selectedStudent}
          tab={tab}
          modalTab={modalTab}
          setModalTab={setModalTab}
          getEdu={getStudentEduSurvey}
          getAnsan={getStudentAnsanSurvey}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   자기효능감 설문 탭
   ════════════════════════════════════════ */
function EfficacyTab({ students, stats, byStudent, onClickStudent }: {
  students: Student[];
  stats: { introCount: number; advancedCount: number; total: number; effAvg: number | null; satAvg: number | null };
  byStudent: Record<string, { intro?: EducationSurvey; advanced?: EducationSurvey }>;
  onClickStudent: (s: Student) => void;
}) {
  // 입문 vs 심화 비교 데이터
  const introSurveys = Object.values(byStudent).map(v => v.intro).filter(Boolean) as EducationSurvey[];
  const advSurveys = Object.values(byStudent).map(v => v.advanced).filter(Boolean) as EducationSurvey[];

  const compareData = EFF_LABELS.map(l => {
    const introAvg = avg(introSurveys.map(s => (s as unknown as Record<string, number | null>)[l.key] as number | null));
    const advAvg = avg(advSurveys.map(s => (s as unknown as Record<string, number | null>)[l.key] as number | null));
    return { label: l.label, intro: introAvg, advanced: advAvg };
  });

  const satCompare = SAT_LABELS.map(l => {
    const introAvg = avg(introSurveys.map(s => (s as unknown as Record<string, number | null>)[l.key] as number | null));
    const advAvg = avg(advSurveys.map(s => (s as unknown as Record<string, number | null>)[l.key] as number | null));
    return { label: l.label, intro: introAvg, advanced: advAvg };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 1줄 요약 */}
      <SummaryRow4
        items={[
          { label: '입문설문', value: `${stats.introCount}/${stats.total}`, color: stats.introCount === stats.total ? 'var(--green)' : 'var(--blue)' },
          { label: '심화설문', value: `${stats.advancedCount}/${stats.total}`, color: stats.advancedCount === stats.total ? 'var(--green)' : 'var(--blue)' },
          { label: '자기효능감', value: fmtAvg(stats.effAvg), color: 'var(--blue)' },
          { label: '교육만족도', value: fmtAvg(stats.satAvg), color: 'var(--purple)' },
        ]}
      />

      {/* 2열: 자기효능감 변화 + 교육만족도 변화 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        {/* 자기효능감 변화 */}
        <div style={cardStyle}>
          <p style={categoryLabel}>자기효능감 변화</p>
          <SurveyInsights data={compareData} type="efficacy" />
          <CompareRadarChart data={compareData} labelA="입문" labelB="심화" colorA="var(--blue)" colorB="var(--purple)" />
          <div style={{ marginTop: 16 }}>
            <DetailChangeList data={compareData} labelA="입문" labelB="심화" colorA="var(--blue)" colorB="var(--purple)" />
          </div>
        </div>

        {/* 교육만족도 변화 */}
        <div style={cardStyle}>
          <p style={categoryLabel}>교육만족도 변화</p>
          <SurveyInsights data={satCompare} type="edu-satisfaction" />
          <CompareRadarChart data={satCompare} labelA="입문" labelB="심화" colorA="var(--blue)" colorB="var(--purple)" />
          <div style={{ marginTop: 16 }}>
            <DetailChangeList data={satCompare} labelA="입문" labelB="심화" colorA="var(--blue)" colorB="var(--purple)" />
          </div>
        </div>
      </div>

      {/* 제출현황 */}
      <div style={cardStyle}>
        <SubmissionTable
          students={students}
          surveyName="자기효능감 설문"
          surveyType="efficacy"
          phaseMap={{ intro: 'intro_end', advanced: 'advanced_end' }}
          columns={[
            { key: 'intro', label: '입문' },
            { key: 'advanced', label: '심화' },
          ]}
          getStatus={(s, col) => {
            const data = byStudent[s.id];
            if (col === 'intro') return !!data?.intro;
            return !!data?.advanced;
          }}
          onClickStudent={onClickStudent}
        />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   안성공장 투어 탭
   ════════════════════════════════════════ */
function AnsanTab({ students, stats, byStudent, onClickStudent }: {
  students: Student[];
  stats: { preCount: number; postCount: number; total: number; knowAvg: number | null; satAvg: number | null; npsAvg: number | null };
  byStudent: Record<string, { pre?: AnsanSurvey; post?: AnsanSurvey }>;
  onClickStudent: (s: Student) => void;
}) {
  const preSurveys = Object.values(byStudent).map(v => v.pre).filter(Boolean) as AnsanSurvey[];
  const postSurveys = Object.values(byStudent).map(v => v.post).filter(Boolean) as AnsanSurvey[];

  // 사전 vs 사후 지식 비교
  const knowCompare = KNOW_LABELS.map(l => {
    const preAvg = avg(preSurveys.map(s => (s as unknown as Record<string, number | null>)[l.key] as number | null));
    const postAvg = avg(postSurveys.map(s => (s as unknown as Record<string, number | null>)[l.key] as number | null));
    return { label: l.label, intro: preAvg, advanced: postAvg };
  });

  // 사후 만족도
  const satData = ANSAN_SAT_LABELS.map(l => {
    const postAvg = avg(postSurveys.map(s => (s as unknown as Record<string, number | null>)[l.key] as number | null));
    return { label: l.label, intro: null, advanced: postAvg };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 1줄 요약 */}
      <SummaryRow4
        items={[
          { label: '사전설문', value: `${stats.preCount}/${stats.total}`, color: stats.preCount === stats.total ? 'var(--green)' : 'var(--blue)' },
          { label: '사후설문', value: `${stats.postCount}/${stats.total}`, color: stats.postCount === stats.total ? 'var(--green)' : 'var(--blue)' },
          { label: '지식평균', value: fmtAvg(stats.knowAvg), color: 'var(--blue)' },
          { label: 'NPS', value: fmtAvg(stats.npsAvg), color: 'var(--orange)' },
        ]}
      />

      {/* 2열: 지식 자가진단 변화 + 사후 만족도 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        {/* 지식 자가진단 변화 */}
        <div style={cardStyle}>
          <p style={categoryLabel}>지식 자가진단 변화</p>
          <SurveyInsights data={knowCompare} type="ansan-knowledge" />
          <CompareRadarChart data={knowCompare} labelA="사전" labelB="사후" colorA="var(--blue)" colorB="var(--green)" />
          <div style={{ marginTop: 16 }}>
            <DetailChangeList data={knowCompare} labelA="사전" labelB="사후" colorA="var(--blue)" colorB="var(--green)" />
          </div>
        </div>

        {/* 사후 만족도 */}
        <div style={cardStyle}>
          <p style={categoryLabel}>사후 만족도</p>
          {stats.postCount > 0 ? (
            <>
              <SurveyInsights data={satData} type="ansan-satisfaction" />
              <CompareRadarChart data={satData} labelA="" labelB="만족도" colorA="var(--blue)" colorB="var(--green)" showSingle />
              <div style={{ marginTop: 16 }}>
                <DetailChangeList data={satData} labelA="" labelB="만족도" colorA="var(--blue)" colorB="var(--green)" showSingle />
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>사후 설문 데이터가 없어요</p>
          )}
        </div>
      </div>

      {/* 제출현황 */}
      <div style={cardStyle}>
        <SubmissionTable
          students={students}
          surveyName="안성공장 투어 설문"
          surveyType="ansan-tour"
          phaseMap={{ pre: 'pre', post: 'post' }}
          columns={[
            { key: 'pre', label: '사전' },
            { key: 'post', label: '사후' },
          ]}
          getStatus={(s, col) => {
            const data = byStudent[s.id];
            if (col === 'pre') return !!data?.pre;
            return !!data?.post;
          }}
          onClickStudent={onClickStudent}
        />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   공통 스타일
   ════════════════════════════════════════ */
const sectionTitle: React.CSSProperties = {
  fontSize: 17, fontWeight: 700, color: 'var(--text-primary)',
  margin: '0 0 16px', letterSpacing: '-0.01em',
};

// 인사이트 위에 얹는 작은 카테고리 라벨 — 사전설문(11)보다 크게, 자간은 요약 라벨과 동일(기본)
const categoryLabel: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: 'var(--text-muted)',
  margin: '0 0 10px',
};

/* ════════════════════════════════════════
   SummaryRow4 — 심화교육 스타일 1줄 요약
   ════════════════════════════════════════ */
function SummaryRow4({ items }: { items: { label: string; value: string; color: string }[] }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
      display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, overflow: 'hidden',
    }}>
      {items.map((s, i) => (
        <div key={i} style={{ padding: '14px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>
            {s.value}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════
   SurveyInsights — 핵심 1줄 인사이트 (긍정 + 아쉬움 엮기)
   ════════════════════════════════════════ */
function SurveyInsights({ data, type }: {
  data: { label: string; intro: number | null; advanced: number | null }[];
  type: 'efficacy' | 'edu-satisfaction' | 'ansan-knowledge' | 'ansan-satisfaction';
}) {
  const insight = useMemo<React.ReactNode | null>(() => {
    const items = data.filter(d => d.advanced != null);
    if (items.length === 0) return null;

    const withDelta = items
      .filter(d => d.intro != null)
      .map(d => ({ ...d, delta: (d.advanced as number) - (d.intro as number) }));

    // 긍정 (가장 크게 오른 것 or 가장 만족한 것)
    let positive: { label: string; value: number; isDelta: boolean } | null = null;
    // 아쉬움 (사후 점수 가장 낮은 것, positive와 다른 label)
    let negative: { label: string; value: number } | null = null;

    if (type === 'efficacy' || type === 'ansan-knowledge') {
      if (withDelta.length > 0) {
        const top = [...withDelta].sort((a, b) => b.delta - a.delta)[0];
        if (top.delta > 0) {
          positive = { label: top.label, value: top.delta, isDelta: true };
        }
      }
      // 상대적 약점: 사후 점수 가장 낮은 것 (positive와 다른 항목)
      const posLabel = positive?.label;
      const bottom = [...items]
        .filter(d => !posLabel || d.label !== posLabel)
        .sort((a, b) => (a.advanced as number) - (b.advanced as number))[0];
      const topPostVal = posLabel
        ? (items.find(d => d.label === posLabel)?.advanced as number | undefined) ?? 5
        : 5;
      // 1) 절대값 4.0 미만 OR 2) 사후 최고점과 0.2 이상 차이날 때 표시
      if (bottom && ((bottom.advanced as number) < 4.0 || (bottom.advanced as number) < topPostVal - 0.2)) {
        negative = { label: bottom.label, value: bottom.advanced as number };
      }
    }

    if (type === 'edu-satisfaction' || type === 'ansan-satisfaction') {
      const top = [...items].sort((a, b) => (b.advanced as number) - (a.advanced as number))[0];
      if (top) {
        positive = { label: top.label, value: top.advanced as number, isDelta: false };
      }
      const bottom = [...items]
        .filter(d => !positive || d.label !== positive.label)
        .sort((a, b) => (a.advanced as number) - (b.advanced as number))[0];
      const topVal = top ? (top.advanced as number) : 5;
      if (bottom && (bottom.advanced as number) < topVal - 0.1) {
        negative = { label: bottom.label, value: bottom.advanced as number };
      }
    }

    // 문구 조립 (한 줄용 — 짧게)
    const posShort = {
      'efficacy': '가 가장 자랐지만,',
      'ansan-knowledge': '가 가장 자랐지만,',
      'edu-satisfaction': '에 가장 만족했지만,',
      'ansan-satisfaction': '이 가장 좋았지만,',
    }[type];

    // 점수 4.0 미만이면 "아직 아쉬워요", 이상이면 "상대적으로 덜 자랐어요/덜 만족했어요"
    const negIsLow = negative != null && negative.value < 4.0;
    const negShort = {
      'efficacy': negIsLow ? '는 아직 아쉬워요' : '는 상대적으로 덜 자랐어요',
      'ansan-knowledge': negIsLow ? '는 아직 아쉬워요' : '는 상대적으로 덜 자랐어요',
      'edu-satisfaction': negIsLow ? '은 아직 아쉬워요' : '은 상대적으로 덜 만족했어요',
      'ansan-satisfaction': negIsLow ? '은 아직 아쉬워요' : '은 상대적으로 덜 만족했어요',
    }[type];

    // 단독일 때 (풀 문장 + 수치)
    const posValue = positive?.value ?? 0;
    const negValue = negative?.value ?? 0;
    const posAloneSuffix = {
      'efficacy': <> 자신감이 가장 많이 자랐어요 <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 16, marginLeft: 4 }}>+{posValue.toFixed(1)}</span></>,
      'ansan-knowledge': <>에 대한 이해가 가장 크게 자랐어요 <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 16, marginLeft: 4 }}>+{posValue.toFixed(1)}</span></>,
      'edu-satisfaction': <>에 가장 만족했어요 <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 16, marginLeft: 4 }}>{posValue.toFixed(1)}</span></>,
      'ansan-satisfaction': <>이 가장 만족스러웠어요 <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 16, marginLeft: 4 }}>{posValue.toFixed(1)}</span></>,
    }[type];

    const negAloneSuffix = {
      'efficacy': <> 자신감은 아직 아쉬워요 <span style={{ color: 'var(--orange)', fontWeight: 700, fontSize: 16, marginLeft: 4 }}>{negValue.toFixed(1)}</span></>,
      'ansan-knowledge': <>은 아직 아쉬워요 <span style={{ color: 'var(--orange)', fontWeight: 700, fontSize: 16, marginLeft: 4 }}>{negValue.toFixed(1)}</span></>,
      'edu-satisfaction': <>은 상대적으로 아쉬웠어요 <span style={{ color: 'var(--orange)', fontWeight: 700, fontSize: 16, marginLeft: 4 }}>{negValue.toFixed(1)}</span></>,
      'ansan-satisfaction': <>은 상대적으로 아쉬웠어요 <span style={{ color: 'var(--orange)', fontWeight: 700, fontSize: 16, marginLeft: 4 }}>{negValue.toFixed(1)}</span></>,
    }[type];

    // 조합 (한 줄 — 수치 없이 라벨+짧은 동사)
    if (positive && negative) {
      return (
        <>
          <span style={{ color: 'var(--green)' }}>{positive.label}</span>{posShort}{' '}
          <span style={{ color: 'var(--orange)' }}>{negative.label}</span>{negShort}
        </>
      );
    }
    if (positive) {
      return (
        <>
          <span style={{ color: 'var(--green)' }}>{positive.label}</span>{posAloneSuffix}
        </>
      );
    }
    if (negative) {
      return (
        <>
          <span style={{ color: 'var(--orange)' }}>{negative.label}</span>{negAloneSuffix}
        </>
      );
    }
    return null;
  }, [data, type]);

  if (!insight) return null;

  return (
    <h2 style={{
      fontSize: 18, fontWeight: 800, color: 'var(--text-primary)',
      margin: '0 0 20px', letterSpacing: '-0.02em', lineHeight: 1.4,
    }}>
      {insight}
    </h2>
  );
}

/* ════════════════════════════════════════
   CollapsibleDetail — "자세히 보기" 토글 래퍼
   ════════════════════════════════════════ */
function CollapsibleDetail({ children, label = '항목별 상세 보기' }: {
  children: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          borderTop: '1px solid var(--border-light)',
          color: 'var(--text-muted)',
          fontSize: 12, fontWeight: 500,
          fontFamily: 'inherit',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        {label}
        <span style={{
          fontSize: 10,
          transition: 'transform 0.2s ease',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>▼</span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   DetailChangeList — 세로 바 차트 (사전/사후 나란히)
   ════════════════════════════════════════ */
function DetailChangeList({ data, labelA, labelB, colorA, colorB, showSingle = false }: {
  data: { label: string; intro: number | null; advanced: number | null }[];
  labelA: string;
  labelB: string;
  colorA: string;
  colorB: string;
  showSingle?: boolean;
}) {
  const chartData = data.map(d => ({
    label: d.label,
    [labelA || '사전']: d.intro ?? 0,
    [labelB || '사후']: d.advanced ?? 0,
    delta: (d.intro != null && d.advanced != null) ? d.advanced - d.intro : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 24, right: 8, bottom: 8, left: 0 }} barGap={2} barCategoryGap="18%">
        <CartesianGrid stroke="var(--border-light)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--text-second)', fontWeight: 500 }}
          interval={0}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 5]}
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
          width={24}
        />
        <Tooltip
          contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          formatter={(value) => typeof value === 'number' ? value.toFixed(1) : String(value)}
        />
        {!showSingle && (
          <Bar dataKey={labelA || '사전'} fill={colorA} radius={[3, 3, 0, 0]} maxBarSize={28} />
        )}
        <Bar dataKey={labelB || '사후'} fill={colorB} radius={[3, 3, 0, 0]} maxBarSize={28}>
          {!showSingle && (
            <LabelList
              dataKey="delta"
              position="top"
              formatter={(v: unknown) => {
                if (typeof v !== 'number') return '';
                if (v > 0) return `+${v.toFixed(1)}`;
                if (v < 0) return v.toFixed(1);
                return '±0';
              }}
              fill="var(--green)"
              fontSize={11}
              fontWeight={700}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ════════════════════════════════════════
   CompareRadarChart — 사전/사후 겹친 레이더 차트
   ════════════════════════════════════════ */
function CompareRadarChart({ data, labelA, labelB, colorA, colorB, showSingle = false }: {
  data: { label: string; intro: number | null; advanced: number | null }[];
  labelA: string;
  labelB: string;
  colorA: string;
  colorB: string;
  showSingle?: boolean; // true면 B만 표시 (사후 단일)
}) {
  const chartData = data.map(d => ({
    label: d.label,
    [labelA]: d.intro ?? 0,
    [labelB]: d.advanced ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-second)', fontWeight: 500 }} />
        <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} angle={90} axisLine={false} />
        <Tooltip
          contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          formatter={(value) => typeof value === 'number' ? value.toFixed(1) : String(value)}
        />
        {!showSingle && (
          <Radar name={labelA} dataKey={labelA} stroke={colorA} fill={colorA} fillOpacity={0.2} strokeWidth={2} />
        )}
        <Radar name={labelB} dataKey={labelB} stroke={colorB} fill={colorB} fillOpacity={0.25} strokeWidth={2} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ════════════════════════════════════════
   SubmissionTable — 제출 현황 카드 그리드 + 일괄 재촉
   ════════════════════════════════════════ */
function SubmissionTable({ students, columns, getStatus, onClickStudent, surveyName, surveyType, phaseMap }: {
  students: Student[];
  columns: { key: string; label: string }[];
  getStatus: (s: Student, colKey: string) => boolean;
  onClickStudent: (s: Student) => void;
  surveyName: string;
  surveyType: 'efficacy' | 'ansan-tour';
  /** column.key → DB phase 매핑 (예: intro → intro_end) */
  phaseMap: Record<string, string>;
}) {
  const [toast, setToast] = useState('');
  const [sendingCol, setSendingCol] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // phase(컬럼) 별 미제출자 목록
  const missingByColumn = columns.map(col => ({
    col,
    students: students.filter(s => !getStatus(s, col.key)),
  }));

  const sendRemindersForColumn = async (col: { key: string; label: string }, targets: Student[]) => {
    if (sendingCol || targets.length === 0) return;
    if (!confirm(`${col.label} 미제출 ${targets.length}명에게 재촉 알림을 보낼까요?`)) return;
    setSendingCol(col.key);
    try {
      const results = await Promise.all(targets.map(student =>
        fetch('/api/survey-reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: student.id,
            survey_type: surveyType,
            phase: phaseMap[col.key],
            survey_name: surveyName,
            phase_label: col.label,
          }),
        }).then(r => r.ok).catch(() => false)
      ));
      const success = results.filter(Boolean).length;
      showToast(`${col.label} 설문 ${success}명에게 재촉 알림을 보냈어요`);
    } catch {
      showToast('알림 전송 실패');
    }
    setSendingCol(null);
  };

  if (students.length === 0) return <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>교육생이 없어요</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 헤더: 제목 + phase별 재촉 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
          제출 현황
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {missingByColumn.map(({ col, students: missing }) => missing.length > 0 && (
            <button
              key={col.key}
              type="button"
              onClick={() => sendRemindersForColumn(col, missing)}
              disabled={sendingCol !== null}
              style={{
                padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                background: sendingCol === col.key ? 'var(--bg-hover)' : 'var(--red)',
                color: sendingCol === col.key ? 'var(--text-muted)' : '#fff',
                border: 'none',
                fontSize: 13, fontWeight: 600,
                cursor: sendingCol ? 'default' : 'pointer',
                opacity: sendingCol && sendingCol !== col.key ? 0.5 : 1,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={e => { if (!sendingCol) e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={e => { if (!sendingCol) e.currentTarget.style.opacity = '1'; }}
            >
              📢 {col.label} 미제출 {missing.length}명 재촉
            </button>
          ))}
        </div>
      </div>

      {/* 카드 그리드 — 컴팩트 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, maxWidth: 1280 }}>
        {students.map(s => {
          const statuses = columns.map(c => ({ col: c, done: getStatus(s, c.key) }));
          const allDone = statuses.every(st => st.done);
          const noneDone = statuses.every(st => !st.done);

          const badgeTone: { bg: string; color: string } = allDone
            ? { bg: 'var(--green-dim)', color: 'var(--green)' }
            : noneDone ? { bg: 'var(--bg-hover)', color: 'var(--text-tertiary)' }
            : { bg: 'var(--orange-dim)', color: 'var(--orange)' };
          const badgeText = allDone ? '모두 완료' : noneDone ? '미제출' : '일부 제출';

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onClickStudent(s)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 10,
                padding: '12px 14px',
                background: 'var(--bg-main)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-main)'; }}
            >
              {/* 1행: 아바타 + 이름 + 전체 뱃지 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                paddingBottom: 8,
                borderBottom: '1px solid var(--border-light)',
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--blue-dim)', color: 'var(--blue)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                }}>{s.name[0]}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                <span style={{
                  padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                  background: badgeTone.bg, color: badgeTone.color,
                  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                }}>{badgeText}</span>
              </div>
              {/* 2행: 세부 pill */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {statuses.map(({ col, done }) => (
                  <span
                    key={col.key}
                    style={{
                      padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                      background: done ? 'var(--green-dim)' : 'var(--bg-hover)',
                      color: done ? 'var(--green)' : 'var(--text-tertiary)',
                      fontSize: 11, fontWeight: 600,
                    }}
                  >
                    {col.label} {done ? '완료' : '미제출'}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 20px', background: 'var(--text-primary)', color: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600,
          boxShadow: 'var(--shadow-lg)', zIndex: 1000,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   DetailModal — 교육생 개별 설문 상세
   ════════════════════════════════════════ */
function DetailModal({ student, tab, modalTab, setModalTab, getEdu, getAnsan, onClose }: {
  student: Student;
  tab: 'efficacy' | 'ansan';
  modalTab: string;
  setModalTab: (t: string) => void;
  getEdu: (sid: string, phase: string) => EducationSurvey | undefined;
  getAnsan: (sid: string, phase: string) => AnsanSurvey | undefined;
  onClose: () => void;
}) {
  const isEfficacy = tab === 'efficacy';
  const phases = isEfficacy
    ? [['intro_end', '입문교육'], ['advanced_end', '심화교육']] as const
    : [['pre', '사전'], ['post', '사후']] as const;

  const survey = isEfficacy
    ? getEdu(student.id, modalTab)
    : getAnsan(student.id, modalTab);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 20px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 880,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px 32px',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 2,
            width: 36, height: 36, minWidth: 36, minHeight: 36, maxWidth: 36, maxHeight: 36,
            boxSizing: 'border-box', padding: 0, margin: 0, flex: 'none',
            borderRadius: '50%', border: 'none',
            background: 'var(--bg-hover)', color: 'var(--text-tertiary)',
            fontSize: 20, lineHeight: '36px', fontWeight: 400, textAlign: 'center', cursor: 'pointer',
          }}
        >×</button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingRight: 44 }}>
          <span style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            background: 'var(--blue-dim)', color: 'var(--blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700,
          }}>{student.name[0]}</span>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              {student.name}
            </h2>
            {student.store_name && (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>{student.store_name}</p>
            )}
          </div>
        </div>

        {/* Phase tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {phases.map(([key, label], i) => (
            <button
              key={key}
              onClick={() => setModalTab(key)}
              style={{
                padding: `8px 20px 12px ${i === 0 ? '0px' : '20px'}`,
                background: 'transparent',
                color: modalTab === key ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none',
                borderBottom: modalTab === key ? '2px solid var(--blue)' : '2px solid transparent',
                fontSize: 15,
                fontWeight: modalTab === key ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                marginBottom: -1,
              }}
            >{label}</button>
          ))}
        </div>

        {/* Content */}
        {!survey ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: 'var(--text-tertiary)' }}>아직 제출하지 않았어요</p>
          </div>
        ) : isEfficacy ? (
          <EfficacyDetail survey={survey as EducationSurvey} />
        ) : (
          <AnsanDetail survey={survey as AnsanSurvey} />
        )}
      </div>
    </div>
  );
}

/* ── Efficacy Detail ── */
function EfficacyDetail({ survey }: { survey: EducationSurvey }) {
  const rec = survey as unknown as Record<string, unknown>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Efficacy scores */}
      <div>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>자기효능감</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {EFF_LABELS.map(l => (
            <ScoreItem key={l.key} label={l.label} question={l.question} value={rec[l.key] as number | null} max={5} />
          ))}
        </div>
      </div>

      {/* Satisfaction scores */}
      <div>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>교육 만족도</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SAT_LABELS.map(l => (
            <ScoreItem key={l.key} label={l.label} question={l.question} value={rec[l.key] as number | null} max={5} />
          ))}
        </div>
      </div>

      {/* Open answers */}
      <div>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>주관식 응답</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {OPEN_LABELS.map(l => (
            <div key={l.key} style={{ padding: '12px 16px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', margin: '0 0 2px' }}>{l.label}</p>
              <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 8px' }}>{l.question}</p>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {(rec[l.key] as string) || '(미작성)'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        제출일: {fmtDate(survey.created_at)}
      </p>
    </div>
  );
}

/* ── Ansan Detail ── */
function AnsanDetail({ survey }: { survey: AnsanSurvey }) {
  const rec = survey as unknown as Record<string, unknown>;
  const isPre = survey.phase === 'pre';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Knowledge scores */}
      <div>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>지식 자가진단</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {KNOW_LABELS.map(l => (
            <ScoreItem key={l.key} label={l.label} question={l.question} value={rec[l.key] as number | null} max={5} />
          ))}
        </div>
      </div>

      {isPre ? (
        /* Pre: curiosity questions */
        <div>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>궁금한 점</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ANSAN_CURIOSITY_LABELS.map(l => (
              <div key={l.key} style={{ padding: '12px 16px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', margin: '0 0 2px' }}>{l.label}</p>
                <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 8px' }}>{l.question}</p>
                <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {(rec[l.key] as string) || '(미작성)'}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Post: satisfaction + NPS + open answers */
        <>
          <div>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>만족도</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ANSAN_SAT_LABELS.map(l => (
                <ScoreItem key={l.key} label={l.label} question={l.question} value={rec[l.key] as number | null} max={5} />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', flex: 1, minWidth: 150 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', margin: '0 0 4px' }}>NPS (추천 점수)</p>
              <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 6px' }}>이 투어를 다른 신입 사원에게 추천하고 싶은 정도</p>
              <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--orange)', margin: 0 }}>
                {survey.nps != null ? survey.nps : '-'}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>/ 10</span>
              </p>
            </div>
            <div style={{ padding: '12px 16px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', flex: 1, minWidth: 150 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', margin: '0 0 4px' }}>가장 인상적인 라인</p>
              <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {survey.best_line || '-'}
              </p>
              {survey.best_reason && (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '4px 0 0', lineHeight: 1.5 }}>{survey.best_reason}</p>
              )}
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>체험 후 소감</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ANSAN_POST_LABELS.map(l => (
                <div key={l.key} style={{ padding: '12px 16px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', margin: '0 0 2px' }}>{l.label}</p>
                  <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 8px' }}>{l.question}</p>
                  <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {(rec[l.key] as string) || '(미작성)'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        제출일: {fmtDate(survey.created_at)}
      </p>
    </div>
  );
}

/* ── ScoreItem ── */
function ScoreItem({ label, question, value, max }: { label: string; question?: string; value: number | null; max: number }) {
  const pct = value != null ? (value / max) * 100 : 0;
  return (
    <div style={{ padding: '10px 14px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', margin: '0 0 2px' }}>{label}</p>
      {question && (
        <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.4 }}>{question}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--blue)' : 'var(--orange)',
            borderRadius: 'var(--radius-sm)',
            transition: 'width 0.3s ease',
          }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          {value != null ? value : '-'}
        </span>
      </div>
    </div>
  );
}
