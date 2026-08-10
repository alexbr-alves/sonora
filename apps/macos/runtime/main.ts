import { app, BrowserWindow, dialog, globalShortcut, ipcMain, nativeImage, shell } from "electron";
import type { MessageBoxOptions } from "electron";
import { execFile } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, readdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir, networkInterfaces } from "node:os";
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
type InstalledApplication = {
  id: string;
  name: string;
  icon?: string;
  launchKind: "path" | "windows-app-id";
  launchTarget: string;
};
let installedApplications = new Map<string, InstalledApplication>();
const applicationIconCache = new Map<string, string | undefined>();

app.setName("Talos Connect");

function showMessage(options: MessageBoxOptions) {
  return mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options);
}

async function ensureVirtualMicrophone() {
  if (process.platform !== "darwin" || !app.isPackaged || existsSync(installedDriverPath)) return;

  const bundledDriverPath = path.join(process.resourcesPath, "SoundpadMicrophone.driver");
  if (!existsSync(bundledDriverPath)) {
    await showMessage({
      type: "error",
      title: "Talos Mix indisponível",
      message: "O driver do Talos Mix não foi encontrado dentro do aplicativo.",
      detail: "Baixe novamente o Talos pelo repositório oficial."
    });
    return;
  }

  const choice = await showMessage({
    type: "info",
    title: "Ativar Talos Mix",
    message: "Instale a entrada de áudio Talos Mix",
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
      title: "Talos Mix instalado",
      message: "A entrada de áudio está pronta.",
      detail: "Selecione Talos Mix como microfone no aplicativo da sua chamada ou jogo."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "A instalação foi cancelada.";
    await showMessage({
      type: "error",
      title: "Não foi possível instalar o Talos Mix",
      message: "A entrada de áudio não foi instalada.",
      detail: message.includes("User canceled") ? "Você pode tentar novamente ao reabrir o Talos Connect." : message
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
  const response = await fetch(url, { headers: { "User-Agent": "Talos/0.1 (+local client)" } });
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

function applicationId(target: string) {
  const normalized = process.platform === "win32" ? target.toLowerCase() : target;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

async function collectFiles(root: string, extensions: Set<string>, maxDepth: number, depth = 0): Promise<string[]> {
  if (depth > maxDepth) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    const extension = path.extname(entry.name).toLowerCase();
    if (entry.isDirectory() && extensions.has(extension)) {
      found.push(entryPath);
    } else if (entry.isFile() && extensions.has(extension)) {
      found.push(entryPath);
    } else if (entry.isDirectory()) {
      found.push(...await collectFiles(entryPath, extensions, maxDepth, depth + 1));
    }
  }
  return found;
}

async function applicationPaths() {
  if (process.platform === "darwin") {
    const roots = ["/Applications", path.join(homedir(), "Applications"), "/System/Applications"];
    return (await Promise.all(roots.map((root) => collectFiles(root, new Set([".app"]), 2)))).flat();
  }
  if (process.platform === "win32") {
    const roots = [
      process.env.APPDATA && path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs"),
      process.env.ProgramData && path.join(process.env.ProgramData, "Microsoft", "Windows", "Start Menu", "Programs")
    ].filter((root): root is string => Boolean(root));
    return (await Promise.all(roots.map((root) => collectFiles(root, new Set([".lnk", ".exe"]), 5)))).flat();
  }
  return [];
}

async function macApplicationIcon(applicationPath: string) {
  const infoPlist = path.join(applicationPath, "Contents", "Info.plist");
  for (const key of ["CFBundleIconFile", "CFBundleIconName"]) {
    try {
      const { stdout } = await execFileAsync("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", infoPlist]);
      const declaredName = stdout.trim();
      if (!declaredName) continue;
      const fileName = path.extname(declaredName) ? declaredName : `${declaredName}.icns`;
      const iconPath = path.join(applicationPath, "Contents", "Resources", fileName);
      const outputPath = path.join(app.getPath("temp"), `talos-app-icon-${applicationId(applicationPath)}.png`);
      try {
        await execFileAsync("/usr/bin/sips", ["-z", "64", "64", "-s", "format", "png", iconPath, "--out", outputPath]);
        const png = await readFile(outputPath);
        if (png.length) return `data:image/png;base64,${png.toString("base64")}`;
      } finally {
        await unlink(outputPath).catch(() => undefined);
      }
    } catch {
      // Tenta a próxima chave e depois o método genérico do sistema.
    }
  }
  return undefined;
}

async function applicationIcon(applicationPath: string) {
  if (applicationIconCache.has(applicationPath)) return applicationIconCache.get(applicationPath);
  let result: string | undefined;
  if (process.platform === "darwin") {
    const icon = await macApplicationIcon(applicationPath);
    if (icon) result = icon;
  }
  if (!result) {
    try {
      const image = await app.getFileIcon(applicationPath, { size: "normal" });
      if (!image.isEmpty()) result = image.resize({ width: 64, height: 64, quality: "good" }).toDataURL();
    } catch {
      // O Android usará o ícone genérico somente para este aplicativo.
    }
  }
  applicationIconCache.set(applicationPath, result);
  return result;
}

async function scanInstalledApplications() {
  const paths = [...new Set(await applicationPaths())];
  const applications: InstalledApplication[] = [];
  const candidates = paths.slice(0, 300);
  for (let index = 0; index < candidates.length; index += 16) {
    const batch = await Promise.all(candidates.slice(index, index + 16).map(async (launchPath) => ({
      id: applicationId(launchPath),
      name: path.basename(launchPath, path.extname(launchPath)),
      icon: await applicationIcon(launchPath),
      launchKind: "path" as const,
      launchTarget: launchPath
    })));
    applications.push(...batch);
  }
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-Command",
        "Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress"
      ], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      const parsed = JSON.parse(stdout) as { Name?: string; AppID?: string } | Array<{ Name?: string; AppID?: string }>;
      const startApps = Array.isArray(parsed) ? parsed : [parsed];
      const existingNames = new Set(applications.map((application) => application.name.toLocaleLowerCase()));
      for (const startApp of startApps) {
        if (!startApp.Name || !startApp.AppID || existingNames.has(startApp.Name.toLocaleLowerCase())) continue;
        applications.push({
          id: applicationId(`windows-app-id:${startApp.AppID}`),
          name: startApp.Name,
          launchKind: "windows-app-id",
          launchTarget: startApp.AppID
        });
        existingNames.add(startApp.Name.toLocaleLowerCase());
      }
    } catch {
      // A lista de atalhos continua disponível em versões sem Get-StartApps.
    }
  }
  applications.sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }));
  installedApplications = new Map(applications.map((application) => [application.id, application]));
  return applications;
}

