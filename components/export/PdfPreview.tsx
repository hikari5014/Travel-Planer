"use client";

import { Star, MapPin, Sparkles, Check } from "lucide-react";
import {
  fmtDistance,
  fmtDuration,
  getPlace,
  modeLabel,
  mockDays,
  mockPlans,
  type MockDay,
} from "@/lib/mock-schedule";
import {
  fontScaleMul,
  paperPx,
  type ExportConfig,
} from "@/lib/export-config";
import { PlaceIconBare, PlaceIconChip } from "@/lib/place-icon";
import {
  defaultCurrencySettings,
  formatCurrency,
  mockRates,
} from "@/lib/currency";

const tripTitle = "京都七日漫遊";
const tripSubtitle = "Kyoto · Spring 2026";
const tripDates = "2026.05.12 – 05.18";
const author = "個人計畫 · L.";

export function PdfPreview({ config }: { config: ExportConfig }) {
  const fs = fontScaleMul[config.fontScale];
  const isMono = config.color === "mono";

  // Day 3 is the populated demo day
  const sampleDay = mockDays.find((d) => d.id === "d3")!;

  const pages: { node: React.ReactNode; label: string }[] = [];
  if (config.sections.cover) {
    pages.push({
      label: "封面",
      node: <CoverPage isMono={isMono} fs={fs} landscape={config.orientation === "landscape"} />,
    });
  }
  if (config.sections.toc) {
    pages.push({ label: "目錄", node: <TocPage config={config} fs={fs} isMono={isMono} /> });
  }
  if (config.sections.tripMap) {
    pages.push({
      label: "全趟地圖",
      node: <TripMapPage isMono={isMono} fs={fs} landscape={config.orientation === "landscape"} />,
    });
  }
  if (config.sections.preTripNotes) {
    pages.push({ label: "行前注意事項", node: <PreTripNotesPage isMono={isMono} fs={fs} /> });
  }
  if (config.sections.packingChecklist) {
    pages.push({ label: "行李 checklist", node: <PackingChecklistPage isMono={isMono} fs={fs} /> });
  }
  if (config.sections.dailySchedule) {
    // For demo we show one full populated Day 3 spread; in Phase 5 each day would render
    pages.push({
      label: "Day 3 行程",
      node: (
        <DayPage
          day={sampleDay}
          showMap={config.sections.dayMaps}
          isMono={isMono}
          fs={fs}
        />
      ),
    });
  }
  if (config.sections.costSummary) {
    pages.push({ label: "費用總表", node: <CostSummaryPage isMono={isMono} fs={fs} /> });
  }
  if (config.sections.tickets) {
    pages.push({ label: "票卷附頁", node: <TicketsPage isMono={isMono} fs={fs} /> });
  }
  if (config.sections.backCover) {
    pages.push({ label: "封底", node: <BackCoverPage isMono={isMono} fs={fs} /> });
  }

  return (
    <div className="flex h-full flex-col items-center gap-6 overflow-y-auto bg-surface-soft px-6 py-8">
      {pages.map((p, idx) => (
        <PageFrame key={idx} index={idx + 1} total={pages.length} label={p.label} config={config}>
          {p.node}
        </PageFrame>
      ))}
      {pages.length === 0 && (
        <div className="mt-12 rounded-md border border-dashed border-hairline bg-canvas p-12 text-center text-caption text-muted-soft">
          所有章節已關閉 · 至少需要一個章節才能匯出
        </div>
      )}
    </div>
  );
}

