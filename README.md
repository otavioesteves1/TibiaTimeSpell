# TibiaTimeSpell

App em Electron que avisa quando está na hora de usar cada magia de novo no Tibia.

![plataforma](https://img.shields.io/badge/plataforma-Windows-2b2b2b) ![electron](https://img.shields.io/badge/Electron-43-9d7bff) ![licença](https://img.shields.io/badge/licen%C3%A7a-MIT-9d7bff)

## O problema que resolve

No Tibia tem magias que precisam ser usadas de tempos em tempos (ex.: apertar F10 a cada
40 segundos). Este app cuida da contagem pra você:

- **Contagem regressiva** para cada magia, em um overlay por cima do jogo
- **Bipe sonoro** em 5, 3 e 1 segundos antes de zerar
- Quando zera, fica piscando **AGORA!** **sem parar, até você usar a magia** — não reseta sozinho
- **É a tecla que reinicia**: apertou a tecla da magia (em qualquer janela, inclusive dentro do
  jogo), a contagem recomeça na hora — sem roubar a tecla do jogo
- **Imagem por magia** (PNG/JPG/GIF animado, arquivo ou Ctrl+V) ao lado da tecla
- **Tamanhos**: ícone (só a imagem com a borda piscando, de 12 a 96px), mini, pequeno, médio, grande
- **Organização**: em coluna, lado a lado ou **livre** (cada magia numa janelinha própria,
  arrastável individualmente)
- **Opacidade ajustável**: discreto enquanto conta, acende e pisca na hora de usar
- **Posição livre**: arraste o overlay pra qualquer canto da tela; a posição fica salva
- **Tudo salva sozinho** — não existe botão de salvar

O overlay é *click-through*: o mouse atravessa ele, não atrapalha a gameplay.

## Instalar

### Versão portátil (recomendado)

Baixe o `.zip` mais recente em [Releases](../../releases), extraia em qualquer pasta e execute
`TibiaTimeSpell.exe`. Não precisa instalar nada.

### Rodando do código

```bash
npm install
npm start
```

Para gerar a versão portátil:

```bash
npm run build
```

O resultado sai em `dist/TibiaTimeSpell-win32-x64/`.

## Como usar

1. Clique em **Adicionar magia** e preencha nome, tecla, tempo em segundos e cor.
2. Clique no quadradinho da coluna **Img** para escolher uma imagem/GIF, ou selecione a linha e
   aperte **Ctrl+V** para colar.
3. Ligue o interruptor da magia e vá jogar — na primeira vez que apertar a tecla no jogo, a
   contagem sincroniza sozinha.
4. Ajuste tamanho, organização, posição e opacidade na seção **Overlay**. Use
   **Arrastar overlay** para posicionar onde quiser (inclusive no meio da tela).
5. Minimize a janela de configuração enquanto joga. Se fechar, o app encerra.

## Observações

- O jogo deve estar em **janela** ou **tela cheia em janela**. Em fullscreen exclusivo (modo
  antigo) nenhum programa consegue desenhar por cima.
- As configurações ficam em `%APPDATA%/TibiaTimeSpell/config.json`, e as imagens em
  `%APPDATA%/TibiaTimeSpell/images/`.
- A detecção de teclas usa um hook global apenas de leitura (`uiohook-napi`): o app **escuta** a
  tecla, mas não a intercepta — o jogo recebe normalmente.

## Licença

MIT
