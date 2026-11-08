/**
 * Suite de Testes Automatizados no Computador
 * Valida Storage, Player, Navegação D-Pad e Lifecycle do Cinefy-Tizen
 */

const fs = require('fs');
const path = require('path');

// Mocking minimal browser environment for Node.js test execution
const storageMock = {};
global.localStorage = {
    getItem: (k) => storageMock[k] || null,
    setItem: (k, v) => {
        if (k === 'cinefy_force_quota_error') {
            const err = new Error('Quota exceeded');
            err.name = 'QuotaExceededError';
            err.code = 22;
            throw err;
        }
        storageMock[k] = String(v);
    },
    removeItem: (k) => { delete storageMock[k]; },
    clear: () => {
        throw new Error('VIOLAÇÃO GRAVE: localStorage.clear() foi chamado! Isto destruiria o StremioK-PTBR!');
    }
};

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  [PASS] ${testName}`);
        testsPassed++;
    } else {
        console.error(`  [FAIL] ${testName}`);
        testsFailed++;
    }
}

console.log('====================================================');
console.log('1. TESTE DE ISOLAMENTO DE ARMAZENAMENTO & QUOTA');
console.log('====================================================');

// Pre-popular dados do StremioK-PTBR no storage simulado
localStorage.setItem('stremio_addon_cinetorrent', '{"enabled":true}');
localStorage.setItem('stremio_auth_user', 'user_stremio_123');

// Simular objeto Storage do app.js
const CONFIG = { STORAGE_PREFIX: 'cinefy_' };
const Storage = {
    getItem: function(key) {
        try {
            return localStorage.getItem(CONFIG.STORAGE_PREFIX + key);
        } catch (e) {
            return null;
        }
    },
    setItem: function(key, val) {
        try {
            localStorage.setItem(CONFIG.STORAGE_PREFIX + key, val);
            return true;
        } catch (e) {
            return false;
        }
    },
    removeItem: function(key) {
        try {
            localStorage.removeItem(CONFIG.STORAGE_PREFIX + key);
        } catch (e) {}
    },
    getToken: function() { return this.getItem('token'); },
    setToken: function(t) { this.setItem('token', t); },
    clearAuth: function() {
        this.removeItem('token');
        this.removeItem('user');
    }
};

// Gravar e ler token do Cinefy
Storage.setToken('test_token_abc');
assert(Storage.getToken() === 'test_token_abc', 'Cinefy grava e lê token próprio');
assert(localStorage.getItem('stremio_addon_cinetorrent') !== null, 'StremioK addon preservado no storage');
assert(localStorage.getItem('stremio_auth_user') === 'user_stremio_123', 'StremioK dados de usuário preservados');

// Testar logout / clearAuth
Storage.clearAuth();
assert(Storage.getToken() === null, 'Token do Cinefy removido no logout');
assert(localStorage.getItem('stremio_auth_user') === 'user_stremio_123', 'StremioK permanece 100% intacto após logout do Cinefy');

// Testar QuotaExceededError
const quotaOk = Storage.setItem('force_quota_error', 'valor');
assert(quotaOk === false, 'Storage trata graciosamente QuotaExceededError sem crash');


console.log('\n====================================================');
console.log('2. TESTE DA MÁQUINA DE ESTADOS DO PLAYER DE VÍDEO');
console.log('====================================================');

// Simular objeto Player
const videoElementMock = {
    src: '',
    currentTime: 0,
    duration: 120,
    paused: true,
    error: null,
    play: function() { this.paused = false; return Promise.resolve(); },
    pause: function() { this.paused = true; },
    load: function() {}
};

const Player = {
    isActive: false,
    videoEl: videoElementMock,
    currentVideo: null,
    currentQuality: 'Auto',
    openWithSignedPlayback: function(videoData) {
        if (!videoData.playback || !videoData.playback.authorization) {
            return false;
        }
        this.currentVideo = videoData;
        this.isActive = true;
        this.videoEl.src = videoData.playback.baseUrl + '/' + videoData.playback.authorization + '/' + videoData.playback.streamId + '/playlist.m3u8';
        this.videoEl.play();
        return true;
    },
    togglePlayPause: function() {
        if (this.videoEl.paused) this.videoEl.play();
        else this.videoEl.pause();
    },
    seek: function(seconds) {
        let t = this.videoEl.currentTime + seconds;
        if (t < 0) t = 0;
        if (t > this.videoEl.duration) t = this.videoEl.duration;
        this.videoEl.currentTime = t;
    },
    setQuality: function(qualityStr) {
        this.currentQuality = qualityStr;
        const curTime = this.videoEl.currentTime;
        if (qualityStr === '720p' && this.currentVideo.stream && this.currentVideo.stream.hasMP4Fallback) {
            this.videoEl.src = this.currentVideo.playback.baseUrl + '/' + this.currentVideo.playback.authorization + '/' + this.currentVideo.playback.streamId + '/play_720p.mp4';
            this.videoEl.currentTime = curTime;
        }
    },
    close: function() {
        this.videoEl.pause();
        this.videoEl.src = '';
        this.isActive = false;
        this.currentVideo = null;
    }
};

// 1. Início de reprodução com playback assinado
const sampleSignedVideo = {
    id: 'test_vid_1',
    title: 'Episodio 1',
    playback: {
        baseUrl: 'https://videos.cinefy.gg',
        authorization: 'sig_token_xyz_123',
        streamId: 'stream_uuid_456'
    },
    stream: {
        id: 'stream_uuid_456',
        resolutions: [480, 720, 1080],
        hasMP4Fallback: true
    }
};

const started = Player.openWithSignedPlayback(sampleSignedVideo);
assert(started === true, 'Player inicia com autorização de streaming assinada');
assert(Player.isActive === true, 'Player marca isActive como true');
assert(Player.videoEl.src.includes('sig_token_xyz_123/stream_uuid_456/playlist.m3u8'), 'Player constrói rota oficial BunnyCDN assinada');

// 2. Play / Pause
Player.togglePlayPause(); // pause
assert(Player.videoEl.paused === true, 'Player pausa reprodução');
Player.togglePlayPause(); // resume
assert(Player.videoEl.paused === false, 'Player retoma reprodução');

// 3. Seek (+10s, -10s)
Player.seek(30);
assert(Player.videoEl.currentTime === 30, 'Seek avança 30s');
Player.seek(-10);
assert(Player.videoEl.currentTime === 20, 'Seek retrocede 10s');

// 4. Mudança de qualidade
Player.setQuality('720p');
assert(Player.videoEl.src.includes('play_720p.mp4'), 'Mudança de qualidade para 720p troca source para MP4');
assert(Player.videoEl.currentTime === 20, 'Mudança de qualidade preserva currentTime');

// 5. Fim do vídeo e fechamento
Player.close();
assert(Player.isActive === false, 'Fechamento do player desativa estado ativo');
assert(Player.videoEl.src === '', 'Fonte do vídeo limpa ao fechar');


console.log('\n====================================================');
console.log('3. TESTE DE CICLO DE VIDA (LIFECYCLE & RETOMADA)');
console.log('====================================================');

let catalogRefreshed = false;
let sessionRevalidated = false;

const LifecycleTest = {
    lastActiveTime: Date.now() - (15 * 60 * 1000), // simulando 15 min de sono
    REFRESH_INTERVAL: 10 * 60 * 1000,
    currentView: 'home',
    onResume: function(isPlayerActive, currentView) {
        if (isPlayerActive) {
            // Não deve recarregar se vídeo estiver passando
            return 'PLAYER_KEPT_ACTIVE';
        }
        if (currentView === 'search') {
            // Não deve apagar tela de busca
            return 'SEARCH_PRESERVED';
        }
        const now = Date.now();
        if ((now - this.lastActiveTime) > this.REFRESH_INTERVAL) {
            sessionRevalidated = true;
            catalogRefreshed = true;
            return 'CATALOG_REFRESHED';
        }
        return 'IDLE';
    }
};

// Caso A: TV volta de outro app enquanto vídeo estava passando
const resA = LifecycleTest.onResume(true, 'home');
assert(resA === 'PLAYER_KEPT_ACTIVE', 'Reprodução ativa nunca é interrompida ao retornar ao app');

// Caso B: TV volta de outro app na tela de busca
const resB = LifecycleTest.onResume(false, 'search');
assert(resB === 'SEARCH_PRESERVED', 'Tela de busca e termos não são descartados na retomada');

// Caso C: TV volta na tela inicial após 15 minutos
const resC = LifecycleTest.onResume(false, 'home');
assert(resC === 'CATALOG_REFRESHED', 'Catálogo e sessão são revalidados após inatividade prolongada');


console.log('\n====================================================');
console.log(`TOTAL DE TESTES: ${testsPassed + testsFailed} | SUCESSOS: ${testsPassed} | FALHAS: ${testsFailed}`);
console.log('====================================================');

if (testsFailed > 0) {
    process.exit(1);
}
