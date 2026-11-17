// security: only a room's host writes its state; only a player (or the host) writes that player's entry
const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const ok=(c,m)=>console.log((c?'ok ':'FAIL ')+m);
const [h,p,x]=[await H.player(b,errs,'host'),await H.player(b,errs,'p'),await H.player(b,errs,'x')];
await h.goto(H.BASE+'dafour/');await h.click('[data-act=ocreate]');await h.fill('#fName','المضيف');await h.click('[data-act=docreate]');await H.wait(1200);const C=(await h.evaluate(()=>location.hash)).slice(1);
await p.goto(H.BASE+'dafour/#'+C);await p.waitForSelector('#fName');await p.fill('#fName','لاعب');await p.click('[data-act=dojoin]');await H.wait(1200);
const d=await H.dump();const st=d.df[C].state;ok(st.u&&typeof st.t==='number','room state carries its owner and time');
const pid=await p.evaluate(()=>JSON.parse(localStorage.getItem('df-me-v1')).pid), hid=await h.evaluate(()=>JSON.parse(localStorage.getItem('df-me-v1')).pid);
ok(d.df[C].players[pid].u&&d.df[C].players[pid].u!==st.u,'player entry carries the player');
await x.goto(H.BASE+'dafour/');await H.wait(1500);
const tryW=(pg,path,val)=>pg.evaluate(([path,val])=>firebase.database().ref(path).set(val).then(()=>'ok',e=>'denied'),[path,val]);
ok(await tryW(x,'df/'+C+'/state',{j:'{"phase":"end"}'})==='denied','a stranger cannot change the room');
ok(await tryW(p,'df/'+C+'/state',{j:'{"phase":"end"}'})==='denied','a player cannot change the room');
ok(await tryW(x,'df/'+C+'/players/'+hid,{j:'{"name":"هكر"}'})==='denied','a stranger cannot rename the host');
ok(await x.evaluate(p=>firebase.database().ref(p).remove().then(()=>'ok',()=>'denied'),'df/'+C+'/state')==='denied','a stranger cannot delete the room');
ok(await tryW(p,'df/'+C+'/players/'+pid,{j:'{"name":"لاعب ٢","at":1}'})==='ok','a player writes their own entry');
ok(await h.evaluate(p=>firebase.database().ref(p).remove().then(()=>'ok',()=>'denied'),'df/'+C+'/players/'+pid)==='ok','the host can remove a player');
ok(await tryW(x,'df/NEWR/state',{j:'{"phase":"lobby"}'})==='ok','anyone can open a new room');
console.log('errors',errs.filter(e=>!/vibrate|dialog|PERMISSION/.test(e)));await b.close()})();
