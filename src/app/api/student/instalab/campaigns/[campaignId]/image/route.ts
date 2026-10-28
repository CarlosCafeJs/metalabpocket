import { NextRequest, NextResponse } from 'next/server';
import { findEnrolledStudentBySessionToken, getStudentInstalabCampaignImage } from '@/server/repository';
import { readSessionToken } from '@/server/session';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  const token = readSessionToken(request);
  const student = token ? await findEnrolledStudentBySessionToken(token) : null;
  if (!student) return new NextResponse(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  try {
    const { campaignId } = await context.params;
    const image = await getStudentInstalabCampaignImage(campaignId, student.id);
    if (!image) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new NextResponse(new Uint8Array(image.image_data), { headers: { 'Content-Type': image.image_mime_type, 'Content-Length': String(image.image_data.byteLength), 'Cache-Control': 'private, max-age=120', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.instalab.campaign.image failed (${code})`);
    return new NextResponse(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
