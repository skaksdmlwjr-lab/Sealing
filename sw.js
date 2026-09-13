const CACHE_NAME = 'bible-typing-v1';
// 오프라인에서 사용할 파일 목록
const ASSETS = [
  './index.html',
  './css/style.css',
  './css/tailwind.min.css',
  './js/app.js',
  './js/Bible.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
  // 성경 데이터 JSON 파일이 따로 있다면 여기에 추가
];

// 설치 시 파일 캐싱
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 오프라인 시 캐시된 파일 응답
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
