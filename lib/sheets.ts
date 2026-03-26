import type { SheetResult, ParsedWrongAnswer } from './types';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// Google Sheets에서 데이터 가져오기
export async function fetchSheetData(
  sheetId: string,
  range: string,
  apiKey: string
): Promise<string[][]> {
  const url = `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Sheets API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.values || [];
}

// 결과_db 탭 파싱
export function parseResultRows(rows: string[][]): SheetResult[] {
  // 첫 행은 헤더, 건너뜀
  return rows.slice(1).map((row) => ({
    timestamp: row[0] || '',
    session: row[1] || '',
    name: row[2] || '',
    score: parseFloat(row[3]) || 0,
    max_score: parseFloat(row[4]) || 0,
    score_100: parseFloat(row[5]) || 0,
    wrong_note: row[6] || '',
  }));
}

// 오답노트 파싱 — 핵심 로직
export function parseWrongNote(wrongNote: string): ParsedWrongAnswer[] {
  if (!wrongNote.trim()) return [];

  // Q숫자. 로 문제 분리
  const questionBlocks = wrongNote.split(/(?=Q\d+\.)/).filter((b) => b.trim());

  return questionBlocks.map((block) => {
    const lines = block.trim().split('\n');

    // Q번호 추출
    const headerMatch = lines[0].match(/Q(\d+)\.\s*(.*)/);
    const questionNumber = headerMatch ? parseInt(headerMatch[1]) : 0;
    const questionText = headerMatch ? headerMatch[2].trim() : lines[0];

    // 필드 추출
    let submitted = '';
    let correctAnswer = '';
    let explanation = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^-\s*제출\s*:/)) {
        submitted = trimmed.replace(/^-\s*제출\s*:\s*/, '').trim();
      } else if (trimmed.match(/^-\s*정답\s*:/)) {
        correctAnswer = trimmed.replace(/^-\s*정답\s*:\s*/, '').trim();
      } else if (trimmed.match(/^-\s*해설\s*:/)) {
        explanation = trimmed.replace(/^-\s*해설\s*:\s*/, '').trim();
      }
    }

    return {
      question_number: questionNumber,
      question_text: questionText,
      submitted,
      correct_answer: correctAnswer,
      explanation,
    };
  });
}

// 문제_db와 조인하여 태그 매핑
export function mapQuestionToTags(
  questionNumber: number,
  session: string,
  questionDb: string[][]
): string[] {
  // questionDb: [차수, 번호, 소문항ID, 대분류, 시리즈, 상세, ...]
  const row = questionDb.find(
    (r) => r[0] === session && parseInt(r[1]) === questionNumber
  );
  if (!row) return [];

  const tags: string[] = [];
  if (row[3]) tags.push(row[3]); // 대분류
  if (row[4] && row[4] !== '공통') tags.push(row[4]); // 시리즈
  if (row[5]) tags.push(row[5]); // 상세
  return tags;
}
