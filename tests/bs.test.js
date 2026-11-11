const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const names=['فيصل','سعد','نورة','خالد'];const pgs=[];
for(const n of names){pgs.push(await H.player(b,errs,n))}
const [h,...ps]=pgs;
await h.goto(H.BASE+'outside/');await h.click('[data-act=ocreate]');await h.fill('#fName',names[0]);await h.click('[data-act=docreate]');await H.wait(800);
const code=(await h.evaluate(()=>location.hash)).slice(1);console.log('code',code);
for(let i=0;i<ps.length;i++){await ps[i].goto(H.BASE+'outside/#'+code);await ps[i].waitForSelector('#fName');await ps[i].fill('#fName',names[i+1]);await ps[i].click('[data-act=dojoin]');}
await H.wait(1200);
await h.click('[data-act=hstart]');await H.wait(1500);
let d=await H.dump();const room=d.bs[code];
console.log('secret sample:',JSON.stringify(room.secret).slice(0,160));
console.log('hidden plaintext word?',/word/.test(room.hidden.j));
const roles=[];
for(let i=0;i<pgs.length;i++){const p=pgs[i];await p.click('.role[data-act=reveal], button[data-act=reveal]');await H.wait(200);roles.push(names[i]+': '+(await p.locator('.role').innerText()).replace(/\s+/g,' '));await p.click('[data-act=hide]');}
console.log(roles.join('\n'));
await h.click('[data-act=hask]');await H.wait(500);await h.click('[data-act=hvote]');await H.wait(800);
// everyone votes for player index (i+1)%n
for(let i=0;i<pgs.length;i++){const p=pgs[i];const t=names[(i+1)%names.length];await p.locator('.vote button',{hasText:t}).click();await p.click('[data-act=dovote]');await H.wait(200)}
await H.wait(1500);d=await H.dump();
console.log('vote sample:',JSON.stringify(d.bs[code].players).slice(0,200).replace(/"j":"/g,''));
console.log('phase now:',JSON.parse(d.bs[code].state.j).phase, JSON.stringify(JSON.parse(d.bs[code].state.j).reveal));
const outIdx=[];for(let i=0;i<pgs.length;i++){if(/فرصتك/.test(await pgs[i].innerText('#app')))outIdx.push(i)}
console.log('outsiders:',outIdx.map(i=>names[i]));
for(const i of outIdx){await pgs[i].locator('.opts button').first().click();await pgs[i].click('[data-act=doguess]')}
await H.wait(1500);console.log('host sees:',(await h.innerText('#app')).slice(0,300).replace(/\n+/g,' | '));
await h.screenshot({path:process.env.S+'/bs-host.png'});
console.log('errors',errs);await b.close()})();
