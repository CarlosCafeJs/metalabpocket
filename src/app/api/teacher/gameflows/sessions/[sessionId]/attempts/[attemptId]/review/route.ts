import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getTeacherAccountSession} from '@/server/teacher-accounts';
import {reviewGameFlowVerdict} from '@/server/gameflows-sessions';
import {readJson,sameOrigin} from '@/server/validation';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
type Context={params:Promise<{sessionId:string;attemptId:string}>};
export async function POST(request:NextRequest,context:Context){
  if(!sameOrigin(request))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers:noStore});
  const actor=await getTeacherAccountSession(request).catch(()=>null);if(!actor)return NextResponse.json({error:'Sessão docente necessária.'},{status:401,headers:noStore});
  const params=await context.params;if(!z.string().uuid().safeParse(params.sessionId).success||!z.string().uuid().safeParse(params.attemptId).success)return NextResponse.json({error:'Resposta não encontrada.'},{status:404,headers:noStore});
  try{
    const input=z.object({score:z.number().int().min(0).max(200),note:z.string().trim().max(1000).default('')}).strict().parse(await readJson(request,2048));
    const result=await reviewGameFlowVerdict({...input,sessionId:params.sessionId,attemptId:params.attemptId},{id:actor.id,role:actor.role});
    if(result.kind==='not-found')return NextResponse.json({error:'Veredito pendente não encontrado nas suas turmas.'},{status:404,headers:noStore});
    if(result.kind==='invalid-state')return NextResponse.json({error:'A operação não está aberta para revisão.'},{status:409,headers:noStore});
    if(result.kind==='invalid-score')return NextResponse.json({error:'A pontuação ultrapassa o máximo deste gate.'},{status:400,headers:noStore});
    return NextResponse.json({reviewed:true,awardedXp:result.awardedXp},{headers:noStore});
  }catch(error){if(error instanceof Response)return new Response(error.body,{status:error.status,headers:new Headers([...error.headers,...Object.entries(noStore)])});if(error instanceof z.ZodError)return NextResponse.json({error:'Informe uma pontuação válida.'},{status:400,headers:noStore});const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.gameflows.verdict.review failed (${code})`);return NextResponse.json({error:'Não foi possível revisar o veredito.'},{status:503,headers:noStore});}
}
