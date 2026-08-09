import { getAudioBlob } from "./storage";

type SinkableAudio = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };

export class AudioEngine {
  private active = new Map<string, HTMLAudioElement>();
  private outputDeviceId = "default";
  private masterVolume = 0.85;

  setOutputDevice(id: string) {
    this.outputDeviceId = id;
  }

  setMasterVolume(volume: number) {
    this.masterVolume = volume;
    this.active.forEach((audio) => {
      const padVolume = Number(audio.dataset.padVolume ?? 1);
      audio.volume = Math.min(1, padVolume * this.masterVolume);
    });
  }

  async play(id: string, padVolume: number, exclusive: boolean): Promise<void> {
    if (exclusive) this.stopAll();
    else this.stop(id);

    const blob = await getAudioBlob(id);
    if (!blob) throw new Error("Arquivo de audio nao encontrado");

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url) as SinkableAudio;
    audio.dataset.padVolume = String(padVolume);
    audio.volume = Math.min(1, padVolume * this.masterVolume);

    if (audio.setSinkId && this.outputDeviceId !== "default") {
      await audio.setSinkId(this.outputDeviceId);
    }

    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (this.active.get(id) === audio) this.active.delete(id);
    };
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });
    this.active.set(id, audio);
    await audio.play();
  }

  stop(id: string) {
    const audio = this.active.get(id);
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    this.active.delete(id);
  }

  stopAll() {
    [...this.active.keys()].forEach((id) => this.stop(id));
  }

  isPlaying(id: string) {
    return this.active.has(id);
  }
}
