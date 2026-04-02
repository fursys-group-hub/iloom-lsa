import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const BUCKET = 'note-images';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const studentId = formData.get('student_id') as string | null;

    if (!file || !studentId) {
      return Response.json({ message: '파일과 학생 ID가 필요합니다.' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ message: '이미지 크기는 5MB 이하여야 합니다.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return Response.json({ message: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
    }

    const supabase = createServerClient();
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${studentId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      return Response.json({ message: `업로드 실패: ${error.message}` }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);

    return Response.json({ url: urlData.publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return Response.json({ message: `업로드 실패: ${message}` }, { status: 500 });
  }
}
