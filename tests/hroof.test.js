// خلية الحروف: host (presenter) + two teams; pick a letter, 🔔, ✅/❌, a round won by joining the sides
const H=require('./h.js');const S=process.env.S;
(async()=>{const b=await H.launch(),errs=[];const ok=(c,m)=>console.log((c?'ok ':'FAIL ')+m);
const names=['المقدم','سعد','نورة','ريم'];const pg=[];for(const n of names)pg.push(await H.player(b,errs,n));const [h,a,c,d]=pg;
await h.goto(H.BASE+'hroof/');await H.wait(700);await h.screenshot({path:S+'/hr-home.png',fullPage:true});
await h.click('[data-act=ocreate]');await h.fill('#fName',names[0]);await h.click('[data-act=docreate]');await H.wait(800);const C=(await h.evaluate(()=>location.hash)).slice(1);
for(const [p,n,t] of [[a,names[1],1],[c,names[2],2],[d,names[3],1]]){await p.goto(H.BASE+'hroof/#'+C);await p.waitForSelector('#fName');await p.fill('#fName',n);await p.click('[data-act=dojoin]');await H.wait(500);await p.click(`[data-team="${t}"]`);await H.wait(300);}
const tv=await H.player(b,errs,'tv');await tv.setViewportSize({width:1280,height:720});await tv.goto(H.BASE+'tv/#'+C);
await H.wait(1200);await h.screenshot({path:S+'/hr-lobby.png',fullPage:true});
await h.click('[data-act=hstart]');await H.wait(1200);
const st=()=>H.dump().then(x=>JSON.parse(x.hr[C].state.j));
let s=await st();ok(s.phase==='pick'&&s.board.L.length===25&&new Set(s.board.L).size===25,'board of 25 different letters, turn '+s.turn);
await tv.screenshot({path:S+'/hr-tv-pick.png'});
// a player of the team whose turn it is taps a letter → the host picks a question for it
const turnP=s.turn===1?a:c, otherP=s.turn===1?c:a;
await otherP.locator('[data-cell]').count().then(n=>ok(n===0,'the other team cannot pick'));
await turnP.click('[data-cell="12"]');await H.wait(1500);
s=await st();ok(s.phase==='q'&&s.sel===12&&s.q&&s.q.l===s.board.L[12],'question for letter '+s.board.L[12]+': '+(s.q&&s.q.text));
const ans=await h.locator('.ans b').innerText();ok(ans.length>0,'presenter sees the answer: '+ans);
ok(await a.locator('.ans').count()===0&&!(await a.content()).includes(ans),'players do not see it');
await a.screenshot({path:S+'/hr-q.png',fullPage:true});await a.screenshot({path:S+'/hr-q-vp.png'});
// 🔔: نورة (team 2) first, then سعد
await c.click('[data-act=buzz]');await H.wait(150);await c.screenshot({path:S+'/hr-pressed.png'});await a.click('[data-act=buzz]').catch(()=>{});await H.wait(1200);
s=await st();ok(s.phase==='buzz'&&s.buzz&&s.buzz===(await c.evaluate(()=>HR.ME.pid)),'first buzz wins: '+s.buzz);
await h.screenshot({path:S+'/hr-buzz-host.png',fullPage:true});await h.screenshot({path:S+'/hr-host-vp.png'});await tv.screenshot({path:S+'/hr-tv-buzz.png'});
await h.click('[data-act=wrong]');await H.wait(1000);s=await st();ok(s.phase==='q'&&(s.locked||[]).includes(2),'wrong → team 2 locked');
ok(await c.locator('[data-act=buzz]').count()===0,'a locked team has no buzzer');
await a.click('[data-act=buzz]');await H.wait(1200);s=await st();ok(s.phase==='buzz','team 1 buzzes');
await h.click('[data-act=right]');await H.wait(1000);s=await st();ok(s.phase==='pick'&&s.board.own[12]===1&&s.turn===1,'right → cell 12 green, green picks next');
// green fills a column top→bottom (cells 2,7,12,17,22 join the edges with the odd-row shift) using the presenter's direct ✅
for(const i of [2,7,17,22]){ s=await st(); if(s.phase!=='pick')break; if(s.turn!==1){} await h.click(`[data-cell="${i}"]`);await H.wait(900);await h.click('[data-act=give][data-t="1"]');await H.wait(1000);}
s=await st();ok(s.phase==='won'&&s.win&&s.win.t===1&&s.wins[1]===1,'green joined top↔bottom and won the round: path '+JSON.stringify(s.win&&s.win.path));
await H.wait(800);await tv.screenshot({path:S+'/hr-tv-won.png'});await a.screenshot({path:S+'/hr-won.png',fullPage:true});
await h.click('[data-act=nextround]');await H.wait(1000);s=await st();ok(s.phase==='pick'&&s.round===2&&s.turn===2&&s.board.own.every(x=>!x),'round 2: new board, the losers pick first');
// the answers are not readable in questions.json
const raw=await (await fetch(H.BASE+'hroof/questions.json')).text();ok(!raw.includes('"a"')&&!raw.includes('بنزيما'),'answers hidden in questions.json');
const dec=await h.evaluate(()=>HR.QS.slice(0,3).map(q=>HR.answerOf(q)));ok(dec.every(Boolean)&&dec[0]==='الأخضر','answers open on the phone: '+dec.join(' / '));
console.log('errors',errs.filter(e=>!/vibrate|dialog/.test(e)));await b.close()})();
