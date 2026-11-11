const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const names=['فيصل','سعد','نورة','خالد'];const pgs=[];
for(const n of names)pgs.push(await H.player(b,errs,n));const [h,...ps]=pgs;
await h.goto(H.BASE+'mf/');await h.click('[data-act=ocreate]');await h.fill('#fName',names[0]);await h.click('[data-act=docreate]');await H.wait(800);
const code=(await h.evaluate(()=>location.hash)).slice(1);
for(let i=0;i<ps.length;i++){await ps[i].goto(H.BASE+'mf/#'+code);await ps[i].waitForSelector('#fName');await ps[i].fill('#fName',names[i+1]);await ps[i].click('[data-act=dojoin]');}
await H.wait(1000);await h.click('[data-rounds="6"]');await H.wait(400);await h.click('[data-act=hstart]');await H.wait(1200);
for(let r=0;r<6;r++){
 for(let i=0;i<pgs.length;i++){const t=r%2?names[1]:names[(i*r+1)%4];await pgs[i].locator('.vote button',{hasText:t}).first().click();await pgs[i].click('[data-act=dovote]');}
 await H.wait(1500);
 if(r===0){const d=await H.dump();console.log('votes plaintext?',/فيصل|سعد|نورة|خالد/.test(JSON.stringify(Object.values(d.mf[code].players).map(x=>JSON.parse(x.j).vote))));await ps[1].screenshot({path:process.env.S+'/mf-reveal.png',fullPage:true});}
 console.log('r'+r,(await ps[1].innerText('#app')).split('\n').slice(0,4).join(' | '));
 await h.click('[data-act=hnext]');await H.wait(800);
}
await ps[1].screenshot({path:process.env.S+'/mf-end.png',fullPage:true});
console.log('end:',(await ps[1].innerText('#app')).replace(/\n+/g,' | ').slice(0,400));
console.log('errors',errs);await b.close()})();
