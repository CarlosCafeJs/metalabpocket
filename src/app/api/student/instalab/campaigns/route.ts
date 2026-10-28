import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPool, transaction } from '@/server/db';
import { findEnrolledStudentBySessionToken } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { sameOrigin } from '@/server/validation';
import { containsPotentialSensitiveData } from '@/domain/mission-evaluation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const inputSchema = z.object({ sourcePostId: z.string().uuid().optional(), caption: z.string().trim().min(2).max(1000), objective: z.enum(['awareness','visits','engagement']), budgetLimit: z.coerce.number().int().min(10).max(100000) }).strict();
const validMimes = new Set(['image/jpeg','image/png','image/webp']);
function validImage(mime: string, data: Buffer) {
  if (mime === 'image/jpeg') return data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (mime === 'image/png') return data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  return mime === 'image/webp' && data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP';
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  if (Number(request.headers.get('content-length') || 0) > 4 * 1024 * 1024 + 64 * 1024) return NextResponse.json({ error: 'A imagem deve ter até 4 MB.' }, { status: 413, headers: noStore });
  const session = readSessionToken(request);
  const student = session ? await findEnrolledStudentBySessionToken(session) : null;
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers: noStore });
  const requestId = request.headers.get('idempotency-key') || '';
  if (!z.string().uuid().safeParse(requestId).success) return NextResponse.json({ error: 'Identificador de operação inválido.' }, { status: 400, headers: noStore });
  try {
    const form = await request.formData();
    const parsed = inputSchema.safeParse({ sourcePostId: form.get('sourcePostId') || undefined, caption: form.get('caption'), objective: form.get('objective'), budgetLimit: form.get('budgetLimit') });
    if (!parsed.success) return NextResponse.json({ error: 'Revise o texto, o objetivo e o período do anúncio.' }, { status: 400, headers: noStore });
    if (containsPotentialSensitiveData(parsed.data.caption)) return NextResponse.json({ error: 'Remova contatos, links, e-mails ou dados pessoais do anúncio.' }, { status: 422, headers: noStore });
    const raw = form.get('image');
    const file = raw instanceof File && raw.size ? raw : null;
    const imageData = file ? Buffer.from(await file.arrayBuffer()) : null;
    if (file && (!validMimes.has(file.type) || file.size > 4 * 1024 * 1024 || !imageData || !validImage(file.type,imageData))) return NextResponse.json({ error: 'Escolha JPG, PNG ou WebP válido de até 4 MB.' }, { status: 400, headers: noStore });
    if (!parsed.data.sourcePostId && !file) return NextResponse.json({ error: 'Escolha uma publicação existente ou envie uma imagem para o anúncio.' }, { status: 400, headers: noStore });
    if (parsed.data.sourcePostId && file) return NextResponse.json({ error: 'Use uma publicação existente ou uma nova imagem, não as duas opções.' }, { status: 400, headers: noStore });

    const result = await transaction(async client => {
      await client.query("SELECT set_config('metalab.actor_role','student',true)");
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 731902))', [student.id]);
      const existing = await client.query<{ id: string; status: string }>('SELECT id,status FROM metalab_instalab_campaigns WHERE student_id=$1 AND creation_request_id=$2', [student.id, requestId]);
      if (existing.rows[0]) return { id: existing.rows[0].id, status: existing.rows[0].status, duplicate: true, balance: null };
      const context = await client.query<{ class_id: string }>(`SELECT assignment.class_id FROM metalab_student_class_assignments assignment JOIN metalab_businesses business ON business.student_id=assignment.student_id WHERE assignment.student_id=$1`, [student.id]);
      if (!context.rows[0]) throw new Error('STUDENT_NOT_READY');
      let campaignImageData: Buffer<ArrayBufferLike> | null = imageData;
      let campaignImageMime = file?.type ?? null;
      let campaignImageName = file?.name.replace(/[\\/\u0000-\u001f]/gu,'_').slice(0,255) ?? null;
      if (parsed.data.sourcePostId) {
        const source = await client.query<{ image_data: Buffer | null; image_mime_type: string | null; image_name: string | null }>('SELECT image_data,image_mime_type,image_name FROM metalab_instalab_posts WHERE id=$1 AND student_id=$2 AND class_id=$3', [parsed.data.sourcePostId, student.id, context.rows[0].class_id]);
        if (!source.rows[0]) throw new Error('POST_NOT_OWNED');
        if (!source.rows[0].image_data || !source.rows[0].image_mime_type) throw new Error('POST_HAS_NO_IMAGE');
        campaignImageData = source.rows[0].image_data;
        campaignImageMime = source.rows[0].image_mime_type;
        campaignImageName = source.rows[0].image_name;
      }
      const settings = await client.query<{ ad_interval_cost: number }>('SELECT ad_interval_cost FROM metalab_instalab_economy_settings WHERE singleton=TRUE');
      const policy = settings.rows[0];
      if (!policy) throw new Error('ECONOMY_NOT_CONFIGURED');
      const cost = parsed.data.budgetLimit;
      if (cost < policy.ad_interval_cost) throw new Error('BUDGET_BELOW_INTERVAL');
      const wallet = await client.query<{ balance: string | number }>('SELECT COALESCE(SUM(amount),0) AS balance FROM metalab_instalab_wallet_entries WHERE student_id=$1', [student.id]);
      const balance = Number(wallet.rows[0].balance);
      const id = randomUUID();
      await client.query(`INSERT INTO metalab_instalab_campaigns(id,student_id,class_id,creation_request_id,source_post_id,caption,objective,duration_days,cost,image_name,image_mime_type,image_size_bytes,image_data)
        VALUES($1,$2,$3,$4,$5,$6,$7,7,$8,$9,$10,$11,$12)`, [id, student.id, context.rows[0].class_id, requestId, parsed.data.sourcePostId ?? null, parsed.data.caption, parsed.data.objective, cost, campaignImageName, campaignImageMime, campaignImageData?.byteLength ?? null, campaignImageData]);
      await client.query(`UPDATE metalab_instalab_campaigns SET budget_limit=$2 WHERE id=$1`, [id, cost]);
      await client.query(`INSERT INTO metalab_instalab_campaign_events(campaign_id,actor_role,actor_key,event_type,details) VALUES($1,'student',$2,'submitted',jsonb_build_object('budgetLimit',$3::integer,'intervalCost',$4::integer))`, [id, student.id, cost, policy.ad_interval_cost]);
      return { id, status: 'pending', duplicate: false, balance, budgetLimit: cost, intervalCost: policy.ad_interval_cost };
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201, headers: noStore });
  } catch (error) {
    const code = error instanceof Error ? error.message : error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    const status = code === 'BUDGET_BELOW_INTERVAL' || code === 'POST_HAS_NO_IMAGE' ? 400 : code === 'STUDENT_NOT_READY' ? 409 : code === 'POST_NOT_OWNED' ? 403 : 503;
    const message = code === 'BUDGET_BELOW_INTERVAL' ? 'O limite de investimento precisa cobrir pelo menos um intervalo de veiculação.' : code === 'STUDENT_NOT_READY' ? 'Entre em uma turma e cadastre sua empresa antes de anunciar.' : code === 'POST_NOT_OWNED' ? 'A publicação escolhida não pertence a este perfil.' : code === 'POST_HAS_NO_IMAGE' ? 'Escolha uma publicação que tenha imagem.' : 'Não foi possível enviar o anúncio para análise.';
    console.error(`student.instalab.campaign.create failed (${code})`);
    return NextResponse.json({ error: message }, { status, headers: noStore });
  }
}

export async function GET(request: NextRequest) {
  const session = readSessionToken(request);
  const student = session ? await findEnrolledStudentBySessionToken(session) : null;
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers: noStore });
  try {
    const result = await getPool().query(`SELECT id,caption,objective,budget_limit AS "budgetLimit",amount_spent AS "amountSpent",GREATEST(0,budget_limit-amount_spent) AS "remainingBudget",billing_interval_count AS "paidIntervals",paid_through AS "paidThrough",CASE WHEN status='ended' AND billing_reason='insufficient_balance' THEN 'no_balance' ELSE status END AS status,created_at AS "createdAt",starts_at AS "startsAt",rejection_reason AS "rejectionReason",billing_reason AS "billingReason" FROM metalab_instalab_campaigns WHERE student_id=$1 ORDER BY created_at DESC`, [student.id]);
    return NextResponse.json({ campaigns: result.rows }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.instalab.campaign.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar os anúncios.' }, { status: 503, headers: noStore });
  }
}
