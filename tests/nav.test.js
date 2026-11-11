const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const p=await H.player(b,errs,'n');
for(const u of ['seenjeem/','outside/','draw/']){await p.goto(H.BASE+u);await H.wait(700);await p.locator('.gamesbar').screenshot({path:process.env.S+'/nav-'+u.replace('/','')+'.png'});const o=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);console.log(u,'overflow',o)}
console.log('errors',errs);await b.close()})();
