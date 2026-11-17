// minimal firebase compat (app + database) backed by /__fb on the test server
(function(){const B=location.origin+'/__fb/';const SID=Math.random().toString(36).slice(2);const CB=new Map();let N=0;
 const ES=new EventSource(B+'stream?id='+SID);const ready=new Promise(r=>ES.onopen=r);ES.onmessage=e=>{const m=JSON.parse(e.data);const f=CB.get(m.sid);f&&f(m.v)};
 const watch=(p,f)=>{const sid=++N;CB.set(sid,f);ready.then(()=>fetch(B+'watch',{method:'POST',body:JSON.stringify({id:SID,sid,p})}));return sid};
 const unwatch=sid=>{CB.delete(sid);fetch(B+'watch',{method:'POST',body:JSON.stringify({id:SID,sid,off:1})})};
 const norm=p=>String(p||'').split('/').filter(Boolean).join('/');
 const snap=(v)=>({val:()=>v===undefined?null:v,exists:()=>v!==null&&v!==undefined});
 const post=(p,v)=>fetch(B+'set',{method:'POST',body:JSON.stringify({p,v:v===undefined?null:v,auth:self.__mockAuth||null})}).then(r=>{if(r.status===403)throw Object.assign(new Error('PERMISSION_DENIED: Permission denied'),{code:'PERMISSION_DENIED'})});
 const disc=[];addEventListener('pagehide',()=>disc.forEach(p=>navigator.sendBeacon(B+'set',JSON.stringify({p,v:null}))));
 // a Reference class like the real SDK's (fnauth.js wraps its prototype)
 function Reference(){}
 Reference.prototype.set=function(v){return post(this.__p,JSON.parse(JSON.stringify(v??null)))};
 Reference.prototype.remove=function(){return post(this.__p,null)};
 Reference.prototype.update=function(o){const p=this.__p;return Promise.all(Object.entries(o).map(([k,v])=>post(p+'/'+k,v)))};
 Reference.prototype.toString=function(){return location.origin+'/'+this.__p};
 function ref(path){path=norm(path);const hs=new Map();
  return Object.assign(Object.create(Reference.prototype),{__p:path,key:path.split('/').pop(),child:c=>ref(path+'/'+c),
   get:()=>path==='.info/connected'?Promise.resolve(snap(true)):fetch(B+'get?p='+encodeURIComponent(path)).then(r=>r.json()).then(snap),
   on(ev,cb){if(path==='.info/connected'){setTimeout(()=>cb(snap(true)),0);return cb}const sid=watch(path,v=>cb(snap(v)));hs.set(cb,sid);return cb},
   off(ev,cb){if(cb&&hs.has(cb)){unwatch(hs.get(cb));hs.delete(cb)}else{hs.forEach(unwatch);hs.clear()}},
   onDisconnect:()=>({remove(){disc.push(path);return Promise.resolve()},cancel(){const i=disc.indexOf(path);if(i>=0)disc.splice(i,1);return Promise.resolve()}})})}
 const db={ref};const database=()=>db;database.ServerValue={TIMESTAMP:{'.sv':'timestamp'}};database.Reference=Reference;
 // anonymous sign-in: one uid per page (kept for the tab, like the real SDK keeps it on the device)
 const AK='__mock_uid';let user=null;const ls=[];
 const auth=()=>({get currentUser(){return user},onAuthStateChanged(cb){ls.push(cb);setTimeout(()=>cb(user),0);return()=>{}},
  signInAnonymously(){let u=null;try{u=sessionStorage.getItem(AK)}catch(e){}if(!u){u='anon'+Math.random().toString(36).slice(2,12);try{sessionStorage.setItem(AK,u)}catch(e){}}
   user={uid:u,isAnonymous:true};self.__mockAuth=self.__mockAuth&&self.__mockAuth.uid&&!self.__mockAuth.anon?self.__mockAuth:{uid:u,anon:1};ls.forEach(f=>f(user));return Promise.resolve({user})}});
 const apps=[];
 self.firebase=Object.assign(self.firebase||{},{initializeApp:()=>{const a={};apps.push(a);return a},database,auth:self.firebase&&self.firebase.auth||auth,apps});})();
