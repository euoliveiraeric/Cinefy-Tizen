# Cinefy TV - Módulo TizenBrew para Samsung Smart TV (Tizen 3.0 / Chromium 47)

Módulo autônomo (*Application Module*) para **TizenBrew**, projetado para TVs Samsung de 2017 (como a UN55MU7500), operando sob **Tizen 3.0** e **Chromium 47**, com navegação espacial via D-Pad (controle remoto), suporte ao fluxo legítimo de autenticação do Cinefy e proteção contra conflito de chaves com outros módulos instalados (como o StremioK-PTBR).

---

## 1. Relatório Técnico de Compatibilidade, Armazenamento & Streaming

### 1.1 Incompatibilidade do Site Oficial (cinefy.gg) no Chromium 47
A versão web do `https://cinefy.gg` utiliza Next.js (App Router) compilado via Turbopack com dependências em ECMAScript moderno (ES2020+):
- **Sintaxe Não Suportada:** Uso extensivo de *Optional Chaining* (`?.`), *Nullish Coalescing* (`??`), *class fields*, *destructuring* e *async/await*. O motor V8 do Chromium 47 (lançado no final de 2015) falha no parse inicial (`SyntaxError: Unexpected token .`), resultando em tela preta imediata.
- **Navegação Espacial Inexistente:** O site oficial depende de ponteiro de mouse ou toque. Não há anel de foco nem captura de teclas do controle remoto da TV.
- **Conclusão:** É inviável abrir o site oficial diretamente via módulo de modificação (`packageType: "mods"`). A solução técnica viável é este módulo autônomo (`packageType: "app"`) em **JavaScript ES5 estrito**, comunicando-se com a API REST do Cinefy.

### 1.2 Mecanismo de Player, Qualidades & Streaming
- **Implementação do Player:** O player opera estritamente sobre a tag padrão HTML5 `<video>`. **Não há suporte nem implementação de AVPlay (`webapis.avplay`)**. O módulo utiliza HTML5 nativo com decodificação direta suportada pelo Chromium 47 da Samsung.
- **Seleção Efetiva de Qualidade (Sem Botões Fictícios):**
  - O player HTML5 nativo no Chromium 47 delega o controle de taxa de bits e variantes ABR diretamente ao subsistema de mídia da TV ao carregar o manifesto mestre HLS (`playlist.m3u8`).
  - O elemento padrão `<video>` não possui API JavaScript nativa para forçar variantes HLS sem bibliotecas externas (MSE). Portanto, **o menu de qualidade oferece apenas opções efetivas e reais**:
    - **`Automático (HLS Adaptativo)`**: carrega a playlist mestre oficial, deixando o hardware negociar a melhor variante.
    - **`MP4 720p (Fallback direto CDN)`**: oferecido **estritamente quando a API retornar `stream.hasMP4Fallback === true`**.
  - **Eliminação de Placebos:** Foram eliminados botões nominais (ex: botões "1080p", "720p") que apontavam para o mesmo arquivo mestre sem trocar de variante.
- **Resolução Disponível vs. Resolução Efetiva:**
  - O aplicativo não assume nem garante prioridade arbitrária de 1080p.
  - A interface diferencia explicitamente:
    - **Resoluções disponíveis no catálogo** (metadados reportados pela API em `stream.resolutions`).
    - **Resolução efetivamente reproduzida** (lida dinamicamente do hardware via `video.videoWidth` e `video.videoHeight` após o evento `loadedmetadata`).
- **Verificação do Contrato Real da API Cinefy (`hasMP4Fallback`):**
  - Consultas empíricas à API oficial (`https://api.cinefy.gg/v1/videos`) comprovaram que o objeto `stream` retorna a propriedade `hasMP4Fallback`, porém seu valor é `false` nos vídeos do catálogo público (ex: vídeo `LwRXPS1DeCIca`).
  - Como `hasMP4Fallback` é `false`, os servidores BunnyCDN não geram `play_720p.mp4`. O player valida esse contrato e impede tentativas de requisição para URLs inexistentes.
