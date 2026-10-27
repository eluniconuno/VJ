# VYXO Studio

Plataforma de VJ ao vivo no navegador, organizada como o Resolume Arena: **camadas Ã— clips**, efeitos encadeados, crossfader A/B e saÃ­da para projetor. Tudo roda na GPU (WebGL2 / Three.js).

## Rodar

```bash
npm install
npm run dev       # neste PC: abra http://127.0.0.1:3000
npm run dev:rede  # pela rede (outro PC/celular): HTTPS, abra o https://<IP>:3000 que aparecer
```

Use Chrome ou Edge (precisa de WebGL2, Web Audio e, para controladores, Web MIDI).

## Conceitos

| | |
|---|---|
| **Clip** | Um gerador (shader) + paleta + parÃ¢metros + cadeia de efeitos. |
| **Camada** | Uma linha da grade. Toca um clip por vez, com fade configurÃ¡vel, opacidade, modo de blend, solo/bypass e grupo A/B do crossfader. |
| **Coluna** | Dispara o clip daquela coluna em todas as camadas (teclas 1â€“8). |
| **Master** | ResoluÃ§Ã£o da composiÃ§Ã£o, bloom, reatividade global e efeitos finais. |

### Geradores

- **PsicodÃ©lico**: Sonho LÃ­quido (domain warping), TÃºnel CaleidoscÃ³pico, Fractal Julia, Espiral HipnÃ³tica, CÃ©lulas Pulsantes, PadrÃµes Chladni, Horizonte Neon.
- **Escultura** (raymarching 3D): Giroide, Mandelbulb, Metal LÃ­quido, Fita Torcida, Cristal Fractal.
- **Escultor de PartÃ­culas**: o escultor da versÃ£o antiga, agora na GPU com ~147 mil partÃ­culas (veja abaixo).
- **Overlay**: OsciloscÃ³pio, Mandala Espectral, Geometria na Batida, Texto (use blend *Somar* ou *Tela*).
- **MÃ­dia**: imagem, vÃ­deo ou webcam.

### Escultor de PartÃ­culas

Tudo que existia no escultor antigo, organizado em seÃ§Ãµes no inspetor:

- **Forma**: 28 formas (esfera, toro, monolito, DNA, Voronoi, cubo, pirÃ¢mide, coraÃ§Ã£o, MÃ¶bius, superfÃ³rmula, atrator de Lorenz, Mandelbulb, mandalaâ€¦), Forma A + Forma B com 5 modos de fusÃ£o (interpolar, somar, subtrair, interseÃ§Ã£o, eixo cruzado). Trocar de forma faz as partÃ­culas viajarem com elasticidade.
- **MatemÃ¡tica**: Math Aâ€“D. Os rÃ³tulos mudam conforme a forma (ex.: Ïƒ, Ï, Î² no Lorenz) e os valores sugeridos sÃ£o aplicados ao escolher a forma.
- **Escultura**: escala X/Y/Z, distorÃ§Ã£o senoidal com frequÃªncia X/Y/Z, modulaÃ§Ã£o harmÃ´nica, torÃ§Ã£o, simetria (2x, 4x, 8x), potÃªncia, ruÃ­do geomÃ©trico, caos.
- **RuÃ­do e Ã¡udio**: os 14 modos antigos (forma de onda, pulso, vÃ³rtice, ondulaÃ§Ã£o, harmÃ´nicos, rasgo de malha, datamosh, bit crush, torÃ§Ã£o, curvar, esticar, sentimentalâ€¦).
- **Material**: Pontos, Nuvem (cloud points), Pixels, Estrelas, Linhas, Linhas em espiral, Wireframe, MaciÃ§o (superfÃ­cie sÃ³lida iluminada).
- **CÃ¢mera e interaÃ§Ã£o**: arraste no preview para girar, Shift+arrastar para mover, roda do mouse para escalar. Passar o mouse empurra as partÃ­culas (repelir, atrair, vÃ³rtice ou onda).

### ModulaÃ§Ã£o: o jeito rÃ¡pido de fazer arte reativa

Todo parÃ¢metro tem um botÃ£o **âˆ¿**. Ali vocÃª escolhe a fonte (Grave, MÃ©dio, Agudo, Volume, Batida ou LFOs sincronizados ao BPM) e a quantidade. A barra branca no slider mostra o valor modulado ao vivo.

