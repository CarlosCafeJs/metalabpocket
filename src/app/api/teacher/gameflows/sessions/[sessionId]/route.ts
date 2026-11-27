import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getTeacherAccountSession} from '@/server/teacher-accounts';
import {getTeacherGameFlowSession,operateGameFlowSession} from '@/server/gameflows-sessions';
import {readJson,sameOrigin} from '@/server/validation';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
type Context={params:Promise<{sessionId:string}>};
export async function GET(request:NextRequest,context:Context){
  const actor=await getTeacherAccountSession(request).catch(()=>null);if(!actor)return NextResponse.json({error:'Sessão docente necessária.'},{status:401,headers:noStore});
  const id=z.string().uuid().safeParse((await context.params).sessionId);if(!id.success)return NextResponse.json({error:'Sala não encontrada.'},{status:404,headers:noStore});
  try{const session=await getTeacherGameFlowSession(id.data,{id:actor.id,role:actor.role});return session?NextResponse.json({session},{headers:noStore}):NextResponse.json({error:'Sala fora do seu escopo.'},{status:404,headers:noStore});}
  catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.gameflows.session.read failed (${code})`);return NextResponse.json({error:'Não foi possível carregar a operação.'},{status:503,headers:noStore});}
}
export async function PATCH(request:NextRequest,context:Context){
  if(!sameOrigin(request))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers:noStore});
  const actor=await getTeacherAccountSession(request).catch(()=>null);if(!actor)return NextResponse.json({error:'Sessão docente necessária.'},{status:401,headers:noStore});
  const id=z.string().uuid().safeParse((await context.params).sessionId);if(!id.success)return NextResponse.json({error:'Sala não encontrada.'},{status:404,headers:noStore});
  try{
    const input=z.object({action:z.enum(['start','pause','resume','end','cancel','announce','hint','redistribute']),confirm:z.boolean().optional(),message:z.string().trim().max(1000).optional(),gateId:z.string().uuid().optional(),fromStudentId:z.string().uuid().optional(),toStudentId:z.string().uuid().optional(),endReason:z.string().trim().max(1000).optional()}).strict().parse(await readJson(request,4096));
    if(input.action==='end'&&input.confirm!==true)return NextResponse.json({error:'Confirme o encerramento da operação.'},{status:400,headers:noStore});
    if(input.action==='cancel'&&input.confirm!==true)return NextResponse.json({error:'Confirme o cancelamento da sala.'},{status:400,headers:noStore});
    const result=await operateGameFlowSession(id.data,{id:actor.id,role:actor.role},input.action,input);
    const statuses:Record<string,number>={'not-found':404,'invalid-state':409,'empty-roster':409,'invalid-case':409,'invalid-message':400,'gate-not-found':404,'participant-online':409,'progress-preserved':409,'no-online-recipient':409,'invalid-fragments':409};
    if(!result.kind.includes('started')&&!result.kind.includes('updated')&&!result.kind.includes('ended')&&!result.kind.includes('cancelled')&&!result.kind.includes('announced')&&!result.kind.includes('hint-released')&&!result.kind.includes('redistributed'))return NextResponse.json({error:result.kind==='empty-roster'?'Nenhum participante está aguardando.':result.kind==='invalid-case'?'O caso não está pronto para iniciar ou a mensagem coletiva não comporta todos os participantes.':result.kind==='participant-online'?'O participante ainda está conectado.':result.kind==='progress-preserved'?'O progresso já registrado foi preservado.':'A ação não pode ser executada neste estado.'},{status:statuses[result.kind]||409,headers:noStore});
    return NextResponse.json({result},{headers:noStore});
  }catch(error){if(error instanceof Response)return new Response(error.body,{status:error.status,headers:new Headers([...error.headers,...Object.entries(noStore)])});if(error instanceof z.ZodError)return NextResponse.json({error:'Confira os dados da ação.'},{status:400,headers:noStore});const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.gameflows.session.action failed (${code})`);return NextResponse.json({error:'Não foi possível executar a ação.'},{status:503,headers:noStore});}
}