- **Transparência em Caso de Falha:**
  - Se o stream HLS falhar durante a reprodução, o aplicativo **não faz downgrade silencioso**. Ele notifica o usuário via diálogo modal honesto, informando que a CDN oferece um formato alternativo MP4 720p (caso disponível) e permitindo escolha explícita.
- **CDN & Tokens Assinados (BunnyCDN):**
  - A reprodução de vídeos depende de autorização assinada pelo servidor (`playback.authorization`).
  - Sem sessão autenticada ou autorização do servidor, requisições diretas à CDN retornam `HTTP 403 Forbidden` ou `HTTP 428 Precondition Required`.
  - Respostas HTTP 200 nas listagens da API confirmam apenas metadados no catálogo, **não provando autorização nem decodificação de vídeo**.

### 1.3 Armazenamento Local Compartilhado no TizenBrew
- **Origem e Armazenamento Compartilhados:** No ecossistema do TizenBrew, todos os módulos web rodam sob o mesmo contexto de origem web (`file://` ou `localhost`). O `localStorage` é compartilhado entre todos os módulos ativos (incluindo StremioK-PTBR e Cinefy). Não existe uma quota de armazenamento universal pré-fixada: ela varia conforme a versão do Tizen e o navegador da TV.
- **Convenção de Prefixos:** Para evitar colisões e sobrescritas acidentais de chaves de outros módulos, o Cinefy armazena exclusivamente chaves iniciadas pelo prefixo `cinefy_` (ex: `cinefy_token`, `cinefy_user`). **Isso é uma convenção de namespace, e NÃO uma barreira de segurança, sandbox de isolamento ou cofre criptografado.**
- **Tratamento de Quota Excedida:** Caso o navegador da TV rejeite novas gravações com `QuotaExceededError`, o cliente Cinefy captura a exceção, mantém os dados em memória volátil durante a sessão e informa o usuário na interface, evitando falhas catastróficas ou corrupção de dados de outros módulos.
- **Limpeza de Sessão:** Ao realizar logout, o Cinefy remove exclusivamente as suas próprias chaves prefixadas (`cinefy_*`), **nunca executando `localStorage.clear()`**.

### 1.4 Estratégia de Cache e Atualização do Módulo
- Para evitar que o Chromium 47 retenha arquivos em cache local desatualizados após atualizações no TizenBrew:
  - Tags `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">` e `<meta http-equiv="Pragma" content="no-cache">` foram incluídas no `dist/index.html`.
  - Os recursos estáticos utilizam versionamento por parâmetro de URL (`app.css?v=1.1.0` e `app.js?v=1.1.0`).
  - O rodapé do aplicativo exibe visualmente a versão ativa (`Cinefy TV v1.3.0 (Tizen 3.0 Edition)`) para confirmação direta na tela da TV.

---

## 2. Diferenciação dos Níveis de Teste & Status dos Recursos

É fundamental diferenciar o que foi comprovado por testes automatizados do que requer teste físico na TV:

1. **Simulação Automatizada em Node.js:** Execução das 1.700+ linhas do código real de `dist/app.js` em ambiente DOM/Browser mockado. Valida manipulação de estado, listeners, prefixos de storage, concorrência, ciclo de vida e D-Pad.
2. **Reprodução Efetiva no Computador:** Validação das rotas da API REST do Cinefy e verificação de cabeçalhos da BunnyCDN via HTTP. *(Nota: Atribuir `video.src` ou obter HTTP 200 no catálogo não comprova decodificação de vídeo na TV)*.
3. **Teste Físico na Smart TV (Samsung UN55MU7500):** O único meio de comprovar a renderização gráfica real do Chromium 47, aceleração de hardware H.264/AAC, latência do D-Pad físico e resposta ao modo de suspensão/standby do Tizen OS.

