import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET /api/student-questions?student_id=xxx  또는  ?all=true (관리자용)  또는  ?question_id=xxx
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const studentId = req.nextUrl.searchParams.get('student_id');
    const all = req.nextUrl.searchParams.get('all');
    const questionId = req.nextUrl.searchParams.get('question_id');

    // 단일 질문 + 답글 조회
    if (questionId) {
      const [{ data: question, error: qErr }, { data: replies, error: rErr }] = await Promise.all([
        supabase.from('student_questions').select('*, students(name)').eq('id', questionId).single(),
        supabase.from('question_replies').select('*').eq('question_id', questionId).order('created_at', { ascending: true }),
      ]);
      if (qErr) throw qErr;
      if (rErr) throw rErr;
      return NextResponse.json({
        ...question,
        student_name: question.students?.name,
        students: undefined,
        replies: replies || [],
      });
    }

    // 전체 질문 목록 (관리자)
    if (all === 'true') {
      const { data, error } = await supabase
        .from('student_questions')
        .select('*, students(name)')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const questions = (data || []).map((q: Record<string, unknown>) => ({
        ...q,
        student_name: (q.students as Record<string, unknown>)?.name,
        students: undefined,
      }));

      // 각 질문의 답글 수
      const ids = questions.map((q: Record<string, unknown>) => q.id as string);
      const replyCounts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: counts } = await supabase
          .from('question_replies')
          .select('question_id')
          .in('question_id', ids);
        if (counts) {
          for (const c of counts) {
            replyCounts[c.question_id] = (replyCounts[c.question_id] || 0) + 1;
          }
        }
      }

      return NextResponse.json(questions.map((q: Record<string, unknown>) => ({
        ...q,
        reply_count: replyCounts[q.id as string] || 0,
      })));
    }

    // 학생별 질문 목록
    if (studentId) {
      const { data, error } = await supabase
        .from('student_questions')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // 답글 수
      const ids = (data || []).map((q) => q.id);
      const replyCounts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: counts } = await supabase
          .from('question_replies')
          .select('question_id')
          .in('question_id', ids);
        if (counts) {
          for (const c of counts) {
            replyCounts[c.question_id] = (replyCounts[c.question_id] || 0) + 1;
          }
        }
      }

      return NextResponse.json((data || []).map((q) => ({
        ...q,
        reply_count: replyCounts[q.id] || 0,
      })));
    }

    return NextResponse.json([]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/student-questions
// body: { student_id, title } → 새 질문
// body: { question_id, author_role, author_name, content } → 답글
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await req.json();

    // 답글 추가
    if (body.question_id) {
      const { data, error } = await supabase
        .from('question_replies')
        .insert({
          question_id: body.question_id,
          author_role: body.author_role,
          author_name: body.author_name,
          content: body.content,
        })
        .select()
        .single();
      if (error) throw error;

      // 상태 업데이트
      const newStatus = body.author_role === 'admin' ? 'answered' : 'open';
      await supabase
        .from('student_questions')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', body.question_id);

      return NextResponse.json(data);
    }

    // 새 질문 생성
    const { data, error } = await supabase
      .from('student_questions')
      .insert({
        student_id: body.student_id,
        title: body.title,
        status: 'open',
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

// PATCH /api/student-questions?id=xxx → 상태 변경
// PATCH /api/student-questions?reply_id=xxx → 답글 수정
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const id = req.nextUrl.searchParams.get('id');
    const replyId = req.nextUrl.searchParams.get('reply_id');
    const body = await req.json();

    // 답글 수정
    if (replyId) {
      const { data, error } = await supabase
        .from('question_replies')
        .update({ content: body.content })
        .eq('id', replyId)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json(data);
    }

    // 질문 수정 (상태 또는 제목)
    if (!id) return NextResponse.json({ error: 'id or reply_id required' }, { status: 400 });
    const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) updateFields.status = body.status;
    if (body.title) updateFields.title = body.title;
    const { data, error } = await supabase
      .from('student_questions')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/student-questions?id=xxx → 질문 삭제
// DELETE /api/student-questions?reply_id=xxx → 답글 삭제
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const id = req.nextUrl.searchParams.get('id');
    const replyId = req.nextUrl.searchParams.get('reply_id');

    // 답글 삭제
    if (replyId) {
      const { error } = await supabase.from('question_replies').delete().eq('id', replyId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // 질문 삭제
    if (!id) return NextResponse.json({ error: 'id or reply_id required' }, { status: 400 });
    await supabase.from('question_replies').delete().eq('question_id', id);
    const { error } = await supabase.from('student_questions').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
