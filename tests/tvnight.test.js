// شاشة العرض follows the group: a room that becomes a سهرة, then الدافور → جماد حيوان إنسان → سين جيم (its own screen) → back
const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const names=['فيصل','سعد'];const pg=[];for(const n of names)pg.push(await H.player(b,errs,n));const [h,p]=pg;
const ok=(c,m)=>console.log((c?'ok ':'FAIL ')+m);
await h.goto(H.BASE+'mf/');await h.click('[data-act=ocreate]');await h.fill('#fName',names[0]);await h.click('[data-act=docreate]');await H.wait(800);const C=(await h.evaluate(()=>location.hash)).slice(1);
await p.goto(H.BASE+'mf/#'+C);await p.waitForSelector('#fName');await p.fill('#fName',names[1]);await p.click('[data-act=dojoin]');
const tv=await H.player(b,errs,'tv');await tv.setViewportSize({width:1280,height:720});await tv.goto(H.BASE+'tv/#'+C);await H.wait(1500);
ok(/مين فينا/.test(await tv.innerText('#hdrChip')),'tv shows مين فينا');
const sw=async g=>{await h.click('.fn-nbar [data-a=switch]');await H.wait(300);await h.click('.fn-ng [data-g='+g+']');await H.wait(6000);};
await sw('dafour');
ok(/dafour/.test(h.url())&&/dafour/.test(p.url()),'phones moved to الدافور');
ok(await tv.locator('#dfshow').count()===1,'tv followed to الدافور: '+(await tv.innerText('#hdrChip')).replace(/\s+/g,' '));
await sw('jhi');
ok(/jhi/.test(h.url())&&/jhi/.test(p.url()),'phones moved to جماد حيوان إنسان: '+h.url().replace(H.BASE,''));
await H.wait(1500);ok(/جماد/.test(await tv.innerText('#hdrChip')),'tv followed to جماد حيوان إنسان');
const d=await H.dump();const jh=JSON.parse(d.jh[C].state.j);ok(jh.nt===2&&jh.host,'jhi room is step 2 of the night (nt '+jh.nt+')');
ok(Object.keys(d.jh[C].players||{}).length===2,'both players in the jhi room');
await tv.screenshot({path:process.env.S+'/tvn-jh.png'});
await sw('seenjeem');await H.wait(1000);
ok(/tv\//.test(tv.url()),'tv waits for the سين جيم room');
// the host's سين جيم room opens (as fnnight sees it: rooms/<code> with this step's nt)
await tv.evaluate(c=>firebase.database().ref('rooms/'+c).set({j:JSON.stringify({nt:3,at:Date.now()})}),C);await H.wait(3500);
ok(/seenjeem\/#/.test(tv.url()),'tv opened سين جيم\'s own screen: '+tv.url().replace(H.BASE,''));
// the night moves on: سين جيم's screen goes back to the TV, which follows
await tv.evaluate(c=>firebase.database().ref('night/'+c+'/state').get().then(s=>{const o=JSON.parse(s.val().j);o.seq=4;o.cur={g:'dafour',room:c,n:4,at:Date.now()};return firebase.database().ref('night/'+c+'/state').set({j:JSON.stringify(o)})}),C);
await H.wait(4000);ok(/tv\/#/.test(tv.url()),'سين جيم screen came back to the TV: '+tv.url().replace(H.BASE,''));
console.log('errors',errs.filter(e=>!/vibrate|dialog|Failed to load/.test(e)));await b.close()})();
