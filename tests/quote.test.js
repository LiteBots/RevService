'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const sharp=require('sharp');
const request=require('supertest');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const session=require('express-session');
const mongoose=require('mongoose');
const {validateQuote,preparePhotos}=require('../lib/quote-input');
let mongo,app,Task,admin,server,sessionStore;
const input=()=>({service:'Przeprowadzka',route:'Słupsk → Ustka',date:'Do ustalenia',description:'Kanapa i kartony',clientName:'Test',phone:'+49 151 12345678',requestId:randomUUID()});
// HTTP tests use an in-memory repository and the real Mongoose schema.
// They intentionally do not connect to a production or external database.
let rows=[];
before(async()=>{
 process.env.SESSION_SECRET='test-only-secret';process.env.ADMIN_PIN='8246';process.env.AUTH_DISABLED='false';process.env.DISCORD_WEBHOOK_URL='';process.env.NODE_ENV='test';
 const filename=path.resolve(__dirname,'../server.js');const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));const originalRequire=mod.require.bind(mod);
 mod.require=name=>name==='connect-mongo'?{create:()=>new session.MemoryStore()}:originalRequire(name);
 mod._compile(fs.readFileSync(filename,'utf8'),filename);({app,Task,sessionStore}=mod.exports);
 const query=row=>({select:async()=>row,then:(ok,fail)=>Promise.resolve(row).then(ok,fail)});
 Task.findOne=filter=>query(rows.find(x=>x.quoteRequestId===filter.quoteRequestId)||null);
 Task.findById=id=>query(rows.find(x=>String(x._id)===String(id))||null);
 Task.create=async data=>{const doc=new Task(data);await doc.validate();rows.push(doc);return doc};
 Task.countDocuments=async filter=>rows.filter(x=>x.quoteRequestId===filter.quoteRequestId).length;
 admin=request.agent(app);const r=await admin.post('/api/login').send({pin:'8246'});assert.equal(r.status,200);
});
after(async()=>{await new Promise(r=>sessionStore.clear(r))});
test('international phone and old 9-digit form accepted',()=>{assert.equal(validateQuote(input()).phone,'+4915112345678');assert.equal(validateQuote({...input(),phone:'735 396 534'}).phone,'735396534');assert.equal(validateQuote({...input(),phone:'0049 151 12345678'}).phone,'+4915112345678')});
test('invalid and oversized inputs rejected',async()=>{for(const change of [{phone:'abc123'},{photos:[{data:'data:image/svg+xml;base64,PHN2Zz4='}]},{details:{a:{b:'x'}}},{photos:[{},{},{},{}]},{description:'x'.repeat(3501)}])assert.throws(()=>validateQuote({...input(),...change}));await assert.rejects(()=>preparePhotos([{data:'data:image/jpeg;base64,aGVsbG8='}]))});
test('quote saves once; confirms number; rejects conflicting retry',async()=>{const body=input();const a=await request(app).post('/api/quotes').send(body);assert.equal(a.status,201);assert.match(a.body.number,/^RV-[A-F0-9]{12}$/);const b=await request(app).post('/api/quotes').send(body);assert.equal(b.body.number,a.body.number);assert.equal(await Task.countDocuments({quoteRequestId:body.requestId}),1);const c=await request(app).post('/api/quotes').send({...body,description:'zmiana'});assert.equal(c.status,409)});
test('photo persists, hidden from normal queries and requires admin',async()=>{const bytes=await sharp({create:{width:40,height:20,channels:3,background:'#10b981'}}).png().toBuffer();const body={...input(),photos:[{data:'data:image/png;base64,'+bytes.toString('base64')}],details:{'Piętro':'3'}};const r=await request(app).post('/api/quotes').send(body);assert.equal(r.status,201);const task=await Task.findOne({quoteRequestId:body.requestId});assert.equal(task.quotePhotoCount,1);assert.equal(Task.schema.path('quotePhotos').options.select,false);assert.equal(task.quoteDetails.get('Piętro'),'3');const url='/api/tasks/'+task.id+'/photos/0';assert.equal((await request(app).get(url)).status,401);const image=await admin.get(url);assert.equal(image.status,200);assert.match(image.headers['content-type'],/image\/jpeg/);assert.equal((await sharp(image.body).metadata()).width,40);assert.equal((await admin.get('/api/tasks/'+task.id+'/photos/3')).status,404)});
test('new public pages and old redirects work',async()=>{for(const p of ['mycie-cisnieniowe.html','obszar-dzialania.html','polityka-prywatnosci.html','wycena.html','sitemap.xml','robots.txt'])assert.equal((await request(app).get('/'+p)).status,200,p);const r=await request(app).get('/oproznianie.html');assert.equal(r.status,301);assert.equal(r.headers.location,'/oproznianie-utylizacja.html')});
