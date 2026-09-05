const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRouter } = require('../src/routes/rdp_profiles');
const { decryptProfile } = require('../src/services/remote_profile_crypto');
const { MIGRATIONS } = require('../src/db/migrate');
test('named profiles isolate users, encrypt passwords, preserve blank updates and delete only one profile', async t => {
  const oldKey = process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY;
  process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  t.after(() => { if (oldKey === undefined) delete process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY; else process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY = oldKey; });
  const rows = new Map();
  const repo = {
    list: async user => [...rows.values()].filter(r => r.user === user).map(({id,name}) => ({id,name})),
    get: async (user,id) => rows.get(id)?.user === user ? rows.get(id) : null,
    create: async (user,id,name,encrypted_data) => rows.set(id,{user,id,name,encrypted_data}),
    update: async (user,id,name,encrypted_data) => { if(rows.get(id)?.user !== user) return false; rows.set(id,{user,id,name,encrypted_data}); return true; },
    remove: async (user,id) => rows.get(id)?.user === user && rows.delete(id),
  };
  const app = express(); app.use(express.json());
  // Test-only session injection; production derives the ID from signed server sessions.
  app.use((req,res,next) => { req.session = {user: req.headers['x-user'] ? {id:req.headers['x-user']} : null}; next(); });
  app.use(createRouter(repo));
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (user,method,path,body) => fetch('http://127.0.0.1:'+server.address().port+path, {
    method, headers: {'Content-Type':'application/json', ...(user ? {'x-user':user} : {})}, body:body ? JSON.stringify(body) : undefined,
  });
  const body = {name:'Home',host:'192.168.0.10',username:'admin',password:'private-password',userId:'someone-else'};
  assert.equal((await request(null,'GET','/')).status,401);
  const first = await (await request('alice','POST','/',body)).json();
  const second = await (await request('alice','POST','/',{...body,name:'Office'})).json();
  assert.notEqual(first.id,second.id);
  assert.doesNotMatch(rows.get(first.id).encrypted_data,/private-password/);
  assert.equal(decryptProfile(rows.get(first.id).encrypted_data).password,'private-password');
  const listResponse = await request('alice','GET','/');
  assert.equal(listResponse.headers.get('cache-control'),'no-store');
  const list = await listResponse.json();
  assert.equal(list.profiles.length,2);
  assert.equal(JSON.stringify(list).includes('private-password'),false);
  assert.equal((await (await request('bob','GET','/')).json()).profiles.length,0);
  for (const method of ['GET','PUT','DELETE']) {
    assert.equal((await request('bob',method,'/'+first.id,method==='PUT'?body:undefined)).status,404);
  }
  assert.equal((await request('alice','PUT','/'+first.id,{...body,name:'Renamed',password:''})).status,204);
  const saved = await (await request('alice','GET','/'+first.id)).json();
  assert.equal(saved.profile.name,'Renamed');
  assert.equal(saved.profile.password,'private-password');
  assert.equal((await request('alice','POST','/',{...body,name:''})).status,400);
  assert.equal((await request('alice','POST','/',{...body,password:'bad\npassword'})).status,400);
  assert.equal((await request('alice','DELETE','/'+first.id)).status,204);
  assert.equal((await (await request('alice','GET','/')).json()).profiles.length,1);
  delete process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY;
  assert.equal((await (await request('alice','GET','/')).json()).available,false);
  assert.equal((await request('alice','POST','/',body)).status,503);
});
test('RDP migration creates a separate table with user deletion cascade', async () => {
  const sql = [];
  const migration = MIGRATIONS.find(m => m.version === '016');
  assert.ok(migration);
  await migration.up({execute: async statement => sql.push(statement)});
  assert.match(sql[0],/website_rdp_profiles/);
  assert.match(sql[0],/REFERENCES website_users\(id\) ON DELETE CASCADE/);
});
test('RDP repository operations bind the owner ID for every read and mutation', async () => {
  const {createRepository} = require('../src/db/rdp_profiles');
  const queries=[];
  const repo=createRepository(async () => ({execute:async(sql,args)=>{queries.push({sql,args}); return [sql.startsWith('SELECT')?[]:{affectedRows:0}];}}));
  await repo.list('alice'); await repo.get('alice','id'); await repo.create('alice','id','name','encrypted');
  await repo.update('alice','id','name','encrypted'); await repo.remove('alice','id');
  for(const query of queries) { assert.ok(query.args.includes('alice')); if(!query.sql.startsWith('INSERT')) assert.match(query.sql,/WHERE user_id = \?/); }
});
