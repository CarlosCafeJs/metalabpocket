# Auditoria de viabilidade: MetaLab Pocket Desktop

Data da auditoria: 29 de outubro de 2026
Escopo: código atualmente presente no repositório; nenhum banco ou arquivo `.env` foi aberto ou alterado.

## Resultado executivo

O projeto é uma aplicação Next.js 16 com App Router e renderização dinâmica. A interface e os simuladores já são locais ao projeto, mas os fluxos de conta, autorização, dados escolares, missões, entregas, turmas, InstaLab e fotos compartilhadas dependem das Route Handlers do Next e de PostgreSQL. Não existe hoje SQLite, fila local de operações, protocolo de sincronização, cursor incremental, controle de versão concorrente nem resolução de conflitos.

Por isso, o código atual não pode ser empacotado como aplicativo offline completo apenas adicionando uma janela Electron. Uma janela poderia abrir a interface, mas as ações protegidas continuariam falhando sem `DATABASE_URL`. Publicar a conexão PostgreSQL ou credenciais de serviço dentro do instalador seria inseguro e não é uma opção.

## Inventário observado

- `package.json` declara Next.js `^16.4.2`, React/React DOM `^19.3.1`, `pg` `^8.23.1` e Zod `^4.6.7`. Electron, SQLite, gerador de instalador e framework de testes de UI não estão declarados. O lockfile é `package-lock.json`.
- `next.config.ts` não usa exportação estática. Define cabeçalhos de segurança. `tsconfig.json` usa TypeScript estrito e aliases para `src`.
- O produto usa páginas React no App Router, componentes compartilhados e dezenas de Route Handlers em `src/app/api`. As telas fazem chamadas `fetch('/api/...')` com cookies same-origin.
- `src/server/repository.ts` contém operações de negócio implementadas diretamente com SQL PostgreSQL e `getPool()`. `src/server/db.ts` exige `DATABASE_URL` e inicializa o `pg.Pool`. Não há interface de persistência intercambiável.
- Migrações versionadas estão em `db/migrations/001` a `014`. `scripts/migrate.mjs` aplica PostgreSQL. Esta auditoria não executou scripts nem migrações.
- Alunos usam cookie de sessão `HttpOnly` e token armazenado como hash no banco (`src/server/session.ts`). O fluxo de entrada existente identifica aluno por e-mail e data de nascimento; não é autenticação forte para conceder novos privilégios offline.
- Professores usam credenciais configuradas por variáveis de ambiente e cookie assinado (`src/server/teacher-auth.ts`). Em desktop distribuído, variáveis com a senha do professor e o segredo HMAC não podem ser embutidos no executável.
- O simulador em `public/simulator` já contém Three.js, loaders, modelos `.glb`, imagens e HTML/CSS/JS locais. A galeria e partes das simulações usam IndexedDB/localStorage. As fotos são enviadas para `/api/student/photos` para compartilhamento com o professor.
- A busca de URLs no código executável (fora dos comentários da biblioteca Three.js) não encontrou CDN, fontes remotas ou bibliotecas carregadas de terceiros. As chamadas de rede de produto encontradas são para as próprias APIs `/api/...`.
- O código encontrado não usa `navigator.mediaDevices.getUserMedia`; o estúdio é uma câmera simulada renderizada localmente. Há carregamento/seleção de arquivos para fotos e entregas.
- A política `Permissions-Policy` atual desativa câmera e microfone. Como o simulador não captura a câmera física, isto não impede seu fluxo atual; uma futura função de câmera física exigirá permissão por origem e teste explícito no Electron.

## Matriz de compatibilidade

| Área observada | Execução local atual | Offline após provisionar | Dependência/gap |
|---|---|---|---|
| Interface React, estilos, navegação | Sim, servida pelo Next | Sim, se empacotada com a aplicação | Next usa recursos dinâmicos; exportação estática não cobre todas as rotas/API |
| Entrada e sessão de aluno | Não sem API e PostgreSQL | Bloqueada | Criação/recuperação e revogação de sessão consultam PostgreSQL; não há ticket offline limitado |
| Login e painel do professor | Não sem servidor/variáveis | Bloqueada | Credenciais são configuração de servidor; não há credencial protegida por SO nem autorização offline local |
| Central, perfil/empresa e progresso | API/PostgreSQL | Não | Leituras e gravações são remotas; alguns dados de simulação usam localStorage, mas não são a fonte acadêmica |
| Missões e respostas | API/PostgreSQL; imagens locais no navegador | Parcial somente para a mídia local | Entrega/progresso passam por `/api/missions` e `/api/student/classroom/submissions`; sem outbox, confirmação local transacional ou resolução de edição concorrente |
| Missões relâmpago | API/PostgreSQL | Não | Consulta e entrega dependem de módulo/turma no banco |
| Turmas e vínculos | API/PostgreSQL | Não | Criação, matrícula, remoção e código são autoritativos no servidor |
| Entregas e relatórios | API/PostgreSQL; arquivo selecionado no dispositivo | Não | Metadados e anexos são enviados a Route Handlers e salvos no PostgreSQL |
| InstaLab: feed, perfil, curtidas, comentários, campanhas e carteira | API/PostgreSQL | Não | Operações sociais e transações de MetaCoins exigem autorização e gravação no banco; não há fila idempotente sincronizável offline |
| Fotos do estúdio 3D | Renderização e modelos são locais; cópia compartilhada tenta API | Parcial | IndexedDB preserva a galeria do navegador e tenta novo envio, mas não expõe estado robusto pendente/conflito nem garante persistência/isolamento desktop |
| Simuladores de Instagram/WhatsApp fictícios | Sim | Sim, para os dados que ficam no navegador | São dados de treino por aluno no IndexedDB/localStorage e não sincronizam com a conta acadêmica |
| Modelos 3D/Three.js | Sim | Sim | `public/simulator/vendor` e `public/simulator/assets` estão no projeto; verificar empacotamento e caminhos relativos no instalador |
| Migrações e scripts de cobrança | Somente execução administrativa Node/PostgreSQL | Não | Nunca devem executar no boot do cliente; credenciais e mudanças financeiras não podem ir para o instalador |

Classificação: “parcial” indica que já existe armazenamento de navegador para uma parte do fluxo, mas não satisfaz a garantia de persistência offline e sincronização descrita no requisito.

## Comparação de integração Next/Electron

