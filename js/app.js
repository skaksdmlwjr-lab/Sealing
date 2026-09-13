/* ================== 전역 변수 & 요소 ================== */
let current = "";
let index = 0;
let verseQueue = [];
let memory = false;
let showTypo = true;
let isRandom = false;
let userAnswers = {}; // 사용자가 각 절마다 입력한 내용을 저장하는 객체

// DOM 요소 연결
const bS = document.getElementById('bookSelect');
const cS = document.getElementById('chapterSelect');
const sV = document.getElementById('startVerse');
const eV = document.getElementById('endVerse');
const qEl = document.getElementById('question');
const hEl = document.getElementById('highlight');
const iEl = document.getElementById('input');
const progress = document.getElementById('progress');
const settingsBtn = document.getElementById('settingsBtn');
const settingsMenu = document.getElementById('settingsMenu');
//폰트설정 
const fontSizeRange = document.getElementById('fontSizeRange');
const fontSizeValue = document.getElementById('fontSizeValue');

/* ================== 초기 로드 ================== */
window.onload = () => {
    if (typeof bibleData === 'undefined') {
        alert("Bible.js 데이터를 로드할 수 없습니다. 파일 경로를 확인하세요.");
        return;
    }
    initBible();
    initBtnStyles();
	updateTypoState();
	initDarkMode();//다크모드
    initFullScreen();//전체화면
	initFontSize(); // 폰트 크기 초기화 호출
	initHelp(); // 도움말 & 튜토리얼 초기화

	// 처음 방문한 사용자에게만 자동으로 사용법 튜토리얼을 보여줌
	if (localStorage.getItem('tutorialSeen') !== 'true') {
		setTimeout(startTutorial, 400);
	}

	registerServiceWorker(); // 오프라인 캐싱 활성화
};

// 서비스워커 등록 (file://로 직접 열었을 때는 지원되지 않으므로 http(s)에서만 시도)
function registerServiceWorker() {
	const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
	if ('serviceWorker' in navigator && isHttp) {
		navigator.serviceWorker.register('sw.js')
			.catch(err => console.warn('서비스워커 등록 실패:', err));
	}
}

// 성경 목록 초기화
function initBible() {
    bS.innerHTML = "";
    bibleData.books.forEach((book, idx) => {
        let opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = book.title;
        bS.appendChild(opt);
    });

    // [중요] 값 변경 시 즉시 loadQueue를 실행하도록 연결
	bS.onchange = () => { updateChapters(); loadQueue(true); };
	cS.onchange = () => { loadQueue(true); };
	sV.oninput = () => { loadQueue(true); };
	eV.oninput = () => { loadQueue(true); };

    updateChapters(); // 첫 실행
}

// 권 변경 시 장 목록 갱신
function updateChapters() {
    cS.innerHTML = "";
    const bookIdx = bS.value;
    const chapters = bibleData.books[bookIdx].chapters;

    chapters.forEach((ch, idx) => {
        let opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = (idx + 1) + "장";
        cS.appendChild(opt);
    });

    handleChapterChange(); // 장 설정 및 절 자동화 실행
}

// [핵심 기능] 장 변경 시 시작절(1), 끝절(마지막절) 자동 입력
function handleChapterChange() {
    const bookIdx = bS.value;
    const chIdx = cS.value;
    const verseData = bibleData.books[bookIdx].chapters[chIdx].verses;

    sV.value = 1;                // 시작절 1로 고정
    eV.value = verseData.length;  // 해당 장의 마지막 절 번호 자동 입력
    
    loadQueue(true);
}

