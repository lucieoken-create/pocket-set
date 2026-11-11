import assert from 'node:assert/strict';
import {createSync} from '../public/sync-core.js';
import * as model from '../public/model.js';
const record=(weight,n=10)=>({weight,date:`2026-11-${String(n).padStart(2,'0')}T00:00:00.000Z`});
const merge=(a,b)=>{const n={...a};for(const [key,v]of Object.entries(b))if(!n[key]||Date.parse(v.date)>Date.parse(n[key].date))n[key]=v;return n};
function setup(initial={}){
  const store=new Map(Object.entries(initial));let nonce=0;
  const state={account:'alice',remote:{alice:{},bob:{}},writes:[],offline:false,failStorage:false,callback:null,beforeResponse:null};
  const storage={get length(){return store.size},key:i=>[...store.keys()][i]??null,getItem:key=>store.get(key)??null,setItem:(key,value)=>{if(state.failStorage)throw Error('Storage blocked');store.set(key,String(value))},removeItem:key=>store.delete(key)};
  const session=()=>state.account?{user:{id:state.account,email:`${state.account}@example.test`},access_token:`jwt:${state.account}`}:null;
  const auth={getSession:async()=>({data:{session:session()},error:null}),onAuthStateChange:fn=>{state.callback=fn}};
  const fetcher=async(url,options)=>{
    assert(url.endsWith('/rest/v1/rpc/merge_my_pocket_set_weights'));
    if(state.offline)throw Error('Offline');
    const id=options.headers.Authorization.slice('Bearer jwt:'.length);
    const {p_entries}=JSON.parse(options.body);
    assert(!('user_id' in JSON.parse(options.body)));
    state.writes.push({id,entries:p_entries});
    state.remote[id]=merge(state.remote[id],Object.fromEntries(p_entries.map(({area,...v})=>[area,v])));
    if(state.beforeResponse)await state.beforeResponse();
    return Response.json(Object.entries(state.remote[id]).map(([area,v])=>({user_id:id,area,...v})));
  };
  const sync=createSync({auth,storage,fetcher,uuid:()=>String(++nonce)});
  const change=id=>{state.account=id;sync.setSession(session());};
  change('alice');return {sync,state,store,storage,change};
}
assert.equal(model.validWeight(null),false);assert.equal(model.validWeight(false),false);assert.equal(model.validWeight(' '),false);
assert.deepEqual(model.cleanData({Chest:{weight:null,date:record(0).date},Arms:record(20)}),{Arms:record(20)});
assert.deepEqual(model.dirtyDraft({Chest:'15',Arms:'21',Back:''},{Chest:15,Arms:20,Back:''}),{Arms:'21'});
{
 // Home summaries and edit fields both use these class mappings. Keep the
 // global area list unchanged so existing saved records remain available.
 assert.deepEqual(model.areas,['Chest','Back','Shoulders','Arms','Lower Body']);
 assert.deepEqual(Object.fromEntries(model.classes.map(c=>[c.name,c.areas])),{
  'Total Body':['Chest','Back','Shoulders','Arms','Lower Body'],
  'Arms & Abs':['Arms','Shoulders'],
  'Full Body · Lower Focus':['Lower Body'],
  'Chest, Back & Abs':['Chest','Back'],
  'Abs & Ass':['Lower Body'],
  'Full Body · Upper Focus':['Chest','Back','Shoulders','Arms']
 });
 const existing=Object.fromEntries(model.areas.map((a,i)=>[a,record(10+i)]));
 assert.deepEqual(model.cleanData(existing),existing);
 const {sync,state}=setup();state.remote.alice={...existing};await sync.connect();
 const saveClass=async(name,weight)=>{
  const selected=model.classes.find(c=>c.name===name);
  const original=Object.fromEntries(selected.areas.map(a=>[a,sync.state().data[a].weight]));
  const draft=Object.fromEntries(selected.areas.map(a=>[a,weight]));
  await sync.save(model.updateData({},model.dirtyDraft(draft,original),record(0,11).date));
  assert.deepEqual(state.writes.at(-1).entries.map(x=>x.area),selected.areas);
 };
 await saveClass('Full Body · Lower Focus',25);
 for(const area of model.areas.filter(a=>a!=='Lower Body'))assert.deepEqual(sync.state().data[area],existing[area]);
 await saveClass('Full Body · Upper Focus',20);
 assert.equal(sync.state().data['Lower Body'].weight,25);
 assert.equal(Object.keys(sync.state().data).length,5);
}
{
 const {sync,state}=setup();state.remote.alice.Chest=record(15);await sync.connect();assert.equal(sync.state().data.Chest.weight,15);
 state.remote.alice.Chest=record(30,11);await sync.save({Arms:record(22,11)});assert.equal(sync.state().data.Chest.weight,30);assert.deepEqual(state.writes.at(-1).entries.map(x=>x.area),['Arms']);
 await sync.save({Chest:record(20,11)});assert.equal(sync.state().data.Chest.weight,30);
}
{
 const original=JSON.stringify({Chest:record(12),Arms:record(20)});
 const {sync,state,store}=setup({'pocket-set-weights-v1':original,'pocket-set-cloud-v1:old-chatgpt-id':JSON.stringify({Back:record(99)})});
 state.remote.alice.Chest=record(30,11);await sync.connect();assert.equal(sync.state().hasLegacy,true);assert.deepEqual(state.writes[0].entries,[]);
 await sync.importLegacy();assert.equal(state.remote.alice.Chest.weight,30);assert.equal(state.remote.alice.Arms.weight,20);assert.equal(store.get('pocket-set-supabase-imported-v1:alice'),'yes');assert.equal(store.get('pocket-set-weights-v1'),original);assert(!state.remote.alice.Back);
}
{
 const {sync,state,store}=setup();await sync.connect();state.offline=true;await sync.save({Back:record(15,11)});assert.equal(sync.state().pending,true);
 store.set('pocket-set-supabase-pending-v1:alice:other-tab',JSON.stringify({Shoulders:record(17,11)}));
 state.offline=false;await sync.flush();assert.equal(state.remote.alice.Back.weight,15);assert.equal(state.remote.alice.Shoulders.weight,17);assert.equal(sync.state().pending,false);
 assert.equal([...store.keys()].filter(k=>k.startsWith('pocket-set-supabase-pending-v1:alice:')).length,0);
}
{
 const {sync,state,store,change}=setup();state.offline=true;await sync.save({Chest:record(25,11)},'alice');change('bob');state.offline=false;await sync.connect();
 assert.deepEqual(sync.state().data,{});assert.deepEqual(state.remote.bob,{});await assert.rejects(sync.save({Chest:record(25,11)},'alice'),/Account changed/);
 assert([...store.keys()].some(k=>k.startsWith('pocket-set-supabase-pending-v1:alice:')));
 change('alice');await sync.connect();assert.equal(state.remote.alice.Chest.weight,25);
}
{
 // Account changes while Alice's request is in flight: old response cannot
 // change Bob's display or clear Alice's safely retained pending entry.
 const {sync,state,store,change}=setup();state.beforeResponse=async()=>{state.beforeResponse=null;change('bob')};
 await assert.rejects(sync.save({Chest:record(25,11)},'alice'),/Account changed/);assert.deepEqual(state.remote.bob,{});assert.deepEqual(sync.state().data,{});
 assert([...store.keys()].some(k=>k.startsWith('pocket-set-supabase-pending-v1:alice:')));
 await sync.connect();assert.equal(sync.state().userId,'bob');
}
{
 const {sync,state,store}=setup({'pocket-set-supabase-v1:alice':'bad JSON','pocket-set-weights-v1':JSON.stringify({Arms:record(15)})});await sync.connect();state.failStorage=true;
 await assert.rejects(sync.importLegacy(),/safe device copy/);assert.equal(sync.state().hasLegacy,true);assert(!store.has('pocket-set-supabase-imported-v1:alice'));
}
{
 const {sync,state,store}=setup({'pocket-set-weights-v1':JSON.stringify({Arms:record(15)})});await sync.connect();state.offline=true;await sync.importLegacy();assert.equal(sync.state().pending,true);assert.equal(sync.state().hasLegacy,true);assert(!store.has('pocket-set-supabase-imported-v1:alice'));
}
{
 const {sync,state}=setup();await sync.connect();await Promise.all([sync.save({Arms:record(12,11)}),sync.save({Back:record(22,11)})]);assert.equal(state.remote.alice.Arms.weight,12);assert.equal(state.remote.alice.Back.weight,22);
}
{
 const {sync,state,change}=setup();await sync.start();state.account=null;state.callback('SIGNED_OUT',null);assert.equal(sync.state().ready,false);assert.deepEqual(sync.state().data,{});assert.match(sync.state().status,/Sign in/);change('bob');await sync.connect();assert.deepEqual(sync.state().data,{});
}
{
 const {sync,state}=setup();state.beforeResponse=async()=>{state.beforeResponse=null;state.remote.alice.Arms=record(30,11)};await sync.connect();assert.equal(sync.state().data.Arms.weight,30);
}
console.log('Passed: class area mappings; focus-class saves preserve other areas; model validation; signed-in reads; dirty-area writes; stale/tie conflicts; explicit migration; unchanged legacy copy; old identity cache isolation; offline queue; multi-tab queue; account switching and in-flight race; storage failure; pending import; concurrent saves; sign-out; refresh.');
