import { NextRequest, NextResponse } from 'next/server';
import { hasTeacherSession } from '@/server/teacher-auth';
import { findStudentBySessionToken, getStudentClass } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { getPool } from '@/server/db';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ presentationId: string; assetId: string }> }) {
  try {
    const { presentationId, assetId } = await context.params;
    if (!z.string().uuid().safeParse(presentationId).success || !z.string().uuid().safeParse(assetId).success) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
    const pool = getPool();
    let result;
    if (hasTeacherSession(request)) {
      result = await pool.query<{ mime_type: string; content: Buffer; size_bytes: number }>(`SELECT asset.mime_type,asset.content,asset.size_bytes FROM metalab_presentation_assets asset
        JOIN metalab_presentations presentation ON presentation.id=asset.presentation_id
        WHERE asset.id=$1 AND asset.presentation_id=$2 AND presentation.deleted_at IS NULL`, [assetId, presentationId]);
    } else {
      const token = readSessionToken(request);
      const student = token ? await findStudentBySessionToken(token) : null;
      if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401 });
      const classroom = await getStudentClass(student.id);
      if (!classroom) return NextResponse.json({ error: 'Entre em uma turma para acessar este material.' }, { status: 403 });
      result = await pool.query<{ mime_type: string; content: Buffer; size_bytes: number }>(`SELECT asset.mime_type,asset.content,asset.size_bytes FROM metalab_presentation_assets asset
        JOIN metalab_presentations presentation ON presentation.id=asset.presentation_id
        JOIN metalab_presentation_classes authorized ON authorized.presentation_id=presentation.id AND authorized.class_id=$3
        WHERE asset.id=$1 AND asset.presentation_id=$2 AND presentation.deleted_at IS NULL AND presentation.is_published=TRUE
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(presentation.document->'slides') slide
            CROSS JOIN LATERAL jsonb_array_elements(slide->'elements') element
            WHERE element->>'type'='image' AND element->>'assetId'=asset.id::text)`, [assetId, presentationId, classroom.id]);
    }
    const asset = result.rows[0];
    if (!asset) return NextResponse.json({ error: 'Imagem não encontrada.' }, { status: 404 });
    return new NextResponse(new Uint8Array(asset.content), { status: 200, headers: { 'Content-Type': asset.mime_type, 'Content-Length': String(asset.size_bytes), 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`presentations.asset.read failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível abrir a imagem.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
