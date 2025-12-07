// -----------------------------------------------------
// IGL SHIP PWA Service Worker
// 強制更新（skipWaiting / clients.claim）対応版
// -----------------------------------------------------

const CACHE_VERSION = "igl-cache-v3";  // ← 更新時は数字を上げると確実
const CACHE_FILES = [
  "/",
  "/index.html",
  "/favicon.ico",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/assets/app.js",
  "/assets/style.css"
];

// ----------------------
// install: キャッシュ登録
// ----------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CACHE_FILES))
  );

  // ★ これが重要：古いSWを待たずに即時更新へ
  self.skipWaiting();
});

// ----------------------
// activate: 古いキャッシュ削除
// ----------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );

  // ★ これも重要：すべてのクライアントへ即時適用
  return self.clients.claim();
});

// ----------------------
// fetch: キャッシュ → ネットワーク
// ----------------------
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((res) => {
      return (
        res ||
        fetch(event.request).catch(() => {
          // オフライン時のフォールバックが必要なら追加
        })
      );
    })
  );
});
