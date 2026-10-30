import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hasTeacherSession } from '@/server/teacher-auth';
import { transaction } from '@/server/db';
import { sameOrigin } from '@/server/validation';
import { z } from 'zod';
import { detectPresentationImageMime } from '@/domain/presentation-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const maxAssetBytes = 10 * 1024 * 1024;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function POST(request: NextRequest, context: { params: Promise<{ presentationId: string }> }) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  try {
    const { presentationId } = await context.params;
    if (!z.string().uuid().safeParse(presentationId).success) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400, headers });
    const length = Number(request.headers.get('content-length') || 0);
    if (length > maxAssetBytes + 256 * 1024) return NextResponse.json({ error: 'A imagem excede 10 MB.' }, { status: 413, headers });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Selecione uma imagem.' }, { status: 400, headers });
    if (!file.size || file.size > maxAssetBytes) return NextResponse.json({ error: 'A imagem deve ter até 10 MB.' }, { status: 413, headers });
    const content = Buffer.from(await file.arrayBuffer());
    const mimeType = detectPresentationImageMime(content);
    if (!mimeType) return NextResponse.json({ error: 'Formato inválido. Use JPEG, PNG ou WebP.' }, { status: 415, headers });
    const assetId = randomUUID();
    const saved = await transaction(async client => {
      const presentation = await client.query('SELECT id FROM metalab_presentations WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [presentationId]);
      if (!presentation.rowCount) return 'missing' as const;
      const count = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM metalab_presentation_assets WHERE presentation_id=$1', [presentationId]);
      if (Number(count.rows[0]?.count || 0) >= 50) return 'limit' as const;
      await client.query('INSERT INTO metalab_presentation_assets(id,presentation_id,mime_type,size_bytes,content) VALUES($1,$2,$3,$4,$5)', [assetId, presentationId, mimeType, content.length, content]);
      return 'saved' as const;
    });
    if (saved === 'missing') return NextResponse.json({ error: 'Apresentação não encontrada.' }, { status: 404, headers });
    if (saved === 'limit') return NextResponse.json({ error: 'Esta apresentação atingiu o limite de 50 imagens.' }, { status: 409, headers });
    return NextResponse.json({ asset: { id: assetId, mimeType, sizeBytes: content.length } }, { status: 201, headers });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`presentations.asset.create failed (${code})`);
    const missingSchema = code === '42P01';
    return NextResponse.json({ error: missingSchema ? 'O armazenamento de imagens ainda não foi instalado neste banco. Aplique a migration 017 em ambiente autorizado.' : 'Não foi possível enviar a imagem.' }, { status: 503, headers });
  }
}
