# Talos Mix para macOS

Dispositivo Core Audio virtual que encaminha sua saída para uma entrada de áudio com o mesmo nome.
Assim, o Talos Connect mistura voz e áudios em `Talos Mix` e Zoom, Meet, Discord ou outro
aplicativo usa essa entrada como microfone.

## Build local

```sh
pnpm mac:driver:build
```

O build baixa o exemplo oficial `CreatingAnAudioServerDriverPlugIn` da Apple, verifica o SHA-256,
aplica somente a identidade do Talos e o loopback, compila e assina ad-hoc o bundle. Ele não instala
nem ativa o driver automaticamente.

O código-base da Apple está sob a licença incluída no arquivo `APPLE-SAMPLE-LICENSE.txt`.