| Alternativa | Compatibilidade com a base | Limite |
|---|---|---|
| A. Exportar tudo como site estático | Baixa | Não cobre Route Handlers que usam cookies, Node.js, banco, sessões e arquivos. Não foi ativada. |
| B. Extrair interface para aplicação React separada | Média/baixa no curto prazo | Exigiria duplicar ou extrair navegação e contratos, além de criar uma API local e sincronização; amplia o risco de regressão da Web. |
| C. Empacotar servidor local Next mínimo | Alta para preservar a aplicação atual | Mantém páginas e APIs locais, mas por si só ainda precisa de persistência offline e não transforma PostgreSQL em SQLite. |

### Decisão arquitetural

Usar a alternativa C para reaproveitar a aplicação Next sem exportação estática, combinada com um adaptador de persistência local por trás das operações de negócio e um protocolo explícito de sincronização com o backend existente. O Electron inicia um servidor Next local limitado a loopback e abre apenas esse conteúdo local. O backend remoto continua sendo fonte central quando há conexão; o Desktop não se conecta diretamente ao PostgreSQL.

Essa é uma decisão-alvo, não uma declaração de implementação pronta. A arquitetura atual ainda não permite ativar esse modo sem trabalho substancial na persistência, autenticação e APIs.

## Lacunas que bloqueiam afirmar “offline-first”

1. Extrair contratos de domínio da camada SQL atual; criar portas de repositório e implementações PostgreSQL/SQLite testáveis sem converter consultas SQL por substituição textual.
2. Projetar um esquema SQLite versionado, transações e diretório privado de anexos; proteger dados sensíveis e chaves com mecanismos do Windows.
3. Provisionar snapshot autorizado após login online, com escopo da turma e prazo offline curto. A identificação atual por e-mail/data de nascimento não é fator apropriado para reabrir privilégios armazenados localmente.
4. Criar operações offline com UUID/idempotency key, escrita atômica + outbox, versões de servidor, cursores incrementais, tombstones, retry com backoff e diagnóstico.
5. Definir conflitos por domínio: respostas/notas precisam preservar tentativas e revisão humana; publicação/comentário devem usar IDs de operação; turma e permissões permanecem autoritativas no servidor; cobrança de MetaCoins e aprovação de anúncios não devem ser confirmadas offline.
6. Sincronizar metadados e arquivos em fluxos separados, com hashes, limites, retries, expiração e tratamento de sessão revogada.
7. Definir barreiras de segurança e testes para autenticação expirada, mudança de turma, dispositivos compartilhados, DB local adulterado, XSS, path traversal e dados excluídos remotamente.
8. Adicionar build Windows e instalador assinável, ciclo de vida do processo Next, porta loopback aleatória, readiness/timeout, encerramento limpo, atualização de versão e recuperação após crash.

## Sequência de implementação recomendada

