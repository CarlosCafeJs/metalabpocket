# MetaLab Pocket

Plataforma educacional feita em Next.js, React e PostgreSQL para praticar uso do smartphone, fotografia de produtos, comunicação comercial e segurança digital em um ambiente de aula. A experiência mantém o celular virtual, o Estúdio de Fotografia 3D, a Galeria local e as simulações de WhatsApp Business e Instagram.

## Estrutura do produto

- **Entrada do aluno:** nome, e-mail e data de nascimento. Se e-mail e nascimento já estiverem cadastrados, a entrada emite uma nova sessão para o mesmo aluno e recupera o progresso salvo. Não há senha nem autenticação forte de identidade.
- **Central:** progresso persistido, próxima missão, negócio e marcos da trilha de 20 horas.
- **Minha Empresa:** contexto usado pelas atividades e pelo perfil comercial simulado.
- **Missões:** cinco módulos com verificações por lista, escolha, resposta escrita, negócio, Galeria local ou vídeo local.
- **Entregas:** recebe nome, descrição, data da aula e foto, vídeo curto ou PDF pedido pelo professor.
- **Turmas:** o professor cria turmas com código de 8 caracteres; o aluno entra com o código e o professor pode adicionar, remover ou mover alunos.
- **InstaLab:** mural privado da turma para publicar textos e fotos da empresa, curtir e comentar. Exige empresa cadastrada e vínculo a uma turma; não publica em redes externas.
- **Celular virtual e Estúdio 3D:** aplicações originais mantidas em `/simulator`, carregadas como ilhas interativas dentro de páginas React.
- **Meu Kit Digital:** reúne o perfil, o progresso e as fotos produzidas no navegador.

Publicações fictícias, conversas e a galeria do celular ficam separadas por identificador de aluno neste navegador. A Câmera tenta enviar cada foto ao PostgreSQL automaticamente; fotos sincronizadas aparecem ao professor e podem ser removidas pelo aluno. Se a conexão falhar, a foto permanece na galeria local até uma nova tentativa. As publicações do InstaLab, curtidas, comentários e imagens são salvos no PostgreSQL e filtrados pela turma atual do aluno. Imagens do InstaLab aceitam JPG, PNG ou WebP de até 4 MB. Entregas feitas a pedido do professor ficam vinculadas ao aluno e à sessão no PostgreSQL. Missões, negócio e progresso também são salvos usando o identificador da sessão.

## Desenvolvimento

1. Instale Node.js compatível com Next 16 e dependências com `npm ci`.
2. Copie `.env.example` para `.env.local` e preencha `DATABASE_URL` com uma credencial PostgreSQL **nova e protegida**. A credencial compartilhada anteriormente na conversa deve ser rotacionada antes do uso.
3. Configure `DATABASE_CA` somente se o provedor exigir uma CA específica. O cliente valida certificados TLS; não desative essa validação.
4. Rode `npm run db:migrate` para aplicar migrações versionadas uma vez.
5. Rode `npm run dev` e acesse `http://localhost:3000`.

Para habilitar a área do professor, configure no servidor `METALAB_TEACHER_CPF`, `METALAB_TEACHER_PASSWORD` (mínimo de 12 caracteres) e `METALAB_TEACHER_SESSION_SECRET` (segredo aleatório com pelo menos 32 caracteres). O painel fica em `/docente/painel`, não aparece na navegação do aluno e exige CPF e senha. Configure os mesmos segredos como variáveis protegidas na Vercel; nunca os publique no repositório.

### PostgreSQL local para testes

O arquivo `compose.yaml` sobe um PostgreSQL isolado, publicado somente em `127.0.0.1:5433`, com volume próprio. No PowerShell, use:

```powershell
docker compose up -d
$env:DATABASE_URL = 'postgresql://metalab_test:metalab_test_only@127.0.0.1:5433/metalab_test'
$env:DATABASE_SSL = 'false'
npm run db:migrate
npm run dev
```

