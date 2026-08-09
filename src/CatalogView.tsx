import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Grid3X3, LoaderCircle, Play, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import type { CatalogItem, SoundLayout, SoundPad } from "./types";
import "./catalog.css";

const categories = [
  ["Bombando", ""], ["Memes", "memes"], ["Games", "games"], ["Reações", "reactions"],
  ["Efeitos", "sound effects"], ["TikTok", "tiktok trends"], ["WhatsApp", "whatsapp audios"],
  ["Anime", "anime & manga"], ["Música", "music"], ["Filmes", "movies"], ["Esportes", "sports"]
] as const;

function shortenLabel(value: string, maxLength = 34) {
  const characters = Array.from(value.trim());
  return characters.length > maxLength ? `${characters.slice(0, maxLength - 1).join("").trimEnd()}…` : value;
}

interface CatalogViewProps {
  connected?: boolean;
  searchCatalog: (query?: string, category?: string) => Promise<CatalogItem[]>;
  playDirect: (item: CatalogItem) => Promise<void>;
  downloadAudio: (item: CatalogItem) => Promise<Blob>;
  layouts: SoundLayout[];
  libraryPads: SoundPad[];
  onAdd: (item: CatalogItem, blob: Blob, layoutId: string) => Promise<void>;
  onRemove: (sourceId: string) => Promise<void>;
  onBack: () => void;
}

export default function CatalogView({ connected = false, searchCatalog, playDirect, downloadAudio, layouts, libraryPads, onAdd, onRemove, onBack }: CatalogViewProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [pendingItem, setPendingItem] = useState<CatalogItem | null>(null);

  async function load(nextQuery = "", nextCategory = category) {
    setLoading(true);
    setMessage("");
    try {
      const results = await searchCatalog(nextQuery, nextCategory);
      setItems(results);
      if (!results.length) setMessage("Nenhum áudio encontrado");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar o catálogo");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load("", ""); }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    setCategory("");
    void load(query, "");
  }

  function selectCategory(value: string) {
    setCategory(value);
    setQuery("");
    void load("", value);
  }

  async function play(item: CatalogItem) {
    setBusyId(item.id);
    setMessage("");
    try {
      await playDirect(item);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível reproduzir o áudio");
    } finally {
      setBusyId("");
    }
  }

  async function add(item: CatalogItem, layoutId: string) {
    setBusyId(item.id);
    setMessage("");
    setPendingItem(null);
    try {
      await onAdd(item, await downloadAudio(item), layoutId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível adicionar à biblioteca");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="catalog-page">
      <header className="catalog-header"><button onClick={onBack}><ArrowLeft size={20} /></button><div><p className="eyebrow">MYINSTANTS</p><h1>Descobrir sons</h1></div><Sparkles size={22} /></header>
      <form className="catalog-search" onSubmit={submit}><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar memes, efeitos, frases..." minLength={2} /><button>Buscar</button></form>
      <div className="category-row">{categories.map(([label, value]) => <button key={label} className={category === value && !query ? "active" : ""} onClick={() => selectCategory(value)}>{label}</button>)}</div>
      <div className="catalog-meta"><span>{loading ? "Buscando..." : `${items.length} resultados`}</span><span>{connected ? "Reprodução no computador" : "Reprodução neste aparelho"}</span></div>
      {loading ? <div className="catalog-loading"><LoaderCircle size={28} /> Carregando sons</div> : message ? <div className="catalog-empty">{message}</div> : <section className="catalog-grid">{items.map((item) => { const existing = libraryPads.find((pad) => pad.sourceId === item.id); return <article key={item.id} className="catalog-item direct"><button className="catalog-play" aria-label={`Reproduzir ${item.name}`} onClick={() => void play(item)} disabled={busyId === item.id}>{busyId === item.id ? <LoaderCircle size={20} /> : <Play size={20} fill="currentColor" />}</button><button className="catalog-name" title={item.name} aria-label={`Reproduzir ${item.name}`} onClick={() => void play(item)} disabled={busyId === item.id}>{shortenLabel(item.name)}</button><button aria-label={existing ? `Remover ${item.name} da biblioteca` : `Adicionar ${item.name} à biblioteca`} className={`catalog-add ${existing ? "remove" : ""}`} onClick={() => existing ? void onRemove(item.id) : setPendingItem(item)} disabled={busyId === item.id}>{existing ? <Trash2 size={17} /> : <Plus size={18} />}</button></article>; })}</section>}
      {pendingItem && <div className="catalog-layout-backdrop"><section className="catalog-layout-picker"><header><div><span>ESCOLHER LAYOUT</span><h2>Adicionar “{shortenLabel(pendingItem.name, 28)}”</h2></div><button onClick={() => setPendingItem(null)}><X size={18} /></button></header><div>{layouts.map((layout) => { const full = layout.padIds.length >= layout.rows * layout.columns; return <button key={layout.id} disabled={full} onClick={() => void add(pendingItem, layout.id)}><Grid3X3 size={18} /><span><strong>{layout.name}</strong><small>{full ? "Layout cheio" : `${layout.padIds.length}/${layout.rows * layout.columns} posições`}</small></span></button>; })}</div></section></div>}
    </main>
  );
}
