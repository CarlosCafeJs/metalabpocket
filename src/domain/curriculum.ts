export type MissionKind = 'checklist' | 'choice' | 'text' | 'business' | 'gallery' | 'video';

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
  requiredPhotos?: number;
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
  id, module, order, title, objective, context: 'Uma prática guiada dentro do ambiente MetaLab Pocket.', instructions: items, criteria: ['Revisar todos os passos', 'Registrar o que foi observado'], kind: 'checklist', prompt, requiredChecks: items.length, feedback
});

const text = (id: string, module: number, order: number, title: string, objective: string, prompt: string, instructions: string[], feedback: string, minLength = 30): Mission => ({
  id, module, order, title, objective, context: 'Use o negócio escolhido como contexto e escreva com suas próprias palavras.', instructions, criteria: [`Escrever pelo menos ${minLength} caracteres`, 'Evitar dados pessoais, senhas e links reais'], kind: 'text', prompt, minLength, feedback
});

const choice = (id: string, module: number, order: number, title: string, objective: string, prompt: string, options: Mission['options'], feedback: string): Mission => ({
  id, module, order, title, objective, context: 'Analise o cenário fictício e escolha como agir.', instructions: ['Leia toda a situação', 'Procure sinais de pressão, pedido de senha, código ou link inesperado', 'Escolha uma ação e confira o feedback'], criteria: ['Identificar a ação adequada para o cenário'], kind: 'choice', prompt, options, feedback
});

