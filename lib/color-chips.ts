// 색상 코드별 통합 칩 이미지 라이브러리 (Supabase Storage colors/)
// 모든 시리즈가 공유 — 중복 업로드 방지
export const COLOR_CHIP_BASE = 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors';
export const COLOR_CHIPS: Record<string, string> = {
  '3W1': 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/3W1.jpg',
  NK: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/NK.jpg',
  CGYM: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/CGYM.jpg',
  MRB: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/MRB.jpg',
  WW: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/WW.jpg',
  SP: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/SP.jpg',
  OS: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/OS.jpg',
  GU: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/GU.jpg',
  GY: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/GY.jpg',
  LU: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/LU.png',
  DN: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/DN.png',
  IV: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/IV.jpg',
  RM: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/RM.png',
  TM: 'https://jwjjdrbfjsuuslfzlvnu.supabase.co/storage/v1/object/public/textbook-images/colors/TM.png',
};

export function getColorChip(code: string): string | null {
  return COLOR_CHIPS[code] || null;
}
