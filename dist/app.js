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
        VERSION: '1.3.0',
        API_URL: 'https://api.cinefy.gg',
        PUBLIC_CDN: 'https://cdn.cinefy.gg',
        VIDEOS_CDN: 'https://videos.cinefy.gg',
        FREE_VIDEOS_CDN: 'https://gdrive.starvideos.xyz',
        STORAGE_PREFIX: 'cinefy_',
        DEFAULT_PER_PAGE: 20
    };

    // ==========================================
    // 2. ARMAZENAMENTO & SESSÃO (STORAGE)
    // No TizenBrew, todos os módulos compartilham a mesma
    // origem web (file:// ou localhost) e o mesmo armazenamento
    // local (a quota depende do modelo da TV e versão do Tizen;
    // não há quota universal garantida).
    // O prefixo "cinefy_" é uma convenção de namespace para
    // evitar conflitos de chaves com o StremioK-PTBR e outros módulos,
    // mas NÃO constitui isolamento de segurança nem cofre criptografado.
    // NUNCA executar localStorage.clear().
    // Em caso de QuotaExceededError, a aplicação retém os dados
    // em memória volátil durante a sessão sem falhar bruscamente.
    // ==========================================
    var Storage = {
        _memoryFallback: {},

        getItem: function(key) {
            try {
                var val = localStorage.getItem(CONFIG.STORAGE_PREFIX + key);
                if (val !== null) return val;
                return this._memoryFallback[key] || null;
            } catch (e) {
                console.error('Falha ao ler localStorage:', e);
                return this._memoryFallback[key] || null;
            }
        },
        setItem: function(key, val) {
            try {
                localStorage.setItem(CONFIG.STORAGE_PREFIX + key, val);
                delete this._memoryFallback[key];
                return true;
            } catch (e) {
                // Tratar estouro de quota ou restrição de armazenamento do browser da TV
                console.error('Falha ao gravar no localStorage (quota excedida ou bloqueada):', e);
                this._memoryFallback[key] = String(val);
                if (typeof UI !== 'undefined' && UI.showToast) {
                    UI.showToast('Aviso: Armazenamento local da TV cheio. Usando memória temporária.');
                }
                return false;
            }
        },
        removeItem: function(key) {
            try {
                localStorage.removeItem(CONFIG.STORAGE_PREFIX + key);
            } catch (e) {}
            delete this._memoryFallback[key];
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
        getWatchProgress: function(videoId) {
            if (!videoId) return null;
            try {
                var raw = this.getItem('watch_history');
                if (!raw) return null;
                var hist = JSON.parse(raw);
                return hist[videoId] || null;
            } catch (e) {
                return null;
            }
        },
        saveWatchProgress: function(videoId, watchTime, duration) {
            if (!videoId || isNaN(watchTime) || watchTime < 0) return;
            try {
                var raw = this.getItem('watch_history');
                var hist = raw ? JSON.parse(raw) : {};
                hist[videoId] = {
                    watchTime: Math.floor(watchTime),
                    duration: Math.floor(duration || 0),
                    updatedAt: Date.now()
                };
                // Limitar histórico aos 100 itens mais recentes para preservar quota do Tizen
                var keys = [];
                for (var k in hist) {
                    if (hist.hasOwnProperty(k)) keys.push(k);
                }
                if (keys.length > 100) {
                    keys.sort(function(a, b) {
                        return (hist[a].updatedAt || 0) - (hist[b].updatedAt || 0);
                    });
                    for (var i = 0; i < keys.length - 100; i++) {
                        delete hist[keys[i]];
                    }
                }
                this.setItem('watch_history', JSON.stringify(hist));
            } catch (e) {
                console.log('Aviso: Erro ao registrar progresso no storage:', e);
            }
        },
        clearWatchProgress: function(videoId) {
            if (!videoId) return;
            try {
                var raw = this.getItem('watch_history');
                if (!raw) return;
                var hist = JSON.parse(raw);
                delete hist[videoId];
                this.setItem('watch_history', JSON.stringify(hist));
            } catch (e) {}
        },
        clearAuth: function() {
            // NUNCA chamar localStorage.clear()! Apenas as chaves exclusivas do Cinefy
            this.removeItem('token');
            this.removeItem('user');
        }
    };

    // ==========================================
    // 3. API CLIENT CINEFY
    // ==========================================
    var Api = {
        request: function(endpoint, options) {
            var self = this;
            options = options || {};
            var method = options.method || 'GET';
            var headers = options.headers || {};
            headers['Accept'] = 'application/json';

            var token = Storage.getToken();
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }

            var requestBody = options.body;
            if (requestBody && typeof requestBody === 'object') {
                headers['Content-Type'] = 'application/json';
                requestBody = JSON.stringify(requestBody);
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
                    } else if (xhr.status === 401) {
                        // Sessão expirada ou token revogado
                        if (token && !options._skipAuthClear) {
                            console.log('Sessão expirada detectada (HTTP 401). Limpando autenticação.');
                            Storage.clearAuth();
                            if (typeof UI !== 'undefined' && UI.updateAccountView) {
                                UI.updateAccountView();
                                UI.showToast('Sessão Cinefy expirada. Conecte-se novamente.');
                            }
                        }
                        var err401 = new Error((data && data.message) ? data.message : 'Sessão expirada ou não autorizada.');
                        err401.status = 401;
                        err401.data = data;
                        reject(err401);
                    } else {
                        var errMessage = (data && data.message) ? data.message : ('Erro HTTP ' + xhr.status);
                        var err = new Error(errMessage);
                        err.status = xhr.status;
                        err.data = data;
                        reject(err);
                    }
                };

                xhr.onerror = function() {
                    // Tentativa única de reconexão para instabilidades de rede
                    if (!options._retried) {
                        options._retried = true;
                        setTimeout(function() {
                            self.request(endpoint, options).then(resolve).catch(reject);
                        }, 1200);
                        return;
                    }
                    reject(new Error('Erro de conexão com o servidor do Cinefy.'));
                };

                xhr.ontimeout = function() {
                    if (!options._retried) {
                        options._retried = true;
                        setTimeout(function() {
                            self.request(endpoint, options).then(resolve).catch(reject);
                        }, 1200);
                        return;
                    }
                    reject(new Error('Tempo limite esgotado ao contatar o Cinefy.'));
                };

                xhr.send(requestBody || null);
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
                    platform: 'web',
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
            var params = [
                'platform=web',
                'platformLang=pt-BR',
                'platformTimeZone=America%2FSao_Paulo',
                'screenWidth=1920',
                'screenHeight=1080'
            ].join('&');
            return this.request('/v2/auth/@me?' + params, {
                _skipAuthClear: true
            });
        },

        buildMediaUrl: function(folder, filename, width) {
            if (!filename) return '';
            var url = CONFIG.PUBLIC_CDN + '/' + folder + '/' + filename;
            if (width) {
                url += '?width=' + width;
            }
            return url;
        },

        buildThumbnailUrl: function(videoId, thumbnail, width) {
            if (!thumbnail) return 'assets/logo.png';
            if (thumbnail.indexOf('http://') === 0 || thumbnail.indexOf('https://') === 0) {
                return thumbnail;
            }
            if (!videoId) return 'assets/logo.png';
            var url = CONFIG.PUBLIC_CDN + '/videos/' + encodeURIComponent(videoId) + '/thumbnail/' + encodeURIComponent(thumbnail);
            if (width) {
                url += '?width=' + width;
            }
            return url;
        },

        updateWatchTime: function(videoId, watchTime) {
            if (!videoId || isNaN(watchTime) || watchTime < 0) return Promise.resolve(null);
            var token = Storage.getToken();
            if (!token) return Promise.resolve(null);
            return this.request('/v1/video/' + encodeURIComponent(videoId) + '/watch-time', {
                method: 'PUT',
                body: { watchTime: Math.max(0, Math.floor(watchTime)) },
                _skipAuthClear: true
            }).catch(function(err) {
                // Silencioso: falhas de envio analítico não devem interromper o player
                return null;
            });
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

            // 1. Navegação direta dentro da barra lateral (#sidebar)
            if (current.classList.contains('nav-item')) {
                if (direction === 'up') {
                    var prevNav = current.previousElementSibling;
                    while (prevNav && (!prevNav.classList || !prevNav.classList.contains('nav-item'))) {
                        prevNav = prevNav.previousElementSibling;
                    }
                    if (prevNav) this.focus(prevNav);
                    return;
                }
                if (direction === 'down') {
                    var nextNav = current.nextElementSibling;
                    while (nextNav && (!nextNav.classList || !nextNav.classList.contains('nav-item'))) {
                        nextNav = nextNav.nextElementSibling;
                    }
                    if (nextNav) this.focus(nextNav);
                    return;
                }
                if (direction === 'right') {
                    // Pular para o primeiro elemento focável da tela ativa
                    var activeView = document.querySelector('.view-section.active');
                    if (activeView) {
                        var firstContent = activeView.querySelector('.focusable:not([disabled])');
                        if (firstContent) {
                            this.focus(firstContent);
                            return;
                        }
                    }
                }
                if (direction === 'left') {
                    // Limite esquerdo da interface atingido, permanece no menu
                    return;
                }
            }

            // 2. Navegação em carrossel horizontal (.horizontal-carousel)
            var carousel = current.parentElement;
            if (carousel && carousel.classList && carousel.classList.contains('horizontal-carousel')) {
                if (direction === 'right') {
                    var nextCard = current.nextElementSibling;
                    while (nextCard && (!nextCard.classList || !nextCard.classList.contains('focusable'))) {
                        nextCard = nextCard.nextElementSibling;
                    }
                    if (nextCard) {
                        this.focus(nextCard);
                        return;
                    }
                }
                if (direction === 'left') {
                    var prevCard = current.previousElementSibling;
                    while (prevCard && (!prevCard.classList || !prevCard.classList.contains('focusable'))) {
                        prevCard = prevCard.previousElementSibling;
                    }
                    if (prevCard) {
                        this.focus(prevCard);
                        return;
                    } else {
                        // Se estiver no primeiro cartão do carrossel, voltar para a barra lateral
                        var activeNav = document.querySelector('.nav-item.active') || document.getElementById('nav-home');
                        if (activeNav) {
                            this.focus(activeNav);
                            return;
                        }
                    }
                }
            }

            // 3. Fallback espacial para grades, listas e diálogos
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
            } else if (direction === 'left' && !current.classList.contains('nav-item')) {
                // Se navegar para esquerda e não houver mais itens na tela, pular para o menu lateral
                var sideNav = document.querySelector('.nav-item.active') || document.getElementById('nav-home');
                if (sideNav) {
                    this.focus(sideNav);
                }
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
                    UI.exitApp();
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
        triggerElement: null,
        pendingResumeTime: null,
        qualities: [],
        currentQuality: null,
        effectiveResolution: null,
        _lastLocalSaveTime: 0,
        _lastSyncTime: 0,
        _scrubTargetTime: null,
        _scrubTimer: null,
        _scrubHoldCount: 0,
        _lastScrubKeyTime: 0,

        init: function() {
            var self = this;
            this.videoEl = document.getElementById('main-video');
            this.osdEl = document.getElementById('player-osd');

            if (!this.videoEl) return;

            this.videoEl.addEventListener('loadedmetadata', function() {
                self.updateEffectiveResolution();
                self.applyPendingResume();
            });

            this.videoEl.addEventListener('canplay', function() {
                self.applyPendingResume();
            });

            this.videoEl.addEventListener('timeupdate', function() {
                self.updateProgress();
                self.updateEffectiveResolution();
                self.handlePeriodicProgressSave();
            });

            this.videoEl.addEventListener('play', function() {
                var playBtn = document.getElementById('player-play-btn');
                if (playBtn) playBtn.innerHTML = '❚❚';
            });

            this.videoEl.addEventListener('pause', function() {
                var playBtn = document.getElementById('player-play-btn');
                if (playBtn) playBtn.innerHTML = '▶';
                self.saveCurrentProgress();
            });

            this.videoEl.addEventListener('ended', function() {
                if (self.currentVideo) {
                    Storage.clearWatchProgress(self.currentVideo.id);
                }
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
                self.handleScrub(-1);
            });

            document.getElementById('player-forward-btn').addEventListener('click', function() {
                self.handleScrub(1);
            });

            document.getElementById('player-quality-btn').addEventListener('click', function() {
                self.toggleQualityModal();
            });

            var progressBar = document.getElementById('player-progress-bar');
            if (progressBar) {
                progressBar.addEventListener('click', function() {
                    self.togglePlayPause();
                });
            }
        },

        applyPendingResume: function() {
            if (this.pendingResumeTime !== null && this.pendingResumeTime > 5 && this.videoEl) {
                var t = this.pendingResumeTime;
                this.pendingResumeTime = null;
                try {
                    this.videoEl.currentTime = t;
                    UI.showToast('Continuando de onde parou (' + this.formatTime(t) + ')');
                } catch (e) {
                    console.log('Falha ao restaurar tempo inicial:', e);
                }
            }
        },

        handlePeriodicProgressSave: function() {
            if (!this.videoEl || !this.currentVideo) return;
            var cur = this.videoEl.currentTime || 0;
            var dur = this.videoEl.duration || 0;
            if (cur <= 2 || dur <= 0) return;

            var now = Date.now ? Date.now() : new Date().getTime();
            if (now - this._lastLocalSaveTime > 4000) {
                this._lastLocalSaveTime = now;
                Storage.saveWatchProgress(this.currentVideo.id, cur, dur);
            }
            if (now - this._lastSyncTime > 20000) {
                this._lastSyncTime = now;
                Api.updateWatchTime(this.currentVideo.id, cur);
            }
        },

        saveCurrentProgress: function() {
            if (!this.videoEl || !this.currentVideo) return;
            var cur = this.videoEl.currentTime || 0;
            var dur = this.videoEl.duration || 0;
            if (cur > 2 && dur > 0) {
                Storage.saveWatchProgress(this.currentVideo.id, cur, dur);
                Api.updateWatchTime(this.currentVideo.id, cur);
            }
        },

        open: function(videoData, triggerCard) {
            var self = this;
            this.currentVideo = videoData;
            this.triggerElement = triggerCard || Nav.currentFocus;

            // Verificar tempo salvo no storage local da TV ou informado na obra
            var saved = Storage.getWatchProgress(videoData.id);
            var savedTime = (saved && saved.watchTime) ? saved.watchTime : (videoData.watchTime || 0);
            var duration = (videoData.stream && videoData.stream.duration) ? videoData.stream.duration : (saved ? saved.duration : 0);

            if (savedTime >= 5 && (!duration || savedTime < (duration - 15))) {
                this.pendingResumeTime = savedTime;
            } else {
                this.pendingResumeTime = null;
            }

            UI.showToast('Carregando vídeo: ' + (videoData.title || 'Vídeo'));

            // Buscar dados completos de vídeo e autorização de playback
            Api.getVideo(videoData.id)
                .then(function(fullData) {
                    var merged = videoData;
                    if (fullData && typeof fullData === 'object') {
                        // Incorporar dados completos retornados pela API
                        for (var key in fullData) {
                            if (fullData.hasOwnProperty(key)) {
                                merged[key] = fullData[key];
                            }
                        }
                    }

                    // Se a API retornou watchTime mais recente
                    if (merged.watchTime && merged.watchTime > 5 && !self.pendingResumeTime) {
                        self.pendingResumeTime = merged.watchTime;
                    }

                    if (merged.playback && merged.playback.authorization) {
                        self.startPlayback(merged);
                    } else {
                        self.handleAccessRequired(merged);
                    }
                })
                .catch(function(err) {
                    console.log('Detalhes da API de vídeo (status):', err.status || err.message);

                    // Se a listagem já trouxe autorização de playback:
                    if (videoData.playback && videoData.playback.authorization) {
                        self.startPlayback(videoData);
                        return;
                    }

                    if (err.status === 401 || err.status === 403) {
                        UI.showModal(
                            'Conteúdo Restrito',
                            'Este vídeo exige login ou assinatura ativa do canal no Cinefy. Deseja acessar sua conta agora?',
                            function() {
                                UI.showView('account');
                            }
                        );
                    } else {
                        self.handleAccessRequired(videoData, err);
                    }
                });
        },

        handleAccessRequired: function(videoData, err) {
            var isFree = (videoData.type === 'free');
            var msg = isFree
                ? 'Os servidores BunnyCDN do Cinefy exigem token assinado de sessão para autorizar o streaming deste vídeo. Por favor, faça login na sua conta Cinefy na aba "Minha Conta".'
                : 'Este vídeo VOD é restrito a assinantes do canal. Acesse "Minha Conta" para conectar sua conta Cinefy.';

            UI.showModal('Aviso de Streaming Cinefy', msg, function() {
                if (!Storage.getToken()) {
                    UI.showView('account');
                }
            });
        },

        startPlayback: function(videoData) {
            var container = document.getElementById('player-container');
            container.classList.add('active');
            this.isActive = true;
            this.currentVideo = videoData;
            this._scrubTargetTime = null;
            this._scrubHoldCount = 0;
            this._lastLocalSaveTime = 0;
            this._lastSyncTime = 0;

            document.getElementById('player-video-title').textContent = videoData.title || 'Vídeo';
            document.getElementById('player-video-author').textContent = (videoData.author && videoData.author.displayName) ? videoData.author.displayName : '';

            // Construir URL oficial BunnyCDN assinada conforme API do Cinefy
            var streamUrl = '';
            var playback = videoData.playback;
            var stream = videoData.stream;

            if (playback) {
                if (playback.url) {
                    streamUrl = playback.url;
                } else if (playback.baseUrl && playback.authorization && playback.streamId) {
                    streamUrl = playback.baseUrl + '/' + playback.authorization + '/' + playback.streamId + '/playlist.m3u8';
                } else if (playback.authorization && stream && stream.id) {
                    streamUrl = CONFIG.VIDEOS_CDN + '/' + playback.authorization + '/' + stream.id + '/playlist.m3u8';
                }
            }

            // Resoluções reais fornecidas pela CDN/API do Cinefy
            this.qualities = (stream && stream.resolutions && stream.resolutions.length) ? stream.resolutions : [];
            this.currentQuality = 'Auto';
            this.buildQualityOptions();

            if (!streamUrl) {
                UI.showModal('Erro de Reprodução', 'Stream não encontrado ou autorização ausente para este vídeo.');
                this.close();
                return;
            }

            console.log('Iniciando reprodução no elemento <video> HTML5...');
            this.videoEl.src = streamUrl;
            this.videoEl.load();

            var playPromise = this.videoEl.play();
            if (playPromise !== undefined) {
                playPromise.catch(function(err) {
                    console.log('Play autoplay prevenido ou erro inicial:', err);
                });
            }

            // Notificar usuário sobre o início da reprodução HLS
            var maxRes = 0;
            if (this.qualities.length) {
                for (var q = 0; q < this.qualities.length; q++) {
                    if (this.qualities[q] > maxRes) maxRes = this.qualities[q];
                }
            }
            if (maxRes > 0) {
                UI.showToast('Iniciando: HLS Adaptativo (catálogo até ' + maxRes + 'p)');
            } else {
                UI.showToast('Iniciando: HLS Adaptativo');
            }

            this.showOsd();
            var progressBar = document.getElementById('player-progress-bar');
            if (progressBar) {
                Nav.focus(progressBar);
            } else {
                Nav.focus(document.getElementById('player-play-btn'));
            }
        },

        handlePlaybackError: function() {
            var err = this.videoEl ? this.videoEl.error : null;
            var code = err ? err.code : 0;
            var playback = this.currentVideo ? this.currentVideo.playback : null;
            var stream = this.currentVideo ? this.currentVideo.stream : null;

            console.error('Evento de erro no leitor <video> HTML5. Código:', code);

            // Se falhou HLS e temos autorização + fallback MP4 declarado
            if (playback && playback.baseUrl && playback.authorization && playback.streamId &&
                this.videoEl.src.indexOf('.mp4') === -1 && stream && stream.hasMP4Fallback) {
                var self = this;
                var mp4Fallback = playback.baseUrl + '/' + playback.authorization + '/' + playback.streamId + '/play_720p.mp4';
                // Não reduzir silenciosamente: informar a falha e oferecer escolha explícita ao usuário
                UI.showModal(
                    'Falha no Stream Principal',
                    'O stream adaptativo HLS não pôde ser reproduzido. O servidor disponibiliza uma versão alternativa em MP4 720p. Deseja alternar para MP4 720p?',
                    function() {
                        self.videoEl.src = mp4Fallback;
                        self.videoEl.load();
                        self.videoEl.play();
                        self.currentQuality = 'mp4_720p';
                        UI.showToast('Alternado para MP4 720p');
                    }
                );
                return;
            }

            var reason = 'Falha desconhecida no leitor de mídia.';
            if (code === 1) {
                reason = 'Reprodução abortada pelo sistema.';
            } else if (code === 2) {
                reason = 'Erro de rede ao baixar os segmentos do vídeo da CDN (verifique sua conexão ou validade do token).';
            } else if (code === 3) {
                reason = 'Falha na decodificação do vídeo pelo hardware do televisor.';
            } else if (code === 4) {
                reason = 'Formato ou codec não suportado pelo navegador Chromium 47 da TV.';
            }

            UI.showModal('Erro no Vídeo', reason);
            this.close();
        },

        close: function() {
            this.saveCurrentProgress();
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

            // Limpar estado de scrub
            this.hideScrubIndicator();
            this._scrubTargetTime = null;
            clearTimeout(this._scrubTimer);

            // Retornar foco com precisão para o card / elemento que abriu o player!
            var target = this.triggerElement;
            this.triggerElement = null;

            if (target && document.contains(target) && !Nav.isInHiddenContainer(target)) {
                Nav.focus(target);
            } else {
                var activeSection = document.querySelector('.view-section.active');
                if (activeSection) {
                    var firstFocusable = activeSection.querySelector('.focusable');
                    if (firstFocusable) Nav.focus(firstFocusable);
                }
            }

            // Atualizar barras de progresso nos cards da tela
            UI.updateWatchedBadges();
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
            this.handleScrub(seconds > 0 ? 1 : -1);
        },

        updateProgress: function() {
            if (!this.videoEl) return;
            // Se o usuário estiver no meio de um scrub manual, não sobrescrever com o tempo do vídeo
            if (this._scrubTargetTime !== null) return;

            var current = this.videoEl.currentTime || 0;
            var duration = this.videoEl.duration || 0;
            this.renderProgressValues(current, duration);
        },

        renderProgressValues: function(current, duration) {
            var curEl = document.getElementById('player-current-time');
            var durEl = document.getElementById('player-duration');
            var fillEl = document.getElementById('player-progress-fill');
            var handleEl = document.getElementById('player-scrub-handle');

            if (curEl) curEl.textContent = this.formatTime(current);
            if (durEl) durEl.textContent = this.formatTime(duration);

            var percent = duration > 0 ? (current / duration) * 100 : 0;
            if (percent < 0) percent = 0;
            if (percent > 100) percent = 100;

            if (fillEl) fillEl.style.width = percent + '%';
            if (handleEl) handleEl.style.left = percent + '%';
        },

        handleScrub: function(direction) {
            if (!this.videoEl) return;
            var duration = this.videoEl.duration || 0;
            if (duration <= 0) return;

            var now = Date.now ? Date.now() : new Date().getTime();
            if (now - this._lastScrubKeyTime < 450) {
                this._scrubHoldCount++;
            } else {
                this._scrubHoldCount = 0;
            }
            this._lastScrubKeyTime = now;

            // Aceleração progressiva por repetição contínua (segurando a seta no controle):
            // 0-3 pulsos: 10s por pulso
            // 4-8 pulsos: 30s por pulso
            // 9-14 pulsos: 60s (1 minuto) por pulso
            // 15+ pulsos: 120s (2 minutos) por pulso
            var step = 10;
            if (this._scrubHoldCount > 14) {
                step = 120;
            } else if (this._scrubHoldCount > 8) {
                step = 60;
            } else if (this._scrubHoldCount > 3) {
                step = 30;
            }

            if (this._scrubTargetTime === null) {
                this._scrubTargetTime = this.videoEl.currentTime || 0;
            }

            this._scrubTargetTime += (direction * step);
            if (this._scrubTargetTime < 0) this._scrubTargetTime = 0;
            if (this._scrubTargetTime > duration) this._scrubTargetTime = duration;

            // Atualização visual fluida imediata
            this.renderProgressValues(this._scrubTargetTime, duration);
            this.showScrubIndicator(direction, step, this._scrubTargetTime, duration);
            this.showOsd();

            // Garantir foco na barra de progresso durante o scrub
            var progressBar = document.getElementById('player-progress-bar');
            if (progressBar && Nav.currentFocus !== progressBar) {
                Nav.focus(progressBar);
            }

            // Debounce do seek de hardware (evita travamentos na TV durante key repeats contínuos)
            var self = this;
            clearTimeout(this._scrubTimer);
            this._scrubTimer = setTimeout(function() {
                self.commitScrub();
            }, 320);
        },

        commitScrub: function() {
            if (!this.videoEl || this._scrubTargetTime === null) return;
            var target = this._scrubTargetTime;
            this._scrubTargetTime = null;
            this._scrubHoldCount = 0;
            try {
                this.videoEl.currentTime = target;
            } catch (e) {}
            this.hideScrubIndicator();
            this.saveCurrentProgress();
        },

        showScrubIndicator: function(direction, step, targetTime, duration) {
            var badge = document.getElementById('player-scrub-badge');
            if (!badge) return;
            var sign = direction > 0 ? '+' : '-';
            var stepStr = step >= 60 ? (Math.round(step / 60) + 'm') : (step + 's');
            badge.textContent = (direction > 0 ? '⏩ ' : '⏪ ') + sign + stepStr + ' (' + this.formatTime(targetTime) + ' / ' + this.formatTime(duration) + ')';
            badge.style.display = 'inline-block';
        },

        hideScrubIndicator: function() {
            var badge = document.getElementById('player-scrub-badge');
            if (badge) badge.style.display = 'none';
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

        updateEffectiveResolution: function() {
            if (!this.videoEl) return;
            var w = this.videoEl.videoWidth;
            var h = this.videoEl.videoHeight;
            if (w && h) {
                this.effectiveResolution = w + 'x' + h;
            }
        },

        buildQualityOptions: function() {
            var listEl = document.getElementById('quality-options-list');
            listEl.innerHTML = '';

            var self = this;
            var stream = (this.currentVideo && this.currentVideo.stream) ? this.currentVideo.stream : null;
            var options = [];

            // Opção 1: Automático HLS (Adaptação gerenciada pelo hardware da TV)
            options.push({ label: 'Automático (HLS Adaptativo)', value: 'Auto' });

            // Opção MP4 Fallback APENAS se confirmada expressamente pela API (hasMP4Fallback === true)
            if (stream && stream.hasMP4Fallback === true) {
                options.push({ label: 'MP4 720p (Fallback CDN direto)', value: 'mp4_720p' });
            }

            for (var j = 0; j < options.length; j++) {
                (function(opt) {
                    var btn = document.createElement('button');
                    btn.className = 'quality-option focusable';
                    btn.textContent = opt.label;
                    btn.setAttribute('tabindex', '0');
                    btn.setAttribute('data-quality', opt.value);
                    if (opt.value === self.currentQuality || (self.currentQuality === 'Auto' && opt.value === 'Auto')) {
                        btn.classList.add('selected');
                    }

                    btn.addEventListener('click', function() {
                        self.setQuality(opt.value, opt.label);
                    });

                    listEl.appendChild(btn);
                })(options[j]);
            }

            // Exibir nota informativa honesta no modal de qualidade
            var noteEl = document.createElement('div');
            noteEl.className = 'quality-info-note';
            noteEl.style.cssText = 'color: #8c8ca0; font-size: 14px; margin-top: 15px; text-align: left; line-height: 1.4;';

            var encodedList = (this.qualities && this.qualities.length) ? this.qualities.join('p, ') + 'p' : 'Padrão da plataforma';
            var currentEff = this.effectiveResolution || 'Aguardando decodificação do hardware';

            noteEl.innerHTML = 
                '<div style="margin-bottom:6px;"><strong style="color:#d0d0e0;">Resoluções no catálogo:</strong> ' + encodedList + '</div>' +
                '<div style="margin-bottom:6px;"><strong style="color:#d0d0e0;">Resolução efetiva atual:</strong> ' + currentEff + '</div>' +
                '<div style="font-size:12px; color:#707080;">O leitor nativo HTML5 gerencia a resolução dinamicamente via HLS adaptativo conforme a banda e o hardware da TV. O Chromium 47 não suporta seleção manual de variantes sem extensão MSE.</div>';

            listEl.appendChild(noteEl);
        },

        toggleQualityModal: function() {
            var modal = document.getElementById('quality-modal');
            modal.classList.toggle('active');
            if (modal.classList.contains('active')) {
                // Reconstruir para atualizar a resolução efetiva atual
                this.buildQualityOptions();
                var firstOption = modal.querySelector('.quality-option');
                if (firstOption) Nav.focus(firstOption);
            } else {
                Nav.focus(document.getElementById('player-quality-btn'));
            }
            this.showOsd();
        },

        setQuality: function(qualityVal, qualityLabel) {
            var modal = document.getElementById('quality-modal');
            modal.classList.remove('active');

            var playback = (this.currentVideo && this.currentVideo.playback) ? this.currentVideo.playback : null;
            var stream = (this.currentVideo && this.currentVideo.stream) ? this.currentVideo.stream : null;

            // Recusar seleções nominais fantasmas que não possuem stream separado
            if (qualityVal !== 'Auto' && qualityVal !== 'mp4_720p') {
                console.log('Seleção manual de variante nominal (' + qualityVal + ') não suportada pelo player nativo.');
                UI.showToast('Controle manual de variante HLS não suportado no Chromium 47. Mantido modo Automático.');
                Nav.focus(document.getElementById('player-quality-btn'));
                return;
            }

            // Se for MP4 e o stream não possuir fallback comprovado pela API
            if (qualityVal === 'mp4_720p' && (!stream || stream.hasMP4Fallback !== true)) {
                UI.showToast('MP4 720p não disponibilizado pelo servidor para este vídeo.');
                Nav.focus(document.getElementById('player-quality-btn'));
                return;
            }

            var opts = modal.querySelectorAll('.quality-option');
            for (var i = 0; i < opts.length; i++) {
                opts[i].classList.remove('selected');
                if (opts[i].getAttribute('data-quality') === qualityVal) {
                    opts[i].classList.add('selected');
                }
            }

            this.currentQuality = qualityVal;

            if (playback && playback.baseUrl && playback.authorization && playback.streamId) {
                var curTime = this.videoEl ? (this.videoEl.currentTime || 0) : 0;
                var wasPaused = this.videoEl ? this.videoEl.paused : false;
                var newUrl = '';

                if (qualityVal === 'Auto') {
                    newUrl = playback.baseUrl + '/' + playback.authorization + '/' + playback.streamId + '/playlist.m3u8';
                    UI.showToast('Qualidade: ' + (qualityLabel || 'Automático HLS'));
                } else if (qualityVal === 'mp4_720p') {
                    newUrl = playback.baseUrl + '/' + playback.authorization + '/' + playback.streamId + '/play_720p.mp4';
                    UI.showToast('Qualidade: MP4 720p direto');
                }

                if (newUrl && this.videoEl.src !== newUrl) {
                    this.videoEl.src = newUrl;
                    this.videoEl.currentTime = curTime;
                    if (!wasPaused) {
                        this.videoEl.play();
                    }
                }
            } else {
                UI.showToast('Qualidade: ' + (qualityLabel || qualityVal));
            }

            Nav.focus(document.getElementById('player-quality-btn'));
        },

        handleKeyDown: function(e) {
            var keyCode = e.keyCode || e.which;
            this.showOsd();

            var currentFocus = Nav.currentFocus;
            var progressBar = document.getElementById('player-progress-bar');
            var playBtn = document.getElementById('player-play-btn');
            var rewindBtn = document.getElementById('player-rewind-btn');
            var forwardBtn = document.getElementById('player-forward-btn');
            var qualityBtn = document.getElementById('player-quality-btn');
            var closeBtn = document.getElementById('player-close-btn');

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
                    this.handleScrub(1);
                    break;
                case 412: // MediaRewind
                    e.preventDefault();
                    this.handleScrub(-1);
                    break;
                case 413: // MediaStop
                case 10009: // Back
                case 27: // Escape
                    e.preventDefault();
                    var qModal = document.getElementById('quality-modal');
                    if (qModal && qModal.classList.contains('active')) {
                        qModal.classList.remove('active');
                        Nav.focus(qualityBtn);
                    } else {
                        this.close();
                    }
                    break;
                case 37: // Left (Rewind / Scrub ou navegação)
                    e.preventDefault();
                    if (currentFocus === progressBar) {
                        this.handleScrub(-1);
                    } else if (currentFocus === forwardBtn) {
                        Nav.focus(playBtn);
                    } else if (currentFocus === playBtn) {
                        Nav.focus(rewindBtn);
                    } else if (currentFocus === qualityBtn) {
                        Nav.focus(forwardBtn);
                    } else if (currentFocus === rewindBtn) {
                        this.handleScrub(-1);
                    } else if (currentFocus === closeBtn) {
                        Nav.focus(progressBar);
                    } else {
                        this.handleScrub(-1);
                    }
                    break;
                case 39: // Right (Fast Forward / Scrub ou navegação)
                    e.preventDefault();
                    if (currentFocus === progressBar) {
                        this.handleScrub(1);
                    } else if (currentFocus === rewindBtn) {
                        Nav.focus(playBtn);
                    } else if (currentFocus === playBtn) {
                        Nav.focus(forwardBtn);
                    } else if (currentFocus === forwardBtn) {
                        Nav.focus(qualityBtn);
                    } else if (currentFocus === qualityBtn) {
                        this.handleScrub(1);
                    } else if (currentFocus === closeBtn) {
                        Nav.focus(progressBar);
                    } else {
                        this.handleScrub(1);
                    }
                    break;
                case 38: // Up
                    e.preventDefault();
                    if (currentFocus === playBtn || currentFocus === rewindBtn || currentFocus === forwardBtn || currentFocus === qualityBtn) {
                        Nav.focus(progressBar);
                    } else if (currentFocus === progressBar) {
                        Nav.focus(closeBtn);
                    } else {
                        Nav.moveFocus('up');
                    }
                    break;
                case 40: // Down
                    e.preventDefault();
                    if (currentFocus === closeBtn) {
                        Nav.focus(progressBar);
                    } else if (currentFocus === progressBar) {
                        Nav.focus(playBtn);
                    } else {
                        Nav.moveFocus('down');
                    }
                    break;
                case 13: // Enter
                    e.preventDefault();
                    if (currentFocus === progressBar) {
                        if (this._scrubTargetTime !== null) {
                            this.commitScrub();
                        } else {
                            this.togglePlayPause();
                        }
                    } else if (currentFocus) {
                        currentFocus.click();
                    }
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

        isLoadingHome: false,
        homeSeq: 0,
        searchSeq: 0,
        creatorsSeq: 0,

        loadHome: function(isBackground) {
            var self = this;
            if (this.isLoadingHome) {
                console.log('Carga da Home já em andamento, ignorando chamada duplicada.');
                return;
            }
            this.isLoadingHome = true;
            this.homeSeq++;
            var currentSeq = this.homeSeq;

            var prevFocused = document.activeElement;

            // 1. Criadores em Destaque
            Api.getRelevantCreators(1, 15)
                .then(function(res) {
                    if (currentSeq !== self.homeSeq) return;
                    self.renderCreatorsCarousel(res.data || [], 'home-creators-carousel');
                    if (prevFocused && document.contains(prevFocused) && prevFocused.classList.contains('focusable')) {
                        Nav.focus(prevFocused);
                    }
                })
                .catch(function(err) {
                    if (currentSeq !== self.homeSeq) return;
                    var c = document.getElementById('home-creators-carousel');
                    if (c) c.innerHTML = '<p style="color:#e74c3c;">Erro ao carregar criadores.</p>';
                });

            // 2. Vídeos Gratuitos
            Api.getFreeVideos(1, 10)
                .then(function(res) {
                    if (currentSeq !== self.homeSeq) return;
                    self.renderVideosHorizontal(res.data || [], 'home-free-carousel');
                })
                .catch(function(err) {
                    if (currentSeq !== self.homeSeq) return;
                    var f = document.getElementById('home-free-carousel');
                    if (f) f.innerHTML = '<p style="color:#a0a0b0;">Nenhum vídeo gratuito no momento.</p>';
                });

            // 3. Vídeos Recentes
            Api.getRecentVideos(1, 12)
                .then(function(res) {
                    if (currentSeq !== self.homeSeq) return;
                    self.renderVideosGrid(res.data || [], 'home-videos-grid');
                    self.isLoadingHome = false;
                })
                .catch(function(err) {
                    if (currentSeq !== self.homeSeq) return;
                    var g = document.getElementById('home-videos-grid');
                    if (g) g.innerHTML = '<p style="color:#e74c3c;">Erro ao carregar vídeos recentes.</p>';
                    self.isLoadingHome = false;
                });
        },

        loadAllCreators: function(isBackground) {
            var self = this;
            this.creatorsSeq++;
            var currentSeq = this.creatorsSeq;

            var container = document.getElementById('all-creators-grid');
            if (!container) return;
            if (!isBackground) {
                container.innerHTML = '<div class="spinner"></div>';
            }

            Api.getRelevantCreators(1, 40)
                .then(function(res) {
                    if (currentSeq !== self.creatorsSeq) return;
                    self.renderCreatorsCarousel(res.data || [], 'all-creators-grid');
                })
                .catch(function(err) {
                    if (currentSeq !== self.creatorsSeq) return;
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

        formatRelativeTime: function(dateStr) {
            if (!dateStr) return '';
            try {
                var time = new Date(dateStr).getTime();
                if (isNaN(time)) {
                    var safeStr = String(dateStr).replace(/-/g, '/').replace('T', ' ').replace(/\..*$/, '');
                    time = new Date(safeStr).getTime();
                }
                if (isNaN(time)) return '';

                var now = Date.now ? Date.now() : new Date().getTime();
                var diffSec = Math.floor((now - time) / 1000);
                if (diffSec < 0) diffSec = 0;

                if (diffSec < 60) return 'agora';
                var diffMin = Math.floor(diffSec / 60);
                if (diffMin === 1) return 'há 1 min';
                if (diffMin < 60) return 'há ' + diffMin + ' min';

                var diffHours = Math.floor(diffMin / 60);
                if (diffHours === 1) return 'há 1 hora';
                if (diffHours < 24) return 'há ' + diffHours + ' horas';

                var diffDays = Math.floor(diffHours / 24);
                if (diffDays === 1) return 'há 1 dia';
                if (diffDays < 7) return 'há ' + diffDays + ' dias';

                var diffWeeks = Math.floor(diffDays / 7);
                if (diffWeeks === 1) return 'há 1 semana';
                if (diffWeeks < 4) return 'há ' + diffWeeks + ' semanas';

                var diffMonths = Math.floor(diffDays / 30);
                if (diffMonths === 1) return 'há 1 mês';
                if (diffMonths < 12) return 'há ' + diffMonths + ' meses';

                var diffYears = Math.floor(diffDays / 365);
                if (diffYears === 1) return 'há 1 ano';
                return 'há ' + diffYears + ' anos';
            } catch (e) {
                return '';
            }
        },

        updateWatchedBadges: function() {
            var cards = document.querySelectorAll('.video-card[data-video-id]');
            for (var i = 0; i < cards.length; i++) {
                var c = cards[i];
                var vid = c.getAttribute('data-video-id');
                var p = Storage.getWatchProgress(vid);
                var thumbWrap = c.querySelector('.video-thumb-wrap');
                if (thumbWrap) {
                    var existing = thumbWrap.querySelector('.video-progress-track');
                    if (p && p.duration > 0 && p.watchTime > 5) {
                        var pct = Math.min(Math.floor((p.watchTime / p.duration) * 100), 100);
                        if (existing) {
                            var bar = existing.querySelector('.video-progress-bar');
                            if (bar) bar.style.width = pct + '%';
                        } else {
                            var track = document.createElement('div');
                            track.className = 'video-progress-track';
                            track.innerHTML = '<div class="video-progress-bar" style="width:' + pct + '%;"></div>';
                            thumbWrap.appendChild(track);
                        }
                    } else if (existing) {
                        existing.parentNode.removeChild(existing);
                    }
                }
            }
        },

        renderVideosGrid: function(videos, containerId) {
            var container = document.getElementById(containerId);
            container.innerHTML = '';

            if (videos.length === 0) {
                container.innerHTML = '<p style="color:#a0a0b0; padding: 20px;">Nenhum vídeo encontrado.</p>';
                return;
            }

            var self = this;
            for (var i = 0; i < videos.length; i++) {
                (function(video) {
                    var card = document.createElement('div');
                    card.className = 'video-card focusable';
                    card.setAttribute('tabindex', '0');
                    if (video.id) {
                        card.setAttribute('data-video-id', video.id);
                    }

                    var thumbUrl = Api.buildThumbnailUrl(video.id, video.thumbnail, 600);
                    var durationSec = (video.stream && video.stream.duration) ? video.stream.duration : 0;
                    var durationStr = Player.formatTime(durationSec);
                    var authorName = (video.author && video.author.displayName) ? video.author.displayName : (video.author && video.author.username ? video.author.username : 'Cinefy');
                    var authorAvatar = (video.author && video.author.avatar) ? Api.buildMediaUrl('avatars', video.author.avatar, 100) : 'assets/logo.png';
                    var badgeType = (video.type === 'free') ? '<span class="video-type-badge">Grátis</span>' : '<span class="video-type-badge vod">VOD</span>';

                    // Data relativa de postagem ("há X dias", etc.)
                    var publishDate = video.publishedAt || video.createdAt;
                    var relativeTime = self.formatRelativeTime(publishDate);

                    // Progresso assistido (local ou remoto)
                    var watchInfo = Storage.getWatchProgress(video.id);
                    var watchTime = (watchInfo && watchInfo.watchTime) ? watchInfo.watchTime : (video.watchTime || 0);
                    var totalDuration = durationSec || (watchInfo ? watchInfo.duration : 0);
                    var percent = 0;
                    if (totalDuration > 0 && watchTime > 5) {
                        percent = Math.min(Math.floor((watchTime / totalDuration) * 100), 100);
                    }
                    var progressHtml = (percent > 0)
                        ? '<div class="video-progress-track"><div class="video-progress-bar" style="width:' + percent + '%;"></div></div>'
                        : '';

                    var dateSnippet = relativeTime
                        ? '<span class="video-dot">•</span><span class="video-date">' + relativeTime + '</span>'
                        : '';

                    card.innerHTML = 
                        '<div class="video-thumb-wrap">' +
                            '<img src="' + thumbUrl + '" alt="" class="video-thumb" onerror="this.src=\'assets/logo.png\'">' +
                            '<span class="video-duration">' + durationStr + '</span>' +
                            badgeType +
                            progressHtml +
                        '</div>' +
                        '<div class="video-info">' +
                            '<div class="video-author-row">' +
                                '<img src="' + authorAvatar + '" alt="" class="video-author-avatar" onerror="this.src=\'assets/logo.png\'">' +
                                '<div class="video-text-col">' +
                                    '<div class="video-title">' + (video.title || 'Vídeo') + '</div>' +
                                    '<div class="video-meta-row">' +
                                        '<span class="video-author-name">👤 ' + authorName + '</span>' +
                                        dateSnippet +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                        '</div>';

                    card.addEventListener('click', function() {
                        Player.open(video, card);
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
            query = (query || '').trim();
            if (!query) return;

            var self = this;
            this.searchSeq++;
            var currentSeq = this.searchSeq;

            var container = document.getElementById('search-results-grid');
            if (container) {
                container.innerHTML = '<div class="spinner"></div>';
            }

            Api.searchVideos(query, 1, 24)
                .then(function(res) {
                    if (currentSeq !== self.searchSeq) {
                        console.log('Descartando resposta de busca desatualizada/antiga (seq #' + currentSeq + ')');
                        return;
                    }
                    self.renderVideosGrid(res.data || [], 'search-results-grid');
                })
                .catch(function(err) {
                    if (currentSeq !== self.searchSeq) return;
                    if (container) {
                        container.innerHTML = '<p style="color:#e74c3c;">Erro ao realizar busca: ' + err.message + '</p>';
                    }
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
                .then(function(res) {
                    var profile = (res && res.data) ? res.data : res;
                    if (profile && (profile.id || profile.username || profile.email)) {
                        Storage.setUser(profile);
                    }
                    self.updateAccountView();
                })
                .catch(function(err) {
                    console.log('Falha ao revalidar sessão @me:', err);
                    if (err && err.status === 401) {
                        Storage.clearAuth();
                        self.updateAccountView();
                    }
                });
        },

        updateAccountView: function() {
            var user = Storage.getUser();
            var loggedCard = document.getElementById('account-logged-in-card');
            var loginCard = document.getElementById('account-login-card');
            if (!loggedCard || !loginCard) return;

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
                    var token = null;
                    if (res && res.data && res.data.accessToken) {
                        token = res.data.accessToken;
                    } else if (res && res.data && res.data.token) {
                        token = res.data.token;
                    } else if (res && res.token) {
                        token = res.token;
                    } else if (res && res.accessToken) {
                        token = res.accessToken;
                    }

                    if (token) {
                        Storage.setToken(token);
                        // Define usuário imediato para liberar a interface e manter a sessão ativa
                        var userHandle = (email.indexOf('@') !== -1) ? email.split('@')[0] : email;
                        var initialUser = {
                            email: email,
                            username: userHandle,
                            displayName: userHandle
                        };
                        Storage.setUser(initialUser);
                        self.updateAccountView();
                        UI.showToast('Login realizado com sucesso!', 'success');

                        // Obter perfil completo em segundo plano sem quebrar a sessão se falhar
                        Api.getMe()
                            .then(function(profileRes) {
                                var profile = (profileRes && profileRes.data) ? profileRes.data : profileRes;
                                if (profile && (profile.id || profile.username || profile.email)) {
                                    Storage.setUser(profile);
                                    self.updateAccountView();
                                }
                            })
                            .catch(function(getMeErr) {
                                console.warn('Aviso: Perfil complementar não carregado, mantendo sessão ativa:', getMeErr);
                            });
                    } else if (res && res.type === 'otp') {
                        self.showModal('Autenticação em 2 Etapas', 'Sua conta requer código de autenticação 2FA. Por favor, acesse o Cinefy pelo navegador para concluir o primeiro login.');
                    } else {
                        self.showModal('Erro no Login', 'Não foi possível autenticar. Verifique suas credenciais.');
                    }
                })
                .catch(function(err) {
                    console.error('Falha no login:', err);
                    var msg = 'E-mail ou senha incorretos.';
                    if (err && err.data) {
                        if (err.data.fields) {
                            var fields = err.data.fields;
                            if (fields.email && fields.email._errors && fields.email._errors[0]) {
                                msg = fields.email._errors[0].message || msg;
                            } else if (fields.password && fields.password._errors && fields.password._errors[0]) {
                                msg = fields.password._errors[0].message || msg;
                            } else if (fields['session.platform'] && fields['session.platform']._errors && fields['session.platform']._errors[0]) {
                                msg = fields['session.platform']._errors[0].message || msg;
                            }
                        } else if (err.data.message) {
                            msg = err.data.message;
                        } else if (err.data.error) {
                            msg = err.data.error;
                        }
                    }
                    if (msg === 'Validation error' || msg === 'Invalid login or password') {
                        msg = 'E-mail ou senha incorretos. Verifique suas credenciais no Cinefy.';
                    }
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
        },

        exitApp: function() {
            console.log('Executando encerramento do Cinefy...');
            // 1. TizenBrew API
            try {
                var tb = window.tizenbrew || (window.top && window.top.tizenbrew) || (window.parent && window.parent.tizenbrew);
                if (tb) {
                    if (typeof tb.exit === 'function') { tb.exit(); return; }
                    if (typeof tb.close === 'function') { tb.close(); return; }
                    if (typeof tb.quit === 'function') { tb.quit(); return; }
                }
            } catch (e1) {}

            // 2. Native Tizen Application API (self, top, parent)
            try {
                var tizenObj = window.tizen || (window.top && window.top.tizen) || (window.parent && window.parent.tizen);
                if (tizenObj && tizenObj.application) {
                    var curApp = tizenObj.application.getCurrentApplication();
                    if (curApp && typeof curApp.exit === 'function') {
                        curApp.exit();
                        return;
                    }
                }
            } catch (e2) {}

            // 3. Tizen application hide / suspend
            try {
                var tizenObj2 = window.tizen || (window.top && window.top.tizen) || (window.parent && window.parent.tizen);
                if (tizenObj2 && tizenObj2.application) {
                    var curApp2 = tizenObj2.application.getCurrentApplication();
                    if (curApp2 && typeof curApp2.hide === 'function') {
                        curApp2.hide();
                        return;
                    }
                }
            } catch (e3) {}

            // 4. Retorno ao launcher TizenBrew pelo histórico web
            try {
                if (window.history && window.history.length > 1) {
                    window.history.back();
                    return;
                }
            } catch (e4) {}

            // 5. Fechamento padrão de janela
            try {
                window.close();
            } catch (e5) {}

            try {
                if (window.top && window.top !== window) {
                    window.top.close();
                }
            } catch (e6) {}
        }
    };

    // ==========================================
    // 8. CICLO DE VIDA DO APLICATIVO (LIFECYCLE)
    // Trata suspensão, retorno de outro app e retomada
    // ==========================================
    var Lifecycle = {
        lastActiveTime: Date.now(),
        REFRESH_INTERVAL: 10 * 60 * 1000, // 10 minutos de inatividade para recarregar home

        init: function() {
            var self = this;

            // Evento padrão W3C Page Visibility
            document.addEventListener('visibilitychange', function() {
                if (document.visibilityState === 'visible') {
                    self.onResume();
                } else {
                    self.onSuspend();
                }
            });

            // Evento Pageshow / Pagehide
            window.addEventListener('pageshow', function() {
                self.onResume();
            });

            // Eventos Tizen Application Lifecycle (se disponíveis na TV)
            if (window.tizen && window.tizen.application) {
                try {
                    var curApp = window.tizen.application.getCurrentApplication();
                    curApp.addEventListener('resume', function() {
                        self.onResume();
                    });
                    curApp.addEventListener('pause', function() {
                        self.onSuspend();
                    });
                } catch (e) {
                    console.log('Tizen app lifecycle event notice:', e);
                }
            }
        },

        onSuspend: function() {
            this.lastActiveTime = Date.now();
        },

        onResume: function() {
            var now = Date.now();
            this.lastActiveTime = now;
            console.log('Retomando Cinefy do estado adormecido...');

            // 1. Revalidar sessão com o servidor em segundo plano
            UI.checkSession();

            // 2. Se o player estiver ativo (reproduzindo vídeo), NUNCA interromper a reprodução!
            if (Player.isActive) {
                console.log('Retomando com player ativo: reprodução e tela preservadas.');
                return;
            }

            // 3. Se a tela atual for busca:
            // PRESERVAR termos digitados, resultados e foco atual!
            if (UI.currentView === 'search') {
                console.log('Retomando na tela de busca: termos, resultados e foco preservados.');
                // Invalidar requisições pendentes anteriores para descartar respostas defasadas
                UI.searchSeq++;
                return;
            }

            // 4. Se estiver em Home ou Criadores, revalidar dados sem chamadas duplicadas
            if (UI.currentView === 'home') {
                UI.loadHome(true);
            } else if (UI.currentView === 'creators') {
                UI.loadAllCreators(true);
            } else if (UI.currentView === 'channel-detail' && UI.selectedChannel) {
                UI.loadChannelVideos(UI.selectedChannel.id, 'recent');
            }
        }
    };

    // ==========================================
    // 9. INICIALIZAÇÃO GERAL DO APLICATIVO
    // ==========================================
    function bootstrap() {
        Nav.init();
        Player.init();
        Keyboard.init();
        UI.init();
        Lifecycle.init();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(bootstrap, 0);
    } else {
        window.addEventListener('DOMContentLoaded', bootstrap);
    }

    // ==========================================
    // 10. EXPOSIÇÃO DE MÓDULOS (Compatibilidade e Testes)
    // ==========================================
    var Cinefy = {
        CONFIG: CONFIG,
        Storage: Storage,
        Api: Api,
        Nav: Nav,
        Player: Player,
        Keyboard: Keyboard,
        UI: UI,
        Lifecycle: Lifecycle
    };

    if (typeof window !== 'undefined') {
        window.Cinefy = Cinefy;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Cinefy;
    }

})();
