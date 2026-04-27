import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { createServerClient } from '@/lib/supabase';
import { extractPptxFromPath } from '@/lib/pptx-parser';

// 시리즈 매핑 sentinel: 통합 PPT는 모든 시리즈에 적용
const ALL_SERIES = '_all_';

const SOURCE_DIR = path.resolve(process.cwd(), '기존자료');

export const maxDuration = 300; // 5분 (큰 PPT 처리 대비)

/**
 * 파일별 슬라이드 범위 (이 범위만 일룸 자료로 사용)
 * - 통합본 PPT: 1~584장만 일룸 (585장 이후는 타 브랜드)
 * - 다른 파일: null이면 전체 사용
 */
function getSlideRange(fileName: string): { from: number; to: number } | null {
  if (fileName.includes('통합매장교육TF') || fileName.includes('브랜드별교육자료취합본')) {
    return { from: 1, to: 584 };
  }
  return null;
}

// 등록된 PPT 목록 조회
export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('textbook_sources')
    .select('id, series_name, file_name, source_type, uploaded_at, full_text')
    .order('uploaded_at', { ascending: false });
  if (error) return Response.json({ message: error.message }, { status: 500 });
  // full_text는 길어서 길이만 노출
  const list = (data || []).map((row) => ({
    id: row.id,
    series_name: row.series_name,
    file_name: row.file_name,
    source_type: row.source_type,
    uploaded_at: row.uploaded_at,
    text_length: row.full_text?.length || 0,
  }));
  return Response.json({ sources: list });
}

// 기존자료/ 폴더 스캔 → 모든 .pptx 추출 → DB 저장
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const force = !!body.force; // true면 이미 등록된 것도 재추출

  let files: string[];
  try {
    const all = await fs.readdir(SOURCE_DIR);
    files = all.filter((f) => f.toLowerCase().endsWith('.pptx')).map((f) => path.join(SOURCE_DIR, f));
  } catch {
    return Response.json({ message: `기존자료 폴더를 찾을 수 없습니다: ${SOURCE_DIR}` }, { status: 404 });
  }

  if (files.length === 0) {
    return Response.json({ message: '기존자료/ 폴더에 .pptx 파일이 없습니다.', processed: [] });
  }

  const supabase = createServerClient();
  const results: Array<{ file: string; status: string; slides?: number; chars?: number; error?: string }> = [];

  // 이미 등록된 파일명 조회
  const { data: existing } = await supabase
    .from('textbook_sources')
    .select('file_name')
    .eq('series_name', ALL_SERIES);
  const existingNames = new Set((existing || []).map((r) => r.file_name));

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    if (!force && existingNames.has(fileName)) {
      results.push({ file: fileName, status: 'skipped (already registered)' });
      continue;
    }
    try {
      const t0 = Date.now();
      const extracted = await extractPptxFromPath(filePath);
      const elapsed = Date.now() - t0;

      // 파일별 슬라이드 범위 필터 적용 (예: 통합본은 1~584장만)
      const range = getSlideRange(fileName);
      const filteredSlides = range
        ? extracted.slides.filter((s) => s.slide_no >= range.from && s.slide_no <= range.to)
        : extracted.slides;
      const filteredFullText = filteredSlides
        .map((s) => `--- Slide ${s.slide_no}${s.title ? ': ' + s.title : ''} ---\n${s.text}`)
        .join('\n\n');

      const { error } = await supabase
        .from('textbook_sources')
        .upsert(
          {
            series_name: ALL_SERIES,
            source_type: 'pptx',
            file_name: fileName,
            slides: filteredSlides,
            full_text: filteredFullText,
            uploaded_at: new Date().toISOString(),
          },
          { onConflict: 'series_name,file_name' },
        );
      if (error) throw error;

      results.push({
        file: fileName,
        status: `extracted in ${elapsed}ms`,
        slides: filteredSlides.length,
        chars: filteredFullText.length,
      });
    } catch (e) {
      results.push({ file: fileName, status: 'failed', error: (e as Error).message });
    }
  }

  return Response.json({ processed: results });
}

// 특정 PPT 삭제
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ message: 'id 필요' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from('textbook_sources').delete().eq('id', id);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