1. Extrair e testar serviços de domínio e interfaces de repositório sem alterar contratos Web.
2. Implementar SQLite e schema local versionado, começando por provisionamento/leitura de conteúdo e respostas de missão, sem notas administrativas, cobrança ou ações sociais irreversíveis offline.
3. Criar API de sincronização no servidor com autorização, idempotência, versões e cursores; testar duplicação, concorrência, revogação e reenvio de anexos.
4. Integrar a aplicação Next empacotada no Electron com isolamento, `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, CSP, IPC mínimo validado, navegação bloqueada e permissões de dispositivo explicitamente geridas.
5. Expandir a cobertura para professor e demais módulos apenas depois de política por domínio e testes de conflito/segurança.
6. Empacotar/assinar Windows, validar instalação limpa, upgrade, ausência de rede, reinício, sincronização posterior e preservação da Web.

## Segurança e operação propostas

- O processo Next local deve escutar somente em `127.0.0.1` com porta efêmera, segredo local não previsível e token de inicialização validado; Electron não deve carregar a URL hospedada como interface principal.
- `preload` deve expor só operações nomeadas e validadas. Não expor `ipcRenderer`, filesystem, shell ou SQL genéricos ao React. Validar `senderFrame`/origem em todo IPC.
- Usar políticas CSP e navegação restritiva, negar novas janelas por padrão, abrir links externos somente após validação, manter `webSecurity` ligado e solicitar permissões de câmera apenas para a origem local quando a feature realmente for física.
- A fila local não substitui autorização no servidor. Cada sincronização deve revalidar usuário, turma e permissões; expiração/revogação bloqueia o envio e informa o estado sem apagar a fila.
- MetaCoins, aprovação de campanha e configurações administrativas são transações no servidor e não devem gerar débito/crédito definitivo local desconectado.

## Validação desta auditoria

Esta etapa foi somente leitura sobre o código e documentação pública oficial. Nenhum pacote foi instalado, arquivo `.env` lido, configuração de produção consultada, migração executada ou banco alterado. Fontes oficiais consultadas: [modelo de processos do Electron](https://www.electronjs.org/docs/latest/tutorial/process-model), [segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security), [isolamento de contexto do Electron](https://www.electronjs.org/docs/latest/tutorial/context-isolation) e [opções de deploy do Next.js](https://nextjs.org/docs/app/getting-started/deploying).

## Fase 1 — implementação incremental

Branch de trabalho: `codex/desktop-offline-phase1`. A versão Web segue como implantação padrão; `output: 'standalone'` e `.next-desktop-runtime` são ativados somente em `desktop:build`.

### Arquivos adicionados ou alterados

- Electron: `electron/main.cjs`, `electron/preload.cjs`, `electron-builder.config.cjs`; inicialização de Next em `utilityProcess`, porta loopback efêmera, readiness, janela isolada e encerramento junto com a janela.
- Build: `scripts/build-desktop.mjs` e scripts `desktop:*` em `package.json`; output de desktop separado em `.next-desktop-runtime`, cópia dos assets para o `distDir` correto e remoção recursiva de qualquer `.env*` do standalone antes de empacotar.
- Persistência local: `src/server/desktop/store.ts` e `src/server/desktop/auth.ts`; SQLite `node:sqlite` (sem módulo nativo externo), WAL/FULL, schema local versionado, conteúdo/respostas/tokens criptografados com AES-256-GCM e chave protegida pelo `safeStorage` do Windows.
- APIs novas: `/api/desktop/health`, `/api/desktop/connect`, `/api/desktop/session`, `/api/desktop/classroom`, `/api/desktop/classroom/submissions`, `/api/desktop/sync` no servidor local e `/api/student/desktop-sync` no backend existente.
- Sincronização remota: `db/migrations/015_desktop_offline_sync.sql` cria grants de provisionamento e ledger idempotente; `src/server/repository.ts` grava respostas e ledger na mesma transação. A migração foi aplicada posteriormente no banco Railway configurado no ambiente local; o estado e a verificação constam nas pendências da Fase 1.
- Reuso de domínio/UI: `src/domain/classroom-answer-validation.ts` mantém as mesmas regras de resposta Web; `src/domain/classroom-snapshot.ts` calcula a versão autorizada; `src/app/missoes/ClassroomMissions.tsx`, `src/components/StudentEntry.tsx`, `src/components/AppShell.tsx` e `src/hooks/useStudentState.ts` só escolhem endpoints Desktop quando o preload Electron é detectado.
- Teste integrado: `scripts/desktop-flow-check.mjs` inicia o standalone Next real e usa um backend HTTP simulado, sem conectar ao Railway, localhost de desenvolvimento ou qualquer banco real.

### Decisões e contrato

O processo principal Electron gera uma chave aleatória e a protege pelo armazenamento do Windows. O servidor Next executa como processo utilitário, escutando apenas em `127.0.0.1`; o Electron só carrega essa origem, com `contextIsolation`, sandbox, sem Node no renderer e sem APIs privilegiadas no preload. O processo Next recebe apenas configuração local; variáveis de banco, certificados, credenciais de professor e configuração MetaCoins são filtrados do ambiente herdado. A tela de entrada pede o endereço HTTPS do backend Railway/Vercel para conectar; nenhum endereço ou segredo de produção é compilado no aplicativo.

O aluno autentica usando o endpoint já existente `/api/students`; a conta precisa estar matriculada em turma. O backend cria uma autorização aleatória de sincronização, vinculada ao aluno, à turma e a um snapshot de missões por até sete dias. O token é entregue somente no provisionamento e armazenado cifrado no SQLite; no servidor há apenas seu SHA-256. A sessão local é um cookie `HttpOnly`, `SameSite=Strict`, assinado com a chave local. Escritas locais exigem `Origin` igual ao `Host` loopback, e as rotas Desktop retornam 404 na Web.

O SQLite contém:

- `desktop_schema_migrations`: versão do schema local.
- `desktop_provisions`: aluno/turma, expiração, URL do backend e tokens cifrados.
- `desktop_mission_snapshots`: módulos e missões cifrados, escopo do provisionamento e hash de versão.
- `desktop_mission_outbox`: UUID de operação, missão, hash do snapshot, respostas cifradas, estado, tentativas e resultado cifrado; há unicidade por operação e por missão/provisionamento.
- `desktop_secrets`: valores locais cifrados.

Contrato de sincronização: cada envio inclui `operationId` UUID, `provisionId`, `missionId`, `snapshotHash` SHA-256 e respostas `{taskId, answer}`. O backend confere autorização, matrícula vigente, publicação, versão e respostas. `operationId` é chave primária no ledger; hash do conteúdo diferente com o mesmo UUID é rejeitado. Inclusão das respostas e do resultado no ledger ocorre na mesma transação PostgreSQL. O cliente confirma cada item na outbox somente ao receber o resultado; falha de transporte mantém a operação para retry com o mesmo UUID. Reenvio de lote é dividido em até 20 itens.

### Validações realizadas

- `npm run typecheck`: passou.
- `npm test`: 7 testes existentes passaram.
- `npm run build`: build Web padrão passou e gerou as rotas já existentes junto às novas rotas Desktop, sem ativar standalone.
- `npm run desktop:build`: build standalone Next passou; os assets estão em `.next-desktop-runtime/static`, sob o `distDir` configurado.
- `npm run desktop:test`: passou com servidor Next standalone real. O teste provisiona com backend simulado, desliga o backend para leitura/resposta, reinicia Next sem rede, confirma a resposta após reinício, religa o backend, simula perda da confirmação, repete o mesmo UUID e observa apenas uma operação remota; verifica também bloqueio de origem e que resposta/token não aparecem em claro nas colunas cifradas.
- `npm run desktop:dist:win`: o empacotador NSIS para Windows concluiu novamente após corrigir `.env*` e os assets. A inspeção da pasta empacotada encontrou zero arquivos de ambiente e confirmou `.next-desktop-runtime/static`, `public/simulator/vendor` e `public/simulator/assets`. O instalador tem cerca de 201 MB. A primeira saída, anterior à correção, não deve ser distribuída.

### Pendências antes de considerar a fatia e o instalador concluídos

1. Instalar/executar e desinstalar o instalador num Windows de teste; validar inicialização do Electron, login/provisionamento com backend de teste e conferir os modelos Three.js no aplicativo instalado. O `.exe` foi gerado e inspecionado, mas ainda não foi instalado nem aberto.
2. A migration `015_desktop_offline_sync.sql` foi aplicada no banco Railway configurado no ambiente local. Antes da execução, a leitura confirmou o banco `railway` e o ledger com as migrations `001`–`014`; depois, a verificação confirmou o registro da `015` e as tabelas `metalab_desktop_provisions` e `metalab_desktop_sync_operations`. A migration é aditiva e não removeu nem alterou registros existentes. Ainda falta exercitar o contrato PostgreSQL real, incluindo matrícula revogada, mudança de versão, confirmação perdida e retry idempotente.
3. A fatia Desktop deliberadamente expõe somente Missões. Empresa, InstaLab, câmera/fotos, turmas, professor, entregas e MetaCoins permanecem fora do offline. A navegação Desktop foi limitada a Missões. Nada foi alterado nos simuladores locais Three.js.
4. O backend e o grant de sincronização expiram em sete dias. A fila local permanece cifrada depois disso, mas exige provisionamento online renovado; recuperação de respostas pendentes após expiração ainda precisa de fluxo explícito antes de ampliar o uso.

Por esses limites, a infraestrutura e o primeiro fluxo local estão implementados e testados contra um backend simulado, e o esquema remoto já está preparado. O fluxo ainda não está declarado concluído nem o instalador está pronto para distribuição.

## Fase 1.1 — Validação real e estabilização

### Auditoria incremental

- Problema confirmado pelas capturas: `electron/main.cjs` redeclarava `encryptedKey` no mesmo escopo dentro de `getDataKey()`. O erro impedia o carregamento do processo principal do Electron.
- Correção: a chave recém-cifrada agora usa o identificador `protectedDataKey`; o buffer lido do arquivo continua em `encryptedKey`.
- Nenhuma alteração foi feita à migration 015 ou ao banco nesta fase.

### Testes executados nesta fase

- `node --check electron/main.cjs` e `node --check electron/preload.cjs`: passaram.
- `npm run typecheck`: passou.
- `npm test`: 7 testes passaram.
- `npm run desktop:build`: passou. A primeira tentativa no sandbox falhou por `EPERM` ao criar arquivos gerados; executada fora do sandbox, completou.
- `npm run desktop:test`: passou (1 cenário integrado com Next standalone real e backend HTTP simulado). A primeira execução no sandbox expirou na prontidão do servidor local; fora do sandbox passou em cerca de 12 segundos.
- `npm run build`: build Web passou. A tentativa no sandbox falhou por `EPERM` em `.next`; fora do sandbox completou.
- `npm run desktop:dist:win`: instalador NSIS regenerado com a correção; artefato local `dist/desktop/release/MetaLab Pocket Setup 1.0.0.exe` (~201 MB). Empacotamento não equivale a teste de instalação/execução.
- `git diff --check`: passou, com avisos de conversão de LF/CRLF em arquivos do checkout.

### Limites e pendências

- **PostgreSQL real:** não foram criados dados nem executadas operações de sincronização contra a Railway nesta fase. O banco Railway disponível tem dados reais e não foi identificado um ambiente isolado de homologação autorizado para escrita. A migration 015 já constava aplicada de uma etapa anterior; não foi reaplicada. Após autorização explícita do usuário, foi criado no painel da Railway um backup manual do serviço Postgres em `production`, exibido como concluído em 29/10/2026 às 19:02, com tamanho de 194 MB. Nenhum restore foi iniciado.
- **Instalador Windows:** o pacote foi reconstruído, mas não foi instalado nem exercitado. O teste real de janela, primeiro provisionamento, Three.js e encerramento continua pendente. O empacotador informou que não há certificado de assinatura configurado.
- **Recuperação após sete dias:** permanece sem política de negócio aprovada. As respostas pendentes não devem ser apagadas nem reenviadas com um novo grant/turma sem autorização explícita do servidor; resolver esta regra exige decisão acadêmica.
- **Segurança:** a configuração base (sandbox, context isolation, sem Node no renderer, loopback, janela externa bloqueada) foi inspecionada. A revisão completa de ameaças locais, adulteração de SQLite, falhas de disco, instâncias concorrentes e IPC ainda não foi concluída.
- **Confiabilidade:** a suíte prova persistência após reinício, confirmação perdida e retry idempotente no backend simulado. Revogação, conflitos, 401/403/409/429/500, timeouts, espaço insuficiente, concorrência e schema futuro ainda não têm cobertura integral.
- **Central de Sincronização:** contratos/telemetria reutilizável não foram ampliados nesta correção; a interface continua fora do escopo desta fase.

### Classificação

- **Implementado:** correção da redeclaração; arquitetura offline original e teste simulado.
- **Testado:** sintaxe Electron, typecheck, testes unitários, fluxo offline simulado, build Desktop e build Web.
- **Validado em ambiente real:** empacotamento NSIS local somente; não houve teste de sincronização PostgreSQL real nem instalação Windows.
- **Pendente:** validação de sincronização em banco de testes autorizado, recuperação de outbox expirada, revisão de segurança completa e teste manual do instalador.

**Estado da Fase 1.1: bloqueada para distribuição.** A correção da falha da captura foi compilada e o teste offline simulado passou, mas faltam validações obrigatórias em PostgreSQL de teste e Windows instalado.

## Servidor oficial automático e conectividade — 29/10/2026

### Causa raiz confirmada no deploy

Foi feita uma consulta somente leitura, sem credenciais, a `GET https://metalab.cafeflow.com.br/api/desktop/identity`. O deploy Web publicado respondeu **HTTP 404**. A rota existe no código local, mas ainda não está presente na versão Web de produção. Isso explica a incompatibilidade entre Desktop e backend atual; uma mudança somente no Desktop não publica a rota remota.

