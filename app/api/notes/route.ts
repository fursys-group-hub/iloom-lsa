import { NextRequest } from 'next/server';
import { createServerClient, getSupabase } from '@/lib/supabase';

// content JSON 구조: { blocks: Block[], meta: { tags, confidence } }
// 하위호환: 기존 plain text도 지원

function packContent(content: string, tags?: string[], confidence?: string | null): string {
  try {
    const parsed = JSON.parse(content);
    // 이미 블록 배열이면 meta와 합쳐서 저장
    if (Array.isArray(parsed)) {
      return JSON.stringify({ blocks: parsed, meta: { tags: tags || [], confidence: confidence || null } });
    }
  } catch { /* plain text */ }
  return JSON.stringify({ text: content, meta: { tags: tags || [], confidence: confidence || null } });
}

function unpackContent(row: Record<string, unknown>): Record<string, unknown> {
  const content = row.content as string;
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      // 새 형식: steps + meta (노션 임포트)
      if (parsed.steps) {
        const meta = parsed.meta || {};
        return {
          ...row,
          content: JSON.stringify(parsed.steps),
          content_type: 'steps',
          tags: meta.tags || [],
          confidence: meta.confidence || null,
          participation_score: meta.participation_score ?? null,
          best_learning: meta.best_learning ?? false,
          one_word: meta.one_word || null,
        };
      }
      // 기존 형식: blocks + meta
      if (parsed.blocks || parsed.text) {
        const meta = parsed.meta || {};
        return {
          ...row,
          content: parsed.blocks ? JSON.stringify(parsed.blocks) : parsed.text,
          content_type: parsed.blocks ? 'blocks' : 'text',
          tags: meta.tags || [],
          confidence: meta.confidence || null,
        };
      }
    }
  } catch { /* plain text */ }
  return { ...row, content_type: 'text', tags: [], confidence: null };
}

// 노트 조회
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');
  const all = searchParams.get('all');

  const supabase = getSupabase();
  let query = supabase.from('student_notes').select('*, students(name)').order('created_at', { ascending: false });

  if (studentId && !all) query = query.eq('student_id', studentId);

  const { data, error } = await query.limit(100);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ notes: (data || []).map(unpackContent) });
}

// 노트 생성
export async function POST(req: NextRequest) {
  const { student_id, title, content, tags, confidence } = await req.json();

  if (!student_id || !title || !content) {
    return Response.json({ message: '제목과 내용을 입력해주세요.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('student_notes')
    .insert({ student_id, title, content: packContent(content, tags, confidence) })
    .select('*')
    .single();

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ note: unpackContent(data), message: '저장 완료!' });
}

// 노트 수정
export async function PATCH(req: NextRequest) {
  const { id, title, content, tags, confidence } = await req.json();

  const supabase = createServerClient();
  const { error } = await supabase
    .from('student_notes')
    .update({ title, content: packContent(content, tags, confidence), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ message: '수정 완료!' });
}

// 노트 삭제
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  const supabase = createServerClient();
  const { error } = await supabase.from('student_notes').delete().eq('id', id);

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ message: '삭제 완료!' });
}
