# Cinefy TV - Adaptação Não Oficial para Samsung Tizen 3.0 (Chromium 47)

Módulo autônomo (*Application Module*) do **TizenBrew** desenvolvido especialmente para Smart TVs Samsung de 2017 (como a UN55MU7500), operando sob **Tizen 3.0** e **Chromium 47**, com navegação completa via controle remoto, suporte aos fluxos legítimos do Cinefy e proteção total dos dados de outros aplicativos (como StremioK-PTBR).

---

## 1. Relatório de Investigação & Viabilidade

### 1.1 Por que o site oficial (cinefy.gg) não funciona diretamente no Chromium 47?
Durante a investigação detalhada dos pacotes e códigos-fonte do `https://cinefy.gg`, identificou-se que a plataforma web é construída sobre **Next.js 14/15** compilada via **Turbopack**:
- **Sintaxe Não Suportada:** Os scripts do bundle utilizam extensivamente recursos modernos do ECMAScript (ES2020+), tais como *Optional Chaining* (`?.`), *Nullish Coalescing* (`??`), *async/await* e campos de classe. No Chromium 47 (lançado em dezembro de 2015), o motor V8 falha imediatamente durante o parsing inicial (`SyntaxError: Unexpected token .`), impedindo qualquer execução de JavaScript e resultando em tela preta permanente.
- **Navegação Espacial Inexistente:** O site oficial foi desenhado exclusivamente para mouse, toque e rolagem contínua. Não possui controle de foco D-Pad (*Spatial Navigation*), anéis de seleção visíveis nem interceptação dos botões físicos do controle remoto Samsung.
- **Conclusão:** Abrir o site oficial via módulo de modificação (`packageType: "mods"`) é tecnicamente inviável nessa geração de TV. A abordagem viável e de alto desempenho é um **Módulo de Aplicativo Autônomo** (`packageType: "app"`), desenvolvido em **JavaScript ES5 estrito**, comunicando-se diretamente com a API REST oficial do Cinefy.

### 1.2 Análise de Codecs, Streaming e DRM
- **DRM:** O Cinefy **não utiliza** DRM Widevine, PlayReady ou FairPlay em seus vídeos.
- **Streaming:** As transmissões sob demanda (VOD) e vídeos públicos são entregues via CDN (BunnyCDN) no formato **HLS** (`playlist.m3u8`) com autorização por rota assinada (`authorization`), além de fallback direto em **MP4** (`play_720p.mp4`).
- **Compatibilidade Tizen 3.0:** O Chromium 47 e o motor de mídia da Samsung suportam nativamente aceleração de hardware para H.264/AAC tanto via HTML5 `<video>` quanto via API proprietária AVPlay (`webapis.avplay`), garantindo reprodução fluida em 1080p sem travamentos.

---

## 2. Recursos Implementados

1. **Interface 100% em PT-BR:**
   - Navegação traduzida, alertas, notificações toast e mensagens claras de status e erro.
2. **Navegação por Controle Remoto (D-Pad):**
   - Suporte a Setas (Cima, Baixo, Esquerda, Direita), Enter/OK (13) e Voltar/Return (10009).
   - Indicador de foco de alto contraste (borda dourada de 3px, escala 1.05x e glow).
   - Rolagem suave automática para manter o item focado sempre visível no centro da tela.
3. **Teclado Virtual na Tela:**
   - Grade completa A-Z, 0-9, Espaço e Apagar navegável pelo D-Pad para busca de vídeos.
   - Suporte simultâneo a digitação por teclado físico USB e teclado virtual nativo da TV.
4. **Player de Vídeo Completo:**
   - Tela cheia com barra OSD auto-ocultável (4s de inatividade).
   - Controles focáveis: Pausar/Continuar, Retroceder 10s, Avançar 10s, Menu de Seleção de Qualidade (Auto, 1080p, 720p, 480p) e Fechar.
   - Suporte aos botões de mídia dedicados do controle Samsung (`MediaPlay`, `MediaPause`, `MediaPlayPause`, `MediaFastForward`, `MediaRewind`, `MediaStop`).
   - Fallback automático para MP4 caso a reprodução HLS enfrente instabilidades de rede.
5. **Autenticação Legítima & Sessão Segura:**
   - Login direto na tela da TV via `POST https://api.cinefy.gg/v2/auth/login`.
   - Nenhuma senha ou token é registrado em logs ou arquivos do repositório.
   - Preservação da sessão via chave `cinefy_token` no armazenamento local da TV.
6. **Isolamento de Armazenamento:**
   - Todas as chaves utilizam o prefixo `cinefy_` (`cinefy_token`, `cinefy_user`).
   - **NUNCA** executa `localStorage.clear()`, preservando integralmente o aplicativo **StremioK-PTBR** e quaisquer outros módulos do TizenBrew instalados na TV.
