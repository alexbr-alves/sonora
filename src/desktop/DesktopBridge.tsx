import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Headphones, Mic2, Radio, Smartphone, Volume2, Wifi } from "lucide-react";
import QRCode from "qrcode";

type RemoteInfo = { addresses: string[]; port: number; pin: string };
type SinkableAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
const virtualMicName = "Talos Mix";
const legacyVirtualMicName = "Soundpad Mix (Voz + Áudios)";

function isVirtualMic(label: string) {
  return label.includes(virtualMicName) || label.includes(legacyVirtualMicName);
}

export default function DesktopBridge() {
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [status, setStatus] = useState("Aguardando celular");
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [callOutputId, setCallOutputId] = useState("default");
  const [monitorOutputId, setMonitorOutputId] = useState(() => localStorage.getItem("soundpad:monitor-output") ?? "default");
  const [monitorEnabled, setMonitorEnabled] = useState(() => localStorage.getItem("soundpad:monitor-enabled") !== "false");
  const [voiceReady, setVoiceReady] = useState(false);
  const [nowPlaying, setNowPlaying] = useState("Nenhum áudio reproduzindo");
  const [copied, setCopied] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const activeAudio = useRef<HTMLAudioElement[]>([]);
  const playGeneration = useRef(0);
  const voiceStream = useRef<MediaStream | null>(null);
  const voiceAudio = useRef<SinkableAudio | null>(null);

  const refreshDevices = useCallback(async () => {
    const items = await navigator.mediaDevices.enumerateDevices();
    const nextOutputs = items.filter((item) => item.kind === "audiooutput");
    setOutputs(nextOutputs);
    const virtualMic = nextOutputs.find((item) => item.label.includes(virtualMicName)) ?? nextOutputs.find((item) => item.label.includes(legacyVirtualMicName));
    if (virtualMic) {
      setCallOutputId(virtualMic.deviceId);
    } else {
      setCallOutputId("default");
    }
  }, []);

  const stopVoice = useCallback(() => {
    voiceStream.current?.getTracks().forEach((track) => track.stop());
    voiceStream.current = null;
    voiceAudio.current?.pause();
    voiceAudio.current = null;
    setVoiceReady(false);
  }, []);

  const startVoice = useCallback(async () => {
    stopVoice();
    try {
      let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const physicalMic = devices.find((device) => device.kind === "audioinput" && device.deviceId !== "default" && device.deviceId !== "communications" && !isVirtualMic(device.label));
      const currentDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (physicalMic && currentDeviceId !== physicalMic.deviceId) {
        stream.getTracks().forEach((track) => track.stop());
        stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: physicalMic.deviceId } } });
      }
      const audio = new Audio() as SinkableAudio;
      audio.srcObject = stream;
      if (audio.setSinkId && callOutputId !== "default") await audio.setSinkId(callOutputId);
      await audio.play();
      voiceStream.current = stream;
      voiceAudio.current = audio;
      setVoiceReady(true);
      await refreshDevices();
    } catch {
      setNowPlaying("Permita o microfone para misturar sua voz com os pads");
    }
  }, [callOutputId, refreshDevices, stopVoice]);

  useEffect(() => {
    if (callOutputId === "default") {
      stopVoice();
      return;
    }
    void startVoice();
    return stopVoice;
  }, [callOutputId, startVoice, stopVoice]);

  useEffect(() => {
    const desktop = window.soundpadDesktop;
    if (!desktop) return;
    void desktop.getRemoteInfo().then(setInfo);
    void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    const offStatus = desktop.onRemoteStatus(setStatus);
    const offStop = desktop.onRemoteStop(() => {
      playGeneration.current += 1;
      activeAudio.current.forEach((audio) => audio.pause());
      activeAudio.current = [];
      setNowPlaying("Reprodução interrompida");
    });
    const offPlay = desktop.onRemotePlay(async (payload) => {
      const generation = ++playGeneration.current;
      activeAudio.current.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      activeAudio.current = [];
      const playOn = async (sinkId: string) => {
        const audio = new Audio(payload.audioData) as SinkableAudio;
        audio.volume = Math.min(1, Math.max(0, payload.volume));
        activeAudio.current.push(audio);
        if (audio.setSinkId && sinkId !== "default") await audio.setSinkId(sinkId);
        if (generation !== playGeneration.current) {
          audio.pause();
          activeAudio.current = activeAudio.current.filter((item) => item !== audio);
          return;
        }
        audio.addEventListener("ended", () => {
          activeAudio.current = activeAudio.current.filter((item) => item !== audio);
          if (!activeAudio.current.length) setNowPlaying("Nenhum áudio reproduzindo");
        }, { once: true });
        await audio.play();
      };
      setNowPlaying(payload.name);
      await playOn(callOutputId);
      if (monitorEnabled && monitorOutputId !== callOutputId) await playOn(monitorOutputId);
    });
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
      offStatus();
      offStop();
      offPlay();
    };
  }, [callOutputId, monitorEnabled, monitorOutputId, refreshDevices]);

  useEffect(() => {
    const host = info?.addresses[0];
    if (!info || !host) return;
    const payload = `talos://pair?host=${encodeURIComponent(host)}&port=${info.port}&pin=${info.pin}`;
    void QRCode.toDataURL(payload, {
      width: 180, margin: 1, color: { dark: "#16121f", light: "#ffffff" }, errorCorrectionLevel: "M"
    }).then(setQrCode);
  }, [info]);

  async function copyConnection() {
    if (!info) return;
    await navigator.clipboard.writeText(`${info.addresses[0] ?? ""}:${info.port}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function updateMonitor(enabled: boolean) {
    setMonitorEnabled(enabled);
    localStorage.setItem("soundpad:monitor-enabled", String(enabled));
  }

  const connected = status === "Android conectado";
  const address = info ? `${info.addresses[0] ?? "Sem rede"}:${info.port}` : "Carregando...";
  const virtualMicReady = outputs.some((device) => isVirtualMic(device.label));
  const outputOptions = outputs.filter((device) => device.deviceId !== "default");
  const systemName = window.soundpadDesktop?.platform === "win32" ? "Windows" : "Mac";

  return (
    <main className="bridge">
      <header className="bridge-header">
        <div className="bridge-logo"><Radio size={20} /></div>
        <div><h1>Talos Connect</h1><p>Conecte o Talos às suas chamadas</p></div>
        <span className={`connection-light ${connected ? "online" : ""}`} />
      </header>

      <section className={`connection-state ${connected ? "online" : ""}`}>
        <div className="phone-icon"><Smartphone size={25} /></div>
        <div><strong>{connected ? "Celular conectado" : "Aguardando conexão"}</strong><span>{status}</span></div>
        <Wifi size={18} />
      </section>

      <section className="bridge-card pairing-card">
        {qrCode && <div className="qr-pair"><img src={qrCode} alt="QR Code para conectar o Android" /><div><strong>Escaneie pelo Android</strong><span>IP e PIN serão preenchidos automaticamente</span></div></div>}
        <div className="pairing-data"><div><label>COMPUTADOR</label><button className="address" onClick={copyConnection}><span>{address}</span>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><div><label>PIN</label><div className="bridge-pin">{info?.pin ?? "------"}</div></div></div>
      </section>

      <section className="bridge-card route-card">
        <div className="output-title"><Mic2 size={18} /><div><label>MIX DA CHAMADA</label><p>{virtualMicReady ? `${virtualMicName} · ${voiceReady ? "voz e áudios prontos" : "aguardando microfone"}` : "O Talos Mix precisa ser ativado"}</p></div><span className={`route-dot ${virtualMicReady && voiceReady ? "ready" : ""}`} /></div>

        <div className="monitor-row">
          <div className="output-title"><Headphones size={18} /><div><label>RETORNO</label><p>Ouça os pads no seu fone</p></div></div>
          <button className={`mini-toggle ${monitorEnabled ? "active" : ""}`} onClick={() => updateMonitor(!monitorEnabled)}>{monitorEnabled ? "Ligado" : "Desligado"}</button>
        </div>
        {monitorEnabled && <select value={monitorOutputId} onPointerDown={() => void refreshDevices()} onFocus={() => void refreshDevices()} onChange={(event) => { setMonitorOutputId(event.target.value); localStorage.setItem("soundpad:monitor-output", event.target.value); }}><option value="default">Saída padrão do {systemName}</option>{outputOptions.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Saída ${index + 1}`}</option>)}</select>}
      </section>

      <footer><Volume2 size={15} /><div><label>ÚLTIMO COMANDO</label><p>{nowPlaying}</p></div></footer>
    </main>
  );
}
