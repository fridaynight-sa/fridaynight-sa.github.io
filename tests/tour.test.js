const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];
for(const [w,h,tag] of [[390,844,'m'],[1280,800,'w']]){const p=await H.player(b,errs,tag);await p.setViewportSize({width:w,height:h});p.removeAllListeners('dialog');p.on('dialog',d=>d.accept());
 await p.goto(H.BASE+'case/');await H.wait(1000);await p.screenshot({path:`t-${tag}-1file.png`,fullPage:true});
 await p.click('[data-act=letter]');await H.wait(300);await p.screenshot({path:`t-${tag}-2letter.png`});
 await p.click('[data-ev=A1]');await H.wait(400);await p.screenshot({path:`t-${tag}-3ev.png`});
 // can the page behind scroll while the sheet is open?
 const y0=await p.evaluate(()=>scrollY);await p.mouse.wheel(0,600);await H.wait(300);console.log(tag,'page scrolls behind sheet:',(await p.evaluate(()=>scrollY))!==y0);
 await p.click('[data-act=closeev]');await p.click('[data-act=mission]');await H.wait(300);
 await p.click('[data-act=submit]');await H.wait(300);await p.screenshot({path:`t-${tag}-4err.png`});
 const errVisible=await p.evaluate(()=>{const r=document.getElementById('err').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight});console.log(tag,'error message visible on screen:',errVisible);
 await p.click('[data-part="0"][data-o="1"]');await p.click('[data-chip=A3]');await p.click('[data-chip=A4]');await p.click('[data-act=submit]');await H.wait(800);await p.screenshot({path:`t-${tag}-5ok.png`,fullPage:true});
 await p.click('[data-act=file]');await H.wait(900);await p.screenshot({path:`t-${tag}-6env.png`});
 await p.context().close();}
console.log('errors',errs);await b.close()})();
