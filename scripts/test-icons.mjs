import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', process.argv[2] || 'public');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const links = [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) =>
  Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,key,value]) => [key,value])));
const apple = links.find(link => link.rel === 'apple-touch-icon');
assert.deepEqual(apple, {rel:'apple-touch-icon', sizes:'180x180', href:'/apple-touch-icon.png'});
assert(html.includes('<meta name="apple-mobile-web-app-title" content="Pocket Set">'));

function checkPng(bytes, size) {
  assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.subarray(12,16).toString(), 'IHDR');
  assert.equal(bytes.readUInt32BE(16), size);
  assert.equal(bytes.readUInt32BE(20), size);
  assert.equal(bytes[24], 8, '8-bit channels');
  assert.equal(bytes[25], 2, 'Opaque RGB, with no alpha channel');
  assert(bytes.length > 100, 'PNG must contain image data');
}

checkPng(await readFile(path.join(root, apple.href)), 180);
const png = links.find(link => link.rel === 'icon' && link.type === 'image/png');
assert.equal(png?.sizes, '32x32');
checkPng(await readFile(path.join(root, png.href)), 32);
const ico = links.find(link => link.rel === 'icon' && link.href.endsWith('.ico'));
assert.equal(ico?.sizes, '16x16 32x32 48x48');
const bytes = await readFile(path.join(root, ico.href));
assert.equal(bytes.readUInt16LE(0), 0);
assert.equal(bytes.readUInt16LE(2), 1);
assert.equal(bytes.readUInt16LE(4), 3);
for (const [i, size] of [16,32,48].entries()) {
  const entry = 6 + 16 * i;
  assert.equal(bytes[entry], size);
  assert.equal(bytes[entry + 1], size);
  const length = bytes.readUInt32LE(entry + 8);
  const offset = bytes.readUInt32LE(entry + 12);
  assert(offset + length <= bytes.length);
  checkPng(bytes.subarray(offset, offset + length), size);
}
console.log(`Icon links, opaque PNG dimensions, and ICO sizes passed (${path.basename(root)}).`);
