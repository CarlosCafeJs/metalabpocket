# Edu Café Flow — implementação local da área docente

## Estado e limites

Esta é uma implementação local sobre o checkout `codex/desktop-offline-phase1`, que já continha alterações não commitadas de Desktop, cadastro de alunos, marca e Apresentações. As alterações foram preservadas. Não houve consulta ou modificação ao PostgreSQL, aplicação de migrations, deploy, commit ou push.

A estratégia de integração e os conflitos conhecidos estão em [edu-cafe-flow-integration-strategy.md](./edu-cafe-flow-integration-strategy.md). O checkout e a ref local `origin/main` continuam divergentes; não foi feito fetch nem integração de branches.

## O que foi implementado

- Contas docentes PostgreSQL com CPF indexado por HMAC (`EDU_TEACHER_CPF_PEPPER`), senha com scrypt e estado `pending`, `active`, `rejected`, `suspended` ou `disabled`.
- Solicitação pública de cadastro com nome, CPF, e-mail, senha e confirmação. O cadastro sempre cria professor pendente e não inicia sessão.
- Login por e-mail ou CPF, sessão opaca revogável no banco e verificação do estado atual em cada requisição. A aprovação permite login; suspensão, rejeição e desativação negam sessões e revogam sessões ativas.
- Aprovação, suspensão e desativação por administrador autenticado, com registro de auditoria. O provisionamento do primeiro administrador é manual e idempotente via `npm run teacher:bootstrap-admin`; não há conta privilegiada criada na inicialização.
- Responsável docente opcional para turmas e atribuição explícita pelo administrador. Turmas existentes começam sem responsável. As consultas de turmas, alunos, perfil, histórico, Missão da Turma e InstaFlow filtram professores comuns pelo responsável da turma; operações globais de anúncios e economia exigem administração.
- Menu docente com “Perfil dos Alunos” e “InstaFlow”. Missão Relâmpago deixa de estar disponível funcionalmente; dados e tabelas antigos não são apagados.
- Novas rotas de cadastro, administração de contas e associação de turmas. O login antigo por variáveis de ambiente foi removido; cookies antigos não autenticam e só são removidos no logout. A conta administrativa do banco não é criada automaticamente.

## Migração e configuração

`db/migrations/019_teacher_accounts_and_class_ownership.sql` é aditiva e ainda não foi aplicada. Cria contas, sessões, auditoria e colunas opcionais de responsabilidade de turma/escopo de módulo. Não transfere turmas antigas, alunos ou entregas. Antes de aplicar em qualquer ambiente, confira o ledger e o schema do destino, faça backup e confirme que `019` não foi aplicada por outro checkout.

O nome atual recomendado do segredo é `EDUCAFE_TEACHER_CPF_PEPPER`; o alias anterior `EDU_TEACHER_CPF_PEPPER` continua sendo aceito temporariamente para a transição. Configure no servidor, sem expor ao navegador:

- `EDUCAFE_TEACHER_CPF_PEPPER`: segredo aleatório com pelo menos 32 bytes, igual em todas as instâncias que compartilham as contas.
- `DATABASE_URL`: conexão PostgreSQL.

Para criar o admin inicial, depois de aplicar a migration no ambiente autorizado, informe `EDUCAFE_TEACHER_ADMIN_NAME`, `EDUCAFE_TEACHER_ADMIN_CPF`, `EDUCAFE_TEACHER_ADMIN_EMAIL` e `EDUCAFE_TEACHER_ADMIN_PASSWORD` apenas no ambiente seguro do comando. Os nomes anteriores `EDU_TEACHER_ADMIN_*` também são aceitos temporariamente. A senha precisa ter ao menos 12 caracteres. O script não imprime os valores. O bootstrap não foi executado nesta tarefa.

## Arquivos principais desta implementação

- `db/migrations/019_teacher_accounts_and_class_ownership.sql`
- `src/domain/teacher-account-policy.ts`
- `src/server/teacher-accounts.ts`, `src/server/teacher-auth.ts` e `src/server/repository.ts`
- `src/app/api/teacher/register/route.ts`, `session/route.ts`, `admin/accounts/route.ts`, `admin/classes/route.ts`
- `src/app/docente/aprovacoes/page.tsx` e `src/app/docente/painel/teacher-panel.tsx`
- `scripts/bootstrap-teacher-admin.mjs`, `tests/teacher-account-policy.test.mjs`, `.env.example` e `package.json`

Vários arquivos preexistentes do checkout também foram adaptados para autorização por turma. Revise o `git diff` completo antes de integrar, porque a árvore já tinha mudanças anteriores fora desta implementação.

## Validação local

- `npm run typecheck`: passou.
- `npm test`: passou, 26 testes. Inclui CPF docente e transições de estado; não é uma prova integrada de autorização PostgreSQL.
- `npm run build`: passou, incluindo as rotas docentes no build Web.
- `npm run desktop:build`: passou e gerou o runtime standalone local usando Next 16.4.6.
- `npm run desktop:test`: passou usando backend mock e SQLite temporário. A execução inicialmente encontrou casos de teste com o contrato antigo de cadastro de aluno; os payloads de cadastro/login foram atualizados e o fluxo validou resposta offline após reinício, reautorização e retry sem duplicação.
- Não foi executado teste integrado com PostgreSQL descartável, navegador ou ambiente Windows instalado. Não declarar autenticação ou isolamento validados em execução real até realizar esses testes.

## Pendências para homologação

1. Consolidar a branch correta de Web/Apresentações com a linha Desktop, preservando cada alteração.
2. Aplicar `019` apenas no banco de homologação após conferir o schema e testar backup/restauração.
3. Provisionar o admin inicial em homologação e testar cadastro, aprovação, login, suspensão e revogação.
4. Criar duas contas docentes e turmas de teste; tentar explicitamente acesso cruzado a alunos, eventos, entregas, módulos e publicações.
5. Corrigir/alinha o runtime standalone usado por `desktop:test` e repetir regressão offline.
6. Fazer revisão de segurança e regressão de InstaFlow, anúncios e Apresentações antes de qualquer implantação.
7. Migrar explicitamente as turmas legadas na interface administrativa. Nenhuma foi atribuída automaticamente.

Não publique a aplicação antes de reconciliar branches e validar as migrations e o fluxo em banco descartável.
# Consolidação de 26/11/2026

O helper de autenticação legado foi desativado localmente. Credenciais de ambiente e os formatos antigos de cookie não concedem mais sessão nem autorização administrativa; o logout continua removendo o cookie antigo. A rota `/api/teacher/session` usa exclusivamente as contas docentes persistidas e retorna mensagem clara se a estrutura da migration 019 não estiver disponível.

O provisionamento inicial permanece explícito em `scripts/bootstrap-teacher-admin.mjs`, fora do boot normal. A migration 019 não foi executada durante esta etapa. Consulte [o relatório de consolidação](./edu-cafe-flow-consolidation.md) para o escopo de segurança e validação pendente.
