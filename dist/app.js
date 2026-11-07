/**
 * Cinefy TV - Cliente não oficial para Samsung Tizen 3.0 (Chromium 47) via TizenBrew
 * Desenvolvido em JavaScript ES5 estrito para compatibilidade total de hardware e browser.
 */

(function() {
    'use strict';

    // ==========================================
    // 1. CONFIGURAÇÕES & CONSTANTES
    // ==========================================
    var CONFIG = {
        API_URL: 'https://api.cinefy.gg',
        PUBLIC_CDN: 'https://cdn.cinefy.gg',
        VIDEOS_CDN: 'https://videos.cinefy.gg',
        FREE_VIDEOS_CDN: 'https://gdrive.starvideos.xyz',
        STORAGE_PREFIX: 'cinefy_',
        DEFAULT_PER_PAGE: 20
    };

    // ==========================================
    // 2. ISOLAMENTO DE ARMAZENAMENTO (STORAGE)
    // Preserva StremioK-PTBR e outros módulos
    // ==========================================
    var Storage = {
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
            } catch (e) {}
        },
        removeItem: function(key) {
            try {
                localStorage.removeItem(CONFIG.STORAGE_PREFIX + key);
            } catch (e) {}
        },
        getToken: function() {
            return this.getItem('token');
        },
        setToken: function(token) {
            this.setItem('token', token);
        },
        getUser: function() {
            var raw = this.getItem('user');
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        },
        setUser: function(user) {
            if (!user) {
                this.removeItem('user');
            } else {
                this.setItem('user', JSON.stringify(user));
            }
        },
        clearAuth: function() {
            // NUNCA chamar localStorage.clear()! Apenas as chaves do Cinefy
            this.removeItem('token');
            this.removeItem('user');
        }
    };

    // ==========================================
    // 3. API CLIENT CINEFY
    // ==========================================
    var Api = {
        request: function(endpoint, options) {
            options = options || {};
            var method = options.method || 'GET';
            var headers = options.headers || {};
            headers['Accept'] = 'application/json';

            var token = Storage.getToken();
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }

            if (options.body && typeof options.body === 'object') {
                headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(options.body);
            }

            var url = (endpoint.indexOf('http') === 0) ? endpoint : (CONFIG.API_URL + endpoint);

            return new Promise(function(resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open(method, url, true);
                xhr.timeout = 15000;

                for (var h in headers) {
                    if (headers.hasOwnProperty(h)) {
                        xhr.setRequestHeader(h, headers[h]);
                    }
                }

                xhr.onload = function() {
                    var data = null;
                    try {
                        data = JSON.parse(xhr.responseText);
                    } catch (e) {
                        data = xhr.responseText;
                    }

                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(data);
                    } else {
                        var errMessage = (data && data.message) ? data.message : ('Erro HTTP ' + xhr.status);
                        var err = new Error(errMessage);
                        err.status = xhr.status;
                        err.data = data;
                        reject(err);
                    }
                };

                xhr.onerror = function() {
                    reject(new Error('Erro de conexão com o servidor do Cinefy.'));
                };

                xhr.ontimeout = function() {
                    reject(new Error('Tempo limite esgotado ao contatar o Cinefy.'));
                };

                xhr.send(options.body || null);
            });
        },

        getRelevantCreators: function(page, perPage) {
            page = page || 1;
            perPage = perPage || 20;
            return this.request('/v1/creators/relevant?page=' + page + '&perPage=' + perPage);
        },

        getCreator: function(slugOrId) {
            return this.request('/v1/user/' + encodeURIComponent(slugOrId));
        },

        getCreatorVideos: function(authorId, page, perPage, query, type, sortedOrder) {
            page = page || 1;
            perPage = perPage || 20;
            var url = '/v1/videos?author=' + encodeURIComponent(authorId) + '&page=' + page + '&perPage=' + perPage;
            if (query) url += '&query=' + encodeURIComponent(query);
            if (type) url += '&type=' + encodeURIComponent(type);
            if (sortedOrder) url += '&sortedOrder=' + encodeURIComponent(sortedOrder);
            return this.request(url);
        },

        getRecentVideos: function(page, perPage) {
            page = page || 1;
            perPage = perPage || 20;
            return this.request('/v1/videos?page=' + page + '&perPage=' + perPage + '&sortedOrder=desc');
        },

        getFreeVideos: function(page, perPage) {
            page = page || 1;
            perPage = perPage || 20;
            return this.request('/v1/videos?type=free&page=' + page + '&perPage=' + perPage);
        },

        searchVideos: function(query, page, perPage) {
            page = page || 1;
            perPage = perPage || 20;
            return this.request('/v1/videos?query=' + encodeURIComponent(query) + '&page=' + page + '&perPage=' + perPage);
        },

        getVideo: function(videoId) {
            return this.request('/v1/video/' + encodeURIComponent(videoId));
        },

        login: function(email, password) {
            var body = {
                email: email,
                password: password,
                session: {
                    platform: 'Tizen SmartTV',
                    platformLang: 'pt-BR',
                    platformTimeZone: 'America/Sao_Paulo',
                    screenWidth: 1920,
                    screenHeight: 1080
                }
            };
            return this.request('/v2/auth/login', {
                method: 'POST',
                body: body
            });
        },

        getMe: function() {
            return this.request('/v2/auth/@me');
        },

        buildMediaUrl: function(folder, filename, width) {
            if (!filename) return '';
            var url = CONFIG.PUBLIC_CDN + '/' + folder + '/' + filename;
            if (width) {
                url += '?width=' + width;
            }
            return url;
        }
    };

    // ==========================================
    // 4. MOTOR DE NAVEGAÇÃO ESPACIAL (D-PAD)
    // ==========================================
    var Nav = {
        currentFocus: null,
        history: [],

        init: function() {
            var self = this;

            // Registrar teclas Tizen TV se disponíveis
            if (window.tizen && window.tizen.tvinputdevice) {
                try {
                    var keysToRegister = [
                        'MediaPlay', 'MediaPause', 'MediaPlayPause',
                        'MediaStop', 'MediaFastForward', 'MediaRewind'
                    ];
                    for (var i = 0; i < keysToRegister.length; i++) {
                        window.tizen.tvinputdevice.registerKey(keysToRegister[i]);
                    }
                } catch (e) {
                    console.log('Tizen key registration exception', e);
                }
            }

            // Escutar eventos de teclado
            window.addEventListener('keydown', function(e) {
                self.handleKeyDown(e);
            });

            // Focar o primeiro item navegável na inicialização
            setTimeout(function() {
                var first = document.getElementById('nav-home');
                if (first) self.focus(first);
            }, 300);
        },

        focus: function(el) {
            if (!el) return;
            if (this.currentFocus && this.currentFocus !== el) {
                this.currentFocus.classList.remove('focused');
            }
            this.currentFocus = el;
            el.classList.add('focused');
            try {
                el.focus();
            } catch (e) {}

            // Rolagem automática para manter elemento visível na TV
            this.scrollIntoViewIfNeeded(el);
        },

        scrollIntoViewIfNeeded: function(el) {
            if (!el) return;
            var parent = el.parentElement;
            while (parent && parent !== document.body && parent.id !== 'app') {
                if (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth) {
                    var elRect = el.getBoundingClientRect();
                    var pRect = parent.getBoundingClientRect();

                    // Scroll vertical
                    if (elRect.bottom > pRect.bottom - 40) {
                        parent.scrollTop += (elRect.bottom - pRect.bottom + 60);
                    } else if (elRect.top < pRect.top + 40) {
                        parent.scrollTop -= (pRect.top - elRect.top + 60);
                    }

                    // Scroll horizontal
                    if (elRect.right > pRect.right - 40) {
                        parent.scrollLeft += (elRect.right - pRect.right + 60);
                    } else if (elRect.left < pRect.left + 40) {
                        parent.scrollLeft -= (pRect.left - elRect.left + 60);
                    }
                }
                parent = parent.parentElement;
            }
        },

        handleKeyDown: function(e) {
            var keyCode = e.keyCode || e.which;

            // Se o player de vídeo estiver aberto, tratar teclas do player
            if (Player.isActive) {
                Player.handleKeyDown(e);
                return;
            }

            // Se modal estiver aberto, limitar foco ao modal
            var modalOverlay = document.getElementById('modal-overlay');
            if (modalOverlay && modalOverlay.classList.contains('active')) {
                if (keyCode === 10009 || keyCode === 27) { // Back
                    e.preventDefault();
                    UI.hideModal();
                    return;
                }
                if (keyCode === 13) { // Enter
                    e.preventDefault();
                    if (this.currentFocus) this.currentFocus.click();
                    return;
                }
                this.navigateModal(keyCode);
                return;
            }

            switch (keyCode) {
                case 37: // Left
                    e.preventDefault();
                    this.moveFocus('left');
                    break;
                case 38: // Up
                    e.preventDefault();
                    this.moveFocus('up');
                    break;
                case 39: // Right
                    e.preventDefault();
                    this.moveFocus('right');
                    break;
                case 40: // Down
                    e.preventDefault();
                    this.moveFocus('down');
                    break;
                case 13: // Enter / OK
                    e.preventDefault();
                    if (this.currentFocus) {
                        this.currentFocus.click();
                    }
                    break;
                case 10009: // Tizen Return / Back
                case 27:    // PC Escape
                    e.preventDefault();
                    this.handleBack();
                    break;
            }
        },

        moveFocus: function(direction) {
            var current = this.currentFocus;
            if (!current) {
                var first = document.querySelector('.focusable:not([disabled])');
                if (first) this.focus(first);
                return;
            }

            // Coletar todos os elementos visíveis e focáveis
            var elements = Array.prototype.slice.call(document.querySelectorAll('.focusable:not([disabled])'));
            var visibleElements = [];
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                if (el.offsetParent !== null && !this.isInHiddenContainer(el)) {
                    visibleElements.push(el);
                }
            }

            var next = this.findBestCandidate(current, visibleElements, direction);
            if (next) {
                this.focus(next);
            }
        },

        isInHiddenContainer: function(el) {
            var p = el;
            while (p && p !== document.body) {
                if (p.style && (p.style.display === 'none' || p.style.visibility === 'hidden')) {
                    return true;
                }
                if (p.classList && p.classList.contains('view-section') && !p.classList.contains('active')) {
                    return true;
                }
                p = p.parentElement;
            }
            return false;
        },

        findBestCandidate: function(current, elements, direction) {
            var curRect = current.getBoundingClientRect();
            var curCenter = {
                x: curRect.left + curRect.width / 2,
                y: curRect.top + curRect.height / 2
            };

            var bestEl = null;
            var bestDistance = Infinity;

            for (var i = 0; i < elements.length; i++) {
                var candidate = elements[i];
                if (candidate === current) continue;

                var candRect = candidate.getBoundingClientRect();
                var candCenter = {
                    x: candRect.left + candRect.width / 2,
                    y: candRect.top + candRect.height / 2
                };

                var dx = candCenter.x - curCenter.x;
                var dy = candCenter.y - curCenter.y;

                var isDirectionValid = false;
                var primaryDist = 0;
                var secondaryDist = 0;

                if (direction === 'left' && dx < -15) {
                    isDirectionValid = true;
                    primaryDist = Math.abs(dx);
                    secondaryDist = Math.abs(dy);
                } else if (direction === 'right' && dx > 15) {
                    isDirectionValid = true;
                    primaryDist = Math.abs(dx);
                    secondaryDist = Math.abs(dy);
                } else if (direction === 'up' && dy < -15) {
                    isDirectionValid = true;
                    primaryDist = Math.abs(dy);
                    secondaryDist = Math.abs(dx);
                } else if (direction === 'down' && dy > 15) {
                    isDirectionValid = true;
                    primaryDist = Math.abs(dy);
                    secondaryDist = Math.abs(dx);
                }

                if (isDirectionValid) {
                    // Penalizar distância secundária para priorizar alinhamento
                    var distance = primaryDist + (secondaryDist * 2.2);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestEl = candidate;
                    }
                }
            }

            return bestEl;
        },

        navigateModal: function(keyCode) {
            var modalActions = document.getElementById('modal-actions');
            if (!modalActions) return;
            var buttons = Array.prototype.slice.call(modalActions.querySelectorAll('.focusable'));
            if (buttons.length === 0) return;

            var currentIndex = buttons.indexOf(this.currentFocus);
            if (currentIndex === -1) {
                this.focus(buttons[0]);
                return;
            }

            if (keyCode === 37) { // Left
                var prevIndex = (currentIndex - 1 + buttons.length) % buttons.length;
                this.focus(buttons[prevIndex]);
            } else if (keyCode === 39) { // Right
                var nextIndex = (currentIndex + 1) % buttons.length;
                this.focus(buttons[nextIndex]);
            }
        },

        handleBack: function() {
            // Se estiver em detalhe do canal, voltar para a lista de canais ou home
            var channelDetail = document.getElementById('view-channel-detail');
            if (channelDetail && channelDetail.classList.contains('active')) {
                UI.showView('creators');
                return;
            }

            // Se estiver em outra view que não seja Home, ir para Home
            var homeView = document.getElementById('view-home');
            if (homeView && !homeView.classList.contains('active')) {
                UI.showView('home');
                return;
            }

            // Se estiver na Home e o foco não for o menu lateral, focar menu lateral
            var current = this.currentFocus;
            if (current && !current.classList.contains('nav-item')) {
                var homeNav = document.getElementById('nav-home');
                if (homeNav) this.focus(homeNav);
                return;
            }

            // Confirmação de saída do aplicativo
            UI.showConfirm(
                'Sair do Cinefy',
                'Deseja realmente sair do Cinefy e retornar à TV?',
                function() {
                    if (window.tizen && window.tizen.application) {
                        try {
                            window.tizen.application.getCurrentApplication().exit();
                        } catch (e) {
                            window.close();
                        }
                    } else {
                        window.close();
                    }
                }
            );
        }
    };

    // ==========================================
    // 5. PLAYER DE VÍDEO
    // ==========================================
    var Player = {
        isActive: false,
        videoEl: null,
        osdEl: null,
        osdTimer: null,
        currentVideo: null,
        qualities: [],
        currentQuality: null,

        init: function() {
            var self = this;
            this.videoEl = document.getElementById('main-video');
            this.osdEl = document.getElementById('player-osd');

            if (!this.videoEl) return;

            this.videoEl.addEventListener('timeupdate', function() {
                self.updateProgress();
            });

            this.videoEl.addEventListener('play', function() {
                var playBtn = document.getElementById('player-play-btn');
                if (playBtn) playBtn.innerHTML = '❚❚';
            });

            this.videoEl.addEventListener('pause', function() {
                var playBtn = document.getElementById('player-play-btn');
                if (playBtn) playBtn.innerHTML = '▶';
            });

            this.videoEl.addEventListener('ended', function() {
                self.close();
            });

            this.videoEl.addEventListener('error', function(e) {
                console.error('Player video element error', e);
                self.handlePlaybackError();
            });

            // Botões do OSD
            document.getElementById('player-close-btn').addEventListener('click', function() {
                self.close();
            });

            document.getElementById('player-play-btn').addEventListener('click', function() {
                self.togglePlayPause();
            });

            document.getElementById('player-rewind-btn').addEventListener('click', function() {
                self.seek(-10);
            });

            document.getElementById('player-forward-btn').addEventListener('click', function() {
                self.seek(10);
            });

            document.getElementById('player-quality-btn').addEventListener('click', function() {
                self.toggleQualityModal();
            });
        },

        open: function(videoData) {
            var self = this;
            this.currentVideo = videoData;
            UI.showToast('Carregando vídeo: ' + videoData.title);

            // Buscar dados completos de playback
            Api.getVideo(videoData.id)
                .then(function(fullData) {
                    self.startPlayback(fullData);
                })
                .catch(function(err) {
                    console.error('Erro ao buscar detalhes de vídeo:', err);
                    if (err.status === 401 || err.status === 403) {
                        UI.showModal(
                            'Conteúdo Restrito',
                            'Este vídeo exige login ou assinatura do canal no Cinefy. Deseja acessar sua conta agora?',
                            function() {
                                UI.showView('account');
                            }
                        );
                    } else {
                        // Tentar fallback se for vídeo free ou tiver streamId
                        if (videoData.type === 'free' || (videoData.stream && videoData.stream.hasMP4Fallback)) {
                            self.startFallbackFree(videoData);
                        } else {
                            UI.showModal('Aviso Cinefy', 'Este vídeo não pôde ser reproduzido (' + (err.message || 'Restrito') + ').');
                        }
                    }
                });
        },

        startPlayback: function(videoData) {
            var container = document.getElementById('player-container');
            container.classList.add('active');
            this.isActive = true;

            document.getElementById('player-video-title').textContent = videoData.title || 'Vídeo';
            document.getElementById('player-video-author').textContent = (videoData.author && videoData.author.displayName) ? videoData.author.displayName : '';

            // Extrair stream
            var streamUrl = '';
            var playback = videoData.playback;
            var stream = videoData.stream;

            if (playback && playback.url) {
                streamUrl = playback.url;
            } else if (playback && playback.baseUrl && playback.authorization && playback.streamId) {
                streamUrl = playback.baseUrl + '/' + playback.authorization + '/' + playback.streamId + '/playlist.m3u8';
            } else if (stream && stream.id) {
                // Montar HLS padrão
                streamUrl = CONFIG.VIDEOS_CDN + '/' + (playback ? playback.authorization : '') + '/' + stream.id + '/playlist.m3u8';
            }

            // Configurar resoluções disponíveis
            this.qualities = (stream && stream.resolutions) ? stream.resolutions : [1080, 720, 480];
            this.buildQualityOptions();

            if (!streamUrl) {
                UI.showModal('Erro de Reprodução', 'Stream não encontrado para este vídeo.');
                this.close();
                return;
            }

            console.log('Iniciando reprodução:', streamUrl);
            this.videoEl.src = streamUrl;
            this.videoEl.load();

            var playPromise = this.videoEl.play();
            if (playPromise !== undefined) {
                playPromise.catch(function(err) {
                    console.log('Play autoplay prevenido ou erro:', err);
                });
            }

            this.showOsd();
            Nav.focus(document.getElementById('player-play-btn'));
        },

        startFallbackFree: function(videoData) {
            var stream = videoData.stream;
            if (!stream || !stream.id) {
                UI.showModal('Erro', 'Vídeo gratuito indisponível.');
                return;
            }

            var container = document.getElementById('player-container');
            container.classList.add('active');
            this.isActive = true;

            document.getElementById('player-video-title').textContent = videoData.title || 'Vídeo';
            document.getElementById('player-video-author').textContent = (videoData.author && videoData.author.displayName) ? videoData.author.displayName : '';

            var mp4Url = CONFIG.FREE_VIDEOS_CDN + '/' + stream.id + '/play_720p.mp4';
            console.log('Reproduzindo via fallback gratuito:', mp4Url);

            this.videoEl.src = mp4Url;
            this.videoEl.load();
            this.videoEl.play();

            this.showOsd();
            Nav.focus(document.getElementById('player-play-btn'));
        },

        handlePlaybackError: function() {
            var self = this;
            if (!this.currentVideo) return;
            var stream = this.currentVideo.stream;

            // Se falhou HLS, tentar fallback MP4
            if (stream && stream.id && this.videoEl.src.indexOf('.mp4') === -1) {
                console.log('Tentando fallback para MP4 720p...');
                var mp4Fallback = CONFIG.VIDEOS_CDN + '/' + stream.id + '/play_720p.mp4';
                this.videoEl.src = mp4Fallback;
                this.videoEl.load();
                this.videoEl.play();
                UI.showToast('Alternando para formato compatível (MP4)...');
                return;
            }

            UI.showModal('Erro no Vídeo', 'Não foi possível reproduzir este vídeo na sua TV.');
            this.close();
        },

        close: function() {
            if (this.videoEl) {
                this.videoEl.pause();
                this.videoEl.removeAttribute('src');
                this.videoEl.load();
            }
            var container = document.getElementById('player-container');
            container.classList.remove('active');
            this.isActive = false;

            // Fechar modal de qualidade se aberto
            document.getElementById('quality-modal').classList.remove('active');

            // Retornar foco para a tela anterior
            var activeSection = document.querySelector('.view-section.active');
            if (activeSection) {
                var firstFocusable = activeSection.querySelector('.focusable');
                if (firstFocusable) Nav.focus(firstFocusable);
            }
        },

        togglePlayPause: function() {
            if (!this.videoEl) return;
            if (this.videoEl.paused) {
                this.videoEl.play();
            } else {
                this.videoEl.pause();
            }
            this.showOsd();
        },

        seek: function(seconds) {
            if (!this.videoEl) return;
            var newTime = this.videoEl.currentTime + seconds;
            if (newTime < 0) newTime = 0;
            if (newTime > this.videoEl.duration) newTime = this.videoEl.duration;
            this.videoEl.currentTime = newTime;
            this.updateProgress();
            this.showOsd();
        },

        updateProgress: function() {
            if (!this.videoEl) return;
            var current = this.videoEl.currentTime || 0;
            var duration = this.videoEl.duration || 0;

            document.getElementById('player-current-time').textContent = this.formatTime(current);
            document.getElementById('player-duration').textContent = this.formatTime(duration);

            var percent = duration > 0 ? (current / duration) * 100 : 0;
            document.getElementById('player-progress-fill').style.width = percent + '%';
        },

        formatTime: function(seconds) {
            if (isNaN(seconds) || seconds < 0) return '00:00';
            var h = Math.floor(seconds / 3600);
            var m = Math.floor((seconds % 3600) / 60);
            var s = Math.floor(seconds % 60);

            var mStr = (m < 10 ? '0' : '') + m;
            var sStr = (s < 10 ? '0' : '') + s;

            if (h > 0) {
                var hStr = (h < 10 ? '0' : '') + h;
                return hStr + ':' + mStr + ':' + sStr;
            }
            return mStr + ':' + sStr;
        },

        showOsd: function() {
            var self = this;
            this.osdEl.classList.remove('hidden');
            clearTimeout(this.osdTimer);
            this.osdTimer = setTimeout(function() {
                // Não esconder se modal de qualidade estiver aberto
                var qModal = document.getElementById('quality-modal');
                if (!qModal.classList.contains('active') && self.videoEl && !self.videoEl.paused) {
                    self.osdEl.classList.add('hidden');
                }
            }, 4500);
        },

        buildQualityOptions: function() {
            var listEl = document.getElementById('quality-options-list');
            listEl.innerHTML = '';

            var self = this;
            var options = ['Auto'];
            for (var i = 0; i < this.qualities.length; i++) {
                options.push(this.qualities[i] + 'p');
            }

            for (var j = 0; j < options.length; j++) {
                (function(opt) {
                    var btn = document.createElement('button');
                    btn.className = 'quality-option focusable';
                    btn.textContent = opt;
                    btn.setAttribute('tabindex', '0');
                    if (opt === 'Auto') btn.classList.add('selected');

                    btn.addEventListener('click', function() {
                        self.setQuality(opt);
                    });

                    listEl.appendChild(btn);
                })(options[j]);
            }
        },

        toggleQualityModal: function() {
            var modal = document.getElementById('quality-modal');
            modal.classList.toggle('active');
            if (modal.classList.contains('active')) {
                var firstOption = modal.querySelector('.quality-option');
                if (firstOption) Nav.focus(firstOption);
            } else {
                Nav.focus(document.getElementById('player-quality-btn'));
            }
            this.showOsd();
        },

        setQuality: function(qualityStr) {
            UI.showToast('Qualidade alterada para ' + qualityStr);
            var modal = document.getElementById('quality-modal');
            modal.classList.remove('active');

            var opts = modal.querySelectorAll('.quality-option');
            for (var i = 0; i < opts.length; i++) {
                opts[i].classList.remove('selected');
                if (opts[i].textContent === qualityStr) {
                    opts[i].classList.add('selected');
                }
            }

            Nav.focus(document.getElementById('player-quality-btn'));
        },

        handleKeyDown: function(e) {
            var keyCode = e.keyCode || e.which;
            this.showOsd();

            // Teclas de controle remoto Samsung
            switch (keyCode) {
                case 415: // MediaPlay
                    e.preventDefault();
                    if (this.videoEl && this.videoEl.paused) this.videoEl.play();
                    break;
                case 19: // MediaPause
                    e.preventDefault();
                    if (this.videoEl && !this.videoEl.paused) this.videoEl.pause();
                    break;
                case 10252: // MediaPlayPause
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                case 417: // MediaFastForward
                    e.preventDefault();
                    this.seek(30);
                    break;
                case 412: // MediaRewind
                    e.preventDefault();
                    this.seek(-30);
                    break;
                case 413: // MediaStop
                case 10009: // Back
                case 27: // Escape
                    e.preventDefault();
                    var qModal = document.getElementById('quality-modal');
                    if (qModal.classList.contains('active')) {
                        qModal.classList.remove('active');
                        Nav.focus(document.getElementById('player-quality-btn'));
                    } else {
                        this.close();
                    }
                    break;
                case 37: // Left
                    if (!this.osdEl.classList.contains('hidden') && Nav.currentFocus) {
                        Nav.moveFocus('left');
                    } else {
                        this.seek(-10);
                    }
                    break;
                case 39: // Right
                    if (!this.osdEl.classList.contains('hidden') && Nav.currentFocus) {
                        Nav.moveFocus('right');
                    } else {
                        this.seek(10);
                    }
                    break;
                case 38: // Up
                    Nav.moveFocus('up');
                    break;
                case 40: // Down
                    Nav.moveFocus('down');
                    break;
                case 13: // Enter
                    if (Nav.currentFocus) Nav.currentFocus.click();
                    break;
            }
        }
    };

    // ==========================================
    // 6. TECLADO VIRTUAL PARA BUSCA (TV D-PAD)
    // ==========================================
    var Keyboard = {
        inputEl: null,

        init: function() {
            var self = this;
            this.inputEl = document.getElementById('search-input-field');

            var keys = document.querySelectorAll('#virtual-keyboard .key-btn');
            for (var i = 0; i < keys.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var char = btn.getAttribute('data-char');
                        var action = btn.getAttribute('data-action');

                        if (char !== null) {
                            self.inputEl.value += char;
                        } else if (action === 'backspace') {
                            self.inputEl.value = self.inputEl.value.slice(0, -1);
                        } else if (action === 'search') {
                            UI.performSearch(self.inputEl.value);
                            return;
                        }

                        // Disparar busca se houver 3+ caracteres
                        if (self.inputEl.value.length >= 3) {
                            UI.performSearch(self.inputEl.value);
                        }
                    });
                })(keys[i]);
            }

            document.getElementById('search-clear-btn').addEventListener('click', function() {
                self.inputEl.value = '';
                document.getElementById('search-results-grid').innerHTML = '<p style="color: #8c8ca0; font-size: 20px; margin-top: 20px;">Use o teclado acima para pesquisar vídeos.</p>';
            });

            // Suporte para quando o usuário digita via teclado USB / IME da TV
            this.inputEl.addEventListener('input', function() {
                if (self.inputEl.value.length >= 3) {
                    UI.performSearch(self.inputEl.value);
                }
            });
        }
    };

    // ==========================================
    // 7. INTERFACE DO USUÁRIO & NAVEGAÇÃO
    // ==========================================
    var UI = {
        currentView: 'home',
        selectedChannel: null,

        init: function() {
            var self = this;

            // Eventos do Menu Lateral
            var navButtons = document.querySelectorAll('#sidebar .nav-item');
            for (var i = 0; i < navButtons.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var view = btn.getAttribute('data-view');
                        var action = btn.getAttribute('data-action');

                        if (action === 'reload') {
                            self.reloadCurrentView();
                        } else if (view) {
                            self.showView(view);
                        }
                    });
                })(navButtons[i]);
            }

            // Abas de canal
            var tabButtons = document.querySelectorAll('.channel-tab-btn[data-tab]');
            for (var j = 0; j < tabButtons.length; j++) {
                (function(tBtn) {
                    tBtn.addEventListener('click', function() {
                        var tab = tBtn.getAttribute('data-tab');
                        self.switchChannelTab(tab, tBtn);
                    });
                })(tabButtons[j]);
            }

            document.getElementById('channel-back-btn').addEventListener('click', function() {
                self.showView('creators');
            });

            // Formulário de Login
            document.getElementById('login-submit-btn').addEventListener('click', function() {
                self.handleLogin();
            });

            document.getElementById('account-logout-btn').addEventListener('click', function() {
                self.handleLogout();
            });

            // Verificar sessão existente ao iniciar
            this.checkSession();

            // Carregar tela inicial
            this.loadHome();
        },

        showView: function(viewName) {
            this.currentView = viewName;

            // Atualizar classes ativas na sidebar
            var navButtons = document.querySelectorAll('#sidebar .nav-item');
            for (var i = 0; i < navButtons.length; i++) {
                navButtons[i].classList.remove('active');
                if (navButtons[i].getAttribute('data-view') === viewName) {
                    navButtons[i].classList.add('active');
                }
            }

            // Ocultar todas as seções
            var sections = document.querySelectorAll('.view-section');
            for (var j = 0; j < sections.length; j++) {
                sections[j].classList.remove('active');
            }

            // Exibir a seção alvo
            var targetId = 'view-' + viewName;
            var targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
                targetSection.scrollTop = 0;
            }

            // Ações específicas da tela
            if (viewName === 'home') {
                // Já carregado ou recarregar se vazio
            } else if (viewName === 'creators') {
                this.loadAllCreators();
            } else if (viewName === 'search') {
                var firstKey = document.querySelector('#virtual-keyboard .key-btn');
                if (firstKey) Nav.focus(firstKey);
            } else if (viewName === 'account') {
                this.updateAccountView();
            }
        },

        reloadCurrentView: function() {
            UI.showToast('Atualizando dados...');
            if (this.currentView === 'home') {
                this.loadHome();
            } else if (this.currentView === 'creators') {
                this.loadAllCreators();
            } else if (this.currentView === 'channel-detail' && this.selectedChannel) {
                this.openChannel(this.selectedChannel);
            } else if (this.currentView === 'account') {
                this.checkSession();
            }
        },

        loadHome: function() {
            var self = this;

            // 1. Criadores em Destaque
            Api.getRelevantCreators(1, 15)
                .then(function(res) {
                    self.renderCreatorsCarousel(res.data || [], 'home-creators-carousel');
                })
                .catch(function(err) {
                    document.getElementById('home-creators-carousel').innerHTML = '<p style="color:#e74c3c;">Erro ao carregar criadores.</p>';
                });

            // 2. Vídeos Gratuitos
            Api.getFreeVideos(1, 10)
                .then(function(res) {
                    self.renderVideosHorizontal(res.data || [], 'home-free-carousel');
                })
                .catch(function(err) {
                    document.getElementById('home-free-carousel').innerHTML = '<p style="color:#a0a0b0;">Nenhum vídeo gratuito no momento.</p>';
                });

            // 3. Vídeos Recentes
            Api.getRecentVideos(1, 12)
                .then(function(res) {
                    self.renderVideosGrid(res.data || [], 'home-videos-grid');
                })
                .catch(function(err) {
                    document.getElementById('home-videos-grid').innerHTML = '<p style="color:#e74c3c;">Erro ao carregar vídeos recentes.</p>';
                });
        },

        loadAllCreators: function() {
            var self = this;
            var container = document.getElementById('all-creators-grid');
            container.innerHTML = '<div class="spinner"></div>';

            Api.getRelevantCreators(1, 40)
                .then(function(res) {
                    self.renderCreatorsCarousel(res.data || [], 'all-creators-grid');
                })
                .catch(function(err) {
                    container.innerHTML = '<p style="color:#e74c3c;">Falha ao obter catálogo de criadores.</p>';
                });
        },

        renderCreatorsCarousel: function(creators, containerId) {
            var container = document.getElementById(containerId);
            container.innerHTML = '';

            if (creators.length === 0) {
                container.innerHTML = '<p style="color:#a0a0b0; padding: 20px;">Nenhum criador encontrado.</p>';
                return;
            }

            var self = this;
            for (var i = 0; i < creators.length; i++) {
                (function(creator) {
                    var card = document.createElement('div');
                    card.className = 'creator-card focusable';
                    card.setAttribute('tabindex', '0');

                    var avatarUrl = Api.buildMediaUrl('avatars', creator.avatar, 200);
                    var videoCount = creator.videos || 0;

                    card.innerHTML = 
                        '<div class="creator-avatar-wrap">' +
                            '<img src="' + (avatarUrl || 'assets/logo.png') + '" alt="' + creator.displayName + '" class="creator-avatar" onerror="this.src=\'assets/logo.png\'">' +
                        '</div>' +
                        '<div class="creator-name">' + creator.displayName + '</div>' +
                        '<div class="creator-meta">' + videoCount + ' vídeos</div>';

                    card.addEventListener('click', function() {
                        self.openChannel(creator);
                    });

                    container.appendChild(card);
                })(creators[i]);
            }
        },

        renderVideosGrid: function(videos, containerId) {
            var container = document.getElementById(containerId);
            container.innerHTML = '';

            if (videos.length === 0) {
                container.innerHTML = '<p style="color:#a0a0b0; padding: 20px;">Nenhum vídeo encontrado.</p>';
                return;
            }

            for (var i = 0; i < videos.length; i++) {
                (function(video) {
                    var card = document.createElement('div');
                    card.className = 'video-card focusable';
                    card.setAttribute('tabindex', '0');

                    var thumbUrl = Api.buildMediaUrl('videos', video.thumbnail, 600);
                    var durationStr = Player.formatTime((video.stream && video.stream.duration) ? video.stream.duration : 0);
                    var authorName = (video.author && video.author.displayName) ? video.author.displayName : '';
                    var badgeType = (video.type === 'free') ? '<span class="video-type-badge">Grátis</span>' : '<span class="video-type-badge vod">VOD</span>';

                    card.innerHTML = 
                        '<div class="video-thumb-wrap">' +
                            '<img src="' + (thumbUrl || 'assets/logo.png') + '" alt="" class="video-thumb" onerror="this.src=\'assets/logo.png\'">' +
                            '<span class="video-duration">' + durationStr + '</span>' +
                            badgeType +
                        '</div>' +
                        '<div class="video-info">' +
                            '<div class="video-title">' + (video.title || 'Vídeo') + '</div>' +
                            '<div class="video-author">👤 ' + authorName + '</div>' +
                        '</div>';

                    card.addEventListener('click', function() {
                        Player.open(video);
                    });

                    container.appendChild(card);
                })(videos[i]);
            }
        },

        renderVideosHorizontal: function(videos, containerId) {
            // Reutiliza renderVideosGrid pois estilos do card adaptam-se
            this.renderVideosGrid(videos, containerId);
        },

        openChannel: function(creator) {
            this.selectedChannel = creator;
            this.showView('channel-detail');

            document.getElementById('channel-title').textContent = creator.displayName || 'Canal';
            document.getElementById('channel-description').textContent = creator.description || 'Criador oficial na plataforma Cinefy.';

            var avatarImg = document.getElementById('channel-avatar-img');
            avatarImg.src = Api.buildMediaUrl('avatars', creator.avatar, 200);

            var bannerImg = document.getElementById('channel-banner-img');
            if (creator.banner) {
                bannerImg.src = Api.buildMediaUrl('banners', creator.banner, 1200);
            } else {
                bannerImg.src = '';
            }

            // Carregar vídeos recentes por padrão
            this.loadChannelVideos(creator.id, 'recent');
        },

        switchChannelTab: function(tabName, clickedBtn) {
            var tabs = document.querySelectorAll('.channel-tab-btn[data-tab]');
            for (var i = 0; i < tabs.length; i++) {
                tabs[i].classList.remove('active');
            }
            clickedBtn.classList.add('active');

            if (this.selectedChannel) {
                this.loadChannelVideos(this.selectedChannel.id, tabName);
            }
        },

        loadChannelVideos: function(authorId, tab) {
            var self = this;
            var container = document.getElementById('channel-videos-grid');
            container.innerHTML = '<div class="spinner"></div>';

            var type = (tab === 'free') ? 'free' : '';
            var sortedOrder = (tab === 'recent') ? 'desc' : '';

            Api.getCreatorVideos(authorId, 1, 30, '', type, sortedOrder)
                .then(function(res) {
                    self.renderVideosGrid(res.data || [], 'channel-videos-grid');
                })
                .catch(function(err) {
                    container.innerHTML = '<p style="color:#e74c3c;">Erro ao carregar vídeos deste canal.</p>';
                });
        },

        performSearch: function(query) {
            query = query.trim();
            if (!query) return;

            var container = document.getElementById('search-results-grid');
            container.innerHTML = '<div class="spinner"></div>';

            var self = this;
            Api.searchVideos(query, 1, 24)
                .then(function(res) {
                    self.renderVideosGrid(res.data || [], 'search-results-grid');
                })
                .catch(function(err) {
                    container.innerHTML = '<p style="color:#e74c3c;">Erro ao realizar busca: ' + err.message + '</p>';
                });
        },

        checkSession: function() {
            var token = Storage.getToken();
            if (!token) {
                this.updateAccountView();
                return;
            }

            var self = this;
            Api.getMe()
                .then(function(user) {
                    Storage.setUser(user);
                    self.updateAccountView();
                })
                .catch(function(err) {
                    console.log('Sessão expirada ou inválida:', err);
                    Storage.clearAuth();
                    self.updateAccountView();
                });
        },

        updateAccountView: function() {
            var user = Storage.getUser();
            var loggedCard = document.getElementById('account-logged-in-card');
            var loginCard = document.getElementById('account-login-card');

            if (user) {
                loggedCard.style.display = 'block';
                loginCard.style.display = 'none';

                document.getElementById('account-name').textContent = user.displayName || user.username || 'Usuário Cinefy';
                document.getElementById('account-email').textContent = user.email || '';
                document.getElementById('account-scope').textContent = 'Perfil: ' + (user.scopes ? user.scopes.join(', ') : 'Assinante');
                document.getElementById('account-avatar-char').textContent = (user.displayName || user.username || 'C').charAt(0).toUpperCase();

                var logoutBtn = document.getElementById('account-logout-btn');
                if (logoutBtn) Nav.focus(logoutBtn);
            } else {
                loggedCard.style.display = 'none';
                loginCard.style.display = 'block';

                var emailInput = document.getElementById('login-email');
                if (emailInput) Nav.focus(emailInput);
            }
        },

        handleLogin: function() {
            var email = document.getElementById('login-email').value.trim();
            var password = document.getElementById('login-password').value;

            if (!email || !password) {
                this.showModal('Campos Obrigatórios', 'Por favor, digite seu e-mail e sua senha cadastrados no Cinefy.');
                return;
            }

            UI.showToast('Autenticando com Cinefy...');
            var self = this;

            Api.login(email, password)
                .then(function(res) {
                    if (res && res.data && res.data.accessToken) {
                        var token = res.data.accessToken;
                        Storage.setToken(token);
                        UI.showToast('Login realizado com sucesso!', 'success');

                        // Obter perfil completo
                        return Api.getMe().then(function(userData) {
                            Storage.setUser(userData);
                            self.updateAccountView();
                        });
                    } else if (res && res.type === 'otp') {
                        self.showModal('Autenticação em 2 Etapas', 'Sua conta requer código de autenticação 2FA. Por favor, acesse o Cinefy pelo navegador para concluir o primeiro login.');
                    } else {
                        self.showModal('Erro no Login', 'Não foi possível autenticar. Verifique suas credenciais.');
                    }
                })
                .catch(function(err) {
                    console.error('Falha no login:', err);
                    var msg = (err.data && err.data.message) ? err.data.message : 'E-mail ou senha incorretos.';
                    self.showModal('Falha na Autenticação', msg);
                });
        },

        handleLogout: function() {
            var self = this;
            this.showConfirm(
                'Sair da Conta',
                'Deseja desconectar sua conta Cinefy desta TV?',
                function() {
                    Storage.clearAuth();
                    self.updateAccountView();
                    UI.showToast('Você saiu da sua conta.');
                }
            );
        },

        showModal: function(title, message, onOk) {
            var overlay = document.getElementById('modal-overlay');
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-message').textContent = message;

            var actions = document.getElementById('modal-actions');
            actions.innerHTML = '<button id="modal-ok-btn" class="btn-primary focusable" tabindex="0">OK</button>';

            var okBtn = document.getElementById('modal-ok-btn');
            okBtn.addEventListener('click', function() {
                overlay.classList.remove('active');
                if (typeof onOk === 'function') onOk();
            });

            overlay.classList.add('active');
            Nav.focus(okBtn);
        },

        showConfirm: function(title, message, onConfirm, onCancel) {
            var overlay = document.getElementById('modal-overlay');
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-message').textContent = message;

            var actions = document.getElementById('modal-actions');
            actions.innerHTML = 
                '<button id="modal-confirm-btn" class="btn-primary focusable" tabindex="0">Sim</button>' +
                '<button id="modal-cancel-btn" class="btn-danger focusable" tabindex="0" style="background-color:#4a4a60;">Cancelar</button>';

            var confirmBtn = document.getElementById('modal-confirm-btn');
            var cancelBtn = document.getElementById('modal-cancel-btn');

            confirmBtn.addEventListener('click', function() {
                overlay.classList.remove('active');
                if (typeof onConfirm === 'function') onConfirm();
            });

            cancelBtn.addEventListener('click', function() {
                overlay.classList.remove('active');
                if (typeof onCancel === 'function') onCancel();
            });

            overlay.classList.add('active');
            Nav.focus(confirmBtn);
        },

        hideModal: function() {
            var overlay = document.getElementById('modal-overlay');
            overlay.classList.remove('active');
        },

        showToast: function(msg, type) {
            var container = document.getElementById('toast-container');
            var toast = document.createElement('div');
            toast.className = 'toast' + (type ? (' ' + type) : '');
            toast.textContent = msg;

            container.appendChild(toast);
            setTimeout(function() {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 3500);
        }
    };

    // ==========================================
    // 8. INICIALIZAÇÃO GERAL DO APLICATIVO
    // ==========================================
    window.addEventListener('DOMContentLoaded', function() {
        Nav.init();
        Player.init();
        Keyboard.init();
        UI.init();
    });

})();
