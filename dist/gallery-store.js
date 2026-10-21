(function(global){
  const databaseName='metalab-pocket-gallery';
  const storeName='photos';
  let databasePromise;
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('metalab-pocket-gallery'):null;
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
  async function save(photo){
    if(!(photo.blob instanceof Blob)||photo.blob.size===0)throw new Error('Imagem vazia.');
    const id=global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const record={id,blob:photo.blob,name:photo.name,product:photo.product,angle:photo.angle,height:photo.height,createdAt:new Date().toISOString()};
    await request('readwrite',store=>store.put(record));notify();return record;
  }
  async function list(){const records=await request('readonly',store=>store.getAll());return records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
  async function remove(id){await request('readwrite',store=>store.delete(id));notify()}
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
  global.MetaLabGallery={save,list,remove,saveToComputer,hasSavePicker:()=>typeof global.showSaveFilePicker==='function'};
})(window);