async function launchInstalledApplication(id: string) {
  if (!installedApplications.has(id)) await scanInstalledApplications();
  const application = installedApplications.get(id);
  if (!application) throw new Error("Este aplicativo não está mais instalado neste computador");
  if (application.launchKind === "windows-app-id") {
    await execFileAsync("explorer.exe", [`shell:AppsFolder\\${application.launchTarget}`], { windowsHide: true });
    return;
  }
  const error = await shell.openPath(application.launchTarget);
  if (error) throw new Error(error);
}

function startRemoteServer() {
  remoteServer = new WebSocketServer({ host: "0.0.0.0", port: remotePort, maxPayload: 64 * 1024 * 1024 });
  console.log(`[Talos Connect] ws://${localAddresses()[0] ?? "IP_DO_COMPUTADOR"}:${remotePort} PIN ${pairingPin}`);
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
          applicationId?: string;
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
        if (message.type === "applications" && message.requestId) {
          void scanInstalledApplications()
            .then((applications) => send(socket, {
              type: "applications-results",
              requestId: message.requestId,
              applications: applications.map(({ id, name, icon }) => ({ id, name, icon }))
            }))
            .catch((error) => send(socket, { type: "application-error", requestId: message.requestId, message: error instanceof Error ? error.message : "Falha ao listar aplicativos" }));
          return;
        }
        if (message.type === "launch-application" && message.requestId && message.applicationId) {
          void launchInstalledApplication(message.applicationId)
            .then(() => send(socket, { type: "application-launched", requestId: message.requestId }))
            .catch((error) => send(socket, { type: "application-error", requestId: message.requestId, message: error instanceof Error ? error.message : "Falha ao abrir aplicativo" }));
          return;
        }
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
