'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getMission } from '@/domain/curriculum';

type StudentRow = {
  id: string; fullName: string; email: string; birthDate: string; createdAt: string; businessName: string | null; businessSegment?: string | null; businessDescription?: string | null; mainOffering?: string | null; targetAudience?: string | null; differentiator?: string | null; classId:string|null; className:string|null;
  completedMissions: number; totalMissions: number; photoCount: number; lastActivity: string;
};
type Photo = { id: string; fileName: string; product: string; angle: number; height: number; lightingSettings?: Record<string, unknown>; mimeType: string; sizeBytes: number; createdAt: string };
type InstalabPost = { id: string; studentId: string; authorName: string; body: string; businessName: string; businessSegment?: string; businessDescription?: string; hasAvatar?: boolean; classId:string; className?: string; imageName: string | null; imageMimeType: string | null; createdAt: string; likeCount: number; likedByMe: boolean; comments: Array<{ id:string; studentId:string|null; authorName:string; authorBusinessName?:string|null; hasAvatar?:boolean; authorRole:'student'|'teacher'; body:string; createdAt:string }> };
type Delivery = { id: string; activityName: string; description: string; classDate: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; quickMissionId?: string | null; quickMissionTitle?: string | null };
type ActivityEvent = { id:string; occurredAt:string; actorRole:'student'|'teacher'|'system'; eventType:string; entityType:string; entityId:string; classId:string|null; payload:Record<string,unknown>; legacy:boolean; actorIsStudent:boolean };
type QuickMission = { id: string; title: string; description: string; request: string; estimatedMinutes: number; dueAt: string | null; isActive: boolean; createdAt: string; submissionCount: number };
type QuickModule = { id: string; title: string; description: string; position: number; isPublished: boolean; missions: QuickMission[] };
type Detail = {
  student: { id: string; fullName: string; email: string; birthDate: string; createdAt: string; photoSharingConsent: boolean };
  business: null | { name: string; segment: string; description: string; mainOffering: string; targetAudience: string; differentiator: string };
  progress: { completedMissions: number; totalMissions: number; records: Array<{ missionId: string; status: string; answer: unknown; feedback: string; attemptCount: number; updatedAt: string; completedAt: string | null }> };
  photos: Photo[];
  instalabPosts: InstalabPost[];
  economy?: null | { wallet: { balance: number; earned: number; spent: number }; campaigns: Array<{ id:string;caption:string;status:string;budgetLimit:number;amountSpent:number;remainingBudget:number;paidIntervals:number;paidThrough:string|null;createdAt:string;rejectionReason:string|null;impressions:number }> };
  deliveries: Delivery[];
  classroomSubmissions: Array<{ id: string; answer: unknown; submittedAt: string; prompt: string; type: string; missionTitle: string; moduleTitle: string }>;
};
type ClassroomTaskType = 'text'|'short_answer'|'multiple_choice'|'checkboxes'|'dropdown'|'linear_scale'|'date'|'complete';
type ClassroomModule = { id:string; title:string; description:string; position:number; isPublished:boolean; missions:Array<{id:string;moduleId:string;title:string;objective:string;description:string;position:number;isPublished:boolean;tasks:Array<{id:string;prompt:string;description:string;type:ClassroomTaskType;required:boolean;settings:Record<string,unknown>;options:Array<{value:string;label:string}>;position:number;isPublished:boolean;submissionCount:number}>}> };
type TeacherView = 'central'|'students'|'emails'|'classes'|'businesses'|'instalab'|'campaigns'|'quick'|'classroom';
type TeacherClass = {id:string;name:string;joinCode:string;studentCount:number};
type TeacherCampaign = {id:string;studentId:string;studentName:string;businessName:string;className:string;caption:string;objective:string;budgetLimit:number;amountSpent:number;remainingBudget:number;paidIntervals:number;paidThrough:string|null;status:string;createdAt:string;rejectionReason:string|null;billingReason:string|null;hasImage:boolean;sourcePostId:string|null;impressions:number};
type EconomySecurityEvent = {id:number;studentId:string;studentName:string;className:string|null;eventType:string;createdAt:string};
type EconomyRules = {timezoneName:string;postReward:number;likeReward:number;commentReward:number;dailyRewardCap:number;dailyLikeRewardLimit:number;dailyCommentRewardLimit:number;adIntervalMinutes:number;adIntervalCost:number};

