# Evolução do MetaLab Pocket

## Estado atual

O repositório foi migrado para Next.js App Router com React. A interface principal agora começa no cadastro do aluno e segue para a Central, Minha Empresa, Missões, Entregas, Celular, Estúdio 3D e Meu Kit Digital.

### Recursos existentes preservados

- Celular MetaLab, tela inicial, modo foco e traseira em 3D.
- Estúdio de fotografia com celular, caneca, tênis e camisa.
- Capturas persistidas na galeria IndexedDB separada por identificador do aluno.
- WhatsApp Business e Instagram de treino, sem conexão com serviços reais.
- Publicações simuladas e configuração do WhatsApp isoladas por identificador do aluno.

### Integração adicionada

- Cadastro Next API com nome, e-mail e data de nascimento.
- Sessão anônima de aula, token aleatório em cookie `HttpOnly`, hash no PostgreSQL e expiração de 12 horas.
- Migração versionada para alunos, sessões, negócio e progresso das missões.
- Perfil do negócio compartilhado com as missões e com os apps simulados do celular.
- Trilha pedagógica em cinco módulos e missões com validações adequadas a cada atividade.
- Respostas e progresso persistidos no PostgreSQL; dados de mídia permanecem locais.
- Fotos da Galeria disponíveis como opção de origem para uma publicação de Instagram fictício; suporte a Stories, curtidas e comentários simulados.
- Correção da gravação de missão: o estado do SQL recebeu tipo explícito, eliminando o erro PostgreSQL `42P08`.
- Nova área Entregas com nome, descrição, data da aula e anexos (imagem, PDF ou vídeo curto) vinculados à sessão do aluno.
- Painel docente com dados de cadastro, negócio, progresso, fotos e anexos; relatório imprimível para salvar como PDF com imagens.
- Turmas com códigos curtos de entrada, matrícula do aluno e gestão docente para adicionar, remover ou mover alunos.
- InstaLab privado por turma, condicionado à empresa cadastrada, com publicações de texto e imagem, curtidas, comentários e visibilidade das publicações no perfil docente do aluno.
- Migration `008_instalab_and_class_codes.sql` cria os códigos de entrada e armazena posts, imagens, curtidas e comentários no PostgreSQL.

## Próximo passo de infraestrutura

Antes de rodar migrações ou cadastrar alunos, configure uma credencial PostgreSQL rotacionada em `.env.local` ou nas variáveis protegidas da Vercel. A URL compartilhada na conversa deve ser invalidada pelo provedor. Depois, execute `npm run db:migrate` uma vez e publique como aplicação Next.js. O host Sites estático anterior não executa Route Handlers nem conexão PostgreSQL.

Consulte `README.md` para comandos, configuração e limites de privacidade.
