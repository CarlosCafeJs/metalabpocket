# Edu Café Flow — auditoria da reinicialização do banco

Atualizado em 26/11/2026. Este documento registra a auditoria local e da Railway. Nenhum serviço novo foi criado, nenhum banco foi alterado e nenhuma conexão publicada foi trocada.

## Estado do repositório

- Branch ativa: `codex/desktop-offline-phase1`.
- O checkout já contém muitas alterações locais não commitadas de rebranding, contas, apresentações, Desktop e da consolidação funcional. Elas foram preservadas; não houve reset, merge, commit ou push.
- O código local atual inclui `db/migrations/001` a `020`. O runner `scripts/migrate.mjs` carrega `.env.local`/`.env` e tenta aplicar todas as migrations numéricas ainda ausentes no `DATABASE_URL`; ele não oferece seleção de baseline nem confirmação explícita do destino.
- O `DATABASE_URL` local aponta para um host TCP Railway e o banco lógico `railway`. Portanto, executar `npm run db:migrate` com o ambiente atual poderia atingir produção. Não foi executado.

## Railway atual

- Projeto `metalab`, ambiente `production`.
- Serviços ativos: `metalabpocket` e `Postgres`. A aplicação Railway publica `https://edu.cafeflow.com.br`; o último deployment consultado consta como `SUCCESS` de 30/10/2026. O PostgreSQL usa a imagem de template 18 e volume de 5 GB, com cerca de 205 MB usados no snapshot de status.
- Uma consulta read-only anterior identificou PostgreSQL 18.6, banco lógico `railway`, ledger presente e migrations 001–018 registradas; 019/020 pendentes. O próximo acesso não deve usar o banco `railway` como alvo novo.
- `vercel.json` existe e configura o preset Next.js, mas não foi possível confirmar se há projeto/domínio Vercel ativo nem ler suas variáveis. Antes da troca, é necessário confirmar todas as aplicações que usam o banco.
- Não foi possível obter relatório de usage/billing pela CLI nesta auditoria. Assim, plano atual, crédito disponível e custo mensal exato da nova instância seguem desconhecidos.

## Credencial exposta

Uma saída anterior do comando Railway Connect exibiu uma senha de conexão. Ela foi tratada como potencialmente exposta; seu valor não está registrado aqui. Não rotacionei a credencial porque a rotação sem coordenar os consumidores pode interromper a aplicação ativa.

Plano: inventariar Railway, Vercel e ambientes locais que usam `DATABASE_URL`; criar credencial nova e atualizar os consumidores em uma janela coordenada; validar conexão TLS e funcionamento; somente então revogar a antiga. A troca da variável na aplicação publicada e o deploy precisam de autorização separada, conforme os limites desta execução.

## Migrations e modelo limpo

As migrations 001–020 formam uma cadeia histórica do projeto anterior, não uma baseline Edu Café Flow. Aplicá-las em sequência a um banco vazio tende a criar estruturas de funcionalidades que foram descontinuadas e conserva identificadores `metalab_*`. Não devem ser alteradas nem reaplicadas no banco antigo.

Uma baseline nova deverá conter, após confirmar consumidores no código:

- Alunos, credenciais, sessões, professoras/professores, aprovação e sessões revogáveis.
- Turmas, vínculo atual e histórico, responsabilidade docente e conteúdo de Missões da Turma.
- Entregas com texto/arquivo, eventos de atividade, Perfil e Fórum.
- InstaFlow, comentários/curtidas, carteira MetaCoins, recompensas, anúncios e cobrança de campanhas.
- Apresentações, versões, vínculos de turma e assets.
- Provisionamento e sincronização Desktop somente se a compatibilidade Desktop continuar sendo requisito. Nenhum dado ou tabela Desktop foi alterado nesta auditoria.

Estruturas candidatas a não entrar na base nova: fotos da câmera/simulador, Missões Relâmpago e seus módulos, currículo/progresso fixo antigo. O código ainda mantém referências de compatibilidade a Quick Missions em Entregas e no painel docente, então essas referências devem ser retiradas antes de excluir as tabelas do baseline. `metalab_businesses` não deve ser descartada sem redesenhar os fluxos ainda associados a campanhas/ads; MetaCoins e anúncios foram preservados como requisito.

