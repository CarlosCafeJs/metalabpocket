const modules=[
      {title:'Meu celular como ferramenta do negócio',short:'Celular, apps e segurança',lessons:['Reconhecer a tela inicial, os aplicativos e as configurações.','Encontrar câmera, galeria, armazenamento e permissões.','Praticar o passo a passo: pausar, conferir, não clicar e confirmar com o instrutor.']},
      {title:'Marketing, WhatsApp e Instagram',short:'Marketing e atendimento',lessons:['Organizar uma presença digital simples para um pequeno negócio.','Treinar uma resposta cordial em uma conversa fictícia.','Conhecer perfil, publicação e stories em uma vitrine de demonstração, sem feed real.']},
      {title:'Fotografia, Canva e criação de conteúdo',short:'Foto e design pelo celular',lessons:['Observar luz, enquadramento, fundo e composição.','Planejar um post simples com imagem e legenda.','Usar modelos de treino e revisar a leitura do conteúdo.']},
      {title:'Vídeo, Reels e edição pelo celular',short:'Roteiro e vídeo vertical',lessons:['Montar um roteiro curto com começo, demonstração e encerramento.','Planejar enquadramento, iluminação e áudio.','Revisar uma sequência de cenas em um editor fictício.']},
      {title:'ChatGPT, IA e meu plano de conteúdo',short:'IA e planejamento',lessons:['Conhecer exemplos de prompts simples e seguros.','Organizar ideias em um calendário básico de conteúdo.','Definir próximos passos para o próprio negócio com apoio do instrutor.']}
    ];
    const apps=[
      {id:'curso',name:'Curso',glyph:'M',cls:'icon-course',built:true},
      {id:'galeria',name:'Galeria',glyph:'▧',cls:'icon-gallery',built:true},
      {id:'camera',name:'Câmera',glyph:'◉',cls:'icon-camera',built:true},
      {id:'loja',name:'Loja',glyph:'▣',cls:'icon-store',built:true},
      {id:'seguranca',name:'Proteção',glyph:'✓',cls:'icon-safe',built:true},
      {id:'vitrine',name:'Instagram',glyph:'◎',cls:'icon-shop',built:true},
      {id:'mensagens',name:'WPP Business',glyph:'✆',cls:'icon-msg',built:true},
      {id:'ajustes',name:'Ajustes',glyph:'⚙',cls:'icon-setting',built:true},
      {id:'oficina',name:'Oficina',glyph:'✎',cls:'icon-design',built:false,category:'Criação',desc:'Rascunhe uma legenda e monte uma peça fictícia.',size:'12 MB'},
      {id:'roteiro',name:'Roteiro',glyph:'▶',cls:'icon-video',built:false,category:'Vídeo',desc:'Pratique um roteiro curto para vídeo vertical.',size:'18 MB'},
      {id:'planejamento',name:'Agenda',glyph:'▦',cls:'icon-plan',built:false,category:'Planejamento',desc:'Organize uma semana de ideias de conteúdo.',size:'9 MB'},
      {id:'ideias',name:'Ideias IA',glyph:'✦',cls:'icon-course',built:true}
    ];
    const installed=new Set(['curso','galeria','camera','loja','seguranca','vitrine','mensagens','ajustes','ideias']);
    let currentPhoto=0,storeCategory='Tudo';
    const photos=[['Fim de tarde no ateliê','p1'],['Café da manhã','p2'],['Peças feitas à mão','p3'],['Verde para a vitrine','p4']];
    const appGrid=document.getElementById('appGrid'),dock=document.getElementById('dock'),appPanel=document.getElementById('appPanel');
    function iconButton(app,dockItem=false){
      const contents=`<span class="tile-icon ${app.cls}">${app.glyph}</span>${dockItem?'':`<span>${app.name}</span>`}`;
      if(app.id==='camera')return `<a class="app-tile" href="/camera" target="_top" data-launch-camera aria-label="Abrir Câmera MetaLab em tela cheia">${contents}</a>`;
      return `<button class="app-tile" data-app="${app.id}" aria-label="Abrir ${app.name}">${contents}</button>`;
    }
    function drawHome(){const main=[...apps.filter(a=>a.built&&a.id!=='ideias'),...apps.filter(a=>!a.built&&installed.has(a.id)),...apps.filter(a=>a.id==='ideias')];appGrid.innerHTML=main.filter(a=>installed.has(a.id)).map(a=>iconButton(a)).join('');appGrid.querySelectorAll('[data-app]').forEach(b=>b.onclick=()=>openApp(b.dataset.app));const dockApps=['curso','galeria','loja','seguranca'].map(id=>apps.find(a=>a.id===id));dock.innerHTML=dockApps.map(a=>iconButton(a,true)).join('');dock.querySelectorAll('[data-app]').forEach(b=>b.onclick=()=>openApp(b.dataset.app))}
    appGrid.addEventListener('click',event=>{if(event.target.closest('[data-launch-camera]'))sessionStorage.setItem('metalab-pocket-camera-launch','phone-camera')});
    function appHeader(title){return `<header class="app-top"><button class="back" data-back aria-label="Voltar">‹</button><h2>${title}</h2><span class="widget-tag">AULA</span></header>`}
    function openApp(id){setFocus(false);appPanel.dataset.currentApp=id;appPanel.classList.remove('sim-app');appPanel.classList.add('open');if(id==='curso')renderCourse();else if(id==='galeria')renderGallery();else if(id==='camera')renderCamera();else if(id==='loja')renderStore();else if(id==='seguranca')renderSecurity();else if(id==='vitrine'){appPanel.innerHTML=`${appHeader('Instagram')}<div class="app-body"><p>Carregando publicações locais…</p></div>`;window.MetaLabBusinessApps.renderInstagram(appPanel,appHeader,bindBack)}else if(id==='mensagens')window.MetaLabBusinessApps.renderWhatsApp(appPanel,appHeader,bindBack);else if(id==='ajustes')renderSettings();else if(id==='oficina')renderWorkshop();else if(id==='roteiro')renderScript();else if(id==='planejamento')renderPlanner();else if(id==='ideias')renderIdeas();bindBack()}
    function bindBack(){appPanel.querySelectorAll('[data-back]').forEach(b=>b.onclick=closeApp)}
    function closeApp(){appPanel.classList.remove('open');setTimeout(()=>{if(!appPanel.classList.contains('open')){appPanel.innerHTML='';appPanel.classList.remove('sim-app')}},390)}
    function renderCourse(){appPanel.innerHTML=`${appHeader('Trilha MetaLab')}<div class="app-body"><div class="store-feature"><small>20 HORAS · 5 MÓDULOS</small><b>Aprender fazendo</b><span>Pratique uma habilidade de cada vez.</span></div><div class="module-list">${modules.map((m,i)=>`<button class="module-card" data-module="${i}"><span class="module-num">${String(i+1).padStart(2,'0')}</span><span><strong>${m.title}</strong><small>${m.short}</small></span><em>4h</em></button>`).join('')}</div><div class="notice-box">O progresso é registrado nas missões da plataforma.</div><button class="primary-btn full-btn" id="openFullCourse">Abrir minhas missões →</button></div>`;bindBack();appPanel.querySelectorAll('[data-module]').forEach(b=>b.onclick=()=>renderModule(Number(b.dataset.module)));document.getElementById('openFullCourse').onclick=()=>window.top.location.assign('/missoes')}
    function renderModule(i){const m=modules[i];appPanel.innerHTML=`${appHeader('Módulo '+(i+1))}<div class="app-body"><div class="store-feature"><small>4 HORAS · MÓDULO ${i+1}</small><b>${m.title}</b><span>${m.short}</span></div><div class="lesson-box"><h3>O que vamos praticar</h3><ul>${m.lessons.map(x=>`<li>${x}</li>`).join('')}</ul></div><div class="notice-box">Ritmo de aula: o instrutor explica, demonstra, pratica junto e depois você tenta com calma. Se precisar, o passo a passo pode ser repetido.</div><button class="primary-btn full-btn" id="openFullCourse">Ver missões e registrar prática</button><button class="secondary-btn full-btn" id="backModules">Ver os cinco módulos</button></div>`;bindBack();document.getElementById('openFullCourse').onclick=()=>window.top.location.assign('/missoes');document.getElementById('backModules').onclick=renderCourse}
    function renderCamera(){const p=photos[currentPhoto];appPanel.innerHTML=`${appHeader('Câmera de demonstração')}<div class="app-body"><p>Treine o enquadramento com uma cena preparada. A câmera real do aparelho não é aberta.</p><div class="camera-view"><div class="photo-card ${p[1]}"></div><span class="camera-caption">CENA ${currentPhoto+1} · SIMULAÇÃO</span></div><div class="camera-controls"><span style="font-size:8px;color:#7b8492">cena de treino</span><button class="shutter" id="shutter" aria-label="Avançar cena de demonstração"></button><span style="font-size:8px;color:#7b8492">sem captura real</span></div><div class="photo-tip" id="cameraTip"><b>${p[0]}</b><br>Procure uma luz suave e deixe o assunto principal respirar dentro do quadro.</div><button class="secondary-btn full-btn" id="nextScene">Trocar cena de treino</button><div class="app-footnote">Nenhuma permissão de câmera é solicitada e nenhuma foto é tirada.</div></div>`;bindBack();document.getElementById('shutter').onclick=nextCamera;document.getElementById('nextScene').onclick=nextCamera}
    function nextCamera(){currentPhoto=(currentPhoto+1)%photos.length;renderCamera()}
    function renderSecurity(){appPanel.innerHTML=`${appHeader('Proteção digital')}<div class="app-body"><p>Pratique a regra da aula: <b>pare · confira · não clique · confirme com o instrutor</b>.</p><div class="exercise-card"><div class="widget-tag">CENÁRIO DE TREINO</div><p class="scenario">Uma mensagem fictícia diz: “Sua conta será bloqueada. Envie agora o código que chegou por SMS.” O que você faz?</p><div class="choice-list"><button class="choice" data-safe="yes">Paro e confirmo com o instrutor, sem compartilhar o código.</button><button class="choice" data-safe="no">Respondo com o código para resolver rápido.</button><button class="choice" data-safe="yes">Não abro links e procuro um canal oficial conhecido.</button></div><div id="securityFeedback"></div></div><div class="notice-box">Cenários inventados para aprendizagem. Não há links, perfis ou mensagens reais.</div></div>`;bindBack();appPanel.querySelectorAll('[data-safe]').forEach(b=>b.onclick=()=>{const ok=b.dataset.safe==='yes';document.getElementById('securityFeedback').innerHTML=`<div class="feedback ${ok?'':'warn'}">${ok?'Boa escolha. Códigos e senhas são pessoais. Pausar e confirmar com uma pessoa de confiança protege sua conta.':'Tudo bem rever a decisão. Não compartilhe códigos. Pare e confirme com o instrutor antes de agir.'}</div>`})}
    function renderVitrine(){appPanel.innerHTML=`${appHeader('Vitrine de treino')}<div class="app-body"><p>Uma tela de perfil fictício para praticar apresentação de um pequeno negócio, sem feed aberto ou publicação.</p><article class="sample-post"><div class="post-head"><span class="post-avatar">A</span><span><strong>Ateliê Aurora</strong><small>Perfil de exemplo · aula</small></span><span style="margin-left:auto;font-size:12px">···</span></div><div class="post-image"></div><div class="post-copy"><b>Peças feitas com calma e cuidado.</b><br>Conheça a coleção de cerâmica artesanal e escolha sua favorita.<br><small>Exemplo de legenda para revisar em aula</small></div></article><div class="photo-tip"><b>O que observar:</b> nome claro, imagem do produto, frase simples e uma próxima ação segura.</div><button class="secondary-btn full-btn" id="togglePost">Alternar exemplo</button><div class="app-footnote">O botão só troca uma imagem local. Nada é curtido, enviado ou publicado.</div></div>`;bindBack();document.getElementById('togglePost').onclick=()=>{const img=appPanel.querySelector('.post-image');const title=appPanel.querySelector('.post-copy b');const text=appPanel.querySelector('.post-copy');img.classList.toggle('alt');title.textContent=img.classList.contains('alt')?'Um café quentinho faz parte da pausa.':'Peças feitas com calma e cuidado.';text.innerHTML=`<b>${title.textContent}</b><br>${img.classList.contains('alt')?'Um exemplo de texto curto para apresentar um produto do bairro.':'Conheça a coleção de cerâmica artesanal e escolha sua favorita.'}<br><small>Exemplo de legenda para revisar em aula</small>`}}
    function renderMessages(){appPanel.innerHTML=`${appHeader('Atendimento simulado')}<div class="app-body"><p>Conversa preparada para praticar atendimento cordial a um cliente fictício.</p><div class="exercise-card"><div style="font-size:7px;color:#7b8492;margin-bottom:8px">CLIENTE DE EXEMPLO · 10:14</div><div style="padding:8px;background:#fff;border-radius:10px;font-size:8px;line-height:1.5">Olá! Você pode me contar um pouco sobre o tamanho e o material dessa peça?</div><div class="choice-list"><button class="choice" data-reply="1">Claro! Vou explicar as opções com calma. Se quiser, confirmo os detalhes com você.</button><button class="choice" data-reply="2">Envie seu endereço e seus dados para eu responder.</button><button class="choice" data-reply="3">Não sei ainda. Vou confirmar a informação antes de responder.</button></div><div id="replyFeedback"></div></div><div class="notice-box">As respostas ficam nesta tela. Não existe número, contato ou envio de mensagem.</div></div>`;bindBack();appPanel.querySelectorAll('[data-reply]').forEach(b=>b.onclick=()=>{const ok=b.dataset.reply!=='2';document.getElementById('replyFeedback').innerHTML=`<div class="feedback ${ok?'':'warn'}">${b.dataset.reply==='1'?'Boa resposta: cordial, clara e sem pedir dados pessoais.':b.dataset.reply==='3'?'Boa prática: conferir antes de responder também é atender bem.':'Para esta conversa, não é preciso pedir dados pessoais. Tente uma resposta cordial sobre o produto.'}</div>`})}
    function renderSettings(){appPanel.innerHTML=`${appHeader('Ajustes do simulador')}<div class="app-body"><p>Este aparelho de demonstração não oferece conexões externas.</p><div class="safe-grid"><div class="setting-card"><b>Wi-Fi do aparelho</b><small class="state-off">Indisponível nesta simulação</small></div><div class="setting-card"><b>Dados móveis</b><small class="state-off">Indisponível nesta simulação</small></div><div class="setting-card"><b>Navegador</b><small class="state-off">Não incluído no aparelho</small></div><div class="setting-card"><b>Contatos reais</b><small class="state-off">Não incluídos no aparelho</small></div><div class="setting-card"><b>Câmera real</b><small class="state-off">Sem solicitação de permissão</small></div><div class="setting-card"><b>Publicação</b><small class="state-off">Não disponível</small></div></div><div class="notice-box">A página é hospedada para abrir o simulador. O aparelho fictício não navega na internet e os apps não fazem chamadas externas.</div></div>`;bindBack()}
    function renderStore(){const catalog=apps.filter(a=>!a.built);appPanel.innerHTML=`${appHeader('Loja de aplicativos')}<div class="app-body"><div class="store-feature"><small>SELEÇÃO METALAB</small><b>Apps para praticar</b><span>Instalações fictícias, sem arquivos baixados.</span></div><input class="search-fake" id="storeSearch" placeholder="⌕  Buscar na loja de treino" aria-label="Buscar apps fictícios"><div class="module-list" style="margin-bottom:9px">${['Tudo','Criação','Vídeo','Planejamento'].map(c=>`<button class="category-btn" data-category="${c}" style="border:1px solid #e3dfd7;border-radius:15px;background:${storeCategory===c?'#203a61':'white'};color:${storeCategory===c?'white':'#617086'};padding:6px 8px;font-size:7px;cursor:pointer">${c}</button>`).join('')}</div><div class="store-list" id="storeList"></div><div class="app-footnote">Instalar altera somente esta sessão. Não baixa arquivos nem adiciona acesso à internet.</div></div>`;bindBack();function drawStore(q=''){const list=document.getElementById('storeList');if(!list)return;const search=q.trim().toLowerCase();const shown=catalog.filter(a=>(storeCategory==='Tudo'||a.category===storeCategory)&&(!search||(a.name+' '+a.desc+' '+a.category).toLowerCase().includes(search)));list.innerHTML=shown.map(a=>`<div class="store-item"><span class="store-icon ${a.cls}">${a.glyph}</span><span><strong>${a.name}</strong><small>${a.category} · ${a.size} · simulação</small></span><button class="install-btn ${installed.has(a.id)?'installed':''}" data-install="${a.id}">${installed.has(a.id)?'Abrir':'Instalar'}</button></div>`).join('')||'<p>Nenhum app nesta categoria.</p>';list.querySelectorAll('[data-install]').forEach(b=>b.onclick=()=>{const id=b.dataset.install;if(installed.has(id)){openApp(id)}else{installed.add(id);drawHome();drawStore(document.getElementById('storeSearch').value)}})}appPanel.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{storeCategory=b.dataset.category;renderStore()});document.getElementById('storeSearch').oninput=e=>drawStore(e.target.value);drawStore()}
    function renderWorkshop(){appPanel.innerHTML=`${appHeader('Oficina de conteúdo')}<div class="app-body"><p>Monte um rascunho de legenda para uma atividade. O texto aparece só na tela e não é guardado.</p><div class="photo-card ${photos[currentPhoto][1]}" style="height:142px;cursor:default"><span>${photos[currentPhoto][0]}</span></div><div class="draft-field"><label for="captionInput">Sua legenda de treino</label><input id="captionInput" maxlength="90" placeholder="Ex.: Feito à mão, com cuidado em cada detalhe."></div><div class="draft-preview"><b>Prévia do rascunho · não publicado</b><p id="captionPreview">Sua legenda aparecerá aqui.</p></div><button class="secondary-btn full-btn" id="clearDraft">Limpar rascunho</button><div class="app-footnote">Evite incluir telefones, endereços, senhas ou dados pessoais na atividade.</div></div>`;bindBack();const input=document.getElementById('captionInput'),preview=document.getElementById('captionPreview');input.oninput=()=>preview.textContent=input.value||'Sua legenda aparecerá aqui.';document.getElementById('clearDraft').onclick=()=>{input.value='';preview.textContent='Sua legenda aparecerá aqui.'}}
    function renderScript(){appPanel.innerHTML=`${appHeader('Roteiro de vídeo')}<div class="app-body"><p>Exemplo de estrutura para um vídeo vertical de apresentação de produto.</p><div class="lesson-box"><div class="script-step"><i>1</i><span><b>Apresente</b><small>Mostre o produto e diga o nome do negócio.</small></span></div><div class="script-step"><i>2</i><span><b>Demonstre</b><small>Enquadre um detalhe ou uma etapa do trabalho.</small></span></div><div class="script-step"><i>3</i><span><b>Convide</b><small>Finalize com uma frase simples, sem link ou contato.</small></span></div></div><div class="camera-view" style="height:145px;background:linear-gradient(135deg,#203a61,#c79130)"><span style="color:white;font-size:11px;font-weight:800">PRÉVIA 9:16 · DEMO</span></div><div class="notice-box">Não grava vídeo nem usa microfone. É um roteiro visual para praticar a sequência.</div></div>`;bindBack()}
    function renderPlanner(){appPanel.innerHTML=`${appHeader('Agenda de conteúdo')}<div class="app-body"><p>Semana fictícia para treinar planejamento em pequenas etapas.</p><div class="lesson-box">${[['SEG','Escolher um produto'],['TER','Fazer uma foto de treino'],['QUA','Escrever uma legenda curta'],['QUI','Rascunhar um roteiro'],['SEX','Revisar as ideias com o instrutor']].map(([d,t])=>`<div class="script-step"><i>${d[0]}</i><span><b>${d}</b><small>${t}</small></span><span class="widget-tag">DEMO</span></div>`).join('')}</div><div class="notice-box">Nenhuma atividade é publicada ou enviada. O calendário serve como exemplo de organização.</div></div>`;bindBack()}
    function renderIdeas(){appPanel.innerHTML=`${appHeader('Ideias para praticar')}<div class="app-body"><p>Exemplos prontos para conhecer o formato de um pedido à IA. As respostas abaixo são fixas e não usam um modelo conectado.</p><div class="choice-list"><button class="choice" data-idea="1">Quero três ideias para fotografar uma peça artesanal.</button><button class="choice" data-idea="2">Ajude a organizar um roteiro curto para apresentar meu produto.</button><button class="choice" data-idea="3">Sugira uma rotina simples de conteúdo para uma semana.</button></div><div id="ideaFeedback"></div><div class="app-footnote">Demonstração roteirizada pela MetaLab. Não envia texto a serviços de IA.</div></div>`;bindBack();const answers={1:'1. Fotografe perto de uma janela. 2. Mostre um detalhe de perto. 3. Inclua o produto em uso, com fundo simples.',2:'Comece dizendo o nome do produto, mostre um detalhe e termine com uma frase clara sobre como conhecer a peça.',3:'Segunda: escolha o tema. Terça: prepare uma foto. Quarta: rascunhe uma legenda. Quinta: monte um roteiro. Sexta: revise com o instrutor.'};appPanel.querySelectorAll('[data-idea]').forEach(b=>b.onclick=()=>{document.getElementById('ideaFeedback').innerHTML=`<div class="feedback">${answers[b.dataset.idea]}</div>`})}
    // Everything in this simulator stays in page memory. A captured scene is a
    // reference to a prepared image, never an image from the visitor's device.
    const favorites=new Set(),capturedScenes=[];
    let savedGalleryUrls=[];
    const planDone=new Set(),planDays=[
      ['SEG','Escolher um produto'],['TER','Fazer uma foto de treino'],
      ['QUA','Escrever uma legenda curta'],['QUI','Rascunhar um roteiro'],
      ['SEX','Revisar as ideias com o instrutor']
    ];
    let planNote='',draftCaption='',draftTemplate='Clássico',largeText=false;
    let videoScenes=[0,2,1],videoTitle='Meu produto em três cenas';

    function renderGallery(){
      appPanel.innerHTML=`${appHeader('Galeria')}<div class="app-body">
        <button type="button" class="gallery-top-action" id="openDigitalGallery">Abrir Galeria Completa</button>
        <section class="gallery-saved-section" id="savedGallerySection" aria-label="Fotos salvas da Câmera"><h3>Fotos da minha câmera <small>Carregando…</small></h3><p class="gallery-empty">Galeria vazia, use a Câmera para tirar fotos.</p></section>
      </div>`;
      bindBack();
      document.getElementById('openDigitalGallery').onclick=()=>{sessionStorage.setItem('metalab-pocket-gallery-launch','phone-gallery');window.top.location.assign('/kit-digital')};
      renderSavedGallery();
    }

    async function renderSavedGallery(){
      const section=document.getElementById('savedGallerySection');if(!section)return;
      savedGalleryUrls.forEach(url=>URL.revokeObjectURL(url));savedGalleryUrls=[];
      try{
        const records=await window.MetaLabGallery.list();
        if(document.getElementById('savedGallerySection')!==section)return;
        const heading=document.createElement('h3');heading.textContent='Fotos da minha câmera';
        const count=document.createElement('small');count.textContent=`${records.length} foto${records.length===1?'':'s'}`;heading.append(count);
        section.replaceChildren(heading);
        if(!records.length){const empty=document.createElement('p');empty.className='gallery-empty';empty.textContent='Galeria vazia, use a Câmera para tirar fotos.';section.append(empty);return}
        const grid=document.createElement('div');grid.className='saved-photo-grid';
        const detail=document.createElement('div');detail.className='saved-photo-detail';detail.hidden=true;
        records.forEach((record,index)=>{
          const url=URL.createObjectURL(record.blob);savedGalleryUrls.push(url);
          const button=document.createElement('button');button.type='button';button.className='saved-photo';button.setAttribute('aria-label',`Abrir foto ${index+1} de ${record.product||'produto'}`);
          const img=document.createElement('img');img.src=url;img.alt=record.product||'Foto de produto';button.append(img);grid.append(button);
          button.onclick=()=>{
            grid.querySelectorAll('button').forEach(item=>item.classList.remove('selected'));button.classList.add('selected');
            const large=document.createElement('img');large.src=url;large.alt=img.alt;
            const caption=document.createElement('p');caption.textContent=`${record.product||'Produto'} · ângulo ${record.angle??0}° · ${new Date(record.createdAt).toLocaleString('pt-BR')}`;
            const save=document.createElement('button');save.type='button';save.className='secondary-btn';save.textContent='Salvar cópia no computador';
            const result=document.createElement('p');
            save.onclick=async()=>{try{const status=await window.MetaLabGallery.saveToComputer(record.blob,record.name||'metalab-foto.png');result.textContent=status==='saved'?'Cópia salva.':status==='cancelled'?'A foto continua na Galeria.':'Download iniciado; o navegador define a pasta.'}catch(error){result.textContent='Não foi possível baixar esta cópia.'}};
            detail.replaceChildren(large,caption,save,result);detail.hidden=false;
          };
        });
        section.append(grid,detail);
      }catch(error){section.innerHTML='<h3>Fotos da minha câmera</h3><p class="gallery-empty">A Galeria local não está disponível neste navegador.</p>';console.warn(error)}
    }
    window.addEventListener('metalab-gallery-updated',()=>{if(document.getElementById('savedGallerySection'))renderSavedGallery()});

    function renderCamera(message=''){
      const p=photos[currentPhoto];
      appPanel.innerHTML=`${appHeader('Câmera de demonstração')}<div class="app-body">
        <p>Enquadre cenas prontas e faça uma captura fictícia. Nenhuma permissão é solicitada.</p>
        <div class="camera-view"><div class="photo-card ${p[1]}"></div><span class="camera-caption">CENA ${currentPhoto+1} · SIMULAÇÃO</span></div>
        <div class="camera-controls"><span style="font-size:8px;color:#7b8492">${p[0]}</span><button class="shutter" id="shutter" aria-label="Capturar cena de treino"></button><span style="font-size:8px;color:#7b8492">captura local</span></div>
        <div class="inline-actions"><button class="secondary-btn" id="nextScene">Trocar cena</button><button class="secondary-btn" id="openGallery">Abrir galeria</button></div>
        <div id="captureFeedback">${message?`<div class="feedback">${message}</div>`:''}</div>
        <div class="app-footnote">A captura registra somente a escolha da cena nesta sessão; não salva uma foto real.</div>
      </div>`;
      bindBack();
      document.getElementById('shutter').onclick=()=>{capturedScenes.push(currentPhoto);renderCamera('Cena de treino capturada! Abra a Galeria para escolher a imagem.')};
      document.getElementById('nextScene').onclick=()=>{currentPhoto=(currentPhoto+1)%photos.length;renderCamera()};
      document.getElementById('openGallery').onclick=renderGallery;
    }

    function renderWorkshop(){
      const p=photos[currentPhoto];
      appPanel.innerHTML=`${appHeader('Oficina de conteúdo')}<div class="app-body">
        <p>Monte uma peça de treino. A prévia permanece somente nesta sessão.</p>
        <div class="photo-card ${p[1]}" style="height:132px;cursor:default"><span>${p[0]}</span></div>
        <span class="mini-label">Modelo do cartão</span><div class="pill-row">${['Clássico','Destaque','Minimalista'].map(t=>`<button class="pill ${draftTemplate===t?'active':''}" data-template="${t}">${t}</button>`).join('')}</div>
        <label class="mini-label" for="captionInput">Legenda de treino</label><input class="mini-field" id="captionInput" maxlength="90" placeholder="Ex.: Feito à mão, com cuidado.">
        <div class="draft-preview" id="draftPreview"><b>PRÉVIA · ${draftTemplate.toUpperCase()} · NÃO PUBLICADO</b><p id="captionPreview"></p></div>
        <div class="inline-actions"><button class="secondary-btn" id="changePhoto">Trocar foto</button><button class="secondary-btn" id="clearDraft">Limpar texto</button></div>
        <div class="app-footnote">Evite inserir dados pessoais. Nada é enviado ou publicado.</div>
      </div>`;
      bindBack();
      const input=document.getElementById('captionInput'),preview=document.getElementById('captionPreview');
      input.value=draftCaption;preview.textContent=draftCaption||'Sua legenda aparecerá aqui.';
      input.oninput=()=>{draftCaption=input.value;preview.textContent=draftCaption||'Sua legenda aparecerá aqui.'};
      appPanel.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>{draftTemplate=b.dataset.template;renderWorkshop()});
      document.getElementById('changePhoto').onclick=renderGallery;
      document.getElementById('clearDraft').onclick=()=>{draftCaption='';renderWorkshop()};
    }

    function renderScript(){
      appPanel.innerHTML=`${appHeader('Roteiro de vídeo')}<div class="app-body">
        <p>Monte uma sequência de três cenas para um vídeo vertical fictício.</p>
        <label class="mini-label" for="videoTitle">Título do roteiro</label><input class="mini-field" id="videoTitle" maxlength="55">
        <div class="storyboard">${videoScenes.map((scene,i)=>`<div class="story-scene"><div class="photo-card ${photos[scene][1]}"></div><b>${['1 · Abertura','2 · Detalhe','3 · Final'][i]}</b></div>`).join('')}</div>
        <div class="lesson-box">${videoScenes.map((scene,i)=>`<div class="script-step"><i>${i+1}</i><span><b>${photos[scene][0]}</b><small>${['Apresente o tema.','Mostre um detalhe.','Encerre com uma frase clara.'][i]}</small></span><button class="pill" data-scene="${i}" aria-label="Trocar cena ${i+1}">Trocar</button></div>`).join('')}</div>
        <div class="draft-preview"><b>PRÉVIA DO ROTEIRO · 9:16</b><p id="videoPreview"></p></div>
        <button class="secondary-btn full-btn" id="resetVideo">Recomeçar sequência</button>
        <div class="app-footnote">Não grava vídeo, som nem usa microfone.</div>
      </div>`;
      bindBack();
      const input=document.getElementById('videoTitle');input.value=videoTitle;
      const update=()=>{videoTitle=input.value;document.getElementById('videoPreview').textContent=`${videoTitle||'Sem título'}: ${videoScenes.map(i=>photos[i][0]).join(' → ')}.`};
      input.oninput=update;update();
      appPanel.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.scene);videoScenes[i]=(videoScenes[i]+1)%photos.length;renderScript()});
      document.getElementById('resetVideo').onclick=()=>{videoScenes=[0,2,1];videoTitle='Meu produto em três cenas';renderScript()};
    }

    function renderPlanner(){
      appPanel.innerHTML=`${appHeader('Agenda de conteúdo')}<div class="app-body">
        <p>Marque as etapas de uma semana de treino e anote uma ideia curta.</p>
        <div class="draft-preview"><b>SEMANA DE PRÁTICA</b><p>${planDone.size} de ${planDays.length} etapas marcadas</p><div class="progress-line"><i style="width:${planDone.size*20}%"></i></div></div>
        ${planDays.map(([day,task],i)=>`<button class="check-row ${planDone.has(i)?'done':''}" data-day="${i}" aria-pressed="${planDone.has(i)}"><span class="check-box">${planDone.has(i)?'✓':''}</span><span><b>${day}</b> · ${task}</span></button>`).join('')}
        <label class="mini-label" for="planNote">Minha ideia para revisar com o instrutor</label><input class="mini-field" id="planNote" maxlength="100" placeholder="Escreva uma ideia de treino">
        <div class="draft-preview"><b>NOTA DA SEMANA</b><p id="planPreview"></p></div>
        <button class="secondary-btn full-btn" id="resetPlan">Reiniciar semana</button>
        <div class="app-footnote">Anotações e marcações ficam somente nesta sessão.</div>
      </div>`;
      bindBack();
      appPanel.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.day);planDone.has(i)?planDone.delete(i):planDone.add(i);renderPlanner()});
      const input=document.getElementById('planNote'),preview=document.getElementById('planPreview');input.value=planNote;preview.textContent=planNote||'Nenhuma ideia anotada.';
      input.oninput=()=>{planNote=input.value;preview.textContent=planNote||'Nenhuma ideia anotada.'};
      document.getElementById('resetPlan').onclick=()=>{planDone.clear();planNote='';renderPlanner()};
    }

    function renderSettings(){
      appPanel.innerHTML=`${appHeader('Ajustes do simulador')}<div class="app-body">
        <p>Ajuste a leitura dos apps. As conexões externas permanecem indisponíveis.</p>
        <button class="check-row ${largeText?'done':''}" id="fontToggle" aria-pressed="${largeText}"><span class="check-box">${largeText?'✓':''}</span><span>Texto maior nos apps</span></button>
        <div class="safe-grid"><div class="setting-card"><b>Wi-Fi e dados móveis</b><small class="state-off">Indisponíveis nos apps</small></div><div class="setting-card"><b>Navegador</b><small class="state-off">Não incluído</small></div><div class="setting-card"><b>Contatos reais</b><small class="state-off">Não incluídos</small></div><div class="setting-card"><b>Câmera real</b><small class="state-off">Sem acesso</small></div><div class="setting-card"><b>Publicação externa</b><small class="state-off">Não disponível</small></div><div class="setting-card"><b>Dados de treino</b><small>Salvos neste navegador</small></div></div>
        <div class="notice-box">Para acessar este simulador, a página precisa ser carregada. Dentro do aparelho fictício não há links externos, chamadas de rede ou envio de conteúdo.</div>
      </div>`;
      bindBack();
      document.getElementById('fontToggle').onclick=()=>{largeText=!largeText;document.getElementById('screen').classList.toggle('font-large',largeText);renderSettings()};
    }

    const phone=document.getElementById('phone'),turnBtn=document.getElementById('turnBtn'),stage=document.getElementById('stage'),focusBtn=document.getElementById('focusBtn'),focusZoom=document.getElementById('focusZoom');
    drawHome();
    if(location.hash==='#galeria')openApp('galeria');
    window.addEventListener('hashchange',()=>{if(location.hash==='#galeria')openApp('galeria')});
    document.getElementById('gesture').onclick=closeApp;
    function setFocus(active){if(active&&(appPanel.classList.contains('open')||phone.classList.contains('show-back')))return;stage.classList.toggle('focus-stage',active);document.body.classList.toggle('focus-active',active);focusBtn.setAttribute('aria-pressed',String(active));focusBtn.textContent=active?'✕ Sair do foco':'⛶ Modo foco';if(active)updateFocusZoom()}
    function updateFocusZoom(){const fit=Math.min((innerWidth-26)/294,(innerHeight-94)/590,1.45);const requested=Number(focusZoom.value)/100;phone.style.setProperty('--focus-scale',String(Math.max(.55,Math.min(requested,fit))))}
    focusBtn.onclick=()=>setFocus(!stage.classList.contains('focus-stage'));focusZoom.oninput=updateFocusZoom;window.addEventListener('resize',updateFocusZoom);document.addEventListener('keydown',event=>{if(event.key==='Escape')setFocus(false)});
    document.getElementById('homeBtn').onclick=()=>{phone.classList.remove('show-back');turnBtn.textContent='⤢ Ver traseira';turnBtn.setAttribute('aria-pressed','false');closeApp()};
    turnBtn.onclick=()=>{setFocus(false);const back=phone.classList.toggle('show-back');turnBtn.textContent=back?'⤢ Voltar à tela':'⤢ Ver traseira';turnBtn.setAttribute('aria-pressed',String(back))};
