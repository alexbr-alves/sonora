<p align="center">
  <img src="apps/macos/assets/icon.png" width="168" alt="Ícone do Sonora" />
</p>

<h1 align="center">Sonora</h1>

<p align="center">
  <strong>Sua voz. Seus sons. Uma só entrada.</strong>
</p>

<p align="center">
  Uma plataforma de áudio construída em público para chamadas, jogos, streams e reuniões.
</p>

<p align="center">
  <a href="https://github.com/alexbr-alves/sonora/releases/latest"><img alt="Última versão" src="https://img.shields.io/github/v/release/alexbr-alves/sonora?display_name=tag&style=flat-square&color=7c5ce5" /></a>
  <img alt="Android 8+" src="https://img.shields.io/badge/Android-8%2B-3ddc84?style=flat-square&logo=android&logoColor=white" />
  <img alt="macOS Apple Silicon" src="https://img.shields.io/badge/macOS-Apple%20Silicon-111111?style=flat-square&logo=apple&logoColor=white" />
  <a href="https://github.com/alexbr-alves/sonora/issues"><img alt="Contribuições bem-vindas" src="https://img.shields.io/badge/contribuições-bem--vindas-b89cff?style=flat-square" /></a>
</p>

## Conheça o Sonora

O **Sonora** é um ecossistema de soundboard que coloca seus sons favoritos ao alcance de um toque e os leva diretamente para onde você já conversa, joga ou transmite.

No Android, você organiza uma superfície de controle do seu jeito. No computador, o **Sonora Connect** recebe os comandos e combina os sons com a sua voz. Para o aplicativo de chamada, tudo chega por uma única entrada: **Sonora Mix**.

O projeto nasceu para tornar esse fluxo simples, bonito e acessível — sem depender de hardware dedicado e sem prender sua biblioteca a um serviço online.

## Baixe e experimente

