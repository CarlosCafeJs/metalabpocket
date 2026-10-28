# Histórico diário de atividades dos alunos

O painel do professor exibe uma linha do tempo por aluno na aba **Alunos**. Ela permite consultar um dia, intervalo ou histórico completo, avançar/voltar dias, localizar dias que já têm eventos, paginar registros e imprimir relatórios em PDF pelo diálogo de impressão do navegador.

## Arquitetura

A migração `011_student_activity_history.sql` cria `metalab_student_activity_events`, um registro append-only com UUIDs/referências dos dados relacionados, instante `TIMESTAMPTZ`, fuso de apresentação `America/Sao_Paulo`, tipo de ator, turma, entidade e payload JSONB. Índices atendem consulta por aluno, ator e turma. Gatilhos PostgreSQL gravam os eventos dentro da mesma transação da gravação original. A rota de leitura exige sessão válida do professor, valida o UUID, limita páginas a 100 eventos e usa parâmetros SQL.

O histórico inclui cadastro, arquivamento/restauração, empresa, progresso/tentativas de missões, tarefas e entregas, publicações/edições/exclusões, curtidas e comentários do InstaLab, fotos recebidas/atualizadas/removidas, associação a turmas e início/encerramento explícito de sessões. Curtidas/comentários aparecem para o autor e para o aluno dono da publicação. Respostas, legendas e comentários ficam em snapshots; bytes de fotos e anexos, hashes/tokens de sessão, CPF e senhas não entram no histórico.

## Limites dos dados anteriores

A migração recupera apenas datas e fatos ainda presentes nas tabelas: cadastro, envio/recebimento de arquivos, respostas da Missão da Turma, publicações existentes, comentários/curtidas atuais, associação de turma registrada e sessões criadas/revogadas. Datas de foto representam o recebimento pelo servidor; a captura informada pelo celular não é considerada confiável.

Para registros antigos do InstaLab, a data de criação é preservada, mas a legenda original pode ter sido editada e não existe versão histórica no banco; o evento antigo informa essa limitação. Uma empresa e cada progresso de missão recebem um marco de estado atual na instalação da migração; versões anteriores e respostas de tentativas sobrescritas não podem ser reconstruídas. O sistema não atribui esse estado a uma data anterior nem cria eventos fictícios. Transferências de turma anteriores à migração também não podem ser recuperadas; somente o vínculo corrente e seu `assigned_at` permanecem conhecidos.

Depois que a migração estiver ativa, cada nova alteração de empresa, tentativa de missão e interação é preservada com os estados anterior/posterior disponíveis. Entregas e envios já são registros próprios e passam a gerar eventos automaticamente.

## Implantação segura

1. Faça backup/snapshot do banco que será migrado.
2. Confira, sem revelar o valor, que `DATABASE_URL` aponta para o banco esperado e que suas migrations anteriores estão aplicadas.
3. Em um banco de teste descartável, aplique a migration e valide criação de empresa, atualização, tentativa repetida, comentário/curtida, envio de tarefa, foto, troca de turma e consulta como professor.
4. Só então aplique ao banco real com `npm run db:migrate`. O comando aplica migrations pendentes em ordem e registra cada uma em `metalab_schema_migrations`.
5. Implante a aplicação com a mesma migration 011. Antes da migration, a nova rota retorna indisponibilidade; depois dela, a aba de alunos poderá consultar os eventos.

Não rode `npm run db:migrate` enquanto `DATABASE_URL` não tiver sido conferida. Nesta implementação a migration 011 foi criada localmente e **não foi executada** contra Railway nem outro banco real.

## PDFs

Os botões **PDF do dia**, **PDF do período** e **PDF do histórico completo** carregam todas as páginas necessárias e abrem o diálogo do navegador; selecione **Salvar como PDF**. Para evitar documentos excessivos, a impressão completa limita-se a 5.000 eventos e solicita período menor se esse limite for excedido.
