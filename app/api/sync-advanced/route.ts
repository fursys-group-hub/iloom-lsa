import { NextRequest } from 'next/server';
import { syncAdvancedBatch } from '@/lib/sync-advanced';

export async function POST(req: NextRequest) {
  try {
    const { batch_id } = await req.json();

    if (!batch_id) {
      return Response.json({ message: 'batch_id가 필요합니다.' }, { status: 400 });
    }

    const result = await syncAdvancedBatch(batch_id);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ message: `심화교육 동기화 실패: ${message}` }, { status: 500 });
  }
}
