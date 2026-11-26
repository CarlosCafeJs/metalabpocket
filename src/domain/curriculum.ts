export type MissionKind = 'checklist' | 'choice' | 'text' | 'business' | 'video';

export type Mission = {
  id: string;
  module: number;
  order: number;
  title: string;
  objective: string;
  context: string;
  instructions: string[];
  criteria: string[];
  kind: MissionKind;
  prompt: string;
  options?: { value: string; label: string }[];
  minLength?: number;
  requiredChecks?: number;
  feedback: string;
};

export type CourseModule = {
  id: number;
  title: string;
  subtitle: string;
  objective: string;
  duration: '4h';
  missions: Mission[];
};

const checklist = (id: string, module: number, order: number, title: string, objective: string, prompt: string, items: string[], feedback: string): Mission => ({
  id, module, order, title, objective, context: 'Uma prática guiada dentro do ambiente CaféFlow Pocket.', instructions: items, criteria: ['Revisar todos os passos', 'Registrar o que foi observado'], kind: 'checklist', prompt, requiredChecks: items.length, feedback
});

const text = (id: string, module: number, order: number, title: string, objective: string, prompt: string, instructions: string[], feedback: string, minLength = 30): Mission => ({
  id, module, order, title, objective, context: 'Use o negócio escolhido como contexto e escreva com suas próprias palavras.', instructions, criteria: [`Escrever pelo menos ${minLength} caracteres`, 'Evitar dados pessoais, senhas e links reais'], kind: 'text', prompt, minLength, feedback
});

const choice = (id: string, module: number, order: number, title: string, objective: string, prompt: string, options: Mission['options'], feedback: string): Mission => ({
  id, module, order, title, objective, context: 'Analise o cenário fictício e escolha como agir.', instructions: ['Leia toda a situação', 'Procure sinais de pressão, pedido de senha, código ou link inesperado', 'Escolha uma ação e confira o feedback'], criteria: ['Identificar a ação adequada para o cenário'], kind: 'choice', prompt, options, feedback
});

