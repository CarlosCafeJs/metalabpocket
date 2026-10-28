import pg from 'pg';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());
const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL_NOT_CONFIGURED');
const ca = process.env.DATABASE_CA?.replace(/\\n/g, '\n');
const allowInsecureLocalTls = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false' && process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1';
const ssl = process.env.DATABASE_SSL === 'false' ? false : { ...(ca ? { ca } : {}), rejectUnauthorized: !allowInsecureLocalTls };
const client = new Client({ connectionString, ssl, connectionTimeoutMillis: 10000 });
let charged = 0;
let stopped = 0;

try {
  await client.connect();
  // One invocation is safe to overlap with another Railway job or application instance.
  for (let attempt = 0; attempt < 500; attempt++) {
    await client.query('BEGIN');
    try {
      const selected = await client.query(`
        SELECT campaign.id,campaign.student_id,campaign.budget_limit,campaign.amount_spent,
          campaign.billing_interval_count,campaign.paid_through,
          settings.ad_interval_minutes,settings.ad_interval_cost
        FROM metalab_instalab_campaigns campaign
        CROSS JOIN metalab_instalab_economy_settings settings
        WHERE campaign.status='active' AND campaign.paid_through <= NOW()+INTERVAL '1 minute' AND settings.singleton=TRUE
        ORDER BY campaign.paid_through,campaign.id
        LIMIT 1 FOR UPDATE OF campaign SKIP LOCKED
      `);
      const campaign = selected.rows[0];
      if (!campaign) { await client.query('COMMIT'); break; }
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 731902))', [campaign.student_id]);
      const amount = Number(campaign.ad_interval_cost);
      const remaining = Number(campaign.budget_limit) - Number(campaign.amount_spent);
      if (remaining < amount) {
        await client.query(`UPDATE metalab_instalab_campaigns SET status='ended',paid_through=NULL,billing_reason='budget_exhausted' WHERE id=$1`, [campaign.id]);
        await client.query(`INSERT INTO metalab_instalab_campaign_events(campaign_id,actor_role,event_type,details) VALUES($1,'system','budget_exhausted',jsonb_build_object('remainingBudget',$2,'intervalCost',$3))`, [campaign.id, remaining, amount]);
        stopped++;
      } else {
        const wallet = await client.query(`SELECT COALESCE(SUM(amount),0) AS balance FROM metalab_instalab_wallet_entries WHERE student_id=$1`, [campaign.student_id]);
        if (Number(wallet.rows[0].balance) < amount) {
          await client.query(`UPDATE metalab_instalab_campaigns SET status='ended',paid_through=NULL,billing_reason='insufficient_balance' WHERE id=$1`, [campaign.id]);
          await client.query(`INSERT INTO metalab_instalab_campaign_events(campaign_id,actor_role,event_type,details) VALUES($1,'system','no_balance',jsonb_build_object('intervalCost',$2))`, [campaign.id, amount]);
          stopped++;
        } else {
          const period = Number(campaign.billing_interval_count) + 1;
          const operationKey = `ad-charge:${campaign.id}:${period}`;
          // If the scheduler was down past the paid interval, start a fresh paid interval now.
          // No ad is delivered during the gap because the feed requires paid_through > NOW().
          const charge = await client.query(`
            INSERT INTO metalab_instalab_campaign_charges(campaign_id,interval_number,amount,starts_at,paid_through,wallet_operation_key)
            VALUES($1,$2,$3,GREATEST(NOW(),$4),GREATEST(NOW(),$4)+($5::text||' minutes')::interval,$6)
            ON CONFLICT(campaign_id,interval_number) DO NOTHING RETURNING paid_through
          `, [campaign.id, period, amount, campaign.paid_through, Number(campaign.ad_interval_minutes), operationKey]);
          if (!charge.rows[0]) throw new Error(`DUPLICATE_INTERVAL:${campaign.id}:${period}`);
          await client.query(`INSERT INTO metalab_instalab_wallet_entries(id,student_id,amount,entry_type,description,operation_key,campaign_id) VALUES(gen_random_uuid(),$1,$2,'ad_spend',$3,$4,$5)`, [campaign.student_id, -amount, `Anúncio patrocinado · intervalo ${period} de ${campaign.ad_interval_minutes} min`, operationKey, campaign.id]);
          await client.query(`UPDATE metalab_instalab_campaigns SET paid_through=$2,amount_spent=amount_spent+$3,billing_interval_count=$4 WHERE id=$1`, [campaign.id, charge.rows[0].paid_through, amount, period]);
          await client.query(`INSERT INTO metalab_instalab_campaign_events(campaign_id,actor_role,event_type,details) VALUES($1,'system','interval_charged',jsonb_build_object('intervalNumber',$2,'amount',$3,'paidThrough',$4))`, [campaign.id, period, amount, charge.rows[0].paid_through]);
          charged++;
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log(JSON.stringify({ chargedIntervals: charged, stoppedCampaigns: stopped }));
} finally {
  await client.end();
}
