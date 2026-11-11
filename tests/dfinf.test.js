const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const names=['فيصل','سعد'];const pg=[];for(const n of names)pg.push(await H.player(b,errs,n));const [h,p]=pg;
h.removeAllListeners('dialog');h.on('dialog',d=>d.accept());
await h.goto(H.BASE+'dafour/');await h.click('[data-act=ocreate]');await h.fill('#fName','فيصل');await h.click('[data-act=docreate]');await H.wait(800);const C=(await h.evaluate(()=>location.hash)).slice(1);
await p.goto(H.BASE+'dafour/#'+C);await p.waitForSelector('#fName');await p.fill('#fName','سعد');await p.click('[data-act=dojoin]');await H.wait(1000);
console.log('options:',(await h.locator('.seg button').allInnerTexts()).join(' | '));
await h.click('[data-rounds=inf]');await H.wait(500);await h.screenshot({path:'dfinf-lobby.png'});console.log('note:',await h.locator('.note').nth(2).innerText().catch(()=>''));
await h.click('[data-act=hstart]');await H.wait(1200);
const tv=await H.player(b,errs,'tv');await tv.setViewportSize({width:1280,height:720});await tv.goto(H.BASE+'tv/#'+C);await H.wait(1500);
const ids=[];let hidMax=0;
for(let r=0;r<25;r++){const d=await H.dump();const s=JSON.parse(d.df[C].state.j);ids.push(s.q.text);hidMax=Math.max(hidMax,d.df[C].hidden.j.length);
 if(r===0){console.log('host head:',await h.locator('.note.center').first().innerText(),'| player has finish btn?',await p.isVisible('[data-act=hfinish]'),'| host?',await h.isVisible('[data-act=hfinish]'),'| tv:',await tv.locator('.tvsub').first().innerText());await h.screenshot({path:'dfinf-q.png'})}
 await h.click('.opts4 button[data-opt="0"]');await p.click('.opts4 button[data-opt="1"]');await H.wait(1300);
 if(r===24){await h.click('[data-act=hfinish]');break}
 await h.click('[data-act=hnext]');await H.wait(500);}
await H.wait(1200);const s=JSON.parse((await H.dump()).df[C].state.j);
console.log('phase',s.phase,'total',s.total,'distinct q',new Set(ids).size,'of',ids.length,'used',s.used.length,'hidden max len',hidMax);
console.log('player end:',(await p.innerText('#app')).slice(0,160).replace(/\n+/g,' | '));
// 50-question game: hidden size
await h.evaluate(()=>document.querySelector('[data-act=hlobby]').click());await H.wait(800);await h.evaluate(()=>document.querySelector('[data-rounds="50"]').click());await H.wait(400);await h.evaluate(()=>document.querySelector('[data-act=hstart]').click());await H.wait(1500);
const d2=await H.dump();const s2=JSON.parse(d2.df[C].state.j);console.log('50 game: total',s2.total,'inf',s2.inf,'hidden len',d2.df[C].hidden.j.length,'head',await h.locator('.note.center').first().innerText());
console.log('errors',errs);await b.close()})();