// 구절 리스트 준비
function loadQueue(forceReset = true) {
    const bookIdx = bS.value;
    const chIdx = cS.value;
    
    // 데이터가 로드되지 않았을 경우 방어 코드
    if (!bibleData || !bibleData.books[bookIdx]) return;
    const verseData = bibleData.books[bookIdx].chapters[chIdx].verses;
    
    // [기존 숫자 보정 로직]
    let start = parseInt(sV.value) || 1;
    if (start < 1) { start = 1; sV.value = 1; }
    let end = parseInt(eV.value) || verseData.length;
    if (end > verseData.length) { end = verseData.length; eV.value = end; }
    if (end < start) { end = start; eV.value = end; }
    
    // [핵심 변경] 무작위 버튼이 아닌 경우에만 기존 기록 삭제
    if (forceReset) {
        userAnswers = {};
    }
    
    // 4. 필터링된 구절 큐(Queue) 생성
    verseQueue = [];
    for (let i = start - 1; i < end; i++) {
        if (verseData[i]) {
            verseQueue.push({ v: verseData[i].verse, t: verseData[i].text });
        }
    }

    // 무작위 모드일 경우 섞기
    if (isRandom) verseQueue.sort(() => Math.random() - 0.5);
    
    index = 0; // 목록이 바뀌면 첫 구절부터 다시 시작
    loadVerse(); // 화면 최신화
}

// 현재 구절 화면 표시
function loadVerse() {
    if (verseQueue.length === 0) return;

    stopTts(); // 절을 이동하면 재생 중이던 음성은 멈춤
    stopRecognition(); // 절을 이동하면 음성인식도 중지

    const item = verseQueue[index];
    current = item.t;

    // [핵심] 해당 절에 이전에 입력했던 값이 있다면 불러오고, 없으면 빈칸으로 표시
    // item.v (절 번호)를 키값으로 사용하여 저장된 내용을 가져옵니다.
    const savedText = userAnswers[item.v] || "";
    iEl.value = savedText;
    
    // 화면 표시 및 진행도 업데이트
    if (memory) {
        qEl.textContent = `${item.v}절: [ 내용을 입력하세요 ]`;
    } else {
        qEl.textContent = `${item.v}절: ${item.t}`;
    }
    progress.textContent = `(${index + 1}/${verseQueue.length})`;

    // 화면 이동 시 오타 표시도 현재 입력값에 맞게 갱신
    updateHighlight();
    iEl.focus();
}

// 오타 체크 및 자동 넘김
iEl.oninput = function() {
    const item = verseQueue[index];
    
    // [핵심] 사용자가 타이핑할 때마다 해당 절 번호에 입력값을 실시간 저장
    userAnswers[item.v] = iEl.value;

    updateHighlight();

    // 정답 판정 및 자동 넘김
	/*
    if (iEl.value.trim() === current.trim()) {
        setTimeout(() => {
            if (index < verseQueue.length - 1) {
                index++;
                loadVerse();
            } else {
                alert("해당 범위의 연습을 완료했습니다!");
            }
        }, 500);
    }*/
};

/* ================== 버튼 및 기타 설정 ================== */
function updateBtnStyle(btn, isActive, activeClass) {
    if (!btn) return;
    btn.className = `px-4 py-2 rounded text-white font-bold transition-all ${isActive ? activeClass : 'bg-gray-400'}`;
}

function initBtnStyles() {
    updateBtnStyle(document.getElementById('randomBtn'), isRandom, 'bg-purple-600');
    updateBtnStyle(document.getElementById('memoryBtn'), memory, 'bg-green-600');
    updateBtnStyle(document.getElementById('typoBtn'), showTypo, 'bg-blue-600');
}

document.getElementById('randomBtn').onclick = function() {
    isRandom = !isRandom;
    updateBtnStyle(this, isRandom, 'bg-purple-600');
    
    // false를 보내서 기존에 1절, 2절에 써둔 내용을 지우지 않고 순서만 바꿉니다.
    loadQueue(false); 
};
// 암기모드 버튼 클릭 시
document.getElementById('memoryBtn').onclick = function() {
    memory = !memory;
    updateBtnStyle(this, memory, 'bg-green-600');
    updateTypoState(); // 오타표시 버튼 제어 함수 호출
    loadVerse();
};
document.getElementById('typoBtn').onclick = function() {
    if (memory) return; // 암기모드일 때는 작동 안 함
    
    showTypo = !showTypo;
    updateBtnStyle(this, showTypo, 'bg-blue-600');
    updateHighlight();
};


