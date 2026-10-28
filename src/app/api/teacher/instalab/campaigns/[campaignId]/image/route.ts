import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/server/db';
import { hasTeacherSession } from '@/server/teacher-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  if (!hasTeacherSession(request)) return new NextResponse(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  try {
    const { campaignId } = await context.params;
    const result = await getPool().query<{ image_data: Buffer; image_mime_type: string }>('SELECT image_data,image_mime_type FROM metalab_instalab_campaigns WHERE id=$1 AND image_data IS NOT NULL', [campaignId]);
    const image = result.rows[0];
    if (!image) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new NextResponse(new Uint8Array(image.image_data), { headers: { 'Content-Type': image.image_mime_type, 'Content-Length': String(image.image_data.byteLength), 'Cache-Control': 'private, max-age=120', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.campaign.image failed (${code})`);
    return new NextResponse(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