### Alterações

- `src/server/desktop/config.ts` concentra a origem oficial `https://metalab.cafeflow.com.br`; sem configuração salva, esta é a origem usada. O endereço fica sem `/dashboard`.
- `src/app/api/desktop/connect/route.ts` torna `backendUrl` opcional e escolhe a configuração padrão. Aceita respostas existentes HTTP 200 e cadastros HTTP 201; trata 401 como falha de autenticação, 403 como bloqueio de aluno, 404 como rota remota ausente e 5xx como falha do servidor.
- `src/components/StudentEntry.tsx` remove o campo URL do login comum. Mostra o servidor de forma discreta e abre configuração protegida por autenticação do professor no MetaLab oficial. `navigator.onLine` informa ausência de rede antes do envio.
- `src/app/api/desktop/config/route.ts` valida identidade da autoridade oficial e do destino; só grava após autenticar o professor na rota `/api/teacher/session` do servidor oficial. O valor é salvo cifrado pela tabela local `desktop_secrets`. `src/server/desktop/store.ts` persiste a configuração; provisionamentos ativos mantêm o próprio backend e a outbox não é apagada.
- `src/app/api/desktop/session/route.ts` e `src/hooks/useStudentState.ts` informam qual origem está vinculada à sessão offline atual.
- `src/server/desktop/backend.ts` distingue DNS, timeout, falha de rede, TLS, HTTP 404/401/403/5xx e backend incompatível. Redirecionamentos continuam desabilitados, DNS é validado e fixado por requisição e `rejectUnauthorized` segue `true`.
- `scripts/build-desktop.mjs`, `next.config.ts`, `electron/main.cjs` e `scripts/desktop-flow-check.mjs` aceitam `METALAB_DESKTOP_DIST_DIR` restrito a nomes locais `.next-desktop-*`; isso permite builds e testes separados sem tocar em DLLs de uma saída que o Windows mantenha aberta. O modo de teste seleciona o backend simulado por `METALAB_DESKTOP_TEST_BACKEND_URL`; o Electron não herda essas variáveis.

### Validação

- `GET /api/desktop/identity` em produção: **404**, confirmado sem login, sem escrita e sem dados pessoais.
- `npm run typecheck`: passou.
- `npm test -- --test-reporter=dot`: 13 testes passaram.
- `npm run build`: passou; o build Web contém `/api/desktop/identity`, `/api/desktop/config`, `/api/desktop/connect` e `/api/student/desktop-sync`.
- `npm run desktop:build` com `METALAB_DESKTOP_DIST_DIR=.next-desktop-validation-20261029`: passou.
- `npm run desktop:test` com a mesma saída: passou. O cenário usa somente SQLite temporário e backend falso em loopback; verificou que o padrão dos testes não aponta para produção, autenticação do professor simulada, login sem campo URL, endpoints sem `/dashboard`, 404 diagnosticado antes de enviar dados do aluno, persistência após reinício e retry idempotente.
- Nenhuma migration ou escrita na produção foi executada. A tentativa anterior de teste público de TLS inválido não conseguiu distinguir o certificado porque a conexão externa foi classificada como indisponibilidade; continua pendente um fixture TLS self-signed end-to-end.

