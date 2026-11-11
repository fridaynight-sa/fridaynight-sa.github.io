const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const names=['فيصل','سعد','نورة'];const pg=[];for(const n of names)pg.push(await H.player(b,errs,n));
async function play(hi){const h=pg[hi],others=pg.filter((_,i)=>i!==hi);
 await h.goto('about:blank');await h.goto(H.BASE+'dafour/');await H.wait(900);if(await h.$('[data-act=leave]')){await h.click('[data-act=leave]');await H.wait(600);}
  await h.click('[data-act=ocreate]');await h.fill('#fName',names[hi]);await h.click('[data-act=docreate]');await H.wait(800);const C=(await h.evaluate(()=>location.hash)).slice(1);
 for(const p of others){await p.goto('about:blank');await p.goto(H.BASE+'dafour/#'+C);await p.waitForSelector('#fName');await p.fill('#fName',names[pg.indexOf(p)]);await p.click('[data-act=dojoin]');}
 await H.wait(1200);
 const d0=await H.dump();const sizes=Object.values(d0.df[C].players).map(x=>x.j.length);
 await h.click('[data-act=hstart]');await H.wait(1200);const texts=[];
 for(let r=0;r<10;r++){const s=JSON.parse((await H.dump()).df[C].state.j);texts.push(s.q.text);
  for(const p of pg)await p.click('.opts4 button[data-opt="0"]');await H.wait(1400);await h.click('[data-act=hnext]');await H.wait(500);}
 return {C,texts,sizes}}
const all=[];for(const hi of [0,1,2,0]){const r=await play(hi);const rep=r.texts.filter(t=>all.includes(t)).length;console.log('room',r.C,'host',names[hi],'repeats vs before:',rep,'| player record sizes',r.sizes.join(','));all.push(...r.texts)}
console.log('seen on سعد phone:',await pg[1].evaluate(()=>DF.seenList().length));
// one host alone, 60 games of 10: when does the first repeat come?
const first=await pg[0].evaluate(()=>{const seen=[];for(let g=0;g<60;g++){const w=DF.seenWeights([seen]);const qs=DF.pickQuestions(10,[],w);for(const q of qs){if(seen.includes(q.id))return 'first repeat in game '+(g+1)+' after '+seen.length+' different';seen.push(q.id)}}return 'none'});console.log(first, 'of',await pg[0].evaluate(()=>DF.QS.length));
console.log('errors',errs.filter(e=>!/vibrate/.test(e)));await b.close()})();
