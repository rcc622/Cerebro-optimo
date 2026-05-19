// Cerebro Óptimo · Service Worker
// App shell offline + runtime cache de infografías + click en notificaciones
const CACHE='cog-v2';
const SHELL=['./','./index.html'];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL).catch(()=>{})));
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  const isImg=req.destination==='image'||/\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname);

  if(isImg){
    // Cache-first para infografías/imágenes: una vez vistas online, quedan offline.
    e.respondWith((async()=>{
      const cached=await caches.match(req);
      if(cached)return cached;
      try{
        const res=await fetch(req);
        if(res&&res.ok){const c=await caches.open(CACHE);c.put(req,res.clone());}
        return res;
      }catch(_){
        return cached||new Response('',{status:503,statusText:'offline'});
      }
    })());
    return;
  }

  // Network-first para el resto (HTML/JS): siempre la versión más nueva,
  // y guarda el shell para funcionar sin conexión.
  e.respondWith((async()=>{
    try{
      const res=await fetch(req);
      const isShell=req.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('index.html');
      if(res&&res.ok&&isShell){const c=await caches.open(CACHE);c.put(req,res.clone());}
      return res;
    }catch(_){
      const cached=await caches.match(req)||await caches.match('./index.html')||await caches.match('./');
      return cached||new Response('',{status:503,statusText:'offline'});
    }
  })());
});

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const c of list){
        if('focus' in c)return c.focus();
      }
      if(self.clients.openWindow)return self.clients.openWindow(self.registration.scope);
    })
  );
});