### Publicação ainda necessária

Para o login Desktop funcionar contra o domínio oficial, publique o backend Web deste código com, no mínimo, `src/app/api/desktop/identity/route.ts` e `src/app/api/student/desktop-sync/route.ts`, além das alterações relacionadas em `src/server/repository.ts` e da migration Desktop já existente no projeto. Depois do deploy, confirme que `GET /api/desktop/identity` responde HTTP 200 com `application: metalab-pocket`, `capability: desktop-offline-sync` e `protocolVersion: 1`. O deploy não foi realizado nesta tarefa. Até essa publicação, o Desktop apontará automaticamente para o domínio oficial, mas o primeiro provisionamento será recusado com a mensagem específica de rota não publicada; sessões offline válidas e respostas pendentes continuam locais.

## Correção de conexão Desktop com domínio personalizado HTTPS — 29/10/2026

### Causa identificada

`/api/desktop/connect` limitava hosts a `railway.app` e `vercel.app`, então o domínio oficial `metalab.cafeflow.com.br` era rejeitado antes de tentar conectar. A rota também não verificava a identidade do serviço antes de enviar dados do aluno. O campo aceitava a URL do dashboard, mas a conexão não tinha normalização explícita da origem. A rota Desktop de sincronização também reutilizava a URL salva sem revalidar o destino.

### Alterações

- `src/server/desktop/backend.ts`: normaliza apenas `/`, `/dashboard` e `/dashboard/` para a origem; exige HTTPS e porta padrão; rejeita credenciais, query/hash, IP literal, loopback e caminhos arbitrários. Resolve DNS, rejeita qualquer resposta privada/especial e fixa a requisição ao endereço público validado, sem seguir redirecionamentos e com verificação TLS padrão ativa. A resposta `/api/desktop/identity` precisa corresponder ao identificador `metalab-pocket`, capacidade `desktop-offline-sync` e protocolo 1.
- `src/app/api/desktop/identity/route.ts`: publica a identificação mínima, sem cache, para validação prévia.
- `src/app/api/desktop/connect/route.ts`: verifica URL/DNS e identidade antes de enviar dados de login; usa origem normalizada para os endpoints de login e provisionamento; devolve mensagens distintas para URL, destino bloqueado, certificado TLS, indisponibilidade, incompatibilidade, autenticação e erro interno.
- `src/app/api/desktop/sync/route.ts`: resolve e valida DNS e identidade novamente antes de transmitir cada lote, mantendo TLS e sem seguir redirects.
- `src/components/StudentEntry.tsx`: placeholder passa a mostrar `https://metalab.cafeflow.com.br/dashboard`.
- `scripts/desktop-backend-validation.test.mjs` e `scripts/desktop-flow-check.mjs`: cobrem domínio personalizado, normalização de dashboard, caminhos inválidos, DNS privado/misto, identidade pré-login, ausência do caminho nos endpoints e fluxo offline.
- O build Desktop passa a usar `.next-desktop-runtime` como diretório isolado para evitar conflito de substituição de DLL em `.next-desktop`; referências do Electron, empacotador e teste integrado foram atualizadas.

### Verificações realizadas

- `npm run typecheck`: passou após os ajustes finais.
- `npm test -- --test-reporter=dot`: 13 testes passaram após os ajustes finais.
- `npm run build`: passou; rotas `/api/desktop/identity` e `/api/desktop/connect` foram incluídas.
- `npm run desktop:build`: passou em `.next-desktop-runtime`.
- `npm run desktop:test`: passou; 1 teste integrado, usando somente backend simulado em loopback. Comprovou que a identidade incompatível é rejeitada antes do endpoint de login, a URL `/dashboard` gera chamadas sem caminho extra, respostas offline sobrevivem a reinício e a sincronização não duplica a operação.
- O teste de domínio do endpoint oficial usa DNS público simulado; não foram enviados dados nem credenciais à Railway/Vercel/produção.
- A suíte verifica a classificação de erros de certificado e o código usa `rejectUnauthorized: true`. Uma tentativa de GET sem credenciais ao endpoint público de teste `self-signed.badssl.com` terminou classificada como indisponibilidade de rede, sem produzir o erro de certificado esperado; portanto não conta como teste end-to-end de certificado inválido. O certificado/domínio oficial de produção também não foi contactado nesta validação.
- Não foram feitas alterações a migrations, PostgreSQL, regras acadêmicas ou protocolo de sincronização.

### Limitações restantes

- A validação do backend compatível usa um marcador JSON versionado por HTTPS/TLS. Ela confirma que o serviço anuncia a capacidade esperada antes de enviar credenciais, mas não implementa assinatura criptográfica própria do marcador.
- Teste de certificado TLS inválido com servidor TLS de fixture e teste de conexão somente leitura com o domínio de produção permanecem pendentes; nenhum dado de teste foi encaminhado à produção.
- A mudança de diretório de build foi necessária porque uma DLL de Sharp em `.next-desktop` estava em uso e o Windows negou sua remoção. A pasta antiga foi preservada.

## Atualização: servidor oficial padrão e publicação — 29/10/2026

- O Desktop usa `https://metalab.cafeflow.com.br` como origem padrão centralizada em `src/server/desktop/config.ts`; `/dashboard` não faz parte da origem nem dos endpoints de API.
- O login normal não exige digitação do servidor. A origem conectada é indicada na tela e a troca fica na configuração protegida do professor, salva localmente de forma cifrada depois de validar identidade e autenticar no servidor oficial.
- O fluxo offline existente foi preservado: falha de rede não remove sessão, missões, respostas nem operações pendentes. Os testes usam backend simulado e não enviam dados de teste à produção.
- Validações desta implementação: `npm run typecheck`, `npm test -- --test-reporter=dot`, `npm run build`, `npm run desktop:build` e `npm run desktop:test` passaram; o build Desktop/teste integrado usam `.next-desktop-validation-20261029` e backend de teste isolado.
- Verificação somente leitura anterior ao deploy: `GET https://metalab.cafeflow.com.br/api/desktop/identity` respondeu 404, indicando que a versão Web publicada ainda não contém as rotas Desktop. O código local inclui `/api/desktop/identity` e `/api/student/desktop-sync`; publicar o commit na branch de deploy é necessário para provisionamento online.
- Nenhuma credencial de aluno, escrita de teste, migration ou alteração no banco de produção foi feita nesta atualização.
- O relatório será complementado com o commit enviado e o resultado da verificação pós-deploy quando a conectividade com GitHub e o serviço de produção estiver disponível.

