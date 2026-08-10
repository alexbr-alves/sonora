import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AppWindow, ArrowDown, ArrowLeft, ArrowUp, AudioLines, Grid3X3, Library, Link2, PanelRight,
  Pause, Plus, QrCode, RefreshCw, Search, Settings2, Trash2, Upload, Volume2, Wifi, X
} from "lucide-react";
import CatalogView from "../CatalogView";
import type { CatalogItem, ComputerApplication, SoundLayout, SoundPad } from "../types";
import "./mobileDeck.css";

type RemoteApi = {
  connected: boolean;
  status: string;
  host: string;
  pin: string;
  setHost: (value: string) => void;
  setPin: (value: string) => void;
  connect: () => void;
  disconnect: () => void;
  searchCatalog: (query?: string, category?: string) => Promise<CatalogItem[]>;
  playCatalog: (item: CatalogItem) => Promise<void>;
  downloadCatalogAudio: (item: CatalogItem) => Promise<Blob>;
  listApplications: () => Promise<ComputerApplication[]>;
};

interface MobileDeckProps {
  pads: SoundPad[];
  layouts: SoundLayout[];
  currentLayoutId: string;
  playing: string | null;
  remote: RemoteApi;
  onPlay: (pad: SoundPad) => Promise<void>;
  onStop: () => void;
  onScanQr: () => Promise<void>;
  onSetCurrentLayout: (id: string) => void;
  onSetLayouts: (layouts: SoundLayout[]) => void;
  onImportFiles: (files: File[], layoutId: string) => Promise<void>;
  onAddCatalog: (item: CatalogItem, blob: Blob, layoutId: string) => Promise<void>;
  onAddApplication: (application: ComputerApplication, layoutId: string) => Promise<void>;
  onSyncApplications: (applications: ComputerApplication[]) => Promise<void>;
  onDeletePad: (id: string) => Promise<void>;
}

type View = "deck" | "connection" | "layout" | "library" | "catalog" | "applications" | "edit";