- **ðŸŽ² Inspirar** (tecla `R`): gera uma variaÃ§Ã£o nova do clip.
- **Mutar**: faz sÃ³ uma pequena variaÃ§Ã£o dos valores atuais.
- **Feedback Infinito**: o efeito mais "psicodÃ©lico", que cria rastros com zoom, rotaÃ§Ã£o e deriva de cor.

### Ãudio

- **Mic**: microfone ou placa de Ã¡udio (escolha o dispositivo depois de liberar a permissÃ£o).
- **Ãudio do PC**: captura tudo que toca no computador (app do Spotify, YouTube, Serato, Rekordboxâ€¦). Escolha *Tela inteira* e ative "Compartilhar Ã¡udio do sistema". TambÃ©m dÃ¡ para escolher sÃ³ uma aba. Outra opÃ§Ã£o Ã© "Mixagem estÃ©reo" ou VB-Cable pelo botÃ£o Mic.
- **Spotify**: conecta sua conta para mostrar a mÃºsica atual, usar a capa como clip, mostrar o nome da faixa no gerador de Texto (`{musica}`) e controlar a reproduÃ§Ã£o (Premium). Crie um app em developer.spotify.com, cadastre a Redirect URI mostrada no painel e abra o estÃºdio por `http://127.0.0.1:3000`, porque o Spotify nÃ£o aceita `localhost`. O Spotify nÃ£o libera o Ã¡udio para anÃ¡lise, entÃ£o a reaÃ§Ã£o ao som vem do **Ãudio do PC**.
- **Arquivo**: toca um arquivo de mÃºsica.

As bandas tÃªm ganho automÃ¡tico, entÃ£o funcionam com som alto ou baixo. O BPM Ã© detectado sozinho (**Auto**), ou vocÃª define com **Tap** (barra de espaÃ§o). Sem Ã¡udio, tudo pulsa no BPM.

### ApresentaÃ§Ã£o

- **Auto VJ** troca de coluna sozinho a cada N compassos (em ordem ou aleatÃ³rio).

- **SaÃ­da â§‰** abre uma janela sÃ³ com a imagem. Arraste-a para o projetor e dÃª duplo clique para tela cheia. NÃ£o minimize a janela principal, porque o navegador pausa a renderizaÃ§Ã£o.
- **Rec** grava a saÃ­da em vÃ­deo (MP4 ou WebM) junto com o Ã¡udio.
- **MIDI**: ative, clique em qualquer controle (slider, botÃ£o de coluna, crossfader) e mexa no knob, fader ou pad.
- **Salvar/Abrir** exporta e importa a composiÃ§Ã£o em `.json`. Ela tambÃ©m Ã© salva automaticamente no navegador. Arquivos de mÃ­dia precisam ser recarregados depois de atualizar a pÃ¡gina.

### Atalhos

`1â€“8` colunas Â· `EspaÃ§o` tap tempo Â· `R` inspirar Â· `F` tela cheia Â· `H` esconder interface Â· `Esc` sair do MIDI learn

## Estrutura

```
studio/
  engine/
    types.ts       modelo de dados (serializÃ¡vel)
    store.ts       estado da composiÃ§Ã£o, presets, salvar/carregar, modulaÃ§Ã£o
    renderer.ts    compositor GPU: clips â†’ efeitos â†’ camadas â†’ master â†’ bloom
    generators.ts  biblioteca de geradores (GLSL)
    effects.ts     biblioteca de efeitos (GLSL)
    glsl.ts        funÃ§Ãµes GLSL comuns e paletas
    audio.ts       anÃ¡lise de Ã¡udio, detecÃ§Ã£o de batida e BPM
    io.ts          gravaÃ§Ã£o, janela de saÃ­da, MIDI
  ui/              React: grade de clips, inspetor, barra superior
  StudioApp.tsx
```

### Adicionar um gerador

Adicione um item em `GENERATORS` (`studio/engine/generators.ts`) com a lista de `params` e um GLSL que define `vec4 gen(vec2 uv)`. Cada parÃ¢metro vira `p_<chave>` no shader. TambÃ©m estÃ£o disponÃ­veis `uTime`, `uBass`, `uMid`, `uHigh`, `uLevel`, `uBeat`, `spec(x)` (espectro), `wave(x)` (forma de onda), `pal(t)` (paleta do clip), `fbm`, `noise`, `rot` e `uvc(uv)`. Os efeitos seguem o mesmo padrÃ£o, com `vec4 effect(vec2 uv)`, lendo `tInput`.

O cÃ³digo da versÃ£o anterior (`App.tsx`, `components/`, `services/`) continua no repositÃ³rio como referÃªncia e nÃ£o Ã© mais carregado.