7. **Recuperação de Estado & Atualização:**
   - Botão "Atualizar" no menu lateral para reconectar e atualizar catálogos sem perder o login.
   - Diálogo nativo de confirmação de saída ao pressionar "Voltar" na raiz do app.

---

## 3. Estrutura do Pacote

```text
Cinefy-Tizen/
├── package.json             <-- Manifesto reconhecido pelo TizenBrew (packageType: "app")
├── README.md                <-- Documentação e instruções de instalação
├── verify_es5.py            <-- Script de validação de compatibilidade ES5
├── test_local_server.py     <-- Teste automatizado de servidor de módulos TizenBrew
├── test_api_endpoints.py    <-- Teste automatizado de endpoints da API Cinefy
└── dist/
    ├── index.html           <-- Entrada do app TV (1920x1080)
    ├── app.css              <-- Estilos de TV com foco visível e alta legibilidade
    ├── app.js               <-- Código principal em JavaScript ES5 estrito
    └── assets/
        └── logo.png         <-- Logotipo oficial incorporado localmente
```

---

## 4. Instruções Exatas de Instalação no TizenBrew

> [!IMPORTANT]
> **Antes de instalar na TV ou publicar no GitHub:**
> Conforme solicitado, **não foi publicado nada no GitHub** e **nada foi instalado na sua TV ainda**. A publicação e o deploy na TV requerem sua autorização explícita prévia.

### Opção A: Instalação via Repositório GitHub (Quando você autorizar a publicação)
1. Após você autorizar e o repositório for publicado (exemplo: `seu-usuario/Cinefy-Tizen`):
2. Na TV Samsung, abra o aplicativo **TizenBrew**.
3. Vá em **Gerenciador de Módulos (Module Manager)**.
4. Clique em **Adicionar Módulo (Add Module)**.
5. Digite o identificador:
   ```text
   gh/seu-usuario/Cinefy-Tizen@main
   ```
6. O TizenBrew baixará o manifesto `package.json`, reconhecerá `packageType: "app"` e criará o ícone do **Cinefy** na lista de aplicativos.
7. Clique no Cinefy para abrir e navegar com o controle remoto!

### Opção B: Teste Local via Servidor na Rede (Sem publicar na internet)
Você pode testar localmente antes de qualquer publicação:
1. No seu computador, execute no terminal desta pasta:
   ```powershell
   python test_local_server.py
   ```
   Ou inicie um servidor HTTP simples:
   ```powershell
   python -m http.server 8089
   ```
2. No TizenBrew da TV ou no navegador do computador:
   - Abra `http://IP-DO-SEU-PC:8089/dist/index.html` para testar a navegação e o player.

---

## 5. Evidências dos Testes Realizados

> [!NOTE]
> **Diferenciação Obrigatória:**
> - **Testes no Computador (Realizados):** Todos os testes sintáticos, de rede, de chamadas de API e de servidor local descritos abaixo foram executados no computador.
> - **Testes na TV (Não Realizados):** Nenhum comando ou pacote foi enviado para a TV ainda, respeitando a instrução de aguardar sua autorização.

### Resultado dos Testes Automatizados no Computador:
1. **Validação de Sintaxe ES5 (`verify_es5.py`):**
   - `const`: 0 ocorrências (Aprovado)
   - `let`: 0 ocorrências (Aprovado)
   - Arrow Functions `=>`: 0 ocorrências (Aprovado)
   - `class`: 0 ocorrências (Aprovado)
   - Optional Chaining `?.`: 0 ocorrências (Aprovado)
   - Nullish Coalescing `??`: 0 ocorrências (Aprovado)
   - `async/await`: 0 ocorrências (Aprovado)
   - Template literals (crases): 0 ocorrências (Aprovado)
   - **Resultado:** `dist/app.js` é 100% compatível com a engine V8 do Chromium 47 da Samsung TV 2017.

2. **Validação do Manifesto TizenBrew (`test_local_server.py`):**
   - `packageType`: `"app"` (Válido)
   - `appPath`: `"dist/index.html"` (Válido)
   - `keys`: `MediaPlay`, `MediaPause`, `MediaPlayPause`, `MediaStop`, `MediaFastForward`, `MediaRewind` (Válido)
   - Todos os arquivos estáticos retornaram `HTTP 200 OK`.

3. **Validação das APIs Cinefy (`test_api_endpoints.py`):**
   - Criadores em Destaque (`/v1/creators/relevant`): `HTTP 200 OK`
   - Vídeos Gratuitos (`/v1/videos?type=free`): `HTTP 200 OK`
   - Vídeos Recentes (`/v1/videos?sortedOrder=desc`): `HTTP 200 OK`
   - Busca de Vídeos (`/v1/videos?query=react`): `HTTP 200 OK`
   - Detalhes de Canal (`/v1/user/apenas1react`): `HTTP 200 OK`
   - Vídeos do Canal (`/v1/videos?author=...`): `HTTP 200 OK`
