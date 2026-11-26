# Edu Café Flow — consolidação local

Atualizado em 26/11/2026. Esta documentação descreve o código local na branch `codex/desktop-offline-phase1`.

## Estado inicial

- O checkout já tinha alterações locais extensas, incluindo contas docentes pendentes de homologação, apresentações, Desktop Offline e rebranding. Essas alterações foram preservadas.
- A migration 019 existe no repositório, mas não foi aplicada nesta etapa. Não houve conexão com PostgreSQL nem alteração de dados remotos.
- O Fórum não tinha implementação identificável antes desta etapa.
- A experiência de Entregas exigia arquivo e data digitada pelo aluno; a identidade do InstaLab e publicações dependiam de empresa.

## Implementado no código

### Autenticação docente

- `src/server/teacher-auth.ts` não valida mais cookies ou credenciais docentes legadas. O cookie antigo é apagado no logout.
- `/api/teacher/session` autentica exclusivamente com contas, estado ativo e sessão revogável do banco. Não existe fallback para variáveis de ambiente.
- `.env.example` não sugere mais credenciais docentes antigas.
- Rotas de Apresentações passaram a usar a sessão docente no banco. Professor comum só lista ou altera apresentações criadas por ele ou associadas exclusivamente a turmas sob sua responsabilidade; administrador conserva o acesso global. Apresentações legadas sem vínculo continuam preservadas e acessíveis apenas ao administrador.
- O procedimento explícito de provisionamento do primeiro administrador permanece em `scripts/bootstrap-teacher-admin.mjs`; ele não roda no boot e não cria um administrador fictício.

### Navegação, perfil e turma

- A navegação do aluno agora lista Central, Meu Perfil, Minha Turma, Missões, InstaFlow, Entregas e Fórum. Apresentações foram retiradas do menu do aluno; páginas, assets e editor foram preservados. O módulo de sincronização continua visível apenas no Desktop.
- `/meu-perfil` usa nome e e-mail existentes, avatar já armazenado e um campo de descrição pessoal. Nome, e-mail e identificadores não são editáveis nessa primeira versão. `/empresa` redireciona para compatibilidade; tabelas e dados empresariais continuam intactos.
- Minha Turma exibe o código e o professor responsável quando atribuído. A troca por código permanece disponível; não há ação de sair. O histórico de matrícula é registrado pela migration 020 e pelas operações de matrícula de aluno/professor.
- A leitura de turma mantém compatibilidade com bancos anteriores à 019: sem a nova estrutura, a interface informa que ainda não há professor atribuído em vez de inferir um.

### Missões, Entregas e Central

- A tela Web de Missões consome atividades do painel docente. O endpoint Web exclui módulos sem turma vinculada; o endpoint local usado pelo Desktop foi preservado.
- Entregas agora aceitam texto, arquivo ou ambos, com missão opcional. A data/hora usada é `NOW()` do servidor. A página mostra entregas independentes, arquivos e respostas de formulários de Missão da Turma no histórico.
- A Central usa turma, missões publicadas e entregas reais. Não calcula progresso baseado no currículo estático antigo.
- Entregas capturam a turma no envio. A consulta docente usa a turma registrada ou o histórico da matrícula ao resolver registros legados.

### InstaFlow e Fórum

- A interface pública passou a chamar a rede de InstaFlow e apresenta a identidade pessoal. Curtidas, comentários, edição/exclusão própria, avatar, saldo e anúncios existentes continuam usando os registros atuais.
- Uma publicação pode ser criada sem empresa após a migration 020 permitir `business_id` nulo. Dados empresariais e campanhas antigas não foram removidos; criação de campanhas ainda segue o fluxo financeiro empresarial existente.
- Foi criado um Fórum inicial separado do feed: tópicos, respostas, acesso restrito à turma, exclusão pelo autor e moderação/exclusão por professor responsável ou administrador.

### Missão Relâmpago

- A página antiga redireciona para Missões e seus endpoints de aluno/professor respondem `410 Gone`. Tabelas e entregas históricas permanecem. O painel docente ainda mostra registros antigos identificados como históricos.

## Migration proposta

`db/migrations/020_student_experience_consolidation.sql` é aditiva e **não foi executada**. Ela depende da migration 019 e:

- cria histórico de vínculos aluno–turma e inicializa a turma atual existente sem apagar atribuições;
- permite texto ou arquivo em novas Entregas e grava `class_id` e `mission_id` opcionais;
- cria tabelas do Fórum;
- adiciona descrição pessoal ao aluno;
- torna opcional o vínculo empresarial nas novas publicações sociais;
- adiciona `created_by` a apresentações para delimitar a gestão por professor.

