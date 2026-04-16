-- 설문 재촉 알림 테이블
-- 관리자가 미제출 교육생에게 "재촉" 버튼 클릭 시 생성
-- 교육생 홈 화면에 배너로 표시됨

CREATE TABLE IF NOT EXISTS survey_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  survey_type TEXT NOT NULL,   -- 'efficacy' | 'ansan-tour'
  phase TEXT NOT NULL,         -- 'intro_end' | 'advanced_end' | 'pre' | 'post'
  survey_name TEXT NOT NULL,   -- UI 표시용 "자기효능감 설문" 등
  phase_label TEXT NOT NULL,   -- UI 표시용 "입문" "사전" 등
  message TEXT,                -- 커스텀 메시지 (선택)
  created_at TIMESTAMPTZ DEFAULT now(),
  dismissed_at TIMESTAMPTZ     -- 학생이 읽고 넘겼을 때 or 제출 완료 시
);

CREATE INDEX IF NOT EXISTS idx_survey_reminders_student ON survey_reminders(student_id);
CREATE INDEX IF NOT EXISTS idx_survey_reminders_active
  ON survey_reminders(student_id)
  WHERE dismissed_at IS NULL;
