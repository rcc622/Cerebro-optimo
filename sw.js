// Cerebro Óptimo · Service Worker
// Shell (HTML/JS): stale-while-revalidate — se sirve al instante desde caché
// (la app funciona offline) y se actualiza en segundo plano en cada visita,
// así nunca te quedas atrapado en una versión vieja más de una recarga.
// Imágenes (infografías): cache-first para que funcionen sin internet.
const CACHE='cog-v4';
const SHELL=['./','./index.html','./manifest.json'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});

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
    // Imágenes cache-first: una vez vistas online quedan offline.
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

  // Shell (HTML/JS/manifest): stale-while-revalidate.
  e.respondWith((async()=>{
    const cached=await caches.match(req);
    const network=fetch(req).then(async res=>{
      if(res&&res.ok){const c=await caches.open(CACHE);c.put(req,res.clone());}
      return res;
    }).catch(()=>null);
    if(cached){
      e.waitUntil(network); // actualiza en segundo plano
      return cached;
    }
    const res=await network;
    return res||new Response('',{status:503,statusText:'offline'});
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