document.getElementById('next').onclick = () => { if (index < verseQueue.length - 1) { index++; loadVerse(); } else { handleFinish();}};
document.getElementById('prev').onclick = () => { if (index > 0) { index--; loadVerse(); } };

settingsBtn.onclick = (e) => { e.stopPropagation(); settingsMenu.classList.toggle('hidden'); };
document.onclick = () => settingsMenu.classList.add('hidden');
settingsMenu.onclick = (e) => e.stopPropagation();
/* ================== 오타 표시 및 하이라이트 핵심 로직 ================== */
function updateHighlight() {
    // 암기모드가 켜져 있거나, 오타표시 설정이 꺼져 있으면 하이라이트를 지우고 종료
    if (memory || !showTypo) {
        hEl.innerHTML = "";
		hEl.style.display = "none"; // 영역 자체를 숨김 (선택 사항)
        return;
    }
	
	hEl.style.display = "block"; // 영역 다시 표시
    const val = iEl.value;
    let out = "";

    // 입력한 글자 하나하나를 실제 구절(current)과 비교
    for (let i = 0; i < val.length; i++) {
        if (val[i] === current[i]) {
            // 맞으면 기본 색상
            out += val[i];
        } else {
            // 틀리면 빨간색 표시
            out += `<span class="text-red-500">${val[i]}</span>`;
        }
    }
    hEl.innerHTML = out;
}
/* ================== 오타표시 상태 제어 (암기모드 연계) ================== */
function updateTypoState() {
    const typoBtn = document.getElementById('typoBtn');
    if (!typoBtn) return;

    if (memory) {
        // 암기모드 활성화 시: 오타표시 강제 끄기 및 버튼 비활성화
        showTypo = false;
        typoBtn.disabled = true;
        typoBtn.classList.add('opacity-50', 'cursor-not-allowed');
        updateBtnStyle(typoBtn, false, 'bg-blue-600');
    } else {
        // 암기모드 비활성화 시: 버튼 다시 활성화
        typoBtn.disabled = false;
        typoBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        updateBtnStyle(typoBtn, showTypo, 'bg-blue-600');
    }
    
    // 상태 변경 후 즉시 화면 갱신
    updateHighlight();
}

/* ================== 엔터 키 제어 (다음 구절 & 줄바꿈) ================== */
iEl.onkeydown = function(e) {
    // 1. 엔터 키를 눌렀을 때
    if (e.key === 'Enter') {
        // 쉬프트 키를 누르지 않은 경우에만 '다음' 기능 실행
        if (!e.shiftKey) {
            e.preventDefault(); // 엔터 고유의 줄바꿈 기능을 막음
            
            // 다음 구절이 있다면 이동
            if (index < verseQueue.length - 1) {
                index++;
                loadVerse();
            } else {
				handleFinish(); // 마지막 절에서 엔터 누를 시 실행
            }
        }
        // 쉬프트 + 엔터인 경우는 preventDefault를 하지 않아 자연스럽게 줄바꿈이 됨
    }
};
//체점기능좀넣어보자
/* ================== 정답 판정 및 모드별 종료 로직 ================== */
function handleFinish() {
    if (memory) {
        if (confirm("연습을 마치고 전체 채점을 진행하시겠습니까?")) {
            showScoreModal();
        }
    } else {
        alert("연습이 완료되었습니다! 처음으로 돌아갑니다.");
        index = 0;
		userAnswers = {};
        loadVerse();
    }
}

