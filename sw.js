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

// TTS 모델(fp32, 109MB)은 GitHub 파일당 100MB 제한 때문에 저장소에 통짜로 못 담아서
// model.onnx.part0 / .part1(각각 100MB 미만)로 쪼개서 커밋해두고, 이 경로로 요청이 오면
// 두 조각을 받아 합쳐서 응답함(앱 코드는 평소처럼 model.onnx 하나를 요청하면 됨).
// GitHub Releases + CORS 방식은 실제로 테스트해보니 Release 자산이 fetch()에 CORS를 안 열어줘서 실패했음(참고용 기록).
const MODEL_ONNX_SUFFIX = 'js/tts/models/Xenova/mms-tts-kor/onnx/model.onnx';
const MODEL_ONNX_PARTS = ['./js/tts/models/Xenova/mms-tts-kor/onnx/model.onnx.part0', './js/tts/models/Xenova/mms-tts-kor/onnx/model.onnx.part1'];

async function respondWithAssembledModel(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached; // 이미 합쳐서 캐싱해둔 게 있으면 그대로 사용 (매번 재조립하지 않음)

  try {
    const buffers = await Promise.all(
      MODEL_ONNX_PARTS.map((url) =>
        fetch(url).then((r) => {
          if (!r.ok) throw new Error('조각 다운로드 실패: ' + url);
          return r.arrayBuffer();
        })
      )
    );
    const totalLength = buffers.reduce((sum, b) => sum + b.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      combined.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }
    const response = new Response(combined, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(totalLength) },
    });
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    return new Response('모델 조각을 받아오지 못했습니다: ' + err.message, { status: 502 });
  }
}

// 네트워크 우선: 온라인이면 항상 최신 파일을 받아오고(캐시도 같이 갱신), 실패(오프라인)할 때만 캐시로 대체.
// sw.js 자체가 안 바뀌어도 app.js/index.html 등이 바뀌면 바로바로 반영되도록 하기 위함
// (예전의 "캐시 우선" 방식은 sw.js가 바뀔 때만 캐시가 갱신돼서, 다른 파일만 바뀐 배포는 계속 예전 내용을 보여주는 문제가 있었음)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  if (e.request.url.endsWith(MODEL_ONNX_SUFFIX)) {
    e.respondWith(respondWithAssembledModel(e.request));
    return;
  }

  e.respondWith(
    fetch(e.request)
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
