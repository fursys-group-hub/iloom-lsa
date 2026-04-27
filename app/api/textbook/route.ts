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

  // 통계 함께 (limit 명시 — Supabase 기본 1000건 제한 우회)
  const { data: classifs } = await supabase
    .from('textbook_classifications')
    .select('series_name')
    .limit(50000);
  const noteCount: Record<string, number> = {};
  for (const c of classifs || []) {
    noteCount[c.series_name] = (noteCount[c.series_name] || 0) + 1;
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