// 채점 모달 띄우기
function showScoreModal() {
    stopTts();
    const modal = document.getElementById('scoreModal');
    const content = document.getElementById('scoreContent');
    content.innerHTML = ""; // 기존 내용 초기화

    verseQueue.forEach((item, idx) => {
        const userAnswer = userAnswers[item.v] || "";
        const correctAnswer = item.t;
        
        // 틀린 부분 하이라이트 생성
        let resultHTML = "";
        const maxLength = Math.max(userAnswer.length, correctAnswer.length);
        
        for (let i = 0; i < maxLength; i++) {
            if (userAnswer[i] === correctAnswer[i]) {
                resultHTML += userAnswer[i] || "";
            } else {
                // 틀린 글자는 빨간색 배경으로 표시
                const char = userAnswer[i] === undefined ? " " : userAnswer[i];
                resultHTML += `<span class="bg-red-200 text-red-700 rounded">${char === " " ? "&nbsp;" : char}</span>`;
            }
        }

        // 각 구절별 결과 블록 생성
        const section = document.createElement('div');
        section.className = "pb-4 border-b last:border-0";
        section.innerHTML = `
            <div class="font-bold text-blue-600 mb-1">${item.v}절</div>
            <div class="mb-2"><span class="inline-block w-16 text-xs text-gray-400 font-normal">정답:</span> <span class="text-gray-700">${correctAnswer}</span></div>
            <div><span class="inline-block w-16 text-xs text-gray-400 font-normal">내가 쓴 답:</span> <span class="break-all font-medium">${resultHTML || '<span class="text-gray-300">(미입력)</span>'}</span></div>
        `;
        content.appendChild(section);
    });

    modal.classList.remove('hidden');
}

// 모달 닫기 및 상태 초기화
function closeModal() {
    document.getElementById('scoreModal').classList.add('hidden');
    // 채점 후 연습 리셋 여부 선택 (처음으로 돌아가기)
    index = 0;
    memory = false; 
    showTypo = true;
	userAnswers = {};
    updateTypoState();
    loadVerse();
}


/* ================== 폰트 크기 제어 변수 및 함수 ================== */
function initFontSize() {
    // 1. 저장된 크기 불러오기 (없으면 기본 18px)
    const savedSize = localStorage.getItem('bibleFontSize') || '18';
    
    // 2. 초기값 적용
    applyFontSize(savedSize);
    fontSizeRange.value = savedSize;

    // 3. 슬라이더(볼륨바) 조절 시 이벤트
    fontSizeRange.oninput = (e) => {
        const size = e.target.value;
        applyFontSize(size);
    };
}

function applyFontSize(size) {
    const numSize = parseInt(size);
    
    // 성구 영역 스타일 적용
    qEl.style.fontSize = size + 'px';
    qEl.style.lineHeight = "1.4"; // 글자 크기의 1.4배로 줄 간격 유지
    
    // 오타 표시 영역도 함께 조절 (선택 사항)
    hEl.style.fontSize = size + 'px';
    hEl.style.lineHeight = "1.4";
    
    fontSizeValue.textContent = size + 'px';
    localStorage.setItem('bibleFontSize', size);
}
/* ================== 다크모드 제어 ================== */
const darkBtn = document.getElementById('darkBtn');
let isDark = localStorage.getItem('darkTheme') === 'true';

function initDarkMode() {
	const updateDarkBtnText = (isDark) => {
        darkBtn.textContent = isDark ? "☀️ 라이트모드" : "🌙 다크모드";
    };

    if (isDark) {
        document.body.classList.add('dark');
    }
    updateDarkBtnText(isDark);
    
    darkBtn.onclick = () => {
        isDark = !isDark;
        document.body.classList.toggle('dark');
        localStorage.setItem('darkTheme', isDark);
        updateDarkBtnText(isDark);
    };
}

/* ================== 전체화면 제어 ================== */
const fullBtn = document.getElementById('fullScreenBtn');

function initFullScreen() {
    fullBtn.onclick = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            fullBtn.textContent = "🗗 창모드";
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                fullBtn.textContent = "🖥️ 전체화면";
            }
        }
    };
}

/* ================== 도움말 모달 ================== */
function initHelp() {
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const helpReplayBtn = document.getElementById('helpReplayBtn');

    helpBtn.onclick = () => {
        settingsMenu.classList.add('hidden');
        helpModal.classList.remove('hidden');
    };
    helpReplayBtn.onclick = () => {
        helpModal.classList.add('hidden');
        startTutorial();
    };
}

