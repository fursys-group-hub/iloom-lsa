import { NextRequest } from 'next/server';
import { fetchSheetData } from '@/lib/sheets';

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!apiKey) {
      return Response.json({ message: 'API KEY 미설정' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const sheetId = searchParams.get('sheetId');
    const session = searchParams.get('session');
    const name = searchParams.get('name');

    if (!sheetId) {
      return Response.json({ message: 'sheetId 필요' }, { status: 400 });
    }

    // 상세_로그 전체 가져오기
    const rows = await fetchSheetData(sheetId, '상세_로그!A:L', apiKey);
    if (rows.length <= 1) {
      return Response.json({ details: [] });
    }

    // 헤더 제외, 파싱
    const details = rows.slice(1).map((row) => ({
      timestamp: row[0] || '',
      session: row[1] || '',
      name: row[2] || '',
      questionId: row[3] || '',
      question: row[4] || '',
      userAnswer: row[5] || '',
      correctAnswer: row[6] || '',
      isCorrect: row[7] === 'O',
      earnedScore: parseFloat(row[8]) || 0,
      maxScore: parseFloat(row[9]) || 0,
      type: row[10] || '',
      dept: row[11] || '',
    }));

    // 필터 적용
    let filtered = details;
    if (session) {
      filtered = filtered.filter((d) => d.session === session);
    }
    if (name) {
      filtered = filtered.filter((d) => d.name === name);
    }

    return Response.json({ details: filtered });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ message }, { status: 500 });
  }
}