function normalizeHostInput(value: string) {
  return value.replace(/^wss?:\/\//i, "").replace(/\s+/g, "").replace(/,/g, ".").replace(/[^a-zA-Z0-9.:[\]-]/g, "");
}

export default function MobileDeck(props: MobileDeckProps) {
  const { pads, layouts, currentLayoutId, playing, remote, onPlay, onStop, onScanQr, onSetCurrentLayout, onSetLayouts, onImportFiles, onAddCatalog, onAddApplication, onSyncApplications, onDeletePad } = props;
  const [view, setView] = useState<View>("deck");
  const [menuOpen, setMenuOpen] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [applications, setApplications] = useState<ComputerApplication[]>([]);
  const [applicationQuery, setApplicationQuery] = useState("");
  const [applicationError, setApplicationError] = useState("");
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [pendingApplication, setPendingApplication] = useState<ComputerApplication | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const deckPointerStart = useRef<{ x: number; y: number } | null>(null);
  const blockDeckTap = useRef(false);
  const currentLayout = layouts.find((layout) => layout.id === currentLayoutId) ?? layouts[0];
  const currentLayoutIndex = layouts.findIndex((layout) => layout.id === currentLayout.id);
  const padMap = new Map(pads.map((pad) => [pad.id, pad]));
  const capacity = currentLayout.rows * currentLayout.columns;
  const slots = Array.from({ length: capacity }, (_, index) => padMap.get(currentLayout.padIds[index]));

  useEffect(() => {
    if (view !== "deck") return;
    let wakeLock: { release: () => Promise<void> } | null = null;
    let disposed = false;

    async function keepDeckAwake() {
      if (disposed || document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch {
        // O sistema pode negar temporariamente em modo de economia de bateria.
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") void keepDeckAwake();
    }

    void keepDeckAwake();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      void wakeLock?.release();
    };
  }, [view]);

  function navigate(next: View) {
    setView(next);
    setMenuOpen(false);
  }

  function updateLayout(id: string, change: (layout: SoundLayout) => SoundLayout) {
    onSetLayouts(layouts.map((layout) => layout.id === id ? change(layout) : layout));
  }

  function createLayout() {
    const name = newLayoutName.trim();
    if (!name) return;
    const layout: SoundLayout = { id: crypto.randomUUID(), name, rows: 3, columns: 3, padIds: [] };
    onSetLayouts([...layouts, layout]);
    onSetCurrentLayout(layout.id);
    setNewLayoutName("");
    setView("edit");
  }

  function deleteLayout(id: string) {
    if (layouts.length === 1) return;
    const next = layouts.filter((layout) => layout.id !== id);
    onSetLayouts(next);
    if (currentLayoutId === id) onSetCurrentLayout(next[0].id);
  }

  function moveLayout(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= layouts.length) return;
    const next = [...layouts];
    [next[index], next[target]] = [next[target], next[index]];
    onSetLayouts(next);
  }

  function finishDeckSwipe(x: number, y: number) {
    const start = deckPointerStart.current;
    deckPointerStart.current = null;
    if (!start) return;
    const deltaX = x - start.x;
    const deltaY = y - start.y;
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    const target = currentLayoutIndex + (deltaX < 0 ? 1 : -1);
    if (target < 0 || target >= layouts.length) return;
    blockDeckTap.current = true;
    onSetCurrentLayout(layouts[target].id);
    window.setTimeout(() => { blockDeckTap.current = false; }, 250);
  }

  function movePad(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= currentLayout.padIds.length) return;
    updateLayout(currentLayout.id, (layout) => {
      const padIds = [...layout.padIds];
      [padIds[index], padIds[target]] = [padIds[target], padIds[index]];
      return { ...layout, padIds };
    });
  }

  async function chooseFiles(layoutId: string) {
    const files = pendingFiles;
    setPendingFiles([]);
    await onImportFiles(files, layoutId);
  }

  async function refreshApplications() {
    setApplicationsLoading(true);
    setApplicationError("");
    try {
      const found = await remote.listApplications();
      setApplications(found);
      await onSyncApplications(found);
    } catch (error) {
      setApplicationError(error instanceof Error ? error.message : "Não foi possível carregar os aplicativos");
    } finally {
      setApplicationsLoading(false);
    }
  }

  function openApplications() {
    setView("applications");
    void refreshApplications();
  }

  if (view === "catalog") {
    return <CatalogView connected={remote.connected} searchCatalog={remote.searchCatalog} playDirect={remote.playCatalog} stopDirect={onStop} downloadAudio={remote.downloadCatalogAudio} layouts={layouts} libraryPads={pads} onAdd={onAddCatalog} onRemove={(sourceId) => { const pad = pads.find((item) => item.sourceId === sourceId); return pad ? onDeletePad(pad.id) : Promise.resolve(); }} onBack={() => setView("library")} />;
  }


  if (view === "applications") {
    const visibleApplications = applications.filter((application) => application.name.toLocaleLowerCase().includes(applicationQuery.trim().toLocaleLowerCase()));
    return <><Page title="Aplicativos" kicker="COMPUTADOR" back={() => setView("library")}><div className="application-toolbar"><label><Search size={17} /><input placeholder="Pesquisar aplicativos..." value={applicationQuery} onChange={(event) => setApplicationQuery(event.target.value)} /></label><button aria-label="Atualizar aplicativos" disabled={applicationsLoading} onClick={() => void refreshApplications()}><RefreshCw size={17} className={applicationsLoading ? "spinning" : ""} /></button></div>{applicationError ? <section className="application-message glass-panel"><AppWindow size={27} /><strong>{applicationError}</strong><small>Abra o Talos Connect no computador e conecte novamente.</small></section> : <section className="application-list glass-list">{visibleApplications.map((application) => <article key={application.id}><button onClick={() => setPendingApplication(application)}>{application.icon ? <img src={application.icon} alt="" /> : <span><AppWindow size={20} /></span>}<strong>{application.name}</strong><Plus size={17} /></button></article>)}{!applicationsLoading && !visibleApplications.length && <div className="empty-library"><AppWindow size={28} /><strong>Nenhum aplicativo encontrado</strong><small>Atualize a lista ou tente outro termo.</small></div>}</section>}</Page>{pendingApplication && <LayoutPicker layouts={layouts} title={`Adicionar ${pendingApplication.name} em:`} onChoose={(layoutId) => { void onAddApplication(pendingApplication, layoutId); setPendingApplication(null); }} onClose={() => setPendingApplication(null)} />}</>;
  }

  let content: ReactNode;
  if (view === "connection") {
    content = <Page title="Conexão" kicker="COMPUTADOR"><section className="glass-panel connection-panel">{remote.connected ? <><div className="connection-hero connected"><Wifi size={30} /><div><strong>Computador conectado</strong><small>Os sons do deck serão enviados para a entrada virtual.</small></div></div><button className="glass-action secondary" onClick={remote.disconnect}>Desconectar</button></> : <><div className="connection-hero"><Link2 size={30} /><div><strong>Conectar ao computador</strong><small>Leia o QR Code ou informe os dados manualmente.</small></div></div><button className="glass-action primary" onClick={() => void onScanQr()}><QrCode size={19} /> Ler QR Code</button><div className="manual-connect"><div className="host-input"><input inputMode="text" placeholder="IP:porta" value={remote.host} onChange={(event) => remote.setHost(normalizeHostInput(event.target.value))} /><button aria-label="Inserir dois-pontos" onClick={() => remote.setHost(remote.host.includes(":") ? remote.host : `${remote.host}:`)}>:</button></div><input inputMode="numeric" className="pin" placeholder="PIN" maxLength={6} value={remote.pin} onChange={(event) => remote.setPin(event.target.value.replace(/\D/g, ""))} /><button onClick={remote.connect}>Conectar</button></div><small className="connection-status">{remote.status}</small></>}</section></Page>;
  } else if (view === "layout") {
    content = <Page title="Layouts" kicker="ORGANIZAÇÃO"><section className="layout-list glass-list">{layouts.map((layout, index) => <article className={layout.id === currentLayout.id ? "active" : ""} key={layout.id}><button onClick={() => onSetCurrentLayout(layout.id)}><span className="layout-preview"><Grid3X3 size={20} /></span><span><strong>{layout.name}</strong><small>{index + 1}º · {layout.columns}×{layout.rows} · {layout.padIds.length} sons</small></span></button><button aria-label={`Mover ${layout.name} para cima`} disabled={index === 0} onClick={() => moveLayout(index, -1)}><ArrowUp size={16} /></button><button aria-label={`Mover ${layout.name} para baixo`} disabled={index === layouts.length - 1} onClick={() => moveLayout(index, 1)}><ArrowDown size={16} /></button><button aria-label={`Editar ${layout.name}`} onClick={() => { onSetCurrentLayout(layout.id); setView("edit"); }}><Settings2 size={17} /></button><button aria-label={`Apagar ${layout.name}`} disabled={layouts.length === 1} onClick={() => deleteLayout(layout.id)}><Trash2 size={17} /></button></article>)}</section><div className="create-layout glass-panel"><input placeholder="Nome do novo layout" value={newLayoutName} onChange={(event) => setNewLayoutName(event.target.value)} /><button onClick={createLayout}><Plus size={17} /> Criar</button></div></Page>;
  } else if (view === "edit") {
    content = <Page title="Editar layout" kicker="GRADE" back={() => setView("layout")}><section className="grid-size glass-panel"><Grid3X3 size={21} /><input className="layout-name-input" aria-label="Nome do layout" value={currentLayout.name} onChange={(event) => updateLayout(currentLayout.id, (layout) => ({ ...layout, name: event.target.value }))} /><GridDimensionInput label="Linhas" value={currentLayout.rows} onCommit={(rows) => updateLayout(currentLayout.id, (layout) => ({ ...layout, rows }))} /><GridDimensionInput label="Colunas" value={currentLayout.columns} onCommit={(columns) => updateLayout(currentLayout.id, (layout) => ({ ...layout, columns }))} /></section><section className="layout-order-list">{currentLayout.padIds.map((id, index) => { const pad = padMap.get(id); if (!pad) return null; return <article className="glass-panel" key={id}><span>{index + 1}</span><strong>{pad.name}</strong><button disabled={index === 0} onClick={() => movePad(index, -1)}><ArrowUp size={16} /></button><button disabled={index === currentLayout.padIds.length - 1} onClick={() => movePad(index, 1)}><ArrowDown size={16} /></button><button onClick={() => updateLayout(currentLayout.id, (layout) => ({ ...layout, padIds: layout.padIds.filter((padId) => padId !== id) }))}><X size={16} /></button></article>; })}</section></Page>;
  } else if (view === "library") {
    content = <Page title="Biblioteca" kicker="SUAS AÇÕES"><div className="library-actions"><button className="glass-action primary" onClick={() => setView("catalog")}><Search size={18} /> Pesquisar sons</button><button className="glass-action" onClick={() => fileInput.current?.click()}><Upload size={18} /> Anexar áudio</button><button className="glass-action" disabled={!remote.connected} onClick={openApplications}><AppWindow size={18} /> Aplicativo do PC</button></div><input ref={fileInput} hidden multiple type="file" accept="audio/*" onChange={(event) => { const files = [...(event.target.files ?? [])].filter((file) => file.type.startsWith("audio/")); setPendingFiles(files); event.target.value = ""; }} /><section className="library-list glass-list">{pads.length ? pads.map((pad) => { const isPlaying = pad.actionType !== "application" && playing === pad.id; return <article key={pad.id}><button className="library-play" onClick={() => isPlaying ? onStop() : void onPlay(pad)}>{pad.actionType === "application" && pad.applicationIcon ? <img className="library-app-icon" src={pad.applicationIcon} alt="" /> : <span className={`sound-orb ${pad.color} ${isPlaying ? "playing" : ""}`}>{pad.actionType === "application" ? <AppWindow size={18} /> : isPlaying ? <Pause size={18} fill="currentColor" /> : <AudioLines size={18} />}</span>}<span className="library-item-copy"><strong>{pad.name}</strong><small>{pad.actionType === "application" ? "Abrir aplicativo" : isPlaying ? "Pausar reprodução" : "Reproduzir som"}</small></span></button><button aria-label={`Apagar ${pad.name}`} onClick={() => void onDeletePad(pad.id)}><Trash2 size={17} /></button></article>; }) : <div className="empty-library"><Library size={28} /><strong>Sua biblioteca está vazia</strong><small>Adicione um som ou aplicativo do computador.</small></div>}</section>{pendingFiles.length > 0 && <LayoutPicker layouts={layouts} title={`Adicionar ${pendingFiles.length} ${pendingFiles.length === 1 ? "som" : "sons"} em:`} onChoose={(id) => void chooseFiles(id)} onClose={() => setPendingFiles([])} />}</Page>;
  } else {
    content = <main className="stream-deck" onPointerDown={(event) => { deckPointerStart.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={(event) => finishDeckSwipe(event.clientX, event.clientY)} onPointerCancel={() => { deckPointerStart.current = null; }}><div className="deck-badge"><span className={`deck-status ${remote.connected ? "online" : ""}`} /><strong>{currentLayout.name}</strong></div><section className="stream-grid" style={{ gridTemplateColumns: `repeat(${currentLayout.columns},minmax(0,1fr))`, gridTemplateRows: `repeat(${currentLayout.rows},minmax(0,1fr))` }}>{slots.map((pad) => { if (!pad) return null; const isApplication = pad.actionType === "application"; const isPlaying = !isApplication && playing === pad.id; const unavailable = isApplication && !remote.connected; const accentStyle = isApplication && pad.applicationAccent ? { "--accent": pad.applicationAccent } as CSSProperties : undefined; return <button key={pad.id} style={accentStyle} disabled={unavailable} className={`deck-key ${pad.color} ${isApplication ? "application-key" : ""} ${isPlaying ? "playing" : ""} ${unavailable ? "unavailable" : ""}`} onClick={() => { if (!blockDeckTap.current) isPlaying ? onStop() : void onPlay(pad); }}><span className="key-sheen" /><div>{isApplication && pad.applicationIcon ? <img className="deck-app-icon" src={pad.applicationIcon} alt="" /> : isApplication ? <AppWindow size={30} /> : isPlaying ? <Pause size={30} fill="currentColor" /> : <AudioLines size={30} />}</div><strong>{pad.name}</strong></button>; })}</section>{layouts.length > 1 && <nav className="layout-dots" aria-label="Layouts">{layouts.map((layout) => <button key={layout.id} className={layout.id === currentLayout.id ? "active" : ""} aria-label={`Abrir layout ${layout.name}`} aria-current={layout.id === currentLayout.id ? "page" : undefined} onClick={() => onSetCurrentLayout(layout.id)} />)}</nav>}</main>;
  }

  return <>{content}<button className={`menu-trigger ${menuOpen ? "open" : ""}`} aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} onClick={() => setMenuOpen((open) => !open)}><PanelRight size={19} /></button>{menuOpen && <><button className="menu-scrim" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} /><aside className="deck-menu"><div className="menu-brand"><span className="brand-glow"><AudioLines size={19} /></span><div><strong>Talos</strong><small>{remote.connected ? "Conectado" : "Modo local"}</small></div></div><nav><MenuItem icon={<Grid3X3 />} label="Deck" active={view === "deck"} onClick={() => navigate("deck")} /><MenuItem icon={<Link2 />} label="Conexão" active={view === "connection"} onClick={() => navigate("connection")} /><MenuItem icon={<Settings2 />} label="Layout" active={view === "layout" || view === "edit"} onClick={() => navigate("layout")} /><MenuItem icon={<Library />} label="Biblioteca" active={view === "library"} onClick={() => navigate("library")} /></nav></aside></>}</>;
}