## Diagnóstico de indisponibilidade do Desktop — 29/10/2026

### Estado do deploy e causa das falhas

- Branch do deploy: `origin/HEAD` aponta para `origin/main`. O commit `d992c0f` já está em `origin/main`; os checks associados a ele na Vercel e na Railway estão `success`. O branch local `main` ainda aponta para o commit anterior (`6d52d7d`); o branch de trabalho `codex/desktop-offline-phase1` era o que estava alinhado com `origin/main` no início desta correção.
- A resposta 404 antiga ocorreu antes de a versão com `/api/desktop/identity` chegar ao deploy. Após o deploy automático do commit `d992c0f`, a consulta pública retornou HTTP 200 e o corpo exato `{"application":"metalab-pocket","capability":"desktop-offline-sync","protocolVersion":1}`.
- A falha genérica ainda vista no cliente Desktop tinha outra causa: `requestDesktopBackend` fixava o IP DNS com um callback que só devolvia `(endereço, família)`. O Node no Windows pode chamar esse callback com `options.all === true`; nesse modo exige uma lista de endereços. O formato incorreto gerava `ERR_INVALID_IP_ADDRESS`, que era mapeado como `server_unavailable`. A reprodução com o callback anterior falhou; a mesma chamada HTTPS com o formato `all` correto recebeu HTTP 200 e identidade válida.
- A autenticação docente usa corretamente `POST /api/teacher/session` com `{ cpf, password }`; o endpoint exige origem igual ao host, retorna `authenticated: true` e cookie `metalab_teacher_session` no sucesso. A configuração valida a identidade antes de transmitir credenciais e só salva o servidor depois de validar o cookie. Nenhuma credencial real foi enviada durante este diagnóstico.

### Correção local preparada

- `src/server/desktop/backend.ts`: callback DNS pinado agora respeita ambos os contratos do Node (`all: true` retorna lista; caso contrário retorna endereço e família), preservando o IP público validado, SNI e `rejectUnauthorized: true`.
- `scripts/desktop-backend-validation.test.mjs`: regressão automatizada para os modos single e `all` do callback.
- `src/app/api/desktop/config/route.ts`: incompatibilidade do backend tem mensagem explícita; as mensagens específicas de rota ausente, DNS, TLS, timeout, autenticação, autorização e indisponibilidade permanecem.
- `GET /api/desktop/identity` em produção: HTTP 200 e marcador esperado. A mesma implementação cliente do Desktop, já com a correção local, validou a identidade via HTTPS.
- `GET /api/student/desktop-sync` em produção: HTTP 405, esperado porque a rota aceita POST; isso confirma que a rota está publicada sem criar provisionamento. `GET /dashboard`: HTTP 200.
- A build Web lista `/api/desktop/identity` e `/api/student/desktop-sync`. As rotas locais de configuração/conexão/sessão/sincronização exigem `METALAB_DESKTOP_MODE=1` ou passam por `isDesktopSameOrigin`, que exige o modo local; a rota pública `identity` só divulga o marcador de compatibilidade. A rota remota de sincronização exige sessão autenticada ou token de provisionamento.
- Verificação dos artefatos: zero arquivos `.env*` e zero bancos SQLite dentro de `.next/server` e do standalone Desktop. A migration 015 continua compatível com as tabelas existentes e consta aplicada anteriormente; não foi executada nem reaplicada.

### Testes e limites

- `npm run typecheck`: passou.
- `npm test`: 14 testes passaram, incluindo a regressão de callback DNS.
- `npm run build`: passou e lista ambas as rotas Desktop remotas.
- `METALAB_DESKTOP_DIST_DIR=.next-desktop-final-20261029 npm run desktop:build`: passou.
- `METALAB_DESKTOP_DIST_DIR=.next-desktop-final-20261029 npm run desktop:test`: passou; usa SQLite temporário e backend simulado.
- `npm run desktop` não existe em `package.json`; o script de execução é `npm run desktop:run`. Esse script iniciou o Electron local e exibiu o servidor oficial padrão. O cliente corrigido também validou a identidade real por GET, sem enviar dados de aluno. Não foi feito login docente nem provisionamento: isso exige credenciais de uma conta de teste autorizada e o provisionamento cria dados em PostgreSQL.
- Nenhum deploy foi iniciado nesta etapa. A correção de DNS e este relatório estão apenas no branch local de trabalho; publicar esse commit na `main` causará um novo deploy e depende de confirmação explícita do usuário.
- O instalador NSIS existente é anterior a esta correção e não foi reinstalado nem validado com autenticação. Para encerrar a validação ponta a ponta ainda falta publicar a correção, gerar/instalar a versão Desktop atualizada e testar com conta e turma de teste autorizadas.

**Estado:** as rotas Web estão publicadas e a identidade do backend é validada pelo cliente corrigido; o erro DNS foi isolado e corrigido localmente. A conexão autenticada do aluno/professor e a sincronização de dados reais não foram testadas. Aguarda-se autorização para publicar o commit local e, depois, dados de teste autorizados para a validação ponta a ponta.

## Fase 1.2 — Central de Sincronização — 29/10/2026

### Auditoria e decisões

- Reutilizado o único motor existente: `/api/desktop/sync` lê a outbox SQLite e envia respostas com os mesmos UUIDs idempotentes e a sessão de provisionamento já emitida pelo backend.
- A outbox existente mantinha respostas cifradas e os estados `pending`, `syncing`, `synced`, `conflict`, `needs_auth` e `error`, mas não oferecia contagem completa, histórico, progresso por rodada, preferências persistentes, backoff ou trava concorrente.
- A implementação acrescenta a versão 2 do schema **local SQLite** sem remover ou reescrever respostas existentes. Nenhuma migration PostgreSQL foi criada ou executada.
- Para distinguir conectividade de autorização sem enviar respostas, o backend Web recebeu a ação somente leitura `POST /api/student/desktop-sync` com `{ "action": "authorize" }` e o token da provisão no cabeçalho `Authorization`. Ela verifica validade da provisão e vínculo atual com a turma; não cria operações acadêmicas.
- A validação de rede continua usando HTTPS/TLS e identidade do MetaLab já existentes. A página informa separadamente o sinal de rede do dispositivo e o resultado do probe da API oficial.

