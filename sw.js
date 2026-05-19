// Cerebro Óptimo · Service Worker
// La app (HTML/JS) SIEMPRE se sirve fresca desde la red — nunca se cachea,
// para que nunca te quedes atrapado en una versión vieja.
// Sólo se cachean las imágenes (infografías) para que funcionen sin internet.
const CACHE='cog-v3';

self.addEventListener('install',e=>{ self.skipWaiting(); });

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    // Borra cualquier caché vieja (incl. shells cacheados por versiones anteriores del SW)
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
    // Sólo las imágenes son cache-first: una vez vistas online quedan offline.
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

  // Todo lo demás (HTML/JS): SIEMPRE red, sin caché. Si no hay red, 503
  // (mismo comportamiento que la versión original — no se cachea el shell).
  e.respondWith(fetch(req).catch(()=>new Response('',{status:503,statusText:'offline'})));
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
