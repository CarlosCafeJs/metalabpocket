import { z } from 'zod';

export const GAMEFLOW_GATE_TYPES = [
  'scene_exploration','interview','forensic_crossword','cipher','collective_fragments',
  'phishing_analysis','timeline','ai_audit','deduction','verdict'
] as const;
export type GameFlowGateType = typeof GAMEFLOW_GATE_TYPES[number];
export type GameFlowCaseStatus = 'draft' | 'published' | 'archived';
export type GameFlowSessionState = 'waiting' | 'running' | 'paused' | 'completed' | 'ended' | 'cancelled';

const textLine = z.string().trim().min(1).max(500);
const lines = (max: number) => z.array(textLine).max(max);
export const gameFlowGateInputSchema = z.object({
  type: z.enum(GAMEFLOW_GATE_TYPES),
  title: z.string().trim().min(3).max(140),
  narrative: z.string().trim().max(3000).default(''),
  prompt: z.string().trim().min(5).max(2000),
  items: lines(40).default([]),
  options: lines(30).default([]),
  answers: lines(40).default([]),
  hint: z.string().trim().max(1000).default(''),
  explanation: z.string().trim().max(3000).default(''),
  maxXp: z.number().int().min(0).max(200).default(160)
}).strict().superRefine((gate, context) => {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: 'custom', path, message });
  if (gate.type === 'scene_exploration' && (!gate.items.length || !gate.answers.length)) issue(['items'], 'Inclua evidências e pelo menos uma resposta aceita.');
  if (gate.type === 'interview' && (!gate.items.length || gate.options.length < 2 || !gate.answers.length)) issue(['options'], 'Configure depoimentos, opções e a conclusão esperada.');
  if (gate.type === 'forensic_crossword' && (gate.items.length < 2 || gate.answers.length !== gate.items.length)) issue(['answers'], 'Cadastre uma resposta para cada pista da cruzadinha.');
  if (gate.type === 'cipher' && (!gate.items.length || !gate.answers.length)) issue(['answers'], 'Inclua a mensagem cifrada e a resposta decodificada.');
  if (gate.type === 'collective_fragments' && (gate.answers.length !== 1 || Array.from((gate.answers[0]||'').replace(/\s/gu,'')).length>100)) issue(['answers'], 'Informe uma única frase coletiva com até 100 caracteres úteis.');
  if (gate.type === 'phishing_analysis' && (!gate.items.length || gate.options.length < 2 || !gate.answers.length)) issue(['options'], 'Configure a mensagem, as opções de análise e a resposta esperada.');
  if (gate.type === 'timeline' && (gate.items.length < 3 || gate.answers.length !== gate.items.length)) issue(['answers'], 'A linha do tempo precisa de um evento ordenado para cada item.');
  if (gate.type === 'ai_audit' && (gate.items.length < 2 || gate.answers.length !== gate.items.length)) issue(['answers'], 'Classifique cada afirmação da IA como fato, hipótese, sem evidência ou contradição.');
  if (gate.type === 'deduction' && (!gate.items.length || gate.options.length < 2 || gate.answers.length !== 1)) issue(['options'], 'Inclua evidências, ao menos dois suspeitos e uma conclusão esperada.');
  if (gate.type === 'verdict' && !gate.items.length) issue(['items'], 'Descreva os critérios que o professor usará para revisar o veredito.');
  if (gate.type === 'deduction' && gate.answers.length === 1 && !gate.options.some(option => normalizeGameFlowAnswer(option) === normalizeGameFlowAnswer(gate.answers[0]))) issue(['answers'], 'A hipótese esperada precisa corresponder a uma opção de suspeito.');
  if (gate.type === 'interview' && gate.answers.some(answer => !gate.options.some(option => normalizeGameFlowAnswer(option) === normalizeGameFlowAnswer(answer)))) issue(['answers'], 'As respostas esperadas do interrogatório devem corresponder às opções.');
  if (gate.type === 'phishing_analysis' && gate.answers.some(answer => !gate.options.some(option => normalizeGameFlowAnswer(option) === normalizeGameFlowAnswer(answer)))) issue(['answers'], 'A resposta da análise deve corresponder às opções.');
});

export const gameFlowCaseInputSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(1000).default(''),
  openingStory: z.string().trim().min(20).max(8000),
  objective: z.string().trim().min(5).max(1000),
  weeklyContent: z.string().trim().min(3).max(2000),
  closingMessage: z.string().trim().max(4000).default(''),
  gates: z.array(gameFlowGateInputSchema).min(5).max(10)
}).strict();

export type GameFlowGateInput = z.infer<typeof gameFlowGateInputSchema>;
export type GameFlowCaseInput = z.infer<typeof gameFlowCaseInputSchema>;

