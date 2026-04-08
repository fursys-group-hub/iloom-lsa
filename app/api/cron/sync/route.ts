import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { syncBatch, type SyncResult } from '@/lib/sync';

/**
 * GET /api/cron/sync
 * 진행중인 기수의 구글 시트를 자동 동기화
 * Authorization: Bearer <CRON_SECRET> 헤더 필수
 */
export async function GET(req: NextRequest) {
  // 인증 체크
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET이 설정되지 않았습니다.' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: '인증 실패' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const today = new Date().toISOString().slice(0, 10);

    // 진행중인 기수 조회 (입문교육 또는 심화교육 기간)
    const { data: batches } = await supabase
      .from('batches')
      .select('id, name, sheet_id, start_date, end_date, advanced_start, advanced_end');

    if (!batches || batches.length === 0) {
      return Response.json({ message: '기수가 없습니다.', results: [] });
    }

    // 진행중인 기수 필터 (sheet_id가 있는 것만)
    const activeBatches = batches.filter((b) => {
      if (!b.sheet_id) return false;
      const inIntro = b.start_date <= today && today <= b.end_date;
      const inAdvanced = b.advanced_start && b.advanced_end
        ? b.advanced_start <= today && today <= b.advanced_end
        : false;
      return inIntro || inAdvanced;
    });

    if (activeBatches.length === 0) {
      return Response.json({ message: '진행중인 기수가 없습니다.', results: [] });
    }

    // 각 기수별 동기화
    const results: { batchName: string; result: SyncResult | { error: string } }[] = [];

    for (const batch of activeBatches) {
      try {
        const result = await syncBatch(batch.sheet_id, 'today', 'new_only');
        results.push({ batchName: batch.name, result });
      } catch (err) {
        results.push({
          batchName: batch.name,
          result: { error: err instanceof Error ? err.message : '알 수 없는 오류' },
        });
      }
    }

    return Response.json({
      message: `${activeBatches.length}개 기수 동기화 완료`,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ error: `Cron 동기화 실패: ${message}` }, { status: 500 });
  }
}
