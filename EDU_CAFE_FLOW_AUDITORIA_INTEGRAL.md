# EDU CAFÉ FLOW — Auditoria integral do repositório

**Snapshot:** 25/11/2026
**Repositório:** C:\Users\La e Car\Desktop\metalab-virtual (referência local CarlosCafeJs/metalabpocket)
**Escopo:** leitura do código, documentação, refs Git locais e validações locais. Não houve consulta a dados pessoais, SQL, migrations, deploy, push ou alteração de configuração externa. Esta auditoria cria apenas documentação.

## 1. Resumo executivo

O projeto é uma aplicação educacional Web em Next.js/React/TypeScript, com PostgreSQL como persistência central. Inclui portal do aluno, portal docente, turmas, progresso e missões, formulários de sala, entregas, InstaLab com economia virtual/campanhas, biblioteca/editor de apresentações e um cliente Desktop Electron com uma fatia limitada offline-first de Missões.

O repositório e o checkout têm estados diferentes. A branch local ativa é codex/desktop-offline-phase1 em e27865d; ela contém Central de Sincronização e recuperação de autorização Desktop, mas diverge da main local e da referência armazenada origin/main. origin/main aponta para 6a54dc4 e contém uma evolução mais recente de Apresentações, mas não os dois commits Desktop posteriores presentes no HEAD ativo. Há alterações não commitadas no checkout, incluindo remoção local dos simuladores, contas novas de aluno, editor de slides e migrations adicionais. As refs são cópias locais do Git; não provam o estado atual do servidor de deploy.

Na árvore de trabalho, o produto se identifica como CaféFlow Pocket, não Edu Café Flow. A troca é principalmente visual: cookies, variáveis METALAB_*, IDs, tabelas e identidade do backend ainda contêm o nome antigo. Simuladores/câmera foram removidos apenas como alterações não commitadas; permanecem na árvore versionada do HEAD. Não devem ser considerados definitivamente removidos do produto.

### Estado observado

- **Web:** build, typecheck e testes locais passaram. npm test reportou 23 aprovações, mas também descobriu um teste interno next-test.js dentro de dist, contaminando a descoberta automática.
- **Aluno:** o código local aceita cadastro com senha, CPF e e-mail; CPF é representado por HMAC e senha por scrypt. METALAB_STUDENT_CPF_PEPPER estava ausente nos arquivos .env.local/.env verificados. Cadastro e autenticação por CPF dependem desse segredo e falham sem ele.
- **Professores:** autenticação ainda é baseada em credenciais estáticas no ambiente; não há cadastro docente, aprovação por superusuário nem tabela de contas docentes. Painel/queries atuais são globais, sem owner de turma por professor.
- **Aluno sem turma:** AppShell direciona a /turmas e oculta conteúdo de formação; é uma regra de interface que deve ser complementada pela autorização de cada API.
- **Banco:** 18 migrations definem 34 tabelas. Nenhuma foi executada ou verificada nesta auditoria.
- **Desktop:** arquitetura local tem Electron + Next standalone + SQLite, criptografia, provisionamento de Missões, outbox, retries, sincronização e UI de acompanhamento. Auditoria documental relata instalador NSIS criado, mas uma inicialização instalada falhou anteriormente; instalação funcional atual não foi validada.
- **Nova marca:** Edu Café Flow é uma decisão de posicionamento; não está aplicada no código e os novos requisitos de produto continuam em aberto.

## 2. Método, contagens e limites

A inspeção usou git status/log/branch, rg --files e leitura de Route Handlers, componentes, serviços, domínio, migrations, scripts e documentação. Valores de arquivos .env não foram exibidos. Nenhum banco foi consultado.

