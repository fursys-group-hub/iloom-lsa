import { NextRequest } from 'next/server';
import { syncBatch } from '@/lib/sync';

export async function POST(req: NextRequest) {
  try {
    const { sheetId, date, mode } = await req.json();

    if (!sheetId) {
      return Response.json({ message: 'sheetId가 필요합니다.' }, { status: 400 });
    }

    const filterDate = date === 'today' ? 'today' : date || null;
    const result = await syncBatch(sheetId, filterDate, mode || 'full');

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ message: `동기화 실패: ${message}` }, { status: 500 });
  }
}
