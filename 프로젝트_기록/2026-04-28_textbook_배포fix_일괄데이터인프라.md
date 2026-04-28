# 2026-04-28 — 교육내용정리 배포 안정화 + 일괄 데이터 인프라

## ✅ 오늘 한 것

전날(4/27) 코펜하겐 챕터 만들고 push 직전에 멈춘 상태에서 시작 — 푸시 → Railway 배포 후 발견된 4가지 누락 fix → 일괄 데이터 인프라 구축으로 이어짐.

### 1. 어제 작업 push (commit `3621391`)

- 41 files changed, 4,846 insertions
- `.gitignore` 보강: `practice-rewrites.json` (학생 실명), `기존자료/` (622MB), `textbook/output/` (5.9MB) 제외
- 교육내용정리 기능 전체 (API 6개, 페이지 3개, 라이브러리 3개, 스크립트 11개)

### 2. Railway 배포 후 4건 fix

#### 🔧 fix #1: 카탈로그 JSON 누락 (commit `e83746e`)

- **증상**: 통합교재 페이지 "판매 시리즈: 0개"
- **원인**: `public/iloom-catalog.json` (94KB)이 단순 untracked 였음 — gitignore 아님, 그냥 add 안 했던 것
- **해결**: 카탈로그 + `public/textbook-images/` 일단 gitignore 추가 (이때 이미지는 미사용으로 잘못 판단)

#### 🔧 fix #2: PostgREST max-rows 1000건 캡 (commit `9076ca8`)

- **증상**: 통계 카드 "분류된 일지: 1,000건" (실제 DB는 1,836건)
- **원인**: Supabase PostgREST가 클라이언트 `.limit(50000)` 설정을 max-rows 1000으로 덮어씀
- **해결**: `.range(from, from+999)` 페이지네이션으로 우회 — `app/api/textbook/route.ts`, `notes-pool/route.ts`
- **검증 도구**: `scripts/check-row-counts.mjs` 추가 — `student_notes` 303 / `classifications` 1,836 / `test_responses` 8,413

#### 🔧 fix #3: 챕터 이미지 깨짐 (commit `51648ba`)

- **증상**: 챕터 색상 칩 31개 모두 X 아이콘
- **원인**: 챕터 HTML이 `/textbook-images/...` 경로 참조하는데 폴더가 gitignore돼있었음 (어제 fix #1에서 잘못 추가)
- **분석 실수**: 처음에 `grep textbook-images`로 코드만 검색 → 미사용 판단. **DB 안 `html_content`까지 확인했어야**
- **해결**: gitignore에서 `public/textbook-images/` 제거 + 31개 파일(16MB) 커밋 + `scripts/check-chapter-images.mjs` 추가

#### 🔧 fix #4: 카탈로그 "스톤 |" → "스톤" (commit `e015ce6`)

- **증상**: 메인 페이지에 "스톤 |" 카드와 "스톤" 카드가 따로 보임 (사용자 발견)
- **원인**: 카탈로그 page_id=22819의 series_name이 "스톤 |"로 잘못 들어감
- **해결**: JSON 파일 직접 수정 — page_id 22819, 40634 둘 다 "스톤"으로 통일 (page_id 다르므로 두 카드 모두 표시됨, 우측은 "온라인" 라벨로 구분)

### 3. 일괄 데이터 인프라 구축 (commit `e015ce6`)

다음 챕터(로이/뉴트/링키플러스 등) 만들 때 사양 정보를 매번 크롤링하지 않고 DB에서 즉시 가져올 수 있게 미리 다 채워놓는 작업.

#### 새 테이블 2개 (`supabase/textbook-bulk.sql`)

**A. `textbook_set_master` — ERP 4,106행**
- PK: (set_code, set_color)
- 컬럼: 세트코드/색상/명칭/품목군/시리즈/판매채널/규격상세
- 시리즈 136개, 시리즈별 평균 30행
- 업로드: `scripts/textbook/upload-set-master.mjs` 1.8초 완료

**B. `textbook_product_guide` — WordPress 5탭 캐시**
- PK: page_id
- 컬럼: tab1~tab5 (각각 JSONB로 본문/표/이미지 모두 보관)
- fetch_status: ok / partial / error 추적
- 일괄 크롤링: `scripts/textbook/fetch-all-product-guides.mjs`
- 옵션: `--force` (전체 재크롤링) / `--resume` (실패만 재시도) / `--limit N` (테스트)

#### 일괄 크롤링 진행

- 테스트 3개: 24초 (시리즈당 8초)
- 전체 175개 백그라운드 실행 시작 — ETA 약 23분
- 시리즈당 평균 ~2,400자 텍스트 + 3개 표 + 20개 이미지 수집됨

## 🤔 결정한 것

- **이미지는 미리 다 안 받음** — 175 × 16MB = 2.8GB라 부담. 챕터 만들 때만 다운로드
- **세트마스터·제품가이드 텍스트만 미리 채움** — 9MB 수준, 한 번 1.5시간 작업으로 끝
- **재실행 안전성** — fetch-all-product-guides.mjs가 이미 ok인 시리즈는 자동 스킵

## ⏭️ 다음에 할 것

1. **크롤링 완료 확인** + 실패 시리즈 `--resume`으로 재시도
2. **Supabase Storage 인프라 구축** — bucket 생성, 챕터 HTML의 이미지 경로 일괄 치환, download-images.mjs를 Storage 모드로 수정
3. **자동 챕터 생성 통합 스크립트** (`generate-chapter.mjs`) — DB에서 사양/제품가이드 즉시 가져와서 HTML 템플릿 자동 채움
4. **우선순위 시리즈 일괄 생성** (로이 → 뉴트 → 링키플러스 → 에디 → 팅클팝)

## 📝 메모: 분석 실수 회고

오늘 fix #3에서 "textbook-images가 코드에서 안 쓰임"이라고 잘못 판단함. 원인은 grep 검색 시 코드 파일만 봤고 DB의 html_content를 안 봤기 때문.

**교훈**: HTML/마크다운/JSON 같은 데이터 필드 안에 들어있는 경로 참조는 grep으로 안 잡힘. 데이터까지 확인해야 함.
