# MetaLab Pocket

Simulador de celular e estúdio de fotografia 3D para aulas protegidas. Os aplicativos, a loja e as fotos de exemplo fazem parte da simulação. As fotos criadas no estúdio ficam salvas na galeria local do navegador; o aluno pode escolher onde guardar uma cópia no computador, se o navegador oferecer essa opção.

## Publicar na Vercel

Importe este repositório na Vercel. Use **Framework Preset: Other** e deixe o comando de build vazio. O arquivo `vercel.json` configura a pasta `dist` como saída e permite abrir o estúdio em `/camera-studio`.

Não é preciso instalar dependências: o código, o renderizador 3D e os modelos `.glb` já estão em `dist`. Para testar localmente, sirva a pasta `dist` com um servidor HTTP estático; abrir o HTML diretamente como arquivo pode impedir o carregamento dos modelos 3D.
