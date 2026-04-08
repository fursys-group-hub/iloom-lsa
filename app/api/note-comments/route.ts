import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { isBatchArchived } from '@/lib/archive-check';

// GET /api/note-comments?note_id=xxx  또는  ?note_ids=id1,id2,id3
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const noteId = req.nextUrl.searchParams.get('note_id');
    const noteIds = req.nextUrl.searchParams.get('note_ids');

    if (noteId) {
      const { data, error } = await supabase
        .from('note_comments')
        .select('*')
        .eq('note_id', noteId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (noteIds) {
      const ids = noteIds.split(',').filter(Boolean);
      const { data, error } = await supabase
        .from('note_comments')
        .select('*')
        .in('note_id', ids)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return NextResponse.json(data);
    }

    return NextResponse.json([]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/note-comments
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await req.json();

    // 아카이브 체크: 학생이 코멘트를 달 때, note의 student_id로 체크
    if (body.author_role === 'student' && body.note_id) {
      const { data: note } = await supabase
        .from('student_notes').select('student_id').eq('id', body.note_id).single();
      if (note && await isBatchArchived(supabase, note.student_id)) {
        return NextResponse.json({ error: '보관된 기수입니다. 수정할 수 없습니다.' }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from('note_comments')
      .insert({
        note_id: body.note_id,
        author_role: body.author_role,
        author_name: body.author_name,
        content: body.content,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/note-comments?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await supabase.from('note_comments').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
