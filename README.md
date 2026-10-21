# MetaLab Pocket

Simulador de celular e estúdio de fotografia 3D para aulas protegidas. Os aplicativos e a loja fazem parte da simulação. O WhatsApp Business de treino permite praticar conversas, catálogo, perfil, etiquetas e respostas rápidas; o Instagram de treino aceita fotos do computador e legendas, guardadas apenas no navegador. Nenhum dos dois acessa serviços ou contatos reais. O modo foco amplia o celular somente na tela inicial.

As fotos criadas no estúdio ficam salvas na galeria local do navegador; o aluno pode escolher onde guardar uma cópia no computador, se o navegador oferecer essa opção. Publicações do Instagram de treino usam o armazenamento local do navegador e podem ser removidas no próprio app.

A identidade visual usa a logo fornecida em `dist/assets/metalab-logo.png` e os tokens compartilhados de `dist/design-tokens.css`. O 3D renderiza quando há interação ou mudança de tamanho; em telas e computadores modestos, a resolução e o mapa de sombras são limitados. A interface respeita a preferência do sistema por movimento reduzido.

## Publicar na Vercel

Importe este repositório na Vercel. Use **Framework Preset: Other** e deixe o comando de build vazio. O arquivo `vercel.json` configura a pasta `dist` como saída e permite abrir o estúdio em `/camera-studio`.

Não é preciso instalar dependências: o código, o renderizador 3D e os modelos `.glb` já estão em `dist`. Para testar localmente, sirva a pasta `dist` com um servidor HTTP estático; abrir o HTML diretamente como arquivo pode impedir o carregamento dos modelos 3D.

## Créditos dos modelos

A caneca 3D (“005 Mug”) é de **eduterrataca**, disponibilizada sob **CC BY 4.0**: https://sketchfab.com/3d-models/005-mug-eed5aeb8856844619776cece35376d70. O tênis, as camisas, o celular e a logo foram fornecidos para este projeto. As texturas das camisas já estão embutidas no arquivo `camisas-dobradas.glb`.