| Contagem | Resultado | Critério |
|---|---:|---|
| Módulos identificados | 12 | Domínios descritos na seção 5, incluindo suporte e Desktop |
| Rotas/telas | 16 | page.tsx/page.ts em src/app; inclui rotas dinâmicas |
| Arquivos de endpoint | 56 | route.ts abaixo de src/app/api |
| Handlers HTTP | 85 | GET/POST/PUT/PATCH/DELETE exportados nos 56 arquivos |
| Migrations PostgreSQL | 18 | SQL numerado em db/migrations |
| Tabelas declaradas | 34 | CREATE TABLE nas migrations; não é contagem do banco implantado |
| Arquivos de teste do projeto | 6 | *.test.*/*.spec.*; node --test também incluiu teste em dist |
| Testes executados | 23 aprovados | Saída de npm test; inclui ressalva sobre dist |

**Não verificado:** commit publicado, variáveis protegidas do serviço, estado atual de TLS externo, ledger/schema Railway, dados, permissões reais de contas, comportamento em dispositivos, instalação atual do Desktop. Afirmações históricas de documentos são tratadas como história, não como verificação presente.

## 3. Repositório e estado Git

- HEAD: e27865d04ec7993266739d3090fd659f69423a9e — feat(web): add presentations library and viewer.
- Branch ativa: codex/desktop-offline-phase1, alinhada à referência local origin/codex/desktop-offline-phase1.
- main local: 561254ec — fix(desktop): honor Node multi-address DNS lookup.
- origin/main local: 6a54dc4 — feat(web): complete presentation editor and Canva lesson.
- Branch local de upgrade de segurança: codex/next-security-upgrade, commit 32758c0, em worktree separada; isso não é push nem deploy.
- Branch adicional: codex/student-class-access-emails em 21bbfcc, uma revisão à frente de origin/codex/student-class-access-emails conforme tracking local.
- main local é ancestral do HEAD. origin/main e HEAD divergiram: origin/main contém 59dd0e3 e 6a54dc4 de Apresentações; HEAD contém 526a746 (Central de Sincronização/recuperação) e e27865d sobre 561254e.
- Não há uma única branch local confirmada com tudo. origin/main é mais avançada no editor; a branch Desktop tem a linha de sincronização mais recente. A árvore ativa tem mais trabalho não commitado. Refs origin/* podem estar desatualizadas; não foi feito fetch.
- Antes de criar este relatório, git status contou 94 entradas (43 modificadas, 36 removidas, 15 não rastreadas), incluindo trabalho anterior do usuário, preservado.
- Alterações locais incluem migrations 017/018, componentes/rotas do editor, cadastro por senha, branding, alterações Electron e exclusões de câmera/3D. O relatório não atribui autoria.
- Next dev gerou AGENTS.md não rastreado com regra técnica gerada pelo Next; o arquivo informa ser recriado por next dev.

### Divergência entre as linhas

A linha Desktop deriva da main local e acrescenta Central de Sincronização e recuperação de autorização expirada. origin/main contém editor visual, aula Canva e upload de assets, mas não contém os commits Desktop posteriores da branch de trabalho. A árvore local possui componentes e migrations não commitados; portanto, execução local não representa exatamente nenhum dos commits citados.

## 4. Stack e arquitetura

- Runtime observado: Node.js 24.21.0.
- package.json/lockfile/node_modules: Next ^16.4.6/16.4.6, React/React DOM ^19.3.1, pg ^8.23.1, Zod ^4.6.7; TypeScript ^7.0.2, Electron 45.1.0, electron-builder ^26.18.0.
- O commit HEAD rastreado originalmente continha Next 16.4.2; upgrade para 16.4.6 está não commitado neste checkout. Existe commit separado 32758c0 com upgrade e configuração de agente.
- Frontend: Next App Router em src/app, componentes em src/components, estado do aluno em src/hooks/useStudentState.ts, CSS global e específico.
- Backend: Route Handlers em src/app/api; domínio/validação em src/domain; persistência/serviços em src/server.
- Banco Web: PostgreSQL via pg em src/server/db.ts; pool por instância, máximo três conexões, timeout de sete segundos, TLS verificado por padrão. Bypass local de TLS é condicionado a não produção e não Vercel.
- Desktop: SQLite embutido node:sqlite / DatabaseSync em src/server/desktop/store.ts.
- Validação de entrada: Zod. Consultas do repository usam parâmetros SQL.
- next.config.ts: Webpack em npm run build; next dev usa Turbopack; optimizePackageImports: zod e headers básicos. Configuração atual não tem experimental.agentUpgrade.
- Deploy: vercel.json declara framework Next.js. Não foi encontrado config Railway de deploy que prove pipeline. compose.yaml oferece PostgreSQL 16 apenas em loopback para testes.
- package.json não possui script de lint.

### Caminho Web

Tela em src/app monta componentes; cliente chama fetch('/api/...'); handler valida entrada/origem/sessão; chama serviços em repository.ts, presentations.ts ou domínio; getPool acessa PostgreSQL e migrations versionam schema.

### Caminho Desktop

electron/main.cjs inicializa Electron, protege uma chave via safeStorage, cria diretório local, reserva endereço loopback, inicia Next standalone via utilityProcess.fork, espera health HTTP e abre BrowserWindow. A janela usa contextIsolation, sandbox e nodeIntegration false; preload expõe somente uma flag. Next Desktop usa SQLite e encaminha autenticação/sync ao backend HTTPS após validação de identidade/destino.

## 5. Inventário de módulos (12)

| # | Módulo | Usuários, telas e função | Código/dados | Maturidade |
|---:|---|---|---|---|
| 1 | Acesso, cadastro e sessão | Entrada /; cadastro/login aluno; /docente/painel | StudentEntry, api/students, api/session, api/teacher/session, student-credentials.ts, teacher-auth.ts; students/sessions | Cadastro aluno local presente, depende do pepper/migration 018. Docente usa credenciais estáticas; sem aprovação. |
| 2 | Central e turma | /dashboard, /turmas; progresso, join por código e colegas | AppShell, useStudentState, api/me, api/student/classes; classes/assignments | Implementado em código; gate sem turma é principalmente UI. |
| 3 | Minha Empresa | /empresa; perfil comercial por aluno | api/business, repository; businesses 1:1 com aluno | Implementada, PostgreSQL. |
| 4 | Missões curriculares | /missoes; cinco módulos, evidência, resposta e progresso | curriculum.ts, mission-evaluation.ts, api/missions/[id]; mission_progress | Implementada no código; vídeo indicado fica local, metadados são registrados. |
| 5 | Missões Relâmpago | /missoes-relampago; desafios curtos docentes | api/student/quick-missions, api/teacher/quick-missions; quick_modules/quick_missions/deliveries | Presente; schema não atribui owner por turma. |
| 6 | Formulários de sala | Conteúdo docente/aluno, campos e submissões | api/teacher/classroom, api/student/classroom*; módulos/missões/tarefas/submissões | Presente; conteúdo docente no schema atual é global. |
| 7 | Entregas e histórico | /entregas; upload e linha do tempo docente | student/deliveries, teacher/deliveries, student history; deliveries/activity_events | Presente, valida tamanho/tipo; sem teste produção. |
| 8 | InstaLab/economia | /instalab, /instalab/profissional; feed, perfil, posts, likes, comments, anúncios e MetaCoins | student/teacher instalab APIs, instalab-economy.ts, instalab-image.ts; posts/campaigns/wallet | Implementado como rede simulada privada por turma, sem publicação externa. |
| 9 | Apresentações | /apresentacoes, /docente/apresentacoes e editor | TeacherPresentationLibrary, PresentationEditor, Viewer, SlideRenderer, server/presentations; presentations/classes/versions/assets | Biblioteca/viewer no HEAD; editor/lesson Canva/assets na origin/main e/ou árvore não commitada. PDF via impressão browser. |
| 10 | Central docente | /docente/painel; roster, progresso, turmas, InstaLab e relatórios | teacher-panel.tsx, api/teacher/*, cookie HMAC | Presente; qualquer professor de env recebe acesso global. Sem isolamento por professor. |
| 11 | Desktop offline-first | Electron, Next local, Missões offline, outbox e sync | electron/**, server/desktop/**, DesktopSyncCoordinator, /sincronizacao, api/desktop | Código e testes simulados; documentação relata falha de inicialização instalada, ainda não homologada. |
| 12 | Operação, banco e marca | Health, migrations, billing, branding | api/health, migrate.mjs, bill-instalab-campaigns, .env.example, public/branding | Infra/documentação presente; produção não verificada. |

### Simuladores antigos

A árvore de trabalho removeu /camera, /camera-studio, /celular, Kit Digital, SimulatorFrame e public/simulator/**, incluindo Three.js/modelos. Essas remoções estão não commitadas. HEAD e histórico ainda os contêm; relatórios anteriores também descrevem inclusão no instalador. A remoção no checkout não comprova remoção em produção.

## 6. Inventário das 16 rotas de interface

| Caminho | Finalidade |
|---|---|
| / | Entrada/cadastro/login |
| /dashboard | Central aluno |
| /empresa | Negócio |
| /turmas | Entrar/trocar turma |
| /missoes | Currículo |
| /missoes-relampago | Desafios |
| /entregas | Arquivos de atividades |
| /instalab | Feed social de turma |
| /instalab/profissional | Painel comercial simulado |
| /apresentacoes | Biblioteca aluno |
| /apresentacoes/[presentationId] | Viewer aluno |
| /docente/painel | Central docente |
| /docente/apresentacoes | Biblioteca docente |
| /docente/apresentacoes/[presentationId] | Viewer docente |
| /docente/apresentacoes/[presentationId]/editar | Editor, na árvore local/origin/main |
| /sincronizacao | Central sync Desktop |

## 7. APIs: 56 route files e 85 handlers

Auth abaixo resume a checagem no handler: “Aluno” = sessão válida; “matriculado” = validação de vínculo onde indicada; “Professor” = cookie HMAC de conta de ambiente; “Desktop” = modo/sessão local. “Origem” = same-origin nos writes. Isso não substitui revisão de cada objeto/query.

### Sistema e aluno

| Caminho | Métodos | Autenticação/efeito |
|---|---|---|
| /api/health | GET | Público; readiness |
| /api/me | GET | Aluno; sessão, turma, negócio e progresso |
| /api/session | GET, POST, DELETE | Aluno; sessão, login, logout |
| /api/students | POST | Público + origem; cadastro |
| /api/business | GET, PUT | Aluno; negócio |
| /api/missions/[missionId] | GET, POST | Aluno; missão e tentativa |
| /api/student/classes | GET, POST | Aluno; turma/código |
| /api/student/quick-missions | GET | Aluno; desafios |
| /api/student/classroom | GET | Aluno matriculado; conteúdo publicado |
| /api/student/classroom/submissions | POST | Aluno matriculado + origem; resposta |
| /api/student/deliveries | GET, POST | Aluno; lista/envio |
| /api/student/deliveries/[deliveryId] | GET | Aluno; arquivo |
| /api/student/instalab | GET, POST | Aluno; feed/publicação |
| /api/student/instalab/[postId] | PUT, DELETE | Aluno; próprio post |
| /api/student/instalab/[postId]/comments | POST | Aluno; comentário |
| /api/student/instalab/[postId]/like | POST, DELETE | Aluno; curtida |
| /api/student/instalab/[postId]/image | GET | Aluno autorizado; imagem |
| /api/student/instalab/profile | PUT, DELETE | Aluno; perfil/avatar |
| /api/instalab/avatar/[studentId] | GET | Aluno da turma/professor conforme handler |
| /api/student/instalab/economy | GET | Aluno; saldo/extrato |
| /api/student/instalab/campaigns | GET, POST | Aluno; anúncio e análise |
| /api/student/instalab/campaigns/[campaignId] | PATCH | Aluno dono; estado da campanha |
| /api/student/instalab/campaigns/[campaignId]/image | GET | Aluno autorizado; imagem |

### Professor e apresentações

| Caminho | Métodos | Autenticação/efeito |
|---|---|---|
| /api/teacher/session | GET, POST, DELETE | Status/login/logout docente |
| /api/teacher/students | GET | Professor; roster atual global |
| /api/teacher/students/[studentId] | GET, PATCH, DELETE | Professor; detalhe/atualização/arquivamento |
| /api/teacher/students/[studentId]/history | GET | Professor; histórico |
| /api/teacher/classes | GET, POST | Professor; turmas e matrículas |
| /api/teacher/classroom | GET, POST | Professor; formulários/conteúdo |
| /api/teacher/quick-missions | GET, POST, PATCH | Professor; desafios |
| /api/teacher/deliveries/[deliveryId] | GET | Professor; entrega |
| /api/teacher/instalab | GET | Professor; feed global |
| /api/teacher/instalab/[postId] | DELETE, PATCH | Professor; moderação |
| /api/teacher/instalab/[postId]/comments | GET, POST | Professor; comentários |
| /api/teacher/instalab/[postId]/image | GET | Professor; imagem |
| /api/teacher/instalab/[postId]/like | POST, DELETE | Professor; curtida |
| /api/teacher/instalab/comments/[commentId] | DELETE | Professor; moderação |
| /api/teacher/instalab/economy | GET, PUT | Professor/admin econômico |
| /api/teacher/instalab/campaigns | GET | Professor; fila |
| /api/teacher/instalab/campaigns/[campaignId] | PATCH | Professor; revisão |
| /api/teacher/instalab/campaigns/[campaignId]/image | GET | Professor; imagem |
| /api/presentations | GET, POST, PATCH, DELETE | Aluno lê publicadas; professor gerencia |
| /api/presentations/[presentationId] | GET, PATCH | Material de aluno/docente |
| /api/presentations/[presentationId]/assets | POST | Professor; upload validado |
| /api/presentations/[presentationId]/assets/[assetId] | GET | Aluno/docente autorizado |

### Desktop e backend remoto

| Caminho | Métodos | Autenticação/efeito |
|---|---|---|
| /api/desktop/identity | GET | Público; metalab-pocket / desktop-offline-sync / v1 |
| /api/desktop/health | GET | Modo Desktop |
| /api/desktop/connect | POST | Desktop; validar backend/autenticar/provisionar |
| /api/desktop/config | GET, POST | Desktop; origem ou troca autenticada pelo professor |
| /api/desktop/session | GET, DELETE | Desktop; sessão local |
| /api/desktop/classroom | GET | Provisão Desktop; snapshot |
| /api/desktop/classroom/submissions | POST | Sessão local; resposta offline |
| /api/desktop/sync | POST | Provisão; envia outbox |
| /api/desktop/sync/status | GET | Estado/histórico da fila |
| /api/desktop/sync/preferences | GET, PATCH | Preferências locais |
| /api/student/desktop-sync | POST | Sessão aluno; provision/sync/recover |

O inventário contou arquivos de rotas e declarações HTTP exportadas; não foram chamados endpoints de produção.

## 8. Banco e persistência

### PostgreSQL — 34 tabelas declaradas

| Migration | Tabelas declaradas | Função |
|---|---|---|
| 001_foundation.sql | metalab_students, metalab_student_sessions, metalab_businesses, metalab_mission_progress | Contas/sessões, negócio 1:1 e progresso aluno-missão |
| 002_teacher_dashboard_and_photos.sql | metalab_student_photos | Foto, consentimento, BYTEA e chave idempotente por aluno |
| 003_student_deliveries.sql | metalab_student_deliveries | Arquivos de atividade e metadados; missão rápida opcional |
| 004_student_identity_lookup.sql | — | Índice legado de e-mail/data de nascimento |
| 005_quick_missions.sql | metalab_quick_missions | Desafios curtos docentes |
| 006_teacher_classroom.sql | metalab_teacher_modules, metalab_teacher_missions, metalab_teacher_tasks, metalab_teacher_task_submissions | Módulo→missão→tarefa→resposta do aluno |
| 007_module_forms_and_classes.sql | metalab_quick_modules, metalab_classes, metalab_student_class_assignments | Módulos rápidos, classes e um vínculo atual por aluno |
| 008_instalab_and_class_codes.sql | metalab_instalab_posts, metalab_instalab_likes, metalab_instalab_comments | Feed turma, curtidas/comentários e código de entrada |
| 009_instalab_teacher_moderation.sql | — | Campos/regras de moderação |
| 010_student_archive.sql | — | Arquivamento lógico/restauração |
| 011_student_activity_history.sql | metalab_student_activity_events | Linha de tempo de eventos |
| 012_instalab_student_avatars.sql | — | Avatar no InstaLab |
| 013_instalab_economy_and_campaigns.sql | metalab_instalab_economy_settings, metalab_instalab_economy_rule_events, metalab_instalab_wallet_entries, metalab_instalab_daily_content_claims, metalab_instalab_economy_security_events, metalab_instalab_campaigns, metalab_instalab_campaign_events, metalab_instalab_campaign_impressions | Regras, ledger MetaCoins, caps, auditoria e anúncios |
| 014_instalab_rewards_billing_and_lighting.sql | metalab_instalab_campaign_charges, metalab_instalab_like_reward_claims | Cobrança de campanhas e dedupe de recompensa; amplia schema |
| 015_desktop_offline_sync.sql | metalab_desktop_provisions, metalab_desktop_sync_operations | Permissões/snapshots e ledger idempotente |
| 016_presentations.sql | metalab_presentations, metalab_presentation_classes, metalab_presentation_versions | Documento, turma e versões |
| 017_presentation_assets.sql | metalab_presentation_assets | Imagem privada vinculada à apresentação |
| 018_student_password_accounts.sql | — | Adiciona digest CPF e password hash ao aluno, constraints/índices |

### Relacionamentos lógicos

    students -> sessions, business (1:1), mission_progress, deliveries, photos
    students -> class_assignments (0:1) -> classes
    students -> InstaLab posts -> classes; likes/comments ligam posts e autores
    teacher_modules -> missions -> tasks -> submissions <- students
    quick_modules -> quick_missions -> deliveries
    presentations <- presentation_classes -> classes; presentations -> versions/assets
    student + class -> desktop_provisions -> desktop_sync_operations
    students -> MetaCoins wallet/claims/campaigns

Arquivos de foto/entrega/assets são armazenados em BYTEA conforme schema; a maioria das desativações usa arquivamento, não remoção física.

### Runner e estado efetivo

scripts/migrate.mjs usa metalab_schema_migrations, ordem numérica, transações/advisory lock e DATABASE_URL/TLS. Nenhuma migration foi executada. docs/cafeflow-accounts-scope.md e docs/meta-lab-apresentacoes.md dizem historicamente que 017/018 foram aplicadas na Railway; isso não foi reconfirmado. Schema, ledger, host/ambiente e dados reais são **não verificados**.

### SQLite — nove tabelas locais

Em src/server/desktop/store.ts: desktop_schema_migrations, desktop_provisions, desktop_mission_snapshots, desktop_mission_outbox, desktop_secrets, desktop_sync_preferences, desktop_sync_runs, desktop_sync_history, desktop_sync_locks. Arquivo metalab-offline.sqlite em diretório de dados do app. Tokens/segredos cifrados; chave protegida via safeStorage. Outbox mantém pending/syncing/synced/conflict/needs_auth/error e IDs de operação para retry idempotente.

## 9. Fluxos principais

### Professor cria turma e aluno entra

Professor entra em /docente/painel; /api/teacher/classes cria metalab_classes e join code; aluno cadastra/loga, abre /turmas e /api/student/classes verifica código e cria/atualiza vínculo. AppShell envia aluno autenticado sem turma à página de turmas. Lacuna: schema não guarda owner professor.

### Cadastro/login aluno

Schema valida nome/email/data/CPF válido/senha mínima 12; HMAC com METALAB_STUDENT_CPF_PEPPER + scrypt; transaction checa duplicidade e cria token de sessão; login busca CPF digest ou e-mail. Sem turma, a UI permanece bloqueada para formação. O pepper ausente no ambiente local impede cadastro e autenticação por CPF; login por e-mail não calcula HMAC.

### Missões e formulários

Curriculum em domain/curriculum.ts monta cinco módulos; API mission valida sessão/evidência/avaliação e persiste em metalab_mission_progress. Formulários docentes organizam módulo→missão→tarefas e submissões. Missões Relâmpago são outro domínio e podem gerar entrega.

### Entrega

Aluno envia arquivo/metadados por /api/student/deliveries; validação limita tamanho e MIME; BYTEA no Postgres. Professor lê por API protegida e consulta histórico. Limite descrito para entrega: 4 MiB; tipos JPG/PNG/WebP/PDF/MP4/WebM.

### InstaLab

Aluno com sessão/turma e empresa usa feed privado; edita seu post, comenta e curte. Professor modera, comenta e revisa anúncios. Carteira e cobranças são ledgeradas, caps evitam recompensa repetida. Não há publicação externa.

### Apresentações

Docente cria material e associa turmas; documento tem revisão e snapshots; aluno lê apenas material publicado de sua turma. Assets têm rota separada e validação de imagem. PDF é impressão do browser; depende do navegador.

### Desktop

Electron inicia servidor Next em loopback e SQLite; backend HTTPS é autenticado por identidade; servidor provisiona missão/snapshot de aluno/turma e validade de sete dias. Respostas offline vão à outbox, sincronizadas por operation IDs; expirado exige reautenticar e revalidar vínculo/permissões. Offline limita-se a Missões; não inclui administração, MetaCoins, InstaLab ou professor.

## 10. Autenticação e autorização

- Aluno: cookie metalab_session, token aleatório, hash do token no banco, validade configurável até 24h (padrão 12h), HttpOnly/SameSite=Lax/Secure prod; server/session.ts.
- CPF de aluno novo: HMAC-SHA-256 com pepper; senha scrypt N=16384/r=8/p=1 e salt aleatório; student-credentials.ts e migration 018.
- Professor: contas principal/opcional secundária em variáveis de ambiente; comparação timing-safe; sessão HMAC/nonce com 6h, HttpOnly/SameSite=Strict/Secure prod; teacher-auth.ts. Não há tabela de professores.
- Economia InstaLab: permissão administrativa adicional por CPF configurado.
- Writes em geral chamam sameOrigin; cookie SameSite é defesa complementar. sameOrigin aceita request sem Origin, relevante para clients não-browser; exploit não demonstrado.
- Aluno recebe colegas/feed por vínculo. AppShell impede UI de formação sem turma, mas APIs ainda devem aplicar autorização server-side. Professores atuais veem dados globais: listTeacherStudents/listTeacherClasses não recebem identidade docente.
- Rate limit docente é Map em memória, até cinco tentativas por 15 min e IP; não compartilhado entre instâncias e reinício o reseta.
- Dados antigos sem credenciais permanecem em tabelas segundo a migration 018/docs, porém não autenticam no novo fluxo e não aparecem em roster ativo conforme documentação.
- Valores secretos foram omitidos.

## 11. Integrações, deploy e variáveis

| Sistema | Evidência | Estado externo |
|---|---|---|
| PostgreSQL/Railway | pg, migrations, README/docs | Não acessado |
| Vercel | vercel.json framework Next | Deploy/branch/vars não confirmados |
| Domínio customizado | Config Desktop https://metalab.cafeflow.com.br; testes de normalização | Não consultado publicamente nesta rodada |
| Electron/NSIS | deps e electron-builder config | Sem build/install nesta rodada |
| Three.js | assets no Git/HEAD, removidos só no working tree | Sem render local na árvore atual |
| APIs sociais externas | não identificadas; InstaLab simulado no banco | Sem integração externa observada |
| Object storage | não identificado para arquivos do sistema | Bytea no Postgres segundo schema |

Nomes de variáveis do projeto: DATABASE_URL, DATABASE_SSL, DATABASE_CA, DATABASE_SSL_SERVERNAME, DATABASE_SSL_REJECT_UNAUTHORIZED, METALAB_STUDENT_CPF_PEPPER, METALAB_TEACHER_CPF, METALAB_TEACHER_PASSWORD, METALAB_TEACHER_2_CPF, METALAB_TEACHER_2_PASSWORD, METALAB_TEACHER_SESSION_SECRET, METALAB_INSTALAB_ECONOMY_ADMIN_CPF, METALAB_SESSION_HOURS, METALAB_DESKTOP_MODE, METALAB_DESKTOP_TEST_MODE, METALAB_DESKTOP_TEST_BACKEND_URL, METALAB_DESKTOP_DATA_KEY, METALAB_DESKTOP_DB_PATH, METALAB_DESKTOP_DIST_DIR, METALAB_DESKTOP_BUILD, METALAB_DESKTOP_RELEASE_DIR, VERCEL e NODE_ENV.

Arquivos .env.local/.env foram examinados apenas por presença: pepper CPF ausente; DATABASE_URL e variáveis base docentes preenchidas. Host/banco não identificados, nenhum valor reproduzido; produção não verificada.

## 12. Marca e compatibilidade

- package.json e UI local usam CaféFlow Pocket; logo em public/branding/cafeflow-logo.png.
- Identificadores técnicos MetaLab permanecem: metalab_* em tabelas, METALAB_* env, cookies metalab_session/metalab_teacher_session, identidade API metalab-pocket, appId br.com.metalab.pocket, metaLabDesktop e metalab-offline.sqlite.
- docs/cafeflow-pocket-rebrand.md descreve preservar esses contratos.
- Edu Café Flow não foi aplicado. Auditoria de ocorrências não autoriza substituição em massa; cookies, tabelas, protocolos e appId precisam plano de compatibilidade.

## 13. Desktop

**Presente no código:** Electron 45, BrowserWindow/utilityProcess, Next standalone, health/readiness, logs sanitizados, safeStorage, SQLite, TLS, validação de URL/DNS/SSRF/identidade, snapshots, outbox, idempotência, backoff, locks, histórico, reautorização e UI /sincronizacao. APIs locais verificam METALAB_DESKTOP_MODE. Testes unitários cobrem domínios/DNS/TLS/identidade/startup.

**Incompleto/não verificado:** npm run desktop:test/build/dist:win e instalação limpa/upgrade/encerramento não executados. docs/desktop-offline-audit.md historicamente registra NSIS criado, mas aplicação instalada encerrou antes de concluir servidor/SQLite; código 2 em reinstalações, causa desconhecida. Publicação atual/identidade remota não consultada. Não declarar instalador aprovado.

## 14. Apresentações

Biblioteca/viewer estão no HEAD; editor visual e aula Canva estão no origin/main e/ou checkout não commitado. Documento versionado/schema em domain/presentations.ts; persistência/revisão/snapshot em server/presentations.ts; upload JPEG/PNG/WebP por assinatura e migration 017. Aula Canva tem 20 slides, texto editável sem capturas reais. PDF usa impressão. Não há export PPTX/PNG nem UI confirmada para restaurar snapshots. Testes cobrem schema, campos e assets, não E2E/autorização real/conflito Postgres. Docs históricos afirmam 017 aplicada, não reconfirmada aqui.

## 15. Testes e qualidade

| Comando | Resultado |
|---|---|
| npm run typecheck | Passou, exit 0 |
| npm test | 23 aprovados, 0 falhas; incluiu next-test.js interno em dist; warnings Node de módulo ESM |
| npm run build | Passou com Next 16.4.6/Webpack, typecheck e geração das páginas/rotas |
| npm run desktop:test | Não executado |
| npm run desktop:build | Não executado |
| npm run desktop:dist:win | Não executado |
| Lint | Sem script no package.json |
| SQL/migrations/produção | Não executados |

Primeira tentativa de build no sandbox falhou EPERM ao criar pasta em .next; repetição local autorizada completou. Build não valida autorização de conta, PostgreSQL vivo, uploads, sincronização real ou instalação Desktop.

Seis arquivos de teste do projeto cobrem entrada de aluno, imagem InstaLab, economia, Apresentações, diagnóstico startup e backend Desktop. scripts/desktop-flow-check.mjs é separado e precisa npm run desktop:test. Não foi identificada suíte browser E2E configurada. Test discovery percorre dist, dívida de configuração.

## 16. Riscos

| Severidade | Risco | Evidência/qualificação |
|---|---|---|
| Alta para expansão multi-professor | Sem isolamento de turma por professor | metalab_classes não tem owner; listTeacherStudents/classes são globais. Incompatível com autocadastro de professor sem refatoração. As contas atuais são explicitamente privilegiadas, então isso é uma lacuna para o novo modelo. |
| Alta operacional | Pepper CPF ausente local | hashStudentCpf exige 32 bytes; sem ele cadastro e login CPF falham. Confirmado no snapshot local; Railway não verificado. |
| Alta/moderada dados | Arquivos em BYTEA | Fotos, entregas e assets crescem banco e request; volume/capacidade não medidos. |
| Moderada | Docente em env estático | Sem cadastro, status pending, aprovação, revogação DB ou escopo por docente. |
| Moderada | Rate limit em memória | Não distribuído; reinicia com instância/cold start. |
| Moderada | Branches e working tree divergentes | Web editor/Desktop estão em linhas distintas e 94 mudanças locais não commitadas no início; risco de publicar branch incompleta. |
| Moderada | Schema/deploy não confirmado | Docs de migrations são históricas; aplicar sem conferir ledger pode divergir. |
| Baixa/moderada | Test discovery inclui dist | Evidência npm test desta rodada. |
| Baixa/moderada | sameOrigin aceita Origin ausente | Comportamento confirmado; compatibilidade para clientes, exploit não demonstrado. |
| Baixa/moderada | NSIS histórico não assinado | Relatório anterior; assinatura/build atual não verificados. |

Não foi comprovado SQL injection nas consultas amostradas parametrizadas, secret em bundle, bypass TLS ou CSRF explorável. Não houve SAST/pentest nem revisão manual exaustiva de todos os 85 handlers; ausência não está provada.

## 17. Pendências e dívidas técnicas

1. Cadastro docente por CPF/e-mail/senha, aprovação por superusuário e revogação não existem.
2. Ownership de turma e escopo por professor não existem; conteúdo docente/formulários/quick missions/Instalab/apresentações precisa de modelo multi-tenant.
3. METALAB_STUDENT_CPF_PEPPER ausente local; produção não confirmada.
4. Estado atual das migrations 017/018 no Railway não reconfirmado; não houve query.
5. Consolidar branches e preservar alterações locais antes de publicar.
6. Instalação Windows e inicialização do Desktop precisam homologação real.
7. Apresentações precisam E2E visual, autorização/upload, conflitos e impressão.
8. Filtrar dist da busca de testes; avaliar warnings ESM.
9. README descreve reaproveitar cadastro por e-mail/data, divergindo do fluxo com credenciais da migration 018.
10. README lista variáveis METALAB_TEACHER_2_*, mas .env.example verificado não lista a segunda conta.
11. Fotos legadas e simuladores removidos precisam política de retenção antes de qualquer exclusão.

## 18. Recomendações preliminares para Edu Café Flow

1. Consolidar origin/main, linha Desktop e checkout; separar mudanças em commits revisáveis.
2. Confirmar ambiente/ledger de migrations só com um contexto de leitura seguro; não inferir produção pelo build.
3. Projetar papéis superuser, pending, aprovado; dono de turma e tratamento de conteúdo existente antes de abrir cadastro docente.
4. Aplicar isolamento server-side em endpoint, repository e objetos, não apenas filtro de UI; testar professor A contra ID de professor B.
5. Definir armazenamento/rotação de segredos e ambientes separados, sem copiar valores ao chat/Git.
6. Separar testes unitários, PostgreSQL descartável, browser E2E e instalador; excluir dist/.next dos testes.
7. Rebranding em camadas: UI primeiro, contratos técnicos com plano de compatibilidade.
8. Preservar arquivo/dados legados e manter escopo offline pequeno até homologação.

## 19. Decisões pendentes do responsável

- Branch base única: origin/main, codex/desktop-offline-phase1 ou integração?
- Quando e como CaféFlow Pocket vira Edu Café Flow; qual logo/domínio/tema?
- Campos, verificação, política de aprovação, superusuário inicial, recuperação e escopo do professor.
- Política de acesso/retention para alunos antigos sem senha.
- Owner e permissões das turmas existentes; conteúdo atual será global ou associado a turmas?
- Retenção de imagens/arquivos e eventual object storage.
- Ambientes dev/staging/prod distintos.
- Destino dos assets/simuladores removidos localmente e dados fotográficos legados.
- Critério de aceite, assinatura e atualização do Desktop Windows.

## 20. Conclusão: onde o projeto parou

Snapshot ativo: Web compilável, identidade transitória CaféFlow Pocket, autenticação nova de aluno dependente do pepper, portal docente global com credenciais de ambiente, turmas/atividades/InstaLab/economia e Apresentações em branches diferentes. Desktop offline tem fluxo de Missões e sincronização em implementação/homologação, mas a instalação Windows não tem evidência de inicialização aprovada. Deploy e banco real não foram confirmados.

A transformação para Edu Café Flow deve começar pela consolidação do código e decisões explícitas de contas, ownership e dados legados. Nenhuma dessas decisões foi implementada nesta auditoria.

## 21. Localizadores de evidência

Os intervalos abaixo permitem conferir rapidamente as conclusões centrais. Rotas/telas e APIs também foram contadas mecanicamente por arquivos; contratos detalhados continuam nos handlers.

| Conclusão | Evidência |
|---|---|
| Versões/scripts da árvore local | package.json:2-35; package-lock.json root e pacote Next |
| Next config, headers e ausência de agentUpgrade | next.config.ts:1-30 |
| Cadastro aluno e erro do pepper | src/app/api/students/route.ts:56-86; src/server/student-credentials.ts:21-25; src/server/validation.ts:29-33 |
| Login CPF/e-mail e consulta | src/app/api/session/route.ts:35-55; src/server/repository.ts:476-501 |
| Sessão aluno e cookie | src/server/session.ts:1-57 |
| Professor estático/session HMAC | src/server/teacher-auth.ts:24-132; src/app/api/teacher/session/route.ts:21-57 |
| Sem turma, UI redirect/gate | src/components/AppShell.tsx:40-58, 102-113; src/app/api/me/route.ts:15-32 |
| Classe sem owner docente | db/migrations/007_module_forms_and_classes.sql:42-53 |
| Roster/listagem docente global | src/server/repository.ts:655-726; src/app/api/teacher/students/route.ts:9-18; src/app/api/teacher/classes/route.ts:10-30 |
| Turma e colegas de aluno | src/server/repository.ts:746-783; src/app/api/student/classes/route.ts:11-45 |
| Password hashes e CPF digest | src/server/student-credentials.ts:4-45; db/migrations/018_student_password_accounts.sql:1-47 |
| TLS/Pool PostgreSQL | src/server/db.ts:8-45; scripts/migrate.mjs:12-63 |
| InstaLab rewards/campaign data | db/migrations/013_instalab_economy_and_campaigns.sql; src/domain/instalab-economy.ts:1-22 |
| Apresentação/versionamento | db/migrations/016_presentations.sql:1-41; src/server/presentations.ts:41-166 |
| Desktop local tables/outbox | src/server/desktop/store.ts:100-212 |
| Desktop isolation/startup | electron/main.cjs:54-207; electron/preload.cjs:1-3 |
| Backend HTTPS identity | src/server/desktop/config.ts:1-17; src/server/desktop/backend.ts:141-239; src/app/api/desktop/identity/route.ts:6-12 |
| Desenvolvimento, build, testes | package.json:6-35; scripts/desktop-flow-check.mjs |
| Estado histórico Desktop/editor/contas/rebrand | docs/desktop-offline-audit.md; docs/meta-lab-apresentacoes.md; docs/cafeflow-accounts-scope.md; docs/cafeflow-pocket-rebrand.md |

### Arquivos de referência

package.json, package-lock.json, next.config.ts, vercel.json, compose.yaml, .env.example; src/app/**, src/components/**, src/server/**, src/domain/**; db/migrations/001–018; scripts/migrate.mjs, scripts/build-desktop.mjs, scripts/desktop-flow-check.mjs; electron/main.cjs, preload.cjs, electron-builder.config.cjs; docs/desktop-offline-audit.md, docs/meta-lab-apresentacoes.md, docs/cafeflow-accounts-scope.md, docs/cafeflow-pocket-rebrand.md, README.md.
