// shared test helpers
const { chromium } = require(process.env.PW);
const fs=require('fs');const MOCK=fs.readFileSync(__dirname+'/firebase-mock.js','utf8');
exports.BASE='http://127.0.0.1:'+(process.env.PORT||8770)+'/';
exports.launch=async()=>chromium.launch();
exports.player=async(b,errs,tag)=>{const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:process.env.SW==='1'?'allow':'block'});
 await ctx.route('**/*',r=>{const u=r.request().url();
  if(/firebase-(app|database)-compat/.test(u))return u.includes('app-compat')?r.fulfill({body:MOCK,contentType:'application/javascript'}):r.fulfill({body:'',contentType:'application/javascript'});
  if(u.startsWith('http://127.0.0.1'))return r.continue();return r.abort()});
 const pg=await ctx.newPage();pg.setDefaultTimeout(6000);pg.on('pageerror',e=>errs.push(tag+': '+e.message));pg.on('dialog',d=>{errs.push(tag+' dialog: '+d.message());d.dismiss()});
 pg.on('console',m=>{if(m.type()==='error'&&!/Failed to load|ERR_FAILED/.test(m.text()))errs.push(tag+' console: '+m.text())});return pg};
exports.dump=()=>fetch(exports.BASE+'__fb/dump').then(r=>r.json());
exports.wait=ms=>new Promise(r=>setTimeout(r,ms));
