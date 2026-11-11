// static server for the repo + a tiny fake Firebase RTDB over SSE
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=process.argv[2],PORT=+process.argv[3]||8770;let tree={};const subs=new Set();const streams=new Map();
const parts=p=>p.split('/').filter(Boolean);
const getAt=p=>parts(p).reduce((o,k)=>o&&typeof o==='object'?o[k]:undefined,tree);
function setAt(p,v){const ks=parts(p);if(!ks.length){tree=v||{};return}let o=tree;for(const k of ks.slice(0,-1)){if(typeof o[k]!=='object'||!o[k])o[k]={};o=o[k]}if(v===null||v===undefined)delete o[ks.at(-1)];else o[ks.at(-1)]=v}
function clean(v){if(v&&typeof v==='object'){for(const k of Object.keys(v)){v[k]=clean(v[k]);if(v[k]===undefined)delete v[k]}return Object.keys(v).length?v:undefined}return v===null?undefined:v}
const rel=(a,b)=>{const A=parts(a),B=parts(b);const n=Math.min(A.length,B.length);for(let i=0;i<n;i++)if(A[i]!==B[i])return false;return true};
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.ico':'image/x-icon','.css':'text/css','.webmanifest':'application/json','.svg':'image/svg+xml','.mp4':'video/mp4'};

// --- Firebase rules check (database.rules.json from the repo): a write the real rules would refuse gets 403
const RULES=JSON.parse(fs.readFileSync(path.join(ROOT,'database.rules.json'),'utf8')).rules;
function allowed(p,v,auth){const ks=parts(p);let node=RULES,vars={},write=false;const chain=[];const old=getAt(p);
 for(let i=0;i<ks.length;i++){const k=ks[i];let nx=node[k];if(nx===undefined){const dv=Object.keys(node).find(x=>x.startsWith('$'));if(dv){vars=Object.assign({},vars,{[dv]:k});nx=node[dv]}}
  if(nx===undefined)return write;node=nx;chain.push({node,path:ks.slice(0,i+1),vars});
  if(node['.write']===true)write=true;else if(typeof node['.write']==='string'&&evalRule(node['.write'],vars,v,old,auth))write=true}
 if(!write)return false;if(v==null)return true;
 // the tree as it would be after this write: parents are checked with their new value
 const T=JSON.parse(JSON.stringify(tree||{}));(function(){let o=T;for(const k of ks.slice(0,-1)){if(typeof o[k]!=='object'||!o[k])o[k]={};o=o[k]}o[ks.at(-1)]=v})();
 const at=(ps)=>ps.reduce((o,k)=>o&&typeof o==='object'?o[k]:undefined,T);
 for(const c of chain){const r=c.node['.validate'];if(r===undefined)continue;if(!evalRule(r,c.vars,at(c.path),getAt(c.path.join('/')),auth)){console.log('INVALID',c.path.join('/'));return false}}
 // and everything inside the written value
 function walk(rn,val,vs){if(!val||typeof val!=='object'||!rn||typeof rn!=='object')return true;
  for(const k of Object.keys(val)){let cn=rn[k],nv=vs;if(cn===undefined){const dv=Object.keys(rn).find(x=>x.startsWith('$'));if(dv){cn=rn[dv];nv=Object.assign({},vs,{[dv]:k})}}
   if(cn===undefined)continue;const r=cn['.validate'];if(r!==undefined&&!evalRule(r,nv,val[k],undefined,auth)){console.log('INVALID child',k);return false}if(!walk(cn,val[k],nv))return false}return true}
 return walk(node,v,vars)}
function evalRule(ex,vars,v,cur,auth){if(ex===true||ex===false)return ex;let js=ex.replace(/\$(\w+)\.matches\((\/(?:\\.|[^\/])*\/)\)/g,(m,n,re)=>re+'.test('+JSON.stringify(vars['$'+n])+')')
 .replace(/!newData\.exists\(\)/g,'(v==null)').replace(/newData\.exists\(\)/g,'(v!=null)').replace(/!data\.exists\(\)/g,'(cur==null)').replace(/data\.exists\(\)/g,'(cur!=null)')
 .replace(/newData\.child\('(\w+)'\)\.isString\(\)/g,"(v!=null&&typeof v['$1']==='string')").replace(/newData\.child\('(\w+)'\)\.val\(\)/g,"(v&&v['$1'])")
 .replace(/newData\.isString\(\)/g,"(typeof v==='string')").replace(/newData\.val\(\)/g,'v').replace(/\.matches\(/g,'.match(')
 .replace(/\$(\w+)/g,(m,n)=>JSON.stringify(vars['$'+n]));
 try{return !!Function('v','cur','auth','return ('+js+')')(v,cur,auth||null)}catch(e){console.log('rule eval fail',ex,js,e.message);return false}}
http.createServer((q,r)=>{const u=new URL(q.url,'http://x');
 if(u.pathname==='/__fb/stream'){const id=u.searchParams.get('id');r.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});r.write(':ok\n\n');streams.set(id,r);q.on('close',()=>{streams.delete(id);for(const s of [...subs])if(s.id===id)subs.delete(s)});return}
 if(u.pathname==='/__fb/watch'){let b='';q.on('data',d=>b+=d);q.on('end',()=>{const {id,sid,p,off}=JSON.parse(b);if(off){for(const s of [...subs])if(s.id===id&&s.sid===sid)subs.delete(s);r.end('ok');return}const st=streams.get(id);const s={id,sid,p,r:{write:x=>{const t=streams.get(id);t&&t.write(x)}},mux:true};subs.add(s);s.r.write('data: '+JSON.stringify({sid,v:getAt(p)??null})+'\n\n');r.end('ok')});return}
 if(u.pathname==='/__fb/sub'){const p=u.searchParams.get('p');r.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});const s={p,r};subs.add(s);r.write('data: '+JSON.stringify(getAt(p)??null)+'\n\n');q.on('close',()=>subs.delete(s));return}
 if(u.pathname==='/__fb/get'){r.writeHead(200,{'Content-Type':'application/json'});r.end(JSON.stringify(getAt(u.searchParams.get('p'))??null));return}
 if(u.pathname==='/__fb/set'){let b='';q.on('data',d=>b+=d);q.on('end',()=>{const {p,v,auth}=JSON.parse(b);const T=Date.now();const fix=x=>{if(x&&typeof x==='object'){if(x['.sv']==='timestamp')return T;for(const k in x)x[k]=fix(x[k])}return x};const nv=clean(fix(v));if(!allowed(p,nv,auth)){console.log('DENIED',p);r.statusCode=403;r.end('denied');return}setAt(p,nv);tree=tree||{};for(const s of subs)if(rel(s.p,p))s.r.write('data: '+JSON.stringify(s.mux?{sid:s.sid,v:getAt(s.p)??null}:getAt(s.p)??null)+'\n\n');r.end('ok')});return}
 if(u.pathname==='/__fb/dump'){r.end(JSON.stringify(tree));return}
 let f=path.join(ROOT,decodeURIComponent(u.pathname));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
 if(!fs.existsSync(f)){r.writeHead(404);r.end();return}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)}).listen(PORT);