function closeHelpModal() {
    document.getElementById('helpModal').classList.add('hidden');
}

/* ================== 사용법 튜토리얼 (화면 요소 하이라이트) ================== */
const tutorialOverlay = document.getElementById('tutorialOverlay');
const tutorialHighlight = document.getElementById('tutorialHighlight');
const tutorialTooltip = document.getElementById('tutorialTooltip');
const tutorialStepLabel = document.getElementById('tutorialStepLabel');
const tutorialTitle = document.getElementById('tutorialTitle');
const tutorialText = document.getElementById('tutorialText');
const tutorialPrev = document.getElementById('tutorialPrev');
const tutorialNext = document.getElementById('tutorialNext');
const tutorialSkip = document.getElementById('tutorialSkip');

const tutorialSteps = [
    { target: '#bcGroup', title: '1. 본문 고르기', text: '먼저 외우고 싶은 성경의 권과 장을 선택하세요. 장을 바꾸면 절 범위가 자동으로 채워져요.' },
    { target: '#verseGroup', title: '2. 절 범위 정하기', text: '시작 절과 끝 절을 직접 입력해 원하는 구간만 골라 연습할 수 있어요.' },
    { target: '#modeGroup', title: '3. 연습 모드 고르기', text: '무작위(순서 섞기), 암기모드(본문 가리기), 오타표시(실시간 대조) 중 원하는 모드를 켜보세요.' },
    { target: '#input', title: '4. 타이핑하기', text: '화면에 나온 말씀을 그대로 옮겨 적어보세요. 오타표시를 켜두면 틀린 글자가 바로 빨간색으로 보여요. 🔊 버튼을 누르면 말씀을 소리로 듣고 받아쓸 수도 있어요.' },
    { target: '#navGroup', title: '5. 절 이동하기', text: 'Enter 키를 누르거나 다음 버튼으로 다음 절로 넘어가요. Shift+Enter는 줄바꿈이에요.' },
    { target: '#settingsBtn', title: '6. 환경설정 & 도움말', text: '글꼴, 다크모드, 글자 크기는 여기서 바꿔요. 이 안내는 도움말 버튼을 눌러 언제든 다시 볼 수 있어요.' },
];

let tutorialIndex = 0;

function positionTutorial(el) {
    const rect = el.getBoundingClientRect();
    const pad = 8;

    tutorialHighlight.style.top = (rect.top - pad) + 'px';
    tutorialHighlight.style.left = (rect.left - pad) + 'px';
    tutorialHighlight.style.width = (rect.width + pad * 2) + 'px';
    tutorialHighlight.style.height = (rect.height + pad * 2) + 'px';

    const tooltipRect = tutorialTooltip.getBoundingClientRect();
    let top = rect.bottom + 16;
    let left = rect.left;

    if (top + tooltipRect.height > window.innerHeight - 16) {
        top = Math.max(16, rect.top - 16 - tooltipRect.height);
    }
    if (left + tooltipRect.width > window.innerWidth - 16) {
        left = window.innerWidth - tooltipRect.width - 16;
    }
    if (left < 16) left = 16;

    tutorialTooltip.style.top = top + 'px';
    tutorialTooltip.style.left = left + 'px';
}

function showTutorialStep(i) {
    const step = tutorialSteps[i];
    const el = document.querySelector(step.target);
    if (!el) { nextTutorialStep(); return; }

    tutorialStepLabel.textContent = `${i + 1} / ${tutorialSteps.length}`;
    tutorialTitle.textContent = step.title;
    tutorialText.textContent = step.text;
    tutorialPrev.style.visibility = i === 0 ? 'hidden' : 'visible';
    tutorialNext.textContent = i === tutorialSteps.length - 1 ? '시작하기' : '다음';

    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => positionTutorial(el), 200);
}

function startTutorial() {
    tutorialIndex = 0;
    settingsMenu.classList.add('hidden');
    tutorialOverlay.classList.remove('hidden');
    showTutorialStep(tutorialIndex);
}

