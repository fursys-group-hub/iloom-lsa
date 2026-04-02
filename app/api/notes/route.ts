import { NextRequest } from 'next/server';
import { createServerClient, getSupabase } from '@/lib/supabase';
import { getKSTDayRange, getKSTToday } from '@/lib/date';

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
        const isPractice = (meta.tags || []).includes('실습일지');
        // 참여점수 자동 계산: 실습일지는 4개 섹션, 교육일지는 3개 STEP
        const autoScore = isPractice
          ? [steps.step1?.trim(), steps.step2?.trim(), steps.step3?.trim(), steps.step4?.trim()].filter(Boolean).length
          : [steps.step1?.trim(), steps.step2?.trim(), steps.step3?.trim()].filter(Boolean).length;
        const maxScore = isPractice ? 4 : 3;
        return {
          ...row,
          content: JSON.stringify(parsed.steps),
          content_type: 'steps',
          tags: meta.tags || [],
          confidence: meta.confidence || null,
          participation_score: autoScore,
          participation_max: maxScore,
          best_learning: autoScore >= maxScore,
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

  const { data, error } = await query.limit(all ? 2000 : 100);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ notes: (data || []).map(unpackContent) });
}

// 노트 생성
export async function POST(req: NextRequest) {
  const { student_id, title, content, tags, confidence, content_type, participation_score, best_learning, one_word, target_date } = await req.json();

  if (!student_id || !title || !content) {
    return Response.json({ message: '제목과 내용을 입력해주세요.' }, { status: 400 });
  }

  const supabase = createServerClient();

  // 하루 1개 제한: 교육일지/실습일지 각각 독립, 자율학습은 무제한
  const isSelfStudy = Array.isArray(tags) && tags.includes('자율학습');
  const isPractice = Array.isArray(tags) && tags.includes('실습일지');
  if (!isSelfStudy) {
    const { start, end } = getKSTDayRange(target_date || undefined);
    const { data: existing } = await supabase
      .from('student_notes')
      .select('id, content')
      .eq('student_id', student_id)
      .gte('created_at', start)
      .lt('created_at', end);
    const hasSameType = existing?.some(n => {
      try {
        const p = JSON.parse(n.content);
        const noteTags = p.meta?.tags || [];
        if (noteTags.includes('자율학습')) return false;
        // 실습일지끼리, 교육일지끼리만 충돌
        const noteIsPractice = noteTags.includes('실습일지');
        return isPractice ? noteIsPractice : !noteIsPractice;
      } catch { return !isPractice; }
    });
    if (hasSameType) {
      const label = isPractice ? '실습일지' : '교육일지';
      const dateLabel = target_date || getKSTToday();
      return Response.json({ message: `${dateLabel}에 이미 ${label}를 작성했어요! 수정하려면 기존 일지를 눌러주세요.` }, { status: 409 });
    }
  }

  const extraMeta = { participation_score, best_learning, one_word };
  // target_date가 있으면 해당 날짜 정오(KST)로 created_at 설정
  const insertData: Record<string, unknown> = {
    student_id, title, content: packContent(content, tags, confidence, content_type, extraMeta),
  };
  if (target_date) {
    insertData.created_at = new Date(`${target_date}T12:00:00+09:00`).toISOString();
  }
  const { data, error } = await supabase
    .from('student_notes')
    .insert(insertData)
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