export const courseModules: CourseModule[] = [
  {
    id: 1, title: 'Primeiros passos e segurança', subtitle: 'Conhecer a plataforma e agir com segurança', objective: 'Navegar pelas áreas de aprendizagem e reconhecer riscos digitais.', duration: '4h', missions: [
      checklist('m1-explorar-celular', 1, 1, 'Explorar a plataforma', 'Reconhecer as áreas principais da formação.', 'Marque as áreas que você conseguiu localizar.', ['Abrir a Central de aprendizagem', 'Encontrar as Missões e Entregas', 'Localizar Turmas e Apresentações'], 'Você já conhece as principais áreas da formação.'),
      checklist('m1-conhecer-apps', 1, 2, 'Conhecer as ferramentas da turma', 'Entender como cada área apoia o projeto.', 'Explore as ferramentas disponíveis para sua turma.', ['Minha Empresa', 'InstaLab', 'Missões e Entregas'], 'Boa exploração. Cada área apoia uma etapa do projeto.'),
      { id: 'm1-configurar-negocio', module: 1, order: 3, title: 'Configurar minha empresa', objective: 'Criar o contexto que será usado no curso.', context: 'As próximas atividades usam os dados do seu negócio.', instructions: ['Abra Minha Empresa', 'Preencha os campos obrigatórios', 'Salve e volte para esta missão'], criteria: ['Possuir um negócio salvo no banco'], kind: 'business', prompt: 'Configure ou revise seu negócio antes de concluir.', feedback: 'Seu negócio agora pode orientar publicações e atendimentos.' },
      choice('m1-link-suspeito', 1, 4, 'Identificar mensagem suspeita', 'Perceber pressão e links inesperados.', 'Um cliente fictício diz: “Seu pagamento falhou. Clique agora neste link para não perder a venda.”', [{ value: 'click', label: 'Abrir o link rapidamente' }, { value: 'verify', label: 'Não abrir; conferir o pedido por um canal conhecido' }, { value: 'forward', label: 'Encaminhar para outros clientes' }], 'Pausar e confirmar por um canal conhecido reduz o risco.'),
      choice('m1-falso-comprovante', 1, 5, 'Reconhecer tentativa de fraude', 'Conferir um pagamento antes de entregar.', 'Chega uma imagem de comprovante, mas o valor não aparece na conta do negócio. O cliente pede entrega imediata.', [{ value: 'deliver', label: 'Entregar porque existe uma imagem' }, { value: 'confirm', label: 'Conferir o recebimento no canal oficial antes de entregar' }, { value: 'code', label: 'Pedir o código de verificação do cliente' }], 'Comprovante pode ser alterado. Confirme o recebimento no meio oficial do negócio.'),
      choice('m1-codigo-verificacao', 1, 6, 'Proteger códigos de verificação', 'Reconhecer que códigos de acesso são pessoais.', 'Uma pessoa diz ser do suporte e pede o código de seis dígitos que acabou de chegar por mensagem.', [{ value: 'send', label: 'Enviar porque a pessoa conhece o negócio' }, { value: 'refuse', label: 'Não enviar e avisar o instrutor' }, { value: 'post', label: 'Publicar o código para pedir ajuda' }], 'Códigos de verificação nunca devem ser compartilhados. Eles podem liberar acesso à conta.'),
      choice('m1-perfil-falso', 1, 7, 'Analisar um perfil comercial falso', 'Conferir a identidade antes de responder.', 'Um perfil usa a mesma logo de uma empresa conhecida, foi criado hoje e pede dados pessoais por mensagem.', [{ value: 'answer', label: 'Responder com os dados solicitados' }, { value: 'verify', label: 'Não responder; conferir o perfil por um canal conhecido' }, { value: 'follow', label: 'Seguir o perfil para observar depois' }], 'Logo e nome podem ser copiados. Data de criação, pedido de dados e urgência são sinais para pausar e verificar.'),
      choice('m1-promocao-fraudulenta', 1, 8, 'Avaliar uma promoção fraudulenta', 'Identificar promessas e urgência enganosas.', 'Uma promoção promete um prêmio caro, exige pagamento imediato de uma taxa e termina em cinco minutos.', [{ value: 'pay', label: 'Pagar logo para não perder' }, { value: 'share', label: 'Compartilhar antes de conferir' }, { value: 'pause', label: 'Não pagar; verificar regras e origem com o instrutor' }], 'Prêmio condicionado a taxa, pressão de tempo e origem incerta são sinais comuns de fraude.'),
    ]
  },
  {
    id: 2, title: 'Marketing e redes sociais', subtitle: 'Apresentar o negócio com clareza', objective: 'Entender público, perfil, publicação e atendimento comercial.', duration: '4h', missions: [
      text('m2-perfil', 2, 1, 'Construir o perfil comercial', 'Apresentar o negócio em uma frase clara.', 'Escreva uma apresentação curta do negócio.', ['Diga o que o negócio oferece', 'Use linguagem simples', 'Não inclua telefone ou endereço'], 'A apresentação deixa claro o que o negócio oferece.'),
      text('m2-biografia', 2, 2, 'Escrever uma biografia', 'Criar uma bio curta e reconhecível.', 'Escreva uma bio com produto, diferencial e convite.', ['Produto ou serviço', 'Diferencial', 'Próxima ação segura'], 'Sua bio já tem os três elementos de uma apresentação útil.', 45),
      text('m2-planejar-publicacao', 2, 3, 'Planejar uma publicação', 'Relacionar público, conteúdo e mensagem.', 'Descreva a publicação: público, conteúdo e mensagem principal.', ['Defina para quem é', 'Escolha o que mostrar', 'Escreva a ideia central'], 'O planejamento conecta público, conteúdo e mensagem.', 55),
      text('m2-responder-cliente', 2, 4, 'Responder uma pergunta de cliente', 'Praticar clareza e cordialidade.', 'Cliente fictício: “Qual é o preço e quando fica pronto?” Escreva sua resposta.', ['Cumprimente', 'Responda apenas o que sabe', 'Se precisar, diga que vai confirmar', 'Não peça dados pessoais'], 'Resposta registrada. Clareza, cordialidade e segurança fazem parte do atendimento.', 35),
      choice('m2-perfil-falso', 2, 5, 'Reconhecer perfil comercial falso', 'Verificar sinais antes de interagir.', 'Um perfil copia a logo do negócio, oferece prêmio urgente e pede código recebido por mensagem.', [{ value: 'send', label: 'Enviar o código para receber o prêmio' }, { value: 'report', label: 'Não enviar; registrar o perfil e avisar o instrutor' }, { value: 'share', label: 'Compartilhar a promoção com clientes' }], 'Códigos são pessoais. Um perfil conhecido nunca precisa deles para entregar um prêmio.'),
    ]
  },
  {
    id: 3, title: 'Conteúdo e publicação', subtitle: 'Apresentar uma ideia com clareza', objective: 'Planejar conteúdo que ajude a turma a compreender uma ideia ou produto.', duration: '4h', missions: [
      choice('m3-composicao', 3, 1, 'Escolher uma composição clara', 'Reconhecer conteúdo visual fácil de entender.', 'Qual publicação ajuda mais uma pessoa a entender a ideia?', [{ value: 'cut', label: 'Texto confuso, elementos demais e sem foco' }, { value: 'clear', label: 'Mensagem objetiva, imagem pertinente e boa leitura' }, { value: 'dark', label: 'Informação escondida, distante e sem contexto' }], 'Uma publicação clara tem foco, contexto e informação fácil de localizar.'),
      text('m3-foto-geral', 3, 2, 'Apresentar o produto ou a ideia', 'Explicar o que está sendo desenvolvido.', 'Escreva uma apresentação que explique o que é seu produto ou projeto.', ['Diga o que é', 'Use palavras simples', 'Mostre para quem foi pensado'], 'Sua apresentação ajuda a turma a entender o projeto.', 55),
      text('m3-foto-detalhe', 3, 3, 'Destacar um diferencial', 'Explicar o que torna a ideia especial.', 'Descreva um detalhe, benefício ou escolha que diferencia seu projeto.', ['Escolha um diferencial verdadeiro', 'Explique por que ele importa', 'Evite promessas exageradas'], 'O diferencial ficou ligado a um benefício compreensível.', 55),
      text('m3-foto-contexto', 3, 4, 'Criar um contexto de uso', 'Mostrar como a ideia atende uma necessidade.', 'Conte uma situação em que seu projeto pode ser útil.', ['Descreva a necessidade', 'Explique como a ideia ajuda', 'Use um exemplo fictício'], 'O contexto mostra como a ideia pode ser útil.', 55),
      checklist('m3-comparar-exportar', 3, 5, 'Revisar e publicar', 'Revisar a mensagem antes de compartilhar com a turma.', 'Revise sua publicação no InstaLab antes de enviar.', ['Conferir se a mensagem está clara', 'Revisar ortografia e imagem', 'Remover dados pessoais', 'Publicar somente na turma correta'], 'Você concluiu o ciclo: planejar, revisar e compartilhar com responsabilidade.'),
    ]
  },
  {
    id: 4, title: 'Vídeos e comunicação', subtitle: 'Planejar uma história curta', objective: 'Organizar mensagem, benefício e chamada para ação.', duration: '4h', missions: [
      text('m4-produto-mensagem', 4, 1, 'Definir produto e mensagem', 'Escolher o foco do vídeo.', 'Qual produto será apresentado e qual ideia precisa ficar clara?', ['Escolha um produto', 'Defina uma única mensagem principal'], 'Um vídeo curto funciona melhor quando tem um foco claro.', 35),
      text('m4-gancho', 4, 2, 'Criar um gancho', 'Despertar interesse nos primeiros segundos.', 'Escreva a primeira frase do vídeo.', ['Use uma pergunta, situação ou benefício', 'Evite promessas exageradas'], 'O gancho apresenta uma razão para continuar assistindo.', 20),
      text('m4-beneficio', 4, 3, 'Explicar o benefício', 'Relacionar característica e utilidade.', 'Complete a ideia: “Este produto ajuda porque…”', ['Explique uma vantagem real', 'Use um exemplo simples'], 'Você transformou uma característica em benefício compreensível.', 30),
      text('m4-cta', 4, 4, 'Criar uma chamada para ação', 'Encerrar com um próximo passo seguro.', 'Escreva a frase final do vídeo.', ['Convide a conhecer, perguntar ou comparar', 'Não use urgência enganosa'], 'A chamada para ação mostra o próximo passo sem pressionar.'),
      text('m4-sequencia', 4, 5, 'Organizar a sequência de cenas', 'Transformar a mensagem em um roteiro visual curto.', 'Descreva três cenas: abertura, demonstração e encerramento.', ['Cena 1: gancho visual', 'Cena 2: produto e benefício', 'Cena 3: chamada para ação'], 'A sequência cria começo, desenvolvimento e encerramento para o vídeo.', 60),
      { id: 'm4-video', module: 4, order: 6, title: 'Visualizar o vídeo final', objective: 'Conferir uma produção vertical.', context: 'O arquivo permanece somente no computador e não é enviado ao servidor.', instructions: ['Escolha um vídeo MP4 ou WebM', 'Confira o enquadramento vertical', 'Assista ao começo e ao final'], criteria: ['Selecionar um vídeo válido de até 50 MB'], kind: 'video', prompt: 'Escolha o arquivo final para visualizar no Pocket.', feedback: 'Vídeo validado localmente. Apenas os metadados da atividade foram registrados.' },
    ]
  },
  {
    id: 5, title: 'Planejamento e projeto final', subtitle: 'Reunir o projeto da turma', objective: 'Integrar negócio, conteúdo, comunicação e planejamento.', duration: '4h', missions: [
      { id: 'm5-revisar-negocio', module: 5, order: 1, title: 'Revisar o negócio', objective: 'Conferir o contexto do projeto final.', context: 'Atualize os dados que mudaram durante o curso.', instructions: ['Abra Minha Empresa', 'Confira público, diferencial e oferta principal', 'Salve a revisão'], criteria: ['Possuir um negócio salvo'], kind: 'business', prompt: 'Revise o perfil antes de concluir.', feedback: 'Seu perfil está pronto para orientar o projeto final.' },
      checklist('m5-selecionar-fotos', 5, 2, 'Selecionar as melhores ideias', 'Montar um conjunto coerente de conteúdos.', 'Revise os conteúdos planejados para o projeto.', ['Escolher uma apresentação geral', 'Escolher um diferencial', 'Escolher um contexto de uso'], 'A seleção apresenta a ideia por ângulos complementares.'),
      text('m5-publicacao-final', 5, 3, 'Preparar a publicação final', 'Combinar imagem, legenda e objetivo.', 'Escreva a legenda final do projeto.', ['Apresente o produto', 'Explique um benefício', 'Inclua uma próxima ação segura'], 'A legenda reúne apresentação, benefício e próxima ação.', 60),
      text('m5-calendario', 5, 4, 'Criar um calendário simples', 'Distribuir ideias em uma semana.', 'Planeje três conteúdos para dias diferentes.', ['Inclua dia, assunto e formato', 'Alterne apresentação, detalhe e atendimento'], 'O calendário transforma ideias em uma sequência possível.', 60),
      text('m5-atendimento-final', 5, 5, 'Demonstrar o atendimento', 'Responder com clareza, cordialidade e segurança.', 'Cliente fictício: “Gostei do produto, mas preciso saber material, prazo e como pagar.” Escreva sua resposta final.', ['Responda o que sabe', 'Diga o que precisa confirmar', 'Não solicite senha ou código'], 'Seu atendimento final foi registrado na formação.', 55),
    ]
  }
];

export const allMissions = courseModules.flatMap(module => module.missions);
export const getMission = (id: string) => allMissions.find(mission => mission.id === id);
export const totalHours = 20;