### Arquivos criados e alterados

- Criados `src/app/sincronizacao/page.tsx`, `src/app/sincronizacao/SyncCenter.tsx`, `src/components/DesktopSyncCoordinator.tsx` e `src/app/desktop-sync.css` para a página, controles e coordenação automática apenas no shell Desktop.
- `src/components/AppShell.tsx` mostra “Sincronização” somente no Desktop e aceita a rota Desktop na navegação; a visita à rota pela Web retorna ao dashboard. O coordenador não importa Electron e não introduz dependência Electron no bundle Web.
- `src/server/desktop/store.ts` adiciona schema local v2 para preferências, rodadas, histórico sanitizado, leases entre processos e data de retry. As missões em cache voltam a ser ordenadas pela posição acadêmica.
- `src/server/desktop/auth.ts` adiciona validação de leitura local com Host loopback e Origin validado quando presente; operações de escrita continuam exigindo same-origin estrito.
- `src/app/api/desktop/sync/route.ts` congela o total da rodada, valida identidade e autorização antes de enviar respostas, aplica idempotência existente, atualiza confirmações reais e impede rodadas concorrentes entre processos.
- Criadas `src/app/api/desktop/sync/status/route.ts` e `src/app/api/desktop/sync/preferences/route.ts` para diagnóstico protegido, contagens e configurações locais com intervalo permitido de 30 a 300 segundos.
- `src/server/desktop/backend.ts` valida a autorização do token Desktop sem enviar conteúdo da outbox.
- `src/app/api/student/desktop-sync/route.ts` implementa a verificação remota somente leitura da provisão e da turma.
- `src/app/missoes/ClassroomMissions.tsx` deixa de disparar sincronização implícita ao abrir a página; a coordenação central respeita preferências, pausa e reconexão.
- `scripts/desktop-flow-check.mjs` estende o teste de integração para preferências, concorrência entre dois processos, resposta perdida, retry, sessão expirada, conflito, rejeição, progresso e sanitização.

### Estados, política de retry e proteção

- O resumo conta respostas confirmadas, pendentes, em processamento, com falha, em conflito e aguardando autorização. Histórico contém horário, tipo genérico da operação, resultado, tentativas e somente códigos de erro sanitizados; respostas, tokens e detalhes privados do servidor não são exibidos.
- Cada rodada grava um total fixo. O numerador cresce somente após resultado `synced` válido do servidor; conflito, rejeição, autorização expirada e resposta ausente não aumentam o progresso.
- Falhas transitórias de DNS, rede, timeout, TLS ou HTTP 5xx recebem backoff exponencial com jitter: começa em 15 segundos e é limitado a uma hora. Autorização expirada, backend incompatível, operação inválida e conflitos não entram em repetição automática infinita. “Sincronizar agora” pode ignorar o backoff de falhas; uma pausa bloqueia qualquer nova rodada, manual ou automática.
- Pausar não cancela uma rodada já em andamento. Um lease persistente de dez minutos, renovado por lote, impede outro processo Next de iniciar uma rodada simultânea. No boot, operações `syncing` só são recuperadas depois que o lease expirou; seus IDs idempotentes são preservados.
- As preferências são por provisão/aluno e permanecem no SQLite local. A saída da sessão não apaga a outbox. O histórico fica restrito à sessão local autenticada.

### Validação desta fase

- `npm run typecheck`: passou.
- `npm test`: passou, 14 testes.
- `METALAB_DESKTOP_DIST_DIR=.next-desktop-phase12 npm run desktop:build`: passou e listou `/sincronizacao`, `/api/desktop/sync/status`, `/api/desktop/sync/preferences` e `/api/student/desktop-sync`.
- `METALAB_DESKTOP_DIST_DIR=.next-desktop-phase12 npm run desktop:test`: passou. O fixture usa backend falso em loopback e SQLite temporário. Verificou respostas após reinício, configurações persistentes, pausa, sessão expirada separada de conectividade, retry após backoff, idempotência, rejeição sem retry automático, conflito, progresso confirmado e duas instâncias Next tentando sincronizar ao mesmo tempo.
- `npm run build` Web: passou; listou a rota `/sincronizacao` e as APIs novas, sem falhas de compilação.
- A primeira execução do teste integrado no sandbox não conseguiu acessar loopback; a execução autorizada fora do sandbox passou usando somente fixture local. O build Desktop/Web também precisou executar fora do sandbox para criar artefatos Next sob ACL local restritiva.
- Nenhum dado de teste foi enviado à Railway, à Vercel ou ao domínio de produção; nenhuma migration ou escrita em PostgreSQL foi feita. O teste não valida autorização com conta real nem prova que o backend publicado já contém a nova ação `authorize`.

### Pendências de publicação e distribuição

- O backend de produção precisa receber `src/app/api/student/desktop-sync/route.ts` para que o probe de autorização funcione. Nenhum deploy foi executado nesta fase.
- O build do instalador NSIS, instalação limpa Windows e teste ponta a ponta com uma conta de teste permanecem pendentes; `desktop:build` valida o runtime standalone, não o instalador final.
- A migration v2 é local e aplicada ao abrir o SQLite existente. Não há mudança no schema PostgreSQL nem nos contratos de sincronização de respostas.

## Fase 1.3 — Homologação e preparação para distribuição — 29/10/2026

### Auditoria e estado de publicação

- Branch de trabalho confirmada: `codex/desktop-offline-phase1`, HEAD local `561254e`. O diretório de trabalho já continha alterações não commitadas da Fase 1.2 e um arquivo histórico não relacionado (`HISTORICO_ATIVIDADES_CODIGO_COMPLETO.txt`), que foi preservado e excluído do escopo desta implementação.
- `main` local também aponta para `561254e`; a referência local `origin/main` continua em `d992c0f`. A consulta somente leitura `git ls-remote origin refs/heads/main` falhou por DNS indisponível neste ambiente, portanto não foi possível confirmar se a referência remota avançou nem identificar o commit atualmente implantado.
- A consulta pública somente leitura ao endereço oficial `GET https://metalab.cafeflow.com.br/api/desktop/identity` respondeu com `application: metalab-pocket`, `capability: desktop-offline-sync` e `protocolVersion: 1`. Isto confirma a identidade pública neste momento, mas não revela o commit implantado e não prova que a ação nova `recover` ou a ação `authorize` da Fase 1.2 estejam publicadas.
- O código continua compatível com a migration PostgreSQL `015_desktop_offline_sync.sql`: a recuperação reutiliza colunas existentes (`sync_token_hash`, `expires_at`, `class_id`, `revoked_at`) e não requer migration adicional. A migration 015 não foi reaplicada; não houve leitura/escrita de banco de produção.
- Não foi feito push, deploy nem chamada autenticada ao backend de produção. A rota remota `recover` só foi exercitada no fixture HTTP local.