Essas credenciais são apenas para o banco local descartável e nunca devem ser usadas na Vercel ou em produção. `docker compose down` para o contêiner e preserva o volume; `docker compose down -v` também apaga os dados locais de teste.

`/api/health` informa se a conexão e as tabelas estão prontas, inclusive as do InstaLab. A API não cria tabelas em requisições de cadastro. As migrações incluem entregas com arquivos limitados a 4 MB (JPG, PNG, WebP, PDF, MP4 ou WebM), dentro do limite de requisição das funções Vercel. O professor autenticado acessa os dados em `/docente/painel`; o relatório usa a impressão do navegador, que permite escolher “Salvar como PDF” e inclui as fotos carregadas.

## Publicação na Vercel

Importe o repositório `CarlosCafeJs/metalabpocket` com o preset **Next.js**. Configure `DATABASE_URL`, `METALAB_TEACHER_CPF`, `METALAB_TEACHER_PASSWORD`, `METALAB_TEACHER_SESSION_SECRET` e, se necessário, `DATABASE_CA` como variáveis protegidas no painel da Vercel. Execute as migrações uma vez em ambiente controlado com a mesma conexão, depois publique. Não coloque credenciais em variáveis `NEXT_PUBLIC_*`, no código-fonte, em commits ou em comandos registrados no terminal.

O projeto contém a aplicação Next.js e pode ser publicado na Vercel. O endereço estático anterior do Sites não executa as APIs PostgreSQL e não substitui esta implantação.

## Dados e privacidade

O cadastro do aluno não é autenticação de identidade. A sessão dura até 12 horas e usa um token aleatório, guardado como hash no banco e em cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção. A sessão do professor dura até 6 horas e usa cookie `HttpOnly`, `SameSite=Strict` e assinatura HMAC. Em computadores compartilhados, encerre a sessão ao final da aula. Cada API de aluno filtra pelo identificador da sessão; a turma, o perfil cadastrado, o progresso, as fotos compartilhadas e as entregas estão atrás da autenticação do professor. Nome, e-mail e nascimento ficam no PostgreSQL; mantenha acesso restrito e defina retenção e exclusão conforme a política do curso. O professor vê fotos do Estúdio 3D somente quando o aluno permite o compartilhamento.

Os aplicativos simulados não conectam com Instagram, WhatsApp, contatos, links ou redes externas. Respostas com links, e-mails, telefones, senhas ou códigos são barradas antes de serem salvas.

## Recursos preservados

- `public/simulator/index.html`: smartphone virtual e seus aplicativos fictícios.
- `public/simulator/camera-studio.html`: estúdio 3D com celular, caneca, tênis e camisa.
- `metalab-pocket-gallery-{studentId}` (IndexedDB): fotos capturadas no estúdio, separadas por aluno.
- `metalab-pocket-instagram-{studentId}` (IndexedDB): publicações simuladas separadas por aluno.
- `metalab-business-v1-{studentId}` (localStorage): conversas e configurações de treino do WhatsApp Business, separadas por aluno.

As páginas Next usam React e Route Handlers no App Router. A camada de persistência PostgreSQL fica em `src/server`; o esquema é mantido em `db/migrations`.

## Comandos úteis

- `npm run dev`: servidor de desenvolvimento.
- `npm run typecheck`: verificação TypeScript.
- `npm run build`: build de produção com Webpack.
- `npm start`: servir o build local.
- `npm run db:migrate`: aplicar as migrações do PostgreSQL.

O professor cria e consulta códigos de turma na aba **Turmas** de `/docente/painel`. O aluno usa a página **Turmas** para entrar com o código; entrar em outra turma substitui o vínculo anterior. Depois de salvar uma empresa e entrar em uma turma, o aluno abre **InstaLab** no menu. O perfil do professor inclui as publicações do aluno, as imagens, as curtidas e os comentários.