function PageFrame({
  index,
  total,
  label,
  config,
  children,
}: {
  index: number;
  total: number;
  label: string;
  config: ExportConfig;
  children: React.ReactNode;
}) {
  const { w, h } = paperPx(config);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-muted-soft">
        <span>頁 {index} / {total} · {label}</span>
        <span className="font-mono">{config.paper} · {config.orientation === "portrait" ? "210×297mm" : "297×210mm"}</span>
      </div>
      <div
        style={{ width: w, height: h }}
        className="relative overflow-hidden rounded-sm bg-white shadow-pop"
      >
        {children}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Page 1: Cover
// ───────────────────────────────────────────────────────────
function CoverPage({ isMono, fs, landscape }: { isMono: boolean; fs: number; landscape: boolean }) {
  const accent = isMono ? "#111111" : "#3b82f6";
  // In landscape we use a side band (left half) instead of a top band so the
  // headline layout reads naturally. Portrait keeps the classic top band.
  return (
    <div className="relative h-full w-full">
      {/* Color band */}
      <div
        className="absolute"
        style={{
          ...(landscape
            ? { left: 0, top: 0, bottom: 0, width: "46%" }
            : { left: 0, right: 0, top: 0, height: "44%" }),
          background: isMono
            ? landscape
              ? "linear-gradient(90deg, #f3f4f6, #ffffff)"
              : "linear-gradient(180deg, #f3f4f6, #ffffff)"
            : "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 60%, #ec4899 100%)",
        }}
      >
        {/* Decorative grid pattern */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 580 360" preserveAspectRatio="none">
          <defs>
            <pattern id="cover-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" opacity="0.25" />
            </pattern>
          </defs>
          <rect width="580" height="360" fill="url(#cover-grid)" />
        </svg>
      </div>

      {/* Content sits inside the band in landscape (left half) and below the
          band in portrait (top to bottom). */}
      <div
        className={`relative z-10 flex h-full flex-col justify-between ${
          landscape ? "py-10 pl-10 pr-10" : "px-12 pt-16 pb-10"
        }`}
        style={landscape ? { width: "46%" } : undefined}
      >
        <div>
          <p
            className="font-mono uppercase tracking-widest"
            style={{ color: isMono ? "#374151" : "#ffffff", fontSize: 11 * fs, opacity: 0.85 }}
          >
            TRAVEL HANDBOOK · 2026
          </p>
          <h1
            className="mt-3 leading-[1.05]"
            style={{
              color: isMono ? "#111111" : "#ffffff",
              fontSize: (landscape ? 44 : 56) * fs,
              fontWeight: 600,
              letterSpacing: "-2px",
            }}
          >
            {tripTitle}
          </h1>
          <p
            className="mt-1 italic"
            style={{
              color: isMono ? "#374151" : "rgba(255,255,255,0.85)",
              fontSize: 16 * fs,
              fontWeight: 400,
            }}
          >
            {tripSubtitle}
          </p>
        </div>

        <div className="space-y-3">
          <div className="inline-flex flex-col rounded-md bg-white/95 px-4 py-3" style={{ color: "#111111" }}>
            <span className="text-[10px] uppercase tracking-widest text-muted">日期</span>
            <span className="font-mono" style={{ fontSize: 18 * fs }}>{tripDates}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <Stat label="天數" value="7 天" mono={isMono} fs={fs} />
            <Stat label="景點" value="14" mono={isMono} fs={fs} />
            <Stat label="預估" value="NT$ 78,400" mono={isMono} fs={fs} />
          </div>

          <p style={{ color: isMono ? "#6b7280" : "#ffffff", fontSize: 11 * fs, opacity: 0.85 }}>
            製作 · {author}
          </p>
        </div>
      </div>

      {/* Landscape: right side decorative panel */}
      {landscape && (
        <div
          className="absolute bottom-0 right-0 top-0 flex items-center justify-center"
          style={{ width: "54%", color: isMono ? "#111" : "#374151" }}
        >
          <div className="px-12 text-right">
            <p className="text-[10px] uppercase tracking-widest text-muted-soft">PREPARED WITH</p>
            <p className="mt-1" style={{ fontSize: 22 * fs, fontWeight: 600, letterSpacing: "-0.4px" }}>
              旅遊規劃Z
            </p>
            <p className="mt-1 text-muted-soft" style={{ fontSize: 11 * fs }}>個人用 · v0.1</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono, fs }: { label: string; value: string; mono: boolean; fs: number }) {
  return (
    <div className="rounded-sm bg-white/90 px-3 py-2" style={{ color: "#111111" }}>
      <p className="text-[10px] uppercase tracking-wide text-muted-soft">{label}</p>
      <p className="font-mono leading-tight" style={{ fontSize: 14 * fs }}>{value}</p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Page 2: TOC
// ───────────────────────────────────────────────────────────
function TocPage({ config, fs, isMono }: { config: ExportConfig; fs: number; isMono: boolean }) {
  const accent = isMono ? "#111111" : "#3b82f6";
  const items: { label: string; page: number; sub?: string }[] = [];
  let p = 1;
  if (config.sections.cover) p++; // cover takes 1 page (page 1)
  if (config.sections.preTripNotes) {
    items.push({ label: "行前注意事項", page: p + 1, sub: "天氣 · 入境文件 · 緊急聯絡" });
    p += 2;
  }
  if (config.sections.packingChecklist) {
    items.push({ label: "行李 checklist", page: p + 1, sub: "中英對照 · 可勾選" });
    p += 1;
  }
  if (config.sections.dailySchedule) {
    items.push({ label: "Day 3 · 5/14 京都東山", page: p + 1, sub: "清水寺 · 二年坂 · 伏見稻荷 · 5 個項目" });
    p += 1;
  }
  if (config.sections.costSummary) {
    items.push({ label: "費用總表", page: p + 1, sub: "食 / 住 / 行 / 票卷 / 其他" });
    p += 1;
  }
  if (config.sections.tickets) {
    items.push({ label: "票卷附頁", page: p + 1, sub: "訂位編號 · QR Code" });
    p += 1;
  }

  return (
    <div className="h-full px-12 py-12" style={{ color: "#111111" }}>
      <div className="mb-8 flex items-end justify-between border-b pb-4" style={{ borderColor: "#e5e7eb" }}>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-soft">CONTENTS</p>
          <h2 style={{ fontSize: 32 * fs, fontWeight: 600, letterSpacing: "-1px" }}>目錄</h2>
        </div>
        <p style={{ fontSize: 11 * fs }} className="text-muted">{tripTitle}</p>
      </div>
      <ul className="space-y-3">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-baseline justify-between border-b pb-2"
            style={{ borderColor: "#f3f4f6" }}
          >
            <div className="flex min-w-0 items-baseline gap-3">
              <span
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px]"
                style={{ background: accent + "15", color: accent, fontWeight: 600 }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p style={{ fontSize: 15 * fs, fontWeight: 500 }}>{it.label}</p>
                {it.sub && <p style={{ fontSize: 11 * fs }} className="text-muted">{it.sub}</p>}
              </div>
            </div>
            <span
              className="font-mono"
              style={{ fontSize: 13 * fs, color: accent }}
            >
              {it.page.toString().padStart(2, "0")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Page: Trip-wide map (overview of all days)
// ───────────────────────────────────────────────────────────
function TripMapPage({ isMono, fs, landscape }: { isMono: boolean; fs: number; landscape: boolean }) {
  const accent = isMono ? "#111111" : "#3b82f6";

  // Demo: pretend each day visits a subset of the 6 mock places, with its own
  // route color. In Phase 5 this is built from real Day → ScheduleItem → Place.
  const dayRoutes = [
    { day: 1, label: "Day 1 · 5/12 · 抵達+清水", color: isMono ? "#111111" : "#3b82f6", placeIds: ["hotel", "kiyomizu"] },
    { day: 2, label: "Day 2 · 5/13 · 嵐山一日", color: isMono ? "#374151" : "#8b5cf6", placeIds: ["hotel", "ninenzaka", "machiya"] },
    { day: 3, label: "Day 3 · 5/14 · 東山線", color: isMono ? "#6b7280" : "#ec4899", placeIds: ["hotel", "kiyomizu", "ninenzaka", "machiya", "fushimi", "ramen"] },
    { day: 4, label: "Day 4 · 5/15 · 伏見+宇治", color: isMono ? "#9ca3af" : "#fb923c", placeIds: ["hotel", "fushimi", "ramen"] },
    { day: 5, label: "Day 5 · 5/16 · 金閣龍安", color: isMono ? "#111111" : "#34d399", placeIds: ["hotel", "ninenzaka"] },
    { day: 6, label: "Day 6 · 5/17 · 鴨川+市場", color: isMono ? "#374151" : "#f59e0b", placeIds: ["hotel", "machiya", "ramen"] },
    { day: 7, label: "Day 7 · 5/18 · 返程", color: isMono ? "#6b7280" : "#0ea5e9", placeIds: ["hotel"] },
  ];

  return (
    <div
      className="flex h-full flex-col"
      style={{ color: "#111111" }}
    >
      {/* Header strip */}
      <div className="flex items-end justify-between border-b px-10 py-4" style={{ borderColor: "#e5e7eb" }}>
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>
            TRIP OVERVIEW
          </p>
          <h2 style={{ fontSize: 28 * fs, fontWeight: 600, letterSpacing: "-0.5px" }}>
            全趟路線地圖
          </h2>
        </div>
        <div className="text-right" style={{ fontSize: 11 * fs }}>
          <p className="text-muted">{tripDates}</p>
          <p className="font-mono">7 天 · 14 個景點 · 142 km</p>
        </div>
      </div>

      <div
        className={`flex flex-1 overflow-hidden ${landscape ? "flex-row" : "flex-col"} px-6 py-4 gap-4`}
      >
        {/* Big map */}
        <div
          className="relative overflow-hidden rounded-md border bg-white"
          style={{
            borderColor: "#e5e7eb",
            flex: landscape ? "1 1 auto" : "1 1 auto",
            minHeight: landscape ? undefined : 0,
          }}
        >
          <TripWideMap routes={dayRoutes} isMono={isMono} />
        </div>

        {/* Legend */}
        <div
          className={`flex flex-shrink-0 ${landscape ? "w-[200px] flex-col" : "flex-row flex-wrap"} gap-1.5`}
          style={{ fontSize: 10 * fs }}
        >
          <p className={`${landscape ? "" : "w-full"} text-[10px] uppercase tracking-widest text-muted-soft`}>
            每日路線
          </p>
          {dayRoutes.map((r) => (
            <div
              key={r.day}
              className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 ${landscape ? "w-full" : ""}`}
              style={{ borderColor: "#e5e7eb" }}
            >
              <span
                className="block h-3 w-3 flex-shrink-0 rounded-full"
                style={{ background: r.color }}
              />
              <span className="truncate">{r.label}</span>
            </div>
          ))}
          {!landscape && <div className="w-full" />}
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-10 py-2 text-[10px] text-muted-soft" style={{ borderColor: "#f3f4f6" }}>
        <span>{tripTitle} · 全趟地圖</span>
        <span>示意 · Phase 5 接 Static Maps</span>
      </div>
    </div>
  );
}

function TripWideMap({
  routes,
  isMono,
}: {
  routes: { day: number; label: string; color: string; placeIds: string[] }[];
  isMono: boolean;
}) {
  return (
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
      <rect width="1000" height="1000" fill="#fafafa" />
      <defs>
        <pattern id="trip-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="1000" height="1000" fill="url(#trip-grid)" />

      {/* Geography hints */}
      <path
        d="M 380 0 Q 420 200 410 400 T 430 700 Q 450 850 470 1000"
        stroke="#dbeafe"
        strokeWidth="32"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M 700 200 Q 800 250 850 400 Q 900 550 850 720 Q 780 880 700 1000 L 1000 1000 L 1000 0 L 700 0 Z"
        fill="#f3f4f6"
        opacity="0.9"
      />

      <g fill="#9ca3af" fontSize="14" fontFamily="Inter, sans-serif">
        <text x="190" y="110">下京區</text>
        <text x="780" y="270">東山區</text>
        <text x="600" y="850">伏見區</text>
        <text x="60" y="600">中京區</text>
      </g>

      {/* Render each day's polyline with its color */}
      {routes.map((r) => {
        const pts = r.placeIds
          .map((id) => getPlace(id))
          .filter((p): p is NonNullable<ReturnType<typeof getPlace>> => !!p);
        if (pts.length < 2) return null;
        const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.mapX} ${p.mapY}`).join(" ");
        return (
          <g key={r.day}>
            <path d={path} stroke={r.color} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.12" />
            <path d={path} stroke={r.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
          </g>
        );
      })}

      {/* Place markers (numbered, all visited) */}
      {Array.from(
        new Set(routes.flatMap((r) => r.placeIds)),
      ).map((id, idx) => {
        const p = getPlace(id);
        if (!p) return null;
        return (
          <g key={id} transform={`translate(${p.mapX} ${p.mapY})`}>
            <ellipse cx="0" cy="38" rx="14" ry="3" fill="#111" opacity="0.18" />
            <path
              d="M 0 -36 C -16 -36 -22 -22 -22 -10 C -22 8 0 30 0 30 C 0 30 22 8 22 -10 C 22 -22 16 -36 0 -36 Z"
              fill="#1f2937"
              stroke="#111111"
              strokeWidth="1"
            />
            <circle cx="0" cy="-13" r="11" fill="#ffffff" />
            <text
              x="0"
              y="-9"
              textAnchor="middle"
              fontSize="13"
              fontWeight="600"
              fill="#111111"
              fontFamily="Inter, sans-serif"
            >
              {idx + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ───────────────────────────────────────────────────────────
// Page: Pre-trip notes
// ───────────────────────────────────────────────────────────
function PreTripNotesPage({ isMono, fs }: { isMono: boolean; fs: number }) {
  const accent = isMono ? "#111111" : "#3b82f6";
  return (
    <div className="h-full px-12 py-12" style={{ color: "#111111" }}>
      <div className="mb-6 flex items-center gap-2">
        <Sparkles size={14} strokeWidth={1.8} style={{ color: accent }} />
        <span className="text-[10px] uppercase tracking-widest text-muted">AI · PRE-TRIP NOTES</span>
      </div>
      <h2 style={{ fontSize: 28 * fs, fontWeight: 600, letterSpacing: "-0.5px" }}>行前注意事項</h2>
      <p className="mt-1 text-muted" style={{ fontSize: 12 * fs }}>
        依目的地、季節與行程內容 AI 自動產生。
      </p>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
        <Block title="天氣 / Weather" accent={accent} fs={fs}>
          5 月中下旬 京都平均 13–24 °C，偶有春雨。建議洋蔥式穿搭、輕便雨具。
        </Block>
        <Block title="貨幣 / Currency" accent={accent} fs={fs}>
          當地：日圓（JPY）。1 TWD ≈ 4.76 JPY。建議市區現金 + IC 卡（ICOCA / Suica）。
        </Block>
        <Block title="插座 / Plug" accent={accent} fs={fs}>
          A 型雙腳，100V/50–60Hz · Type A · 不需轉接頭，台灣插頭可直接使用。
        </Block>
        <Block title="語言 / Language" accent={accent} fs={fs}>
          日文為主；觀光區英文標示充足。基本片語：すみません（不好意思）。
        </Block>
        <Block title="文件 / Documents" accent={accent} fs={fs}>
          護照（Passport）、入境表（Disembarkation Card）、海關申報（Customs Declaration）。
        </Block>
        <Block title="健康 / Health" accent={accent} fs={fs}>
          備感冒藥（Cold medicine）、止瀉藥（Anti-diarrheal）、暈車藥（Motion sickness pills）。
        </Block>
      </div>

      <div className="mt-6 rounded-md border p-3" style={{ borderColor: accent + "55", background: accent + "08" }}>
        <p className="text-[11px] uppercase tracking-widest" style={{ color: accent }}>
          緊急聯絡 / Emergency Contacts
        </p>
        <div className="mt-1.5 grid grid-cols-3 gap-3 text-caption">
          <div>
            <p className="text-muted-soft">警察 Police</p>
            <p className="font-mono">110</p>
          </div>
          <div>
            <p className="text-muted-soft">救護 Ambulance</p>
            <p className="font-mono">119</p>
          </div>
          <div>
            <p className="text-muted-soft">台北駐日辦 TECRO</p>
            <p className="font-mono">+81-3-3280-7811</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({
  title,
  accent,
  fs,
  children,
}: {
  title: string;
  accent: string;
  fs: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: accent }}>
      <p className="text-[11px] uppercase tracking-widest text-muted" style={{ fontSize: 10 * fs }}>
        {title}
      </p>
      <p className="mt-1" style={{ fontSize: 12 * fs, lineHeight: 1.6 }}>
        {children}
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Page: Packing checklist
// ───────────────────────────────────────────────────────────
const checklistData = [
  {
    name_zh: "證件 / Documents",
    items: [
      { zh: "護照", en: "Passport", essential: true },
      { zh: "登機證", en: "Boarding Pass", essential: true },
      { zh: "信用卡 / 現金", en: "Credit Card / Cash", essential: true },
      { zh: "海外旅平險證明", en: "Travel Insurance Document", essential: true },
    ],
  },
  {
    name_zh: "電子用品 / Electronics",
    items: [
      { zh: "手機充電線", en: "Phone Charger", essential: true },
      { zh: "行動電源", en: "Power Bank", essential: false, note: "≤ 20,000mAh 機上行李" },
      { zh: "相機 / 記憶卡", en: "Camera / SD Card", essential: false },
    ],
  },
  {
    name_zh: "藥品 / Medication",
    items: [
      { zh: "感冒藥", en: "Cold medicine", essential: false },
      { zh: "止瀉藥", en: "Anti-diarrheal", essential: false },
      { zh: "OK 繃", en: "Band-aids", essential: false },
    ],
  },
  {
    name_zh: "日用 / Daily",
    items: [
      { zh: "牙刷牙膏", en: "Toothbrush / paste", essential: false },
      { zh: "保養品", en: "Skincare", essential: false },
      { zh: "雨傘 / 雨衣", en: "Umbrella / Raincoat", essential: false, note: "5 月雨季備用" },
    ],
  },
];

function PackingChecklistPage({ isMono, fs }: { isMono: boolean; fs: number }) {
  const accent = isMono ? "#111111" : "#3b82f6";
  return (
    <div className="h-full px-12 py-12" style={{ color: "#111111" }}>
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-widest text-muted">CHECKLIST</p>
        <h2 style={{ fontSize: 28 * fs, fontWeight: 600, letterSpacing: "-0.5px" }}>
          行李 checklist
        </h2>
        <p className="mt-1 text-muted" style={{ fontSize: 12 * fs }}>
          中英對照 · 可勾選確認。星號為必備。
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        {checklistData.map((cat) => (
          <div key={cat.name_zh}>
            <p
              className="mb-2 border-b pb-1 text-[11px] font-medium uppercase tracking-wide"
              style={{ borderColor: accent + "33", color: accent, fontSize: 11 * fs }}
            >
              {cat.name_zh}
            </p>
            <ul className="space-y-1">
              {cat.items.map((item) => (
                <li key={item.zh} className="flex items-start gap-2" style={{ fontSize: 11 * fs }}>
                  <span
                    className="mt-0.5 inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-sm border"
                    style={{ borderColor: "#9ca3af" }}
                  />
                  <span className="flex-1">
                    <span style={{ fontWeight: 500 }}>{item.zh}</span>
                    <span className="ml-1 text-muted">· {item.en}</span>
                    {item.essential && (
                      <span className="ml-1" style={{ color: accent }}>★</span>
                    )}
                    {item.note && <span className="block text-[10px] text-muted-soft">— {item.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Page: Day spread (timeline + map)
// ───────────────────────────────────────────────────────────
function DayPage({ day, showMap, isMono, fs }: { day: MockDay; showMap: boolean; isMono: boolean; fs: number }) {
  const accent = isMono ? "#111111" : "#3b82f6";
  const timed = day.items.filter((i) => !i.isAllDay);
  const transportsByFrom = new Map<string, (typeof day.transports)[number]>();
  for (const t of day.transports) transportsByFrom.set(t.fromItemId, t);

  return (
    <div className="flex h-full flex-col" style={{ color: "#111111" }}>
      <div className="border-b px-10 py-5" style={{ borderColor: "#e5e7eb" }}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>
              DAY {day.dayIndex} · {formatFull(day.date)}
            </p>
            <h2 className="mt-0.5" style={{ fontSize: 28 * fs, fontWeight: 600, letterSpacing: "-0.5px" }}>
              京都東山・伏見稻荷
            </h2>
          </div>
          <div className="text-right" style={{ fontSize: 11 * fs }}>
            <p className="text-muted">{timed.length} 個景點</p>
            <p className="font-mono">{timed[0]?.startTime} – {timed[timed.length - 1]?.endTime}</p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-10 py-5">
        {/* Timeline */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          {timed.map((item, idx) => {
            const place = getPlace(item.placeId);
            if (!place) return null;
            const t = idx < timed.length - 1 ? transportsByFrom.get(item.id) : undefined;
            return (
              <div key={item.id}>
                <div
                  className="flex items-stretch gap-2 rounded border-l-2 bg-white"
                  style={{ borderColor: accent }}
                >
                  <div className="w-12 pt-1.5 pl-1.5 text-right" style={{ fontSize: 10 * fs }}>
                    <p className="font-mono leading-tight">{item.startTime}</p>
                    <p className="font-mono leading-tight text-muted-soft">{item.endTime}</p>
                  </div>
                  <div className="flex-1 py-1.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      <PlaceIconBare iconKey={place.iconKey} size={10} />
                      <p style={{ fontSize: 12 * fs, fontWeight: 500 }} className="leading-tight">
                        {place.name}
                      </p>
                      {item.hasTicket && (
                        <span
                          className="rounded-sm px-1 text-[9px]"
                          style={{ background: "#fef3c7", color: "#854d0e" }}
                        >
                          🎫
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-muted" style={{ fontSize: 10 * fs }}>
                      <Star size={8} strokeWidth={0} fill={isMono ? "#374151" : "#fb923c"} className="-mt-0.5 mr-0.5 inline" />
                      {place.rating} · {place.category} · {fmtMinutes(item.durationMin)}
                    </p>
                  </div>
                </div>
                {t && (
                  <div
                    className="ml-2 flex items-center gap-1 py-0.5 pl-3 text-muted"
                    style={{ fontSize: 10 * fs }}
                  >
                    <span className="font-mono">↓</span>
                    <span>
                      {modeLabel(t.mode)} · {fmtDuration(t.durationSec)} · {fmtDistance(t.distanceM)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Map snapshot */}
        {showMap && (
          <div className="flex w-[200px] flex-shrink-0 flex-col gap-2">
            <div className="flex h-[180px] items-center justify-center overflow-hidden rounded border bg-white" style={{ borderColor: "#e5e7eb" }}>
              <DayMapMini accent={accent} day={day} isMono={isMono} />
            </div>
            <div className="rounded border p-2" style={{ borderColor: "#e5e7eb", fontSize: 10 * fs }}>
              <p className="text-[10px] uppercase tracking-wide text-muted-soft">摘要</p>
              <p>路線總長 ≈ 11.4 km</p>
              <p>步行 ≈ 1.1 km</p>
              <p>大眾運輸 ≈ 10.3 km</p>
              <p>票卷 1 張 · NT$ 2,400</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t px-10 py-2 text-[10px] text-muted-soft" style={{ borderColor: "#f3f4f6" }}>
        <span>{tripTitle} · Day {day.dayIndex}</span>
        <span className="font-mono">P. ___</span>
      </div>
    </div>
  );
}

function DayMapMini({ accent, day, isMono }: { accent: string; day: MockDay; isMono: boolean }) {
  // Re-use the marker positions from mock data, scaled down
  const items = day.items.filter((i) => !i.isAllDay);
  const xs = items.map((i) => getPlace(i.placeId)?.mapX).filter((v): v is number => typeof v === "number");
  const ys = items.map((i) => getPlace(i.placeId)?.mapY).filter((v): v is number => typeof v === "number");
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const path = items
    .map((it, idx) => {
      const p = getPlace(it.placeId);
      if (!p) return null;
      return `${idx === 0 ? "M" : "L"} ${p.mapX} ${p.mapY}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <svg viewBox="0 400 1000 600" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
      <rect x="0" y="0" width="1000" height="1000" fill="#fafafa" />
      <g stroke="#e5e7eb" strokeWidth="2" fill="none">
        <path d="M 0 500 L 1000 500" />
        <path d="M 0 700 L 1000 700" />
        <path d="M 470 0 L 470 1000" />
      </g>
      <path
        d={path}
        stroke={accent}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {items.map((it, idx) => {
        const p = getPlace(it.placeId);
        if (!p) return null;
        return (
          <g key={it.id} transform={`translate(${p.mapX} ${p.mapY})`}>
            <circle r="22" fill={accent} />
            <text
              x="0"
              y="6"
              textAnchor="middle"
              fontSize="22"
              fontWeight="600"
              fill="#ffffff"
            >
              {idx + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ───────────────────────────────────────────────────────────
// Page: Cost summary
// ───────────────────────────────────────────────────────────
function CostSummaryPage({ isMono, fs }: { isMono: boolean; fs: number }) {
  const accent = isMono ? "#111111" : "#3b82f6";
  const breakdown = mockPlans[0].costBreakdown;
  const total = mockPlans[0].totalCost;
  const local = defaultCurrencySettings.local;
  const colors = isMono
    ? { lodging: "#111", food: "#374151", transport: "#6b7280", ticket: "#9ca3af", misc: "#d1d5db" }
    : { lodging: "#34d399", food: "#ec4899", transport: "#fb923c", ticket: "#f59e0b", misc: "#9ca3af" };
  const rows = [
    { label: "住宿 / Lodging", amount: breakdown.lodging, color: colors.lodging },
    { label: "餐飲 / Food", amount: breakdown.food, color: colors.food },
    { label: "交通 / Transport", amount: breakdown.transport, color: colors.transport },
    { label: "票卷 / Tickets", amount: breakdown.ticket, color: colors.ticket },
    { label: "其他 / Misc", amount: breakdown.misc, color: colors.misc },
  ];

  return (
    <div className="h-full px-12 py-12" style={{ color: "#111111" }}>
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-widest text-muted">EXPENSE SUMMARY</p>
        <h2 style={{ fontSize: 28 * fs, fontWeight: 600, letterSpacing: "-0.5px" }}>費用總表</h2>
        <p className="mt-1 text-muted" style={{ fontSize: 12 * fs }}>
          本方案預估 · 包含交通油費試算與票卷登記。
        </p>
      </div>

      <div className="mb-6 rounded-md border p-4" style={{ borderColor: "#e5e7eb" }}>
        <p className="text-[11px] uppercase tracking-widest text-muted-soft">總計</p>
        <div className="flex items-baseline gap-3">
          <p style={{ fontSize: 40 * fs, fontWeight: 600, letterSpacing: "-1px" }}>
            NT$ {(total / 1000).toFixed(1)}k
          </p>
          <p className="font-mono text-muted" style={{ fontSize: 14 * fs }}>
            ≈ {formatCurrency(
              (total / (mockRates.rates.TWD ?? 1)) * (mockRates.rates[local] ?? 0),
              local,
            )}
          </p>
        </div>
        <p className="text-[11px] text-muted-soft">
          7 天 · 14 個景點 · 6 張票卷 · 4.76 JPY/TWD（資料更新於 2026/04/28）
        </p>
      </div>

      {/* Stacked bar */}
      <div className="mb-3 flex h-3 overflow-hidden rounded-full">
        {rows.map((r) => (
          <div key={r.label} style={{ width: `${(r.amount / total) * 100}%`, background: r.color }} />
        ))}
      </div>

      <table className="w-full" style={{ fontSize: 12 * fs }}>
        <thead>
          <tr className="border-b text-[10px] uppercase tracking-wide text-muted-soft" style={{ borderColor: "#e5e7eb" }}>
            <th className="py-1 text-left">類別</th>
            <th className="py-1 text-right">NT$</th>
            <th className="py-1 text-right">{local}</th>
            <th className="py-1 text-right">佔比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b" style={{ borderColor: "#f3f4f6" }}>
              <td className="py-1.5">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
                {r.label}
              </td>
              <td className="py-1.5 text-right font-mono">NT$ {r.amount.toLocaleString()}</td>
              <td className="py-1.5 text-right font-mono text-muted">
                {formatCurrency(
                  (r.amount / (mockRates.rates.TWD ?? 1)) * (mockRates.rates[local] ?? 0),
                  local,
                )}
              </td>
              <td className="py-1.5 text-right font-mono">{((r.amount / total) * 100).toFixed(1)}%</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 600 }}>
            <td className="py-2">總計</td>
            <td className="py-2 text-right font-mono">NT$ {total.toLocaleString()}</td>
            <td className="py-2 text-right font-mono text-muted">
              {formatCurrency(
                (total / (mockRates.rates.TWD ?? 1)) * (mockRates.rates[local] ?? 0),
                local,
              )}
            </td>
            <td className="py-2 text-right font-mono">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Page: Tickets
// ───────────────────────────────────────────────────────────
const tickets = [
  { name: "町家午餐 · 京豆庵", date: "2026/05/14", time: "13:00", code: "K-3142", price: 2400, qrSeed: 3142 },
  { name: "嵐山小火車", date: "2026/05/15", time: "10:30", code: "RAIL-220515-A", price: 880, qrSeed: 220 },
  { name: "宇治抹茶體驗", date: "2026/05/16", time: "14:00", code: "MATCHA-1140", price: 1500, qrSeed: 1140 },
];

function TicketsPage({ isMono, fs }: { isMono: boolean; fs: number }) {
  const accent = isMono ? "#111111" : "#3b82f6";
  return (
    <div className="h-full px-12 py-12" style={{ color: "#111111" }}>
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-widest text-muted">TICKETS</p>
        <h2 style={{ fontSize: 28 * fs, fontWeight: 600, letterSpacing: "-0.5px" }}>
          票卷附頁
        </h2>
        <p className="mt-1 text-muted" style={{ fontSize: 12 * fs }}>
          已登記訂位 · 出發前確認可印出本頁攜帶。
        </p>
      </div>
      <div className="space-y-3">
        {tickets.map((t) => (
          <div key={t.code} className="flex items-stretch overflow-hidden rounded border" style={{ borderColor: "#e5e7eb" }}>
            <div
              className="flex w-[12px] items-center justify-center"
              style={{ background: accent }}
            />
            <div className="flex flex-1 items-center gap-4 p-3">
              <div className="min-w-0 flex-1">
                <p style={{ fontSize: 13 * fs, fontWeight: 500 }}>{t.name}</p>
                <p className="mt-0.5 font-mono text-muted" style={{ fontSize: 11 * fs }}>
                  {t.date} · {t.time} · #{t.code}
                </p>
                <p className="text-muted-soft" style={{ fontSize: 11 * fs }}>
                  NT$ {t.price.toLocaleString()}
                </p>
              </div>
              {/* Mock QR */}
              <div
                className="grid grid-cols-8 gap-px rounded"
                style={{ width: 64, height: 64, background: "#fff", padding: 2, border: "1px solid #e5e7eb" }}
              >
                {Array.from({ length: 64 }).map((_, i) => {
                  const seed = (t.qrSeed * 9301 + i * 49297) % 233280;
                  const on = seed % 100 > 50;
                  return <div key={i} style={{ background: on ? "#111" : "transparent" }} />;
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Page: Back cover
// ───────────────────────────────────────────────────────────
function BackCoverPage({ isMono, fs }: { isMono: boolean; fs: number }) {
  const accent = isMono ? "#111111" : "#3b82f6";
  return (
    <div className="relative flex h-full flex-col items-center justify-between px-12 pt-16 pb-10 text-center" style={{ color: "#111111" }}>
      <div />
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted">PREPARED WITH</p>
        <p className="mt-2" style={{ fontSize: 22 * fs, fontWeight: 500, letterSpacing: "-0.3px" }}>
          旅遊規劃Z · Travel Planner Z
        </p>
        <p className="mt-1 text-muted" style={{ fontSize: 11 * fs }}>
          個人用 · 本地 SQLite · 製作於 {tripDates}
        </p>
      </div>
      <div className="space-y-1">
        <div
          className="mx-auto h-1 w-12 rounded-full"
          style={{ background: accent }}
        />
        <p className="font-mono text-[10px] text-muted-soft">v0.1 · {author}</p>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────
function fmtMinutes(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}小時` : `${h}小時${m}分`;
  }
  return `${min}分`;
}
function formatFull(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
