/// <reference types="vite/client" />

interface Window {
  soundpadDesktop?: {
    platform: string;
    registerShortcuts: (shortcuts: Array<{ id: string; accelerator: string }>) =>
      Promise<Array<{ id: string; registered: boolean }>>;
    onShortcut: (callback: (id: string) => void) => () => void;
    getRemoteInfo: () => Promise<{ addresses: string[]; port: number; pin: string }>;
    onRemotePlay: (callback: (payload: { id: string; name: string; audioData: string; volume: number }) => void) => () => void;
    onRemoteStop: (callback: () => void) => () => void;
    onRemoteStatus: (callback: (status: string) => void) => () => void;
  };
}
