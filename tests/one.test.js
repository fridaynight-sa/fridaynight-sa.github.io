// مين فينا؟ «📱 جوال واحد»: both ways, a reload in the middle, and with no internet at all
const H=require('./h.js');const {chromium}=require(process.env.PW);const OUT=__dirname+'/../one/t-';
let fails=0;const ok=(n,c,x)=>{console.log((c?'PASS ':'FAIL ')+n+(x!==undefined?' → '+JSON.stringify(x).slice(0,300):''));if(!c)fails++};
const O=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('mf-one-v1')||'null'));
(async()=>{const b=await H.launch(),errs=[];const p=await H.player(b,errs,'one');
 await p.goto(H.BASE+'mf/');await p.waitForSelector('[data-act=oone]');await p.click('[data-act=oone]');
 for(const n of ['فيصل','سعد','نورة'])await (async()=>{await p.fill('#oName',n);await p.press('#oName','Enter')})();
 ok('three names',(await O(p)).names.length===3);await p.screenshot({path:OUT+'setup.png'});
 await p.click('[data-orounds="6"]');await p.click('[data-act=ostart]');
 // round 1: pass the phone
 const votes=[2,2,0];
 for(let t=0;t<3;t++){await p.click('[data-act=oready]');await p.click(`[data-ovote="${votes[t]}"]`);if(t===1)await p.screenshot({path:OUT+'vote.png'});await p.click('[data-act=ovote]')}
 let o=await O(p);ok('result: نورة with 2',o.phase==='reveal'&&o.res.winners[0]===2&&o.res.counts['2']===2,o.res);
 ok('+1 for voting with the majority (not for herself)',o.scores[0]===1&&o.scores[1]===1&&o.scores[2]===0,o.scores);
 await p.screenshot({path:OUT+'reveal.png'});
 await p.click('[data-act=onext]');await p.click('[data-act=oready]');
 await p.reload();await p.waitForSelector('[data-act=oone]');ok('home says go on',(await p.textContent('[data-act=oone]')).includes('كمّل'));
 await p.click('[data-act=oone]');ok('back where it was',await p.isVisible('[data-ovote="0"]'));
 await p.click('[data-act=oquit]').catch(()=>{});
 // «أشّروا»
 p.on('dialog',d=>d.accept());
 await p.evaluate(()=>{localStorage.removeItem('mf-one-v1')});await p.reload();await p.click('[data-act=oone]');
 ok('names kept for next time',(await p.$$eval('.onames span',x=>x.length))===3);
 ok('no «أشّروا» choice',!(await p.$('[data-omode]')));
 await p.click('[data-orounds="6"]');await p.click('[data-act=ostart]');
 for(let q=0;q<6;q++){for(let t=0;t<3;t++){await p.click('[data-act=oready]');await p.click(`[data-ovote="${(q+t)%3}"]`);await p.click('[data-act=ovote]')}await p.click('[data-act=onext]')}
 ok('the end with ranking',await p.isVisible('.podium'));await p.screenshot({path:OUT+'end.png',fullPage:true});
 // no internet at all
 const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});const q=await ctx.newPage();q.on('pageerror',e=>errs.push('off: '+e.message));
 await q.goto(H.BASE+'mf/');await H.wait(4000);
 ok('copy made',await q.evaluate(()=>caches.open('mind-v1').then(c=>c.match(new URL('../mf/app.js',location.href).href,{ignoreSearch:true})).then(m=>!!m)));
 await ctx.setOffline(true);await q.reload().catch(()=>{});await H.wait(1500);
 ok('opens with no internet',await q.isVisible('[data-act=oone]').catch(()=>false),await q.url());
 await q.click('[data-act=oone]');for(const n of ['أ','ب','ج'])await (async()=>{await q.fill('#oName',n);await q.press('#oName','Enter')})();
 await q.click('[data-act=ostart]');await q.click('[data-act=oready]');ok('plays with no internet',await q.isVisible('.stmt'));
 await ctx.setOffline(false);
 const r=await b.newContext({serviceWorkers:'allow'});const m=await r.newPage();await m.goto(H.BASE+'mind/');await H.wait(3000);await r.setOffline(true);await m.reload().catch(()=>{});await H.wait(1200);
 ok('Mind Games still open offline',(await m.textContent('body').catch(()=>'')).includes('Mind Games'));
 console.log('errors',errs);console.log(fails?fails+' FAILED':'ALL PASS');await b.close()})();
