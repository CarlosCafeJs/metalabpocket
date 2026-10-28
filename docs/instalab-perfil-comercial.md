# InstaLab: curtidas e perfil comercial

O InstaLab agora identifica cada publicação pelo nome da empresa cadastrada em **Minha Empresa** e mostra o nome do aluno abaixo. Segmento e descrição são consultados da mesma empresa no banco; não há cópia separada desses dados. O perfil próprio permite pré-visualizar, salvar, substituir e remover uma foto. A foto aparece nos posts e comentários da turma, e no feed do professor.

As curtidas usam um joinha de contorno/preenchido e mantêm os registros atuais. O botão e a ação de compartilhar foram removidos.

## Banco de dados

A nova migração aditiva é `db/migrations/012_instalab_student_avatars.sql`. Ela adiciona colunas para guardar a imagem no PostgreSQL e uma restrição de tamanho/formato. Nenhuma migração foi executada durante esta alteração.

Antes de aplicar em um banco com dados reais, confirme que `DATABASE_URL` aponta para o banco pretendido e tenha um snapshot/backup disponível. No terminal local do projeto, com a conexão já configurada, rode:

```powershell
npm run db:migrate
```

O script aplica as migrações pendentes em transação e registra a 012 em `metalab_schema_migrations`. Depois, publique o código. A rota de perfil depende da migração 012 estar aplicada.

## Permissões e armazenamento

O upload aceita JPEG, PNG e WebP até 2 MB, valida a estrutura do arquivo e remove metadados EXIF/XMP/textuais comuns antes de armazenar. Os bytes ficam em `metalab_students`; o nome original do arquivo não é guardado. A rota de avatar exige sessão válida e só entrega imagens a colegas da mesma turma com empresa cadastrada ou ao professor autenticado. O histórico diário registra atualização/remoção quando `metalab_student_activity_events` estiver instalado, sem guardar bytes da imagem.

## Validação feita

- `npm run typecheck` passou.
- `npm test` passou: 3 testes, incluindo limpeza de metadados PNG e rejeição de MIME/conteúdo incompatível.
- `git diff --check` passou.
- `npm run build` não concluiu: o Next.js recebeu `EPERM` ao criar diretórios em `.next` e também em uma pasta de saída isolada. Não alterei o build do usuário nem executei migração.

Não foi possível consultar a branch mais recente no GitHub nesta sessão porque `github.com` não resolveu por DNS. A implementação foi feita sobre o checkout local disponível.
