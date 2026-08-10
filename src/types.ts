export type PadColor = "violet" | "cyan" | "amber" | "rose" | "lime" | "blue";

export interface SoundPad {
  id: string;
  name: string;
  fileName: string;
  shortcut?: string;
  volume: number;
  color: PadColor;
  duration?: number;
  sourceId?: string;
  actionType?: "sound" | "application";
  applicationId?: string;
  applicationIcon?: string;
  applicationAccent?: string;
}

export interface ComputerApplication {
  id: string;
  name: string;
  icon?: string;
}

export interface SoundLayout {
  id: string;
  name: string;
  rows: number;
  columns: number;
  padIds: string[];
}

export interface AudioDeviceOption {
  id: string;
  label: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  audioUrl: string;
  sourceUrl: string;
}