### Convenção de nomes

Meta pretendida: `eduflow_` para novos objetos PostgreSQL e `EDUCAFE_` para novas variáveis de configuração. O código agora prefere `EDUCAFE_STUDENT_CPF_PEPPER`, `EDUCAFE_TEACHER_CPF_PEPPER`, `EDUCAFE_SESSION_HOURS` e `EDUCAFE_TEACHER_ADMIN_*`; aliases anteriores permanecem temporariamente aceitos para não interromper instalações existentes. A aplicação ainda tem consultas `metalab_*`, nomes de sessão/cookie e configurações `METALAB_*` do Desktop; trocar apenas a migration deixaria o código incompatível. A renomeação precisa ser feita com um mapeamento explícito, por módulo, mantendo as migrations 001–020 imutáveis para o banco antigo.

Não serão renomeados automaticamente identificadores do protocolo Desktop, cookies, paths ou `appId` antes de definir compatibilidade com as instalações existentes. A marca visual está parcialmente alterada, mas ainda há títulos e identificadores técnicos antigos em Electron e no protocolo.

## Dependências de deploy e rollback

- Railway atual continua usando o banco `railway`; deve permanecer intacto enquanto o novo esquema é validado.
- O futuro banco receberá uma URL própria. Testes fictícios ficam apenas nele. O código local deve apontar para esse alvo explicitamente, sem reaproveitar os valores de `.env.local` atuais.
- Vercel ainda precisa ser verificada. Não alterar `DATABASE_URL` de Railway/Vercel, fazer deploy ou push nesta etapa.
- Rollback de troca: manter a aplicação e o banco antigos sem alterações, registrar as URLs por ambiente em armazenamento seguro, validar o novo serviço com instância de teste e só cortar tráfego após aceite. Nenhuma exclusão da base antiga está autorizada nesta tarefa.

## Custos conhecidos e decisão pendente

Railway cobra uso por recurso, não uma tarifa fixa por instância de Postgres: as taxas públicas atuais são **US$ 10/GB-mês de RAM**, **US$ 20/vCPU-mês**, **US$ 0,15/GB-mês de armazenamento usado** e **US$ 0,05/GB de egress**. Um banco em execução gera consumo de CPU/RAM mesmo sem tráfego; o volume novo começa com metadados e o custo cresce com uso. A assinatura e os créditos incluídos dependem do plano do workspace, que não foi confirmado. Logo, não há estimativa confiável do total mensal desta nova instância sem o plano e o uso medido.

