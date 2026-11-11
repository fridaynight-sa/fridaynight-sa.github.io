const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const names=['فيصل','سعد','نورة'];const pgs=[];for(const n of names)pgs.push(await H.player(b,errs,n));const [h,...ps]=pgs;
await h.goto(H.BASE+'draw/');await h.click('[data-act=ocreate]');await h.fill('#fName',names[0]);await h.click('[data-act=docreate]');await H.wait(800);const code=(await h.evaluate(()=>location.hash)).slice(1);
for(let i=0;i<ps.length;i++){await ps[i].goto(H.BASE+'draw/#'+code);await ps[i].waitForSelector('#fName');await ps[i].fill('#fName',names[i+1]);await ps[i].click('[data-act=dojoin]');}
const tv=await H.player(b,errs,'tv');await tv.setViewportSize({width:1280,height:720});await tv.goto(H.BASE+'tv/#'+code);
await H.wait(1000);await h.click('[data-act=hstart]');await H.wait(1500);
const drawers=[];
for(let t=0;t<3;t++){
 let d=null;for(let k=0;k<20&&!d;k++){for(const p of pgs)if(await p.locator('[data-word]').count())d=p;if(!d)await H.wait(300)}
 drawers.push(names[pgs.indexOf(d)]);await d.locator('[data-word]').first().click();await H.wait(1300);
 const bx=await d.locator('#cv').boundingBox();const cx=bx.x+bx.width/2,cy=bx.y+bx.height/2,R=bx.width/(5+t);
 await d.mouse.move(cx+R,cy);await d.mouse.down();for(let a=0;a<=40;a++)await d.mouse.move(cx+R*Math.cos(a/40*6.283),cy+R*Math.sin(a/40*6.283));await d.mouse.up();
 await d.click(['[data-color="#e03131"]','[data-color="#12a874"]','[data-color="#1c7ed6"]'][t]);await d.click('[data-act=fill]');await d.mouse.click(cx,cy);await H.wait(600);
 await h.click('[data-act=hreveal]');await H.wait(1500);await h.click('[data-act=hnext]');await H.wait(1500);}
let st=JSON.parse((await H.dump()).draw[code].state.j);console.log('drawers',drawers,'phase',st.phase,'gal',st.gal.length,JSON.stringify(st.gal.map(g=>g.w+'/'+(st.names[g.d]))));
const dump=await H.dump();console.log('media saved',st.gal.map(g=>dump.media&&dump.media[g.m]?Math.round(dump.media[g.m].d.length/1024)+'KB':'MISSING').join(','));
await H.wait(1500);await ps[0].screenshot({path:'drgal-vote.png'});await tv.screenshot({path:'drgal-tv.png'});
// everyone votes: best = first drawing not theirs, worst = another one
for(const p of pgs){const me=names[pgs.indexOf(p)];const gal=st.gal;const others=gal.map((g,i)=>st.names[g.d]!==me?i:-1).filter(i=>i>=0);
 // own drawing check
 const ownI=gal.findIndex(g=>st.names[g.d]===me);await p.click(`[data-gal="${ownI}"]`);await H.wait(200);const ownMsg=await p.locator('[data-vote]').count();
 await p.click(`[data-gal="${others[0]}"]`);await p.click('[data-vote=b]');await H.wait(400);await p.click(`[data-gal="${others[1]}"]`);await p.click('[data-vote=w]');await H.wait(400);
 console.log(me,'vote buttons on own drawing:',ownMsg,'| best',gal[others[0]].w,'worst',gal[others[1]].w);}
await H.wait(2500);st=JSON.parse((await H.dump()).draw[code].state.j);console.log('phase',st.phase,'award',JSON.stringify(st.award),'scores',JSON.stringify(Object.fromEntries(Object.entries(st.scores).map(([k,v])=>[st.names[k],v]))));
await H.wait(1500);await ps[1].screenshot({path:'drgal-award.png'});await tv.screenshot({path:'drgal-tv-award.png'});
await h.evaluate(()=>document.querySelector('[data-act=hend]').click());await H.wait(1200);console.log('after hend:',JSON.parse((await H.dump()).draw[code].state.j).phase);
// new game clears media
const ids=st.gal.map(g=>g.m);await h.evaluate(()=>document.querySelector('[data-act=hlobby]').click());await H.wait(800);await h.evaluate(()=>document.querySelector('[data-act=hstart]').click());await H.wait(1500);
const d2=await H.dump();console.log('old media left after new game:',ids.filter(i=>d2.media&&d2.media[i]).length);
console.log('errors',errs);await b.close()})();
