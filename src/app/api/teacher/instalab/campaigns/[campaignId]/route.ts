import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/server/db';
import { hasTeacherSession } from '@/server/teacher-auth';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const actionSchema = z.object({ action: z.enum(['approve', 'reject', 'suspend', 'resume']), reason: z.string().trim().max(500).optional() }).strict();

export async function PATCH(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Acesso do professor necessário.' }, { status: 401, headers: noStore });
  const { campaignId } = await context.params;
  if (!z.string().uuid().safeParse(campaignId).success) return NextResponse.json({ error: 'Anúncio inválido.' }, { status: 400, headers: noStore });
  const parsed = actionSchema.safeParse(await readJson(request, 2048));
  if (!parsed.success) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400, headers: noStore });
  try {
    const status = await transaction(async client => {
      await client.query("SELECT set_config('metalab.actor_role','teacher',true)");
      const locked = await client.query<{ id: string; student_id: string; status: string; cost: number; budget_limit: number; amount_spent: number; billing_interval_count: number; billing_reason: string | null }>('SELECT id,student_id,status,cost,budget_limit,amount_spent,billing_interval_count,billing_reason FROM metalab_instalab_campaigns WHERE id=$1 FOR UPDATE', [campaignId]);
      const campaign = locked.rows[0];
      if (!campaign) return null;
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 731902))', [campaign.student_id]);
      let next: string;
      if (parsed.data.action === 'approve' && campaign.status === 'pending') next = 'active';
      else if (parsed.data.action === 'reject' && campaign.status === 'pending') next = 'rejected';
      else if (parsed.data.action === 'suspend' && campaign.status === 'active') next = 'suspended';
      else if (parsed.data.action === 'resume' && campaign.status === 'suspended' && campaign.billing_reason !== 'legacy_campaign_paused_for_billing_upgrade') next = 'active';
      else throw new Error('INVALID_TRANSITION');
      if (next === 'active') {
        const policy = await client.query<{ ad_interval_minutes: number; ad_interval_cost: number }>('SELECT ad_interval_minutes,ad_interval_cost FROM metalab_instalab_economy_settings WHERE singleton=TRUE');
        const interval = policy.rows[0];
        if (!interval) throw new Error('BILLING_NOT_CONFIGURED');
        if (campaign.budget_limit - campaign.amount_spent < interval.ad_interval_cost) throw new Error('BUDGET_EXHAUSTED');
        const balance = await client.query<{ amount: number | string }>('SELECT COALESCE(SUM(amount),0) AS amount FROM metalab_instalab_wallet_entries WHERE student_id=$1', [campaign.student_id]);
        if (Number(balance.rows[0].amount) < interval.ad_interval_cost) throw new Error('INSUFFICIENT_BALANCE');
        const period = campaign.billing_interval_count + 1;
        const operationKey = `ad-charge:${campaignId}:${period}`;
        const charge = await client.query<{ starts_at: Date | string; paid_through: Date | string }>(`INSERT INTO metalab_instalab_campaign_charges(campaign_id,interval_number,amount,starts_at,paid_through,wallet_operation_key) VALUES($1,$2,$3,NOW(),NOW()+($4::text||' minutes')::interval,$5) ON CONFLICT(campaign_id,interval_number) DO NOTHING RETURNING starts_at,paid_through`, [campaignId, period, interval.ad_interval_cost, interval.ad_interval_minutes, operationKey]);
        if (!charge.rows[0]) throw new Error('DUPLICATE_INTERVAL');
        await client.query(`INSERT INTO metalab_instalab_wallet_entries(id,student_id,amount,entry_type,description,operation_key,campaign_id) VALUES(gen_random_uuid(),$1,$2,'ad_spend',$3,$4,$5)`, [campaign.student_id, -interval.ad_interval_cost, `Anúncio patrocinado · intervalo ${period} de ${interval.ad_interval_minutes} min`, operationKey, campaignId]);
        await client.query(`UPDATE metalab_instalab_campaigns SET status='active',reviewed_at=NOW(),reviewed_by='teacher',starts_at=COALESCE(starts_at,NOW()),paid_through=$2,amount_spent=amount_spent+$3,billing_interval_count=$4,billing_reason=NULL,rejection_reason=NULL WHERE id=$1`, [campaignId, charge.rows[0].paid_through, interval.ad_interval_cost, period]);
      }
      else if (next === 'suspended') await client.query(`UPDATE metalab_instalab_campaigns SET status=$2,reviewed_at=NOW(),reviewed_by='teacher',paid_through=NULL WHERE id=$1`, [campaignId, next]);
      else await client.query(`UPDATE metalab_instalab_campaigns SET status=$2,reviewed_at=NOW(),reviewed_by='teacher',rejection_reason=$3 WHERE id=$1`, [campaignId, next, parsed.data.reason || 'Anúncio não aprovado.']);
      if (next === 'rejected') await client.query(`UPDATE metalab_instalab_campaigns SET billing_reason='rejected_by_teacher' WHERE id=$1`, [campaignId]);
      await client.query(`INSERT INTO metalab_instalab_campaign_events(campaign_id,actor_role,event_type,details) VALUES($1,'teacher',$2,jsonb_build_object('reason',$3::text))`, [campaignId, parsed.data.action, parsed.data.reason || null]);
      return next;
    });
    if (!status) return NextResponse.json({ error: 'Anúncio não encontrado.' }, { status: 404, headers: noStore });
    return NextResponse.json({ status }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error ? error.message : error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.campaign.review failed (${code})`);
    const clientError = ['INVALID_TRANSITION','BUDGET_EXHAUSTED','INSUFFICIENT_BALANCE','DUPLICATE_INTERVAL'].includes(code);
    const message = code === 'INVALID_TRANSITION' ? 'Esse anúncio não pode receber essa ação agora.' : code === 'BUDGET_EXHAUSTED' ? 'O orçamento não cobre outro intervalo completo.' : code === 'INSUFFICIENT_BALANCE' ? 'O aluno não tem saldo para financiar o primeiro intervalo.' : 'Não foi possível atualizar o anúncio.';
    return NextResponse.json({ error: message }, { status: clientError ? 409 : 503, headers: noStore });
  }
}
