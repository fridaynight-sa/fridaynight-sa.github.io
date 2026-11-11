// plays لوحة الكلمات like a person: swipes the letters with a finger
const H=require('./h.js');
(async()=>{const b=await H.launch();const errs=[];const p=await H.player(b,errs,'P');
await p.goto(H.BASE+'mind/words/');await H.wait(500);
await p.screenshot({path:__dirname+'/wt-intro.png'});
await p.click('[data-act=start]');await H.wait(500);
// swipe a word through the wheel letters
async function swipe(word){
  const pts=await p.evaluate(w=>{const W=self.WORDS,S=W.S,g=W.geo,r=document.getElementById('wheel').getBoundingClientRect();const used=new Set();
    return [...w].map(ch=>{const i=S.L.letters.findIndex((c,k)=>c===ch&&!used.has(k));used.add(i);const [x,y]=g.c[S.pos[i]];return [r.left+x,r.top+y]})},word);
  await p.mouse.move(pts[0][0],pts[0][1]);await p.mouse.down();
  for(let i=1;i<pts.length;i++){const [a,b]=pts[i-1],[c,d]=pts[i];for(let k=1;k<=6;k++)await p.mouse.move(a+(c-a)*k/6,b+(d-b)*k/6);}
  await p.mouse.up();await H.wait(150);
}
for(let lv=0;lv<3;lv++){
  const words=await p.evaluate(()=>WORDS.S.L.words.map(w=>w.t));
  console.log('level',await p.evaluate(()=>WORDS.S.L.n),words.join(' '));
  for(const w of words){await swipe(w);}
  await H.wait(1500);
  console.log('view after:',await p.evaluate(()=>document.querySelector('.end')?'end':'other'),'stars',await p.evaluate(()=>WORDS.G.stars));
  if(lv===0)await p.screenshot({path:__dirname+'/wt-end.png',fullPage:true});
  await p.click('[data-act=start]');await H.wait(400);
}
await p.screenshot({path:__dirname+'/wt-play.png'});
console.log('errors',errs);
await b.close()})();
