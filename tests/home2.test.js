const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const p=await H.player(b,errs,'home');
await p.goto(H.BASE);await H.wait(1500);await p.screenshot({path:process.env.S+'/h2-m.png',fullPage:true});
await p.setViewportSize({width:1280,height:900});await H.wait(400);await p.screenshot({path:process.env.S+'/h2-d.png'});
await p.setViewportSize({width:390,height:844});
await p.locator('.game').nth(1).click();await H.wait(350);await p.screenshot({path:process.env.S+'/h2-wipe.png'});await H.wait(900);console.log('card click →',p.url());
const h2=await H.player(b,errs,'host');await h2.goto(H.BASE+'mf/');await h2.click('[data-act=ocreate]');await h2.fill('#fName','x');await h2.click('[data-act=docreate]');await H.wait(800);
const code=(await h2.evaluate(()=>location.hash)).slice(1);
await p.goto(H.BASE);await p.fill('#code',code.toLowerCase());await p.click('#jgo');await H.wait(1200);console.log('join',code,'→',p.url());
const q=await H.player(b,errs,'old');await q.goto(H.BASE+'#ab123');await H.wait(800);console.log('old link →',q.url());
for(const w of [360,390]){await p.setViewportSize({width:w,height:800});await p.goto(H.BASE);await H.wait(500);const o=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);if(o>0)console.log('overflow',w,o)}
console.log('errors',errs);await b.close()})();
