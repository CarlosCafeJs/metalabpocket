# MetaLab Apresentações — auditoria e evolução Web

Atualizado em 29 de outubro de 2026. O escopo deste trabalho é exclusivamente Web. Electron, SQLite, sync offline, demais módulos e dados de produção não foram alterados.

## Auditoria do módulo

| Área | Estado | Evidência/limite |
| --- | --- | --- |
| Biblioteca docente e de alunos | Implementado | `/docente/apresentacoes` gerencia materiais; `/apresentacoes` lista somente documentos publicados para a turma do aluno. |
| Visualização e apresentação | Implementado | Miniaturas, setas do teclado, tela cheia e controles de navegação em `PresentationViewer`. |
| Edição de slides | Implementado nesta etapa | Novo editor Web em `/docente/apresentacoes/[presentationId]/editar`: páginas, texto, formas, cores, arrastar, redimensionar, camadas, duplicar/reordenar/excluir slides, desfazer/refazer. |
| Salvamento | Implementado nesta etapa | Autosave com debounce, botão “Salvar agora”, controle otimista por revisão e erro 409 explícito em conflito. Cada gravação cria snapshot e mantém até 50 versões. |
| Imagens | Implementado nesta etapa; migration 017 aplicada | Upload limitado a 10 MB, apenas JPEG/PNG/WebP validados por assinatura binária. Binários ficam em tabela privada; alunos só leem anexos de materiais publicados para sua turma. Limite de 50 anexos por apresentação. |
| Exportação | Parcial | “Exportar PDF” abre o diálogo de impressão do navegador com páginas em paisagem; salvar como PDF depende do navegador. Não há exportação PNG/PPTX nem fidelidade garantida entre fontes/dispositivos. |
| Histórico visual/restauração | Parcial | O servidor registra até 50 snapshots; interface de consultar/restaurar revisões ainda não foi criada. Desfazer/refazer funciona apenas na sessão atual do editor. |
| Aula Canva pronta | Implementada como rascunho gerável | “Criar aula pronta: Canva” cria uma apresentação editável de 20 slides via API, sem publicação automática. Requer tabelas das migrations 016 e 017. A criação do registro da aula no banco não foi executada nesta tarefa. |
| Capturas reais de tela do Canva | Ausente | Os slides usam texto, formas e arte MetaLab. Nenhuma ilustração foi apresentada como captura real do Canva. |
| Testes com PostgreSQL real, contas e navegador | Parcial | O ledger e a presença das tabelas foram verificados em leitura após aplicar a migration 017; não houve gravação de dados de aluno/apresentação nem teste E2E autenticado. |

## Aula criada

Título: **CANVA — Introdução ao Design e à Criação Visual**. O modelo contém 20 páginas: objetivos, acesso supervisionado, interface, formatos, modelos, sequência, texto, fontes, contraste, imagens, upload, composição, revisão, apresentação, exportação, privacidade/direitos, desafio prático, checklist e fontes. É conteúdo introdutório para iniciantes; explica que rótulos e posições da interface podem mudar por idioma, plano e dispositivo. O professor pode alterar o texto e o design antes de liberar.

Orientações da aula foram confrontadas com fontes oficiais atuais do Canva: [adicionar imagens](https://www.canva.com/help/add-images/), [apresentar um design](https://www.canva.com/help/presenting-designs/), [baixar ou salvar designs](https://www.canva.com/help/download-or-purchase/) e [formatos de download](https://www.canva.com/help/download-file-types/). As instruções não incorporam imagens protegidas nem prometem uma posição fixa de controles.

## Arquivos criados/alterados

- `src/app/docente/apresentacoes/PresentationEditor.tsx` e `src/app/docente/apresentacoes/[presentationId]/editar/page.tsx`: editor visual e rota docente.
- `src/app/docente/apresentacoes/TeacherPresentationLibrary.tsx`: atalhos de edição e criação da aula pronta.
- `src/app/api/presentations/[presentationId]/route.ts`: PATCH do documento, validação Zod, limite de corpo e checagem de revisão.
- `src/app/api/presentations/[presentationId]/assets/route.ts` e `[assetId]/route.ts`: envio/serviço de anexos com autorização.
- `src/server/presentations.ts`: gravação transacional do documento e snapshot de revisão.
- `src/domain/canva-lesson.ts`: conteúdo e composição da aula de 20 slides.
- `src/domain/presentation-image.ts`: detecção de assinatura JPEG/PNG/WebP.
- `src/components/presentations/SlideRenderer.tsx` e `src/app/apresentacoes/PresentationViewer.tsx`: renderização autorizada de imagens.
- `src/app/presentations.css`: editor responsivo e impressão em paisagem.
- `db/migrations/017_presentation_assets.sql`: armazenamento privado de imagens; aplicado no PostgreSQL Railway `production` após backup.
- `scripts/presentations-document.test.mjs`: testes do documento da aula e validação de assinatura de imagem.

## Persistência e autorização

As alterações de slides chamam `PATCH /api/presentations/:id` com o documento completo e a revisão esperada. O servidor valida o schema versionado, grava o JSON e snapshot na mesma transação e rejeita concorrência com HTTP 409. Professores autenticados podem editar e enviar anexos. Alunos só obtêm imagens por apresentação publicada e associada à turma ativa; a rota não aceita URLs remotas para anexos.

A migration 016 cria biblioteca, associação de turmas e snapshots; a 017 acrescenta o armazenamento binário de imagem. Antes da escrita, o painel Railway confirmou um backup manual do serviço Postgres em `production`, concluído em **29/10/2026 às 22:59**, com **196 MB**. A leitura do ledger mostrou que 001–016 já estavam aplicadas e apenas 017 estava pendente. A 017 foi aplicada pelo túnel SSH autenticado da Railway; a verificação posterior confirmou ambas as migrations e as tabelas `metalab_presentations` e `metalab_presentation_assets`. Nenhum registro de aluno, turma ou apresentação foi criado ou alterado. Em banco novo, aplique as migrations pela ordem numérica antes de usar o módulo.

## Testes desta etapa

- `npm run typecheck`: aprovado após as alterações finais.
- `npm test`: aprovado, 23 testes.
- `npm run build`: aprovado; build Web incluiu a rota docente do editor e as rotas de assets.
- PostgreSQL Railway `production`: backup manual concluído antes da migration; 017 aplicada e confirmada por consulta somente leitura ao ledger e às tabelas.
- Testes adicionados: documento Canva de 20 slides satisfaz o schema e assinaturas falsas/curtas são rejeitadas.
- Pendente: teste E2E de interação do editor, concorrência em PostgreSQL, upload/autorização com contas aluno/professor, impressão/PDF e revisão visual em desktop/celular.

## Rollback

Remova as alterações Web desta etapa e mantenha intactas as alterações preexistentes fora do módulo. A migration 017 adicionou apenas a tabela privada de anexos e seu índice; não removeu nem reescreveu dados. Se for necessário reverter o schema de produção, avalie o snapshot de 29/10/2026 e faça a restauração pelo fluxo normal de recuperação da Railway, considerando gravações posteriores.
