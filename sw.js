const CACHE_NAME = 'bible-typing-v2';
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

// 설치 시 파일 캐싱 (새 버전을 곧바로 적용하기 위해 대기 없이 즉시 활성화)
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 활성화 시 이전 버전 캐시 정리 + 열려있는 탭도 곧바로 새 서비스워커가 제어하도록 함
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
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
