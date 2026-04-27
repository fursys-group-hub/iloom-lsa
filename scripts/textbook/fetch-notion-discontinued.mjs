// 2-1) Notion DB에서 시리즈별 단종/사양변경 정보 가져오기
// 사용법: node scripts/textbook/fetch-notion-discontinued.mjs 코펜하겐

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 2-1) 프로젝트의 .env 사용 (NOTION_TOKEN 거기 있음)
const ENV_PATH = path.resolve(__dirname, '../../../../2. 일룸 교육자료 준비/1) 단종품 사양변경 확인/.env');
config({ path: ENV_PATH });

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;

if (!NOTION_TOKEN || !PARENT_PAGE_ID) {
  console.error('NOTION_TOKEN 또는 NOTION_PARENT_PAGE_ID 환경변수 누락');
  process.exit(1);
}

const seriesName = process.argv[2] || '코펜하겐';
const OUT_DIR = path.resolve(__dirname, 'output', `series-${seriesName}`);
await fs.mkdir(OUT_DIR, { recursive: true });

const headers = {
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
};

async function notionApi(path, body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// 1) 부모 페이지의 children 조회 → DB 찾기
console.log('[1] 부모 페이지 children 조회...');
const children = await notionApi(`/blocks/${PARENT_PAGE_ID}/children?page_size=100`);
const dbs = children.results.filter((b) => b.type === 'child_database');
console.log(`   발견된 DB: ${dbs.length}개`);
for (const db of dbs) console.log(`   - ${db.child_database.title} (${db.id})`);

if (dbs.length === 0) {
  console.error('DB가 없습니다.');
  process.exit(1);
}

// 2) 각 DB에서 시리즈명으로 필터 검색
const allItems = [];
for (const db of dbs) {
  console.log(`\n[2] ${db.child_database.title} 검색: 시리즈=${seriesName}`);
  try {
    // 우선 시리즈 select 필터로 시도
    const res = await notionApi(`/databases/${db.id}/query`, {
      filter: {
        property: '시리즈',
        select: { equals: seriesName },
      },
      page_size: 100,
    });
    console.log(`   매칭: ${res.results.length}건`);
    for (const item of res.results) {
      allItems.push({ db_id: db.id, db_title: db.child_database.title, ...item });
    }
  } catch (e) {
    // 시리즈 필드가 select가 아닐 수 있음 → rich_text로 재시도
    console.log(`   select 필터 실패: ${e.message.slice(0, 80)}`);
    try {
      const res = await notionApi(`/databases/${db.id}/query`, {
        filter: {
          property: '시리즈',
          rich_text: { contains: seriesName },
        },
        page_size: 100,
      });
      console.log(`   rich_text 매칭: ${res.results.length}건`);
      for (const item of res.results) {
        allItems.push({ db_id: db.id, db_title: db.child_database.title, ...item });
      }
    } catch (e2) {
      console.log(`   rich_text 필터도 실패: ${e2.message.slice(0, 80)}`);
    }
  }
}

// 3) 각 항목의 주요 속성 추출
const summaries = allItems.map((item) => {
  const props = item.properties || {};
  const get = (name) => {
    const p = props[name];
    if (!p) return null;
    if (p.type === 'title') return p.title.map((t) => t.plain_text).join('');
    if (p.type === 'rich_text') return p.rich_text.map((t) => t.plain_text).join('');
    if (p.type === 'select') return p.select?.name || null;
    if (p.type === 'multi_select') return p.multi_select.map((s) => s.name);
    if (p.type === 'number') return p.number;
    if (p.type === 'date') return p.date?.start || null;
    if (p.type === 'url') return p.url;
    return null;
  };
  return {
    db: item.db_title,
    page_id: item.id,
    판매코드: get('판매코드'),
    단품명: get('단품명'),
    구분: get('구분'),
    시리즈: get('시리즈'),
    대분류: get('대분류'),
    품목: get('품목'),
    색상: get('색상'),
    단종사유: get('단종사유'),
    단종예정일: get('단종예정일'),
    신규코드: get('신규코드'),
    소비자가: get('소비자가'),
    EP원문: get('EP원문'),
    문서번호: get('문서번호'),
    제목: get('제목'),
    작성일: get('작성일'),
  };
});

await fs.writeFile(path.join(OUT_DIR, 'notion.json'), JSON.stringify(summaries, null, 2), 'utf-8');

console.log(`\n=== 결과: ${seriesName} 단종/사양변경 정보 ${summaries.length}건 ===`);
for (const s of summaries.slice(0, 10)) {
  console.log(`\n  [${s.db}]`);
  for (const [k, v] of Object.entries(s)) {
    if (k === 'db' || k === 'page_id') continue;
    if (v != null && v !== '') console.log(`    ${k}: ${v}`);
  }
}
console.log(`\n✅ 저장: ${OUT_DIR}/notion.json`);
