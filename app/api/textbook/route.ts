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

  const { data, error } = await supabase
    .from('textbook_chapters')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) return Response.json({ message: error.message }, { status: 500 });

  // 통계 — Supabase PostgREST의 max-rows 제한(기본 1000)을 .range() 페이지네이션으로 우회
  const PAGE = 1000;
  const noteCount: Record<string, number> = {};
  for (let from = 0; ; from += PAGE) {
    const { data: classifs, error: cErr } = await supabase
      .from('textbook_classifications')
      .select('series_name')
      .range(from, from + PAGE - 1);
    if (cErr) return Response.json({ message: cErr.message }, { status: 500 });
    if (!classifs || classifs.length === 0) break;
    for (const c of classifs) {
      noteCount[c.series_name] = (noteCount[c.series_name] || 0) + 1;
    }
    if (classifs.length < PAGE) break;
  }

  return Response.json({
    chapters: data || [],
    note_counts: noteCount,
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
