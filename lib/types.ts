export interface Batch {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  advanced_start: string | null;
  advanced_end: string | null;
  sheet_id: string | null;
  subject_columns: Record<string, { column: string; maxScore: number }>;
  is_archived: boolean;
  archived_at: string | null;
}

export interface Student {
  id: string;
  batch_id: string;
  name: string;
  department: string | null;
  email: string | null;
  company_email: string | null;
  phone: string | null;
  store_location: string | null;
  is_dropped: boolean;
  dropped_at: string | null;
  drop_reason: string | null;
}

export interface TestScore {
  id: string;
  student_id: string;
  test_date: string;
  subject: string;
  score: number;
  max_score: number;
}

export interface Attendance {
  id: string;
  student_id: string;
  date: string;
  status: 'present' | 'late' | 'early_leave' | 'absent';
  note: string | null;
}

export interface StudentMemo {
  id: string;
  student_id: string;
  date: string;
  content: string;
  category: 'general' | 'behavior' | 'counsel' | 'praise' | 'caution';
  created_at?: string;
}

export const MEMO_CATEGORIES = {
  behavior: { label: '수업태도', emoji: '📋', color: 'var(--blue)' },
  counsel: { label: '상담', emoji: '💬', color: 'var(--purple)' },
  praise: { label: '칭찬', emoji: '⭐', color: 'var(--green)' },
  caution: { label: '주의', emoji: '⚠️', color: 'var(--orange)' },
  general: { label: '일반', emoji: '📝', color: 'var(--text-tertiary)' },
} as const;

export interface WrongAnswer {
  id: string;
  student_id: string;
  test_date: string;
  subject: string;
  question_summary: string | null;
  tags: string[];
  created_at: string;
}

export type ReportType = 'daily' | 'subject' | 'weekly' | 'comprehensive';

export interface CoachingReport {
  id: string;
  student_id: string;
  test_date: string;
  student_message: string;
  manager_report: string;
  tag_tracking: TagTracking | null;
  report_type: ReportType;
  report_group_id: string | null;
  subject: string | null;
  created_at: string;
}

export interface TagTracking {
  overcome: string[];
  newWeak: string[];
  chronic: string[];
}

export interface StudentNote {
  id: string;
  student_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  name: string;
  role: 'admin' | 'manager' | 'student';
  student_id: string | null;
  manager_id: string | null;
  store_name: string | null;
}

export interface Manager {
  id: string;
  name: string;
  password: string;
  store_name: string | null;
  created_at: string;
}

export interface WeeklyEvaluation {
  id: string;
  student_id: string;
  manager_id: string;
  week_number: number;
  rp_area: string | null;
  status: 'completed' | 'not_completed' | 'partial';
  strength_tags: string[];
  improvement_tags: string[];
  comment: string | null;
  created_at: string;
  updated_at: string;
}

// 평가 태그 상수
export const STRENGTH_TAG_OPTIONS = [
  '고객 라포형성 우수',
  '제품 지식 풍부',
  '자신감 있는 상담',
  '주문서 작성 정확',
  'SCT 활용 능숙',
  '업셀링 적극적',
  '차분하고 친절한 응대',
  '자가 학습 의지 높음',
  '고객 니즈 파악 우수',
  '빠르고 정확한 상담',
] as const;

export const IMPROVEMENT_TAG_OPTIONS = [
  '제품 디테일 미흡',
  '자신감 부족',
  '주문서 작성 누락',
  '소재/컬러 미숙지',
  'SCT 활용 미숙',
  '프로모션 등록 누락',
  '사이즈 숙지 필요',
  '업셀링 보완 필요',
  '옵션/액세서리 미숙지',
  '상담 흐름 개선 필요',
] as const;

export const RP_AREA_OPTIONS = [
  '학생방',
  '다이닝',
  '소파',
  '침실',
  '옷장',
  '거실',
  '헤이븐',
  '홈라이브러리',
  '서재',
  '학생방 업셀링',
] as const;

export interface Benchmark {
  id: string;
  student_id: string;
  week_number: number;
  target_name: string;
  target_role: string | null;
  store_name: string | null;
  learnings: string;
  action_plan: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinalEvaluation {
  id: string;
  student_id: string;
  manager_id: string;
  overall_rating: number;
  summary: string;
  strengths: string | null;
  areas_to_develop: string | null;
  recommended_position: string | null;
  store_fit_score: number;
  independence_score: number;
  customer_score: number;
  product_score: number;
  created_at: string;
  updated_at: string;
}

// 질문하기
export interface StudentQuestion {
  id: string;
  student_id: string;
  title: string;
  status: 'open' | 'answered' | 'resolved' | 'archived';
  created_at: string;
  updated_at: string;
  // join
  student_name?: string;
}

export interface QuestionReply {
  id: string;
  question_id: string;
  author_role: 'admin' | 'student';
  author_name: string;
  content: string;
  created_at: string;
}

// 학생 + 집계 데이터
export interface StudentWithStats extends Student {
  avg_score: number;
  recent_scores: TestScore[];
  risk_level: 'high' | 'medium' | 'low';
  absent_count: number;
  late_count: number;
}

// 교육 효과 분석용
export interface AdaptationIndex {
  studentId: string;
  studentName: string;
  total: number;           // 종합 적응 지수 (0~100)
  group: 'high' | 'mid' | 'low';  // 상/중/하
  breakdown: {
    examAvg: number;       // 시험 평균 (0~100)
    weakCategories: number; // 하위 분야 점수 (0~100) — 60점 미만 분야가 적을수록 높음
    weakCategoryCount: number; // 60점 미만 분야 개수 (원본)
    totalCategories: number;   // 전체 분야 개수
    attendanceRate: number; // 출석률 (0~100)
    participation: number;  // 교육일지 참여 (0~100)
    participationDetail: string; // 근거 텍스트 (예: "15일 중 15일 제출")
    confidenceTrend: number; // 자신감 추이 (0~100)
    confidenceDetail: string; // 근거 텍스트 (예: "높음3→보통5→낮음2, 하락")
    hasConfidenceData: boolean; // 자신감 데이터 있는지
  };
}

export interface RiskCheck {
  studentId: string;
  studentName: string;
  checks: {
    label: string;
    triggered: boolean;
    value: string;
  }[];
  riskCount: number;
}

// Google Sheets 파싱용
export interface SheetQuestion {
  session: string;      // 차시
  number: number;       // 문제번호
  category: string;     // 대분류
  series: string;       // 시리즈
  detail: string;       // 상세
  question: string;     // 질문_메인
  options: string[];    // 보기
  answer: string[];     // 정답
  grading_mode: string; // 채점모드
  points: number;       // 배점
  explanation: string;  // 해설
  image_url: string | null;
}

export interface SheetResult {
  timestamp: string;
  session: string;      // 차시
  name: string;
  score: number;
  max_score: number;
  score_100: number;
  wrong_note: string;   // 오답노트 원문
}

export interface ParsedWrongAnswer {
  question_number: number;
  question_text: string;
  submitted: string;
  correct_answer: string;
  explanation: string;
}
