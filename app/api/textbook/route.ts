import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * 챕터 CRUD
 * GET ?series=...   : 단건 조회
 * GET (no params)   : 전체 목록
 * PATCH             : { series_name, html_content?, status? }
 * DELETE ?series=...: 챕터 삭제
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const series = searchParams.get('series');

  const supabase = createServerClient();

  if (series) {
    const { data, error } = await supabase
      .from('textbook_chapters')
      .select('*')
      .eq('series_name', series)
      .maybeSingle();
    if (error) return Response.json({ message: error.message }, { status: 500 });
    return Response.json({ chapter: data });
  }

  // 3개 쿼리 병렬 실행 — html_content 제외(목록에선 불필요), classifications 한 번에 조회
  const [chaptersRes, classifRes, guidesRes] = await Promise.all([
    supabase
      .from('textbook_chapters')
      .select('id, series_name, category, status, generated_at, updated_at')
      .order('updated_at', { ascending: false }),
    supabase
      .from('textbook_classifications')
      .select('series_name')
      .limit(50000),
    supabase
      .from('textbook_product_guide')
      .select('page_id, sub_pages')
      .not('sub_pages', 'is', null),
  ]);

  if (chaptersRes.error) return Response.json({ message: chaptersRes.error.message }, { status: 500 });

  const noteCount: Record<string, number> = {};
  for (const c of classifRes.data || []) {
    noteCount[c.series_name] = (noteCount[c.series_name] || 0) + 1;
  }

  const subPagesByPid: Record<number, Array<{ page_id: number; title: string; url: string }>> = {};
  for (const g of guidesRes.data || []) {
    if (Array.isArray(g.sub_pages) && g.sub_pages.length > 0) {
      subPagesByPid[g.page_id] = g.sub_pages;
    }
  }

  return Response.json({
    chapters: chaptersRes.data || [],
    note_counts: noteCount,
    sub_pages_by_pid: subPagesByPid,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { series_name, html_content, status } = body;
  if (!series_name) return Response.json({ message: 'series_name 필요' }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof html_content === 'string') update.html_content = html_content;
  if (typeof status === 'string' && ['draft', 'reviewing', 'final'].includes(status)) {
    update.status = status;
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('textbook_chapters')
    .update(update)
    .eq('series_name', series_name);
  if (error) return Response.json({ message: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const series = searchParams.get('series');
  if (!series) return Response.json({ message: 'series 필요' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from('textbook_chapters').delete().eq('series_name', series);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
