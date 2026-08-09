import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { CatalogItem } from "./types";

const origin = "https://www.myinstants.com";
const allowedCategories = new Set([
  "anime & manga", "games", "memes", "movies", "music", "politics", "pranks",
  "reactions", "sound effects", "sports", "television", "tiktok trends", "viral", "whatsapp audios"
]);

function decodeHtml(value: string) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function parseCatalog(html: string): CatalogItem[] {
  const items: CatalogItem[] = [];
  const pattern = /<button class="small-button" onclick="play\('([^']+)',\s*'[^']+',\s*'([^']+)'\)"[^>]*title="Tocar o som de ([^"]+)"/g;
  for (const match of html.matchAll(pattern)) {
    const [, audioPath, id, encodedName] = match;
    items.push({
      id,
      name: decodeHtml(encodedName),
      audioUrl: new URL(audioPath, origin).href,
      sourceUrl: new URL(`/pt/instant/${id}/`, origin).href
    });
  }
  return items.slice(0, 48);
}

function catalogUrl(query = "", category = "") {
  if (query.trim()) return `${origin}/pt/search/?name=${encodeURIComponent(query.trim())}`;
  if (category && allowedCategories.has(category)) return `${origin}/pt/categories/${encodeURIComponent(category)}/br/`;
  return `${origin}/pt/index/br/`;
}

function assertAudioUrl(value: string) {
  const url = new URL(value);
  if (url.origin !== origin || !url.pathname.startsWith("/media/sounds/")) {
    throw new Error("Endereço de áudio não permitido");
  }
  return url.href;
}

export async function searchCatalogOnDevice(query = "", category = "") {
  const url = catalogUrl(query, category);
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url, headers: { Accept: "text/html" }, responseType: "text" });
    if (response.status < 200 || response.status >= 300) throw new Error(`MyInstants respondeu ${response.status}`);
    return parseCatalog(String(response.data));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MyInstants respondeu ${response.status}`);
  return parseCatalog(await response.text());
}

export async function fetchCatalogAudioOnDevice(item: CatalogItem) {
  const url = assertAudioUrl(item.audioUrl);
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url, responseType: "arraybuffer" });
    if (response.status < 200 || response.status >= 300) throw new Error(`Áudio indisponível (${response.status})`);
    const base64 = String(response.data);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: response.headers["content-type"] ?? response.headers["Content-Type"] ?? "audio/mpeg" });
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Áudio indisponível (${response.status})`);
  return response.blob();
}
