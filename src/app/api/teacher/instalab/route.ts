import { NextRequest, NextResponse } from 'next/server';
import { listTeacherInstalabPosts } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { getTeacherAccountSession } from '@/server/teacher-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  try {
    const legacy = hasTeacherSession(request);
    const account = legacy ? null : await getTeacherAccountSession(request);
    if (!legacy && !account) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: noStore });
    const posts = await listTeacherInstalabPosts(account?.role === 'teacher' ? account.id : undefined, account?.id);
    return NextResponse.json({ posts }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar as publicações agora.' }, { status: 503, headers: noStore });
  }
}
