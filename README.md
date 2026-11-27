# Edu Café Flow

Plataforma educacional em Next.js, React e PostgreSQL para organizar turmas, propor missões e entregas, trocar ideias no InstaFlow e Fórum, criar apresentações e acompanhar a aprendizagem.

## Áreas

- **Aluno:** Central, Perfil, Minha Turma, Missões, InstaFlow, Entregas e Fórum.
- **Professor:** turmas e matrículas, missões de sala, acompanhamento das entregas, InstaFlow, apresentações e administração de contas docentes.
- **Contas:** aluno entra com CPF ou e-mail e senha; professor solicita cadastro e permanece sem acesso até ser aprovado por um administrador. O acesso docente usa contas no banco, não credenciais fixas de ambiente.
- **Arquivos da turma:** professores compartilham documentos com uma turma específica; somente alunos atualmente vinculados à turma podem listar e baixar os materiais. Arquivos de até 15 MB ficam no PostgreSQL e a aba do aluno aparece como **Materiais**.
- **MetaCoins e anúncios:** carteira, campanhas, aprovação e cobrança continuam no escopo funcional.
- **Desktop:** Electron e sincronização offline permanecem no repositório; os contratos internos só devem mudar com validação de compatibilidade.

## Executar localmente

1. Instale Node.js compatível com Next.js 16.
2. Instale as dependências com `npm ci`.
3. Copie `.env.example` para `.env.local` e configure um PostgreSQL **isolado de produção**.
4. Configure os segredos de CPF conforme `.env.example`; use segredos aleatórios com pelo menos 32 bytes e não os exponha no cliente.
5. Rode `npm run dev` e acesse `http://localhost:3000`.

`npm run db:migrate` aplica, em ordem, todas as migrations SQL ainda ausentes no `DATABASE_URL` carregado pelo processo. O runner atual não tem seleção de baseline nem proteção suficiente para impedir um alvo incorreto. **Não execute esse comando com o `.env.local` atual nem aponte-o ao banco publicado:** ele pode alterar produção. Consulte [a auditoria da reinicialização do banco](docs/edu-cafe-flow-database-reinitialization.md) antes de qualquer migration.

Para criar o primeiro administrador, o script explícito `npm run teacher:bootstrap-admin` usa os parâmetros listados no `.env.example`; ele não é executado durante a inicialização do app. Faça esse provisionamento somente em um banco novo autorizado e por um terminal seguro.

## Verificações locais

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run desktop:build`
- `npm run desktop:test`

## Banco e publicação

O serviço Railway publicado continua no ar e ligado ao banco antigo. A limpeza do banco e a criação da baseline nova estão em auditoria; não há corte de conexão, deploy ou push autorizado nesta etapa. Não use dados de produção em testes. A estratégia, o inventário de módulos e as pendências estão em [docs/edu-cafe-flow-database-reinitialization.md](docs/edu-cafe-flow-database-reinitialization.md).

O repositório também contém `vercel.json`, mas a existência desse arquivo não confirma que haja um projeto Vercel ativo. Confirme destinos e variáveis protegidas antes de planejar a troca do banco.