function GridDimensionInput({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  function commit() {
    const parsed = Number.parseInt(draft, 10);
    const next = Number.isFinite(parsed) ? Math.max(1, Math.min(5, parsed)) : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return <label>{label}<input type="number" inputMode="numeric" min="1" max="5" value={draft} onChange={(event) => { const next = event.target.value; if (!/^\d{0,2}$/.test(next)) return; setDraft(next); if (/^[1-5]$/.test(next) && Number(next) !== value) onCommit(Number(next)); }} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

function Page({ title, kicker, back, children }: { title: string; kicker: string; back?: () => void; children: ReactNode }) {
  return <main className="deck-page"><div className="page-ambient" /><header>{back && <button className="back-button" onClick={back}><ArrowLeft size={19} /></button>}<div><span>{kicker}</span><h1>{title}</h1></div></header><div className="page-content">{children}</div></main>;
}

function MenuItem({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}><span>{icon}</span>{label}</button>;
}

function LayoutPicker({ layouts, title, onChoose, onClose }: { layouts: SoundLayout[]; title: string; onChoose: (id: string) => void; onClose: () => void }) {
  return <div className="layout-picker-backdrop"><section className="layout-picker"><header><div><span>ESCOLHER LAYOUT</span><h2>{title}</h2></div><button onClick={onClose}><X size={19} /></button></header><div>{layouts.map((layout) => { const full = layout.padIds.length >= layout.rows * layout.columns; return <button disabled={full} key={layout.id} onClick={() => onChoose(layout.id)}><Grid3X3 size={19} /><span><strong>{layout.name}</strong><small>{full ? "Layout cheio" : `${layout.padIds.length}/${layout.rows * layout.columns} posições`}</small></span></button>; })}</div></section></div>;
}
