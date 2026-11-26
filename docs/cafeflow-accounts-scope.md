# CaféFlow Pocket: contas e escopo educacional

## Mudanças

- Cadastro novo: nome, e-mail, CPF, nascimento e senha com no mínimo 12 caracteres.
- Login: CPF ou e-mail e senha.
- CPF é normalizado e armazenado somente como HMAC-SHA-256. A senha usa scrypt com salt aleatório.
- Alunos sem turma não entram nas áreas de aprendizagem protegidas.
- O telefone virtual, câmera e estúdio 3D, galeria local e Kit Digital foram removidos da aplicação. Turmas, Minha Empresa, InstaLab, Missões, entregas, área do professor e Apresentações permanecem.

## Dados antigos

A migração `018_student_password_accounts.sql` adiciona campos opcionais de credenciais. Registros antigos permanecem com `cpf_digest` e `password_hash` nulos: não conseguem autenticar, não são reutilizados por um cadastro novo e não aparecem na lista ativa do professor. Progresso, entregas, publicações, vínculos, eventos e imagens antigos não são apagados nem migrados para outra conta.

Os endpoints de captura estudantil e as páginas do simulador foram retirados. As tabelas e registros de fotos anteriores permanecem no PostgreSQL; nenhuma migração de exclusão foi criada.

## Configuração e ativação

Defina `METALAB_STUDENT_CPF_PEPPER` como segredo aleatório de pelo menos 32 bytes no ambiente Web e em qualquer ambiente Desktop que encaminhe cadastro/login ao mesmo banco. Use o mesmo valor entre instâncias que precisam localizar as mesmas contas; não o envie ao navegador, não o inclua no instalador e não o registre em logs. Perder ou trocar o pepper impede localizar contas pelo CPF, embora o login por e-mail continue possível.

Depois de configurar o segredo, publique a aplicação correspondente. A migração 018 foi aplicada ao PostgreSQL Railway e é aditiva; não removeu linhas antigas. Este trabalho não realizou deploy.

## Validação realizada

- A migration `018_student_password_accounts.sql` foi aplicada no PostgreSQL Railway configurado localmente. O runner informou apenas essa migração como pendente; as anteriores, incluindo `017`, já estavam registradas como aplicadas.
- O typecheck completo (`npm run typecheck`) foi impedido por arquivos de rotas antigos em `.next/dev/types`, que continuam citando páginas e APIs removidas. Os tipos de produção foram atualizados com `npx next typegen`; `.next` não foi limpo.
- Um typecheck isolado dos arquivos-fonte passou.
- Testes, build Web, instalação Desktop e deploy não foram executados nesta alteração.

O login por CPF e cadastro exigem `METALAB_STUDENT_CPF_PEPPER` configurado no backend. A verificação local confirmou que `.env.local` ainda não define essa variável; a configuração de produção precisa ser confirmada no painel da Railway. O valor não é armazenado no repositório. O login por e-mail não calcula o HMAC, mas o cadastro sempre precisa do segredo.
