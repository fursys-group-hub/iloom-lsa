import path from 'path';
import fs from 'fs/promises';

/**
 * iloom 제품 가이드 카탈로그 조회
 * - public/iloom-catalog.json 파일을 읽어서 반환
 * - 단종/(구) 시리즈는 기본 제외 (?include_excluded=1로 포함 가능)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const includeExcluded = searchParams.get('include_excluded') === '1';

  try {
    const filePath = path.resolve(process.cwd(), 'public', 'iloom-catalog.json');
    const json = await fs.readFile(filePath, 'utf-8');
    const all = JSON.parse(json);

    const list = includeExcluded ? all : all.filter((s: { is_target: boolean }) => s.is_target);

    // 카테고리별 그룹핑
    const byCategory: Record<string, unknown[]> = {};
    for (const s of list) {
      const cat = (s as { category: string }).category;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(s);
    }

    return Response.json({
      total: list.length,
      total_with_excluded: all.length,
      categories: Object.keys(byCategory),
      by_category: byCategory,
      list,
    });
  } catch (e) {
    return Response.json({ message: `카탈로그 로드 실패: ${(e as Error).message}` }, { status: 500 });
  }
}
