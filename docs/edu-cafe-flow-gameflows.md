# GameFlows — Divisão de Casos Especiais

## Estado desta entrega

Implementada a primeira versão funcional do fluxo vertical: um professor cria e valida um caso com 5 a 10 gates, publica para turmas próprias, abre uma sala, inicia a operação, acompanha participantes e resultados; alunos autorizados entram, reconectam, resolvem gates, guardam evidências no dossiê e consultam histórico/ranking. O estado e a pontuação ficam no PostgreSQL.

Migration `023_gameflows_investigations.sql` foi aplicada como DDL aditiva. O destino foi verificado antes e depois em leitura: database `railway`, role `postgres`; antes da aplicação, o histórico estava em `022_academic_grades_and_instaflow_stars.sql` e não existiam tabelas GameFlows; depois, a migration 023 foi registrada e as 15 tabelas esperadas foram encontradas.

## Arquitetura

- Next.js App Router; APIs usam runtime Node, `no-store`, validação Zod e sessão de aluno/docente já existente.
- PostgreSQL guarda modelos, salas, progresso, tentativas idempotentes, evidências, fragmentos, eventos de XP e auditoria.
- Regras puras e schemas em `src/domain/gameflows.ts`.
- Casos e sessões são serviços de servidor em `src/server/gameflows-cases.ts` e `src/server/gameflows-sessions.ts`.
- O painel docente atualiza a sala por polling HTTP a cada 4 segundos; a tela de aluno consulta a sessão a cada 3,5 segundos. PostgreSQL continua como fonte de verdade. Não foi introduzido WebSocket/SSE.
- O Desktop permanece sem alteração: seu AppShell continua redirecionando para as áreas Desktop já suportadas.

## Interfaces

- Aluno: `/gameflows` e `/gameflows/sessoes/[sessionId]`.
- Professor: `/docente/gameflows`, também acessível pelo atalho no painel docente.
- O menu de aluno já contém GameFlows. A autenticação e o vínculo atual do aluno à turma são exigidos pelo AppShell e APIs.

## APIs

### Professor

- `GET/POST /api/teacher/gameflows/cases`
- `GET/PUT /api/teacher/gameflows/cases/[caseId]`
- `POST /api/teacher/gameflows/cases/[caseId]/publish`
- `GET/POST /api/teacher/gameflows/sessions`
- `GET/PATCH /api/teacher/gameflows/sessions/[sessionId]`
- `GET /api/teacher/gameflows/sessions/[sessionId]/ranking`
- `POST /api/teacher/gameflows/sessions/[sessionId]/attempts/[attemptId]/review`

### Aluno

- `GET /api/student/gameflows`
- `GET /api/student/gameflows/history`
- `GET /api/student/gameflows/ranking?classId=...`
- `POST /api/student/gameflows/sessions/[sessionId]/join`
- `GET /api/student/gameflows/sessions/[sessionId]`
- `POST /api/student/gameflows/sessions/[sessionId]/attempts`
- `GET /api/student/gameflows/sessions/[sessionId]/ranking`

## Dados e privacidade

Migration 023 cria tabelas para casos, gates, evidências e suspeitos, publicações, sessões, participantes, progresso, tentativas, fragmentos/contribuições coletivas, eventos de XP, conquistas, eventos de sessão e evidências desbloqueadas.

As respostas aceitas ficam em `private_payload`; dados da tela ficam em `public_payload`. A API de aluno nunca seleciona `private_payload`. Em gates bloqueados, não retorna narrativa, pergunta, explicação, dica ou payload público. A explicação só é retornada depois de concluir o gate. Evidências individuais são liberadas ao concluir o gate correspondente.

Alunos só consultam sessões em que são participantes e só entram em salas de uma turma atualmente autorizada. A sala congela participantes durante o início; não admite novas entradas depois disso, mas admite reconexão para participante registrado enquanto a sessão está ativa/pausada. Professores comuns são limitados às próprias sessões, casos e turmas. Administradores seguem a sessão docente com papel já existente.

## Estados e operações

Estados: waiting, running, paused, completed, ended e cancelled. O início bloqueia a linha da sessão, valida estado e roster, exige 5–10 gates consecutivos, congela roster, cria progresso e distribui fragmentos antes de marcar a sessão como running, em uma transação. A entrada fecha quando inicia. A operação termina automaticamente quando todos concluem o último gate; o professor pode encerrar ou cancelar sala de espera. Encerrar preserva progresso e impede novas tentativas.

