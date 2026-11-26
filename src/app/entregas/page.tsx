'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';

type Mission={id:string;title:string};
type Module={classId:string|null;isPublished:boolean;missions:Array<{id:string;title:string;isPublished:boolean}>};
type Delivery={id:string;activityName:string;description:string;classDate:string|null;fileName:string|null;mimeType:string|null;sizeBytes:number|null;textContent:string|null;createdAt:string;missionTitle:string|null;quickMissionTitle?:string|null};
type MissionResponse={id:string;activityName:string;createdAt:string;textContent:string;missionTitle:string;source:'mission'};
const readableSize=(bytes:number)=>bytes<1024*1024?`${Math.ceil(bytes/1024)} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`;

export default function DeliveriesPage(){
  const[items,setItems]=useState<Delivery[]>([]);const[missionResponses,setMissionResponses]=useState<MissionResponse[]>([]);const[missions,setMissions]=useState<Mission[]>([]);const[busy,setBusy]=useState(false);const[message,setMessage]=useState('Carregando suas entregas…');
  const load=useCallback(async()=>{try{const [deliveryResponse,missionResponse]=await Promise.all([fetch('/api/student/deliveries',{cache:'no-store',credentials:'same-origin'}),fetch('/api/student/classroom',{cache:'no-store',credentials:'same-origin'})]);const data=await deliveryResponse.json();if(!deliveryResponse.ok)throw new Error(data.error||'Não foi possível carregar as entregas.');setItems(data.deliveries);setMissionResponses(data.missionResponses||[]);setMessage(data.deliveries.length||data.missionResponses?.length?'':'Você ainda não enviou atividades.');if(missionResponse.ok){const result=await missionResponse.json();const available=(result.modules as Module[]).filter(module=>module.isPublished&&module.classId).flatMap(module=>module.missions.filter(mission=>mission.isPublished).map(mission=>({id:mission.id,title:mission.title})));setMissions(available);}}catch(error){setMessage(error instanceof Error?error.message:'Não foi possível carregar as entregas.');}},[]);
  useEffect(()=>{void load();},[load]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const formElement=event.currentTarget;setBusy(true);setMessage('');try{const form=new FormData(formElement);const response=await fetch('/api/student/deliveries',{method:'POST',credentials:'same-origin',body:form});const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível salvar a entrega.');formElement.reset();setMessage('Entrega enviada e registrada com o horário do servidor.');await load();}catch(error){setMessage(error instanceof Error?error.message:'Não foi possível enviar a entrega.');}finally{setBusy(false);}}
  return <AppShell eyebrow="ATIVIDADES DA FORMAÇÃO" title="Entregas" description="Envie uma resposta em texto ou um arquivo. A entrega pode ser vinculada a uma missão publicada ou enviada de forma independente.">
    <div className="delivery-layout"><section className="delivery-form-card"><div className="delivery-card-heading"><span className="delivery-icon">↥</span><div><span className="teacher-kicker">NOVO ENVIO</span><h2>Registrar uma entrega</h2></div></div>
      <form className="delivery-form" onSubmit={submit}>
        <label>Missão relacionada <small>Opcional</small><select name="missionId" defaultValue=""><option value="">Entrega independente</option>{missions.map(mission=><option key={mission.id} value={mission.id}>{mission.title}</option>)}</select></label>
        <label>Título da entrega<input name="activityName" minLength={3} maxLength={120} placeholder="Ex.: Pesquisa sobre o tema" /></label>
        <label>Resposta em texto <small>Opcional · até 10 mil caracteres</small><textarea name="textContent" maxLength={10000} rows={5} placeholder="Escreva sua resposta ou descreva o trabalho enviado." /></label>
        <label className="delivery-file-label">Arquivo <small>Opcional · JPG, PNG, WebP, PDF, MP4 ou WebM · até 4 MB</small><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/webm" /></label>
        <p className="delivery-file-hint">Envie um texto, um arquivo ou ambos. O servidor registra automaticamente a data e a hora.</p>
        <button className="button button-primary" type="submit" disabled={busy}>{busy?'Enviando…':'Enviar entrega'}</button><p className="delivery-message" role="status">{message}</p>
      </form></section>
      <section className="delivery-list-card"><div className="delivery-card-heading"><span className="delivery-icon">✓</span><div><span className="teacher-kicker">MEUS REGISTROS</span><h2>Histórico de entregas</h2></div></div>
        {items.length||missionResponses.length?<div className="delivery-items">{[...items.map(item=>({...item,source:'delivery' as const})),...missionResponses].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).map(item=><article className="delivery-item" key={`${item.source}-${item.id}`}><div className="delivery-item-top"><div><span className="section-tag">{new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(item.createdAt))}</span><h3>{item.missionTitle||('quickMissionTitle' in item?item.quickMissionTitle:null)||item.activityName}</h3></div>{'fileName'in item&&item.fileName&&<a className="button button-secondary" href={`/api/student/deliveries/${item.id}`}>Baixar anexo</a>}</div>{item.textContent&&<p>{item.textContent}</p>}{'fileName'in item&&item.fileName&&<small>{item.fileName}{item.sizeBytes?` · ${readableSize(item.sizeBytes)}`:''}</small>}</article>)}</div>:<div className="delivery-empty"><span>↗</span><p>{message||'Você ainda não enviou atividades.'}</p></div>}
      </section></div>
  </AppShell>;
}
