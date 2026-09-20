const CACHE_NAME = 'bible-typing-v3';
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

// TTS 모델(fp32, 100MB+)은 GitHub 파일 크기 제한 때문에 저장소에 못 담아서
// GitHub Releases에 올려두고, 이 경로로 요청이 오면 여기서 대신 받아옴(앱 코드는 평소처럼 로컬 경로로 요청하면 됨)
const MODEL_ONNX_SUFFIX = 'js/tts/models/Xenova/mms-tts-kor/onnx/model.onnx';
const MODEL_ONNX_RELEASE_URL = 'https://github.com/skaksdmlwjr-lab/Sealing/releases/download/tts-model-v1/model.onnx';

// 네트워크 우선: 온라인이면 항상 최신 파일을 받아오고(캐시도 같이 갱신), 실패(오프라인)할 때만 캐시로 대체.
// sw.js 자체가 안 바뀌어도 app.js/index.html 등이 바뀌면 바로바로 반영되도록 하기 위함
// (예전의 "캐시 우선" 방식은 sw.js가 바뀔 때만 캐시가 갱신돼서, 다른 파일만 바뀐 배포는 계속 예전 내용을 보여주는 문제가 있었음)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const isModelOnnx = e.request.url.endsWith(MODEL_ONNX_SUFFIX);
  const fetchUrl = isModelOnnx ? MODEL_ONNX_RELEASE_URL : e.request.url;

  e.respondWith(
    fetch(fetchUrl, isModelOnnx ? { mode: 'cors' } : undefined)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
        }
        return networkResponse;
      })
      .catch(() => caches.match(e.request))
  );
});