export const GAMEFLOW_SAMPLE_CASE: GameFlowCaseInput = {
  title: 'Caso 001 — O Arquivo Desaparecido',
  description: 'Uma equipe precisa reconstruir uma invasão digital antes que dados de clientes sejam expostos.',
  openingStory: 'Às 08h12, a equipe da organização fictícia Aurora percebeu que uma pasta de documentos havia desaparecido. Durante a madrugada, três funcionários receberam mensagens urgentes. Os registros disponíveis são incompletos: investigue cada pista, compare depoimentos e apresente uma conclusão sustentada por evidências.',
  objective: 'Reconstruir o incidente, identificar riscos de privacidade e recomendar medidas de prevenção usando evidências verificáveis.',
  weeklyContent: 'LGPD, dados pessoais, autenticação, phishing, criptografia introdutória, inteligência artificial e pensamento crítico.',
  closingMessage: 'Operação encerrada. Uma investigação consistente separa evidências de suposições e transforma descobertas em prevenção.',
  gates: [
    { type:'scene_exploration', title:'Gate 1 — A cena do incidente', narrative:'A sala foi isolada. Examine os itens registrados pela equipe técnica.', prompt:'Qual legislação brasileira disciplina o tratamento de dados pessoais, inclusive em meios digitais?', items:['Tela do computador: acesso à pasta bloqueado às 08h12.','Bilhete: uma senha estava anotada ao lado do monitor.','Registro: houve uma tentativa de acesso fora do horário.'], options:[], answers:['LGPD','Lei Geral de Proteção de Dados','Lei Geral de Proteção de Dados Pessoais'], hint:'A sigla tem quatro letras e é uma lei brasileira.', explanation:'A Lei Geral de Proteção de Dados Pessoais (LGPD) regula o tratamento de dados pessoais no Brasil.', maxXp:160 },
    { type:'interview', title:'Gate 2 — Sala de interrogatório', narrative:'Dois depoimentos não combinam. Compare os horários antes de escolher uma hipótese.', prompt:'Qual depoimento é compatível com o registro de acesso às 08h12?', items:['Lia: “Enviei o relatório às 07h50 e encerrei minha sessão.”','Ravi: “Só abri o sistema depois da reunião, às 09h.”'], options:['Lia teve uma sessão encerrada antes do registro.','Ravi estava no sistema às 08h12.'], answers:['Lia teve uma sessão encerrada antes do registro.'], hint:'Compare o horário declarado com 08h12.', explanation:'O depoimento de Lia não prova autoria, mas seu horário coincide com a janela que merece verificação. Uma coincidência é pista, não condenação.', maxXp:160 },
    { type:'forensic_crossword', title:'Gate 3 — Laboratório forense', narrative:'O laboratório separou três conceitos usados no relatório.', prompt:'Resolva cada pista. Digite as palavras na mesma ordem.', items:['Informação que identifica ou pode identificar uma pessoa.','Processo para confirmar que alguém é quem afirma ser.','Sequência de instruções para resolver uma tarefa.'], options:[], answers:['DADO PESSOAL','AUTENTICAÇÃO','ALGORITMO'], hint:'As três respostas aparecem no conteúdo desta semana.', explanation:'Dados pessoais exigem cuidado, autenticação verifica identidade e algoritmos descrevem procedimentos.', maxXp:160 },
    { type:'cipher', title:'Gate 4 — O bilhete criptografado', narrative:'O bilhete usa uma troca didática: cada letra foi deslocada uma posição para a frente no alfabeto, sem acentos.', prompt:'Decodifique a mensagem e escreva a frase recebida.', items:['TFHVSBODB EFQFOEF EF UPEPT'], options:[], answers:['SEGURANÇA DEPENDE DE TODOS'], hint:'Desloque cada letra uma posição para trás. Esta cifra simples não protege dados reais.', explanation:'Cifras de substituição ajudam a aprender padrões, mas são inseguras para proteger informações reais.', maxXp:160 },
    { type:'collective_fragments', title:'Gate 5 — Operação fragmentada', narrative:'A central dividiu uma mensagem entre os investigadores. Compartilhem seus fragmentos para reconstruí-la.', prompt:'Primeiro registre que compartilhou seu fragmento. Depois, qualquer integrante pode enviar a frase coletiva reconstruída.', items:['Cada investigador recebe fragmentos próprios após o início da operação.'], options:[], answers:['A SEGURANÇA DIGITAL DEPENDE DE TODOS NÓS'], hint:'Conversem e mantenham as palavras na ordem recebida.', explanation:'Segurança é um esforço coletivo: comunicação e contribuição de todos tornam o trabalho verificável.', maxXp:160 },
    { type:'phishing_analysis', title:'Gate 6 — O e-mail do infiltrado', narrative:'A mensagem foi criada para treinamento; o domínio usa o sufixo reservado .example.', prompt:'Como deve ser classificada a mensagem?', items:['Assunto: “Urgente: confirme sua conta”\nRemetente: suporte@aurora.example\nTexto: “Abra o anexo e informe sua senha para evitar o bloqueio.”'], options:['Tentativa de phishing','Comunicado confiável'], answers:['Tentativa de phishing'], hint:'Desconfie de urgência, pedido de senha e anexo inesperado.', explanation:'Pedidos urgentes de senha e anexos inesperados são sinais de risco. Verifique por um canal oficial.', maxXp:160 },
    { type:'timeline', title:'Gate 7 — Reconstrução dos fatos', narrative:'Organize os eventos para reconstruir a sequência observada.', prompt:'Reordene os eventos usando os controles de subir e descer.', items:['Uma funcionária recebeu um e-mail urgente.','A senha foi encontrada anotada perto do computador.','O acesso à pasta foi bloqueado às 08h12.'], options:[], answers:['Uma funcionária recebeu um e-mail urgente.','A senha foi encontrada anotada perto do computador.','O acesso à pasta foi bloqueado às 08h12.'], hint:'A mensagem chegou antes da descoberta do bilhete e do bloqueio.', explanation:'Uma linha do tempo ajuda a investigar relações possíveis, mas a ordem sozinha não comprova causalidade.', maxXp:160 },
    { type:'ai_audit', title:'Gate 8 — A testemunha artificial', narrative:'Um relatório automatizado apresenta afirmações com níveis diferentes de evidência.', prompt:'Classifique cada frase como fato, hipótese, sem evidência ou contradição.', items:['O registro de acesso marca uma tentativa às 08h12.','A pessoa que enviou o e-mail certamente invadiu o sistema.'], options:['Fato','Hipótese','Sem evidência','Contradição'], answers:['Fato','Sem evidência'], hint:'Um registro sustenta um horário, mas não identifica sozinho quem agiu.', explanation:'Modelos de IA podem misturar registros confiáveis com afirmações sem suporte. Verifique cada alegação.', maxXp:160 },
    { type:'deduction', title:'Gate 9 — O suspeito improvável', narrative:'Nenhum depoimento isolado é suficiente. Escolha a hipótese que respeita os limites das evidências.', prompt:'Qual conclusão é a mais responsável neste momento?', items:['O log confirma um horário de tentativa, não uma pessoa.','A senha anotada amplia o risco de acesso indevido.','O e-mail contém sinais típicos de engenharia social.'], options:['Concluir que Ravi é culpado.','Investigar o uso da senha e validar a origem do e-mail sem atribuir autoria ainda.'], answers:['Investigar o uso da senha e validar a origem do e-mail sem atribuir autoria ainda.'], hint:'Prefira a hipótese sustentada pelos registros sem acusação sem prova.', explanation:'Uma conclusão investigativa deve ser proporcional à evidência e reconhecer o que ainda não se sabe.', maxXp:160 },
    { type:'verdict', title:'Gate 10 — O veredito', narrative:'Apresente a síntese final ao diretor da investigação.', prompt:'Explique o que pode ter ocorrido, cite evidências e proponha medidas preventivas. O professor revisará seu veredito.', items:['O veredito precisa mencionar pelo menos duas evidências e uma ação de prevenção.','Critérios docentes: coerência com os registros; distinção entre fato e hipótese; proposta de prevenção pertinente.'], options:[], answers:[], hint:'Organize em: evidências, hipótese, limites e prevenção.', explanation:'A revisão docente considera a argumentação completa; palavras isoladas não determinam a nota.', maxXp:200 }
  ]
};