export const courseModules: CourseModule[] = [
  {
    id: 1, title: 'Primeiros passos e segurança', subtitle: 'Conhecer o ambiente e agir com segurança', objective: 'Usar o smartphone virtual com autonomia e reconhecer riscos digitais.', duration: '4h', missions: [
      checklist('m1-explorar-celular', 1, 1, 'Explorar o smartphone virtual', 'Reconhecer os controles do aparelho.', 'Marque o que você conseguiu localizar.', ['Abrir a tela inicial', 'Ativar o modo foco', 'Virar o celular e observar a câmera traseira'], 'Você já conhece os controles principais do aparelho.'),
      checklist('m1-conhecer-apps', 1, 2, 'Conhecer os aplicativos', 'Entender a função de cada app simulado.', 'Abra o celular e explore estas áreas.', ['Câmera e Galeria', 'Rede Social e Mensagens', 'Segurança e Minhas Missões'], 'Boa exploração. Cada aplicativo tem uma função pedagógica específica.'),
      { id: 'm1-configurar-negocio', module: 1, order: 3, title: 'Configurar minha empresa', objective: 'Criar o contexto que será usado no curso.', context: 'As próximas atividades usam os dados do seu negócio.', instructions: ['Abra Minha Empresa', 'Preencha os campos obrigatórios', 'Salve e volte para esta missão'], criteria: ['Possuir um negócio salvo no banco'], kind: 'business', prompt: 'Configure ou revise seu negócio antes de concluir.', feedback: 'Seu negócio agora pode orientar fotos, publicações e atendimentos.' },
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
      text('m2-planejar-publicacao', 2, 3, 'Planejar uma publicação', 'Relacionar público, foto e mensagem.', 'Descreva a publicação: público, imagem e mensagem principal.', ['Defina para quem é', 'Escolha o que mostrar', 'Escreva a ideia central'], 'O planejamento conecta público, imagem e mensagem.', 55),
      text('m2-responder-cliente', 2, 4, 'Responder uma pergunta de cliente', 'Praticar clareza e cordialidade.', 'Cliente fictício: “Qual é o preço e quando fica pronto?” Escreva sua resposta.', ['Cumprimente', 'Responda apenas o que sabe', 'Se precisar, diga que vai confirmar', 'Não peça dados pessoais'], 'Resposta registrada. Clareza, cordialidade e segurança fazem parte do atendimento.', 35),
      choice('m2-perfil-falso', 2, 5, 'Reconhecer perfil comercial falso', 'Verificar sinais antes de interagir.', 'Um perfil copia a logo do negócio, oferece prêmio urgente e pede código recebido por mensagem.', [{ value: 'send', label: 'Enviar o código para receber o prêmio' }, { value: 'report', label: 'Não enviar; registrar o perfil e avisar o instrutor' }, { value: 'share', label: 'Compartilhar a promoção com clientes' }], 'Códigos são pessoais. Um perfil conhecido nunca precisa deles para entregar um prêmio.'),
    ]
  },
  {
    id: 3, title: 'Fotografia e conteúdo', subtitle: 'Luz, composição e produto', objective: 'Produzir imagens que expliquem o produto com clareza.', duration: '4h', missions: [
      choice('m3-composicao', 3, 1, 'Escolher uma composição clara', 'Reconhecer um bom enquadramento inicial.', 'Qual foto principal ajuda mais uma pessoa a entender o produto?', [{ value: 'cut', label: 'Produto cortado e fundo cheio de objetos' }, { value: 'clear', label: 'Produto inteiro, fundo simples e luz suave' }, { value: 'dark', label: 'Produto escuro, distante e sem detalhe' }], 'Uma foto principal deve tornar forma, cor e função fáceis de perceber.'),
      { id: 'm3-foto-geral', module: 3, order: 2, title: 'Criar a foto geral', objective: 'Mostrar o produto inteiro.', context: 'Use a Câmera do celular e salve a captura na Galeria.', instructions: ['Abra a Câmera no celular', 'Escolha um produto', 'Use frente ou 3/4', 'Salve a foto'], criteria: ['Ter ao menos uma foto na Galeria local'], kind: 'gallery', prompt: 'A missão verifica as fotos salvas neste navegador.', requiredPhotos: 1, feedback: 'Foto geral encontrada. Ela apresenta o produto por inteiro.' },
      { id: 'm3-foto-detalhe', module: 3, order: 3, title: 'Criar a foto de detalhe', objective: 'Destacar material ou acabamento.', context: 'Aproxime o celular na Câmera e registre um segundo enquadramento.', instructions: ['Reduza a distância', 'Mude o ângulo', 'Mostre um detalhe relevante', 'Salve a captura'], criteria: ['Ter ao menos duas fotos na Galeria local'], kind: 'gallery', prompt: 'A missão verifica as fotos salvas neste navegador.', requiredPhotos: 2, feedback: 'A segunda foto ajuda a explicar textura, material ou acabamento.' },
      { id: 'm3-foto-contexto', module: 3, order: 4, title: 'Criar a foto contextualizada', objective: 'Mostrar uma possibilidade de uso.', context: 'Faça uma terceira composição diferente das anteriores.', instructions: ['Escolha outro ângulo ou produto', 'Pense no uso da peça', 'Mantenha o produto reconhecível', 'Salve a captura'], criteria: ['Ter ao menos três fotos na Galeria local'], kind: 'gallery', prompt: 'A missão verifica as fotos salvas neste navegador.', requiredPhotos: 3, feedback: 'Seu conjunto agora possui visão geral, detalhe e contexto.' },
      checklist('m3-comparar-exportar', 3, 5, 'Comparar e exportar', 'Selecionar a foto mais clara e criar uma cópia.', 'Revise o conjunto de fotos.', ['Abrir a Galeria', 'Comparar luz e enquadramento', 'Escolher a melhor foto', 'Usar “Salvar cópia no computador”'], 'Você concluiu o ciclo: produzir, comparar, escolher e exportar.'),
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
    id: 5, title: 'Planejamento e projeto final', subtitle: 'Reunir o meu Kit Digital', objective: 'Integrar negócio, imagens, comunicação e planejamento.', duration: '4h', missions: [
      { id: 'm5-revisar-negocio', module: 5, order: 1, title: 'Revisar o negócio', objective: 'Conferir o contexto do projeto final.', context: 'Atualize os dados que mudaram durante o curso.', instructions: ['Abra Minha Empresa', 'Confira público, diferencial e oferta principal', 'Salve a revisão'], criteria: ['Possuir um negócio salvo'], kind: 'business', prompt: 'Revise o perfil antes de concluir.', feedback: 'Seu perfil está pronto para orientar o projeto final.' },
      checklist('m5-selecionar-fotos', 5, 2, 'Selecionar as melhores fotos', 'Montar um conjunto coerente.', 'Compare as imagens produzidas.', ['Escolher uma foto geral', 'Escolher uma foto de detalhe', 'Escolher uma foto contextualizada'], 'A seleção apresenta o produto de três formas complementares.'),
      text('m5-publicacao-final', 5, 3, 'Preparar a publicação final', 'Combinar imagem, legenda e objetivo.', 'Escreva a legenda final do projeto.', ['Apresente o produto', 'Explique um benefício', 'Inclua uma próxima ação segura'], 'A legenda reúne apresentação, benefício e próxima ação.', 60),
      text('m5-calendario', 5, 4, 'Criar um calendário simples', 'Distribuir ideias em uma semana.', 'Planeje três conteúdos para dias diferentes.', ['Inclua dia, assunto e formato', 'Alterne apresentação, detalhe e atendimento'], 'O calendário transforma ideias em uma sequência possível.', 60),
      text('m5-atendimento-final', 5, 5, 'Demonstrar o atendimento', 'Responder com clareza, cordialidade e segurança.', 'Cliente fictício: “Gostei do produto, mas preciso saber material, prazo e como pagar.” Escreva sua resposta final.', ['Responda o que sabe', 'Diga o que precisa confirmar', 'Não solicite senha ou código'], 'Seu atendimento final foi registrado no Kit Digital.', 55),
    ]
  }
];

export const allMissions = courseModules.flatMap(module => module.missions);
export const getMission = (id: string) => allMissions.find(mission => mission.id === id);
export const totalHours = 20;
