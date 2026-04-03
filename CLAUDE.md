# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

일룸(iloom) 신입사원(LSA) 교육 관리 대시보드. 입문교육 시험/출결/교육일지 관리 + 심화교육(매장 배치 후) R&P 평가/벤치마킹/총평을 통합 관리하는 웹 앱.

## Commands

```bash
npm run dev          # http://localhost:3000 개발 서버
npm run build        # 프로덕션 빌드
npm run lint         # ESLint
node --watch server  # 없음 — Next.js dev 서버 사용

# 교육일지 노션 마크다운 임포트
node scripts/import-education-logs.js   # 최초 임포트 (날짜-이름 패턴만)
node scripts/reimport-all-notes.js      # 전체 재임포트 (기본 템플릿 포함, 중복 스킵)
node scripts/fix-all-notes.js           # 중첩 aside 재파싱 (내용 증가분만 업데이트)
```

## Tech Stack

- **Next.js 16.2** (App Router) + TypeScript + React 19
- **Supabase** (PostgreSQL) — DB + 인증 없음 (자체 auth)
- **Recharts** — 차트
- **XLSX** — 엑셀 파싱/내보내기
- **TailwindCSS 4** — globals.css에 CSS 변수 정의, 인라인 스타일 혼용
- **배포**: Railway (GitHub main push → 자동 재배포)

## Architecture

### 3-tier Role System

| Role | Login | Route | Scope |
|------|-------|-------|-------|
| `admin` (슈퍼관리자) | 하드코딩 (김수지) | `/dashboard/**` | 전체 |
| `manager` (매장관리자/교육TF) | `managers` 테이블 | `/manager/**` | 전체 교육생 조회 + 평가 작성 |
| `student` (교육생) | `students` 테이블 | `/my/**` | 자기 데이터만 |

인증: POST `/api/auth` → localStorage `iloom-auth` 저장 (`{ role, name, studentId?, batchId?, managerId? }`). 각 layout.tsx에서 role 체크.

### Page Structure

- `/dashboard/` — 슈퍼관리자: 홈, 교육생, 출결, 테스트, 교육일지, 질문관리, 실습일지, 리포트, 심화교육 종합, 공지사항, 기수 관리
- `/manager/` — 매장관리자: 홈(성장추이), R&P 평가, 교육 총평
- `/my/` — 교육생: 홈(+공지 팝업), 공지사항, 출결, 테스트, 교육일지, 질문하기, 실습일지, 심화교육(준비중)

### Data Flow

```
Google Sheets (구글 폼 응답)
  ↓ POST /api/sync (date 필터 + mode: full|new_only)
Supabase (questions, test_scores, test_responses, students)
  ↓ GET /api/scores, /api/test-responses, etc.
Dashboard UI (Recharts 차트, 테이블)
```

### Key API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/sync` | Google Sheets → DB 동기화. `mode: 'new_only'`면 기존 건 안 건드림 |
| `GET /api/scores` | 시험 점수 조회. `{ scores: [...] }` 형태 반환 (배열 아님 주의) |
| `GET/POST /api/evaluations` | 주차별 R&P 평가 CRUD. `DELETE ?id=` 지원 |
| `GET/POST /api/final-evaluations` | 교육 총평 CRUD |
| `GET/POST /api/benchmarks` | 벤치마킹 CRUD |
| `GET/POST /api/notes` | 교육일지+실습일지. content는 JSON packed: `{ steps: {...}, meta: {...} }`. 교육일지/실습일지 각각 하루 1개 제한 (서로 독립), 자율학습(`자율학습` 태그)은 무제한. `all=true`면 리밋 2000건 |
| `GET/POST/DELETE /api/note-comments` | 교육일지 코멘트 (관리자↔교육생 대화). `?note_id=` 또는 `?note_ids=id1,id2` 일괄 조회 |
| `GET/POST/PATCH/DELETE /api/announcements` | 공지사항 CRUD. `?batch_id=` 기수별 필터. priority: normal/important/urgent |
| `GET/POST /api/batches` | 기수 CRUD. `advanced_start`/`advanced_end` 컬럼으로 심화교육 일정 관리 |
| `GET/POST/DELETE /api/student-memos` | 교육자 메모 (학생 상세 페이지, 관리자 전용 비공개). category: behavior/counsel/praise/caution/general |
| `GET/POST/PATCH/DELETE /api/student-questions` | 질문하기 스레드 CRUD. `?all=true` 관리자 전체 조회. `?question_id=` 단일+답글. `?reply_id=` 답글 수정/삭제 |
| `POST /api/attendance` | 엑셀 업로드 → 출결 파싱 |

