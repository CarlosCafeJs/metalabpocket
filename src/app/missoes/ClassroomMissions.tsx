'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Task = {
  id: string;
  prompt: string;
  description: string;
  type: 'text' | 'short_answer' | 'multiple_choice' | 'checkboxes' | 'dropdown' | 'linear_scale' | 'date' | 'complete';
  required: boolean;
  settings: Record<string, unknown>;
  options: Array<{ value: string; label: string }>;
  submissions?: Array<{ id: string; answer: unknown; submittedAt: string }>;
};
type CourseModule = {
  id: string;
  title: string;
  description: string;
  missions: Array<{ id: string; title: string; objective: string; description: string; tasks: Task[] }>;
};

const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Data indisponível' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
};

export default function ClassroomMissions() {
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [selectedModuleId,setSelectedModuleId]=useState('');
  const [selectedMissionId,setSelectedMissionId]=useState('');
  const [message, setMessage] = useState('Carregando…');
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/student/classroom', { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a turma.');
      setModules(data.modules);
      setSelectedModuleId(current=>data.modules.some((item:CourseModule)=>item.id===current)?current:data.modules[0]?.id||'');
      const firstModule=data.modules.find((item:CourseModule)=>item.id===selectedModuleId)||data.modules[0];
      setSelectedMissionId(current=>firstModule?.missions.some((item:CourseModule['missions'][number])=>item.id===current)?current:firstModule?.missions[0]?.id||'');
      setMessage(data.modules.length ? '' : 'O professor ainda não liberou módulos da turma.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>, mission: CourseModule['missions'][number]) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const answers=mission.tasks.map(task=>{
      const latest=task.submissions?.[0];
      const inputName=`answer-${task.id}`;
      const raw=task.type==='checkboxes'?form.getAll(inputName).map(String):String(form.get(inputName)||'').trim();
      let answer:unknown=task.type==='complete'?(form.get(inputName)?true:null):raw||null;
      if(latest&&task.type==='complete')answer=true;
      else if(latest&&Array.isArray(latest.answer))answer=latest.answer;
      else if(latest&&typeof latest.answer==='string')answer=latest.answer;
      return {taskId:task.id,answer};
    });
    setBusy(mission.id);
    setMessage('');
    try {
      const response = await fetch('/api/student/classroom/submissions', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: mission.id, answers })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar.');
      await load();
      setMessage('Formulário enviado e registrado para o professor.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar.');
    } finally {
      setBusy('');
    }
  }

  const selectedModule=modules.find(module=>module.id===selectedModuleId);
  const selectedMission=selectedModule?.missions.find(mission=>mission.id===selectedMissionId)||selectedModule?.missions[0];

  return (
    <section className="classroom-student">
      <header>
        <span className="mission-label">MISSÕES DA TURMA</span>
        <h2>Atividades liberadas pelo professor</h2>
        <p>Suas respostas e conclusões ficam salvas com data e vinculadas ao seu perfil.</p>
      </header>
      {modules.length ? <>
        <nav className="classroom-module-tabs" aria-label="Módulos liberados">{modules.map((module,index)=><button type="button" key={module.id} className={selectedModuleId===module.id?'is-active':''} onClick={()=>{setSelectedModuleId(module.id);setSelectedMissionId(module.missions[0]?.id||'');}}><span>{String(index+1).padStart(2,'0')}</span>{module.title}<small>{module.missions.length} missões</small></button>)}</nav>
        <div className="classroom-learning-layout">{selectedModule&&<aside className="classroom-mission-index"><span className="teacher-kicker">MÓDULO · {selectedModule.title}</span><p>{selectedModule.description}</p>{selectedModule.missions.map((mission,index)=><button type="button" key={mission.id} className={selectedMissionId===mission.id?'is-active':''} onClick={()=>setSelectedMissionId(mission.id)}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{mission.title}</strong><small>{mission.tasks.length} pergunta(s)</small></div></button>)}</aside>}
        <article className="classroom-mission-detail">
          {selectedMission ? <>
              <span className="mission-section-label">{selectedModule?.title} · MISSÃO {String((selectedModule?.missions.findIndex(item=>item.id===selectedMission.id)||0)+1).padStart(2,'0')}</span><h3>{selectedMission.title}</h3>
              {selectedMission.objective && <p>{selectedMission.objective}</p>}{selectedMission.description && <p>{selectedMission.description}</p>}
              <form className="classroom-student-form" onSubmit={event=>void submit(event,selectedMission)}>
              {selectedMission.tasks.map((task, taskIndex) => {
                const latest = task.submissions?.[0];
                const value = answers[task.id] ?? (typeof latest?.answer === 'string' || Array.isArray(latest?.answer) ? latest.answer as string | string[] : '');
                const min = Number(task.settings?.scaleMin ?? 1);
                const max = Number(task.settings?.scaleMax ?? 5);
                return (
                  <article key={task.id} className="classroom-student-task">
                    <span className="teacher-kicker">TAREFA {taskIndex + 1} · {task.required ? 'OBRIGATÓRIA' : 'OPCIONAL'}</span>
                    <strong>{task.prompt}</strong>{task.description&&<p className="classroom-task-description">{task.description}</p>}
                    {task.type === 'text' ? <textarea name={`answer-${task.id}`} maxLength={2000} value={typeof value==='string'?value:''} onChange={event => setAnswers(current => ({ ...current, [task.id]: event.target.value }))} placeholder="Escreva sua resposta em um parágrafo." required={task.required&&!latest} disabled={Boolean(latest)} />
                    : task.type === 'short_answer' ? <input className="classroom-answer-input" name={`answer-${task.id}`} maxLength={300} value={typeof value==='string'?value:''} onChange={event=>setAnswers(current=>({...current,[task.id]:event.target.value}))} placeholder="Sua resposta" required={task.required&&!latest} disabled={Boolean(latest)} />
                    : task.type === 'multiple_choice' ? <fieldset className="classroom-choice-list"><legend>Escolha uma opção</legend>{task.options.map(option=><label key={option.value}><input type="radio" name={`answer-${task.id}`} value={option.value} checked={value===option.value} onChange={event=>setAnswers(current=>({...current,[task.id]:event.target.value}))} required={task.required&&!latest} disabled={Boolean(latest)}/>{option.label}</label>)}</fieldset>
                    : task.type === 'checkboxes' ? <fieldset className="classroom-choice-list"><legend>Selecione todas as opções aplicáveis</legend>{task.options.map(option=><label key={option.value}><input type="checkbox" name={`answer-${task.id}`} value={option.value} checked={Array.isArray(value)&&value.includes(option.value)} onChange={event=>setAnswers(current=>{const selected=Array.isArray(current[task.id])?[...current[task.id] as string[]]:[];return {...current,[task.id]:event.target.checked?[...selected,option.value]:selected.filter(item=>item!==option.value)}})} disabled={Boolean(latest)}/>{option.label}</label>)}{task.required&&!latest&&<small>Escolha pelo menos uma opção.</small>}</fieldset>
                    : task.type === 'dropdown' ? <select name={`answer-${task.id}`} value={typeof value==='string'?value:''} onChange={event=>setAnswers(current=>({...current,[task.id]:event.target.value}))} required={task.required&&!latest} disabled={Boolean(latest)}><option value="">Selecione uma resposta</option>{task.options.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select>
                    : task.type === 'linear_scale' ? <div className="classroom-scale"><small>{String(task.settings?.minLabel||'')}</small>{Array.from({length:Math.max(2,Math.min(10,max-min+1))},(_,index)=>min+index).map(number=><label key={number}><input type="radio" name={`answer-${task.id}`} value={number} checked={value===String(number)} onChange={event=>setAnswers(current=>({...current,[task.id]:event.target.value}))} required={task.required&&!latest} disabled={Boolean(latest)}/>{number}</label>)}<small>{String(task.settings?.maxLabel||'')}</small></div>
                    : task.type === 'date' ? <input className="classroom-answer-input" name={`answer-${task.id}`} type="date" value={typeof value==='string'?value:''} onChange={event=>setAnswers(current=>({...current,[task.id]:event.target.value}))} required={task.required&&!latest} disabled={Boolean(latest)} />
                    : <label className="classroom-complete-check"><input type="checkbox" name={`answer-${task.id}`} required={task.required&&!latest} disabled={Boolean(latest)} defaultChecked={Boolean(latest)} /> Marcar como concluída</label>}
                    {latest&&<div className="classroom-submitted"><span>✓ Registrada</span><time>{date(latest.submittedAt)}</time>{typeof latest.answer==='string'&&<p>{latest.answer}</p>}{Array.isArray(latest.answer)&&<p>{latest.answer.map(value=>task.options.find(option=>option.value===value)?.label||value).join(' · ')}</p>}</div>}
                  </article>
                );
              })}
              {selectedMission.tasks.some(task=>!task.submissions?.[0])&&<button className="button button-primary" type="submit" disabled={busy===selectedMission.id}>{busy===selectedMission.id?'Enviando formulário…':'Enviar formulário ao professor'}</button>}
              </form>
          </> : <div className="classroom-student-empty">Este módulo já foi liberado. As missões aparecerão aqui quando o professor adicioná-las.</div>}
        </article></div>
      </> : <div className="classroom-student-empty">{message}</div>}
      {modules.length > 0 && message && <p className="classroom-student-feedback" role="status">{message}</p>}
    </section>
  );
}
