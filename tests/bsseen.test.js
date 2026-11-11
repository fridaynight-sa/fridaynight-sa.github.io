const H=require('./h.js');
(async()=>{const b=await H.launch(),errs=[];const p=await H.player(b,errs,'p');await p.goto(H.BASE+'outside/');await H.wait(1200);
console.log(await p.evaluate(()=>{const spy=BS.CATS.find(c=>/الجاسوس/.test(c.name));const seen=[];
 for(let r=0;r<200;r++){const used={};const R=BS.makeRound(['a','b','c','d'],spy.id,1,used,null,false,BS.seenWeights([seen]));const k=spy.id+':'+R.word;if(seen.includes(k))return 'first repeat as the real word: round '+(r+1)+' after '+seen.length+' different of '+spy.words.length;seen.push(k)}return 'none'}));
console.log('errors',errs);await b.close()})();
