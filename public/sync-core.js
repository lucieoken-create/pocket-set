import {cleanData} from './model.js';
import {supabaseUrl, supabasePublishableKey} from './config.js';

export function createSync({auth, storage=localStorage, fetcher=fetch, uuid=()=>crypto.randomUUID()}={}) {
  const LEGACY='pocket-set-weights-v1';
  const cacheKey=id=>`pocket-set-supabase-v1:${id}`;
  const marker=id=>`pocket-set-supabase-imported-v1:${id}`;
  const prefix=id=>`pocket-set-supabase-pending-v1:${id}:`;
  let user=null, data={}, legacy={}, pending=false, loading=true, inflight=null, epoch=0;
  let status='Checking your Pocket Set sign-in…';
  const listeners=new Set();
  const emit=()=>listeners.forEach(fn=>fn());
  const state=()=>({userId:user?.id??null,email:user?.email??'',data,status,ready:!!user,loading,pending,hasLegacy:!!user&&Object.keys(legacy).length>0,legacyCount:Object.keys(legacy).length});
  const read=key=>{try{return cleanData(JSON.parse(storage.getItem(key)||'{}'));}catch{return {};}};
  function merge(a,b){const n={...a};for(const [area,v] of Object.entries(b))if(!n[area]||Date.parse(v.date)>Date.parse(n[area].date))n[area]=v;return n;}
  function queued(id){const entries=[];try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix(id)))entries.push({key,weights:read(key)});}}catch{}return entries;}
  const queuedWeights=entries=>entries.reduce((result,item)=>merge(result,item.weights),{});
  const cache=id=>{try{storage.setItem(cacheKey(id),JSON.stringify(data));}catch{}};
  function enqueue(id,weights){if(Object.keys(weights).length)storage.setItem(prefix(id)+uuid(),JSON.stringify(weights));}
  function setSession(session){
    loading=false;
    const next=session?.user??null;
    if(next?.id===user?.id){if(next)user=next;else status='Sign in to sync weights across your devices.';emit();return;}
    epoch++;user=next;data={};legacy={};pending=false;
    if(user){
      data=merge(read(cacheKey(user.id)),queuedWeights(queued(user.id)));
      pending=queued(user.id).length>0;
      try{legacy=storage.getItem(marker(user.id))?{}:read(LEGACY);}catch{}
      status='Loading your cloud weights…';
    }else status='Sign in to sync weights across your devices.';
    emit();
  }
  async function request(id,entries){
    const {data:sessionData,error}=await auth.getSession();
    const session=sessionData?.session;
    if(error||!session||session.user.id!==id||user?.id!==id)throw new Error('Account changed. Sign in again before saving.');
    // Capture this account's JWT. An account switch while fetch is in flight
    // must not send a previous account's queued weights under a new session.
    const response=await fetcher(`${supabaseUrl}/rest/v1/rpc/merge_my_pocket_set_weights`,{
      method:'POST',cache:'no-store',signal:AbortSignal.timeout(15000),
      headers:{apikey:supabasePublishableKey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_entries:Object.entries(entries).map(([area,value])=>({area,...value}))})
    });
    if(!response.ok)throw new Error(response.status===401?'Your session needs to be refreshed. Sign in again.':'Cloud sync is unavailable.');
    const rows=await response.json();
    if(!Array.isArray(rows)||rows.some(row=>row.user_id!==id))throw new Error('Invalid cloud response.');
    return cleanData(Object.fromEntries(rows.map(({area,weight,date})=>[area,{weight,date}])));
  }
  async function perform(){
    if(!user)return;
    const id=user.id,version=epoch;
    const active=()=>user?.id===id&&epoch===version;
    try{
      let entries=queued(id);
      do{
        const remote=await request(id,queuedWeights(entries));
        if(!active())return;
        // Only acknowledged entries are removed. New edits in any tab survive.
        for(const entry of entries)storage.removeItem(entry.key);
        entries=queued(id);data=merge(remote,queuedWeights(entries));pending=entries.length>0;
        status=pending?'Saved on this device · syncing…':'Synced to your Pocket Set account';
        cache(id);emit();
      }while(entries.length);
    }catch{
      if(!active())return;
      pending=queued(id).length>0;
      status=pending?'Saved on this device · cloud sync pending':'Couldn’t refresh. Showing this account’s last saved weights.';
      emit();
    }
  }
  async function connect(){
    if(inflight)await inflight;
    if(inflight)return connect();
    const task=perform();inflight=task;
    try{await task;}finally{if(inflight===task)inflight=null;}
  }
  async function save(patch,expectedUserId=user?.id){
    if(!user||user.id!==expectedUserId)throw new Error('Account changed. Reopen the class before saving.');
    const id=user.id,cleaned=cleanData(patch);
    try{enqueue(id,cleaned);}catch{throw new Error('This browser cannot keep a safe device copy. Allow site storage before saving.');}
    data=merge(data,queuedWeights(queued(id)));pending=queued(id).length>0;
    status=pending?'Saved on this device · syncing…':status;cache(id);emit();
    await connect();
    if(user?.id!==id)throw new Error('Account changed. Your previous account’s device copy is unchanged.');
    return data;
  }
  async function importLegacy(){
    if(!user)throw new Error('Sign in before importing.');
    const id=user.id;
    // The RPC applies newer-only merging atomically, even if cloud changed
    // since this screen loaded. Original device storage is never modified.
    await save(legacy,id);
    if(user?.id===id&&!pending){storage.setItem(marker(id),'yes');legacy={};emit();}
  }
  async function start(){
    auth.onAuthStateChange((_event,session)=>{
      setSession(session);
      // Do not await another SDK call from inside its auth callback lock.
      setTimeout(()=>{void connect();},0);
    });
    const {data:sessionData,error}=await auth.getSession();
    if(error){loading=false;status='Couldn’t check sign-in. Refresh when online.';emit();return;}
    setSession(sessionData.session);await connect();
  }
  return {state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},start,connect,flush:connect,save,importLegacy,setSession,
    legacyBackup:()=>read(LEGACY),handleStorage:event=>{if(user&&(event.key===null||event.key?.startsWith(prefix(user.id))))void connect();}};
}

