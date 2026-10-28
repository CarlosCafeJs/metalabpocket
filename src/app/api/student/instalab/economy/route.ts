import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/server/db';
import { findEnrolledStudentBySessionToken } from '@/server/repository';
import { readSessionToken } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const token = readSessionToken(request);
  const student = token ? await findEnrolledStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers: noStore });
  try {
    const pool = getPool();
    const [wallet, entries, campaigns, settings] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0)::int AS balance FROM metalab_instalab_wallet_entries WHERE student_id = $1`, [student.id]),
      pool.query(`SELECT id, amount, entry_type AS "entryType", description, created_at AS "createdAt" FROM metalab_instalab_wallet_entries WHERE student_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100`, [student.id]),
      pool.query(`SELECT campaign.id, campaign.caption, campaign.objective, campaign.budget_limit AS "budgetLimit",campaign.amount_spent AS "amountSpent",GREATEST(0,campaign.budget_limit-campaign.amount_spent) AS "remainingBudget",campaign.billing_interval_count AS "paidIntervals",campaign.paid_through AS "paidThrough",CASE WHEN campaign.status='ended' AND campaign.billing_reason='insufficient_balance' THEN 'no_balance' ELSE campaign.status END AS status,campaign.created_at AS "createdAt",campaign.rejection_reason AS "rejectionReason",campaign.source_post_id AS "sourcePostId", (campaign.image_data IS NOT NULL) AS "hasImage", COALESCE((SELECT COUNT(*) FROM metalab_instalab_campaign_impressions impression WHERE impression.campaign_id=campaign.id),0)::int AS impressions FROM metalab_instalab_campaigns campaign WHERE campaign.student_id=$1 ORDER BY campaign.created_at DESC`, [student.id]),
      pool.query(`SELECT ad_interval_minutes AS "adIntervalMinutes",ad_interval_cost AS "adIntervalCost" FROM metalab_instalab_economy_settings WHERE singleton=TRUE`)
    ]);
    return NextResponse.json({ balance: Number(wallet.rows[0]?.balance ?? 0), entries: entries.rows, campaigns: campaigns.rows, plans: settings.rows[0] ?? { adIntervalMinutes: 10, adIntervalCost: 10 } }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.instalab.economy.read failed (${code})`);
    return NextResponse.json({ error: 'A carteira ainda não está disponível neste ambiente.' }, { status: 503, headers: noStore });
  }
}
