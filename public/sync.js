import {createSync} from './sync-core.js';
import {client} from './auth.js';
export const sync=createSync({auth:client.auth});
window.addEventListener('online',()=>sync.connect());
window.addEventListener('focus',()=>sync.connect());
window.addEventListener('storage',sync.handleStorage);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync.connect();});
setInterval(()=>{if(document.visibilityState==='visible')sync.connect();},30000);
