import { NextRequest, NextResponse } from 'next/server';
import { getTeacherPhoto } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ photoId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const photoId = (await context.params).photoId;
  if (!z.string().uuid().safeParse(photoId).success) return new NextResponse(null, { status: 404 });
  try {
    const photo = await getTeacherPhoto(photoId);
    if (!photo) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(photo.image_data), {
      headers: {
        'Content-Type': photo.mime_type,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.photo.read failed (${code})`);
    return new NextResponse(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
