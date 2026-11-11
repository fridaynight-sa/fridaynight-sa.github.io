const H=require('./h.js');const S=process.env.S;
(async()=>{const b=await H.launch(),errs=[];const names=['فيصل','سعد','نورة'];const pg=[];for(const n of names)pg.push(await H.player(b,errs,n));const [h,...ps]=pg;
await h.goto(H.BASE+'dafour/');await H.wait(800);await h.screenshot({path:S+'/df-home.png',fullPage:true});
await h.click('[data-act=ocreate]');await h.fill('#fName',names[0]);await h.click('[data-act=docreate]');await H.wait(800);const C=(await h.evaluate(()=>location.hash)).slice(1);
for(let i=0;i<ps.length;i++){await ps[i].goto(H.BASE+'dafour/#'+C);await ps[i].waitForSelector('#fName');await ps[i].fill('#fName',names[i+1]);await ps[i].click('[data-act=dojoin]');}
const tv=await H.player(b,errs,'tv');await tv.setViewportSize({width:1280,height:720});await tv.goto(H.BASE+'tv/#'+C);
await H.wait(1500);await h.click('[data-act=hstart]');await H.wait(1500);
const d=await H.dump();const st=JSON.parse(d.df[C].state.j);
console.log('state has the answer before reveal?',JSON.stringify(st).includes('correct'),'| hidden readable?',/الجواب|answer|correct/.test(d.df[C].hidden.j));
console.log('Q1:',st.q.text,'|',st.q.opts.join(' / '),'| diff',st.q.diff);
const cls=await ps[0].$$eval('.opts4 button',bs=>bs.map(x=>x.className+'|'+getComputedStyle(x).backgroundColor+'|'+x.offsetHeight).join(' ; '));console.log('option looks (must be identical):',cls);
await ps[0].screenshot({path:S+'/df-q.png'});
const diffs=[];
for(let r=0;r<10;r++){
 const s2=JSON.parse((await H.dump()).df[C].state.j);diffs.push(s2.q.diff);
 // فيصل always picks option 0 fast, سعد picks 1, نورة picks 2 after a pause
 await pg[0].click('.opts4 button[data-opt="0"]');await pg[1].click('.opts4 button[data-opt="1"]');await H.wait(700);await pg[2].click('.opts4 button[data-opt="2"]');
 await H.wait(1500);if(r===0){await ps[0].screenshot({path:S+'/df-reveal.png'});await tv.screenshot({path:S+'/df-tv.png'});const r0=JSON.parse((await H.dump()).df[C].state.j).reveal;console.log('reveal:',JSON.stringify(r0).slice(0,200));}
 await h.click('[data-act=hnext]');await H.wait(600);}
console.log('difficulty order:',diffs.join(','));
const end=JSON.parse((await H.dump()).df[C].state.j);console.log('end phase',end.phase,'scores',JSON.stringify(Object.fromEntries(Object.entries(end.scores).map(([k,v])=>[end.names[k],v]))),'right',JSON.stringify(end.rightCount));
await ps[1].screenshot({path:S+'/df-end.png',fullPage:true});
// correct-answer position changes between deals
const pos=await h.evaluate(()=>{const q=DF.QS[5];const c={};for(let i=0;i<4000;i++){const d=DF.deal(q);c[d.correct]=(c[d.correct]||0)+1}return c});console.log('right-answer position over 4000 deals:',JSON.stringify(pos));
console.log('errors',errs.filter(e=>!/vibrate|dialog/.test(e)));await b.close()})();
