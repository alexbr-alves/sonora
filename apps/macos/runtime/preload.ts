import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("soundpadDesktop", {
  platform: process.platform,
  registerShortcuts: (shortcuts: Array<{ id: string; accelerator: string }>) =>
    ipcRenderer.invoke("shortcuts:register", shortcuts),
  onShortcut: (callback: (id: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, id: string) => callback(id);
    ipcRenderer.on("shortcut:pressed", listener);
    return () => ipcRenderer.removeListener("shortcut:pressed", listener);
  },
  getRemoteInfo: () => ipcRenderer.invoke("remote:info"),
  onRemotePlay: (callback: (payload: { id: string; name: string; audioData: string; volume: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; name: string; audioData: string; volume: number }) => callback(payload);
    ipcRenderer.on("remote:play", listener);
    return () => ipcRenderer.removeListener("remote:play", listener);
  },
  onRemoteStop: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("remote:stop", listener);
    return () => ipcRenderer.removeListener("remote:stop", listener);
  },
  onRemoteStatus: (callback: (status: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
    ipcRenderer.on("remote:status", listener);
    return () => ipcRenderer.removeListener("remote:status", listener);
  }
});