Fontes oficiais: [preços Railway](https://docs.railway.com/pricing), [volumes e cobrança por armazenamento usado](https://docs.railway.com/volumes/reference), [uso do projeto](https://docs.railway.com/projects/project-usage).

**Não criar a instância ainda.** Para criar um serviço PostgreSQL isolado, é preciso aprovar o custo variável ou escolher uma base lógica `cafeflow` dentro do serviço atual, que evita uma nova instância, mas compartilha CPU, volume e domínio de falha com produção. A CLI não retornou o usage atual, então a aprovação deve considerar que o total exato pode exceder os créditos do plano.

## Próxima sequência segura

1. Confirmar criação de Postgres isolado (custo variável) ou escolher database lógico no serviço atual.
2. Aprovar o desenho da baseline `eduflow_` e encerrar a compatibilidade rápida ainda usada no painel/Entregas.
3. Preparar a baseline e runner com alvo/dry-run explícitos; executar primeiro em PostgreSQL descartável local.
4. Criar o banco autorizado, aplicar baseline e testar exclusivamente com contas e dados fictícios.
5. Reconfirmar consumo e dependências Railway/Vercel, planejar rotação da credencial exposta e o corte do app, sem executá-los até obter as autorizações correspondentes.
6. Manter o serviço antigo até o aceite final; só solicitar autorização de exclusão depois da transição validada.

## Validações e pendências

- Rechecado em modo somente leitura: projeto/ambiente Railway, serviços e estado do deployment.
- Inspecionados os arquivos locais de migrations, runner, conexão PostgreSQL, sessões, credenciais, `package.json`, `vercel.json` e referências a Quick Missions/fotos/atividade.
- Nenhuma migration, criação de recurso, alteração de credencial, teste de integração, deploy ou push foi executado.
- O README foi substituído por instruções compatíveis com contas docentes no banco e pelo aviso explícito sobre o runner de migrations.
- A aplicação agora prefere os nomes `EDUCAFE_*` para pepper de CPF, prazo de sessão e bootstrap docente; aliases antigos continuam aceitos temporariamente. O título/metadata Web passou a `Edu Café Flow`, e o cache local do pool foi renomeado para `eduCafePool`.
- `npm run typecheck`, `npm test` (28 testes) e `npm run build` passaram após essas alterações locais.
- O Docker local não está disponível (daemon indisponível), portanto o esquema novo ainda não foi aplicado nem validado em PostgreSQL isolado.
- A decisão sobre criar serviço PostgreSQL isolado com custo variável versus um database lógico no serviço atual foi solicitada ao responsável. A criação permanece parada até essa escolha.

### Atualização após recriação do banco — 26/11/2026

- O responsável informou que recriou o database na Railway e atualizou a URL.
- Não foi possível confirmar o destino pela configuração local: uma tentativa de conexão somente leitura falhou com `ENOTFOUND` para o host configurado. O comando `railway status` informa que este checkout não está vinculado a um projeto Railway. A tentativa de ler o health endpoint público também não obteve conexão neste ambiente.
- Nenhuma migration foi executada. Ainda não há evidência verificável de que a URL local e a URL do serviço Web apontem para o novo database, nem confirmação de schema vazio nesta atualização.
- Próximo passo seguro: vincular o CLI ao projeto correto ou disponibilizar a conectividade/DATABASE_URL do novo serviço neste ambiente; depois confirmar database, host mascarado, tabelas e ledger em transação read-only. Só então aplicar a baseline aprovada no database novo. Não usar `npm run db:migrate` enquanto ele ainda aplicar automaticamente as 20 migrations históricas.
- A aplicação publicada pode continuar indisponível se o serviço Web já estiver apontando para o database vazio. Não foi feito deploy nem alterada qualquer variável da Railway nesta execução.

### Inicialização autorizada concluída — 26/11/2026

O pedido posterior autorizou expressamente executar 001–020 no PostgreSQL novo depois de validar o destino. Esta seção substitui as pendências de inicialização acima; o histórico da auditoria anterior foi mantido.

#### Destino e TLS

- A URL carregada do `.env.local` aponta para `centerbeam.proxy.rlwy.net:44438`, database lógico `railway`, igual ao host e à porta fornecidos pelo responsável para o banco novo.
- A Railway CLI foi vinculada somente em uma pasta temporária ao projeto `edu cafeflow`, ambiente `production`, serviço `Postgres-Wims` (service ID `a85a2178-c987-4dd4-96d7-3a6679503c78`). O database antigo não foi selecionado nem acessado.
- A consulta inicial, em transação read-only, identificou PostgreSQL `18.7`, schema `public`, zero tabelas e nenhum ledger de migrations. Não havia registros acadêmicos.
- A conexão inicialmente falhou por cadeia autoassinada e nome do proxy incompatível com o certificado do Postgres. A CA pública foi lida via SSH autenticado da Railway; o fingerprint SHA-256 observado foi `F1:B0:1F:16:E6:AE:DB:D3:41:8B:AE:07:1B:BB:D6:BD:3B:EE:F5:36:25:75:00:7E:A5:01:0C:EF:C3:76:5E:EB`. O certificado do servidor confirma `postgres-wims.railway.internal` como SAN. A conexão foi então validada com CA confiável e comparação explícita do hostname, mantendo `rejectUnauthorized: true`.
- A CA e o SAN do novo serviço foram adicionados apenas ao `.env.local` ignorado pelo Git. Nenhuma URL ou variável de conexão da aplicação Railway/Vercel foi alterada.

#### Alterações locais de conexão

- `src/server/db.ts`, `scripts/migrate.mjs`, `scripts/bill-instalab-campaigns.mjs` e `scripts/bootstrap-teacher-admin.mjs` agora reconhecem `DATABASE_CA` e `DATABASE_SSL_SERVERNAME` e verificam a cadeia e o SAN do certificado. O runner de migrations usa a mesma política TLS do pool da aplicação.
- Removido o caminho de configuração local que aceitava certificados sem validação. TLS com validação é obrigatório nesses clientes.
- `.env.example` atualizado para refletir TLS obrigatório. Os nomes físicos `metalab_*` foram mantidos nesta inicialização por compatibilidade com as consultas do código atual, conforme autorizado.

#### Resultado das migrations

- `npm run db:migrate` concluiu todas as migrations abaixo em uma transação; o ledger registra exatamente as 20 entradas e uma segunda verificação read-only confirmou a instalação.
- Uma segunda execução do runner terminou com `Banco já estava atualizado.`, confirmando que ele não reaplica as migrations registradas.
- Migrations aplicadas: `001_foundation`, `002_teacher_dashboard_and_photos`, `003_student_deliveries`, `004_student_identity_lookup`, `005_quick_missions`, `006_teacher_classroom`, `007_module_forms_and_classes`, `008_instalab_and_class_codes`, `009_instalab_teacher_moderation`, `010_student_archive`, `011_student_activity_history`, `012_instalab_student_avatars`, `013_instalab_economy_and_campaigns`, `014_instalab_rewards_billing_and_lighting`, `015_desktop_offline_sync`, `016_presentations`, `017_presentation_assets`, `018_student_password_accounts`, `019_teacher_accounts_and_class_ownership` e `020_student_experience_consolidation`.
- Estado final verificado: 42 tabelas, 481 constraints catalogadas e 114 índices em `public`; todas as tabelas essenciais de contas, turmas, missões, entregas, InstaFlow, Fórum, apresentações e economia estão presentes.
- O predicado de prontidão usado pelo código retornou `true`. Contagens finais: 0 alunos, 0 professores, 0 turmas, 0 entregas e 0 publicações.
- Smoke tests PostgreSQL criaram, leram e relacionaram registros fictícios para cadastro de aluno, estado/aprovação docente (com administrador sintético transitório), turma e vínculo, missão/formulário, entrega somente texto, perfil, publicação/curtida InstaFlow, tópico/resposta de Fórum, apresentação e configuração da economia. Tudo ocorreu em uma transação encerrada com `ROLLBACK`; nenhum registro de teste permaneceu.
- Uma tentativa de testar `/api/health` por HTTP local não respondeu dentro de 10 segundos neste ambiente. A query de prontidão e a conectividade TLS ao Postgres foram verificadas diretamente; portanto, o endpoint HTTP e um ciclo real de autenticação continuam pendentes de homologação.

#### Testes, administração e limites

- `npm run typecheck` — aprovado.
- `npm test` — aprovado, 28 testes.
- `npm run build` — aprovado. A primeira tentativa no sandbox falhou com `EPERM` em `.next`; a repetição local autorizada terminou com build Web completo.
- O mecanismo manual `npm run teacher:bootstrap-admin` permanece preparado e não foi executado. Não havia configuração/segredo de administrador inicial disponível para provisionar uma conta; nenhuma senha padrão foi criada.
- Nenhum deploy, push, alteração em serviço/variável Railway da aplicação, alteração no banco antigo ou importação de dados legados foi realizada.
- Próximo passo antes de usar o sistema: configurar/provisionar o primeiro administrador por canal seguro, depois homologar os endpoints Web localmente e planejar um deploy separado com `DATABASE_CA` e `DATABASE_SSL_SERVERNAME` no serviço Web. A aplicação publicada não foi validada nem atualizada nesta execução.