| Plataforma | Download | O que está incluído |
|---|---|---|
| Android | [**Baixar Sonora.apk**](https://github.com/alexbr-alves/sonora/releases/latest/download/Sonora.apk) | Deck, layouts, biblioteca e descoberta de sons |
| macOS | [**Baixar Sonora.dmg**](https://github.com/alexbr-alves/sonora/releases/latest/download/Sonora.dmg) | Sonora Connect e a entrada virtual Sonora Mix |

> O Sonora está em Preview. Os instaladores ainda não possuem assinaturas públicas de distribuição, portanto Android e macOS podem exibir uma confirmação de segurança na primeira instalação. A assinatura e a notarização pela Apple fazem parte do roadmap.

## Feito para o seu ritmo

### Um espaço que se adapta a você

Crie diferentes layouts para cada momento: reunião, stream, partida, podcast ou conversa com amigos. Escolha o tamanho da grade, organize os sons e navegue entre os painéis com um gesto.

### Sua biblioteca sempre por perto

Adicione arquivos do aparelho ou descubra novos sons pela pesquisa integrada. A biblioteca fica no seu dispositivo e pode ser usada mesmo quando nenhum computador está conectado.

### Áudio sem disputa

Quando um novo pad é acionado, o som anterior para automaticamente. Você mantém o controle da conversa e evita áudios sobrepostos.

### Voz e sons juntos

O Sonora Connect combina seu microfone com os pads. Você continua falando normalmente enquanto adiciona efeitos, reações, vinhetas ou qualquer áudio da sua biblioteca.

### Pensado como uma superfície de controle

No Deck, a tela permanece ativa, a interface ocupa todo o espaço disponível e acompanha a orientação do aparelho. Se o Android for bloqueado, o Sonora tenta recuperar a conexão automaticamente por até 10 minutos.

## Como funciona

```mermaid
flowchart LR
    A["Escolha um som no Sonora"] --> B["Sonora Connect recebe o áudio"]
    C["Sua voz"] --> B
    B --> D["Sonora Mix"]
    D --> E["Chamada, jogo ou stream"]
```

1. Abra o Sonora Connect no Mac.
2. No Android, escaneie o QR Code exibido pelo computador.
3. Escolha **Sonora Mix** como microfone no aplicativo que você usa.
4. Toque em um pad e continue falando normalmente.

O pareamento acontece pela sua rede Wi‑Fi. Não é necessário conectar o celular por cabo.

## O que já está disponível

- Interface em tela cheia e adaptável à orientação do Android.
- Grades de `1×1` até `5×5`.
- Vários layouts com ordem personalizável.
- Biblioteca local com importação de áudios.
- Pesquisa por texto, tendências e categorias.
- Reprodução direta no Android quando estiver offline.
- Conexão rápida por QR Code.
- Mistura de voz e pads pelo Sonora Mix.
- Retorno opcional para ouvir os pads no fone.
- Reconexão automática após bloqueios curtos.
- Identidade visual compartilhada entre Android e macOS.

## Instalação

### Android

1. Baixe `Sonora.apk`.
2. Abra o arquivo no aparelho.
3. Caso o Android solicite, autorize a instalação de apps dessa fonte.
4. Confirme a instalação.

As atualizações preservam a biblioteca e os layouts já criados.

### macOS

1. Baixe e abra `Sonora.dmg`.
2. Arraste o **Sonora Connect** para o atalho **Aplicativos**.
3. Abra o Sonora Connect pela pasta Aplicativos. Se o macOS bloquear a abertura, clique em **OK** — não escolha **Mover para o Lixo**.
4. Abra **Ajustes do Sistema → Privacidade e Segurança**.
5. Role até **Segurança** e, ao lado da mensagem sobre o Sonora Connect, clique em **Abrir Mesmo Assim**.
6. Confirme com sua senha ou Touch ID e clique em **Abrir** na confirmação seguinte.
7. No Sonora Connect, escolha **Instalar agora** para ativar o Sonora Mix e informe a senha do Mac uma vez.
8. Autorize o acesso ao microfone quando solicitado.

> O Sonora ainda não possui assinatura pública da Apple. A opção **Abrir Mesmo Assim** aparece somente depois da primeira tentativa de abertura e fica disponível por aproximadamente uma hora. A liberação precisa ser feita apenas uma vez para a versão instalada. Consulte também as [instruções oficiais da Apple](https://support.apple.com/guide/mac-help/mh40616/mac).

O DMG contém tudo o que o Sonora precisa. O próprio aplicativo instala e ativa o Sonora Mix na primeira execução; não há `.pkg` nem um segundo componente para baixar.

## Construído em público

O Sonora cresce com experimentação, feedback e colaboração. Você pode participar de várias formas:

- Relatar um problema em [Issues](https://github.com/alexbr-alves/sonora/issues).
- Sugerir uma experiência ou integração nova.
- Melhorar documentação, acessibilidade ou traduções.
- Enviar uma correção ou funcionalidade por Pull Request.
- Testar uma release e compartilhar o comportamento no seu dispositivo.

Antes de começar uma mudança grande, abra uma Issue para alinharmos a ideia e evitarmos trabalho duplicado.

## Para onde vamos

- Sonora Connect para Windows.
- Instaladores assinados e distribuição simplificada.
- Personalização avançada dos pads.
- Pastas, páginas e ações adicionais.
- Mais opções de acessibilidade.
- Atalhos e integrações para criadores de conteúdo.
- Uma experiência de instalação ainda mais fluida.

## Privacidade como padrão

- Sua biblioteca permanece armazenada no Android.
- O pareamento acontece diretamente na rede local.
- Não é necessário criar uma conta.
- O Sonora não possui telemetria própria nesta Preview.
- A descoberta consulta páginas públicas do MyInstants; o Sonora não é afiliado ao serviço.

<details>
<summary><strong>Desenvolvimento e contribuição</strong></summary>

### Estrutura

```text
apps/
├── mobile/              aplicativo Android
├── macos/               Sonora Connect para macOS
└── windows/             futura versão Windows
native/
└── macos/virtual-mic/    entrada virtual Sonora Mix
src/
├── mobile/              experiência do Sonora
└── desktop/             experiência do Sonora Connect
```

O Electron é apenas uma tecnologia interna de empacotamento e não faz parte do nome do produto.

### Requisitos

- Node.js 20 ou superior.
- pnpm.
- Android Studio e JDK para builds Android.
- Xcode Command Line Tools para builds macOS.

### Preparação

```bash
git clone https://github.com/alexbr-alves/sonora.git
cd sonora
pnpm install
```

### Desenvolvimento local

```bash
pnpm dev
```

### Qualidade

```bash
pnpm typecheck
pnpm test
pnpm build
```

### Instaladores

```bash
pnpm android:build
pnpm mac:dmg
```

O APK é gerado em `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. O instalador público do macOS é gerado em `release/Sonora.dmg`.

</details>

---

<p align="center">
  <strong>Sonora</strong><br />
  Transforme qualquer momento em uma experiência sonora.
</p>
