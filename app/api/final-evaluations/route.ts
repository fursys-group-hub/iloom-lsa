import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');

  const supabase = getSupabase();
  let query = supabase
    .from('final_evaluations')
    .select('*, students!inner(id, name, store_location), managers(id, name, store_name)')
    .order('created_at', { ascending: false });

  if (studentId) query = query.eq('student_id', studentId);

  const { data, error } = await query;
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    studentId, managerId,
    overallRating, summary, strengths, areasToDevelop,
    recommendedPosition, storeFitScore, independenceScore, customerScore, productScore,
  } = body;

  if (!studentId || !managerId || !summary || !overallRating) {
    return Response.json({ message: '필수 정보가 부족해요.' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('final_evaluations')
    .upsert(
      {
        student_id: studentId,
        manager_id: managerId,
        overall_rating: overallRating,
        summary,
        strengths: strengths || null,
        areas_to_develop: areasToDevelop || null,
        recommended_position: recommendedPosition || null,
        store_fit_score: storeFitScore || null,
        independence_score: independenceScore || null,
        customer_score: customerScore || null,
        product_score: productScore || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,manager_id' }
    )
    .select()
    .single();

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json(data);
}
