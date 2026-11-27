import { NextRequest, NextResponse } from 'next/server';
import { academicEvaluationInputSchema } from '@/domain/academic-grade-policy';
import { getTeacherAccountSession } from '@/server/teacher-accounts';
import { saveTeacherAcademicEvaluation } from '@/server/academic-evaluations';
import { readJson, sameOrigin } from '@/server/validation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  const teacher = await getTeacherAccountSession(request).catch(() => null);
  if (!teacher) return NextResponse.json({ error: 'Entre com uma conta docente ativa.' }, { status: 401, headers: noStore });
  try {
    const parsed = academicEvaluationInputSchema.safeParse(await readJson(request, 4096));
    if (!parsed.success) return NextResponse.json({ error: 'Confira a nota, o valor máximo e o comentário.' }, { status: 400, headers: noStore });
    const result = await saveTeacherAcademicEvaluation(parsed.data, { id: teacher.id, role: teacher.role });
    if (result.kind === 'not-found') return NextResponse.json({ error: 'Atividade fora das suas turmas autorizadas ou não encontrada.' }, { status: 404, headers: noStore });
    if (result.kind === 'forbidden') return NextResponse.json({ error: 'Esta avaliação pertence a outro professor. Somente um administrador pode alterá-la.' }, { status: 403, headers: noStore });
    return NextResponse.json({ evaluation: result.evaluation }, { status: 200, headers: noStore });
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: new Headers([...error.headers, ...Object.entries(noStore)]) });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Confira os campos da avaliação.' }, { status: 400, headers: noStore });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.evaluations.save failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível salvar a avaliação.' }, { status: 503, headers: noStore });
  }
}
