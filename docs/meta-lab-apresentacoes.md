# MetaLab Apresentações — implementação inicial

Data: 29 de outubro de 2026
Escopo: fundação Web, biblioteca e visualizador. A aplicação Desktop, Electron e SQLite não foram alterados como parte deste módulo.

## Arquitetura adotada

- O documento é JSON versionado (`schemaVersion: 1`) com tela 1280×720, slides ordenados, elementos, temas e referências a anexos.
- `src/domain/presentations.ts` é o contrato Zod compartilhado por validação e renderização. Campos desconhecidos são rejeitados. Texto é renderizado pelo React como texto normal; nenhum HTML ou JavaScript da apresentação é injetado no DOM.
- `src/server/presentations.ts` isola as consultas e transações PostgreSQL do editor e das páginas.
- As Route Handlers `/api/presentations` e `/api/presentations/[presentationId]` verificam a sessão no servidor. Professores administram a biblioteca; alunos só listam e abrem apresentações publicadas e associadas à turma em que estão matriculados.
- A migration `db/migrations/016_presentations.sql` cria documentos, associação a turmas e snapshots de revisão. A aplicação usa comparação de `revision` para detectar atualizações concorrentes. Snapshots são limitados aos 50 mais recentes por apresentação.
- A remoção da biblioteca é lógica (`deleted_at`), preservando snapshots; turmas são associadas por IDs validados no servidor.
- `SlideRenderer` é o componente comum de renderização, usado em miniaturas e na área de visualização, permitindo reutilização pelo editor futuro.

## Entregue nesta etapa

- Biblioteca de apresentações para professor e aluno.
- Criação de rascunho com capa inicial 16:9, renomeação, duplicação, publicação/recolhimento e remoção lógica.
- Vínculo de publicação a uma ou mais turmas. Rascunhos sem turma permanecem privados para alunos.
- Visualizador com miniaturas, navegação por teclado, tela cheia e controles anterior/próximo.
- Respostas claras para schema ainda não migrado; validação de UUIDs e conteúdo JSON; proteção same-origin em operações de escrita.
- Migration 016 criada, **não executada**. Não houve conexão ou escrita em PostgreSQL, migração de produção, deploy ou push.

## Arquivos desta implementação

- `src/domain/presentations.ts`
- `src/server/presentations.ts`
- `src/app/api/presentations/route.ts`
- `src/app/api/presentations/[presentationId]/route.ts`
- `src/app/apresentacoes/**`
- `src/app/docente/apresentacoes/**`
- `src/components/presentations/SlideRenderer.tsx`
- `src/components/AppShell.tsx`
- `src/app/docente/painel/teacher-panel.tsx`
- `src/app/layout.tsx`, `src/app/presentations.css`
- `db/migrations/016_presentations.sql`
- `scripts/presentations-document.test.mjs`

## Validação

- `npm run typecheck`: passou.
- `npm test`: passou, 21 testes; inclui validação de documento inicial, rejeição de propriedades executáveis/desconhecidas e referências de imagem sem anexo.
- `npm run build`: passou após repetir fora do sandbox, pois a primeira tentativa foi bloqueada com `EPERM` ao criar diretório de build.
- Build lista as páginas `/apresentacoes`, `/apresentacoes/[presentationId]`, `/docente/apresentacoes`, `/docente/apresentacoes/[presentationId]` e as duas Route Handlers.
- Não foi executado teste integrado de PostgreSQL nem aplicado migration; precisa ser validado primeiro em banco de desenvolvimento/homologação.

## Pendências antes de considerar o módulo completo

- Aplicar a migration 016 apenas em banco de desenvolvimento/homologação e testar as rotas com professor, aluno matriculado, aluno sem turma e turma não autorizada.
- Implementar editor visual: seleção, mover/redimensionar, ferramentas, camadas, formas/imagens, desfazer/refazer e atalhos.
- Implementar salvamento automático do documento com debounce, recuperação de rascunho e UI de conflitos. A concorrência otimista já está modelada para escritas do documento na API futura, mas ainda não há editor que salve slides editados.
- Implementar upload/armazenamento protegido de imagens e validação de conteúdo binário. A forma `image` está reservada no esquema; a UI atual exibe placeholder e não aceita anexos.
- Expor versões e restauração no histórico visual.
- Exportar para PDF/imagens e executar testes de tela cheia, responsividade, acessibilidade e integração real.
- Integrar apresentações a aulas e missões somente após validar os modelos e contratos existentes.
- Não há suporte offline, sync, elementos 3D, gráficos, questionários interativos ou embeds externos nesta fase.

## Rollback

Reverter os arquivos Web desta etapa e, se a migration 016 tiver sido aplicada em algum ambiente de teste, remover os objetos correspondentes somente após backup e confirmação desse ambiente. A migration não foi aplicada nesta execução, então nenhum rollback de banco é necessário.