export function normalizeGameFlowAnswer(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

export function splitCollectiveFragments(answer: string, participantCount: number) {
  if (!Number.isInteger(participantCount) || participantCount < 1) throw new Error('GAMEFLOW_EMPTY_ROSTER');
  const words = answer.trim().split(/\s+/u).filter(Boolean);
  const units = words.length >= participantCount ? words : Array.from(answer.replace(/\s/gu, ''));
  if (units.length < participantCount) throw new Error('GAMEFLOW_FRAGMENT_CAPACITY');
  return Array.from({ length: participantCount }, (_, index) => units.filter((_, unitIndex) => unitIndex % participantCount === index));
}

export function evaluateGameFlowAnswer(type: GameFlowGateType, expected: string[], submitted: unknown) {
  if (type === 'verdict') return 'pending_review' as const;
  const toValues = (value: unknown): string[] => Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : '') : typeof value === 'string' ? [value] : [];
  const actual = toValues(submitted).map(normalizeGameFlowAnswer);
  const target = expected.map(normalizeGameFlowAnswer);
  if (!actual.length || !target.length) return 'incorrect' as const;
  if (['forensic_crossword','timeline','ai_audit'].includes(type)) {
    return actual.length === target.length && actual.every((value,index) => value === target[index]) ? 'correct' as const : 'incorrect' as const;
  }
  return target.includes(actual[0]) ? 'correct' as const : 'incorrect' as const;
}

export function nextGameFlowSessionState(current: GameFlowSessionState, action: 'start'|'pause'|'resume'|'end'|'cancel'|'complete') {
  if (action === 'start' && current === 'waiting') return 'running';
  if (action === 'pause' && current === 'running') return 'paused';
  if (action === 'resume' && current === 'paused') return 'running';
  if (action === 'end' && ['waiting','running','paused'].includes(current)) return 'ended';
  if (action === 'cancel' && current === 'waiting') return 'cancelled';
  if (action === 'complete' && current === 'running') return 'completed';
  return null;
}