Não houve teste de execução SQL, rollback nem validação de constraints em PostgreSQL. Aplicação e integridade da migration devem ser verificadas em banco isolado antes de qualquer ambiente real.

## Testes locais

- `npm run typecheck` — passou.
- `npm test` — passou, 28 testes.
- `npm run build` — passou.
- `npm run desktop:build` — passou; gerou runtime standalone para Electron.
- `npm run desktop:test` — passou quando executado fora do sandbox para permitir o loopback `127.0.0.1` do teste.
- Os testes Desktop offline existentes foram preservados. Não foram enviadas respostas acadêmicas a produção.

Os testes executados não comprovam consultas, políticas ou constraints reais da migration 019/020. O build desktop não é instalador Windows; não foi feito teste de instalação.

## Pendências reais / resultado parcial

- Aplicar 019 e 020 primeiro em PostgreSQL isolado e executar testes de autorização para conta pendente, ativa, suspensa, sessão revogada, escopo de turma e histórico de matrícula.
- Homologar Fórum e consultas de Entregas em PostgreSQL isolado; ainda não há UI docente dedicada para responder/apagar respostas individuais do Fórum.
- Completar o ciclo de Missões: prazo opcional de missão e indicação explícita de vencida/encerrada ainda não foram adicionados ao editor docente. Respostas dos formulários são preservadas e exibidas em Entregas; arquivos/textos adicionais podem ser vinculados a uma missão pelo formulário.
- O perfil permite alterar descrição e avatar; edição controlada de nome/e-mail não foi implementada.
- Conferir no PostgreSQL as regras de segurança/trigger existentes para `business_id` nulo em publicação InstaFlow após 020; os testes unitários não cobrem triggers.
- A migração não foi aplicada, não houve deploy, push, acesso à Railway ou uso de dados de produção.

**Classificação:** implementação local parcial; typecheck, testes e builds indicados acima passaram. Homologação de banco e os itens listados continuam pendentes.

## Auditoria de migrations do Railway — 26/11/2026

- Alvo identificado somente para leitura: projeto `metalab`, serviço `Postgres`, ambiente `production`, database `railway`, PostgreSQL `18.6`. A consulta do schema foi executada em transação `READ ONLY`; nenhum dado acadêmico foi consultado.
- O ledger `metalab_schema_migrations` existe e registra `001` a `018`. As únicas migrations pendentes neste checkout são `019_teacher_accounts_and_class_ownership.sql` e `020_student_experience_consolidation.sql`.
- Compatibilidade observada: as tabelas-base afetadas por 019/020 existem; ainda não existem as tabelas de conta/sessão docente, histórico de matrícula e Fórum. `metalab_classes` não tem `responsible_teacher_id`; `metalab_student_deliveries` ainda exige arquivo e data; `metalab_instalab_posts.business_id` é NOT NULL; `metalab_presentations` ainda não tem `created_by`. A estrutura observada corresponde aos pré-requisitos legados descritos pelas migrations.
- Revisão SQL das pendentes: 019 cria tabelas e índices de contas/auditoria e acrescenta FKs/colunas opcionais, sem atribuir turmas antigas nem criar admin. 020 cria histórico/tabelas do Fórum, insere histórico a partir das matrículas atuais, flexibiliza campos de Entregas, substitui checks de Entregas, permite `business_id` nulo e acrescenta perfil/ownership de apresentações. Não há `DROP TABLE`, `TRUNCATE` nem exclusão de linhas nas duas migrations; a substituição de constraints e a alteração de nulabilidade são as mudanças de maior atenção.
- Backup: o Railway lista snapshots manuais de **29/10/2026** e **30/10/2026**, sem expiração informada. Não há agendas de backup, e PITR está desabilitado. Esses snapshots têm quase quatro semanas em 26/11 e não há evidência de restauração testada; portanto não atendem à condição de backup recente e restaurável.
- Resultado: **019 e 020 não foram executadas**. A execução está bloqueada até haver backup recente e evidência de restauração/procedimento de recuperação. Não houve alterações de dados ou deploy.
- Importações `@/server/teacher-auth` e `@/domain/teacher-session-policy`: os arquivos existem e as importações resolvem; `npm run typecheck` passou.
- Validação local após a auditoria: `npm run typecheck` passou; `npm test` passou (28 testes); `npm run build` passou após execução fora do sandbox por erro de permissão (`EPERM`) na pasta local `.next`.
- Endpoints autenticados não foram homologados contra produção: não foi usada sessão de teste docente/aluno e as migrations ainda não foram aplicadas. Continua necessária homologação em PostgreSQL descartável antes de produção.
