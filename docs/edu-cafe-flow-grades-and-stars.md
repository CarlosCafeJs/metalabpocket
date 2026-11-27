# Edu Café Flow: notas privadas e estrelas no InstaFlow

## Escopo

Esta etapa acrescenta avaliações acadêmicas privadas às entregas e respostas de Missão da Turma, além de avaliações docentes de uma a cinco estrelas no InstaFlow. Não altera MetaCoins, campanhas, operações offline, contratos de matrícula nem conteúdo publicado na Web.

## Regras de acesso

- A API docente exige uma sessão de conta aprovada e ativa.
- Professores só consultam e avaliam atividades de turmas sob sua responsabilidade; administradores ativos mantêm o escopo global.
- A identificação do aluno, da turma e da atividade é derivada do registro de destino no banco, nunca aceita do corpo da requisição.
- Um professor só pode editar a própria avaliação. O administrador pode corrigir avaliações de outros docentes; todas as mudanças de nota e estado ficam no histórico.
- A API estudantil deriva o aluno da sessão ativa e lista apenas avaliações publicadas desse aluno. Rascunhos não são expostos.
- Cada professor tem no máximo uma avaliação por publicação. A alteração e remoção são registradas em histórico; o feed estudantil mostra apenas média e quantidade, sem expor quem avaliou.
- Operações de escrita verificam origem, sessão e escopo no servidor. Respostas usam `Cache-Control: no-store`.

## Estrutura

- Migração aditiva `db/migrations/022_academic_grades_and_instaflow_stars.sql` cria avaliações, histórico, estrelas, histórico de estrelas e índices/FKs. Não apaga nem reescreve os registros acadêmicos existentes.
- `metalab_academic_evaluations` guarda notas de 0 a 10, valor máximo, devolutiva, rascunho/publicação e vínculo a uma entrega ou resposta da turma.
- `metalab_academic_evaluation_history` registra criação, alteração, publicação e retirada de publicação.
- `metalab_instalab_post_ratings` guarda uma nota por professor/publicação; `metalab_instalab_post_rating_history` preserva mudanças inclusive se o post for removido por moderação.
- APIs: `POST /api/teacher/evaluations`, `GET /api/student/grades`, `PATCH/DELETE /api/teacher/instalab/[postId]/rating`.
- Interface docente: editor de nota no acompanhamento do aluno e controle de estrelas na Rede das Turmas.
- Interface estudantil: página Minhas Notas e média/quantidade de estrelas nos posts acessíveis da turma.

## Arquivos desta funcionalidade

- `db/migrations/022_academic_grades_and_instaflow_stars.sql`
- `src/domain/academic-grade-policy.ts`
- `src/domain/instaflow-rating-policy.ts`
- `src/server/academic-evaluations.ts`
- `src/server/instaflow-ratings.ts`
- `src/app/api/teacher/evaluations/route.ts`
- `src/app/api/student/grades/route.ts`
- `src/app/api/teacher/instalab/[postId]/rating/route.ts`
- `src/app/api/teacher/students/[studentId]/route.ts`
- `src/server/repository.ts`
- `src/app/docente/painel/GradeEditor.tsx`
- `src/app/docente/painel/teacher-panel.tsx`
- `src/app/instalab/page.tsx`
- `src/app/notas/page.tsx`
- `src/app/notas/StudentGrades.tsx`
- `src/components/AppShell.tsx`
- `src/app/class-files.css`
- `tests/academic-grade-policy.test.mjs`
- `tests/instaflow-rating-policy.test.mjs`

## Validação

- TypeScript: `npm run typecheck` passou.
- Testes: `npm test` passou com 33 testes, incluindo as novas regras de validação de notas e estrelas.
- Build Web: passou após reexecução com permissão de gravação em `.next`; rotas `/api/student/grades`, `/api/teacher/evaluations` e `/api/teacher/instalab/[postId]/rating` apareceram no build.
- Migração: `022_academic_grades_and_instaflow_stars.sql` aplicada pelo migrador oficial ao banco Railway identificado como `railway`, com TLS verificado. Consulta de leitura confirmou o registro da migration e as quatro tabelas de avaliações/estrelas e seus históricos.
- Integração de banco: os testes automatizados são unitários; nenhuma avaliação ou estrela de teste foi escrita no banco. A primeira consulta de verificação sem a CA do projeto foi rejeitada pelo TLS; repetida com `DATABASE_CA` e `DATABASE_SSL_SERVERNAME`, a leitura confirmou o esquema sem desativar a validação do certificado.

## Pendências

- Validar com contas autorizadas de professor, administrador e aluno em turma de teste: escopo, rascunho, publicação, nota própria e média de estrelas. Não usar dados de produção para submissões de teste.
- Nenhum deploy ou push foi feito.
