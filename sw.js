// Cerebro Óptimo · Service Worker
// Maneja cache básico + click en notificaciones (abrir/enfocar la app)
const CACHE='cog-v1';

self.addEventListener('install',e=>{self.skipWaiting();});

self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});

self.addEventListener('fetch',e=>{
  e.respondWith(fetch(e.request).catch(()=>new Response('',{status:503,statusText:'offline'})));
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
