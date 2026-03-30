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
node scripts/import-education-logs.js
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

인증: POST `/api/auth` → localStorage `iloom-auth` 저장. 각 layout.tsx에서 role 체크.

### Page Structure

- `/dashboard/` — 슈퍼관리자: 홈, 교육생, 출결, 테스트, 교육일지, 리포트, 심화교육 종합, 기수 관리
- `/manager/` — 매장관리자: 홈(성장추이), R&P 평가, 교육 총평
- `/my/` — 교육생: 홈, 출결, 테스트, 교육일지, 심화교육(준비중)

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
| `GET/POST /api/notes` | 교육일지. content는 JSON packed: `{ steps: {...}, meta: {...} }` 또는 `{ blocks: [...], meta: {...} }` |
| `POST /api/attendance` | 엑셀 업로드 → 출결 파싱 |

### Database (Supabase)

스키마: `supabase/schema.sql`. 주요 테이블:

**입문교육**: batches, students, test_scores, attendance, student_notes, questions, test_responses, coaching_reports
**심화교육**: managers, weekly_evaluations, benchmarks, final_evaluations

Supabase 클라이언트: `lib/supabase.ts` — `getSupabase()` (anon key), `createServerClient()` (service role key)

### Notes Content Format

`student_notes.content`는 3가지 형식 중 하나:
1. **steps** (노션 임포트): `{ steps: { step1, step2, step3, step1_completed, ... }, meta: { tags, confidence, participation_score, ... } }`
2. **blocks** (앱 작성): `{ blocks: [...], meta: { tags, confidence } }`
3. **plain text**: 그냥 문자열

`/api/notes`의 `unpackContent()`가 이를 파싱하여 `content_type` 필드를 추가해 반환.

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

## Known Issues / In Progress

- **교육일지 표시 버그**: steps 형식 content가 JSON 원본으로 보이는 문제. `content_type` 전달 확인 필요
- **교육생 STEP별 작성 기능**: 현재 노션에서 작성 → 마크다운 임포트. 앱 내 직접 작성 기능 미구현
- **심화교육 시험**: 구글 시트 연동 예정. 시험 점수 섹션은 빈칸으로 마련됨
- **입문/심화 홈 분리**: 기수별 홈 화면 구성이 달라질 수 있음

## Conventions

- 스타일: CSS 변수 (`var(--bg-surface)` 등) + 인라인 스타일. globals.css에 다크모드 변수 정의
- 폰트: Pretendard, 최소 13px (12px 이하 금지)
- 컴포넌트: 페이지 파일 안에 로컬 컴포넌트로 정의 (별도 파일 분리 최소화)
- API 응답: `/api/scores`는 `{ scores: [...] }` 래핑. 프론트에서 `.scores` 또는 fallback 처리 필요
