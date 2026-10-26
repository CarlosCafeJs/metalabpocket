(function(global){
  const studentId=new URLSearchParams(global.location.search).get('studentId');
  const scope=studentId&&/^[0-9a-f-]{36}$/iu.test(studentId)?studentId:'guest';
  const databaseName=`metalab-pocket-gallery-${scope}`;
  const storeName='photos';
  let databasePromise;
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(`metalab-pocket-gallery-${scope}`):null;
  function open(){
    if(databasePromise)return databasePromise;
    databasePromise=new Promise((resolve,reject)=>{
      if(!global.indexedDB){reject(new Error('Galeria local indisponível neste navegador.'));return}
      const request=global.indexedDB.open(databaseName,1);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(storeName))db.createObjectStore(storeName,{keyPath:'id'})};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Não foi possível abrir a galeria.'));
    });
    return databasePromise;
  }
  async function request(mode,operation){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,mode),store=tx.objectStore(storeName);
      const action=operation(store);
      let result;
      action.onsuccess=()=>{result=action.result};
      action.onerror=()=>reject(action.error||new Error('Falha ao acessar a galeria.'));
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error||new Error('Falha ao acessar a galeria.'));
      tx.onabort=()=>reject(tx.error||new Error('Operação da galeria cancelada.'));
    });
  }
  function notify(){global.dispatchEvent(new Event('metalab-gallery-updated'));channel?.postMessage('updated')}
  channel?.addEventListener('message',()=>global.dispatchEvent(new Event('metalab-gallery-updated')));
  async function syncRecord(record){
    if(!record.blob||!record.blob.size){record.syncError='A imagem local não está disponível.';return 'local-only'}
    try{
      const response=await fetch('/api/student/photos',{method:'POST',credentials:'same-origin',headers:{'Content-Type':record.blob.type||'image/png','X-MetaLab-Photo-Id':String(record.id),'X-MetaLab-File-Name':encodeURIComponent(record.name||'foto-metalab.png'),'X-MetaLab-Product':encodeURIComponent(record.product||'Produto do curso'),'X-MetaLab-Angle':String(record.angle||0),'X-MetaLab-Height':String(record.height||0)},body:record.blob});
      const payload=await response.json().catch(()=>null);
      if(response.ok){record.remotePhotoId=payload?.photoId||record.remotePhotoId;record.syncError='';return 'synced'}
      record.syncError=payload?.error||`Falha ao sincronizar (HTTP ${response.status}).`;
      return 'local-only';
    }catch(error){record.syncError=global.navigator?.onLine===false?'Sem conexão com o servidor do curso.':'Não foi possível alcançar o servidor do curso.';return 'local-only'}
  }
  async function save(photo){
    if(!(photo.blob instanceof Blob)||photo.blob.size===0)throw new Error('Imagem vazia.');
    const id=global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const record={id,blob:photo.blob,name:photo.name,product:photo.product,angle:photo.angle,height:photo.height,createdAt:new Date().toISOString()};
    const db=await open();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,'readwrite'),store=tx.objectStore(storeName),all=store.getAll();
      let atLimit=false;
      all.onsuccess=()=>{if(all.result.length>=10){atLimit=true;tx.abort();return}store.put(record)};
      all.onerror=()=>reject(all.error||new Error('Falha ao conferir o limite da galeria.'));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Falha ao salvar a foto.'));
      tx.onabort=()=>reject(atLimit?new Error('PHOTO_LIMIT_REACHED'):tx.error||new Error('Operação da galeria cancelada.'));
    });
    record.syncStatus=await syncRecord(record);
    await request('readwrite',store=>store.put(record));notify();return record;
  }
  async function list(){const records=await request('readonly',store=>store.getAll());return records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
  async function syncPending(){
    const records=await list();let synced=0,localOnly=0;
    for(const record of records){if(record.syncStatus==='synced'){synced++;continue}const status=await syncRecord(record);record.syncStatus=status;await request('readwrite',store=>store.put(record));if(status==='synced')synced++;else localOnly++}
    notify();return{synced,localOnly};
  }
  global.addEventListener('online',()=>{void syncPending()});
  async function remove(id){
    const record=(await list()).find(item=>item.id===id);
    if(!record)return;
    try{
      const response=await fetch('/api/student/photos',{method:'DELETE',credentials:'same-origin',headers:{'X-MetaLab-Photo-Id':String(id)}});
      if(!response.ok&&response.status!==404&&record.syncStatus==='synced')throw new Error('Não foi possível remover a foto da galeria do curso. Tente novamente.');
    }catch(error){if(record.syncStatus==='synced')throw error}
    await request('readwrite',store=>store.delete(id));notify();
  }
  async function saveToComputer(blob,name){
    if(typeof global.showSaveFilePicker==='function'){
      try{
        const handle=await global.showSaveFilePicker({suggestedName:name,types:[{description:'Imagem PNG',accept:{'image/png':['.png']}}]});
        const writable=await handle.createWritable();await writable.write(blob);await writable.close();
        return 'saved';
      }catch(error){if(error?.name==='AbortError')return 'cancelled';throw error}
    }
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    return 'downloaded';
  }
  global.MetaLabGallery={save,list,remove,saveToComputer,syncPending,syncPhoto:async id=>{const record=(await list()).find(item=>item.id===id);if(!record)return null;record.syncStatus=await syncRecord(record);await request('readwrite',store=>store.put(record));notify();return record},hasSavePicker:()=>typeof global.showSaveFilePicker==='function'};
})(window);
