const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const names=['فيصل','سعد','نورة'];const pgs=[];
for(const n of names)pgs.push(await H.player(b,errs,n));const [h,...ps]=pgs;const tv=await H.player(b,errs,'tv');await tv.setViewportSize({width:1280,height:720});
await h.goto(H.BASE+'mf/');await h.click('[data-act=ocreate]');await h.fill('#fName',names[0]);await h.click('[data-act=docreate]');await H.wait(800);
const code=(await h.evaluate(()=>location.hash)).slice(1);
for(let i=0;i<ps.length;i++){await ps[i].goto(H.BASE+'mf/#'+code);await ps[i].waitForSelector('#fName');await ps[i].fill('#fName',names[i+1]);await ps[i].click('[data-act=dojoin]');}
await tv.goto(H.BASE+'tv/#'+code);await H.wait(1200);
await h.click('[data-act=hstart]');await H.wait(1200);await tv.screenshot({path:process.env.S+'/tv-mf-vote.png'});
for(const p of pgs){await p.locator('.vote button').nth(1).click();await p.click('[data-act=dovote]')}
await H.wait(1500);await tv.screenshot({path:process.env.S+'/tv-mf-reveal.png'});
console.log('errors',errs);await b.close()})();
