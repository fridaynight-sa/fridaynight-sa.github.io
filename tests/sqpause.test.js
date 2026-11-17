// تذكّر المربعات: the last heart lost, paused while the right order shows, then «كمّل» → the result, not a broken game
const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const ok=(c,m)=>console.log((c?'ok ':'FAIL ')+m);const pg=await H.player(b,errs,'p');
await pg.goto(H.BASE+'mind/squares/');await pg.waitForSelector('[data-act=start]');await pg.click('[data-act=start]');await pg.waitForSelector('#sq');
await pg.waitForFunction(()=>SQUARES.S&&SQUARES.S.phase==='input',null,{timeout:15000});
await pg.evaluate(()=>{SQUARES.S.hearts=1});
const wrong=await pg.evaluate(()=>[0,1,2,3,4,5,6,7,8].find(x=>!SQUARES.S.seq.includes(x)));
const el=await pg.$(`[data-sq="${wrong}"]`);const bx=await el.boundingBox();await pg.mouse.move(bx.x+bx.width/2,bx.y+bx.height/2);await pg.mouse.down();await pg.mouse.up();
await H.wait(300);await pg.click('[data-act=pause]');await H.wait(300);await pg.click('[data-act=resume]');
await pg.waitForSelector('.big .v',{timeout:15000}).then(()=>ok(true,'resume after the last heart shows the result'),()=>ok(false,'no result after resume'));
console.log('errors',errs);await b.close()})();
