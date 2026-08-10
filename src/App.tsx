import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, CircleStop, Gauge, Headphones, Keyboard, Mic2, Pause, Plus, Search,
  Settings2, SlidersHorizontal, Upload, Volume2, Waves
} from "lucide-react";
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint
} from "@capacitor/barcode-scanner";
import { AudioEngine } from "./audioEngine";
import { deleteAudioBlob, loadCurrentLayoutId, loadLayouts, loadLibrary, saveAudioBlob, saveCurrentLayoutId, saveLayouts, saveLibrary } from "./storage";
import type { AudioDeviceOption, CatalogItem, ComputerApplication, PadColor, SoundLayout, SoundPad } from "./types";
import { useRemote } from "./useRemote";
import MobileDeck from "./mobile/MobileDeck";

const colors: PadColor[] = ["violet", "cyan", "amber", "rose", "lime", "blue"];

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "--:--";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => { resolve(audio.duration); URL.revokeObjectURL(url); };
    audio.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
    audio.src = url;
  });
}

function applicationAccent(icon?: string): Promise<string | undefined> {
  if (!icon) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 24;
      canvas.height = 24;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return resolve(undefined);
      context.drawImage(image, 0, 0, 24, 24);
      const pixels = context.getImageData(0, 0, 24, 24).data;
      const buckets = new Map<string, { red: number; green: number; blue: number; weight: number }>();
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3] / 255;
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const saturation = maximum - minimum;
        const luminance = (red + green + blue) / 3;
        if (alpha < .35 || saturation < 24 || luminance < 22 || luminance > 238) continue;
        const key = `${red >> 5}-${green >> 5}-${blue >> 5}`;
        const weight = (saturation + 28) * alpha;
        const bucket = buckets.get(key) ?? { red: 0, green: 0, blue: 0, weight: 0 };
        bucket.red += red * weight;
        bucket.green += green * weight;
        bucket.blue += blue * weight;
        bucket.weight += weight;
        buckets.set(key, bucket);
      }
      const dominant = [...buckets.values()].sort((left, right) => right.weight - left.weight)[0];
      if (!dominant) return resolve("#7e8da6");
      resolve(`rgb(${Math.round(dominant.red / dominant.weight)},${Math.round(dominant.green / dominant.weight)},${Math.round(dominant.blue / dominant.weight)})`);
    };
    image.onerror = () => resolve(undefined);
    image.src = icon;
  });
}

