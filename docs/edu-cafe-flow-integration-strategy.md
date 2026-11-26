# Estratégia de integração — nova área docente Edu Café Flow

> **Atualização em 26/11/2026:** os itens abaixo em “Estado inicial observado” e “Estratégia não destrutiva” registram a auditoria feita antes da implementação. A consolidação local posterior está descrita em `docs/edu-cafe-flow-consolidation.md`: autenticação docente por variáveis de ambiente foi removida, a migration 019 foi criada e a 020 proposta. Nenhuma delas foi aplicada durante esta etapa; confirme o schema no banco antes de implantação.

## Estado inicial observado em 25/11/2026

- Checkout: `codex/desktop-offline-phase1`, HEAD `e27865d`.
- A árvore já contém trabalho não commitado de Desktop, cadastro de alunos, branding, remoção local de simuladores e Apresentações. As migrations 017 e 018 também estão somente no checkout.
- A ref local `origin/main` está em outra linha de Apresentações e não contém os commits Desktop posteriores. Não houve fetch, então as refs locais não comprovam o estado remoto/deploy.
- Os relatórios `EDU_CAFE_FLOW_AUDITORIA_INTEGRAL.md` e `EDU_CAFE_FLOW_CONTEXTO_PARA_CHATGPT.md` confirmam que o professor ainda usa autenticação por variáveis de ambiente e que as APIs/consultas docentes são globais; `metalab_classes` não tem responsável.
- Nenhum banco, migration, deploy, dado externo ou segredo foi consultado ou alterado.

## Estratégia não destrutiva

1. Trabalhar sobre o checkout ativo, sem reset, limpeza, checkout de outra branch, rebase ou merge.
2. Adicionar migrations versionadas depois da última migration presente no checkout (018), sem executá-las.
3. Preservar tabelas, linhas e nomes internos legados; deixar turmas existentes com `teacher_id` nulo até o administrador mapear responsáveis.
4. Introduzir autenticação individual em módulos novos. O fluxo antigo de credenciais de ambiente permanece como transição controlada até que exista e seja validado o provisionamento do primeiro administrador; não será promovido automaticamente por CPF/e-mail recebido do navegador.
5. Restringir por padrão o novo fluxo a professor ativo e a turmas explicitamente atribuídas. Operações globais, quando ainda não puderem receber escopo seguro, permanecem exclusivas de administrador/transição em vez de expor dados a novos professores.
6. Mudanças de marca são somente de interface; contratos, tabelas e IDs antigos são mantidos para compatibilidade.
7. A validação usa testes unitários e build locais. Nenhuma variável `.env`, banco real, serviço remoto ou credencial de produção será usada.

## Conflitos conhecidos e integração futura

- A origem correta para uma integração completa ainda não está definida: a linha Desktop e `origin/main` local divergiram. Este trabalho não decide nem resolve essa divergência.
- Alterações comuns a `teacher-auth.ts`, `repository.ts`, painel docente e menu precisam ser reaplicadas/reconciliadas quando a branch Web de Apresentações e a linha Desktop forem consolidadas.
- As migrations 017/018 e quaisquer mudanças existentes não serão sobrescritas. A nova numeração começa em 019 neste checkout; antes de implantação, conferir ledger e schema no ambiente de destino.
- Conteúdo docente legado global, turmas sem responsável e atividades existentes exigem associação explícita ou acesso administrativo. Nenhuma atribuição automática será feita.

## Fases desta implementação

- Fundação aditiva: contas docentes, sessões revogáveis, auditoria e coluna opcional de responsável da turma.
- Cadastro/login e controles de conta: pending por padrão, aprovação apenas por administrador autenticado, suspensão checada em toda sessão.
- Escopo: professor comum só consulta/edita turmas atribuídas e alunos nelas; endpoints globais ainda não adaptados não serão habilitados para professor comum.
- Interface e módulos: renomear rótulos, preservar recursos, integrar Missão Turma e ocultar/desativar Missão Relâmpago somente após revisar consumidores.

## Limites atuais

Este documento registra a estratégia antes das alterações compartilhadas. As migrations são apenas arquivos locais e ainda não foram aplicadas. O cadastro não deve ser considerado implantável até que o bootstrap seguro do administrador, as permissões de todos os endpoints e os testes de isolamento estejam concluídos em uma base descartável.

## Progresso da implementação local em 25/11/2026

- A fundação aditiva, solicitação pendente, login individual, sessão revogável, aprovação administrativa, atribuição explícita de turmas e escopos de professor comum foram implementados localmente.
- A migration 019 continua sem execução; nenhum banco foi consultado nesta etapa.
- Typecheck, 26 testes unitários, build Web, `npm run desktop:build` e `npm run desktop:test` passaram. O teste Desktop usou backend mock e SQLite temporário, validando persistência offline, retomada, reautorização e retry sem duplicação. Para isso, o teste foi alinhado ao contrato atualizado de cadastro/login por senha; nenhum teste apontou para produção.
- O relatório detalhado de configuração e pendências está em `docs/edu-cafe-flow-teacher-accounts.md`.
- A autorização por turma tem cobertura de compilação e testes da política de transição de conta, mas ainda requer teste de integração com PostgreSQL descartável, incluindo tentativas cruzadas entre professores.
