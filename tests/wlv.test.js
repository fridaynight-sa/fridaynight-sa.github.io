// every changed level opens and can be finished by submitting its words
const H=require('./h.js');let f=0;const ok=(n,c,x)=>{console.log((c?'PASS ':'FAIL ')+n+(x!==undefined?' → '+JSON.stringify(x):''));if(!c)f++};
(async()=>{const b=await H.launch(),errs=[];const p=await H.player(b,errs,'p');
 for(const n of [4,15,150,173,303,373]){
  await p.goto(H.BASE+'mind/words/');await p.waitForSelector('[data-act=start]');await p.evaluate(n=>{WORDS.G.level=n;WORDS.G.cur=null},n);await p.click('[data-act=start]');await H.wait(500);
  const r=await p.evaluate(()=>{const S=WORDS.S,ws=S.L.words.map(w=>w.t);return {n:S.L.n,ws}});
  if(n===303)await p.screenshot({path:__dirname+'/../ws/w303.png'});
  for(const w of r.ws)await p.evaluate(w=>WORDS.submit(w),w);await H.wait(2500);
  const st=await p.evaluate(()=>({lv:WORDS.G.level,f:WORDS.G.cur&&WORDS.G.cur.f,end:!!document.querySelector('.end,.mean,.ov')}));ok('level '+n+' done: '+r.ws.join(' ')+' '+JSON.stringify(st),await p.evaluate(()=>WORDS.G.level)===n+1&&!r.ws.some(w=>/^ي/.test(w)&&['يلبس','يسأل'].includes(w)));
 }
 console.log('errors',errs);console.log(f?f+' FAILED':'ALL PASS');await b.close()})();
