# Edu Café Flow — contexto técnico para transferência

**Snapshot:** 25/11/2026. Repositório local em C:\Users\La e Car\Desktop\metalab-virtual.
Este resumo descreve o sistema observado antes de definir os requisitos futuros de Edu Café Flow. Não inventa a nova visão de produto.

## 1. O que é hoje

CaféFlow Pocket é uma plataforma educacional Web para estudantes e professores. Organiza turmas, desenvolvimento de pequenos negócios, missões, atividades, entregas, rede social de turma InstaLab e apresentações didáticas. Existe também um cliente Windows Electron com foco restrito em Missões offline.

A mudança para **Edu Café Flow** é uma decisão de nome/posicionamento ainda não aplicada. O repositório, cookies, variáveis e dados mantêm identificadores MetaLab por compatibilidade. A auditoria não renomeou código nem mudou funcionalidades.

## 2. Repositório/Git

- Branch ativa: codex/desktop-offline-phase1; HEAD e27865d (feat(web): add presentations library and viewer), alinhado à ref local origin/codex/desktop-offline-phase1.
- main local 561254e; origin/main local 6a54dc4, com editor de Apresentações e aula Canva. As linhas divergiram: HEAD Desktop tem commits 526a746/e27865d, que não estão na ref local origin/main.
- Branch codex/next-security-upgrade commit 32758c0 existe numa worktree; não é push nem deploy.
- No início da auditoria havia 94 entradas não commitadas (43 modificadas, 36 removidas, 15 não rastreadas), incluindo editor, migrations 017/018, novo cadastro aluno, branding, alterações Electron e remoções locais dos simuladores.
- Refs origin/* são cópias disponíveis localmente, não confirmação do servidor. Nenhum fetch foi feito.
- Contagem: 16 páginas, 56 arquivos de rotas API, 85 handlers HTTP, 18 migrations, 34 tabelas declaradas, 12 módulos agrupados.

## 3. Stack e arquitetura

- Node 24.21.0; Next 16.4.6 instalado/local (package range ^16.4.6, alteração não commitada; HEAD rastreado tinha 16.4.2); React 19.3.1; TypeScript 7.0.2; Zod 4.6.7; pg 8.23.1; Electron 45.1.0; electron-builder 26.18.0.
- Frontend: Next App Router em src/app, componentes React em src/components, estado aluno em src/hooks/useStudentState.ts.
- APIs: Route Handlers em src/app/api; domínio em src/domain; persistência em src/server.
- Web usa PostgreSQL via pg, TLS validado por padrão. SQLite só no Desktop via node:sqlite.
- npm run build usa Next Webpack; npm run dev usa Turbopack. vercel.json indica Next. compose.yaml define PostgreSQL 16 de teste em loopback. Não há script lint.

## 4. Módulos existentes

1. Acesso e sessão: cadastro/login aluno; professor autenticado por variáveis de ambiente.
2. Central/turmas: dashboard do aluno, código de turma, colegas.
3. Minha Empresa: perfil de negócio.
4. Missões curriculares: cinco módulos, atividades, evidência e progresso.
5. Missões Relâmpago: desafios curtos do professor.
6. Formulários de sala: módulos, missões, tarefas e respostas.
7. Entregas e histórico: arquivos submetidos e linha do tempo docente.
8. InstaLab: posts da turma, imagens, curtidas, comentários, perfil e moderação.
9. Economia InstaLab: MetaCoins, carteira, recompensas, campanhas patrocinadas e cobrança por intervalos.
10. Apresentações: biblioteca, viewer, editor em branch/checkout, anexos e versões.
11. Central docente: estudantes, turmas, progresso, moderação, atividades e relatórios.
12. Desktop offline: Electron, Next local, SQLite, snapshots/outbox e sincronização de Missões.

### Páginas da árvore de trabalho

/, /dashboard, /empresa, /turmas, /missoes, /missoes-relampago, /entregas, /instalab, /instalab/profissional, /apresentacoes, /apresentacoes/[presentationId], /docente/painel, /docente/apresentacoes, /docente/apresentacoes/[presentationId], /docente/apresentacoes/[presentationId]/editar, /sincronizacao.

Rotas de câmera, celular, Kit Digital, estúdio e public/simulator/** foram removidas somente no checkout não commitado; permanecem no HEAD/histórico. Não assumir que saíram da produção.

## 5. Usuários e fluxos

### Aluno

Cadastro local presente: nome, e-mail, data de nascimento, CPF e senha mínima de 12 caracteres. CPF normalizado e armazenado como HMAC-SHA-256; senha protegida com scrypt/salt; sessão aleatória com token hash no banco. Login aceita CPF ou e-mail. Depois do login, aluno precisa entrar em turma por código para abrir a formação; AppShell redireciona/oculta telas enquanto não matriculado.

**Bloqueio local:** METALAB_STUDENT_CPF_PEPPER não estava definida em .env.local nem .env; cadastro e login por CPF falham sem ela. Produção não foi verificada. É segredo server-side; instâncias no mesmo banco precisam usar o mesmo valor.

### Professor

Login em /docente/painel por credenciais estáticas de ambiente e cookie HMAC de seis horas. Não existe signup docente, aprovação superuser, tabela de professores ou owner de turma. APIs e queries são globais para qualquer conta teacher configurada. O novo modelo exigirá isolamento.

### Desktop

Electron inicia Next standalone em loopback; safeStorage protege chave de dados; SQLite armazena provisionamento, snapshot, respostas/outbox, preferências e histórico. Online valida backend HTTPS e identidade de protocolo. Respostas são sincronizadas idempotentemente; autorização expira em sete dias e precisa reautenticar/revalidar vínculo. Apenas Missões funcionam offline.

## 6. Banco de dados

PostgreSQL via DATABASE_URL; scripts/migrate.mjs aplica migrations ordenadas. 18 migrations definem 34 tabelas:

- Fundação: metalab_students, metalab_student_sessions, metalab_businesses, metalab_mission_progress.
- Fotos/entregas: metalab_student_photos, metalab_student_deliveries.
- Missões: metalab_quick_missions, metalab_quick_modules, metalab_teacher_modules, metalab_teacher_missions, metalab_teacher_tasks, metalab_teacher_task_submissions.
- Turmas: metalab_classes, metalab_student_class_assignments.
- InstaLab/economia: posts, likes, comments, settings/events, wallet entries, daily claims, security events, campaigns/events/impressions/charges e like reward claims.
- Histórico: metalab_student_activity_events.
- Desktop: metalab_desktop_provisions, metalab_desktop_sync_operations.
- Apresentações: metalab_presentations, metalab_presentation_classes, metalab_presentation_versions, metalab_presentation_assets.

Migrations 017/018 estão não commitadas no checkout. Docs dizem historicamente que foram aplicadas no Railway; auditoria não consultou schema/ledger. Não rodar migration baseando-se só nesses documentos.

SQLite local tem nove tabelas: schema migrations, provisions, snapshots, outbox, secrets, preferences, runs, history e locks. Tokens/segredos cifrados.

## 7. Autenticação, segurança e riscos

- Sessão aluno: cookie metalab_session, HttpOnly, SameSite=Lax, Secure prod; token guardado como hash.
- Senha aluno: scrypt; CPF HMAC via METALAB_STUDENT_CPF_PEPPER.
- Sessão professor: metalab_teacher_session, HMAC, SameSite=Strict/Secure prod; credenciais env.
- Mutations usam Zod e same-origin em geral; queries parametrizadas no repository; TLS Postgres validado por padrão.
- **Risco chave para o novo produto:** metalab_classes não guarda owner teacher; listTeacherStudents/listTeacherClasses são globais. Auto cadastro docente com acesso por turma exige owner e autorização server-side em todos endpoints com IDs.
- Rate limit docente é em memória, não distribuído.
- Imagens/entregas/apresentações são armazenadas como BYTEA no PostgreSQL.
- Nenhuma vulnerabilidade SQL/CSRF/TLS foi comprovada; não houve pentest/SAST.

## 8. Migrations, produção e deploy

Auditoria não consultou dados pessoais/banco, não executou migrations, deploy ou push. README tem Vercel Next; Railway aparece em docs/config. Branch publicada e versão real não verificadas. .env.local/.env foram inspecionados apenas por presença, sem conteúdo/host.

Docs relatam historicamente 015 Desktop, 017 assets e 018 password accounts no Railway, mas não são estado atual. Reconfirmar ledger em ambiente seguro antes de escrita.

## 9. Apresentações

Biblioteca/viewer no HEAD; editor em origin/main e checkout. Documento tem schema versionado, revisão otimista e snapshots; assets JPEG/PNG/WebP são validados e armazenados no banco. Aula Canva de 20 slides é editável, sem captura real. PDF chama impressão do browser; não há export PPTX/PNG nem UI confirmada de restauração de versão. Testes unitários não equivalem a E2E/autorização real.

## 10. Estado Desktop

Código contém electron/main.cjs, preload mínimo, sandbox/context isolation, Next standalone, SQLite, backend HTTPS validado contra SSRF/identidade, outbox, histórico e Central. docs/desktop-offline-audit.md registra que instalação/atualização NSIS falhou ao abrir em ensaio anterior; causa desconhecida. Nenhum build/install Windows nesta auditoria; distribuição não aprovada.

## 11. Qualidade verificada

- npm run typecheck: passou.
- npm test: 23 aprovados, zero falhas; incluiu next-test.js interno em dist e warnings ESM.
- npm run build: passou com Next 16.4.6. Primeira tentativa teve EPERM em .next no sandbox; repetição local concluiu.
- desktop:test/build/dist:win, E2E browser, banco, migrations e produção não testados.
- Testes cobrem entrada aluno, imagem InstaLab, economia, documento slides, diagnóstico Electron e validação backend URL/DNS/TLS.

## 12. Dívidas/próximos cuidados

1. Consolidar branch atual, origin/main e checkout; escolher base.
2. Projetar roles superuser/pending/approved e ownership antes de habilitar cadastro docente.
3. Aplicar isolamento por turma em todas APIs/queries, não só UI.
4. Configurar pepper sem expô-lo e confirmar consistência entre serviços do mesmo banco.
5. Separar dev/staging/prod e confirmar migrations em modo seguro.
6. Homologar Desktop Windows: instalação, upgrade, inicialização e encerramento.
7. Testar Apresentações E2E, upload/autorização, concorrência e impressão.
8. Excluir dist da busca de testes e alinhar README/.env.example.
9. Preservar dados legados; remoção de UI não autoriza apagar linhas.
10. Planejar marca em camadas e preservar contratos técnicos.

## 13. Decisões pendentes

- Qual branch será fonte única?
- Quando CaféFlow Pocket passa a Edu Café Flow e com qual marca/domínio?
- Quem será superusuário e como signup docente é validado/aprovado/revogado?
- Como turmas atuais recebem owner e qual conteúdo é global?
- Política de alunos legados sem senha e retenção de arquivos?
- Ambientes e dados de homologação separados de produção?
- Critérios de assinatura/aceite do Desktop?

## 14. Arquivos centrais

- src/server/repository.ts, teacher-auth.ts, session.ts, student-credentials.ts, validation.ts, db.ts
- src/server/desktop/**, src/server/presentations.ts
- src/domain/curriculum.ts, mission-evaluation.ts, instalab-economy.ts, presentations.ts
- src/app/api/**, src/app/docente/**, src/app/apresentacoes/**, src/components/AppShell.tsx, StudentEntry.tsx
- db/migrations/001–018, scripts/migrate.mjs
- electron/main.cjs, electron/preload.cjs, electron-builder.config.cjs
- docs/desktop-offline-audit.md, docs/meta-lab-apresentacoes.md, docs/cafeflow-accounts-scope.md, docs/cafeflow-pocket-rebrand.md, README.md

**Resumo:** Web é ampla e compilável, porém checkout está não commitado e não idêntico a branch publicada. Cadastro docente multi-tenant não existe. Desktop é implementação parcial sem homologação de instalação Windows. Edu Café Flow aguarda requisitos além do nome.
