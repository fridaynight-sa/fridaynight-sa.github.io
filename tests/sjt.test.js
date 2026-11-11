const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];
const host=await H.player(b,errs,'host');await host.setViewportSize({width:1280,height:800});
await host.goto(H.BASE+'seenjeem/');await H.wait(800);await host.click('[data-mode=online]');await host.click('#start');await H.wait(1500);
const code=await host.evaluate(()=>S.room.code);console.log('room',code);
const join=async(name,team)=>{const p=await H.player(b,errs,name);await p.goto(H.BASE+'seenjeem/');await H.wait(400);await p.click('#tabJoin');await p.fill('#jCode',code);await p.fill('#jName',name);await p.click('#jGo');await H.wait(1200);await p.click(`[data-team="${team}"]`);await H.wait(600);return p};
const L=await join('فيصل',1), a1=await join('سعد',0), a2=await join('نورة',0);
const txt=async p=>(await p.innerText('#rLive')).replace(/\s+/g,' ');
const score=()=>host.evaluate(()=>S.teams.map(t=>t.name+':'+t.score).join(' ')+' turn='+S.turn);
await host.click('#lStart');await H.wait(1200);
console.log('buzzer anywhere?', (await txt(a1)).includes('الجرس')||(await txt(L)).includes('الجرس'));
console.log('turn team cells:',await a1.locator('[data-rk]').count(),'| leader cells (should be 0):',await L.locator('[data-lk],[data-rk]').count());
await a1.locator('[data-rk]').first().click();await H.wait(1500);
console.log('turn player reveal btn:',await a1.locator('[data-lc=reveal]').count(),'| teammate:',await a2.locator('[data-lc=reveal]').count(),'| leader (other team):',await L.locator('[data-lc=reveal]').count());
console.log('leader sees:',(await txt(L)).match(/الدور على [^ ]+ 🎯/)?.[0]);
// leader forges a reveal for the other team's question -> must be ignored
await L.evaluate(()=>rCmd({a:'reveal',qk:R.state.q.id}));await H.wait(1200);
console.log('forged reveal by other team ignored:',await host.evaluate(()=>!!Q&&!Q.revealed));
await a2.click('[data-lc=reveal]');await H.wait(1200);
console.log('after reveal, turn player buttons:',(await a1.locator('.award button').allInnerTexts()).join(' / '));
// other team tries to award themselves
await L.evaluate(()=>rCmd({a:'award',qk:R.state.q.id,i:1}));await H.wait(1000);console.log('forged award ignored:',await score());
await a1.locator('.award button').first().click();await H.wait(1500);console.log('after ✓:',await score());
// now turn = team 1 (leader's team)
console.log('leader now has cells:',await L.locator('[data-rk]').count(),'| team0 cells:',await a1.locator('[data-rk]').count());
await L.locator('[data-rk]').first().click();await H.wait(1500);await L.click('[data-lc=reveal]');await H.wait(1200);
await L.locator('.award button.none').click();await H.wait(1500);console.log('after ✗:',await score());
// fallback: team 1 left the room -> leader... leader IS team1. Make team-0 players leave, turn back to 0 -> leader should get control
await a1.close();await a2.close();await H.wait(2500);
console.log('turn team gone -> phone cells (should be 0):',await L.locator('[data-lk]').count(),'host can open:',await host.locator('.board .cell:not([disabled])').count()>0);
await L.screenshot({path:process.env.S+'/sj-leader.png'});
console.log('errors',errs);await b.close()})();