### Política para respostas após sete dias

- Decisão confirmada pelo usuário: o aluno precisa autenticar online novamente; o servidor verifica a identidade do aluno, a provisão original, a revogação e o vínculo com a turma antes de emitir autorização renovada. O servidor continua decidindo cada resposta no momento da sincronização, comparando a missão com o snapshot autorizado.
- `POST /api/student/desktop-sync` agora aceita `{ action: "recover", provisionId }` apenas com sessão autenticada do aluno. Em transação PostgreSQL, bloqueia a provisão, confirma a matrícula na mesma turma, gira o hash do token e estende a validade por sete dias. Não altera snapshots, respostas, IDs idempotentes ou entregas acadêmicas.
- No Desktop, o login online procura uma provisão com respostas pendentes bloqueadas por autorização ou ainda não sincronizadas de uma provisão expirada. Se a origem do servidor mudou, a operação para com erro claro e mantém as respostas locais. Se a recuperação remota falhar, não cria outra provisão por cima das respostas pendentes. Após sucesso, o SQLite atualiza os tokens cifrados, preserva `operation_id` e `provision_id`, e reabre para sincronização apenas itens `needs_auth`; conflitos e falhas definitivas permanecem separados.
- Não há migration PostgreSQL nesta decisão. A operação é restrita ao aluno identificado pela sessão remota e não é exposta como operação privilegiada no shell Web.

### Arquivos desta fase

- `src/server/repository.ts`: renovação transacional da autorização para a mesma provisão e turma.
- `src/app/api/student/desktop-sync/route.ts`: ação autenticada `recover`.
- `src/app/api/desktop/connect/route.ts` e `src/server/desktop/store.ts`: recuperação no login, atualização cifrada e reativação segura da outbox bloqueada.
- `scripts/desktop-flow-check.mjs`: cobertura simulada de operação pendente, reautenticação, rotação de token, preservação dos identificadores, confirmação e histórico.
- `electron-builder.config.cjs`: origem e saída do empacotamento passaram a aceitar diretórios de validação locais restritos, sem substituir o instalador anterior; o runtime empacotado usa o mesmo diretório produzido por `desktop:build`.
- `electron/main.cjs`: tentativa de diagnóstico local sanitizado para falhas de inicialização, sem tokens ou respostas.
- A Fase 1.2 segue junto na branch local: `src/app/sincronizacao/**`, `src/app/api/desktop/sync/**`, `src/app/api/student/desktop-sync/route.ts`, `src/app/layout.tsx`, `src/components/AppShell.tsx`, `src/components/DesktopSyncCoordinator.tsx`, `src/app/missoes/ClassroomMissions.tsx`, `src/server/desktop/{auth,backend,store}.ts`, `scripts/desktop-flow-check.mjs` e esta documentação.

### Testes e resultados

- `npm run typecheck`: passou.
- `npm test`: passou, 14 testes.
- `npm run build`: passou; o build lista `/api/student/desktop-sync`, a Central `/sincronizacao` e as APIs locais de sincronização.
- `METALAB_DESKTOP_DIST_DIR=.next-desktop-phase13 npm run desktop:build`: passou e gerou o runtime Next standalone isolado.
- `METALAB_DESKTOP_DIST_DIR=.next-desktop-phase13 npm run desktop:test`: passou; o teste integrado usou apenas backend falso em loopback e SQLite temporário. Verificou persistência/reinício, concorrência, backoff, idempotência, autorização expirada, recuperação do mesmo provisionamento e sincronização da resposta sem duplicação.
- `METALAB_DESKTOP_DIST_DIR=.next-desktop-phase13 METALAB_DESKTOP_RELEASE_DIR=dist/desktop/release-phase13 npm run desktop:dist:win`: passou e gerou `dist/desktop/release-phase13/MetaLab Pocket Setup 1.0.0.exe` (~201 MB), além do app `win-unpacked`. O pacote não possui assinatura digital; o empacotador informa que não há certificado configurado.
- Uma instalação silenciosa anterior do NSIS em pasta temporária terminou com código 0; o executável instalado fechou logo após iniciar, sem criar chave de dados/SQLite ou responder em `/api/desktop/health`. Depois de gerar o artefato final, as tentativas de atualização/reinstalação silenciosa retornaram código 2, inclusive em uma pasta nova sem espaços. O arquivo `.exe` foi criado pelo empacotador, mas a instalação final não foi confirmada. O processo não produziu o novo arquivo local de diagnóstico e a inicialização não foi concluída; a causa permanece desconhecida. Não é válido classificar isto como teste de janela bem-sucedido.
- A distribuição inclui `public/simulator` (incluindo assets e arquivos Three.js). A inspeção do runtime empacotado encontrou zero arquivos `.env*` e zero bancos `.sqlite`. Os recursos foram inspecionados, mas não exercitados na janela Desktop.
- `git diff --check`: passou com avisos de conversão LF/CRLF do checkout.

### Limites, impacto Web e rollback

- **Estado da fase: parcial e bloqueada para distribuição.** O fluxo vertical foi validado contra backend simulado, não contra PostgreSQL real; a instalação completou, mas o app instalado não concluiu a inicialização neste ambiente. Permanecem sem teste: login com aluno de homologação, provisionamento real, entrega confirmada pelo servidor, reconexão real, preferências após atualização e encerramento normal do app.
- Não há conta/aluno de teste autorizado fornecido para escrita. Nenhuma credencial ou resposta real foi transmitida. A validação de `/api/student/desktop-sync` no backend de produção deve ocorrer só depois de push/deploy autorizados e com conta/turma de homologação isoladas.
- A Web compilou sem regressões observadas. O endpoint `recover` exige sessão remota de aluno e a origem same-origin existente; nenhuma interface ou regra acadêmica Web foi alterada.
- As alterações permanecem na branch `codex/desktop-offline-phase1`. Rollback de código: reverter o commit desta branch quando preparado; não há migration remota a reverter. O instalador de validação está em `release-phase13` e o artefato anterior em `dist/desktop/release` foi preservado.
- Próximo passo: diagnosticar a inicialização do Electron instalado no Windows, depois publicar backend e Desktop apenas com autorização explícita, e homologar usando aluno/turma de teste autorizados. Não iniciar outras fases antes dessa validação.
