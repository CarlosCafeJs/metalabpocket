# MetaLab Pocket

Simulador de celular e estúdio de fotografia 3D para aulas protegidas. Os aplicativos e a loja fazem parte da simulação. O WhatsApp Business de treino permite praticar conversas, catálogo, perfil, etiquetas e respostas rápidas; o Instagram de treino aceita fotos do computador e legendas, guardadas apenas no navegador. Nenhum dos dois acessa serviços ou contatos reais. O modo foco amplia o celular somente na tela inicial.

As fotos criadas no estúdio ficam salvas na galeria local do navegador; o aluno pode escolher onde guardar uma cópia no computador, se o navegador oferecer essa opção. Publicações do Instagram de treino usam o armazenamento local do navegador e podem ser removidas no próprio app.

A identidade visual usa a logo fornecida em `dist/assets/metalab-logo.png` e os tokens compartilhados de `dist/design-tokens.css`. A entrada usa o roxo escuro `#1D1230` da imagem fornecida. O 3D renderiza quando há interação ou mudança de tamanho; em telas e computadores modestos, a resolução e o mapa de sombras são limitados. A interface respeita a preferência do sistema por movimento reduzido.

## Publicar na Vercel

Importe este repositório na Vercel. Use **Framework Preset: Other** e deixe o comando de build vazio. O arquivo `vercel.json` configura a pasta `dist` como saída e permite abrir o estúdio em `/camera-studio`. A pasta `api` contém a função de cadastro do aluno em `/api/students`.

Configure `DATABASE_URL` como variável de ambiente **protegida** na Vercel, usando a URL pública do PostgreSQL Railway. Não coloque a URL no código nem em arquivos versionados. A função cria a tabela `metalab_students` na primeira gravação; o usuário do banco precisa de permissão para criar tabela e inserir registros. A tela de entrada só libera o simulador depois de uma confirmação de gravação. Ela não autentica ou isola alunos: um marcador temporário da aba apenas evita repetir o cadastro durante a sessão. Nome, e-mail e nascimento não são guardados no armazenamento do navegador. As fotos e os dados dos apps fictícios continuam locais.

Execute `npm ci` e `npm test` para verificar a API. Para testar o fluxo completo localmente, use `vercel dev` com `DATABASE_URL` definida fora do repositório. Abrir `dist/index.html` como `file://` oferece uma prévia explícita sem cadastro nem gravação; modelos 3D podem exigir um servidor HTTP. Um servidor HTTP apenas estático ou o endereço anterior do Sites não executa `/api/students` e não registra alunos.

## Créditos dos modelos

A caneca 3D (“005 Mug”) é de **eduterrataca**, disponibilizada sob **CC BY 4.0**: https://sketchfab.com/3d-models/005-mug-eed5aeb8856844619776cece35376d70. O tênis, as camisas, o celular e a logo foram fornecidos para este projeto. As texturas das camisas já estão embutidas no arquivo `camisas-dobradas.glb`.
