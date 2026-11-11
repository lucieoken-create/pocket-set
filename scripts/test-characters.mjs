import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {poses,posePath,portraitPath} from '../public/characters.js';
import {classes} from '../public/model.js';
const root=new URL('../',import.meta.url);
const png=async path=>{const b=await readFile(new URL(path,root));assert.equal(b.subarray(1,4).toString(),'PNG');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),type:b[25]};};
assert.equal(poses.length,6);assert.equal(new Set(poses).size,6);
for(const c of classes)assert.ok(poses[c.pose],`${c.name} has a valid pose slot`);
for(let i=0;i<poses.length;i++){const p=await png(`public/${posePath(i)}`);assert.deepEqual(p,{width:320,height:480,type:6},`${poses[i]}: 320×480 RGBA PNG required`)}
for(const happy of [false,true]){const p=await png(`public/${portraitPath(happy)}`);assert.equal(p.width,p.height);assert.ok(p.width>=128);}
assert.equal(posePath(99),posePath(0));
const app=await readFile(new URL('public/app.js',root),'utf8');assert.ok(app.includes('posePath(pose)')&&app.includes('portraitPath(happy)'));assert.ok(!app.includes('assets/sprites.png')&&!app.includes('assets/portraits.png'));
const css=await readFile(new URL('public/style.css',root),'utf8');assert.ok(css.includes('.sprite img{display:block;width:100%;height:100%'));assert.ok(!css.includes('447.8134'));
const guide=await readFile(new URL('docs/design/MAKE_IT_YOURS.md',root),'utf8');for(const n of [...poses,'profile','celebrate'])assert.ok(guide.includes(`${n}.png`));
const preview=await readFile(new URL('public/character-preview.html',root),'utf8');assert.ok(!preview.includes('supabase')&&!preview.includes('auth.js'));
console.log('Character slots, canvas formats, class map, guide coverage and account-free preview passed.');
