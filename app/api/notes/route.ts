import { NextRequest } from 'next/server';
import { createServerClient, getSupabase } from '@/lib/supabase';

// content JSON 구조: { blocks: Block[], meta: { tags, confidence } }
// 하위호환: 기존 plain text도 지원

function packContent(
  content: string,
  tags?: string[],
  confidence?: string | null,
  contentType?: string,
  extraMeta?: Record<string, unknown>,
): string {
  // steps 형식: STEP 1/2/3 구조
  if (contentType === 'steps') {
    try {
      const steps = JSON.parse(content);
      return JSON.stringify({ steps, meta: { tags: tags || [], confidence: confidence || null, ...extraMeta } });
    } catch { /* fallback to text */ }
  }
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
      // 새 형식: steps + meta (노션 임포트 + 앱 작성)
      if (parsed.steps) {
        const meta = parsed.meta || {};
        const steps = parsed.steps;
        // 참여점수 자동 계산: 내용이 있는 STEP 수 (0~3)
        const autoScore = [
          steps.step1?.trim(),
          steps.step2?.trim(),
          steps.step3?.trim(),
        ].filter(Boolean).length;
        return {
          ...row,
          content: JSON.stringify(parsed.steps),
          content_type: 'steps',
          tags: meta.tags || [],
          confidence: meta.confidence || null,
          participation_score: autoScore,
          best_learning: autoScore >= 3,
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
  const { student_id, title, content, tags, confidence, content_type, participation_score, best_learning, one_word } = await req.json();

  if (!student_id || !title || !content) {
    return Response.json({ message: '제목과 내용을 입력해주세요.' }, { status: 400 });
  }

  const supabase = createServerClient();

  // 교육일지(자율학습 아님)는 하루 1개 제한
  const isSelfStudy = Array.isArray(tags) && tags.includes('자율학습');
  if (!isSelfStudy) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabase
      .from('student_notes')
      .select('id, content')
      .eq('student_id', student_id)
      .gte('created_at', `${today}T00:00:00`)
      .lt('created_at', `${today}T23:59:59.999`);
    // 오늘 교육일지(자율학습 제외)가 이미 있으면 거부
    const hasRegularNote = existing?.some(n => {
      try { const p = JSON.parse(n.content); return !(p.meta?.tags || []).includes('자율학습'); } catch { return true; }
    });
    if (hasRegularNote) {
      return Response.json({ message: '오늘은 이미 교육일지를 작성했어요! 수정하려면 기존 일지를 눌러주세요.' }, { status: 409 });
    }
  }

  const extraMeta = { participation_score, best_learning, one_word };
  const { data, error } = await supabase
    .from('student_notes')
    .insert({ student_id, title, content: packContent(content, tags, confidence, content_type, extraMeta) })
    .select('*')
    .single();

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ note: unpackContent(data), message: '저장 완료!' });
}

// 노트 수정
export async function PATCH(req: NextRequest) {
  const { id, title, content, tags, confidence, content_type, participation_score, best_learning, one_word } = await req.json();

  const supabase = createServerClient();
  const extraMeta = { participation_score, best_learning, one_word };
  const { error } = await supabase
    .from('student_notes')
    .update({ title, content: packContent(content, tags, confidence, content_type, extraMeta), updated_at: new Date().toISOString() })
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
