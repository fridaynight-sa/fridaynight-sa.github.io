const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const names=['فيصل','سعد','نورة'];const pgs=[];
for(const n of names)pgs.push(await H.player(b,errs,n));
const [h,...ps]=pgs;
await h.goto(H.BASE+'sedq/');await h.click('[data-act=ocreate]');await h.fill('#fName',names[0]);await h.click('[data-act=docreate]');await H.wait(800);
const code=(await h.evaluate(()=>location.hash)).slice(1);
for(let i=0;i<ps.length;i++){await ps[i].goto(H.BASE+'sedq/#'+code);await ps[i].waitForSelector('#fName');await ps[i].fill('#fName',names[i+1]);await ps[i].click('[data-act=dojoin]');}
await H.wait(1000);await h.click('[data-act=hstart]');await H.wait(1200);
let d=await H.dump();const room=d.sq[code];
const st=JSON.parse(room.state.j);console.log('q:',st.q.text);
// truth for test, peek via host page decrypt
const truth=await h.evaluate(async(c)=>{const v=await (await fetch('/__fb/get?p=sq/'+c+'/hidden')).json();const H=await FNC.open(JSON.parse(v.j));return H.qs[0].a},code);
console.log('truth (host only):',truth,' | hidden has plaintext?',room.hidden.j.includes(truth));
// non-host can't open hidden
console.log('player opens hidden:',await ps[0].evaluate(async(c)=>{const v=await (await fetch('/__fb/get?p=sq/'+c+'/hidden')).json();return String(await FNC.open(JSON.parse(v.j)))},code));
const lies=['كذبة سعد','كذبة نورة'];
await h.fill('#fLie',truth);await h.click('[data-act=lie]');await H.wait(1200);
console.log('host after writing truth:',(await h.innerText('#app')).match(/كتبت الجواب الصحيح[^\n]*/)?.[0]);
await h.fill('#fLie','كذبة فيصل');await h.click('[data-act=lie]');
for(let i=0;i<ps.length;i++){await ps[i].fill('#fLie',lies[i]);await ps[i].click('[data-act=lie]');}
await H.wait(1500);
d=await H.dump();console.log('lie stored plaintext?',/كذبة/.test(JSON.stringify(d.sq[code].players)),' state.mine plaintext?',/"o\d/.test(JSON.parse(d.sq[code].state.j).mine&&JSON.stringify(JSON.parse(d.sq[code].state.j).mine)));
for(const [i,p] of pgs.entries()){console.log(names[i],'options:',(await p.locator('.opts button').allInnerTexts()).join(' | '))}
for(const p of pgs){const btn=p.locator('.opts button:not([disabled])',{hasText:truth});if(await btn.count())await btn.first().click();else await p.locator('.opts button:not([disabled])').first().click()}
await H.wait(1500);console.log('host reveal:',(await h.innerText('#app')).slice(0,400).replace(/\n+/g,' | '));
console.log('errors',errs);await b.close()})();
