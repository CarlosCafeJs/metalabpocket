# Reidentificação do CaféFlow Pocket

A interface web, as áreas do aluno e do professor e os materiais de apresentação usam a identidade CaféFlow Pocket, com fundo carvão, verde e verde-lima. O wordmark recebido está em `public/branding/cafeflow-logo.png`.

## Compatibilidade preservada

Esta troca altera nomes e identidade visual apresentados às pessoas. Os nomes existentes no PostgreSQL, migrações, cookies, variáveis de ambiente `METALAB_*`, cabeçalhos HTTP, nomes de eventos e identificadores do protocolo Desktop permanecem para manter acesso aos dados e à sincronização existente. O `appId` do instalador Electron também permanece igual para que instalações atualizadas conservem o mesmo perfil local. A decisão posterior de produto removeu o telefone virtual, a câmera simulada e os respectivos assets; registros antigos de fotos continuam no banco.

As URLs e a identidade pública do backend continuam sendo os contratos de produção já configurados. A renomeação visual não muda domínio, credenciais, permissões acadêmicas nem operações de banco.

## Validação da reidentificação

- `npm run typecheck`: concluído sem erros.
- `git diff --check`: sem erros de whitespace.
- `npm run build`: não concluiu. O Next.js recebeu `EPERM` ao criar `.next/server/app/api/desktop` no Windows. A pasta `.next` foi preservada; ela contém artefatos locais existentes e não foi removida para forçar o build.
- Testes automatizados não foram executados nesta alteração visual.
