import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/server/db';
import { findEnrolledStudentBySessionToken } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const schema = z.object({ action: z.enum(['pause','end']) }).strict();

export async function PATCH(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  const token = readSessionToken(request);
  const student = token ? await findEnrolledStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers: noStore });
  const { campaignId } = await context.params;
  if (!z.string().uuid().safeParse(campaignId).success) return NextResponse.json({ error: 'Campanha inválida.' }, { status: 404, headers: noStore });
  const parsed = schema.safeParse(await readJson(request, 1024));
  if (!parsed.success) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400, headers: noStore });
  try {
    const status = await transaction(async client => {
      await client.query("SELECT set_config('metalab.actor_role','student',true)");
      const row = await client.query<{ status: string }>('SELECT status FROM metalab_instalab_campaigns WHERE id=$1 AND student_id=$2 FOR UPDATE', [campaignId, student.id]);
      if (!row.rows[0]) return null;
      if (row.rows[0].status !== 'active' && row.rows[0].status !== 'pending' && row.rows[0].status !== 'suspended') throw new Error('INVALID_TRANSITION');
      const next = parsed.data.action === 'end' ? 'ended' : 'suspended';
      await client.query('UPDATE metalab_instalab_campaigns SET status=$2,paid_through=NULL,billing_reason=$3 WHERE id=$1', [campaignId, next, parsed.data.action === 'end' ? 'ended_by_student' : 'paused_by_student']);
      await client.query(`INSERT INTO metalab_instalab_campaign_events(campaign_id,actor_role,actor_key,event_type,details) VALUES($1,'student',$2,$3,'{}'::jsonb)`, [campaignId, student.id, parsed.data.action === 'end' ? 'ended_by_student' : 'paused_by_student']);
      return next;
    });
    if (!status) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404, headers: noStore });
    return NextResponse.json({ status }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNEXPECTED';
    console.error(`student.instalab.campaign.update failed (${code})`);
    return NextResponse.json({ error: code === 'INVALID_TRANSITION' ? 'Essa campanha já foi encerrada e não pode ser alterada.' : 'Não foi possível atualizar a campanha.' }, { status: code === 'INVALID_TRANSITION' ? 409 : 503, headers: noStore });
  }
}
