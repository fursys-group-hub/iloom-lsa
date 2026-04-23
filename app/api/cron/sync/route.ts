import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { syncBatch, type SyncResult } from '@/lib/sync';
import { syncAdvancedBatch, type AdvancedSyncResult } from '@/lib/sync-advanced';

/**
 * GET /api/cron/sync
 * 진행중인 기수의 구글 시트를 자동 동기화
 *  - 입문교육 (start_date ~ end_date): sheet_id 기반, sync-today / new_only
 *  - 심화교육 (advanced_start ~ advanced_end): advanced_sheet_id 기반, 전체 upsert
 * Authorization: Bearer <CRON_SECRET> 헤더 필수
 */
export async function GET(req: NextRequest) {
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
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

    const { data: batches } = await supabase
      .from('batches')
      .select('id, name, sheet_id, advanced_sheet_id, start_date, end_date, advanced_start, advanced_end');

    if (!batches || batches.length === 0) {
      return Response.json({ message: '기수가 없습니다.', results: [] });
    }

    type PerBatchResult = {
      batchName: string;
      intro?: SyncResult | { error: string };
      advanced?: AdvancedSyncResult | { error: string };
    };
    const results: PerBatchResult[] = [];

    for (const batch of batches) {
      const inIntro = batch.sheet_id && batch.start_date <= today && today <= batch.end_date;
      const inAdvanced =
        batch.advanced_sheet_id &&
        batch.advanced_start &&
        batch.advanced_end &&
        batch.advanced_start <= today &&
        today <= batch.advanced_end;

      if (!inIntro && !inAdvanced) continue;

      const entry: PerBatchResult = { batchName: batch.name };

      if (inIntro) {
        try {
          entry.intro = await syncBatch(batch.sheet_id, 'today', 'new_only');
        } catch (err) {
          entry.intro = { error: err instanceof Error ? err.message : '알 수 없음' };
        }
      }

      if (inAdvanced) {
        try {
          entry.advanced = await syncAdvancedBatch(batch.id);
        } catch (err) {
          entry.advanced = { error: err instanceof Error ? err.message : '알 수 없음' };
        }
      }

      results.push(entry);
    }

    if (results.length === 0) {
      return Response.json({ message: '진행중인 기수가 없습니다.', results: [] });
    }

    return Response.json({
      message: `${results.length}개 기수 동기화 완료`,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ error: `Cron 동기화 실패: ${message}` }, { status: 500 });
  }
}