Tentativas exigem chave UUID idempotente e são serializadas pela linha da sessão. Existe limite de 15 tentativas por minuto por aluno/gate. O servidor determina XP (máximo configurado até 200), não aceita XP do cliente e grava eventos com chave única. Vereditos ficam pendentes de revisão docente e não são corrigidos por palavras-chave. Desempates: XP, gates concluídos e nome.

No gate coletivo, palavras são distribuídas quando há participantes suficientes; caso contrário, a mensagem é dividida em caracteres não espaçados. Cada participante tem contribuição registrada e a solução só é aceita após todos contribuírem. A sessão não inicia caso a resposta não tenha fragmentos suficientes para o roster. A redistribuição só move fragmentos de participante desconectado há mais de 25 segundos, sem contribuição ou gate concluído; a ação é auditada.

## Pontuação e conquistas

- Resposta correta: até 100 XP.
- Conclusão sem dica: até 20 XP.
- Participação validada em desafio coletivo: até 40 XP adicionais.
- Total limitado pelo máximo configurado no gate.
- Resposta aberta: pontuação escolhida pelo professor até o limite do gate; revisão, nota e XP ficam auditados.
- Conquistas são associadas a gates concluídos e nota de veredito. XP GameFlows não altera notas, InstaFlow ou MetaCoins.

## Gates incluídos

Há configuração e validação de dez tipos: cena, interrogatório, laboratório forense, cifra, colaboração por fragmentos, phishing, linha do tempo, auditoria de IA, dedução e veredito. O Caso 001, “O Arquivo Desaparecido”, é um template editável com conteúdo demonstrativo.

## Limitações conhecidas desta fase

- “Cena do incidente” é uma investigação textual com itens, ainda sem painel de hotspots visuais.
- “Palavras-cruzadas” oferece respostas por pista, ainda sem grade cruzada interativa.
- Suspeitos têm tabela preparada, mas não há editor/entidade visual separada de suspeitos; nomes e depoimentos são configurados nos itens/opções do gate.
- A validação de publicação confirma campos e respostas por tipo, mas ainda não há editor de grafo/dependências entre evidências e gates.
- A sala ao vivo usa polling; não há notificação push. Desconexão é estimada pelo último heartbeat, não por canal persistente.
- Não há botão de solicitação de ajuda do aluno nem catálogo de eventos narrativos preparados (reviravolta, evidência adicional). O professor pode publicar comunicados e dicas.
- O editor oferece campos de texto/linhas para itens, opções e respostas, sem pré-visualização isolada de cada gate.
- O ranking da turma agrega XP e gates concluídos de todas as sessões em que houve participação, incluindo operações ativas ou encerradas. A classificação permanece separada de notas e moedas.
- As restrições de copiar/colar são apenas uma preferência local no campo de resposta, não uma barreira de segurança. Validação e pontuação são sempre no servidor.
- Não foram feitas operações acadêmicas de teste na produção nem testes de interface com duas contas reais.

## Arquivos principais

- `db/migrations/023_gameflows_investigations.sql`
- `src/domain/gameflows.ts`
- `src/server/gameflows-cases.ts`
- `src/server/gameflows-sessions.ts`
- `src/app/gameflows/**`, `src/app/docente/gameflows/**`, `src/app/gameflows.css`
- `src/app/api/student/gameflows/**`, `src/app/api/teacher/gameflows/**`
- `src/components/AppShell.tsx`, `src/app/docente/painel/teacher-panel.tsx`, `src/app/layout.tsx`
- `tests/gameflows-policy.test.mjs`

## Testes e próximos passos

Os testes unitários cobrem o caso demonstrativo, configuração 5–10, validações por tipo, normalização, ordenação, fragmentos para diferentes quantidades e transições de estado. `npm run typecheck`, `npm test` (38 testes) e `npm run build` passaram. Integração visual/multiusuário ainda precisa de homologação com contas e turma de teste autorizadas.

### Correção de erro ao registrar XP

Em 27/11/2026 foi corrigido `42P08` no registro de resposta correta: consultas de XP usavam o mesmo placeholder PostgreSQL para `gate_id` (UUID) e `source_key` (texto), deixando o tipo do parâmetro ambíguo. Agora são parâmetros separados. A opção de liberar copiar/colar foi removida do aluno; os campos de resposta mantêm os bloqueios de copiar, recortar, colar e arrastar.

Próxima etapa recomendada: publicar somente após revisão do diff e depois homologar com uma turma de teste, verificando entrada concorrente, reconexão, avaliação do veredito, redistribuição e encerramento. O instalador Desktop e o backend Desktop não foram alterados. Nenhum deploy, commit ou push faz parte desta entrega.
