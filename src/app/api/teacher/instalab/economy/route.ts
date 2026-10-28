import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPool, transaction } from '@/server/db';
import { isInstalabEconomyAdmin } from '@/server/teacher-auth';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const ruleSchema = z.object({ timezoneName: z.string().trim().min(1).max(100), postReward: z.number().int().min(0).max(1000), likeReward: z.number().int().min(0).max(1000), commentReward: z.number().int().min(0).max(1000), dailyRewardCap: z.number().int().min(0).max(5000), dailyLikeRewardLimit: z.number().int().min(0).max(1000), dailyCommentRewardLimit: z.number().int().min(0).max(1000), adIntervalMinutes: z.literal(10), adIntervalCost: z.number().int().min(1).max(100000) }).strict();

export async function GET(request: NextRequest) {
  if (!isInstalabEconomyAdmin(request)) return NextResponse.json({ error: 'Somente o administrador autorizado pode alterar as regras da economia.' }, { status: 403, headers: noStore });
  try {
    const result = await getPool().query(`SELECT timezone_name AS "timezoneName",post_reward AS "postReward",like_reward AS "likeReward",comment_reward AS "commentReward",daily_reward_cap AS "dailyRewardCap",daily_like_reward_limit AS "dailyLikeRewardLimit",daily_comment_reward_limit AS "dailyCommentRewardLimit",ad_interval_minutes AS "adIntervalMinutes",ad_interval_cost AS "adIntervalCost",updated_at AS "updatedAt" FROM metalab_instalab_economy_settings WHERE singleton=TRUE`);
    return NextResponse.json({ rules: result.rows[0] }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.economy.read failed (${code})`);
    return NextResponse.json({ error: 'As regras da economia ainda não estão instaladas.' }, { status: 503, headers: noStore });
  }
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  if (!isInstalabEconomyAdmin(request)) return NextResponse.json({ error: 'Somente o administrador autorizado pode alterar as regras da economia.' }, { status: 403, headers: noStore });
  const parsed = ruleSchema.safeParse(await readJson(request, 4096));
  if (!parsed.success) return NextResponse.json({ error: 'Confira os valores das regras.' }, { status: 400, headers: noStore });
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: parsed.data.timezoneName }); }
  catch { return NextResponse.json({ error: 'Fuso horário inválido.' }, { status: 400, headers: noStore }); }
  try {
    await transaction(async client => {
      const previous = await client.query(`SELECT timezone_name AS "timezoneName",post_reward AS "postReward",like_reward AS "likeReward",comment_reward AS "commentReward",daily_reward_cap AS "dailyRewardCap",daily_like_reward_limit AS "dailyLikeRewardLimit",daily_comment_reward_limit AS "dailyCommentRewardLimit",ad_interval_minutes AS "adIntervalMinutes",ad_interval_cost AS "adIntervalCost" FROM metalab_instalab_economy_settings WHERE singleton=TRUE FOR UPDATE`);
      await client.query(`UPDATE metalab_instalab_economy_settings SET timezone_name=$1,post_reward=$2,like_reward=$3,comment_reward=$4,daily_reward_cap=$5,daily_like_reward_limit=$6,daily_comment_reward_limit=$7,ad_interval_minutes=$8,ad_interval_cost=$9,first_post_reward=$2,second_post_reward=$2,third_post_reward=$2,updated_at=NOW(),updated_by='authorized_teacher' WHERE singleton=TRUE`, [parsed.data.timezoneName, parsed.data.postReward, parsed.data.likeReward, parsed.data.commentReward, parsed.data.dailyRewardCap, parsed.data.dailyLikeRewardLimit, parsed.data.dailyCommentRewardLimit, parsed.data.adIntervalMinutes, parsed.data.adIntervalCost]);
      await client.query(`INSERT INTO metalab_instalab_economy_rule_events(previous_rules,new_rules) VALUES($1::jsonb,$2::jsonb)`, [JSON.stringify(previous.rows[0]), JSON.stringify(parsed.data)]);
    });
    return NextResponse.json({ saved: true }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.economy.update failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível salvar as regras.' }, { status: 503, headers: noStore });
  }
}
