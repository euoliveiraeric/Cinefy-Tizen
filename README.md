# Cinefy TV - Módulo TizenBrew para Samsung Smart TV (Tizen 3.0 / Chromium 47)

Módulo autônomo (*Application Module*) para **TizenBrew**, projetado para TVs Samsung de 2017 (como a UN55MU7500), operando sob **Tizen 3.0** e **Chromium 47**, com navegação espacial via D-Pad (controle remoto), suporte ao fluxo legítimo de autenticação do Cinefy e proteção contra conflito de dados com outros módulos (como o StremioK-PTBR).

---

## 1. Relatório Técnico de Compatibilidade & Limitações

### 1.1 Incompatibilidade do Site Oficial (cinefy.gg) no Chromium 47
A versão web do `https://cinefy.gg` utiliza Next.js (App Router) compilado via Turbopack com dependências em ECMAScript moderno (ES2020+):
- **Sintaxe Não Suportada:** Uso de *Optional Chaining* (`?.`), *Nullish Coalescing* (`??`), *class fields*, *destructuring* e *async/await*. O motor V8 do Chromium 47 (lançado no final de 2015) falha no parse inicial (`SyntaxError: Unexpected token .`), resultando em tela preta imediata.
- **Navegação Espacial Inexistente:** O site oficial depende de ponteiro de mouse ou toque. Não há anel de foco nem captura de teclas do controle remoto da TV.
- **Conclusão:** É inviável abrir o site oficial diretamente via módulo de script (`packageType: "mods"`). A solução técnica viável é este módulo autônomo (`packageType: "app"`) em **JavaScript ES5 estrito**, comunicando-se com a API REST do Cinefy.

### 1.2 Mecanismo de Player & Realidade de Reprodução
- **Implementação do Player:** O player foi desenvolvido estritamente sobre a tag padrão HTML5 `<video>`. **Não há suporte nem implementação de AVPlay (`webapis.avplay`)** no momento. Alegações anteriores de uso de AVPlay eram imprecisas.
- **Streaming & CDN (BunnyCDN):**
  - O Cinefy utiliza o serviço de entrega BunnyCDN. A geração da URL de streaming (`playlist.m3u8` ou fallback `play_720p.mp4`) depende de um token de autorização assinado pelo servidor (`playback.authorization`).
  - Sem sessão autenticada ou autorização do servidor, requisições diretas à CDN retornam `HTTP 403 Forbidden` ou `HTTP 428 Precondition Required`.
  - O catálogo público (HTTP 200) confirma a listagem de vídeos, mas **não garante reprodução sem autenticação**.
- **DRM & Resolução:**
  - O serviço não utiliza DRM Widevine/PlayReady nos testes observados, mas adota controle de acesso estrito por URLs assinadas (Token Authentication) e restrição de rota para conteúdos de canais (VOD).
  - Não é possível declarar "reprodução fluida em 1080p garantida" antes de testes de desempenho no processador real da TV (UN55MU7500).

### 1.3 Armazenamento e Convivência com StremioK-PTBR
- **Compartilhamento de Origem:** No TizenBrew, todos os módulos web rodam sob o mesmo contexto de origem web (`file://` ou `localhost`). O `localStorage` é compartilhado entre todos os módulos (quota global aproximada de 5 MB).
- **Prefixação de Chaves:** O Cinefy utiliza exclusivamente o prefixo `cinefy_` (`cinefy_token`, `cinefy_user`). Isso previne colisões de chaves com o `StremioK-PTBR` e outros módulos.
- **Segurança & Limpeza:** `localStorage` **não é um cofre criptografado**; tokens residem em texto plano no storage do navegador. O aplicativo **nunca executa `localStorage.clear()`**, garantindo que as configurações e addons do StremioK permaneçam intocados.
- **Tratamento de Quota:** Exceções do tipo `QuotaExceededError` são capturadas e tratadas sem provocar quebra da interface.

---

## 2. Status dos Recursos (Quadro de Rastreabilidade)

| Recurso | Status | Onde foi Validado |
| :--- | :---: | :--- |
| **Sintaxe JavaScript ES5 Estrita** | Implementado | Testado no Computador via AST Acorn (`verify_es5.js`) |
| **CSS compatível com Chromium 47** | Implementado | Testado no Computador (sem CSS Variables, sem gap, flex com prefixos) |
| **Navegação D-Pad (Setas, OK, Voltar)** | Implementado | Testado no Computador (simulação D-Pad e Browser MCP) |
| **Teclado Virtual na Tela (Busca)** | Implementado | Testado no Computador (digitação, busca e IME) |
| **Preservação do StremioK-PTBR** | Implementado | Testado no Computador (testes automatizados em `test_suite.js`) |
| **Tratamento de Quota / Exceções** | Implementado | Testado no Computador (captura de `QuotaExceededError`) |
| **Player HTML5 (Play, Pause, Seek)** | Implementado | Testado no Computador (máquina de estados em `test_suite.js`) |
| **Seleção de Qualidade (HLS / MP4)** | Implementado | Testado no Computador (adaptação de source) |
| **Ciclo de Vida (Dormência & Retomada)** | Implementado | Testado no Computador (`visibilitychange`, `pageshow`, preserva player ativo) |
| **Tratamento de Sessão Expirada (401)** | Implementado | Testado no Computador (limpeza limpa e aviso ao usuário) |
| **Reprodução Real na TV UN55MU7500** | **Pendente** | **Ainda NÃO testado na TV real** |
| **Aceleração / AVPlay proprietário** | **Pendente** | Não implementado (mantido HTML5 `<video>`) |
| **Desempenho de Vídeo 1080p na TV** | **Pendente** | Requer medição física na TV Samsung |

