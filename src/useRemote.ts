import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogItem, ComputerApplication, SoundPad } from "./types";
import { getAudioBlob } from "./storage";
import { fetchCatalogAudioOnDevice, searchCatalogOnDevice } from "./catalogClient";

type RemoteMessage = {
  type: "paired" | "pair-error" | "error" | "catalog-results" | "catalog-played" | "catalog-audio-result" | "catalog-error" | "applications-results" | "application-launched" | "application-error";
  message?: string;
  requestId?: string;
  items?: CatalogItem[];
  audioData?: string;
  applications?: ComputerApplication[];
};

const reconnectGraceMs = 10 * 60 * 1000;
const reconnectDelayMs = 2_000;
const resumeUntilKey = "soundpad:remote-resume-until";
const remotePinKey = "soundpad:remote-pin";

export function useRemote() {
  const isMobile = Capacitor.isNativePlatform();
  const savedResumeUntil = Number(localStorage.getItem(resumeUntilKey) ?? 0);
  const [host, setHost] = useState(() => localStorage.getItem("soundpad:remote-host") ?? "");
  const [pin, setPin] = useState(() => savedResumeUntil > Date.now() ? localStorage.getItem(remotePinKey) ?? "" : "");
  const [status, setStatus] = useState("Informe o IP e o PIN mostrados no computador");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectUntil = useRef(savedResumeUntil > Date.now() ? savedResumeUntil : 0);
  const shouldReconnect = useRef(savedResumeUntil > Date.now());
  const reconnect = useRef<(targetHost: string, targetPin: string) => void>(() => undefined);
  const catalogRequests = useRef(new Map<string, { resolve: (items: CatalogItem[]) => void; reject: (error: Error) => void }>());
  const playRequests = useRef(new Map<string, { resolve: () => void; reject: (error: Error) => void }>());
  const audioRequests = useRef(new Map<string, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>());
  const localCatalogAudio = useRef<HTMLAudioElement | null>(null);
  const applicationRequests = useRef(new Map<string, { resolve: (applications: ComputerApplication[]) => void; reject: (error: Error) => void }>());
  const launchRequests = useRef(new Map<string, { resolve: () => void; reject: (error: Error) => void }>());

  const disconnect = useCallback(() => {
    shouldReconnect.current = false;
    reconnectUntil.current = 0;
    localStorage.removeItem(resumeUntilKey);
    localStorage.removeItem(remotePinKey);
    if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    const socket = socketRef.current;
    if (socket) socket.onclose = null;
    socket?.close();
    socketRef.current = null;
    setConnected(false);
    setStatus("Desconectado do computador");
  }, []);

  const connectTo = useCallback((targetHost: string, targetPin: string) => {
    const normalizedHost = targetHost.trim().replace(/^wss?:\/\//, "").replace(/\/$/, "");
    if (!normalizedHost || targetPin.length !== 6) {
      setStatus("Digite o IP do computador e o PIN de 6 numeros");
      return;
    }
    shouldReconnect.current = true;
    if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    const previousSocket = socketRef.current;
    if (previousSocket) previousSocket.onclose = null;
    previousSocket?.close();
    setStatus("Conectando ao computador...");
    const socket = new WebSocket(`ws://${normalizedHost.includes(":") ? normalizedHost : `${normalizedHost}:8765`}`);
    socketRef.current = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: "pair", pin: targetPin }));
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data) as RemoteMessage;
      if (message.type === "paired") {
        localStorage.setItem("soundpad:remote-host", normalizedHost);
        localStorage.setItem(remotePinKey, targetPin);
        if (document.visibilityState === "visible") {
          reconnectUntil.current = 0;
          localStorage.removeItem(resumeUntilKey);
        }
        setConnected(true);
        setStatus("Conectado ao computador");
      } else if (message.type === "pair-error" || message.type === "error") {
        setStatus(message.message ?? "Falha no pareamento");
      } else if (message.type === "catalog-results" && message.requestId) {
        catalogRequests.current.get(message.requestId)?.resolve(message.items ?? []);
        catalogRequests.current.delete(message.requestId);
      } else if (message.type === "catalog-played" && message.requestId) {
        playRequests.current.get(message.requestId)?.resolve();
        playRequests.current.delete(message.requestId);
      } else if (message.type === "catalog-audio-result" && message.requestId && message.audioData) {
        const request = audioRequests.current.get(message.requestId);
        if (request) request.resolve(await fetch(message.audioData).then((response) => response.blob()));
        audioRequests.current.delete(message.requestId);
      } else if (message.type === "catalog-error" && message.requestId) {
        const error = new Error(message.message ?? "Falha no catálogo");
        catalogRequests.current.get(message.requestId)?.reject(error);
        playRequests.current.get(message.requestId)?.reject(error);
        audioRequests.current.get(message.requestId)?.reject(error);
        catalogRequests.current.delete(message.requestId);
        playRequests.current.delete(message.requestId);
        audioRequests.current.delete(message.requestId);
      } else if (message.type === "applications-results" && message.requestId) {
        applicationRequests.current.get(message.requestId)?.resolve(message.applications ?? []);
        applicationRequests.current.delete(message.requestId);
      } else if (message.type === "application-launched" && message.requestId) {
        launchRequests.current.get(message.requestId)?.resolve();
        launchRequests.current.delete(message.requestId);
      } else if (message.type === "application-error" && message.requestId) {
        const error = new Error(message.message ?? "Não foi possível abrir o aplicativo");
        applicationRequests.current.get(message.requestId)?.reject(error);
        launchRequests.current.get(message.requestId)?.reject(error);
        applicationRequests.current.delete(message.requestId);
        launchRequests.current.delete(message.requestId);
      }
    };
    socket.onerror = () => setStatus("Não foi possível alcançar o computador");
    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null;
      setConnected(false);
      if (!shouldReconnect.current) {
        setStatus("Conexão encerrada");
        return;
      }
      if (reconnectUntil.current <= Date.now()) {
        reconnectUntil.current = Date.now() + reconnectGraceMs;
        localStorage.setItem(resumeUntilKey, String(reconnectUntil.current));
      }
      const remaining = reconnectUntil.current - Date.now();
      if (remaining <= 0) {
        shouldReconnect.current = false;
        localStorage.removeItem(resumeUntilKey);
        localStorage.removeItem(remotePinKey);
        setStatus("Conexão encerrada após 10 minutos");
        return;
      }
      setStatus("Conexão em espera · reconectando automaticamente");
      reconnectTimer.current = window.setTimeout(() => reconnect.current(normalizedHost, targetPin), Math.min(reconnectDelayMs, remaining));
    };
  }, []);

  useEffect(() => {
    reconnect.current = connectTo;
  }, [connectTo]);

  const connect = useCallback(() => connectTo(host, pin), [connectTo, host, pin]);

  const connectFromQr = useCallback((targetHost: string, targetPin: string) => {
    setHost(targetHost);
    setPin(targetPin);
    connectTo(targetHost, targetPin);
  }, [connectTo]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "hidden" && socketRef.current?.readyState === WebSocket.OPEN) {
        reconnectUntil.current = Date.now() + reconnectGraceMs;
        localStorage.setItem(resumeUntilKey, String(reconnectUntil.current));
        localStorage.setItem(remotePinKey, pin);
        shouldReconnect.current = true;
        return;
      }
      if (document.visibilityState === "visible" && reconnectUntil.current > Date.now() && socketRef.current?.readyState !== WebSocket.OPEN && host && pin) {
        reconnect.current(host, pin);
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    if (reconnectUntil.current > Date.now() && host && pin) reconnect.current(host, pin);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [host, pin]);

  useEffect(() => () => {
    if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    const socket = socketRef.current;
    if (socket) socket.onclose = null;
    socket?.close();
  }, []);

  const play = useCallback(async (pad: SoundPad) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    const blob = await getAudioBlob(pad.id);
    if (!blob) throw new Error("Arquivo de audio nao encontrado no celular");
    const audioData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    socket.send(JSON.stringify({ type: "play", padId: pad.id, name: pad.name, volume: pad.volume, audioData }));
  }, []);

  const stop = useCallback(() => {
    localCatalogAudio.current?.pause();
    if (localCatalogAudio.current) localCatalogAudio.current.currentTime = 0;
    localCatalogAudio.current = null;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "stop" }));
    }
  }, []);

  const searchCatalog = useCallback((query = "", category = "") => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return searchCatalogOnDevice(query, category);
    return new Promise<CatalogItem[]>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    catalogRequests.current.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ type: "catalog", requestId, query, category }));
    });
  }, []);

  const playCatalog = useCallback((item: CatalogItem) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      localCatalogAudio.current?.pause();
      return fetchCatalogAudioOnDevice(item).then(async (blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        localCatalogAudio.current = audio;
        const cleanup = () => {
          URL.revokeObjectURL(url);
          if (localCatalogAudio.current === audio) localCatalogAudio.current = null;
        };
        audio.addEventListener("ended", cleanup, { once: true });
        audio.addEventListener("error", cleanup, { once: true });
        await audio.play();
      });
    }
    return new Promise<void>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    playRequests.current.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ type: "catalog-play", requestId, id: item.id, name: item.name, audioUrl: item.audioUrl }));
    });
  }, []);

  const downloadCatalogAudio = useCallback((item: CatalogItem) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return fetchCatalogAudioOnDevice(item);
    return new Promise<Blob>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    audioRequests.current.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ type: "catalog-audio", requestId, audioUrl: item.audioUrl }));
    });
  }, []);

  const listApplications = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Conecte o Talos ao computador para ver os aplicativos"));
    return new Promise<ComputerApplication[]>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      applicationRequests.current.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ type: "applications", requestId }));
    });
  }, []);

  const launchApplication = useCallback((applicationId: string) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Conecte o Talos ao computador para abrir este aplicativo"));
    return new Promise<void>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      launchRequests.current.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ type: "launch-application", requestId, applicationId }));
    });
  }, []);

  return { isMobile, host, setHost, pin, setPin, status, setStatus, connected, connect, connectFromQr, disconnect, play, stop, searchCatalog, playCatalog, downloadCatalogAudio, listApplications, launchApplication };
}
