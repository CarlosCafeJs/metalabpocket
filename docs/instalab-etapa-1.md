# InstaLab — etapa 1

Esta etapa atualiza a experiência do InstaLab sem substituir a rede já integrada às turmas do MetaLab Pocket.

## O que foi entregue

- Navegação própria para Início, Criar publicação e Perfil, com navegação lateral no computador e barra inferior em telas estreitas.
- Feed em coluna única com cartões de publicação, autor, empresa, data, curtida, comentários e ações.
- Publicação de texto e de uma imagem JPG, PNG ou WebP, mantendo os limites e as validações existentes.
- Edição da própria publicação e exclusão apenas pelo autor autenticado.
- Link interno compartilhável por publicação.
- Paginação de 12 itens por requisição, com carregamento progressivo ao rolar e botão de fallback.
- Perfil básico com publicações próprias e carregamento progressivo.
- Escopo de turma e sessão mantidos no backend; a tela não substitui a autorização das rotas.

## Persistência

O código reutiliza `metalab_instalab_posts`, `metalab_instalab_likes` e `metalab_instalab_comments`. Esta etapa não exige migration nem altera dados existentes. As imagens continuam usando o armazenamento binário que o app já possui, com limite de 4 MB.

## Arquivos principais

- `src/app/instalab/page.tsx` — experiência do aluno, feed, perfil, composer e interações.
- `src/app/api/student/instalab/route.ts` — leitura paginada e criação de publicação.
- `src/app/api/student/instalab/[postId]/route.ts` — edição e exclusão autenticadas pelo autor.
- `src/server/repository.ts` — consultas paginadas e contagem por turma/perfil.
- `src/components/AppShell.tsx` — modo de shell social mantendo a sessão do Pocket.
- `src/app/globals.css` — layout responsivo do InstaLab.

## Próximas etapas

Carrossel e vídeo precisam de uma decisão de armazenamento e processamento antes de serem habilitados. Edição avançada de perfil, seguidores, pesquisa, explorar, Stories, Reels, notificações e mensagens não foram expostos como botões sem funcionamento; seguem para as etapas futuras do plano.