const safeDate = (value: string | null | undefined) => {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T12:00:00Z` : value;
  const date = new Date(dateOnly);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDate = (value: string | null | undefined) => {
  const date = safeDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date) : 'Data indisponível';
};
const lightPresetLabels:Record<string,string>={natural:'natural',professional:'profissional',warm:'quente',cold:'fria',dramatic:'dramática',low:'baixa',custom:'personalizada'};
const formatDateTime = (value: string | null | undefined) => {
  const date = safeDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date) : 'Data indisponível';
};
const activityDay = (value:string) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const localToday = () => { const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); return `${parts.find(part=>part.type==='year')?.value}-${parts.find(part=>part.type==='month')?.value}-${parts.find(part=>part.type==='day')?.value}`; };
const activityLabels:Record<string,string> = {
  'student.registered':'Cadastro do aluno','student.archived':'Cadastro arquivado','student.restored':'Cadastro restaurado',
  'business.created':'Empresa cadastrada','business.updated':'Empresa atualizada','business.baseline':'Estado inicial da empresa no histórico',
  'mission.started':'Missão iniciada','mission.attempted':'Tentativa de missão registrada','mission.completed':'Missão concluída','mission.baseline':'Estado inicial da missão no histórico',
  'classroom.task.submitted':'Tarefa da turma respondida','delivery.submitted':'Entrega enviada','delivery.deleted':'Entrega removida','quick_mission.submitted':'Missão Relâmpago respondida','quick_mission.delivery_deleted':'Resposta da Missão Relâmpago removida',
  'instalab.post_created':'Publicação criada no InstaLab','instalab.post_edited':'Publicação editada no InstaLab','instalab.post_deleted':'Publicação removida do InstaLab','instalab.like_added':'Curtida adicionada','instalab.like_removed':'Curtida removida','instalab.comment_added':'Comentário adicionado','instalab.comment_removed':'Comentário removido',
  'instalab.coins_earned':'MetaCoins recebidas','instalab.coins_reversed':'MetaCoins estornadas','instalab.ad_created':'Anúncio enviado para revisão','instalab.ad_spend':'MetaCoins reservadas para anúncio','instalab.ad_refund':'MetaCoins devolvidas','instalab.ad_approved':'Anúncio aprovado','instalab.ad_rejected':'Anúncio reprovado','instalab.ad_suspended':'Anúncio suspenso','instalab.ad_resumed':'Anúncio retomado','instalab.ad_ended':'Anúncio encerrado','instalab.coins_adjusted':'Ajuste de MetaCoins','instalab.duplicate_suppressed':'Conteúdo duplicado sem recompensa',
  'camera.photo_received':'Foto recebida da Câmera','camera.photo_updated':'Foto sincronizada ou atualizada','camera.photo_removed':'Foto removida da Câmera','class.joined':'Entrou em uma turma','class.left':'Saiu de uma turma','class.transferred':'Transferência de turma','session.started':'Sessão iniciada','session.ended':'Sessão encerrada'
};
const activityGroups = (events:ActivityEvent[]) => {
  const groups = new Map<string,ActivityEvent[]>();
  for(const event of events){const day=activityDay(event.occurredAt);groups.set(day,[...(groups.get(day)||[]),event]);}
  return [...groups.entries()];
};
const taskTypeLabel = (type: ClassroomTaskType) => ({ text:'Parágrafo', short_answer:'Resposta curta', multiple_choice:'Múltipla escolha', checkboxes:'Caixas de seleção', dropdown:'Lista suspensa', linear_scale:'Escala linear', date:'Data', complete:'Marcar como concluída' }[type]);

export default function TeacherPanel() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [archivedStudents, setArchivedStudents] = useState<StudentRow[]>([]);
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [emailQuery, setEmailQuery] = useState('');
  const [showArchivedStudents, setShowArchivedStudents] = useState(false);
  const [studentActionBusy, setStudentActionBusy] = useState(false);
  const [teacherClasses,setTeacherClasses]=useState<TeacherClass[]>([]);
  const [instalabPosts,setInstalabPosts]=useState<InstalabPost[]>([]);
  const [instalabLoaded,setInstalabLoaded]=useState(false);
  const [instalabBusy,setInstalabBusy]=useState(false);
  const [instalabMessage,setInstalabMessage]=useState('');
  const [instalabDrafts,setInstalabDrafts]=useState<Record<string,string>>({});
  const [instalabClassFilter,setInstalabClassFilter]=useState('');
  const [instalabEditingId,setInstalabEditingId]=useState<string|null>(null);
  const [instalabEditingImage,setInstalabEditingImage]=useState<File|null>(null);
  const [instalabRemoveImage,setInstalabRemoveImage]=useState(false);
  const [instalabCampaigns,setInstalabCampaigns]=useState<TeacherCampaign[]>([]);
  const [economySecurityEvents,setEconomySecurityEvents]=useState<EconomySecurityEvent[]>([]);
  const [campaignMessage,setCampaignMessage]=useState('');
  const [campaignBusyId,setCampaignBusyId]=useState('');
  const [economyRules,setEconomyRules]=useState<EconomyRules|null>(null);
  const [newClassName,setNewClassName]=useState('');
  const [classBusy,setClassBusy]=useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [query, setQuery] = useState('');
  const [detailBusy, setDetailBusy] = useState(false);
  const [historyMode,setHistoryMode]=useState<'day'|'range'|'all'>('day');
  const [historyDate,setHistoryDate]=useState('');
  const [historyFrom,setHistoryFrom]=useState('');
  const [historyTo,setHistoryTo]=useState('');
  const [historyEvents,setHistoryEvents]=useState<ActivityEvent[]>([]);
  const [historyDays,setHistoryDays]=useState<string[]>([]);
  const [historyTotal,setHistoryTotal]=useState(0);
  const [historyOffset,setHistoryOffset]=useState(0);
  const [historyBusy,setHistoryBusy]=useState(false);
  const [historyError,setHistoryError]=useState('');
  const [historyPrintOnly,setHistoryPrintOnly]=useState(false);
  const [historyPrintEvents,setHistoryPrintEvents]=useState<ActivityEvent[]>([]);
  const [historyPrintLabel,setHistoryPrintLabel]=useState('');
  const [historyPrintStudent,setHistoryPrintStudent]=useState<{fullName:string;email:string;birthDate:string;className:string|null}|null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [quickModules, setQuickModules] = useState<QuickModule[]>([]);
  const [quickSelectedId, setQuickSelectedId] = useState('');
  const [missionBusy, setMissionBusy] = useState(false);
  const [missionMessage, setMissionMessage] = useState('');
  const [view, setView] = useState<TeacherView>('central');
  const [classroomModules, setClassroomModules] = useState<ClassroomModule[]>([]);
  const [classroomModuleId, setClassroomModuleId] = useState('');
  const [showModuleForm, setShowModuleForm] = useState(false);
  const [showMissionForm, setShowMissionForm] = useState(false);
  const [classroomBusy, setClassroomBusy] = useState(false);
  const [classroomMessage, setClassroomMessage] = useState('');

  const loadRoster = useCallback(async (selectFirst = true) => {
    const response = await fetch('/api/teacher/students', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Não foi possível carregar a turma.');
    const payload = await response.json() as { students: StudentRow[] };
    setStudents(payload.students);
    setSelectedId(current => current && payload.students.some(item => item.id === current) ? current : selectFirst ? payload.students[0]?.id || '' : '');
  }, []);

  const loadArchivedRoster = useCallback(async () => {
    const response = await fetch('/api/teacher/students?archived=true', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Não foi possível carregar os alunos removidos.');
    const payload = await response.json() as { students: StudentRow[] };
    setArchivedStudents(payload.students);
    setArchivedLoaded(true);
  }, []);

  const loadQuickMissions = useCallback(async () => {
    const response = await fetch('/api/teacher/quick-missions', { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as missões relâmpago.');
    setQuickModules(data.modules);
    setQuickSelectedId(current => current && data.modules.some((module: QuickModule) => module.id === current) ? current : data.modules[0]?.id || '');
  }, []);

  const loadClasses=useCallback(async()=>{const response=await fetch('/api/teacher/classes',{cache:'no-store',credentials:'same-origin'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível carregar as turmas.');setTeacherClasses(data.classes);},[]);

  const loadInstalab=useCallback(async()=>{const response=await fetch('/api/teacher/instalab',{cache:'no-store',credentials:'same-origin'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível carregar o InstaLab.');setInstalabPosts(data.posts);setInstalabLoaded(true);setInstalabMessage('');},[]);
  const refreshInstalab=useCallback(async()=>{try{await loadInstalab();}catch(error){setInstalabLoaded(true);setInstalabMessage(error instanceof Error?error.message:'Não foi possível carregar o InstaLab.');}},[loadInstalab]);
  const loadInstalabCampaigns=useCallback(async()=>{const [response,rulesResponse]=await Promise.all([fetch('/api/teacher/instalab/campaigns',{cache:'no-store',credentials:'same-origin'}),fetch('/api/teacher/instalab/economy',{cache:'no-store',credentials:'same-origin'})]);const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível carregar os anúncios.');setInstalabCampaigns(data.campaigns);setEconomySecurityEvents(data.suspectedOperations||[]);if(rulesResponse.ok){const rulesData=await rulesResponse.json();setEconomyRules(rulesData.rules as EconomyRules);}else setEconomyRules(null);},[]);
  const saveEconomyRules=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!economyRules)return;setCampaignMessage('');try{const response=await fetch('/api/teacher/instalab/economy',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(economyRules)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível salvar as regras.');setCampaignMessage('Regras da economia salvas e registradas no histórico administrativo.');await loadInstalabCampaigns();}catch(error){setCampaignMessage(error instanceof Error?error.message:'Não foi possível salvar as regras.');}};
  const reviewInstalabCampaign=async(campaign:TeacherCampaign,action:'approve'|'reject'|'suspend'|'resume')=>{setCampaignBusyId(campaign.id);setCampaignMessage('');try{const response=await fetch(`/api/teacher/instalab/campaigns/${campaign.id}`,{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível atualizar o anúncio.');await loadInstalabCampaigns();setCampaignMessage(action==='reject'?'Anúncio reprovado; as MetaCoins foram devolvidas.':'Status do anúncio atualizado.');}catch(error){setCampaignMessage(error instanceof Error?error.message:'Não foi possível atualizar o anúncio.');}finally{setCampaignBusyId('');}};

  const loadClassroom = useCallback(async () => {
    const response=await fetch('/api/teacher/classroom',{cache:'no-store',credentials:'same-origin'});const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Não foi possível carregar Missão da Turma.');setClassroomModules(data.modules);return data.modules as ClassroomModule[];
  },[]);

  useEffect(() => {
    fetch('/api/teacher/session', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => response.ok ? response.json() as Promise<{ configured: boolean; authenticated: boolean }> : null)
      .then(async payload => {
        setConfigured(payload?.configured === true);
        if (payload?.authenticated) {
          setAuthenticated(true);
          await Promise.all([loadRoster(), loadQuickMissions(), loadClassroom(), loadClasses()]);
        }
      })
      .catch(() => setMessage('Não foi possível verificar o acesso agora.'))
      .finally(() => setLoading(false));
  }, [loadRoster, loadQuickMissions, loadClassroom, loadClasses]);

  useEffect(() => {
    if (authenticated && view === 'emails' && !archivedLoaded) {
      void loadArchivedRoster().catch(error => setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os e-mails.'));
    }
  }, [authenticated, view, archivedLoaded, loadArchivedRoster]);

  useEffect(() => {
    if (!authenticated || !selectedId || view !== 'students') { setDetail(null); setDetailBusy(false); return; }
    let active = true;
    setDetailBusy(true);
    fetch(`/api/teacher/students/${selectedId}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const payload = await response.json().catch(() => ({})) as Detail & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Não foi possível abrir o aluno.');
        if (active) setDetail(payload);
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Falha ao abrir dados do aluno.'); })
      .finally(() => { if (active) setDetailBusy(false); });
    return () => { active = false; };
  }, [authenticated, selectedId, view]);

  useEffect(()=>{if(!historyDate){const today=localToday();setHistoryDate(today);setHistoryFrom(today);setHistoryTo(today);}},[historyDate]);
  useEffect(()=>{if(!historyPrintOnly)return;const finish=()=>setHistoryPrintOnly(false);window.addEventListener('afterprint',finish);return()=>window.removeEventListener('afterprint',finish);},[historyPrintOnly]);

  useEffect(()=>{
    if(!authenticated||!selectedId||view!=='students'||!detail||detail.student.id!==selectedId){setHistoryEvents([]);setHistoryDays([]);setHistoryTotal(0);return;}
    if(historyMode==='day'&&!historyDate)return;
    if(historyMode==='range'&&(!historyFrom||!historyTo))return;
    let active=true;
    const params=new URLSearchParams({limit:'50',offset:'0'});
    if(historyMode==='day'){params.set('from',historyDate);params.set('to',historyDate);}
    if(historyMode==='range'){params.set('from',historyFrom);params.set('to',historyTo);}
    setHistoryBusy(true);setHistoryError('');setHistoryOffset(0);setHistoryEvents([]);setHistoryDays([]);setHistoryTotal(0);
    fetch(`/api/teacher/students/${selectedId}/history?${params}`,{cache:'no-store',credentials:'same-origin'})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível carregar o histórico.');return data as {events:ActivityEvent[];total:number;hasMore:boolean;recordedDays:string[]};})
      .then(data=>{if(active){setHistoryEvents(data.events);setHistoryTotal(data.total);setHistoryDays(data.recordedDays);setHistoryOffset(data.events.length);}})
      .catch(error=>{if(active)setHistoryError(error instanceof Error?error.message:'Não foi possível carregar o histórico.');})
      .finally(()=>{if(active)setHistoryBusy(false);});
    return()=>{active=false;};
  },[authenticated,selectedId,view,detail?.student.id,historyMode,historyDate,historyFrom,historyTo]);

  useEffect(()=>{
    if(!authenticated||view!=='instalab')return;
    void refreshInstalab();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refreshInstalab();},15000);
    return()=>window.clearInterval(timer);
  },[authenticated,view,refreshInstalab]);

  useEffect(()=>{if(!authenticated||view!=='campaigns')return;void loadInstalabCampaigns().catch(error=>setCampaignMessage(error instanceof Error?error.message:'Não foi possível carregar os anúncios.'));},[authenticated,view,loadInstalabCampaigns]);

  useEffect(() => {
    if (!authenticated || !selectedId || view !== 'students') return;
    let active = true;
    const refreshPhotos = async () => {
      try {
        const response = await fetch(`/api/teacher/students/${selectedId}/photos`, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) return;
        const payload = await response.json() as { photos: Photo[] };
        if (active) setDetail(current => current?.student.id === selectedId ? { ...current, photos: payload.photos } : current);
      } catch { /* A ficha mantém os últimos dados até a próxima tentativa. */ }
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshPhotos();
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [authenticated, selectedId, view]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return normalized ? students.filter(item => item.fullName.toLocaleLowerCase('pt-BR').includes(normalized) || item.email.toLocaleLowerCase('pt-BR').includes(normalized) || item.businessName?.toLocaleLowerCase('pt-BR').includes(normalized)) : students;
  }, [query, students]);

  const emailRoster = useMemo(() => {
    const rows = new Map([...students, ...archivedStudents].map(student => [student.id, student]));
    const normalized = emailQuery.trim().toLocaleLowerCase('pt-BR');
    return [...rows.values()].filter(student => !normalized || `${student.fullName} ${student.email} ${student.className || ''}`.toLocaleLowerCase('pt-BR').includes(normalized));
  }, [students, archivedStudents, emailQuery]);

  async function copyStudentEmails() {
    const emails = [...new Set(emailRoster.map(student => student.email.trim()).filter(Boolean))];
    try { await navigator.clipboard.writeText(emails.join('; ')); setMessage(`${emails.length} endereço(s) copiado(s).`); }
    catch { setMessage('Não foi possível copiar automaticamente. Selecione os endereços na lista.'); }
  }

  function downloadStudentEmails() {
    const csvCell = (value: string) => `"${value.replace(/"/gu, '""')}"`;
    const archivedIds = new Set(archivedStudents.map(student => student.id));
    const csv = [['Nome', 'E-mail', 'Turma', 'Status'], ...emailRoster.map(student => [student.fullName, student.email, student.className || 'Sem turma', archivedIds.has(student.id) ? 'Removido' : 'Ativo'])].map(row => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'emails-alunos-metalab.csv'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoginBusy(true); setMessage('');
    try {
      const response = await fetch('/api/teacher/session', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: String(form.get('cpf') || ''), password: String(form.get('password') || '') })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível entrar.');
      setAuthenticated(true);
      await Promise.all([loadRoster(), loadQuickMissions(), loadClassroom(), loadClasses()]);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível entrar.'); }
    finally { setLoginBusy(false); }
  }

  async function logout() {
    await fetch('/api/teacher/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    setAuthenticated(false); setStudents([]); setDetail(null); setSelectedId('');
  }

  async function archiveSelectedStudent() {
    const student = detail?.student;
    if (!student || studentActionBusy) return;
    const confirmed = window.confirm(`Remover ${student.fullName} da lista ativa? O acesso será encerrado. Fotos, entregas e progresso serão preservados e o cadastro poderá ser restaurado.`);
    if (!confirmed) return;

    setStudentActionBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/teacher/students/${student.id}`, { method: 'DELETE', credentials: 'same-origin' });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível remover o aluno.');
      setDetail(null);
      setSelectedId('');
      setMessage('Aluno removido da lista ativa. O histórico foi preservado; você pode restaurar o cadastro em “Ver removidos”.');
      await loadRoster();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível remover o aluno.');
    } finally {
      setStudentActionBusy(false);
    }
  }

  async function restoreStudent(student: StudentRow) {
    if (studentActionBusy || !window.confirm(`Restaurar o cadastro de ${student.fullName}? O aluno poderá entrar novamente com o e-mail e a data de nascimento cadastrados.`)) return;
    setStudentActionBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/teacher/students/${student.id}`, {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível restaurar o aluno.');
      await Promise.all([loadArchivedRoster(), loadRoster(!showArchivedStudents)]);
      setMessage('Cadastro restaurado. O aluno pode entrar novamente e o histórico foi mantido.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível restaurar o aluno.');
    } finally {
      setStudentActionBusy(false);
    }
  }

  async function createMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMissionBusy(true); setMissionMessage('');
    try {
      const rawDue = String(form.get('dueAt') || '');
      const response = await fetch('/api/teacher/quick-missions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action:'mission', data:{ moduleId:String(form.get('moduleId')||''), title:String(form.get('title')||''), description:String(form.get('description')||''), request:String(form.get('request')||''), estimatedMinutes:Number(form.get('estimatedMinutes')), dueAt:rawDue?new Date(rawDue).toISOString():null } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível publicar a missão.');
      formElement.reset(); setMissionMessage('Missão salva. Libere o módulo para disponibilizar todas as missões aos alunos.'); await loadQuickMissions();
    } catch (error) { setMissionMessage(error instanceof Error ? error.message : 'Não foi possível salvar a missão.'); }
    finally { setMissionBusy(false); }
  }

  async function createQuickModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement=event.currentTarget; const form=new FormData(formElement); setMissionBusy(true); setMissionMessage('');
    try { const response=await fetch('/api/teacher/quick-missions',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'module',data:{title:String(form.get('title')||''),description:String(form.get('description')||'')}})}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Não foi possível criar o módulo.'); formElement.reset(); setQuickSelectedId(data.id); await loadQuickMissions(); setMissionMessage('Módulo criado como rascunho.'); }
    catch(error){setMissionMessage(error instanceof Error?error.message:'Não foi possível criar o módulo.');} finally{setMissionBusy(false);}
  }

  async function toggleQuickModule(module: QuickModule) {
    setMissionBusy(true); setMissionMessage('');
    try {
      const response = await fetch('/api/teacher/quick-missions', { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moduleId: module.id, published: !module.isPublished }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o módulo.');
      await loadQuickMissions();
    } catch (error) { setMissionMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o módulo.'); }
    finally { setMissionBusy(false); }
  }

  async function saveClass(action:'create'|'assign',data:Record<string,unknown>){setClassBusy(true);setMessage('');try{const response=await fetch('/api/teacher/classes',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Não foi possível salvar a turma.');if(action==='create'&&selectedId){const assigned=await fetch('/api/teacher/classes',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'assign',studentId:selectedId,classId:payload.id})});const assignment=await assigned.json();if(!assigned.ok)throw new Error(assignment.error||'Turma criada, mas não foi possível associar o aluno.');setTeacherClasses(assignment.classes);}else setTeacherClasses(payload.classes);if(action==='create')setNewClassName('');await loadRoster();}catch(error){setMessage(error instanceof Error?error.message:'Não foi possível salvar a turma.');}finally{setClassBusy(false);}}

  async function createClassOnly(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setClassBusy(true); setMessage('');
    try {
      const response = await fetch('/api/teacher/classes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', name: newClassName }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Não foi possível criar a turma.');
      setTeacherClasses(result.classes); setNewClassName(''); setMessage(`Turma criada. Código de entrada: ${result.joinCode}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível criar a turma.'); }
    finally { setClassBusy(false); }
  }

  async function toggleTeacherInstalabLike(post: InstalabPost) {
    setInstalabBusy(true);setInstalabMessage('');
    try{
      const response=await fetch(`/api/teacher/instalab/${post.id}/like`,{method:post.likedByMe?'DELETE':'POST',credentials:'same-origin'});const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Não foi possível registrar a curtida.');
      setInstalabPosts(current=>current.map(item=>item.id===post.id?{...item,likeCount:data.likeCount,likedByMe:data.likedByMe}:item));
    }catch(error){setInstalabMessage(error instanceof Error?error.message:'Não foi possível registrar a curtida.');}
    finally{setInstalabBusy(false);}
  }

  async function editTeacherInstalabPost(event:FormEvent<HTMLFormElement>,post:InstalabPost){
    event.preventDefault();const formData=new FormData(event.currentTarget);if(instalabEditingImage)formData.set('image',instalabEditingImage);else formData.delete('image');formData.set('removeImage',String(instalabRemoveImage&&!instalabEditingImage));setInstalabBusy(true);setInstalabMessage('');
    try{const response=await fetch(`/api/teacher/instalab/${post.id}`,{method:'PATCH',credentials:'same-origin',body:formData});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível editar a publicação.');setInstalabPosts(data.posts);setInstalabEditingId(null);setInstalabEditingImage(null);setInstalabRemoveImage(false);setInstalabMessage('Publicação atualizada.');}
    catch(error){setInstalabMessage(error instanceof Error?error.message:'Não foi possível editar a publicação.');}
    finally{setInstalabBusy(false);}
  }

  async function deleteTeacherInstalabPost(post: InstalabPost) {
    if(!window.confirm(`Excluir a publicação de ${post.businessName}? Esta ação também remove curtidas e comentários.`))return;
    setInstalabBusy(true);setInstalabMessage('');
    try{const response=await fetch(`/api/teacher/instalab/${post.id}`,{method:'DELETE',credentials:'same-origin'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível excluir a publicação.');setInstalabPosts(current=>current.filter(item=>item.id!==post.id));}
    catch(error){setInstalabMessage(error instanceof Error?error.message:'Não foi possível excluir a publicação.');}
    finally{setInstalabBusy(false);}
  }

  async function commentOnInstalabPost(event:FormEvent<HTMLFormElement>,post:InstalabPost){
    event.preventDefault();const body=instalabDrafts[post.id]?.trim();if(!body)return;setInstalabBusy(true);setInstalabMessage('');
    try{const response=await fetch(`/api/teacher/instalab/${post.id}/comments`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({body})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível comentar.');setInstalabPosts(current=>current.map(item=>item.id===post.id?{...item,comments:data.comments}:item));setInstalabDrafts(current=>({...current,[post.id]:''}));}
    catch(error){setInstalabMessage(error instanceof Error?error.message:'Não foi possível enviar o comentário.');}
    finally{setInstalabBusy(false);}
  }

  async function deleteTeacherInstalabComment(post:InstalabPost,commentId:string){
    if(!window.confirm('Excluir este comentário?'))return;setInstalabBusy(true);setInstalabMessage('');
    try{const response=await fetch(`/api/teacher/instalab/comments/${commentId}`,{method:'DELETE',credentials:'same-origin'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível excluir o comentário.');setInstalabPosts(current=>current.map(item=>item.id===post.id?{...item,comments:item.comments.filter(comment=>comment.id!==commentId)}:item));}
    catch(error){setInstalabMessage(error instanceof Error?error.message:'Não foi possível excluir o comentário.');}
    finally{setInstalabBusy(false);}
  }

  async function classroomWrite(event: FormEvent<HTMLFormElement>, action: 'module'|'mission'|'task', parentId?: string) {
    event.preventDefault(); const formElement=event.currentTarget; const form=new FormData(formElement); setClassroomBusy(true); setClassroomMessage('');
    const data:Record<string,unknown>={};
    if(action==='module'){data.title=String(form.get('title')||'');data.description=String(form.get('description')||'');}
    if(action==='mission'){data.moduleId=parentId;data.title=String(form.get('title')||'');data.objective=String(form.get('objective')||'');data.description=String(form.get('description')||'');}
    if(action==='task'){
      data.missionId=parentId;data.prompt=String(form.get('prompt')||'');data.description=String(form.get('questionDescription')||'');data.type=String(form.get('type')||'paragraph');data.required=form.get('required')==='on';
      const raw=String(form.get('options')||'').split('\n').map(value=>value.trim()).filter(Boolean);
      data.options=raw.map((label,index)=>({value:`option-${index+1}`,label}));
      data.settings={scaleMin:Number(form.get('scaleMin')||1),scaleMax:Number(form.get('scaleMax')||5),minLabel:String(form.get('minLabel')||''),maxLabel:String(form.get('maxLabel')||'')};
    }
    try{const existingModuleIds=new Set(classroomModules.map(module=>module.id));const response=await fetch('/api/teacher/classroom',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Não foi possível salvar.');formElement.reset();setClassroomMessage(action==='task'?'Pergunta adicionada ao formulário da missão.':'Conteúdo salvo. Libere o módulo para disponibilizar as missões aos alunos.');const updated=await loadClassroom();if(action==='module'){const created=updated.find(item=>!existingModuleIds.has(item.id));if(created){setClassroomModuleId(created.id);setShowModuleForm(false);}}if(action==='mission')setShowMissionForm(false);}
    catch(error){setClassroomMessage(error instanceof Error?error.message:'Não foi possível salvar.');}finally{setClassroomBusy(false);}
  }

  async function publishClassroom(id:string,published:boolean){setClassroomBusy(true);setClassroomMessage('');try{const response=await fetch('/api/teacher/classroom',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'publish',kind:'module',id,published})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível alterar a publicação.');await loadClassroom();}catch(error){setClassroomMessage(error instanceof Error?error.message:'Não foi possível atualizar.');}finally{setClassroomBusy(false);}}

  async function printStudentReport() {
    setPrintBusy(true);
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('.teacher-detail img'));
    for (const image of images) {
      image.loading = 'eager';
      try { await image.decode(); } catch { /* o relatório continua se uma imagem não carregar */ }
    }
    window.print();
    setPrintBusy(false);
  }

  async function loadMoreHistory(){
    if(!selectedId||historyBusy)return;setHistoryBusy(true);setHistoryError('');
    try{const params=new URLSearchParams({limit:'50',offset:String(historyOffset)});if(historyMode==='day'){params.set('from',historyDate);params.set('to',historyDate);}if(historyMode==='range'){params.set('from',historyFrom);params.set('to',historyTo);}const response=await fetch(`/api/teacher/students/${selectedId}/history?${params}`,{cache:'no-store',credentials:'same-origin'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível carregar mais registros.');setHistoryEvents(current=>[...current,...data.events]);setHistoryOffset((current:number)=>current+data.events.length);setHistoryTotal(data.total);setHistoryDays(data.recordedDays);}catch(error){setHistoryError(error instanceof Error?error.message:'Não foi possível carregar mais registros.');}finally{setHistoryBusy(false);}
  }

  async function printActivityHistory(scope:'day'|'range'|'all'){
    if(!selectedId||!detail)return;
    const from=scope==='day'?historyDate:scope==='range'?historyFrom:null;const to=scope==='day'?historyDate:scope==='range'?historyTo:null;
    if(scope==='range'&&(!from||!to||from>to)){setHistoryError('Escolha um intervalo válido para gerar o relatório.');return;}
    setHistoryBusy(true);setHistoryError('');
    try{const rows:ActivityEvent[]=[];let offset=0;let total=0;do{const params=new URLSearchParams({limit:'100',offset:String(offset)});if(from)params.set('from',from);if(to)params.set('to',to);const response=await fetch(`/api/teacher/students/${selectedId}/history?${params}`,{cache:'no-store',credentials:'same-origin'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível preparar o relatório.');rows.push(...data.events);total=data.total;offset+=data.events.length;if(!data.events.length)break;}while(offset<total&&offset<5000);if(offset<total)throw new Error('Este histórico ultrapassa o limite de impressão. Gere o PDF por períodos menores.');setHistoryPrintStudent({fullName:detail.student.fullName,email:detail.student.email,birthDate:detail.student.birthDate,className:students.find(student=>student.id===selectedId)?.className||null});setHistoryPrintEvents(rows);setHistoryPrintLabel(scope==='all'?'Histórico completo disponível':scope==='day'?`Dia ${formatDate(`${from}T12:00:00Z`)}`:`Período ${formatDate(`${from}T12:00:00Z`)} a ${formatDate(`${to}T12:00:00Z`)}`);setHistoryPrintOnly(true);window.setTimeout(()=>window.print(),100);}catch(error){setHistoryError(error instanceof Error?error.message:'Não foi possível gerar o relatório.');}finally{setHistoryBusy(false);}
  }

  if (loading) return <main className="teacher-page"><div className="teacher-loading">Preparando o ambiente do professor…</div></main>;

  if (!authenticated) return (
    <main className="teacher-page teacher-login-page">
      <div className="teacher-login-card">
        <img src="/simulator/assets/metalab-logo.png" alt="MetaLab" />
        <span className="section-tag">ÁREA RESTRITA · PROFESSOR</span>
        <h1>Acompanhar a turma.</h1>
        <p>Entre com as credenciais institucionais para consultar progresso e fotos compartilhadas pelos alunos.</p>
        {!configured ? <div className="teacher-alert">Acesso ainda não configurado. Defina CPF, senha e segredo de sessão do professor nas variáveis protegidas do servidor.</div> : (
          <form className="teacher-login-form" onSubmit={login}>
            <label htmlFor="teacher-cpf">CPF ou identificador docente</label>
            <input id="teacher-cpf" name="cpf" inputMode="numeric" autoComplete="username" placeholder="CPF ou código de 11 dígitos" maxLength={14} required />
            <label htmlFor="teacher-password">Senha de acesso</label>
            <input id="teacher-password" name="password" type="password" autoComplete="current-password" required />
            <button className="button button-primary button-wide" type="submit" disabled={loginBusy}>{loginBusy ? 'Verificando…' : 'Acessar painel'}</button>
          </form>
        )}
        <p className="teacher-feedback" role="alert">{message}</p>
        <small className="teacher-security-note">Esta rota não aparece na navegação dos alunos. CPF sozinho não é usado como senha.</small>
      </div>
    </main>
  );

  const completionRate = students.length ? Math.round(students.reduce((sum, item) => sum + item.completedMissions / Math.max(1, item.totalMissions), 0) / students.length * 100) : 0;
  return (
    <main className={`teacher-page teacher-app${historyPrintOnly?' is-printing-history':''}`}>
      <aside className="teacher-sidebar" aria-label="Menu do professor">
        <a href="/docente/painel" className="teacher-brand"><img src="/simulator/assets/metalab-logo.png" alt="MetaLab" /><span>POCKET <i>· PROFESSOR</i></span></a>
        <nav className="teacher-side-nav">{([['central','⌂','Central'],['students','AL','Alunos'],['emails','@','E-mails cadastrados'],['classes','TU','Turmas'],['businesses','NE','Empresas dos alunos'],['instalab','IL','InstaLab'],['campaigns','AD','Anúncios InstaLab'],['quick','MR','Missão Relâmpago'],['classroom','MI','Missão da Turma']] as Array<[TeacherView,string,string]>).map(([id,icon,label])=><button type="button" key={id} className={view===id?'is-active':''} onClick={()=>{setView(id);setMessage('');}}><i aria-hidden="true">{icon}</i><span>{label}</span></button>)}</nav>
        <div className="teacher-sidebar-note"><span>✦</span><div><strong>Ambiente protegido</strong><small>Acompanhamento da turma</small></div></div>
        <button className="teacher-logout" onClick={() => void logout()}>Encerrar acesso</button>
      </aside>
      <div className="teacher-main">
      <header className="teacher-topbar"><div className="teacher-mobile-brand">MetaLab Pocket <span>· Professor</span></div><button className="button button-secondary" onClick={() => void logout()}>Encerrar acesso</button></header>
      <section className="teacher-heading"><div><span className="section-tag">ACOMPANHAMENTO DA FORMAÇÃO</span><h1>{view==='central'?'Central do professor':view==='students'?'Alunos':view==='emails'?'E-mails cadastrados':view==='classes'?'Turmas':view==='businesses'?'Empresas dos alunos':view==='instalab'?'InstaLab':view==='campaigns'?'Anúncios do InstaLab':view==='quick'?'Missão Relâmpago':'Missão da Turma'}</h1><p>{view==='central'?'Resumo da turma, atividades recentes e atalhos para a formação.':view==='instalab'?'Acompanhe e modere as publicações de todas as turmas.':view==='campaigns'?'Revise campanhas, acompanhe reservas virtuais e modere o destaque interno.':view==='emails'?'Consulte e exporte os contatos cadastrados, incluindo alunos removidos.':'Área docente · dados restritos à turma autorizada.'}</p></div><div className="teacher-summary"><strong>{students.length}</strong><span>alunos</span><i /><strong>{completionRate}%</strong><span>conclusão média</span></div></section>
      {message && <div className="teacher-alert" role="status">{message}<button aria-label="Fechar aviso" onClick={() => setMessage('')}>×</button></div>}
      {view==='central'&&<section className="teacher-central"><div className="teacher-central-cards"><button onClick={()=>setView('students')}><strong>{students.length}</strong><span>Alunos acompanhados</span><small>Ver nomes, contatos e progresso →</small></button><button onClick={()=>setView('emails')}><strong>{students.length+archivedStudents.length}</strong><span>E-mails cadastrados</span><small>Consultar e exportar contatos →</small></button><button onClick={()=>setView('classes')}><strong>{teacherClasses.length}</strong><span>Turmas</span><small>Criar turma e compartilhar código →</small></button><button onClick={()=>setView('businesses')}><strong>{students.filter(item=>item.businessName).length}</strong><span>Empresas cadastradas</span><small>Ver negócios da turma →</small></button><button onClick={()=>setView('quick')}><strong>{quickModules.filter(item=>item.isPublished).length}</strong><span>Módulos relâmpago liberados</span><small>Organizar desafios de aula →</small></button><button onClick={()=>setView('classroom')}><strong>{classroomModules.filter(item=>item.isPublished).length}</strong><span>Módulos da turma liberados</span><small>Organizar trilha da turma →</small></button></div><section className="teacher-subsection"><div className="teacher-subhead"><div><span className="teacher-kicker">RECENTES</span><h3>Últimos alunos ativos</h3></div><button className="button button-secondary" onClick={()=>setView('students')}>Abrir lista de alunos</button></div>{students.slice(0,5).map(student=><button className="teacher-recent-student" key={student.id} onClick={()=>{setSelectedId(student.id);setView('students');}}><span className="teacher-avatar">{student.fullName.charAt(0).toUpperCase()}</span><span><strong>{student.fullName}</strong><small>{student.businessName||student.email}</small></span><small>{formatDateTime(student.lastActivity)}</small></button>)}</section></section>}
      {view==='emails'&&<section className="teacher-email-admin"><header className="teacher-email-toolbar"><div><span className="teacher-kicker">CADASTROS DA PLATAFORMA</span><h2>Contatos dos alunos</h2><p>Lista restrita ao professor. Alunos ativos e removidos aparecem identificados para facilitar a conferência.</p></div><div className="teacher-email-actions"><button type="button" className="button button-secondary" onClick={()=>void Promise.all([loadRoster(false),loadArchivedRoster()]).catch(error=>setMessage(error instanceof Error?error.message:'Não foi possível atualizar os contatos.'))}>Atualizar</button><button type="button" className="button button-secondary" disabled={!archivedLoaded||!emailRoster.length} onClick={()=>void copyStudentEmails()}>Copiar e-mails</button><button type="button" className="button button-primary" disabled={!archivedLoaded||!emailRoster.length} onClick={downloadStudentEmails}>Baixar CSV</button></div></header><label className="teacher-email-search">Buscar aluno ou e-mail<input value={emailQuery} onChange={event=>setEmailQuery(event.target.value)} placeholder="Digite um nome, e-mail ou turma" /></label><div className="teacher-email-count">{emailRoster.length} {emailRoster.length===1?'cadastro encontrado':'cadastros encontrados'} · {new Set(emailRoster.map(student=>student.email.toLocaleLowerCase('pt-BR'))).size} e-mails únicos</div>{emailRoster.length?<div className="teacher-email-list"><div className="teacher-email-list-head"><span>Aluno</span><span>E-mail</span><span>Turma</span><span>Status</span></div>{emailRoster.map(student=>{const archived=archivedStudents.some(item=>item.id===student.id);return <article key={student.id}><span><strong>{student.fullName}</strong><small>{formatDate(student.createdAt)}</small></span><a href={`mailto:${student.email}`}>{student.email}</a><span>{student.className||'Sem turma'}</span><span className={`teacher-email-status${archived?' is-archived':''}`}>{archived?'Removido':'Ativo'}</span></article>;})}</div>:<div className="teacher-empty-detail">{archivedLoaded?'Nenhum aluno corresponde à busca.':'Carregando cadastros…'}</div>}</section>}
      {view==='quick'&&<section className="teacher-quick-admin"><div className="teacher-subhead"><div><span className="teacher-kicker">DESAFIOS DA AULA</span><h2>Missão Relâmpago</h2></div><span>{quickModules.filter(item=>item.isPublished).length} módulos liberados</span></div><p>Crie módulos para organizar os desafios rápidos. O botão de liberação do módulo controla todas as missões dentro dele.</p>
        <form className="teacher-quick-form teacher-create-module" onSubmit={createQuickModule}><h3>Novo módulo de Missão Relâmpago</h3><label>Nome do módulo<input name="title" minLength={3} maxLength={120} placeholder="Ex.: Vitrine e fotografia de produto" required /></label><label>Descrição<textarea name="description" maxLength={1000} rows={2} placeholder="Tema ou objetivo do conjunto de desafios." /></label><button className="button button-primary" disabled={missionBusy}>Criar módulo</button></form>
        {quickSelectedId&&<form className="teacher-quick-form" onSubmit={createMission}><h3>Adicionar missão ao módulo</h3><label>Módulo<select name="moduleId" value={quickSelectedId} onChange={event=>setQuickSelectedId(event.target.value)}>{quickModules.map(module=><option value={module.id} key={module.id}>{module.title}</option>)}</select></label><label>Nome da missão<input name="title" minLength={3} maxLength={120} placeholder="Ex.: Apresente seu produto em 3 ângulos" required /></label><label>Descrição<textarea name="description" minLength={3} maxLength={1000} rows={2} placeholder="Contexto breve para a turma." required /></label><label>Solicitação ao aluno<textarea name="request" minLength={3} maxLength={2000} rows={3} placeholder="O que deve produzir, observar ou explicar? Que arquivo precisa anexar?" required /></label><div className="teacher-quick-form-row"><label>Tempo sugerido<select name="estimatedMinutes" defaultValue="15">{[5,10,15,20,30,45,60,90,120,180].map(value=><option value={value} key={value}>{value} minutos</option>)}</select></label><label>Prazo (opcional)<input name="dueAt" type="datetime-local" /></label></div><button className="button button-secondary" disabled={missionBusy}>Adicionar missão</button><span className="teacher-quick-feedback" role="status">{missionMessage}</span></form>}
        {missionMessage&&!quickSelectedId&&<p className="teacher-quick-feedback" role="status">{missionMessage}</p>}
        {quickModules.length?quickModules.map((module,index)=><article className="teacher-class-module" key={module.id}><header><div><span className="section-tag">MÓDULO {String(index+1).padStart(2,'0')}</span><h3>{module.title}</h3><p>{module.description}</p></div><div><span className={`quick-mission-status ${module.isPublished?'is-submitted':''}`}>{module.isPublished?'LIBERADO':'RASCUNHO'}</span><button className="button button-secondary" disabled={missionBusy} onClick={()=>void toggleQuickModule(module)}>{module.isPublished?'Recolher módulo':'Liberar para todos'}</button></div></header>{module.missions.length?module.missions.map(mission=><article className="teacher-class-task" key={mission.id}><div><strong>{mission.title}</strong><small>{mission.submissionCount||0} entrega(s) · {mission.estimatedMinutes} min · {mission.dueAt?`prazo ${formatDateTime(mission.dueAt)}`:'sem prazo'}</small><p>{mission.description} {mission.request}</p></div><span className={`quick-mission-status ${module.isPublished?'':'is-submitted'}`}>{module.isPublished?'VISÍVEL PARA A TURMA':'OCULTA ATÉ LIBERAR'}</span></article>):<p className="teacher-empty-detail">Este módulo ainda não tem missões.</p>}</article>):<p className="teacher-empty-detail">Crie seu primeiro módulo rápido acima.</p>}
      </section>}
      {view==='classes'&&<section className="teacher-classes-admin">
        <header className="teacher-classes-heading"><div><span className="teacher-kicker">ORGANIZAÇÃO DA AULA</span><h2>Turmas e códigos de entrada</h2><p>Organize seus alunos e compartilhe um código simples para cada turma.</p></div><div className="teacher-class-total"><strong>{teacherClasses.length}</strong><span>{teacherClasses.length===1?'turma criada':'turmas criadas'}</span></div></header>
        <form className="teacher-create-class-form" onSubmit={createClassOnly}><div><span className="teacher-kicker">NOVA TURMA</span><h3>Comece organizando sua sala</h3><p>Os alunos entram com o código gerado ou você pode matriculá-los abaixo.</p></div><label>Nome da turma<input value={newClassName} onChange={event=>setNewClassName(event.target.value)} minLength={2} maxLength={120} placeholder="Ex.: Turma da manhã · Outubro" required/></label><button className="button button-primary" disabled={classBusy}>{classBusy?'Criando…':'＋ Criar turma'}</button></form>
        <section className="teacher-classes-list-section"><div className="teacher-subhead"><div><span className="teacher-kicker">SUAS TURMAS</span><h3>Códigos de entrada</h3></div><span>{teacherClasses.reduce((count,item)=>count+item.studentCount,0)} alunos matriculados</span></div>
        {teacherClasses.length?<div className="teacher-class-admin-grid">{teacherClasses.map((item,index)=><article key={item.id}><div className="teacher-class-admin-head"><span className="teacher-class-code-icon">{String(index+1).padStart(2,'0')}</span><div><h3>{item.name}</h3><small>{item.studentCount} {item.studentCount===1?'aluno':'alunos'}</small></div></div><div className="teacher-class-code"><span><small>CÓDIGO PARA ENTRAR</small><strong>{item.joinCode}</strong></span><button type="button" className="button button-secondary" onClick={()=>void navigator.clipboard.writeText(item.joinCode).then(()=>setMessage('Código copiado.')).catch(()=>setMessage(`Código da turma: ${item.joinCode}`))}>Copiar código</button></div><p>Compartilhe este código com os alunos desta turma.</p></article>)}</div>:<div className="teacher-empty-detail teacher-class-empty"><span>＋</span><strong>Nenhuma turma criada ainda</strong><p>Crie uma turma acima para gerar o código de entrada dos alunos.</p></div>}
        </section>
        <section className="teacher-class-roster"><header className="teacher-roster-heading"><div><span className="teacher-kicker">MATRÍCULAS</span><h3>Adicionar ou mover alunos</h3><p>Escolha uma turma para cada aluno. A alteração é salva imediatamente.</p></div><span className="teacher-roster-total">{students.length} {students.length===1?'aluno':'alunos'}</span></header>{students.length?<div className="teacher-class-roster-list">{students.map(student=><div className="teacher-class-roster-row" key={student.id}><span className="teacher-roster-avatar">{student.fullName.charAt(0).toUpperCase()}</span><span className="teacher-roster-student"><strong>{student.fullName}</strong><small>{student.email}</small></span><span className={`teacher-roster-status ${student.classId?'':'is-unassigned'}`}>{student.className||'Sem turma'}</span><select value={student.classId||''} disabled={classBusy} onChange={event=>void saveClass('assign',{studentId:student.id,classId:event.target.value||null})} aria-label={`Turma de ${student.fullName}`}><option value="">Sem turma</option>{teacherClasses.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></div>)}</div>:<div className="teacher-empty-detail teacher-class-empty"><strong>Nenhum aluno cadastrado</strong><p>Os alunos aparecerão aqui assim que criarem o cadastro no MetaLab Pocket.</p></div>}</section>
      </section>}
      {view==='businesses'&&<section className="teacher-businesses"><div className="teacher-subhead"><div><span className="teacher-kicker">TURMAS · {teacherClasses.length}</span><h2>Empresas dos alunos</h2></div><span>{students.filter(item=>item.businessName).length} negócios</span></div>{teacherClasses.length>0&&<div className="teacher-class-chips">{teacherClasses.map(item=><span key={item.id}>{item.name}<small>{item.studentCount} aluno(s)</small></span>)}</div>}{students.some(item=>item.businessName)?<div className="teacher-business-grid">{students.filter(item=>item.businessName).map(student=><article key={student.id}><div className="teacher-business-card-head"><span className="teacher-avatar">{student.fullName.charAt(0).toUpperCase()}</span><div><h3>{student.businessName}</h3><p>{student.businessSegment||'Segmento não informado'} · {student.className||'Sem turma'}</p></div></div><p>{student.businessDescription||'Descrição não cadastrada.'}</p><dl><div><dt>Oferta</dt><dd>{student.mainOffering||'—'}</dd></div><div><dt>Público</dt><dd>{student.targetAudience||'—'}</dd></div><div><dt>Diferencial</dt><dd>{student.differentiator||'—'}</dd></div></dl><button className="button button-secondary" onClick={()=>{setSelectedId(student.id);setView('students');}}>Abrir perfil do aluno</button></article>)}</div>:<p className="teacher-empty-detail">Ainda não há empresas cadastradas pela turma.</p>}</section>}
      {view==='instalab'&&<section className="teacher-instalab-admin"><header className="teacher-instalab-toolbar"><div><span className="teacher-kicker">REDE DAS TURMAS</span><h2>Publicações do InstaLab</h2><p>Visualize, curta, comente e modere conteúdos de qualquer turma.</p></div><div className="teacher-instalab-filters"><label>Turma<select value={instalabClassFilter} onChange={event=>setInstalabClassFilter(event.target.value)}><option value="">Todas as turmas</option>{teacherClasses.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button type="button" className="button button-secondary" onClick={()=>void refreshInstalab()}>Atualizar feed</button></div></header>
        {instalabMessage&&<p className="teacher-instalab-message" role="status">{instalabMessage}</p>}
        {!instalabLoaded?<div className="teacher-empty-detail teacher-instalab-empty"><p>Carregando publicações das turmas…</p></div>:instalabPosts.filter(post=>!instalabClassFilter||post.classId===instalabClassFilter).length? <div className="teacher-instalab-feed">{instalabPosts.filter(post=>!instalabClassFilter||post.classId===instalabClassFilter).map(post=><article className="teacher-instalab-post" key={post.id}>
          <header>{post.hasAvatar?<img className="teacher-instalab-avatar" src={'/api/instalab/avatar/'+post.studentId} alt={'Foto de '+post.businessName}/>:<span className="teacher-avatar">{post.businessName.charAt(0).toUpperCase()}</span>}<div><strong>{post.businessName}</strong><small>{post.authorName}{post.businessSegment?' · '+post.businessSegment:''} · {post.className||'Turma'} · {formatDateTime(post.createdAt)}</small></div><div className="teacher-instalab-controls"><button type="button" className="button button-secondary" disabled={instalabBusy} onClick={()=>{setInstalabEditingId(current=>current===post.id?null:post.id);setInstalabEditingImage(null);setInstalabRemoveImage(false);}}>{instalabEditingId===post.id?'Cancelar':'Editar'}</button><button type="button" className="teacher-instalab-delete" disabled={instalabBusy} onClick={()=>void deleteTeacherInstalabPost(post)}>Excluir</button></div></header>
          {instalabEditingId===post.id?<form className="teacher-instalab-edit-form" onSubmit={event=>void editTeacherInstalabPost(event,post)}><label>Texto da publicação<textarea name="body" maxLength={2000} rows={4} defaultValue={post.body}/></label>{post.imageMimeType&&<label className="teacher-instalab-remove-image"><input type="checkbox" checked={instalabRemoveImage} onChange={event=>setInstalabRemoveImage(event.target.checked)}/> Remover imagem atual</label>}<label className="teacher-instalab-image-picker">{instalabEditingImage?'Trocar imagem selecionada':'Adicionar ou trocar imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{setInstalabEditingImage(event.target.files?.[0]||null);if(event.target.files?.[0])setInstalabRemoveImage(false);}}/></label><small>JPG, PNG ou WebP · até 4 MB</small><button className="button button-primary" disabled={instalabBusy}>{instalabBusy?'Salvando…':'Salvar alterações'}</button></form>:<>
          {post.body&&<p className="teacher-instalab-body">{post.body}</p>}{post.imageMimeType&&<img className="teacher-instalab-image" src={`/api/teacher/instalab/${post.id}/image`} alt={post.imageName||`Publicação de ${post.businessName}`} loading="lazy"/>}
          <div className="teacher-instalab-actions"><button type="button" className={post.likedByMe?'is-liked':''} aria-pressed={post.likedByMe} aria-label={post.likedByMe?'Descurtir publicação':'Curtir publicação'} disabled={instalabBusy} onClick={()=>void toggleTeacherInstalabLike(post)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 4-7a3 3 0 0 1 2 3v3h5.2a2.5 2.5 0 0 1 2.45 3l-1.4 7A2.5 2.5 0 0 1 16.8 21H7Z"/></svg> {post.likedByMe?'Curtido':'Curtir'}</button><span>{post.likeCount} curtida(s) · {post.comments.length} comentário(s)</span></div>
          <div className="teacher-instalab-comments">{post.comments.map(comment=><div className="teacher-instalab-comment" key={comment.id}><p>{comment.hasAvatar&&comment.studentId?<img className="teacher-comment-avatar" src={'/api/instalab/avatar/'+comment.studentId} alt="" loading="lazy"/>:<i>{comment.authorBusinessName?.charAt(0)||comment.authorName.charAt(0)}</i>}<span><strong>{comment.authorBusinessName||comment.authorName}</strong>{comment.authorBusinessName&&<small>{comment.authorName} · </small>}<small>{comment.authorRole==='teacher'?'Professor':'Aluno'} · {formatDateTime(comment.createdAt)}</small><span>{comment.body}</span></span></p><button type="button" disabled={instalabBusy} onClick={()=>void deleteTeacherInstalabComment(post,comment.id)} aria-label={`Excluir comentário de ${comment.authorName}`}>Excluir</button></div>)}</div>
          <form className="teacher-instalab-comment-form" onSubmit={event=>void commentOnInstalabPost(event,post)}><input maxLength={1000} value={instalabDrafts[post.id]||''} onChange={event=>setInstalabDrafts(current=>({...current,[post.id]:event.target.value}))} placeholder="Escreva um comentário como professor…" aria-label={`Comentar na publicação de ${post.businessName}`}/><button className="button button-primary" disabled={instalabBusy||!instalabDrafts[post.id]?.trim()}>{instalabBusy?'Enviando…':'Comentar'}</button></form>
          </>}
        </article>)}</div>:<div className="teacher-empty-detail teacher-instalab-empty"><span>✦</span><h3>Nenhuma publicação encontrada</h3><p>{instalabClassFilter?'Essa turma ainda não publicou no InstaLab.':'As publicações das turmas aparecerão aqui.'}</p><button className="button button-secondary" type="button" onClick={()=>void refreshInstalab()}>Atualizar feed</button></div>}
      </section>}
      {view==='campaigns'&&<section className="teacher-instalab-campaigns"><header><div><span className="teacher-kicker">INSTA LAB · ECONOMIA VIRTUAL</span><h2>Revisão de anúncios</h2><p>Campanhas de todas as turmas. A cobrança começa após aprovação e ocorre por intervalos pagos.</p></div><button type="button" className="button button-secondary" onClick={()=>void loadInstalabCampaigns()}>Atualizar</button></header>{campaignMessage&&<p className="teacher-instalab-message" role="status">{campaignMessage}</p>}{economySecurityEvents.length>0&&<details className="teacher-economy-settings"><summary>Conteúdos duplicados sem recompensa · {economySecurityEvents.length}</summary><div className="teacher-economy-security-list">{economySecurityEvents.map(event=><p key={event.id}><strong>{event.studentName}</strong> · {event.className||'Sem turma'} · conteúdo repetido registrado em {formatDateTime(event.createdAt)}</p>)}</div></details>}{economyRules&&<details className="teacher-economy-settings"><summary>Configurar regras da economia (administrador)</summary><form onSubmit={event=>void saveEconomyRules(event)}><label>Fuso horário<input value={economyRules.timezoneName} onChange={event=>setEconomyRules({...economyRules,timezoneName:event.target.value})}/></label><div className="teacher-economy-grid">{([['postReward','Publicação +'],['likeReward','Curtida +'],['commentReward','Comentário +'],['dailyRewardCap','Limite diário total'],['dailyLikeRewardLimit','Curtidas que pontuam/dia'],['dailyCommentRewardLimit','Comentários que pontuam/dia'],['adIntervalCost','Custo por intervalo']] as Array<[keyof EconomyRules,string]>).map(([key,label])=><label key={key}>{label}<input type="number" min={key.includes('Limit')||key.includes('Cap')?'0':'1'} value={economyRules[key]} onChange={event=>setEconomyRules({...economyRules,[key]:Number(event.target.value)})}/></label>)}</div><p className="teacher-economy-note">Intervalo fixo de 10 minutos por veiculação.</p><button className="button button-primary">Salvar regras</button></form></details>}{instalabCampaigns.length?instalabCampaigns.map(campaign=><article key={campaign.id}><div className="teacher-campaign-meta"><span>{campaign.className}</span><span>{campaign.studentName} · {campaign.businessName}</span></div><h3>{campaign.caption}</h3>{campaign.hasImage&&<img className="teacher-campaign-image" src={`/api/teacher/instalab/campaigns/${campaign.id}/image`} alt={`Criativo do anúncio de ${campaign.businessName}`} loading="lazy"/>}<p>Orçamento {campaign.budgetLimit} · consumido {campaign.amountSpent} · restante {campaign.remainingBudget} MetaCoins · {campaign.paidIntervals} intervalo(s) pagos · {campaign.impressions} impressões · {formatDateTime(campaign.createdAt)}</p><strong className={'campaign-status campaign-'+campaign.status}>{campaign.status==='pending'?'Aguardando revisão':campaign.status==='active'?'Em veiculação':campaign.status==='no_balance'?'Sem saldo':campaign.status}</strong>{campaign.rejectionReason&&<p>{campaign.rejectionReason}</p>}<div className="teacher-campaign-actions">{campaign.status==='pending'&&<><button className="button button-primary" type="button" disabled={campaignBusyId===campaign.id} onClick={()=>void reviewInstalabCampaign(campaign,'approve')}>Aprovar e ativar</button><button className="button button-secondary" type="button" disabled={campaignBusyId===campaign.id} onClick={()=>void reviewInstalabCampaign(campaign,'reject')}>Reprovar</button></>}{campaign.status==='active'&&<button className="button button-secondary" type="button" disabled={campaignBusyId===campaign.id} onClick={()=>void reviewInstalabCampaign(campaign,'suspend')}>Suspender</button>}{campaign.status==='suspended'&&<button className="button button-secondary" type="button" disabled={campaignBusyId===campaign.id} onClick={()=>void reviewInstalabCampaign(campaign,'resume')}>Retomar</button>}</div></article>):<div className="teacher-empty-detail"><h3>Nenhum anúncio enviado</h3><p>As campanhas que os alunos enviarem para revisão aparecerão aqui.</p></div>}</section>}
      {view==='classroom'&&<section className="teacher-classroom">
        <header className="teacher-classroom-heading"><div><span className="teacher-kicker">TRILHA PERSONALIZADA · TURMA</span><h2>Missão da Turma</h2><p>Monte cada módulo como um formulário: organize as missões, escreva perguntas e libere o conjunto para a turma quando estiver pronto.</p></div>{classroomModuleId&&<button type="button" className="button button-secondary" onClick={()=>{setClassroomModuleId('');setShowMissionForm(false);}}>← Todos os módulos</button>}</header>
        {classroomMessage&&<p className="teacher-quick-feedback" role="status">{classroomMessage}</p>}
        {!classroomModuleId&&<>
          <div className="teacher-module-library-head"><div><span className="teacher-kicker">BIBLIOTECA DE CONTEÚDO</span><h3>{classroomModules.length} módulo(s)</h3><p>Abra um módulo para organizar missões e perguntas.</p></div><button type="button" className="button button-primary" onClick={()=>setShowModuleForm(value=>!value)}>＋ Criar módulo</button></div>
          {showModuleForm&&<form className="teacher-quick-form teacher-create-module teacher-module-create-card" onSubmit={event=>void classroomWrite(event,'module')}><div className="teacher-form-title"><span>01</span><div><h3>Novo módulo</h3><p>Defina o tema e o objetivo de aprendizagem.</p></div></div><label>Nome do módulo<input name="title" minLength={3} maxLength={120} placeholder="Ex.: Fotografia de produtos" required/></label><label>Objetivo e descrição<textarea name="description" maxLength={1000} rows={3} placeholder="O que a turma vai aprender neste módulo?"/></label><button className="button button-primary" disabled={classroomBusy}>{classroomBusy?'Criando…':'Criar e abrir módulo'}</button></form>}
          {classroomModules.length?<div className="teacher-module-library">{classroomModules.map((module,index)=><button type="button" className="teacher-module-tile" key={module.id} onClick={()=>{setClassroomModuleId(module.id);setClassroomMessage('');}}><span className="teacher-module-number">MÓDULO {String(index+1).padStart(2,'0')}</span><span className={"quick-mission-status "+(module.isPublished?'is-submitted':'')}>{module.isPublished?'LIBERADO':'RASCUNHO'}</span><strong>{module.title}</strong><p>{module.description||'Sem descrição. Abra para montar o conteúdo pedagógico.'}</p><span className="teacher-module-counts">{module.missions.length} missões · {module.missions.reduce((total,mission)=>total+mission.tasks.length,0)} perguntas</span><span className="teacher-module-open">Abrir editor <b>→</b></span></button>)}</div>:<div className="teacher-module-empty"><span>✦</span><h3>Sua trilha começa aqui</h3><p>Crie o primeiro módulo e adicione missões no editor.</p><button className="button button-secondary" onClick={()=>setShowModuleForm(true)}>Criar primeiro módulo</button></div>}
        </>}
        {classroomModuleId&&(()=>{const module=classroomModules.find(item=>item.id===classroomModuleId);if(!module)return <div className="teacher-module-empty"><p>Este módulo não está disponível.</p><button className="button button-secondary" onClick={()=>setClassroomModuleId('')}>Voltar à biblioteca</button></div>;return <div className="teacher-form-editor">
          <div className="teacher-form-cover"><span className="teacher-kicker">EDITOR DO MÓDULO · {module.missions.length} MISSÕES</span><h2>{module.title}</h2><p>{module.description||'Defina o objetivo deste módulo para orientar a turma.'}</p><div className="teacher-form-cover-bottom"><span className={"quick-mission-status "+(module.isPublished?'is-submitted':'')}>{module.isPublished?'PUBLICADO PARA A TURMA':'RASCUNHO · SÓ VOCÊ VÊ'}</span><button className="button button-primary" disabled={classroomBusy} onClick={()=>void publishClassroom(module.id,!module.isPublished)}>{module.isPublished?'Recolher módulo':'Liberar módulo para todos'}</button></div></div>
          <div className="teacher-form-instructions"><span>✦</span><p><strong>Como funciona</strong> As missões abaixo ficam visíveis aos alunos quando o módulo é liberado. As respostas são salvas por aluno e aparecem no perfil docente.</p></div>
          <div className="teacher-mission-builder-head"><div><span className="teacher-kicker">CONTEÚDO DO FORMULÁRIO</span><h3>Missões deste módulo</h3></div><button type="button" className="button button-secondary" onClick={()=>setShowMissionForm(value=>!value)}>＋ Adicionar missão</button></div>
          {showMissionForm&&<form className="teacher-mission-create-card" onSubmit={event=>void classroomWrite(event,'mission',module.id)}><div className="teacher-form-title"><span>{String(module.missions.length+1).padStart(2,'0')}</span><div><h3>Nova missão</h3><p>Crie uma seção de atividades dentro deste módulo.</p></div></div><label>Nome da missão<input name="title" minLength={3} maxLength={150} placeholder="Ex.: Apresente seu produto" required/></label><label>Objetivo de aprendizagem<input name="objective" maxLength={500} placeholder="O que o aluno deve praticar ou demonstrar?"/></label><label>Instruções e contexto<textarea name="description" maxLength={3000} rows={4} placeholder="Explique a situação, os materiais necessários e o resultado esperado."/></label><button className="button button-primary" disabled={classroomBusy}>{classroomBusy?'Salvando…':'Criar missão e adicionar perguntas'}</button></form>}
          {module.missions.length?module.missions.map((mission,missionIndex)=><article className="teacher-form-mission" key={mission.id}><div className="teacher-form-mission-accent"/><div className="teacher-form-mission-body"><header><div><span className="teacher-kicker">SEÇÃO {String(missionIndex+1).padStart(2,'0')} · {mission.tasks.length} PERGUNTA(S)</span><h3>{mission.title}</h3>{mission.objective&&<p className="teacher-form-objective">{mission.objective}</p>}{mission.description&&<p>{mission.description}</p>}</div><span className="teacher-form-section-icon">▤</span></header>{mission.tasks.length>0&&<div className="teacher-form-question-list">{mission.tasks.map((task,taskIndex)=><article className="teacher-form-question-preview" key={task.id}><span className="teacher-form-question-number">{String(taskIndex+1).padStart(2,'0')}</span><div><strong>{task.prompt}{task.required&&<i aria-label="Obrigatória"> *</i>}</strong>{task.description&&<p>{task.description}</p>}<small>{taskTypeLabel(task.type)} · {task.required?'Obrigatória':'Opcional'} · {task.submissionCount||0} resposta(s)</small>{task.options.length>0&&<div className="teacher-form-option-preview">{task.options.map(option=><span key={option.value}><i/>{option.label}</span>)}</div>}</div></article>)}</div>}<ClassroomTaskComposer busy={classroomBusy} onSubmit={event=>void classroomWrite(event,'task',mission.id)}/></div></article>):<div className="teacher-module-empty teacher-mission-empty"><span>▤</span><h3>Nenhuma missão neste módulo</h3><p>Adicione uma missão para começar a montar o formulário e suas perguntas.</p><button className="button button-secondary" onClick={()=>setShowMissionForm(true)}>Adicionar primeira missão</button></div>}
        </div>})()}
      </section>}
      {view==='students'&&<div className="teacher-workspace">
        <aside className="teacher-roster"><div className="teacher-roster-title"><div><span className="section-tag">{showArchivedStudents ? 'REMOVIDOS' : 'ALUNOS'}</span><h2>{showArchivedStudents ? archivedStudents.length : students.length} registros</h2></div><div className="teacher-roster-actions"><button type="button" className="teacher-archive-toggle" onClick={() => { const next = !showArchivedStudents; setShowArchivedStudents(next); setSelectedId(''); setDetail(null); setMessage(''); if (next) void loadArchivedRoster().catch(error => setMessage(error.message)); else void loadRoster().catch(error => setMessage(error.message)); }}>{showArchivedStudents ? '← Alunos ativos' : 'Ver removidos'}</button><button aria-label="Atualizar lista" title="Atualizar lista" onClick={() => void (showArchivedStudents ? loadArchivedRoster() : loadRoster()).catch(error => setMessage(error.message))}>↻</button></div></div><input className="teacher-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nome, e-mail ou empresa" aria-label="Buscar aluno, e-mail ou empresa" />
          {showArchivedStudents ? archivedStudents.length ? <div className="teacher-roster-list">{archivedStudents.filter(item => !query.trim() || item.fullName.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')) || item.email.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map(student => <article key={student.id} className="teacher-student-row teacher-archived-row"><span className="teacher-avatar">{student.fullName.charAt(0).toUpperCase()}</span><span className="teacher-student-copy"><strong>{student.fullName}</strong><small>{student.email}</small><small>Removido · progresso preservado</small></span><button type="button" className="teacher-restore-student" disabled={studentActionBusy} onClick={() => void restoreStudent(student)}>Restaurar</button></article>)}</div> : <p className="teacher-empty-roster">Nenhum aluno removido.</p> : filtered.length ? <div className="teacher-roster-list">{filtered.map(student => <button key={student.id} className={`teacher-student-row ${selectedId === student.id ? 'is-selected' : ''}`} onClick={() => { setSelectedId(student.id); setMessage(''); }}><span className="teacher-avatar">{student.fullName.charAt(0).toUpperCase()}</span><span className="teacher-student-copy"><strong>{student.fullName}</strong><small>{student.email}</small><small>Nascimento: {formatDate(`${student.birthDate}T12:00:00`)}</small><span className="teacher-mini-progress"><i style={{ width: `${Math.round(student.completedMissions / Math.max(1, student.totalMissions) * 100)}%` }} /></span></span><span className="teacher-student-count">{student.completedMissions}/{student.totalMissions}</span></button>)}</div> : <p className="teacher-empty-roster">{students.length ? 'Nenhum resultado para essa busca.' : 'Ainda não há alunos cadastrados.'}</p>}
        </aside>
        <section className="teacher-detail">{detailBusy ? <div className="teacher-empty-detail">Carregando dados do aluno…</div> : detail ? <>
          <header className="teacher-detail-head"><div><span className="section-tag">ALUNO · DESDE {formatDate(detail.student.createdAt).toUpperCase()}</span><h2>{detail.student.fullName}</h2><p>{detail.business?.name || 'Projeto de negócio em construção'}{detail.business?.segment ? ` · ${detail.business.segment}` : ''}</p><div className="teacher-student-meta"><span>E-mail: {detail.student.email}</span><span>Nascimento: {formatDate(`${detail.student.birthDate}T12:00:00`)}</span><span>Fotos da Câmera: disponíveis automaticamente</span></div></div><div className="teacher-score"><strong>{detail.progress.completedMissions}<small>/{detail.progress.totalMissions}</small></strong><span>missões concluídas</span><button className="button button-primary print-hidden" type="button" disabled={printBusy} onClick={() => void printStudentReport()}>{printBusy ? 'Preparando imagens…' : 'Salvar relatório em PDF'}</button><button className="teacher-remove-student print-hidden" type="button" disabled={studentActionBusy} onClick={() => void archiveSelectedStudent()}>{studentActionBusy ? 'Salvando…' : 'Remover aluno'}</button></div></header>
          <section className="teacher-class-assignment print-hidden"><div><span className="teacher-kicker">VÍNCULO DE TURMA</span><strong>{students.find(student=>student.id===selectedId)?.className||'Aluno sem turma'}</strong><small>Esta associação é salva no banco e aparece na lista de alunos.</small></div><label>Adicionar ou mover para turma<select value={students.find(student=>student.id===selectedId)?.classId||''} disabled={classBusy} onChange={event=>void saveClass('assign',{studentId:selectedId,classId:event.target.value||null})}><option value="">Sem turma</option>{teacherClasses.map(item=><option value={item.id} key={item.id}>{item.name} · {item.studentCount}</option>)}</select></label><form onSubmit={event=>{event.preventDefault();void saveClass('create',{name:newClassName});}}><label>Criar turma e vincular<input value={newClassName} onChange={event=>setNewClassName(event.target.value)} minLength={2} maxLength={120} placeholder="Ex.: Turma XSDASX" required /></label><button className="button button-secondary" disabled={classBusy}>{classBusy?'Salvando…':'Criar e vincular'}</button></form></section>
          <div className="teacher-progress-track"><i style={{ width: `${Math.round(detail.progress.completedMissions / Math.max(1, detail.progress.totalMissions) * 100)}%` }} /></div>
          <section className="teacher-history-printable teacher-subsection" aria-labelledby="student-activity-history-title">
            <header className="teacher-history-report-head"><div><span className="teacher-kicker">HISTÓRICO PERSISTENTE · FUSO DE SÃO PAULO</span><h3 id="student-activity-history-title">Histórico de atividades</h3><p>{historyPrintOnly&&historyPrintStudent?historyPrintStudent.fullName:detail.student.fullName} · {historyPrintOnly&&historyPrintStudent?historyPrintStudent.email:detail.student.email} · Nascimento: {formatDate(`${(historyPrintOnly&&historyPrintStudent?historyPrintStudent.birthDate:detail.student.birthDate)}T12:00:00Z`)} · Turma atual: {historyPrintOnly&&historyPrintStudent?historyPrintStudent.className||'Sem turma':students.find(student=>student.id===selectedId)?.className||'Sem turma'}</p><small>Dados atuais de identificação são mostrados separadamente dos eventos registrados.</small></div><strong className="teacher-history-print-label">{historyPrintOnly?historyPrintLabel:''}</strong></header>
            <div className="teacher-history-controls print-hidden">
              <div className="teacher-history-modes" role="group" aria-label="Modo de consulta do histórico"><button type="button" className={historyMode==='day'?'is-active':''} aria-pressed={historyMode==='day'} onClick={()=>setHistoryMode('day')}>Por dia</button><button type="button" className={historyMode==='range'?'is-active':''} aria-pressed={historyMode==='range'} onClick={()=>setHistoryMode('range')}>Período</button><button type="button" className={historyMode==='all'?'is-active':''} aria-pressed={historyMode==='all'} onClick={()=>setHistoryMode('all')}>Histórico completo</button></div>
              {historyMode==='day'&&<div className="teacher-history-date-controls"><button type="button" aria-label="Dia anterior" disabled={!historyDate} onClick={()=>{const d=new Date(`${historyDate}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);setHistoryDate(d.toISOString().slice(0,10));}}>← Dia anterior</button><label>Data selecionada<input type="date" value={historyDate} onChange={event=>setHistoryDate(event.target.value)} /></label><button type="button" aria-label="Próximo dia" disabled={!historyDate} onClick={()=>{const d=new Date(`${historyDate}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);setHistoryDate(d.toISOString().slice(0,10));}}>Próximo dia →</button></div>}
              {historyMode==='range'&&<div className="teacher-history-date-controls"><label>De<input type="date" value={historyFrom} onChange={event=>setHistoryFrom(event.target.value)} /></label><label>Até<input type="date" value={historyTo} onChange={event=>setHistoryTo(event.target.value)} /></label></div>}
              <div className="teacher-history-pdf-actions"><button type="button" className="button button-secondary" disabled={historyBusy||!historyDate} onClick={()=>void printActivityHistory('day')}>PDF do dia</button><button type="button" className="button button-secondary" disabled={historyBusy||!historyFrom||!historyTo} onClick={()=>void printActivityHistory('range')}>PDF do período</button><button type="button" className="button button-primary" disabled={historyBusy} onClick={()=>void printActivityHistory('all')}>PDF do histórico completo</button></div>
              {historyDays.length>0&&<div className="teacher-history-days"><span>Dias com registros</span>{historyDays.slice(0,8).map(day=><button type="button" key={day} onClick={()=>{setHistoryMode('day');setHistoryDate(day);}}>{formatDate(`${day}T12:00:00Z`)}</button>)}{historyDays.length>8&&<details><summary>Ver todos os {historyDays.length} dias</summary><div>{historyDays.map(day=><button type="button" key={day} onClick={()=>{setHistoryMode('day');setHistoryDate(day);}}>{formatDate(`${day}T12:00:00Z`)}</button>)}</div></details>}</div>}
            </div>
            {historyError&&<p className="teacher-alert teacher-history-error" role="alert">{historyError}</p>}
            <div className="teacher-history-content">{historyBusy&&!historyEvents.length&&!historyPrintOnly?<p className="teacher-empty-detail">Carregando histórico…</p>:!historyEvents.length&&!historyPrintOnly?<p className="teacher-empty-detail">Nenhuma atividade registrada {historyMode==='day'&&historyDate?`em ${formatDate(`${historyDate}T12:00:00Z`)}`:historyMode==='range'?'neste período':'ainda'}.</p>:(historyPrintOnly?historyPrintEvents:historyEvents).map((event,index,events)=><div className="teacher-history-event-wrap" key={event.id}>{(index===0||activityDay(events[index-1].occurredAt)!==activityDay(event.occurredAt))&&<h4 className="teacher-history-day-heading">{formatDate(`${activityDay(event.occurredAt)}T12:00:00Z`)}</h4>}<article className="teacher-history-event"><span className="teacher-history-time">{formatDateTime(event.occurredAt)}</span><div><strong>{activityLabels[event.eventType]||event.eventType.replace(/[._]/gu,' ')}</strong><small>{event.actorRole==='teacher'?'Professor':event.actorRole==='student'?'Aluno':'Sistema'}{event.classId?' · turma vinculada':''}{event.legacy?event.eventType.endsWith('.baseline')?' · marco inicial do rastreamento':' · evento recuperado de registro anterior':''}</small>{event.legacy&&event.eventType.endsWith('.baseline')&&<p>Estado atual capturado no início do rastreamento. Alterações anteriores não estavam armazenadas.</p>}{event.legacy&&event.payload.contentAvailable===false&&<p>{String(event.payload.note||'O conteúdo original não estava disponível.')}</p>}<details><summary>Ver detalhes registrados</summary><pre>{JSON.stringify(event.payload,null,2)}</pre></details>{event.eventType==='camera.photo_received'&&detail.photos.some(photo=>photo.id===event.entityId)&&<img className="teacher-history-photo" src={`/api/teacher/photos/${event.entityId}`} alt={`Foto histórica: ${String(event.payload.product||'atividade do aluno')}`} loading="lazy"/>}</div></article></div>)}</div>
            {!historyPrintOnly&&historyEvents.length<historyTotal&&<button className="button button-secondary print-hidden teacher-history-more" type="button" disabled={historyBusy} onClick={()=>void loadMoreHistory()}>{historyBusy?'Carregando…':`Carregar mais (${historyEvents.length} de ${historyTotal})`}</button>}
            {historyPrintOnly&&<p className="teacher-history-issued">Relatório emitido em {formatDateTime(new Date().toISOString())} · {historyPrintEvents.length} eventos disponíveis</p>}
          </section>
          {detail.business && <article className="teacher-business"><span className="teacher-kicker">NEGÓCIO DO ALUNO</span><h3>{detail.business.name}</h3><p>{detail.business.description}</p><dl><div><dt>Oferta</dt><dd>{detail.business.mainOffering}</dd></div><div><dt>Público</dt><dd>{detail.business.targetAudience}</dd></div><div><dt>Diferencial</dt><dd>{detail.business.differentiator}</dd></div></dl></article>}
          <section className="teacher-subsection"><div className="teacher-subhead"><div><span className="teacher-kicker">ENTREGAS</span><h3>Progresso nas missões</h3></div><span>{detail.progress.records.length} atividades registradas</span></div>{detail.progress.records.length ? <div className="teacher-mission-list">{detail.progress.records.map(record => <article key={record.missionId}><i className={record.status === 'completed' ? 'is-done' : ''}>{record.status === 'completed' ? '✓' : '•'}</i><div><strong>{getMission(record.missionId)?.title || record.missionId.replace(/-/g, ' ')}</strong><small>{record.status === 'completed' ? 'Concluída' : 'Em andamento'} · {formatDateTime(record.updatedAt)} · tentativa {record.attemptCount}</small>{typeof record.answer === 'string' && <p>{record.answer}</p>}{record.feedback && <small>{record.feedback}</small>}</div></article>)}</div> : <p className="teacher-empty-detail">O aluno ainda não registrou respostas de missão.</p>}</section>
          <section className="teacher-subsection"><div className="teacher-subhead"><div><span className="teacher-kicker">MISSÃO DA TURMA</span><h3>Respostas e conclusões</h3></div><span>{detail.classroomSubmissions?.length||0} registros</span></div>{detail.classroomSubmissions?.length?<div className="teacher-mission-list">{detail.classroomSubmissions.map(item=><article key={item.id}><i className="is-done">✓</i><div><strong>{item.moduleTitle} · {item.missionTitle}</strong><small>{item.prompt} · {formatDateTime(item.submittedAt)}</small><p>{typeof item.answer==='boolean'?(item.answer?'Concluída':'Não concluída'):String(item.answer)}</p></div></article>)}</div>:<p className="teacher-empty-detail">Este aluno ainda não respondeu às tarefas liberadas da turma.</p>}</section>
          <section className="teacher-subsection"><div className="teacher-subhead"><div><span className="teacher-kicker">INSTALAB</span><h3>Publicações deste aluno</h3></div><span>{detail.instalabPosts?.length||0} publicações</span></div>{detail.instalabPosts?.length?<div className="teacher-instagram-list">{detail.instalabPosts.map(post=><article key={post.id}><header>{post.hasAvatar?<img className="teacher-instalab-avatar" src={'/api/instalab/avatar/'+post.studentId} alt="" loading="lazy"/>:<i>{post.businessName.charAt(0)}</i>}<div><strong>{post.businessName}</strong><small>{post.authorName}{post.businessSegment?' · '+post.businessSegment:''}</small></div><span>{formatDateTime(post.createdAt)} · {post.likeCount} curtida(s) · {post.comments.length} comentário(s)</span></header>{post.body&&<p>{post.body}</p>}{post.imageMimeType&&<img src={`/api/teacher/instalab/${post.id}/image`} alt={post.imageName||`Publicação de ${post.businessName}`} loading="lazy"/>}{post.comments.length>0&&<div>{post.comments.map(comment=><p key={comment.id}>{comment.hasAvatar&&comment.studentId?<img className="teacher-comment-avatar" src={'/api/instalab/avatar/'+comment.studentId} alt="" loading="lazy"/>:<i>{comment.authorBusinessName?.charAt(0)||comment.authorName.charAt(0)}</i>}<span><strong>{comment.authorBusinessName||comment.authorName}</strong>{comment.authorBusinessName&&<small>{comment.authorName} · </small>} {comment.body}</span></p>)}</div>}</article>)}</div>:<p className="teacher-empty-detail">Este aluno ainda não publicou no InstaLab.</p>}</section>
          {detail.economy&&<section className="teacher-subsection"><div className="teacher-subhead"><div><span className="teacher-kicker">ECONOMIA DE SIMULAÇÃO</span><h3>Carteira e anúncios</h3></div><span>{detail.economy.wallet.balance} MetaCoins</span></div><div className="teacher-economy-student-stats"><span>Recebidas <strong>{detail.economy.wallet.earned}</strong></span><span>Investidas <strong>{detail.economy.wallet.spent}</strong></span><span>Campanhas <strong>{detail.economy.campaigns.length}</strong></span></div>{detail.economy.campaigns.length?<div className="teacher-mission-list">{detail.economy.campaigns.map(campaign=><article key={campaign.id}><i>{campaign.status==='active'?'✓':'•'}</i><div><strong>{campaign.caption}</strong><small>{campaign.status} · orçamento {campaign.budgetLimit}, consumido {campaign.amountSpent}, restante {campaign.remainingBudget} MetaCoins · {campaign.paidIntervals} intervalos · {campaign.impressions} impressões · {formatDateTime(campaign.createdAt)}</small>{campaign.paidThrough&&<small>Pago até {formatDateTime(campaign.paidThrough)}</small>}{campaign.rejectionReason&&<p>{campaign.rejectionReason}</p>}</div></article>)}</div>:<p className="teacher-empty-detail">O aluno ainda não criou anúncios.</p>}</section>}
          <section className="teacher-subsection"><div className="teacher-subhead"><div><span className="teacher-kicker">GALERIA DA CÂMERA</span><h3>Fotos da Câmera</h3></div><span>{detail.photos.length} imagens</span></div>{detail.photos.length ? <div className="teacher-photo-grid">{detail.photos.map(photo => <figure key={photo.id}><a href={`/api/teacher/photos/${photo.id}`} target="_blank" rel="noreferrer"><img src={`/api/teacher/photos/${photo.id}`} alt={`Foto de ${photo.product}`} loading="lazy" /></a><figcaption><strong>{photo.product}</strong><span>{photo.angle}° · {formatDate(photo.createdAt)} · luz {lightPresetLabels[String(photo.lightingSettings?.preset||"professional")]||"padrão"}</span></figcaption></figure>)}</div> : <p className="teacher-empty-detail">Nenhuma foto registrada pela Câmera até agora.</p>}</section>
          <section className="teacher-subsection"><div className="teacher-subhead"><div><span className="teacher-kicker">MISSÃO RELÂMPAGO</span><h3>Respostas deste aluno</h3></div><span>{detail.deliveries.filter(item => item.quickMissionId).length} respostas</span></div>{detail.deliveries.some(item => item.quickMissionId) ? <div className="teacher-delivery-list">{detail.deliveries.filter(item => item.quickMissionId).map(item => <article key={`quick-${item.id}`}><div><strong>{item.quickMissionTitle || item.activityName}</strong><small>Enviada em {formatDateTime(item.createdAt)} · aula em {formatDate(item.classDate)}</small><p>{item.description}</p><span>{item.fileName} · {Math.ceil(item.sizeBytes / 1024)} KB</span></div><a className="button button-secondary print-hidden" href={`/api/teacher/deliveries/${item.id}`} target="_blank" rel="noreferrer">Abrir resposta/anexo</a>{item.mimeType.startsWith('image/') && <img className="teacher-delivery-image" src={`/api/teacher/deliveries/${item.id}`} alt={`Resposta da missão ${item.quickMissionTitle || item.activityName}`} />}</article>)}</div> : <p className="teacher-empty-detail">Este aluno ainda não enviou uma resposta de Missão Relâmpago.</p>}</section>
          <section className="teacher-subsection"><div className="teacher-subhead"><div><span className="teacher-kicker">TRABALHOS ENVIADOS</span><h3>Outras entregas de aula</h3></div><span>{detail.deliveries.filter(item => !item.quickMissionId).length} arquivos</span></div>{detail.deliveries.some(item => !item.quickMissionId) ? <div className="teacher-delivery-list">{detail.deliveries.filter(item => !item.quickMissionId).map(item => <article key={item.id}><div><strong>{item.activityName}</strong><small>Aula em {formatDate(item.classDate)} · enviado {formatDateTime(item.createdAt)}</small><p>{item.description}</p><span>{item.fileName} · {Math.ceil(item.sizeBytes / 1024)} KB</span></div><a className="button button-secondary print-hidden" href={`/api/teacher/deliveries/${item.id}`} target="_blank" rel="noreferrer">Abrir arquivo</a>{item.mimeType.startsWith('image/') && <img className="teacher-delivery-image" src={`/api/teacher/deliveries/${item.id}`} alt={`Anexo de ${item.activityName}`} />}</article>)}</div> : <p className="teacher-empty-detail">O aluno ainda não enviou outros arquivos de aula.</p>}</section>
        </> : <div className="teacher-empty-detail"><span aria-hidden="true">◌</span><h2>Selecione um aluno</h2><p>Abra um perfil na lista para ver as entregas, o negócio e as fotos compartilhadas.</p></div>}</section>
      </div>}
      <footer className="teacher-footer">Dados do curso para acompanhamento pedagógico. Use apenas no contexto autorizado da turma.</footer>
      </div>
    </main>
  );
}

function ClassroomTaskComposer({ busy, onSubmit }: { busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [type, setType] = useState<ClassroomTaskType>('text');
  const choiceType = type === 'multiple_choice' || type === 'checkboxes' || type === 'dropdown';
  return <details className="teacher-question-composer"><summary>＋ Adicionar pergunta</summary><form className="teacher-question-card" onSubmit={onSubmit}>
    <div className="teacher-question-top"><label>Pergunta<input name="prompt" required maxLength={1500} placeholder="Escreva a pergunta ou instrução" /></label><label>Tipo de resposta<select name="type" value={type} onChange={event=>setType(event.target.value as ClassroomTaskType)}><option value="short_answer">Resposta curta</option><option value="text">Parágrafo</option><option value="multiple_choice">Múltipla escolha</option><option value="checkboxes">Caixas de seleção</option><option value="dropdown">Lista suspensa</option><option value="linear_scale">Escala linear</option><option value="date">Data</option><option value="complete">Marcar como concluída</option></select></label></div>
    <label>Descrição ou orientação (opcional)<input name="questionDescription" maxLength={1000} placeholder="Ajude o aluno a entender o que deve responder" /></label>
    {choiceType&&<label>Opções de resposta <small>Uma opção por linha. Use pelo menos duas.</small><textarea name="options" rows={4} placeholder={'Produto artesanal\nProduto personalizado\nOutro'} /></label>}
    {type==='linear_scale'&&<div className="teacher-quick-form-row"><label>Começa em<input name="scaleMin" type="number" min="0" max="9" defaultValue="1" /></label><label>Termina em<input name="scaleMax" type="number" min="2" max="10" defaultValue="5" /></label><label>Rótulo inicial<input name="minLabel" maxLength={80} placeholder="Precisa melhorar" /></label><label>Rótulo final<input name="maxLabel" maxLength={80} placeholder="Muito claro" /></label></div>}
    <label className="teacher-required-toggle"><input type="checkbox" name="required" defaultChecked /> Resposta obrigatória</label>
    <button className="button button-secondary" disabled={busy}>{busy?'Salvando…':'Adicionar pergunta ao formulário'}</button>
  </form></details>;
}
