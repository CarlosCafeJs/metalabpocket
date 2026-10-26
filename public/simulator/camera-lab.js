// Oficina de fotografia MetaLab. Todo o estado fica apenas nesta página.
(() => {
  const cameraState = {
    tab: 'praticar', angle: 45, height: 'alto', light: 'suave',
    background: 'limpo', distance: 2, message: '', quizCover: null,
    quizScale: null
  };

  const angleName = angle => {
    const a = ((angle % 360) + 360) % 360;
    if (a <= 20 || a >= 340) return 'frente';
    if ((a >= 25 && a <= 65) || (a >= 295 && a <= 335)) return 'três quartos';
    if ((a >= 70 && a <= 115) || (a >= 245 && a <= 290)) return 'lateral';
    if (a >= 155 && a <= 205) return 'costas';
    return 'diagonal de trás';
  };
  const viewClass = name => ({'frente':'view-front','três quartos':'view-quarter','lateral':'view-side','costas':'view-back','diagonal de trás':'view-back'})[name];
  const missionChecks = () => [
    {text:'Ângulo de três quartos: mostra formato e alça.', ok:angleName(cameraState.angle)==='três quartos'},
    {text:'Celular um pouco acima: mostra a abertura da caneca.', ok:cameraState.height==='alto'},
    {text:'Luz suave de lado: revela textura sem reflexo forte.', ok:cameraState.light==='suave'},
    {text:'Fundo simples: o produto continua protagonista.', ok:cameraState.background==='limpo'},
    {text:'Distância média: a caneca cabe inteira no quadro.', ok:cameraState.distance===2}
  ];

  function cameraPractice(){
    return `<span class="camera-kicker">Laboratório de ângulos · produto: caneca artesanal</span>
      <div class="camera-section">
        <h3>1. Posicione o celular</h3>
        <p>Arraste o celular azul ao redor da caneca. A janela está à esquerda. Veja como a posição muda o que o cliente consegue entender.</p>
        <div class="camera-map" id="cameraMap" role="group" aria-label="Mapa da mesa com caneca no centro e celular móvel ao redor">
          <span class="map-window">JANELA</span><span class="map-product" aria-label="Caneca de exemplo"></span>
          <button class="map-phone" id="mapPhone" aria-label="Arraste para posicionar o celular">●</button>
          <span class="map-front">FRENTE</span>
        </div>
        <div class="camera-orbit-actions"><button id="angleMinus" aria-label="Girar celular 45 graus à esquerda">↶ 45°</button><button id="angleFront">Frente</button><button id="anglePlus" aria-label="Girar celular 45 graus à direita">45° ↷</button></div>
        <label class="camera-range-label" for="cameraAngle"><span>Giro ao redor do produto</span><span id="angleLabel"></span></label>
        <input type="range" min="0" max="355" step="5" id="cameraAngle" aria-label="Ângulo do celular ao redor do produto">
      </div>
      <div class="camera-section">
        <h3>2. Ajuste a altura e a distância</h3>
        <p>O ângulo de cima mostra a abertura; o reto mostra melhor a lateral. Afaste um pouco se o produto for cortado.</p>
        <div class="camera-choice-row" aria-label="Altura do celular">
          <button data-height="reto">Reto</button><button data-height="alto">Um pouco acima</button><button data-height="cima">De cima</button>
        </div>
        <label class="camera-range-label" for="cameraDistance"><span>Distância</span><span id="distanceLabel"></span></label>
        <input type="range" min="1" max="3" step="1" id="cameraDistance" aria-label="Distância entre celular e produto">
      </div>
      <div class="camera-section">
        <h3>3. Prepare luz e fundo</h3>
        <p>Uma janela com luz indireta ajuda a mostrar cor e textura. Se a sombra ficar forte, rebata a luz com papel branco.</p>
        <span class="camera-kicker">Luz</span>
        <div class="camera-choice-row" aria-label="Tipo de luz"><button data-light="suave">Janela suave</button><button data-light="contra">Contraluz</button><button data-light="dura">Sol direto</button></div>
        <span class="camera-kicker">Fundo</span>
        <div class="camera-choice-row" aria-label="Tipo de fundo"><button data-background="limpo">Simples</button><button data-background="ocupado">Com objetos</button></div>
      </div>
      <div class="camera-section">
        <h3>O que a pessoa veria</h3>
        <div class="camera-shot" id="cameraShot" role="img" aria-label="Ilustração da caneca no enquadramento escolhido"><div class="shot-table"></div><div class="shot-clutter"></div><div class="mug-art"><div class="mug-handle"></div><div class="mug-body"><span class="mug-label">ATELIÊ</span></div><div class="mug-rim"></div></div><div class="shot-grid"></div></div>
        <div class="camera-feedback" aria-live="polite"><b id="cameraFeedbackTitle"></b><span id="cameraFeedbackText"></span></div>
        <button class="primary-btn full-btn" id="captureSetup">Registrar esta posição</button>
        <div class="feedback" id="cameraCaptureMessage" aria-live="polite" hidden></div>
      </div>
      <div class="app-footnote">Prévia ilustrativa. O simulador não abre a câmera real e não cria fotos de pessoas ou produtos.</div>`;
  }

  function cameraGuide(){
    return `<span class="camera-kicker">Guia rápido · foto que explica o produto</span>
      <div class="camera-guide-card"><b>1 · Antes de fotografar</b><p>Limpe o produto e a mesa. Escolha um fundo liso que contraste com a peça. A primeira imagem deve deixar claro o que está à venda, sem cortar suas bordas.</p><small>Exemplo: mostre a caneca inteira, com a alça visível.</small></div>
      <div class="camera-guide-card"><b>2 · Luz que revela, não esconde</b><p>Comece perto de uma janela, sem sol direto. Se um lado ficar muito escuro, coloque uma folha ou cartolina branca do lado oposto para refletir luz. Evite misturar luzes de cores diferentes.</p><small>Exemplo: a textura da cerâmica aparece sem brilho estourado.</small></div>
      <div class="camera-guide-card"><b>3 · Posição com propósito</b><p>De frente, mostre nome e formato. Em três quartos, mostre profundidade e alça. De cima, revele a abertura ou uma composição plana. A foto de detalhe mostra acabamento; nenhuma substitui a foto inteira.</p><small>Faça mais de um ângulo e compare antes de escolher.</small></div>
      <div class="camera-guide-card"><b>4 · Foco e firmeza</b><p>Apoie os braços ou o celular. Num celular real, toque no produto na tela para definir o foco e confira se a exposição deixa os detalhes legíveis. Evite ampliar com zoom digital quando puder se aproximar.</p><small>Nesta oficina, o toque e a foto real são apenas explicados.</small></div>
      <div class="camera-guide-card"><b>Uma sequência clara para o negócio</b><p><b>Foto principal:</b> o que é. <b>Detalhe:</b> material e acabamento. <b>Escala:</b> qual o tamanho. <b>Em uso:</b> para que serve. Mantenha luz, cores e estilo coerentes entre as imagens e represente a peça como ela é.</p><small>Uma pergunta do cliente deve ser respondida por cada imagem.</small></div>
      <div class="camera-sources">Base didática: Shopify Help Center, Etsy Seller Handbook, Adobe Product Photography e Google Merchant Center. Textos adaptados para esta aula, sem acesso a sites externos.</div>`;
  }

  function cameraMission(){
    const checks=missionChecks();
    return `<span class="camera-kicker">Desafio da aula</span>
      <div class="camera-section"><h3>Monte a foto principal da caneca</h3><p>Procure uma imagem em que o cliente reconheça a peça, veja a alça e entenda sua forma. Ajuste a posição no laboratório até completar estas pistas:</p>
        <div class="camera-mission-list">${checks.map(c=>`<div class="${c.ok?'done':''}"><i>${c.ok?'✓':'○'}</i>${c.text}</div>`).join('')}</div>
        <div class="camera-feedback"><b>${checks.every(c=>c.ok)?'Boa posição para a foto principal.':'Ainda dá para melhorar.'}</b>${checks.every(c=>c.ok)?'Agora registre a posição e compare com uma foto de detalhe ou de uso.':`Faltam ${checks.filter(c=>!c.ok).length} pistas. Volte ao laboratório e experimente.`}</div>
        <button class="primary-btn full-btn" id="backToPractice">Voltar ao laboratório</button>
      </div>
      <div class="camera-section"><h3>Qual imagem responde à pergunta?</h3><p><b>Para a capa da vitrine:</b> qual foto explica de imediato o que é vendido?</p>
        <div class="choice-list"><button class="choice" data-cover="wrong">Só um recorte muito próximo da textura.</button><button class="choice" data-cover="right">A peça inteira, nítida e sobre fundo simples.</button><button class="choice" data-cover="wrong">A peça pequena entre muitos objetos.</button></div>
        <div class="feedback ${cameraState.quizCover==='wrong'?'warn':''}" id="coverFeedback" ${cameraState.quizCover?'':'hidden'}>${cameraState.quizCover==='right'?'Isso: a capa identifica o produto rapidamente. O detalhe pode vir depois.':'Tente de novo: na capa, a pessoa precisa reconhecer o produto inteiro.'}</div>
        <p><b>Se o cliente perguntar o tamanho:</b> que foto ajuda mais?</p>
        <div class="choice-list"><button class="choice" data-scale="right">A caneca na mão ou ao lado de um objeto de tamanho conhecido.</button><button class="choice" data-scale="wrong">Só um fundo bonito, sem referência de tamanho.</button></div>
        <div class="feedback ${cameraState.quizScale==='wrong'?'warn':''}" id="scaleFeedback" ${cameraState.quizScale?'':'hidden'}>${cameraState.quizScale==='right'?'Exato: a referência visual ajuda a entender a escala.':'A aparência sozinha não mostra bem o tamanho. Procure uma referência conhecida.'}</div>
      </div>`;
  }

  function cameraFeedback(){
    const s=cameraState, view=angleName(s.angle);
    let title,detail;
    if (view==='três quartos') { title='Três quartos: forma e alça'; detail='Boa opção para uma caneca: mostra volume e uma parte da lateral. Confirme se o acabamento também está visível.'; }
    else if (view==='frente') { title='Frente: identificação clara'; detail='Mostra bem nome e formato. Faça outra vista para revelar profundidade e alça.'; }
    else if (view==='lateral') { title='Lateral: complemento útil'; detail='Ajuda a mostrar espessura e alça, mas pode esconder o nome. Use como segunda imagem.'; }
    else { title='Parte de trás: detalhe complementar'; detail='Pode revelar acabamento, mas não costuma explicar a peça tão rápido quanto a frente ou o três quartos.'; }
    if (s.height==='cima') detail+=' De cima, a abertura aparece melhor, enquanto a lateral perde destaque.';
    if (s.height==='reto') detail+=' Na altura da peça, a lateral aparece mais e a abertura menos.';
    if (s.light==='contra') detail+=' A luz por trás escurece a frente; mova o celular ou rebata a luz.';
    if (s.light==='dura') detail+=' Sol direto pode criar sombras e brilhos fortes; procure luz indireta.';
    if (s.background==='ocupado') detail+=' Objetos ao redor disputam atenção; retire o que não explica o produto.';
    if (s.distance===1) detail+=' Você está muito perto: confira se nenhuma borda foi cortada.';
    if (s.distance===3) detail+=' Você está longe: aproxime-se para o produto não ficar pequeno.';
    return {title,detail};
  }

  function updateCameraUI(){
    const mapPhone=document.getElementById('mapPhone');
    if (!mapPhone) return;
    const s=cameraState, radians=s.angle*Math.PI/180;
    mapPhone.style.left=`calc(50% + ${Math.sin(radians)*60}px)`;
    mapPhone.style.top=`calc(50% + ${Math.cos(radians)*60}px)`;
    mapPhone.style.transform=`translate(-50%,-50%) rotate(${-s.angle}deg)`;
    document.getElementById('cameraAngle').value=s.angle;
    document.getElementById('angleLabel').textContent=`${s.angle}° · ${angleName(s.angle)}`;
    document.getElementById('cameraDistance').value=s.distance;
    document.getElementById('distanceLabel').textContent=({1:'perto',2:'média',3:'longe'})[s.distance];
    for (const group of ['height','light','background']) {
      appPanel.querySelectorAll(`[data-${group}]`).forEach(b=>{
        const active=b.dataset[group]===s[group];b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
      });
    }
    const shot=document.getElementById('cameraShot');
    shot.className=`camera-shot ${viewClass(angleName(s.angle))} height-${s.height} light-${s.light==='suave'?'soft':s.light==='contra'?'back':'hard'} bg-${s.background==='limpo'?'clean':'busy'}`;
    shot.style.setProperty('--mug-scale',({1:'1.33',2:'1',3:'.72'})[s.distance]);
    const feedback=cameraFeedback();
    document.getElementById('cameraFeedbackTitle').textContent=feedback.title;
    document.getElementById('cameraFeedbackText').textContent=feedback.detail;
    shot.setAttribute('aria-label',`Caneca ilustrativa: ${angleName(s.angle)}, altura ${s.height}, luz ${s.light}, fundo ${s.background}, distância ${s.distance}`);
  }

  function bindPractice(){
    updateCameraUI();
    const map=document.getElementById('cameraMap');let dragging=false;
    const setFromPointer=e=>{
      const r=map.getBoundingClientRect();
      const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
      cameraState.angle=(Math.round((Math.atan2(dx,dy)*180/Math.PI+360)%360/5)*5)%360;
      updateCameraUI();
    };
    map.onpointerdown=e=>{dragging=true;map.setPointerCapture(e.pointerId);setFromPointer(e)};
    map.onpointermove=e=>{if(dragging)setFromPointer(e)};
    map.onpointerup=()=>{dragging=false};map.onpointercancel=()=>{dragging=false};
    document.getElementById('cameraAngle').oninput=e=>{cameraState.angle=Number(e.target.value);updateCameraUI()};
    document.getElementById('angleMinus').onclick=()=>{cameraState.angle=(cameraState.angle+315)%360;updateCameraUI()};
    document.getElementById('anglePlus').onclick=()=>{cameraState.angle=(cameraState.angle+45)%360;updateCameraUI()};
    document.getElementById('angleFront').onclick=()=>{cameraState.angle=0;updateCameraUI()};
    document.getElementById('cameraDistance').oninput=e=>{cameraState.distance=Number(e.target.value);updateCameraUI()};
    for (const group of ['height','light','background']) {
      appPanel.querySelectorAll(`[data-${group}]`).forEach(b=>b.onclick=()=>{cameraState[group]=b.dataset[group];updateCameraUI()});
    }
    const status=document.getElementById('cameraCaptureMessage');
    if (cameraState.message) {status.hidden=false;status.textContent=cameraState.message;}
    document.getElementById('captureSetup').onclick=()=>{
      const checks=missionChecks();
      capturedScenes.push({photo:2,angle:cameraState.angle,height:cameraState.height,light:cameraState.light,background:cameraState.background,distance:cameraState.distance});
      currentPhoto=2;
      cameraState.message=checks.every(c=>c.ok)
        ? 'Posição registrada. Ela comunica bem a forma da caneca. Compare agora com uma imagem de detalhe e outra de escala.'
        : `Posição registrada para comparar. ${checks.filter(c=>!c.ok).length} ponto(s) do desafio ainda podem melhorar; veja as dicas acima.`;
      status.hidden=false;status.textContent=cameraState.message;
    };
  }

  window.renderCamera = function renderCameraLab(){
    const s=cameraState;
    appPanel.innerHTML=`${appHeader('Câmera · Oficina de Foto')}<div class="app-body camera-lab">
      <p class="camera-intro">Aprenda a mostrar um produto de forma clara. Gire o celular de exemplo, compare posições e descubra o que cada imagem comunica.</p>
      <div class="camera-tabs" role="tablist" aria-label="Etapas da oficina de fotografia">
        ${[['praticar','Praticar'],['guia','Guia'],['missao','Desafio']].map(([id,label])=>`<button role="tab" data-camera-tab="${id}" aria-selected="${s.tab===id}" class="${s.tab===id?'active':''}">${label}</button>`).join('')}
      </div>
      ${s.tab==='praticar'?cameraPractice():s.tab==='guia'?cameraGuide():cameraMission()}
      <div class="app-footnote">Tudo é uma simulação local. Nenhuma foto real, permissão de câmera ou comunicação externa.</div>
    </div>`;
    bindBack();
    appPanel.querySelectorAll('[data-camera-tab]').forEach(b=>b.onclick=()=>{s.tab=b.dataset.cameraTab;window.renderCamera()});
    if (s.tab==='praticar') bindPractice();
    if (s.tab==='missao') {
      document.getElementById('backToPractice').onclick=()=>{s.tab='praticar';window.renderCamera()};
      appPanel.querySelectorAll('[data-cover]').forEach(b=>b.onclick=()=>{s.quizCover=b.dataset.cover;window.renderCamera()});
      appPanel.querySelectorAll('[data-scale]').forEach(b=>b.onclick=()=>{s.quizScale=b.dataset.scale;window.renderCamera()});
    }
  };

  const previousGallery=window.renderGallery;
  window.renderGallery=function renderGalleryWithCameraNotes(){
    previousGallery();
    const latest=capturedScenes.at(-1);
    if (!latest || typeof latest!=='object') return;
    const note=document.createElement('div');
    note.className='camera-feedback';
    const title=document.createElement('b');title.textContent='Última posição registrada no laboratório';
    const detail=document.createElement('span');
    detail.textContent=`${latest.angle}° · ${angleName(latest.angle)} · ${latest.height} · luz ${latest.light}. Este é o registro das escolhas, não uma foto real.`;
    note.append(title,detail);
    const notice=appPanel.querySelector('.notice-box');notice.before(note);
  };
})();