---

## 3. Estrutura do Projeto

```text
Cinefy-Tizen/
├── package.json             <-- Manifesto oficial do módulo TizenBrew (packageType: "app")
├── README.md                <-- Documentação técnica e instruções
├── verify_es5.js            <-- Análise sintática AST ECMAScript 5 real via Acorn
├── verify_es5.py            <-- Wrapper Python para execução do analisador AST
├── test_suite.js            <-- Bateria de testes de Storage, Player e Ciclo de Vida
├── test_api_endpoints.py    <-- Testes de conectividade com a API REST do Cinefy
├── test_local_server.py     <-- Teste de carregamento estático e integridade do manifesto
└── dist/
    ├── index.html           <-- Interface TV 1080p
    ├── app.css              <-- Estilos sem recursos incompatíveis com Chromium 47
    ├── app.js               <-- Código JavaScript ES5 validado via AST
    └── assets/
        └── logo.png         <-- Logotipo oficial embutido localmente
```

---

## 4. Instruções de Instalação no TizenBrew

> [!IMPORTANT]
> **Atenção aos identificadores no TizenBrew:**
> - O repositório público já existe em: [https://github.com/srwayne15-bot/Cinefy-Tizen](https://github.com/srwayne15-bot/Cinefy-Tizen).
> - Ao adicionar pelo campo **GitHub** da interface do TizenBrew, digite apenas `usuario/repositorio@branch` (o TizenBrew adiciona o prefixo `gh/` internamente). Não digite `gh/` duas vezes.

### Método 1: Instalação Direta via TizenBrew na TV
1. Na TV Samsung UN55MU7500, abra o aplicativo **TizenBrew**.
2. Vá em **Gerenciador de Módulos (Module Manager)**.
3. Clique em **Adicionar Módulo (+)** e selecione a opção de repositório **GitHub**.
4. No campo de texto, insira:
   ```text
   srwayne15-bot/Cinefy-Tizen@main
   ```
   *(Nota: Se o seu TizenBrew tiver campo livre genérico que não seja específico do GitHub, o identificador completo interno é `gh/srwayne15-bot/Cinefy-Tizen@main`)*.
5. Confirme. O TizenBrew baixará o `package.json` via jsDelivr, reconhecerá o aplicativo e adicionará o **Cinefy** à lista.

### Método 2: Teste Local via Servidor na Rede Local (Sem Internet)
Caso prefira testar primeiro através da sua rede local:
1. No computador, abra o PowerShell na pasta do projeto e inicie o servidor:
   ```powershell
   python test_local_server.py
   ```
2. No navegador do computador ou no navegador da TV, abra:
   ```text
   http://IP_DO_COMPUTADOR:8089/dist/index.html
   ```

---

## 5. Roteiro Sugerido para o Primeiro Teste na TV

1. **Passo 1 (Inicialização e Foco):** Abra o Cinefy no TizenBrew. Verifique se o item "Início" recebe o foco dourado e se as setas do controle navegam suavemente pelo menu lateral.
2. **Passo 2 (Catálogo e Imagens):** Verifique se os carrosséis de criadores e vídeos carregam sem travar a interface da TV.
3. **Passo 3 (Teste de Vídeo Gratuito sem Login):** No carrossel "Vídeos Gratuitos", selecione um dos conteúdos públicos com a tecla Enter/OK.
   - Observe se o player abre em tela cheia com a barra OSD.
   - Se os segmentos de vídeo carregarem: teste Pausa, Play e Avanço (+10s).
   - Se o servidor exigir token assinado: verifique se o modal em PT-BR explica a exigência de login com foco automático no botão OK.
4. **Passo 4 (Busca com Teclado Virtual):** Acesse a aba "Buscar", navegue pelas letras do teclado virtual pelo D-Pad e digite o nome de um criador (ex: "react"). Pressione "Buscar 🔍".
5. **Passo 5 (Preservação de Dados):** Saia do Cinefy, abra o **StremioK-PTBR** e confirme que seus addons, histórico e login continuam perfeitamente intactos.
