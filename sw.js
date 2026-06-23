// PLOX service worker — 网络优先,离线回退(保证更新能及时推送给玩家)
const CACHE = "plox-v3";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // 跨域(如排行榜 API)不经过 SW,交给浏览器
  // 网络优先:在线拿最新;只缓存自家成功响应;离线兜底
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(
          (hit) => hit || (e.request.mode === "navigate" ? caches.match("./index.html") : Response.error())
        )
      )
  );
});