| Recurso | Status | Nível de Validação Atual |
| :--- | :---: | :--- |
| **Sintaxe JavaScript ES5 Estrita** | Implementado | Testado no Computador (100% aprovado via AST Acorn `ecmaVersion: 5`) |
| **CSS compatível com Chromium 47** | Implementado | Testado no Computador (sem CSS Variables, sem flex gap) |
| **Execução do Código Real nos Testes** | Implementado | Testado via `test_suite.js` (executa `dist/app.js` real - 51 testes aprovados) |
| **Scrub na Linha do Tempo c/ Aceleração** | Implementado | Testado via D-Pad (10s -> 30s -> 60s -> 120s debounced) |
| **Retomada de Reprodução (Watch Progress)** | Implementado | Testado no Storage local e sincronização com API Cinefy |
| **Preservação de Foco no Retorno** | Implementado | Testado no Computador (foco mantido no card do episódio ao fechar player) |
| **Data Relativa de Postagem ("há X dias")** | Implementado | Testado no Computador (cálculo de datas relativas para catálogo) |
| **Navegação D-Pad (Setas, OK, Voltar)** | Implementado | Testado no Computador (simulação D-Pad e Browser MCP) |
| **Preservação de Módulos (StremioK)** | Implementado | Testado no Computador (apenas chaves `cinefy_` manipuladas) |
| **Tratamento de Quota / Exceções** | Implementado | Testado no Computador (captura graciosa de `QuotaExceededError` com fallback) |
| **Player HTML5 (HLS Adaptativo Efetivo)** | Implementado | Testado no Computador (HLS master playlist, detecção de resolução efetiva e sem botões fictícios) |
| **Sem Redução Silenciosa de Qualidade** | Implementado | Testado no Computador (modal de escolha acionado quando HLS falha) |
| **Ciclo de Vida (Dormência & Retomada)** | Implementado | Testado no Computador (revalida dados sem duplicidade; preserva busca e player) |
| **Concorrência e Descarte de Respostas**| Implementado | Testado no Computador (respostas antigas de busca são descartadas por sequência) |
| **Identificação Visual de Versão (v1.1.0)**| Implementado | Testado no Computador (exibição no HTML e cabeçalhos anti-cache) |
| **Reprodução Real na TV UN55MU7500** | **Pendente** | **Ainda NÃO testado na TV real** |
| **Desempenho de Vídeo 1080p na TV** | **Pendente** | Requer medição física na TV Samsung |

---

## 3. Estrutura do Projeto

```text
Cinefy-Tizen/
├── package.json             <-- Manifesto oficial do módulo TizenBrew v1.1.0 (packageType: "app")
├── README.md                <-- Documentação técnica, status e instruções
├── verify_es5.js            <-- Análise sintática AST ECMAScript 5 real via Acorn
├── verify_es5.py            <-- Wrapper Python para execução do analisador AST
├── test_suite.js            <-- Bateria de testes que executa o código REAL de dist/app.js
├── test_api_endpoints.py    <-- Testes de conectividade com a API REST do Cinefy
├── test_local_server.py     <-- Servidor HTTP local para validação de entrega de pacotes
└── dist/
    ├── index.html           <-- Interface TV 1080p com cabeçalhos anti-cache e versão 1.1.0
    ├── app.css              <-- Estilos sem recursos incompatíveis com Chromium 47
    ├── app.js               <-- Código JavaScript ES5 validado via AST (módulos exportados)
    └── assets/
        └── logo.png         <-- Logotipo oficial embutido localmente
```

---

## 4. Instruções de Instalação no TizenBrew

> [!IMPORTANT]
> **Identificador correto no TizenBrew:**
> Ao adicionar pelo campo **GitHub** da interface do TizenBrew, digite apenas:
> ```text
> srwayne15-bot/Cinefy-Tizen@main
> ```
> *(O TizenBrew adiciona o prefixo `gh/` internamente. Não digite `gh/` duas vezes no campo GitHub)*.

### Passo a Passo na TV Samsung UN55MU7500:
1. Abra o **TizenBrew** na sua TV.
2. Vá em **Gerenciador de Módulos (Module Manager)**.
3. Clique em **Adicionar Módulo (+)** e selecione a opção **GitHub**.
4. Digite: `srwayne15-bot/Cinefy-Tizen@main`.
5. Confirme. O TizenBrew baixará o pacote e adicionará o **Cinefy** à lista.
6. Ao abrir o Cinefy na TV, confira no canto inferior esquerdo se consta:
   `Cinefy TV v1.3.0 (Tizen 3.0 Edition)`.