### Database (Supabase)

스키마: `supabase/schema.sql`. 주요 테이블:

**입문교육**: batches, students, test_scores, attendance, student_notes, note_comments, announcements, questions, test_responses, coaching_reports, student_memos, student_questions, question_replies
**심화교육**: managers, weekly_evaluations, benchmarks, final_evaluations

**batches 테이블**: `start_date`/`end_date` = 입문교육 일정, `advanced_start`/`advanced_end` = 심화교육 일정 (ALTER TABLE로 추가, schema.sql 미반영)

Supabase 클라이언트: `lib/supabase.ts` — `getSupabase()` (anon key), `createServerClient()` (service role key)

### Notes Content Format

`student_notes.content`는 3가지 형식 중 하나:
1. **steps** (노션 임포트 + 앱 작성): `{ steps: { step1, step2, step3, step1_completed, ... }, meta: { tags, confidence, ... } }`
2. **blocks** (레거시): `{ blocks: [...], meta: { tags, confidence } }`
3. **plain text**: 그냥 문자열

`/api/notes`의 `unpackContent()`가 이를 파싱하여 `content_type` 필드를 추가해 반환.

**참여점수**: `step1_completed` 체크박스가 아닌 **내용 유무(`step1.trim()`)로 자동 계산**. 완료 체크 버튼 없음.

**자율학습 노트**: `tags`에 `자율학습` 포함 시 차별화 UI (보라색 테마, 참여점수/자신감 숨김, STEP 1만 표시). 하루 제한 없이 자유롭게 작성 가능.

**날짜 선택 드롭다운**: 새 작성 시 최근 7일 중 날짜 선택 가능. 기본값: 새벽 5시 이전=전날, 이후=오늘. `target_date`를 API에 전달 → 해당 날짜 기준으로 중복 체크 + `created_at`을 정오(KST)로 설정. 수정 시에는 드롭다운 미표시.

### Practice Notes (실습일지)

`student_notes` 테이블에 `실습일지` 태그로 저장. 교육일지와 별도 페이지 (`/my/practice`, `/dashboard/practice`).
- **4개 텍스트 섹션**: step1(기억에 남는 고객) / step2(선배 비법) / step3(칭찬) / step4(보완)
- **4개 숫자 필드**: `stats_consult`(상담건수), `stats_estimate`(견적건수), `stats_order`(수주건수), `stats_amount`(수주금액)
- **선택 필드**: `order_detail`(상담/수주 내역 텍스트)
- **참여점수**: 4개 섹션 기준 (0~4), `participation_max: 4`로 API 반환
- **중복 체크**: 교육일지/실습일지 각각 독립 (같은 날 교육일지 1개 + 실습일지 1개 가능)
- **관리자 뷰**: 날짜별 필터, 전체 실적 합계, 제출현황, 교육생별 실적 뱃지, 코멘트
- 교육일지 페이지에서는 실습일지 제외 (`tags.includes('실습일지')` 필터링)

### Home Dashboard

- **기수 드롭다운**: 우상단 select로 기수 선택, 6년치 쌓여도 깔끔
- **D-day 뱃지**: 입문교육 몇일차 / 종료까지 D-n 표시
- **진행 상태 자동 판정**: 오늘 날짜 기준으로 입문교육 진행중 / 심화교육 진행중 / 매장 배치 대기 / 완료 / 예정
- **교육 일정 타임라인**: 입문(파란) | 심화(보라) 일정 바
- **기수별 데이터 필터링**: 선택한 기수의 학생/점수/출결만 표시
- **2컬럼 메인**: 왼쪽(차시별 평균, 추이 차트, 주의 교육생) / 오른쪽(교육일지 제출현황, 실습일지 실적, 질문관리, 최근 공지, 교육생 답글)
- **주의 교육생**: 2열 그리드 컴팩트 + 📝 메모 수 표시 + 위험/주의 뱃지 우측 정렬
- **질문관리 카드**: 대기 질문 수 빨간 뱃지 + 최근 4개 미리보기

### Evaluation Tags

