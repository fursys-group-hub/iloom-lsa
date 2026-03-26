export interface Batch {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  sheet_id: string | null;
  subject_columns: Record<string, { column: string; maxScore: number }>;
}

export interface Student {
  id: string;
  batch_id: string;
  name: string;
  department: string | null;
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
  category: 'general' | 'strength' | 'weakness' | 'behavior';
}

export interface WrongAnswer {
  id: string;
  student_id: string;
  test_date: string;
  subject: string;
  question_summary: string | null;
  tags: string[];
  created_at: string;
}

export interface CoachingReport {
  id: string;
  student_id: string;
  test_date: string;
  student_message: string;
  manager_report: string;
  tag_tracking: TagTracking | null;
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
  role: 'educator' | 'manager' | 'student';
  student_id: string | null;
}

// 학생 + 집계 데이터
export interface StudentWithStats extends Student {
  avg_score: number;
  recent_scores: TestScore[];
  risk_level: 'high' | 'medium' | 'low';
  absent_count: number;
  late_count: number;
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
