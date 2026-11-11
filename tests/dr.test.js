const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const names=['فيصل','سعد','نورة'];const pgs=[];
for(const n of names)pgs.push(await H.player(b,errs,n));const [h,...ps]=pgs;
await h.goto(H.BASE+'draw/');await h.click('[data-act=ocreate]');await h.fill('#fName',names[0]);await h.click('[data-act=docreate]');await H.wait(800);
const code=(await h.evaluate(()=>location.hash)).slice(1);
for(let i=0;i<ps.length;i++){await ps[i].goto(H.BASE+'draw/#'+code);await ps[i].waitForSelector('#fName');await ps[i].fill('#fName',names[i+1]);await ps[i].click('[data-act=dojoin]');}
await H.wait(1000);await h.click('[data-act=hstart]');await H.wait(1500);
let di=-1;for(let i=0;i<3;i++){if(await pgs[i].locator('[data-word]').count())di=i}
console.log('drawer',names[di]);const d=pgs[di];const opts=await d.locator('[data-word]').allInnerTexts();console.log('options',opts);
let dump=await H.dump();console.log('options visible in db?',opts.some(w=>JSON.stringify(dump.draw[code]).includes(w)));
await d.locator('[data-word]').nth(1).click();await H.wait(1500);
const word=opts[1];
console.log('drawer top:',await d.locator('#topw').innerText());
const box=await d.locator('#cv').boundingBox();
await d.mouse.move(box.x+40,box.y+40);await d.mouse.down();for(let k=0;k<20;k++){await d.mouse.move(box.x+40+k*12,box.y+40+Math.sin(k/3)*40);await H.wait(20)}await d.mouse.up();
await d.click('[data-color="#e03131"]');await d.mouse.move(box.x+100,box.y+150);await d.mouse.down();await d.mouse.move(box.x+250,box.y+200,{steps:10});await d.mouse.up();
await H.wait(800);dump=await H.dump();console.log('strokes in db:',Object.keys(dump.draw[code].strokes||{}).length,'| word in db before reveal?',JSON.stringify(dump.draw[code]).includes(word));
const g=pgs.filter((_,i)=>i!==di);
console.log('guesser hint:',(await g[0].locator('#topw').innerText()).replace(/\s/g,'·'));
await g[0].fill('#fGuess','غلط');await g[0].press('#fGuess','Enter');await H.wait(900);
// close guess: change one letter if long enough
const close=word.length>=4?word.slice(0,-1)+'ز':'xx';await g[1].fill('#fGuess',close);await g[1].press('#fGuess','Enter');await H.wait(900);
console.log('chat seen by guesser2:',(await g[1].locator('.chat').innerText()).replace(/\n/g,' / '));
await g[0].fill('#fGuess',word);await g[0].press('#fGuess','Enter');await H.wait(1200);
console.log('g0 msg:',await g[0].locator('#gmsg').innerText(),'| word leaked to chat?',(await g[1].locator('.chat').innerText()).includes(word));
await g[1].screenshot({path:process.env.S+'/dr-guess.png',fullPage:true});await d.screenshot({path:process.env.S+'/dr-drawer.png',fullPage:true});
await g[1].fill('#fGuess',word);await g[1].press('#fGuess','Enter');await H.wait(1500);
console.log('after all correct:',(await h.innerText('#app')).replace(/\n+/g,' | ').slice(0,250));
await h.screenshot({path:process.env.S+'/dr-reveal.png',fullPage:true});
await H.wait(7500);console.log('auto next phase:',JSON.parse((await H.dump()).draw[code].state.j).phase);
console.log('errors',errs);await b.close()})();
