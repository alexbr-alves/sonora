import { app, BrowserWindow, dialog, globalShortcut, ipcMain } from "electron";
import type { MessageBoxOptions } from "electron";
import { execFile } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { promisify } from "node:util";
import { WebSocket, WebSocketServer } from "ws";

let mainWindow: BrowserWindow | null = null;
let remoteServer: WebSocketServer | null = null;
let disconnectTimer: NodeJS.Timeout | null = null;
const pairedSockets = new Set<WebSocket>();
const remotePort = 8765;
const pairingPin = String(Math.floor(100000 + Math.random() * 900000));
const myInstantsOrigin = "https://www.myinstants.com";
const execFileAsync = promisify(execFile);
const installedDriverPath = "/Library/Audio/Plug-Ins/HAL/SoundpadMicrophone.driver";
const allowedCategories = new Set([
  "anime & manga", "games", "memes", "movies", "music", "politics", "pranks",
  "reactions", "sound effects", "sports", "television", "tiktok trends", "viral", "whatsapp audios"
]);

app.setName("Sonora Connect");

function showMessage(options: MessageBoxOptions) {
  return mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options);
}

async function ensureVirtualMicrophone() {
  if (process.platform !== "darwin" || !app.isPackaged || existsSync(installedDriverPath)) return;

  const bundledDriverPath = path.join(process.resourcesPath, "SoundpadMicrophone.driver");
  if (!existsSync(bundledDriverPath)) {
    await showMessage({
      type: "error",
      title: "Sonora Mix indisponível",
      message: "O driver do Sonora Mix não foi encontrado dentro do aplicativo.",
      detail: "Baixe novamente o Sonora pelo repositório oficial."
    });
    return;
  }

  const choice = await showMessage({
    type: "info",
    title: "Ativar Sonora Mix",
    message: "Instale a entrada de áudio Sonora Mix",
    detail: "Ela permite combinar sua voz com os sons do Android em chamadas, jogos e reuniões. O macOS solicitará sua senha uma única vez.",
    buttons: ["Instalar agora", "Mais tarde"],
    defaultId: 0,
    cancelId: 1
  });
  if (choice.response !== 0) return;

  const appleScript = `on run argv
set sourcePath to item 1 of argv
set targetPath to item 2 of argv
set commandText to "/usr/bin/ditto " & quoted form of sourcePath & " " & quoted form of targetPath & " && /usr/sbin/chown -R root:wheel " & quoted form of targetPath & " && /bin/chmod -R 755 " & quoted form of targetPath & " && (/usr/bin/killall coreaudiod 2>/dev/null || true)"
do shell script commandText with administrator privileges
end run`;

  try {
    await execFileAsync("/usr/bin/osascript", ["-e", appleScript, "--", bundledDriverPath, installedDriverPath]);
    await showMessage({
      type: "info",
      title: "Sonora Mix instalado",
      message: "A entrada de áudio está pronta.",
      detail: "Selecione Sonora Mix como microfone no aplicativo da sua chamada ou jogo."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "A instalação foi cancelada.";
    await showMessage({
      type: "error",
      title: "Não foi possível instalar o Sonora Mix",
      message: "A entrada de áudio não foi instalada.",
      detail: message.includes("User canceled") ? "Você pode tentar novamente ao reabrir o Sonora Connect." : message
    });
  }
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function parseMyInstants(html: string) {
  const items: Array<{ id: string; name: string; audioUrl: string; sourceUrl: string }> = [];
  const pattern = /<button class="small-button" onclick="play\('([^']+)',\s*'[^']+',\s*'([^']+)'\)"[^>]*title="Tocar o som de ([^"]+)"/g;
  for (const match of html.matchAll(pattern)) {
    const [, audioPath, id, encodedName] = match;
    items.push({
      id,
      name: decodeHtml(encodedName),
      audioUrl: new URL(audioPath, myInstantsOrigin).href,
      sourceUrl: new URL(`/pt/instant/${id}/`, myInstantsOrigin).href
    });
  }
  return items.slice(0, 48);
}

async function fetchCatalog(query?: string, category?: string) {
  let url = `${myInstantsOrigin}/pt/index/br/`;
  if (query?.trim()) url = `${myInstantsOrigin}/pt/search/?name=${encodeURIComponent(query.trim())}`;
  else if (category && allowedCategories.has(category)) {
    url = `${myInstantsOrigin}/pt/categories/${encodeURIComponent(category)}/br/`;
  }
  const response = await fetch(url, { headers: { "User-Agent": "Sonora/0.1 (+local client)" } });
  if (!response.ok) throw new Error(`MyInstants respondeu ${response.status}`);
  return parseMyInstants(await response.text());
}

function localAddresses() {
  return Object.values(networkInterfaces()).flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}

function send(socket: WebSocket, payload: object) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function startRemoteServer() {
  remoteServer = new WebSocketServer({ host: "0.0.0.0", port: remotePort, maxPayload: 64 * 1024 * 1024 });
  console.log(`[Sonora Connect] ws://${localAddresses()[0] ?? "IP_DO_COMPUTADOR"}:${remotePort} PIN ${pairingPin}`);
  remoteServer.on("connection", (socket) => {
    let paired = false;
    mainWindow?.webContents.send("remote:status", "Celular encontrado. Aguardando PIN...");

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as {
          type?: string;
          id?: string;
          pin?: string;
          padId?: string;
          name?: string;
          audioData?: string;
          volume?: number;
          requestId?: string;
          query?: string;
          category?: string;
          audioUrl?: string;
        };
        if (message.type === "pair") {
          if (message.pin !== pairingPin) {
            send(socket, { type: "pair-error", message: "PIN incorreto" });
            return;
          }
          paired = true;
          pairedSockets.add(socket);
          if (disconnectTimer) clearTimeout(disconnectTimer);
          disconnectTimer = null;
          send(socket, { type: "paired" });
          mainWindow?.webContents.send("remote:status", "Android conectado");
          return;
        }
        if (!paired) return;
        if (message.type === "catalog" && message.requestId) {
          void fetchCatalog(message.query, message.category)
            .then((items) => send(socket, { type: "catalog-results", requestId: message.requestId, items }))
            .catch((error) => send(socket, { type: "catalog-error", requestId: message.requestId, message: error instanceof Error ? error.message : "Falha no catálogo" }));
          return;
        }
        if (message.type === "catalog-play" && message.requestId && message.audioUrl) {
          const audioUrl = new URL(message.audioUrl);
          if (audioUrl.origin !== myInstantsOrigin || !audioUrl.pathname.startsWith("/media/sounds/")) {
            send(socket, { type: "catalog-error", requestId: message.requestId, message: "Endereço de áudio não permitido" });
            return;
          }
          mainWindow?.webContents.send("remote:play", {
            id: message.id ?? message.requestId,
            name: message.name ?? "Áudio do catálogo",
            audioData: audioUrl.href,
            volume: 1
          });
          send(socket, { type: "catalog-played", requestId: message.requestId });
          return;
        }
        if (message.type === "catalog-audio" && message.requestId && message.audioUrl) {
          const audioUrl = new URL(message.audioUrl);
          if (audioUrl.origin !== myInstantsOrigin || !audioUrl.pathname.startsWith("/media/sounds/")) {
            send(socket, { type: "catalog-error", requestId: message.requestId, message: "Endereço de áudio não permitido" });
            return;
          }
          void fetch(audioUrl).then(async (response) => {
            if (!response.ok) throw new Error(`Áudio indisponível (${response.status})`);
            const contentType = response.headers.get("content-type") ?? "audio/mpeg";
            const data = Buffer.from(await response.arrayBuffer()).toString("base64");
            send(socket, { type: "catalog-audio-result", requestId: message.requestId, audioData: `data:${contentType};base64,${data}` });
          }).catch((error) => send(socket, { type: "catalog-error", requestId: message.requestId, message: error instanceof Error ? error.message : "Falha ao adicionar áudio" }));
          return;
        }
        if (message.type === "play" && message.padId && message.audioData) {
          mainWindow?.webContents.send("remote:play", {
            id: message.padId,
            name: message.name ?? "Audio remoto",
            audioData: message.audioData,
            volume: message.volume ?? 1
          });
        }
        if (message.type === "stop") mainWindow?.webContents.send("remote:stop");
      } catch {
        send(socket, { type: "error", message: "Comando invalido" });
      }
    });

    socket.on("close", () => {
      if (!paired) return;
      pairedSockets.delete(socket);
      if (pairedSockets.size || disconnectTimer) return;
      disconnectTimer = setTimeout(() => {
        disconnectTimer = null;
        if (!pairedSockets.size) mainWindow?.webContents.send("remote:status", "Android desconectado");
      }, 10 * 60 * 1000);
    });
  });
  remoteServer.on("error", (error) => mainWindow?.webContents.send("remote:status", `Erro de rede: ${error.message}`));
}

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(app.getAppPath(), "apps/macos/assets/icon.png");
  mainWindow = new BrowserWindow({
    width: 430,
    height: 690,
    minWidth: 380,
    minHeight: 620,
    maxWidth: 560,
    backgroundColor: "#090b10",
    icon: iconPath,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  if (!app.isPackaged) void mainWindow.loadURL(`${devUrl}/desktop.html`);
  else void mainWindow.loadFile(path.join(__dirname, "../../../dist/desktop.html"));
}

app.whenReady().then(() => {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(app.getAppPath(), "apps/macos/assets/icon.png");
  app.dock?.setIcon(iconPath);
  ipcMain.handle("shortcuts:register", (_event, shortcuts: Array<{ id: string; accelerator: string }>) => {
    globalShortcut.unregisterAll();
    return shortcuts.map(({ id, accelerator }) => ({
      id,
      registered: globalShortcut.register(accelerator, () => mainWindow?.webContents.send("shortcut:pressed", id))
    }));
  });

  ipcMain.handle("remote:info", () => ({ addresses: localAddresses(), port: remotePort, pin: pairingPin }));
  createWindow();
  void ensureVirtualMicrophone();
  startRemoteServer();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("will-quit", () => {
  if (disconnectTimer) clearTimeout(disconnectTimer);
  globalShortcut.unregisterAll();
  remoteServer?.close();
});
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
