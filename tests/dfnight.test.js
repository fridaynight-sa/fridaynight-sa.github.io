const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const names=['فيصل','سعد','نورة'];const pg=[];for(const n of names)pg.push(await H.player(b,errs,n));const [h,...ps]=pg;
const cl=async p=>{if(await p.locator('.fn-win button').count())await p.click('.fn-win button');if(await p.locator('.fn-nsheet [data-a=x]').count())await p.click('.fn-nsheet [data-a=x]')};
await h.goto(H.BASE+'mf/');await h.click('[data-act=ocreate]');await h.fill('#fName',names[0]);await h.click('[data-act=docreate]');await H.wait(800);const C=(await h.evaluate(()=>location.hash)).slice(1);
for(let i=0;i<ps.length;i++){await ps[i].goto(H.BASE+'mf/#'+C);await ps[i].waitForSelector('#fName');await ps[i].fill('#fName',names[i+1]);await ps[i].click('[data-act=dojoin]');}
await H.wait(1500);await h.click('.fn-nbar [data-a=switch]');await H.wait(300);await h.screenshot({path:process.env.S+'/dfn-sheet.png'});await h.click('.fn-ng [data-g=dafour]');await H.wait(6000);
console.log('host →',h.url().replace(H.BASE,''));for(const p of ps)console.log(' player →',p.url().replace(H.BASE,''));
for(const p of pg)await cl(p);await h.click('[data-act=hstart]');await H.wait(1500);
for(let r=0;r<10;r++){await pg[0].click('.opts4 button[data-opt="0"]');await pg[1].click('.opts4 button[data-opt="1"]');await pg[2].click('.opts4 button[data-opt="2"]');await H.wait(1400);await h.click('[data-act=hnext]');await H.wait(500);}
await H.wait(800);for(const p of pg)await cl(p);
await h.click('.fn-nbar [data-a=switch]');await H.wait(300);await h.click('.fn-nsheet [data-a=end]');await H.wait(2000);
const st=JSON.parse((await H.dump()).night[C].state.j);console.log('played:',JSON.stringify(st.played.map(x=>x.g+':'+Object.entries(x.rank).map(([k,v])=>st.names[k]+v).join(','))));
console.log('end:',(await ps[0].innerText('.fn-win').catch(()=>'none')).replace(/\s+/g,' ').slice(0,120));
console.log('errors',errs.filter(e=>!/vibrate|dialog/.test(e)));await b.close()})();
