// homepage Mind Games banner + games bar link on every page
const H=require('./h.js');
(async()=>{const b=await H.launch();const errs=[];const pg=await H.player(b,errs,'p');
await pg.goto(H.BASE);await pg.waitForSelector('.tv.mind');
await (await pg.$('.tv.mind')).scrollIntoViewIfNeeded();await pg.screenshot({path:__dirname+'/mn-home.png'});
await pg.click('.tv.mind');await pg.waitForURL(/\/mind\/$/,{timeout:4000});console.log('home → ',pg.url());
for(const p of ['seenjeem/','outside/','sedq/','mf/','draw/','dafour/','tv/','mind/','mind/lamha/']){
  await pg.goto('about:blank');await pg.goto(H.BASE+p);await pg.waitForSelector('.gamesbar');
  const r=await pg.evaluate(()=>{const a=[...document.querySelectorAll('.gamesbar a')].find(x=>/Mind Games/.test(x.textContent));if(!a)return null;const im=a.querySelector('img');return{href:a.href,img:im&&im.complete&&im.naturalWidth>0,order:[...document.querySelectorAll('.gamesbar a')].map(x=>x.textContent.trim()).join(' | '),sw:document.documentElement.scrollWidth,iw:innerWidth}});
  const st=r?(await fetch(r.href)).status:0;
  console.log(p,r&&r.href.replace(H.BASE,'/'),st,'img',r&&r.img,r&&r.sw<=r.iw?'':'OVERFLOW');
  if(p==='dafour/')console.log('  order:',r.order);
}
await pg.setViewportSize({width:1280,height:800});await pg.goto(H.BASE+'draw/');await pg.waitForSelector('.gamesbar');await (await pg.$('.gamesbar')).screenshot({path:__dirname+'/mn-bar-wide.png'});
await pg.goto(H.BASE);await (await pg.$('.tv.mind')).scrollIntoViewIfNeeded();await pg.screenshot({path:__dirname+'/mn-home-wide.png'});
console.log('ERRS',errs.length?errs:'none');await b.close()})().catch(e=>{console.error('FAIL',e);process.exit(1)});