function App() {
  const [pads, setPads] = useState<SoundPad[]>(loadLibrary);
  const [layouts, setLayouts] = useState<SoundLayout[]>(() => loadLayouts(pads));
  const [currentLayoutId, setCurrentLayoutId] = useState(loadCurrentLayoutId);
  const [query, setQuery] = useState("");
  const [masterVolume, setMasterVolume] = useState(85);
  const [exclusive, setExclusive] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [devices, setDevices] = useState<AudioDeviceOption[]>([{ id: "default", label: "Saida padrao" }]);
  const [outputDevice, setOutputDevice] = useState("default");
  const [status, setStatus] = useState("Pronto para tocar");
  const fileInput = useRef<HTMLInputElement>(null);
  const engine = useMemo(() => new AudioEngine(), []);
  const remote = useRemote();
  const [remoteInfo, setRemoteInfo] = useState<{ addresses: string[]; port: number; pin: string } | null>(null);
  const [remoteStatus, setRemoteStatus] = useState("Aguardando Android");

  useEffect(() => saveLibrary(pads), [pads]);
  useEffect(() => saveLayouts(layouts), [layouts]);
  useEffect(() => saveCurrentLayoutId(currentLayoutId), [currentLayoutId]);
  useEffect(() => engine.setMasterVolume(masterVolume / 100), [engine, masterVolume]);
  useEffect(() => engine.setOutputDevice(outputDevice), [engine, outputDevice]);
  useEffect(() => {
    const missingAccents = pads.filter((pad) => pad.actionType === "application" && pad.applicationIcon && !pad.applicationAccent);
    if (!missingAccents.length) return;
    let cancelled = false;
    void Promise.all(missingAccents.map(async (pad) => [pad.id, await applicationAccent(pad.applicationIcon)] as const)).then((results) => {
      if (cancelled) return;
      const accents = new Map(results);
      setPads((current) => current.map((pad) => accents.has(pad.id) ? { ...pad, applicationAccent: accents.get(pad.id) } : pad));
    });
    return () => { cancelled = true; };
  }, [pads]);

  const playPad = useCallback(async (pad: SoundPad) => {
    if (pad.actionType === "application") {
      if (!pad.applicationId) {
        setStatus("Aplicativo não configurado");
        return;
      }
      try {
        await remote.launchApplication(pad.applicationId);
        setPlaying(pad.id);
        setStatus(`Aplicativo aberto: ${pad.name}`);
        window.setTimeout(() => setPlaying((current) => current === pad.id ? null : current), 700);
      } catch (error) {
        setPlaying(null);
        setStatus(error instanceof Error ? error.message : "Não foi possível abrir o aplicativo");
      }
      return;
    }
    remote.stop();
    if (remote.isMobile && remote.connected) {
      await remote.play(pad);
      setPlaying(pad.id);
      setStatus(`Enviado ao computador: ${pad.name}`);
      window.setTimeout(() => setPlaying((current) => current === pad.id ? null : current), 700);
      return;
    }
    try {
      setPlaying(pad.id);
      setStatus(`Tocando: ${pad.name}`);
      await engine.play(pad.id, pad.volume, exclusive);
      window.setTimeout(() => setPlaying((current) => current === pad.id ? null : current), (pad.duration ?? 1) * 1000);
    } catch (error) {
      setPlaying(null);
      setStatus(error instanceof Error ? error.message : "Nao foi possivel tocar o audio");
    }
  }, [engine, exclusive, remote.isMobile, remote.connected, remote.play, remote.stop, remote.launchApplication]);

  const playCatalog = useCallback(async (item: CatalogItem) => {
    engine.stopAll();
    await remote.playCatalog(item);
  }, [engine, remote.playCatalog]);

  useEffect(() => {
    if (!window.soundpadDesktop) return;
    void window.soundpadDesktop.registerShortcuts(
      pads.filter((pad) => pad.shortcut).map((pad) => ({ id: pad.id, accelerator: pad.shortcut! }))
    );
    return window.soundpadDesktop.onShortcut((id) => {
      const pad = pads.find((item) => item.id === id);
      if (pad) void playPad(pad);
    });
  }, [pads, playPad]);

  useEffect(() => {
    if (!window.soundpadDesktop) return;
    void window.soundpadDesktop.getRemoteInfo().then(setRemoteInfo);
    const offStatus = window.soundpadDesktop.onRemoteStatus(setRemoteStatus);
    return () => { offStatus(); };
  }, [pads, playPad]);

  async function importFileList(files: File[], layoutId: string) {
    if (!files.length) return;
    const layout = layouts.find((item) => item.id === layoutId) ?? layouts[0];
    const freeSlots = Math.max(0, layout.rows * layout.columns - layout.padIds.length);
    const acceptedFiles = files.slice(0, freeSlots);
    if (!acceptedFiles.length) throw new Error("O layout escolhido está cheio");
    setStatus(`Importando ${acceptedFiles.length} audio(s)...`);
    const additions: SoundPad[] = [];
    for (const [index, file] of acceptedFiles.entries()) {
      const id = crypto.randomUUID();
      await saveAudioBlob(id, file);
      additions.push({
        id,
        name: file.name.replace(/\.[^.]+$/, ""),
        fileName: file.name,
        volume: 1,
        color: colors[(pads.length + index) % colors.length],
        duration: await readDuration(file)
      });
    }
    setPads((current) => [...current, ...additions]);
    setLayouts((current) => current.map((item) => item.id === layout.id ? { ...item, padIds: [...item.padIds, ...additions.map((pad) => pad.id)] } : item));
    setStatus(`${additions.length} audio(s) adicionado(s)`);
  }

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])].filter((file) => file.type.startsWith("audio/"));
    await importFileList(files, currentLayoutId);
    event.target.value = "";
  }

  async function refreshDevices() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const list = await navigator.mediaDevices.enumerateDevices();
      const outputs = list.filter((device) => device.kind === "audiooutput");
      setDevices([{ id: "default", label: "Saida padrao" }, ...outputs
        .filter((device) => device.deviceId !== "default")
        .map((device, index) => ({ id: device.deviceId, label: device.label || `Saida ${index + 1}` }))]);
      setStatus("Dispositivos de audio atualizados");
    } catch {
      setStatus("Permita acesso ao microfone para listar os dispositivos");
    }
  }

  function stopAll() {
    if (remote.isMobile && remote.connected) remote.stop();
    engine.stopAll();
    setPlaying(null);
    setStatus("Reproducao interrompida");
  }

  async function scanPairingQr() {
    try {
      remote.setStatus("Abrindo a camera...");
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
        scanInstructions: "Aponte para o QR Code exibido no Mac",
        scanButton: false,
        cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
        scanOrientation: CapacitorBarcodeScannerScanOrientation.PORTRAIT,
        android: { scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.MLKIT }
      });
      const url = new URL(result.ScanResult);
      const host = url.searchParams.get("host");
      const port = url.searchParams.get("port") ?? "8765";
      const qrPin = url.searchParams.get("pin");
      if (!["talos:", "sonora:", "soundpad:"].includes(url.protocol) || url.hostname !== "pair" || !host || !/^\d{6}$/.test(qrPin ?? "")) {
        throw new Error("QR Code não pertence ao Talos");
      }
      remote.connectFromQr(`${host}:${port}`, qrPin!);
    } catch (error) {
      remote.setStatus(error instanceof Error ? error.message : "Nao foi possivel ler o QR Code");
    }
  }

  async function addCatalogItem(item: CatalogItem, blob: Blob, layoutId: string) {
    const layout = layouts.find((candidate) => candidate.id === layoutId);
    if (!layout || layout.padIds.length >= layout.rows * layout.columns) throw new Error("O layout escolhido está cheio");
    const id = crypto.randomUUID();
    const file = new File([blob], `${item.id}.mp3`, { type: blob.type || "audio/mpeg" });
    await saveAudioBlob(id, file);
    const pad: SoundPad = {
      id,
      name: item.name,
      fileName: file.name,
      volume: 1,
      color: colors[pads.length % colors.length],
      duration: await readDuration(file),
      sourceId: item.id
    };
    setPads((current) => [...current, pad]);
    setLayouts((current) => current.map((candidate) => candidate.id === layoutId ? { ...candidate, padIds: [...candidate.padIds, id] } : candidate));
    setStatus(`${item.name} adicionado à biblioteca`);
  }

  async function addApplication(application: ComputerApplication, layoutId: string) {
    const layout = layouts.find((candidate) => candidate.id === layoutId);
    if (!layout || layout.padIds.length >= layout.rows * layout.columns) throw new Error("O layout escolhido está cheio");
    const pad: SoundPad = {
      id: crypto.randomUUID(),
      name: application.name,
      fileName: "Aplicativo",
      volume: 1,
      color: colors[pads.length % colors.length],
      actionType: "application",
      applicationId: application.id,
      applicationIcon: application.icon,
      applicationAccent: await applicationAccent(application.icon)
    };
    setPads((current) => [...current, pad]);
    setLayouts((current) => current.map((candidate) => candidate.id === layoutId ? { ...candidate, padIds: [...candidate.padIds, pad.id] } : candidate));
    setStatus(`${application.name} adicionado ao deck`);
  }

  async function syncApplicationIcons(applications: ComputerApplication[]) {
    const applicationMap = new Map(applications.map((application) => [application.id, application]));
    const selectedIds = new Set(pads.filter((pad) => pad.actionType === "application" && pad.applicationId).map((pad) => pad.applicationId!));
    const accents = new Map<string, string | undefined>();
    await Promise.all([...selectedIds].map(async (id) => {
      const application = applicationMap.get(id);
      if (application?.icon) accents.set(id, await applicationAccent(application.icon));
    }));
    setPads((current) => current.map((pad) => {
      if (pad.actionType !== "application" || !pad.applicationId) return pad;
      const application = applicationMap.get(pad.applicationId);
      if (!application?.icon) return pad;
      const accent = accents.get(pad.applicationId);
      if (application.icon === pad.applicationIcon && accent === pad.applicationAccent) return pad;
      return { ...pad, applicationIcon: application.icon, applicationAccent: accent, name: application.name };
    }));
  }

  async function deletePad(id: string) {
    const pad = pads.find((candidate) => candidate.id === id);
    if (pad?.actionType !== "application") await deleteAudioBlob(id);
    setPads((current) => current.filter((pad) => pad.id !== id));
    setLayouts((current) => current.map((layout) => ({ ...layout, padIds: layout.padIds.filter((padId) => padId !== id) })));
    if (playing === id) stopAll();
  }

  const activePads = pads;
  const visiblePads = activePads.filter((pad) => pad.name.toLowerCase().includes(query.toLowerCase()));

  if (remote.isMobile) return <MobileDeck pads={pads} layouts={layouts} currentLayoutId={currentLayoutId} playing={playing} remote={{ ...remote, playCatalog }} onPlay={playPad} onStop={stopAll} onScanQr={scanPairingQr} onSetCurrentLayout={setCurrentLayoutId} onSetLayouts={setLayouts} onImportFiles={importFileList} onAddCatalog={addCatalogItem} onAddApplication={addApplication} onSyncApplications={syncApplicationIcons} onDeletePad={deletePad} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Waves size={22} /></div><span>Talos</span></div>
        <nav>
          <button className="nav-item active"><AudioLines size={18} /> Meus sons <span>{activePads.length}</span></button>
          <button className="nav-item"><Keyboard size={18} /> Atalhos</button>
          <button className="nav-item"><SlidersHorizontal size={18} /> Mixer</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="connection-card">
          <div className="connection-title"><span className={`status-dot ${remoteStatus === "Android conectado" ? "connected" : ""}`} /> Controle Android</div>
          {remoteInfo ? <><p className="remote-address">{remoteInfo.addresses[0] ?? "Sem IP local"}:{remoteInfo.port}</p><div className="pair-pin">PIN <strong>{remoteInfo.pin}</strong></div><small>{remoteStatus}</small></> : <p>Disponivel no app desktop</p>}
          <button onClick={refreshDevices}><Settings2 size={15} /> Configurar áudio</button>
        </div>
        <div className="platform">{window.soundpadDesktop ? "Aplicativo desktop" : "Modo de desenvolvimento"} · v0.1</div>
      </aside>

      <main>
        <header>
          <div><p className="eyebrow">BIBLIOTECA</p><h1>Meus sons</h1><p className="subtitle">Dispare seus áudios em jogos, chamadas e reuniões.</p></div>
          <div className="header-actions"><button className="primary" onClick={() => fileInput.current?.click()}><Plus size={18} /> Adicionar áudio</button></div>
          <input ref={fileInput} type="file" accept="audio/*" multiple hidden onChange={importFiles} />
        </header>

        <section className="control-strip">
          <div className="device-control"><Headphones size={19} /><div><label>SAÍDA DE ÁUDIO</label><select value={outputDevice} onChange={(e) => setOutputDevice(e.target.value)}>{devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</select></div></div>
          <div className="divider" />
          <div className="volume-control"><Volume2 size={19} /><div><label>VOLUME GERAL <strong>{masterVolume}%</strong></label><input aria-label="Volume geral" type="range" min="0" max="100" value={masterVolume} onChange={(e) => setMasterVolume(Number(e.target.value))} /></div></div>
          <button className={`mode-toggle ${exclusive ? "on" : ""}`} onClick={() => setExclusive(!exclusive)}><span /> Modo exclusivo</button>
          <button className="stop" onClick={stopAll}><CircleStop size={18} /> Parar tudo</button>
        </section>

        <section className="toolbar">
          <div className="search"><Search size={18} /><input aria-label="Buscar sons" placeholder="Buscar sons..." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <div className="status"><Gauge size={16} /> {status}</div>
        </section>

        {visiblePads.length ? (
          <section className="pad-grid">
            {visiblePads.map((pad, index) => (
              <button key={pad.id} className={`sound-pad ${pad.color} ${playing === pad.id ? "playing" : ""}`} onClick={() => playing === pad.id ? stopAll() : void playPad(pad)}>
                <div className="pad-top"><span className="pad-index">{String(index + 1).padStart(2, "0")}</span><span className="wave-mini">▂▅▃▇▂▆▃</span></div>
                <div className="pad-content"><div className="play-icon">{playing === pad.id ? <Pause size={24} fill="currentColor" /> : <AudioLines size={24} />}</div><div><h2>{pad.name}</h2><p>{formatDuration(pad.duration)} · {pad.fileName.split(".").pop()?.toUpperCase()}</p></div></div>
                <div className="pad-footer"><span>{pad.shortcut || "Sem atalho"}</span><span><Volume2 size={14} /> {Math.round(pad.volume * 100)}%</span></div>
              </button>
            ))}
            <button className="add-pad" onClick={() => fileInput.current?.click()}><Upload size={24} /><strong>Adicionar som</strong><span>MP3, WAV, OGG ou FLAC</span></button>
          </section>
        ) : (
          <section className="empty-state"><div className="empty-icon"><Mic2 size={32} /></div><h2>{activePads.length ? "Nenhum som encontrado" : "Sua biblioteca está vazia"}</h2><p>{activePads.length ? "Tente buscar por outro nome." : "Adicione seus primeiros áudios para começar a tocar."}</p>{!activePads.length && <button className="primary" onClick={() => fileInput.current?.click()}><Upload size={18} /> Importar áudios</button>}</section>
        )}
      </main>
    </div>
  );
}

export default App;
