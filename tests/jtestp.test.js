// جماد حيوان إنسان: a whole game with three phones
const H=require('./h.js');const OUT=__dirname+'/../jhs/p-';
let fails=0;const ok=(n,c,x)=>{console.log((c?'PASS ':'FAIL ')+n+(x!==undefined?' → '+JSON.stringify(x).slice(0,400):''));if(!c)fails++};
const st=p=>p.evaluate(()=>JH.S&&{phase:JH.S.phase,L:JH.S.L,r:JH.S.r});
const until=async(p,f,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(f).catch(()=>false))return true;await H.wait(150)}return false};
(async()=>{const b=await H.launch(),errs=[];
 const p1=await H.player(b,errs,'faisal'),p2=await H.player(b,errs,'saad'),p3=await H.player(b,errs,'noura');
 for(const p of [p1,p2])await p.addInitScript(()=>localStorage.setItem('jh-style-v1','"paper"'));
 await p1.goto(H.BASE+'jhi/');await p1.waitForSelector('[data-act=ocreate]');await p1.screenshot({path:OUT+'0-home.png'});
 await p1.click('[data-act=ocreate]');await p1.fill('#fName','فيصل');await p1.click('[data-act=docreate]');await p1.waitForSelector('.code');
 const code=await p1.textContent('.code');ok('room made',/^[A-Z]{4}$/.test(code),code);
 for(const [p,n] of [[p2,'سعد'],[p3,'نورة']]){await p.goto(H.BASE+'jhi/#'+code);await p.waitForSelector('#fName');await p.fill('#fName',n);await p.click('[data-act=dojoin]');}
 await H.wait(800);
 await p1.click('[data-cat=akla]');await H.wait(300);
 ok('host added أكلة',(await p1.evaluate(()=>JH.S.cats)).includes('akla'));
 ok('others see the settings',(await p2.textContent('#app')).includes('أكلة'));
 await p1.screenshot({path:OUT+'1-lobby.png',fullPage:true});
 await p1.click('[data-act=hstart]');
 ok('wheel shows on every phone',await until(p2,()=>!!document.querySelector('#wheel svg .sl'),5000));
 await H.wait(1200);await p2.screenshot({path:OUT+'2-spin.png'});
 ok('wheel lands: the letter plate',await until(p2,()=>{const q=document.getElementById('plq');return q&&!q.hidden},12000));
 const s1=await st(p1);ok('round 1, a letter',s1.r===1&&/^[ء-ي]$/.test(s1.L),s1);
 // the wheel stopped with that letter under the pointer, on every phone
 const top=await p2.evaluate(()=>{const w=document.getElementById('wheel');const n=JH.S.wl.length,a=((w._a%360)+360)%360,seg=360/n;const i=Math.round(((360-a)%360)/seg)%n;return {i,l:JH.S.wl[i],L:JH.S.L,hub:w.querySelector('.hub').textContent}});
 ok('the pointer is on the letter',top.l===top.L,top);
 await p2.screenshot({path:OUT+'3-landed.png'});
 ok('writing starts',await until(p1,()=>!!document.getElementById('wform'),8000));
 const L=s1.L;
 // words that start with the letter, from the game's own word list
 const W=await p1.evaluate(async L=>{const d=await fetch('words.json').then(r=>r.json());const o={};for(const c of JH.S.cats){o[c]=d.cats[c].filter(w=>{const k=JH.keyOf(w);const b=k.length>3&&k.startsWith('ال')?k.slice(2):k;return b[0]===L}).slice(0,3)}return o},L);
 ok('the list has words for every box',Object.values(W).every(a=>a.length>0),W);
 await H.wait(600);await p1.screenshot({path:OUT+'4-write.png',fullPage:true});
 const fill=async(p,v)=>{for(const [c,w] of Object.entries(v)){await p.fill('#f_'+c,w)}await H.wait(600)};
 const cats=await p1.evaluate(()=>JH.S.cats);
 const v1={},v2={},v3={};cats.forEach(c=>{v1[c]=W[c][0];v2[c]=(W[c][1]||W[c][0]);v3[c]=''});
 v2.hayawan=W.hayawan[0];                               // the same animal as فيصل
 v3.insan=L+'زقلوط';                                     // a word nobody knows → the vote
 v3.nabat='ززز';                                         // wrong letter (unless the letter is ز)
 await fill(p1,v1);await fill(p2,v2);await fill(p3,{insan:v3.insan,nabat:v3.nabat});
 ok('stop works only when all boxes are full',!(await p3.isEnabled('#stopb'))&&await p1.isEnabled('#stopb'));
 ok('a sign next to known words',(await p1.$$eval('.cf.ok,.nbrow.ok',x=>x.length))>=cats.length-1);
 await p1.click('#stopb');
 ok('everyone sees «ستوب»',await until(p3,()=>!!document.getElementById('stopov'),4000));
 await H.wait(700);await p3.screenshot({path:OUT+'5-stop.png'});
 ok('the others can still write in the 5 seconds',await p3.evaluate(()=>!document.getElementById('f_jamad').disabled));
 ok('vote comes',await until(p1,()=>JH.S&&JH.S.phase==='vote',12000),await st(p1));
 await H.wait(500);await p3.screenshot({path:OUT+'6-vote.png',fullPage:true});
 const items=await p1.evaluate(()=>JH.S.vote.items);
 ok('the unknown word is up for a vote',items.some(i=>i.c==='insan'&&i.by.length===1),items);
 for(const p of [p1,p2,p3]){const n=await p.$$eval('[data-vote][data-v="1"]',x=>x.length);for(let i=0;i<n;i++)await p.click(`[data-vote="${i}"][data-v="${p===p3?1:0}"]`);await p.click('[data-act=vsend]')}
 ok('reveal',await until(p1,()=>JH.S&&JH.S.phase==='reveal',8000));
 await H.wait(900);await p1.screenshot({path:OUT+'7-reveal.png',fullPage:true});
 const res=await p1.evaluate(()=>JH.S.res);
 const row=(c,p)=>res.cats.find(x=>x.c===c).rows.find(r=>r.p===p);
 const ids=await p1.evaluate(()=>JH.S.order);const [f,s,n]=ids;
 ok('same animal: 5 each',row('hayawan',f).pts===5&&row('hayawan',s).pts===5,[row('hayawan',f),row('hayawan',s)]);
 ok('rejected by the vote: 0',row('insan',n).pts===0&&row('insan',n).vt==='-',row('insan',n));
 ok('wrong letter: 0 with why',L==='ز'||row('nabat',n).st==='bad',row('nabat',n));
 ok('only one with a word: 15',row('jamad',f).pts+row('jamad',s).pts>=20||[row('jamad',f).pts,row('jamad',s).pts].includes(10),[row('jamad',f),row('jamad',s)]);
 ok('stop bonus for فيصل (all right)',res.sb===f&&res.d[f]>=5,res.d);
 ok('scores add up',JSON.stringify(await p1.evaluate(()=>JH.S.scores))===JSON.stringify(res.d),res.d);
 await H.wait(2500);await p1.click('[data-act=sheet]');await H.wait(900);await p1.screenshot({path:OUT+'9-sheet.png'});await p1.click('[data-act=sheetx]');
 ok('style button switches',await p3.textContent('#styBtn')==='📓'&&await p1.textContent('#styBtn')==='🎪');
 await p2.click('[data-rv="1"]');await H.wait(500);await p2.screenshot({path:OUT+'8-reveal2.png',fullPage:true});
 // round 2 with the clock
 await p1.click('[data-act=hnext]');
 ok('round 2 spins',await until(p1,()=>JH.S.phase==='spin'&&JH.S.r===2,5000));
 const L2=await p1.evaluate(()=>JH.S.L);ok('a new letter',L2!==L,[L,L2]);
 await until(p1,()=>!!document.querySelector('#wheel .sl'),5000);ok('used letter is grey on the wheel',await p1.evaluate(L=>{const i=JH.S.wl.indexOf(L);return document.querySelector(`#wheel .sl[data-i="${i}"]`).classList.contains('used')},L));
 console.log('errors',errs);console.log(fails?fails+' FAILED':'ALL PASS');await b.close()})();
