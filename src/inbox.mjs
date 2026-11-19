let db;
async function database(){return db ||= new Promise((resolve,reject)=>{const req=indexedDB.open('omniball-inbox',1);req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Device inbox storage is unavailable.'));});}
async function transaction(mode,operation){const connection=await database();return new Promise((resolve,reject)=>{const tx=connection.transaction('files',mode),req=operation(tx.objectStore('files'));let value;req.onsuccess=()=>value=req.result;tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(new Error('Could not save the received file. Free some device storage, then send it again.'));});}
export const saveIncoming=item=>transaction('readwrite',store=>store.put({...item,receivedAt:Date.now()}));
export const listIncoming=async()=>(await transaction('readonly',store=>store.getAll())).sort((a,b)=>b.receivedAt-a.receivedAt);