`lib/types.ts`에 `STRENGTH_TAG_OPTIONS`, `IMPROVEMENT_TAG_OPTIONS`, `RP_AREA_OPTIONS` 상수 정의. 매장관리자가 버튼 클릭으로 태그 선택.

## Environment Variables (.env.local)

```
GOOGLE_SHEETS_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

### Announcements (공지사항)

`announcements` 테이블. 관리자가 기수별로 공지 작성 (priority: normal/important/urgent).
- 관리자: `/dashboard/announcements` — 기수별 작성/수정/삭제, 우선순위 3단계
- 교육생 홈: 로그인 시 안 본 공지 팝업 (localStorage `iloom-announce-seen`으로 추적)
- 교육생: `/my/announcements` — 전체 공지 모아보기 (아코디언, NEW 뱃지)

### Note Comments (교육일지 코멘트)

`note_comments` 테이블. 관리자↔교육생 대화형 코멘트.
- 관리자 교육일지: 노트 펼치면 코멘트 입력, iMessage 스타일 말풍선, 자기 코멘트 삭제 가능
- 교육생 교육일지: 관리자 코멘트가 있을 때만 표시 + 답글 가능
- 노트 카드에 💬 코멘트 수 뱃지 표시 (양쪽)

### Student Questions (질문하기)

`student_questions` + `question_replies` 테이블. 학생↔관리자 Q&A.
- **학생** `/my/ask`: 왼쪽 질문 목록 + 오른쪽 채팅. 새 질문/답글/수정/삭제
- **관리자** `/dashboard/questions`: iMessage 스타일. 학생=좌측회색, 관리자=우측파란 말풍선
- 상태: `open`(대기 🟠) → 관리자 답변 → `answered`(답변완료 🟢). 2단계만 사용 (resolved 제거됨)
- hover 시 수정/삭제 팝업 (자기 메시지만)
- 홈 대시보드에 질문관리 카드 (대기 수 뱃지 + 최근 4개)

### Student Memos (교육자 메모)

`student_memos` 테이블. 관리자 전용 비공개 관찰 기록.
- 학생 상세 페이지(`/dashboard/students/[id]`)에 📝 교육 메모 섹션
- 카테고리: behavior(수업태도) / counsel(상담) / praise(칭찬) / caution(주의) / general(일반)
- `MEMO_CATEGORIES` 상수 (lib/types.ts): 라벨, 이모지, 색상 포함
- 홈 대시보드 주의 교육생에 📝 메모 수 표시

### Student Management (기수관리 퇴사/비번)

기수관리 페이지(`/dashboard/settings`)에서**만** 퇴사/비번 관리 가능 (교육생 페이지에서는 제거됨):
- **퇴사 처리**: 모달(퇴사일+사유) → `is_dropped=true` → 퇴사자 반투명+취소선 표시
- **비밀번호 초기화**: 🔑 버튼 → '0000'으로 리셋
- **복구**: 퇴사자 행에 복구 버튼 표시

**퇴사자 반영 범위** (전 페이지 통일):
- 교육일지: 제출현황에서 제외, 드롭다운에 (퇴사) 표시
- 실습일지: 제출현황에서 제외, opacity 0.4 표시
- 테스트: `activeStudents`로 퇴사자 제외 (응시 인원/성적표)
- 출결: 퇴사자 행 opacity 0.4 + 퇴사 뱃지, "확인 필요한 교육생"에서 제외
- 심화교육: 전체 교육생 수에서 제외, 교육생 목록에서 제외
- 홈 대시보드: 퇴사자 별도 카드 표시, 모든 통계에서 제외

## Known Issues / In Progress

- **심화교육 시험**: 구글 시트 연동 예정. 시험 점수 섹션은 빈칸으로 마련됨
- **노션 export 불완전**: 일부 교육생의 마크다운 파일이 노션 export 시 내용 잘림 (파서 문제 아님). 수동 입력 필요

## Conventions

- 스타일: CSS 변수 (`var(--bg-surface)` 등) + 인라인 스타일. globals.css에 다크모드 변수 정의
- 폰트: Pretendard, 기본 14px, 최소 13px (12px 이하 금지)
- 컴포넌트: 페이지 파일 안에 로컬 컴포넌트로 정의 (별도 파일 분리 최소화)
- API 응답: `/api/scores`는 `{ scores: [...] }` 래핑. 프론트에서 `.scores` 또는 fallback 처리 필요
