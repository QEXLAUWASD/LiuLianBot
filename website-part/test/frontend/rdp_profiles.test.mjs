import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createRdpProfiles } from '../../public/js/rdp_profiles.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
test('UI supports create/load/update/delete and sends passwords only to the profile API', async () => {
  const dom = new JSDOM(readFileSync(new URL('../../public/remote.html',import.meta.url),'utf8'),{url:'https://example.com'});
  const doc=dom.window.document, el=id=>doc.getElementById(id);
  const rows=new Map(), requests=[];
  const request=async(path,options={})=>{
    requests.push({path,options});
    const id=path.split('/')[4];
    if(!options.method && !id) return {available:true,profiles:[...rows].map(([id,p])=>({id,name:p.name}))};
    if(!options.method) return {profile:rows.get(id)};
    if(options.method==='POST') {const p=JSON.parse(options.body); rows.set('one',p); return {id:'one'};}
    if(options.method==='PUT') {rows.set(id,JSON.parse(options.body)); return null;}
    if(options.method==='DELETE') {rows.delete(id); return null;}
  };
  const controller=createRdpProfiles(doc,request); await controller.initialize();
  el('rdpProfileName').value='Home'; el('rdpHost').value='192.168.0.10'; el('rdpUsername').value='alice'; el('rdpPassword').value='secret';
  el('saveRdp').click(); await tick();
  assert.equal(rows.get('one').password,'secret');
  assert.equal(el('rdpProfileList').value,'one');
  el('newRdp').click();
  assert.equal(el('rdpPassword').value,'');
  el('rdpProfileList').value='one'; el('rdpProfileList').dispatchEvent(new dom.window.Event('change')); await tick();
  assert.equal(el('rdpPassword').value,'secret');
  el('rdpProfileName').value='Office'; el('saveRdp').click(); await tick();
  assert.equal(rows.get('one').name,'Office');
  assert.equal(dom.window.localStorage.length,0);
  el('deleteServerProfile').click(); await tick();
  assert.equal(rows.size,0); assert.equal(el('rdpPassword').value,'');
  assert.equal(el('deleteServerProfile').disabled,true);
  dom.window.close();
});
test('missing encryption configuration disables storage and explains setup', async () => {
  const dom=new JSDOM(readFileSync(new URL('../../public/remote.html',import.meta.url),'utf8'));
  await createRdpProfiles(dom.window.document,async()=>({available:false,profiles:[]})).initialize();
  assert.equal(dom.window.document.getElementById('saveRdp').disabled,true);
  assert.match(dom.window.document.getElementById('rdpProfileStatus').textContent,/REMOTE_CREDENTIAL_ENCRYPTION_KEY/);
  dom.window.close();
});
