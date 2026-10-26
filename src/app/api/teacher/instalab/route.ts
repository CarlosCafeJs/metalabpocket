import { NextRequest, NextResponse } from 'next/server';
import { listTeacherInstalabPosts } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: noStore });
  try {
    const posts = await listTeacherInstalabPosts();
    return NextResponse.json({ posts }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar as publicações agora.' }, { status: 503, headers: noStore });
  }
}
