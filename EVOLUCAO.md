# Evolução do MetaLab Pocket

## Estado atual verificado

- `dist/index.html` e `dist/app.js`: celular virtual, loja fictícia, trilha de cinco módulos, galeria, segurança, oficina de conteúdo, roteiro e agenda.
- `dist/phone-model.js`: modelo 3D do celular na página inicial, integrado à tela HTML interativa.
- `dist/camera-studio.html` e `dist/camera-studio.js`: estúdio 3D com caneca, tênis e camisas; ângulo, altura, distância, prévia e captura.
- `dist/gallery-store.js`: armazenamento local das fotos e exportação para o computador.
- `dist/business-apps.js`: WhatsApp Business e Instagram simulados, sem serviços externos.
- `dist/design-tokens.css`: tokens compartilhados. O roxo da imagem de referência foi amostrado como `#1D1230`.
- `api/students.js`: registro inicial de nome, e-mail e nascimento em PostgreSQL. A função depende de `DATABASE_URL` protegida no servidor.

## Lacunas e evolução incremental

1. **Integração pedagógica:** substituir a conclusão manual dos módulos por missões verificáveis e persistir progresso associado a um identificador de aluno. Definir antes como alunos diferentes compartilham o mesmo computador.
2. **Negócio e mídias:** criar um perfil de negócio de treino que forneça contexto às missões; conectar fotos da galeria à oficina, às publicações e ao roteiro. Manter arquivos locais até existir uma política de armazenamento e exclusão.
3. **Comunicação e proteção:** ampliar os cenários de atendimento e fraude com respostas escritas, critérios determinísticos e feedback. Preservar os apps fictícios sem acesso a contatos, mensagens ou feeds reais.
4. **Entrega final:** reunir perfil, fotos, publicação, roteiro, agenda e respostas em “Meu Kit Digital”, com exportação voluntária e uma visão de progresso das 20 horas.

## Limites desta etapa

A tela inicial funciona como **entrada sem autenticação**. Ela registra dados, mas não comprova identidade nem isola dados de diferentes alunos. O marcador temporário da aba não contém nome, e-mail ou nascimento. O estúdio e os apps já existentes mantêm seu armazenamento local; a URL direta do estúdio continua acessível. Antes de centralizar trabalhos dos alunos no banco, será necessário decidir regras de acesso, retenção e exclusão para computadores compartilhados.

O site estático anterior não executa a API PostgreSQL. O novo cadastro requer hospedagem com funções de servidor, como a configuração Vercel deste repositório, e a variável `DATABASE_URL` definida fora do código.
