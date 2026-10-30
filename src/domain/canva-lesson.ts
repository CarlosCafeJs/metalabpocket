import type { PresentationDocument } from '@/domain/presentations';

const slides = [
  ['CANVA', 'Introdução ao design e à criação visual', 'Do primeiro rascunho à apresentação pronta para compartilhar.\nAula prática • iniciante • 16:9'],
  ['OBJETIVOS', 'O que você vai aprender', '• Escolher um formato e começar um design\n• Organizar texto, cor e imagem\n• Criar slides claros e consistentes\n• Apresentar ou exportar com segurança'],
  ['ANTES DE COMEÇAR', 'Acesse com orientação', 'Abra canva.com ou o aplicativo oficial.\nUse apenas a conta indicada pelo professor ou responsável.\nNão compartilhe senha, endereço, telefone ou dados da escola.'],
  ['CONHEÇA O ESPAÇO', 'Três áreas para localizar', 'Início: criar ou abrir um design.\nEditor: página no centro e ferramentas ao redor.\nApresentar/Compartilhar: mostrar ou baixar o material.\nOs nomes e posições podem variar entre versões.'],
  ['PRIMEIRO PASSO', 'Escolha o tipo de design', 'Pesquise “apresentação” e escolha o formato horizontal 16:9.\nPara outros trabalhos, procure por cartaz, publicação ou vídeo.\nO formato deve combinar com onde o material será usado.'],
  ['MODELO OU BRANCO?', 'Comece com um modelo simples', 'Um modelo dá estrutura e combinações prontas.\nUma página em branco dá liberdade para criar do zero.\nEscolha modelos legíveis; troque textos e imagens de exemplo.'],
  ['PÁGINAS', 'Monte a sequência da história', 'Cada página apresenta uma ideia principal.\nAdicione, duplique, reorganize ou exclua páginas pelo editor.\nUma sequência útil: abertura → explicação → exemplo → conclusão.'],
  ['TEXTO', 'Dê hierarquia às palavras', 'Use um título curto e maior que o texto de apoio.\nPrefira poucas frases e palavras conhecidas.\nDestaque só o que ajuda o leitor a encontrar a ideia.'],
  ['TIPOGRAFIA', 'Escolha fontes fáceis de ler', 'Use uma ou duas famílias de fonte no mesmo material.\nEvite letras decorativas em parágrafos longos.\nConfira o tamanho no celular e à distância.'],
  ['CORES', 'Crie contraste', 'Use texto escuro em fundo claro ou o inverso.\nMantenha uma paleta pequena e repita as cores com intenção.\nNão dependa apenas da cor para explicar uma informação.'],
  ['IMAGENS', 'Escolha imagens que ajudam', 'Use a área de elementos/fotos ou seus próprios arquivos.\nA imagem deve explicar ou reforçar a mensagem.\nConfira nitidez, enquadramento e se o texto continua legível.'],
  ['ARQUIVOS', 'Envie conteúdo com cuidado', 'No editor, procure “Uploads/Enviar arquivos” para usar uma imagem própria.\nEnvie somente imagens que você pode usar.\nNão publique fotos de colegas sem autorização.'],
  ['COMPOSIÇÃO', 'Organize e alinhe', 'Mantenha margens parecidas entre páginas.\nAlinhe elementos e deixe espaço vazio para a página respirar.\nEvite encher todos os cantos com texto, formas e ícones.'],
  ['REVISÃO', 'Faça o teste dos 5 segundos', 'Mostre a página por cinco segundos e esconda.\nPergunte: qual era a ideia principal?\nSe não ficou clara, reduza o conteúdo e aumente o destaque.'],
  ['APRESENTAR', 'Mostre seu trabalho', 'Use “Apresentar” para abrir a sequência em tela cheia.\nAs setas esquerda e direita avançam ou voltam páginas.\nA tecla Esc sai da tela cheia.'],
  ['BAIXAR E COMPARTILHAR', 'Escolha o formato certo', 'No menu de compartilhar/baixar, escolha PDF para leitura ou impressão.\nPPTX pode servir para continuar no PowerPoint, mas confira o resultado.\nCompartilhe somente com as pessoas autorizadas.'],
  ['DIREITOS E PRIVACIDADE', 'Crie com responsabilidade', 'Use conteúdo próprio, autorizado ou oferecido para reutilização.\nDê crédito quando necessário.\nNão inclua dados pessoais nem publique links abertos sem orientação.'],
  ['DESAFIO PRÁTICO', 'Crie uma miniapresentação', 'Faça 4 páginas sobre uma ideia de produto da turma:\n1. nome e promessa; 2. para quem é; 3. imagem e benefício; 4. convite.\nUse no máximo duas fontes e três cores.'],
  ['CHECKLIST', 'Antes de entregar', '□ A ideia principal aparece rápido\n□ Texto e imagens estão legíveis\n□ As páginas parecem parte do mesmo projeto\n□ Revisei ortografia, privacidade e compartilhamento'],
  ['FONTES', 'Continue aprendendo', 'Canva Help Center: adicionar imagens, apresentar e baixar designs.\nOs recursos podem mudar conforme plano, idioma e dispositivo.\nPergunte ao professor antes de criar conta ou publicar.']
] as const;

const colors = ['#172743', '#f7f4ee', '#e8a012', '#fff0c7', '#286c70', '#ffffff'];

export function createCanvaLessonDocument(): PresentationDocument {
  return {
    schemaVersion: 1,
    dimensions: { width: 1280, height: 720 },
    themes: [{ id: crypto.randomUUID(), name: 'MetaLab · Editorial', colors }],
    assets: [],
    slides: slides.map(([kicker, title, body], index) => ({
      id: crypto.randomUUID(), title: `${String(index + 1).padStart(2, '0')} · ${title}`,
      background: index === 0 ? '#172743' : index % 3 === 1 ? '#fff8e8' : '#f7f4ee',
      elements: [
        { id: crypto.randomUUID(), type: 'shape', shape: 'rectangle', x: 88, y: 94, width: 72, height: 8, fill: '#e8a012', stroke: '#e8a012', strokeWidth: 0 },
        { id: crypto.randomUUID(), type: 'text', x: 88, y: 124, width: 1104, height: 34, text: kicker, color: index === 0 ? '#f3c664' : '#9c6500', fontSize: 18, fontWeight: 800, align: 'left' },
        { id: crypto.randomUUID(), type: 'text', x: 88, y: 178, width: 1104, height: 150, text: title, color: index === 0 ? '#ffffff' : '#172743', fontSize: index === 0 ? 64 : 48, fontWeight: 800, align: 'left' },
        { id: crypto.randomUUID(), type: 'text', x: 92, y: 350, width: 1090, height: 285, text: body, color: index === 0 ? '#e8edf4' : '#344762', fontSize: index === 0 ? 27 : 25, fontWeight: 600, align: 'left' },
        { id: crypto.randomUUID(), type: 'text', x: 88, y: 665, width: 1104, height: 28, text: `METALAB POCKET  •  CANVA  •  ${String(index + 1).padStart(2, '0')} / ${slides.length}`, color: index === 0 ? '#c3cfdd' : '#718098', fontSize: 12, fontWeight: 700, align: 'left' }
      ]
    }))
  };
}
