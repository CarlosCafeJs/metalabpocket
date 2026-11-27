import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {findEnrolledStudentBySessionToken} from '@/server/repository';
import {readSessionToken} from '@/server/session';
import {submitGameFlowAttempt} from '@/server/gameflows-sessions';
import {readJson,sameOrigin} from '@/server/validation';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
type Context={params:Promise<{sessionId:string}>};
export async function POST(request:NextRequest,context:Context){
  if(!sameOrigin(request))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers:noStore});
  const token=readSessionToken(request);const student=token?await findEnrolledStudentBySessionToken(token).catch(()=>null):null;
  if(!student)return NextResponse.json({error:'Sua sessão expirou.'},{status:401,headers:noStore});
  const id=z.string().uuid().safeParse((await context.params).sessionId);if(!id.success)return NextResponse.json({error:'Operação não encontrada.'},{status:404,headers:noStore});
  try{
    const input=z.object({gateId:z.string().uuid(),idempotencyKey:z.string().uuid(),mode:z.enum(['answer','contribute','solve']).optional(),answer:z.unknown().refine(value=>value!==undefined)}).strict().parse(await readJson(request,16*1024));
    const result=await submitGameFlowAttempt({...input,sessionId:id.data},student.id);
    if(['correct','incorrect','pending-review','contributed','waiting-contributions','duplicate'].includes(result.kind))return NextResponse.json({result},{headers:noStore});
    const statuses:Record<string,number>={'not-found':404,'not-participant':403,'paused':409,'not-running':409,'gate-not-found':404,'gate-locked':409,'rate-limited':429,'fragment-mismatch':403,'invalid-mode':400};
    const messages:Record<string,string>={'paused':'A operação está pausada.','not-running':'A operação não está recebendo respostas.','gate-locked':'Este gate ainda não foi liberado.','rate-limited':'Muitas tentativas em pouco tempo. Aguarde antes de tentar novamente.','fragment-mismatch':'Informe um fragmento atribuído ao seu investigador.'};
    return NextResponse.json({error:messages[result.kind]||'Resposta fora do escopo desta operação.'},{status:statuses[result.kind]||409,headers:noStore});
  }catch(error){if(error instanceof Response)return new Response(error.body,{status:error.status,headers:new Headers([...error.headers,...Object.entries(noStore)])});if(error instanceof z.ZodError)return NextResponse.json({error:'Resposta inválida.'},{status:400,headers:noStore});const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`student.gameflows.attempt.create failed (${code})`);return NextResponse.json({error:'Não foi possível registrar a resposta.'},{status:503,headers:noStore});}
}
