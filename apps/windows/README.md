# Sonora Connect para Windows

O Sonora Connect para Windows reutiliza a mesma interface e o mesmo protocolo de conexão da versão para macOS.

## Preview atual

- Conexão com o Android por QR Code ou IP e PIN.
- Recebimento e reprodução dos pads no computador.
- Retorno de áudio com seleção da saída do Windows.
- Instalador único `Sonora-Windows.exe` para computadores `x64`.

A entrada virtual **Sonora Mix** ainda não está incluída nesta primeira Preview. Ela exigirá um driver de áudio próprio para Windows; até lá, os pads serão reproduzidos na saída selecionada no Sonora Connect.

## Build

```bash
pnpm windows:exe
```

O instalador será gerado em `release/windows/Sonora-Windows.exe`.
