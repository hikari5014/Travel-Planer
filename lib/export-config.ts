// PDF export configuration shared between controls + preview.
// Phase 5 will replace the visual mock with @react-pdf/renderer; the shape of
// `ExportConfig` is the contract for that step.

export type PaperSize = "A4" | "A5" | "Letter";
export type Orientation = "portrait" | "landscape";
export type FontScale = "small" | "normal" | "large";
export type ColorMode = "color" | "mono";

export type SectionKey =
  | "cover"
  | "toc"
  | "tripMap"
  | "preTripNotes"
  | "packingChecklist"
  | "dailySchedule"
  | "dayMaps"
  | "costSummary"
  | "tickets"
  | "backCover";

export type ExportConfig = {
  paper: PaperSize;
  orientation: Orientation;
  fontScale: FontScale;
  color: ColorMode;
  sections: Record<SectionKey, boolean>;
};

export const defaultExportConfig: ExportConfig = {
  paper: "A4",
  orientation: "portrait",
  fontScale: "normal",
  color: "color",
  sections: {
    cover: true,
    toc: true,
    tripMap: true,
    preTripNotes: true,
    packingChecklist: true,
    dailySchedule: true,
    dayMaps: true,
    costSummary: true,
    tickets: true,
    backCover: true,
  },
};

// Paper dimensions in mm, portrait
const paperMm: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  Letter: { w: 215.9, h: 279.4 },
};

// Pixel-per-mm scale for the on-screen preview. 2.5 px/mm is roughly half-true
// size on a typical desktop, which keeps A4 readable while making A5 visibly
// smaller and Letter visibly different from A4.
const PX_PER_MM = 2.5;

// Compute the rendered pixel size of a page in the preview area.
// In landscape we swap width/height so the page genuinely re-orients
// (rather than being scaled into a portrait box).
export function paperPx(config: ExportConfig): { w: number; h: number } {
  const dims = paperMm[config.paper];
  const wMm = config.orientation === "portrait" ? dims.w : dims.h;
  const hMm = config.orientation === "portrait" ? dims.h : dims.w;
  return { w: Math.round(wMm * PX_PER_MM), h: Math.round(hMm * PX_PER_MM) };
}

export const fontScaleMul: Record<FontScale, number> = {
  small: 0.85,
  normal: 1,
  large: 1.18,
};

export const sectionLabels: Record<SectionKey, { label: string; description: string }> = {
  cover: { label: "封面", description: "旅程名稱 + 日期 + 主視覺" },
  toc: { label: "目錄", description: "頁碼索引" },
  tripMap: { label: "全趟地圖", description: "整趟旅程的大張全域地圖（每天用不同顏色）" },
  preTripNotes: { label: "行前注意事項", description: "天氣、文件、緊急聯絡（中英對照）" },
  packingChecklist: { label: "行李 checklist", description: "可勾選打包清單" },
  dailySchedule: { label: "每日行程", description: "時間軸 + 景點 + 移動段" },
  dayMaps: { label: "每日地圖縮圖", description: "Static Maps 路線圖（每日各 1 張）" },
  costSummary: { label: "費用總表", description: "各分類加總、幣別小計" },
  tickets: { label: "票卷附頁", description: "訂位編號、QR Code 預留" },
  backCover: { label: "封底", description: "聯絡資訊 + 製作標記" },
};

// Estimated pages per section based on typical content density.
const sectionPages: Record<SectionKey, number> = {
  cover: 1,
  toc: 1,
  tripMap: 1,
  preTripNotes: 2,
  packingChecklist: 1,
  dailySchedule: 7, // 7 days, 1 page each (rough)
  dayMaps: 0, // included inline with daily schedule, not separate
  costSummary: 1,
  tickets: 1,
  backCover: 1,
};

export function estimatePageCount(config: ExportConfig): number {
  return (Object.keys(config.sections) as SectionKey[]).reduce(
    (n, k) => n + (config.sections[k] ? sectionPages[k] : 0),
    0,
  );
}
