# InstaLab 3.0 — perfil, MetaCoins e anúncios

## O que foi implementado

- O perfil do aluno ganhou uma galeria de três colunas que mostra somente publicações que têm uma imagem salva. Publicações somente de texto continuam acessíveis em uma seção própria. O espaço vazio não usa conteúdo fictício.
- Uma publicação válida pode receber MetaCoins: 10 pela primeira publicação do dia, 5 pela segunda, 5 pela terceira e nenhuma recompensa além disso, com limite diário de 20. As regras e o fuso horário (`America/Sao_Paulo` por padrão) ficam no banco.
- O crédito é criado na mesma transação que salva a publicação. O servidor gera o valor; a interface nunca o escolhe. A chave idempotente impede que uma repetição de rede crie duas publicações ou recompensas. Um hash diário do texto normalizado ou da imagem evita recompensar novamente conteúdo idêntico no mesmo dia.
- Repetições de conteúdo com uma nova publicação são registradas como ocorrência de segurança sem armazenar o texto ou a imagem no log; o professor pode consultar a lista no painel.
- A carteira é calculada pelo extrato imutável, não por um saldo editável. Edições não geram crédito. Ao apagar uma publicação, um gatilho registra estorno; se as moedas já foram gastas, estorna somente o saldo que ainda existe e registra a parte já utilizada no metadado do lançamento.
- O Painel profissional mostra saldo, extrato, indicadores disponíveis e criação de anúncios com imagem própria ou publicação existente que tenha imagem. Planos padrão: 20 moedas/1 dia, 50/3 dias e 100/7 dias. O custo fica reservado ao enviar para revisão; reprovação devolve o valor de forma idempotente.
- O professor tem uma fila para aprovar, reprovar e suspender anúncios. Retomar campanha suspensa usa somente o tempo que faltava, sem ampliar o período comprado. As campanhas são exibidas no feed somente para colegas da mesma turma, têm rótulo de anúncio patrocinado e no máximo uma campanha consistente por aluno no dia. A contagem é de exibições registradas por aluno/dia, não de alcance único.
- O painel do aluno e o histórico do professor apresentam as movimentações e as campanhas; ajustes administrativos de regras deixam um registro de auditoria.
- Somente a conta de professor indicada por `METALAB_INSTALAB_ECONOMY_ADMIN_CPF` pode alterar recompensas, limite, fuso e preços. Esse CPF precisa ser uma das contas de professor configuradas. Sem a variável, a área de configuração não aparece e a API nega alterações.

## Limites do que existe no código atual

O banco atual aceita uma imagem JPG, PNG ou WebP por publicação. Por isso esta entrega não finge que já existem carrosséis, vídeos, Reels ou Stories. Publicações de texto não viram miniaturas. O projeto também não tem funções de seguidores, “seguindo” ou posts salvos; não foram criadas métricas simuladas de visualização ou alcance. A escolha de publicação existente para anúncio fica limitada a publicações com imagem.

## Banco e implantação

A migration nova é `db/migrations/013_instalab_economy_and_campaigns.sql`. Ela é aditiva, com tabelas para configurações, carteira, deduplicação diária, campanhas, eventos e exibições, além de uma coluna de idempotência em posts. Também registra a regra de imutabilidade do extrato e estorno de recompensa.

**A migration não foi executada.** Nenhum banco real foi conectado ou alterado durante esta implementação. O histórico local já inclui as migrations 011 e 012 ainda não rastreadas no Git; confirme o estado do Railway antes de aplicar qualquer lote. Faça snapshot/backup pelo Railway, confirme o banco e a URL de conexão, confira a lista de migrations pendentes e então aplique pelo ambiente de deploy autorizado. Não rode uma migration apontando para produção sem conferir o destino e o backup.

Após a migration, defina opcionalmente `METALAB_INSTALAB_ECONOMY_ADMIN_CPF` no `.env.local` ou nas variáveis do ambiente. Não coloque esse valor no Git. Entre novamente como essa conta de professor para receber a sessão assinada com identidade; sessões antigas continuam aceitas para o painel, mas não têm privilégio administrativo.

## Verificação

`npm run typecheck`, `npm test` e `git diff --check` devem passar antes de enviar o código. Os testes novos verificam os valores, o teto diário e os casos de entrada inválida. Não há teste de integração PostgreSQL nesta máquina, e a migration precisa ser revisada/validada no ambiente de banco antes de ser aplicada.