function finishTutorial() {
    tutorialOverlay.classList.add('hidden');
    localStorage.setItem('tutorialSeen', 'true');
}

function nextTutorialStep() {
    if (tutorialIndex < tutorialSteps.length - 1) {
        tutorialIndex++;
        showTutorialStep(tutorialIndex);
    } else {
        finishTutorial();
    }
}

tutorialNext.onclick = nextTutorialStep;
tutorialPrev.onclick = () => { if (tutorialIndex > 0) { tutorialIndex--; showTutorialStep(tutorialIndex); } };
tutorialSkip.onclick = finishTutorial;

window.addEventListener('resize', () => {
    if (!tutorialOverlay.classList.contains('hidden')) {
        const el = document.querySelector(tutorialSteps[tutorialIndex].target);
        if (el) positionTutorial(el);
    }
});

/* ================== 말씀 듣기 (TTS, 브라우저 내장 음성합성) ================== */
const ttsBtn = document.getElementById('ttsBtn');
const ttsSupported = 'speechSynthesis' in window;
let koVoice = null;

function pickKoVoice() {
    const voices = speechSynthesis.getVoices();
    koVoice = voices.find(v => v.lang === 'ko-KR') || voices.find(v => v.lang && v.lang.startsWith('ko')) || null;
}

function setTtsBtnSpeaking(isSpeaking) {
    ttsBtn.textContent = isSpeaking ? '⏸️' : '🔊';
    ttsBtn.title = isSpeaking ? '듣기 중지' : '말씀 듣기';
}

function stopTts() {
    if (ttsSupported && speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    if (ttsSupported) setTtsBtnSpeaking(false);
}

if (ttsSupported) {
    pickKoVoice();
    speechSynthesis.onvoiceschanged = pickKoVoice; // 음성 목록은 비동기로 로드됨

    ttsBtn.onclick = () => {
        if (speechSynthesis.speaking) {
            stopTts();
            return;
        }
        if (!current) return;

        const utter = new SpeechSynthesisUtterance(current);
        utter.lang = 'ko-KR';
        if (koVoice) utter.voice = koVoice;
        utter.rate = 0.9;
        utter.onstart = () => setTtsBtnSpeaking(true);
        utter.onend = () => setTtsBtnSpeaking(false);
        utter.onerror = () => setTtsBtnSpeaking(false);
        speechSynthesis.speak(utter);
    };
} else {
    ttsBtn.style.display = 'none'; // 지원하지 않는 브라우저에서는 버튼 숨김
}

/* ================== 음성으로 입력하기 (STT, 브라우저 내장 Web Speech API) ================== */
const micBtn = document.getElementById('micBtn');
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

function setMicBtnListening(listening) {
    isListening = listening;
    micBtn.textContent = listening ? '🔴' : '🎤';
    micBtn.title = listening ? '듣는 중... (클릭하면 중지)' : '음성으로 입력';
}

function stopRecognition() {
    if (recognition && isListening) {
        recognition.stop();
    }
    if (SpeechRecognitionCtor) setMicBtnListening(false);
}

if (SpeechRecognitionCtor) {
    recognition = new SpeechRecognitionCtor();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        iEl.value = iEl.value ? (iEl.value + ' ' + transcript) : transcript;
        iEl.dispatchEvent(new Event('input')); // 오타표시·자동저장을 기존 입력 로직과 동일하게 갱신
    };
    recognition.onerror = () => setMicBtnListening(false);
    recognition.onend = () => setMicBtnListening(false);

    micBtn.onclick = () => {
        if (isListening) {
            recognition.stop();
            return;
        }
        stopTts(); // 듣기 중이던 음성은 멈추고 녹음 시작
        try {
            recognition.start();
            setMicBtnListening(true);
        } catch (err) {
            setMicBtnListening(false);
        }
    };
} else {
    micBtn.style.display = 'none'; // 미지원 브라우저(iOS Safari 등)에서는 버튼 숨김
}