// Network-first app shell only. API, sockets, metrics and match data never enter a cache.
// Waiting workers activate on the next clean session, preserving the active client's protocol.
const CACHE = 'dogfight-shell-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('dogfight-shell-') && key !== CACHE).map((key) => caches.delete(key)))))
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !SHELL.includes(url.pathname)) return
  event.respondWith(fetch(event.request).catch(async () => {
    if (event.request.mode === 'navigate') return new Response('<!doctype html><meta name="viewport" content="width=device-width"><title>Dogfight offline</title><h1>Connection lost</h1><p>Dogfight needs a live server. Reconnect to the internet and reload to join a sector.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    return (await caches.match(event.request)) ?? Response.error()
  }))
})
