import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/currency";
import type { CurrencyCode } from "@/lib/currency";
import type { ExportConfig, FontScale, PaperSize, SectionKey } from "@/lib/export-config";
import type { PdfTripData } from "./pdf-data-service";

// CJK font registration. Resolution order:
//   1. User-dropped TTF/OTF at public/fonts/NotoSansTC-Regular.{ttf,otf}
//   2. jsdelivr CDN — Noto Sans CJK TC OTF (notofonts/noto-cjk @ Sans2.004)
//      Font.register loads lazily; the network fetch happens on first PDF
//      render, not at module import. Subsequent renders within the same
//      worker hit the in-process cache.
// Phase 14m — switched (2) from @fontsource woff (unreliable on Vercel
// + woff support edge cases) to a stable CDN OTF URL. Fixes "中文亂碼".
const CDN_TC_REGULAR = "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@Sans2.004/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf";
const CDN_TC_BOLD = "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@Sans2.004/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Bold.otf";

let fontFamily = "Helvetica";
const userFontDir = path.join(process.cwd(), "public", "fonts");
const userTcRegular = ["NotoSansTC-Regular.ttf", "NotoSansTC-Regular.otf"]
  .map((n) => path.join(userFontDir, n))
  .find(existsSync);
const userTcBold = ["NotoSansTC-Bold.ttf", "NotoSansTC-Bold.otf"]
  .map((n) => path.join(userFontDir, n))
  .find(existsSync);

const tcRegular = userTcRegular ?? CDN_TC_REGULAR;
const tcBold = userTcBold ?? CDN_TC_BOLD;

Font.register({
  family: "NotoSansTC",
  fonts: [
    { src: tcRegular, fontWeight: "normal" },
    { src: tcBold, fontWeight: "bold" },
  ],
});
fontFamily = "NotoSansTC";

// Disable hyphenation entirely (CJK doesn't break on hyphens; English is fine
// to wrap at word boundaries).
Font.registerHyphenationCallback((w) => [w]);

// ─ Paper size mapping ───────────────────────────────────────────────────────
const paperPdfSize: Record<PaperSize, "A4" | "A5" | "LETTER"> = {
  A4: "A4",
  A5: "A5",
  Letter: "LETTER",
};

const fontScaleMul: Record<FontScale, number> = {
  small: 0.85,
  normal: 1,
  large: 1.18,
};

// Cal.com palette translated to CMYK-ish hex (good enough for desktop PDF).
const palette = {
  ink: "#0a0a0a",
  muted: "#666666",
  mutedSoft: "#999999",
  hairline: "#d4d4d8",
  hairlineSoft: "#e5e5e5",
  surfaceSoft: "#f4f4f5",
  surfaceCard: "#fafafa",
  brandAccent: "#3b82f6",
  badgeOrange: "#fb923c",
  badgePink: "#f472b6",
  badgeViolet: "#a78bfa",
  badgeEmerald: "#34d399",
  warning: "#f59e0b",
};

const monoPalette = {
  ink: "#0a0a0a",
  muted: "#555555",
  mutedSoft: "#999999",
  hairline: "#cccccc",
  hairlineSoft: "#e5e5e5",
  surfaceSoft: "#f4f4f5",
  surfaceCard: "#fafafa",
  brandAccent: "#222222",
  badgeOrange: "#444444",
  badgePink: "#444444",
  badgeViolet: "#444444",
  badgeEmerald: "#444444",
  warning: "#666666",
};

function makeStyles(config: ExportConfig) {
  const m = fontScaleMul[config.fontScale];
  const c = config.color === "color" ? palette : monoPalette;
  return StyleSheet.create({
    page: {
      fontFamily,
      fontSize: 10 * m,
      color: c.ink,
      paddingTop: 36,
      paddingHorizontal: 36,
      paddingBottom: 36,
    },
    h1: {
      fontSize: 28 * m,
      fontWeight: "bold",
      letterSpacing: -0.5,
      marginBottom: 6,
    },
    h2: {
      fontSize: 18 * m,
      fontWeight: "bold",
      letterSpacing: -0.3,
      marginBottom: 8,
      marginTop: 4,
    },
    h3: {
      fontSize: 12 * m,
      fontWeight: "bold",
      marginBottom: 4,
    },
    label: {
      fontSize: 8 * m,
      color: c.mutedSoft,
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    body: { fontSize: 10 * m, color: c.ink, lineHeight: 1.5 },
    muted: { fontSize: 9 * m, color: c.muted },
    mono: { fontFamily: "Courier", fontSize: 9 * m, color: c.ink },
    hairline: { borderBottom: `1px solid ${c.hairline}` },
    hairlineSoft: { borderBottom: `1px solid ${c.hairlineSoft}` },
    badge: {
      backgroundColor: c.surfaceCard,
      borderRadius: 9999,
      paddingHorizontal: 6,
      paddingVertical: 2,
      fontSize: 8 * m,
      color: c.ink,
    },
    pill: {
      backgroundColor: c.surfaceCard,
      borderRadius: 9999,
      paddingHorizontal: 8,
      paddingVertical: 3,
      fontSize: 9 * m,
    },
    palette: { fg: c.ink, accent: c.brandAccent, ...c },
  });
}

export type PdfDocumentProps = {
  data: PdfTripData;
  config: ExportConfig;
};

const sectionOrder: SectionKey[] = [
  "cover",
  "toc",
  "tripMap",
  "preTripNotes",
  "packingChecklist",
  "dailySchedule",
  "costSummary",
  "tickets",
  "backCover",
];

export function TripPdfDocument({ data, config }: PdfDocumentProps) {
  const styles = makeStyles(config);
  const size = paperPdfSize[config.paper];
  const orient = config.orientation;
  const paletteForUse = config.color === "color" ? palette : monoPalette;

  const enabled = (k: SectionKey) => config.sections[k];

  return (
    <Document
      title={data.title}
      author="旅遊規劃Z"
      subject={`${data.startDate} – ${data.endDate}`}
    >
      {sectionOrder.map((key) => {
        if (!enabled(key)) return null;
        switch (key) {
          case "cover":
            return <CoverPage key={key} data={data} styles={styles} size={size} orientation={orient} palette={paletteForUse} />;
          case "toc":
            return <TocPage key={key} data={data} styles={styles} size={size} orientation={orient} config={config} />;
          case "tripMap":
            return <TripMapPage key={key} data={data} styles={styles} size={size} orientation={orient} palette={paletteForUse} />;
          case "preTripNotes":
            return <AiPage key={key} data={data} kind="PRE_TRIP_NOTES" styles={styles} size={size} orientation={orient} />;
          case "packingChecklist":
            return <AiPage key={key} data={data} kind="PACKING_CHECKLIST" styles={styles} size={size} orientation={orient} />;
          case "dailySchedule":
            return <DailySchedulePages key={key} data={data} styles={styles} size={size} orientation={orient} palette={paletteForUse} />;
          case "costSummary":
            return <CostPage key={key} data={data} styles={styles} size={size} orientation={orient} palette={paletteForUse} />;
          case "tickets":
            return <TicketsPage key={key} data={data} styles={styles} size={size} orientation={orient} palette={paletteForUse} />;
          case "backCover":
            return <BackCoverPage key={key} data={data} styles={styles} size={size} orientation={orient} />;
          default:
            return null;
        }
      })}
    </Document>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────────

type Pal = typeof palette;
type SectionProps = {
  data: PdfTripData;
  styles: ReturnType<typeof makeStyles>;
  size: "A4" | "A5" | "LETTER";
  orientation: "portrait" | "landscape";
  palette: Pal;
};

function CoverPage({ data, styles, size, orientation, palette }: SectionProps) {
  return (
    <Page size={size} orientation={orientation} style={[styles.page, { padding: 0 }]}>
      <View style={{ flex: 1, padding: 56, justifyContent: "space-between" }}>
        <View>
          <Text style={[styles.label, { marginBottom: 24 }]}>TRAVEL HANDBOOK</Text>
          <Text style={styles.h1}>{data.title}</Text>
          {!!data.subtitle && (
            <Text style={[styles.muted, { marginTop: 8, fontSize: 14 }]}>
              {data.subtitle}
            </Text>
          )}
        </View>
        <View>
          <View style={{ flexDirection: "row", gap: 24, marginBottom: 16 }}>
            <Stat label="DESTINATION" value={data.destination || "—"} styles={styles} />
            <Stat label="DURATION" value={`${data.totalDays} 天`} styles={styles} />
            <Stat label="DISTANCE" value={`${data.totalDistanceKm} km`} styles={styles} />
          </View>
          <View style={{ flexDirection: "row", gap: 24 }}>
            <Stat label="DATES" value={`${data.startDate} – ${data.endDate}`} styles={styles} />
            <Stat label="PACE" value={data.pace} styles={styles} />
            <Stat label="PLAN" value={data.planName} styles={styles} />
          </View>
        </View>
        <View>
          <View style={[styles.hairline, { marginBottom: 8 }]} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={styles.muted}>由 旅遊規劃Z 製作</Text>
            <Text style={styles.muted}>
              {formatCurrency(data.totalCost, data.baseCurrency as CurrencyCode)} 預估總花費
            </Text>
          </View>
        </View>
      </View>
      <View
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 8,
          height: "60%",
          backgroundColor: palette.brandAccent,
        }}
      />
    </Page>
  );
}

function Stat({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.body, { marginTop: 2, fontSize: 11 }]}>{value}</Text>
    </View>
  );
}

function TocPage({
  data,
  styles,
  size,
  orientation,
  config,
}: {
  data: PdfTripData;
  styles: ReturnType<typeof makeStyles>;
  size: "A4" | "A5" | "LETTER";
  orientation: "portrait" | "landscape";
  config: ExportConfig;
}) {
  const items: { label: string; en: string; section: SectionKey }[] = [
    { label: "封面", en: "Cover", section: "cover" },
    { label: "目錄", en: "Table of Contents", section: "toc" },
    { label: "全趟地圖", en: "Trip Map", section: "tripMap" },
    { label: "行前注意事項", en: "Pre-Trip Notes", section: "preTripNotes" },
    { label: "行李 Checklist", en: "Packing Checklist", section: "packingChecklist" },
    { label: "每日行程", en: "Daily Schedule", section: "dailySchedule" },
    { label: "費用總表", en: "Cost Summary", section: "costSummary" },
    { label: "票卷附頁", en: "Tickets", section: "tickets" },
    { label: "封底", en: "Back Cover", section: "backCover" },
  ];
  let pageNum = 1;
  const rows = items
    .filter((it) => config.sections[it.section])
    .map((it) => {
      const p = pageNum;
      // approximate: cover/toc/tripMap/notes/packing/cost/tickets/back are 1 page each, schedule is N
      const inc =
        it.section === "dailySchedule" ? data.totalDays :
        it.section === "preTripNotes" ? Math.max(1, Math.ceil((data.ai.find((a) => a.category === "PRE_TRIP_NOTES")?.bullets.length ?? 0) / 12)) :
        it.section === "packingChecklist" ? Math.max(1, Math.ceil((data.ai.find((a) => a.category === "PACKING_CHECKLIST")?.bullets.length ?? 0) / 18)) :
        1;
      pageNum += inc;
      return { ...it, page: p };
    });

  return (
    <Page size={size} orientation={orientation} style={styles.page}>
      <Text style={styles.label}>CONTENTS</Text>
      <Text style={[styles.h2, { marginBottom: 18 }]}>目錄</Text>
      <View style={[styles.hairline, { marginBottom: 12 }]} />
      {rows.map((r) => (
        <View
          key={r.section}
          style={[
            styles.hairlineSoft,
            { flexDirection: "row", alignItems: "baseline", paddingVertical: 8 },
          ]}
        >
          <Text style={[styles.body, { flex: 0, width: 24 }]}>{r.page.toString().padStart(2, "0")}</Text>
          <Text style={[styles.body, { flex: 1 }]}>{r.label}</Text>
          <Text style={[styles.muted, { fontSize: 9 }]}>{r.en}</Text>
        </View>
      ))}
    </Page>
  );
}

function TripMapPage({ data, styles, size, orientation, palette }: SectionProps) {
  // Pure-PDF "map" rendered as a colored chip per day showing item count.
  const isLandscape = orientation === "landscape";
  return (
    <Page size={size} orientation={orientation} style={styles.page}>
      <View style={{ flexDirection: isLandscape ? "row" : "column", gap: 24, flex: 1 }}>
        <View style={{ flex: isLandscape ? 1 : 0 }}>
          <Text style={styles.label}>TRIP MAP</Text>
          <Text style={[styles.h2, { marginBottom: 4 }]}>全趟地圖</Text>
          <Text style={styles.muted}>
            共 {data.totalDays} 天 · 預估 {data.totalDistanceKm} km · 由 {data.places ? Object.keys(data.places).length : 0} 個景點構成
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View
            style={{
              flex: 1,
              minHeight: 200,
              borderRadius: 8,
              backgroundColor: palette.surfaceSoft,
              padding: 16,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              alignContent: "flex-start",
            }}
          >
            {data.days.map((d, i) => {
              const colors = [palette.brandAccent, palette.badgeOrange, palette.badgePink, palette.badgeViolet, palette.badgeEmerald, palette.warning, "#64748b"];
              const color = colors[i % colors.length];
              const items = d.items.filter((it) => !it.isAllDay);
              return (
                <View
                  key={d.id}
                  style={{
                    width: 130,
                    padding: 10,
                    borderRadius: 6,
                    backgroundColor: "#ffffff",
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <Text style={[styles.label, { color }]}>DAY {d.dayIndex}</Text>
                  <Text style={[styles.body, { fontSize: 11, marginTop: 2 }]}>{d.date}</Text>
                  <Text style={[styles.muted, { marginTop: 2 }]}>週{d.weekday} · {items.length} 站</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Page>
  );
}

function AiPage({
  data,
  kind,
  styles,
  size,
  orientation,
}: {
  data: PdfTripData;
  kind: "PRE_TRIP_NOTES" | "PACKING_CHECKLIST";
  styles: ReturnType<typeof makeStyles>;
  size: "A4" | "A5" | "LETTER";
  orientation: "portrait" | "landscape";
}) {
  const section = data.ai.find((a) => a.category === kind);
  return (
    <Page size={size} orientation={orientation} style={styles.page}>
      <Text style={styles.label}>{section?.enTitle ?? (kind === "PRE_TRIP_NOTES" ? "PRE-TRIP NOTES" : "PACKING CHECKLIST")}</Text>
      <Text style={[styles.h2, { marginBottom: 12 }]}>
        {section?.zhTitle ?? (kind === "PRE_TRIP_NOTES" ? "行前注意事項" : "行李 Checklist")}
      </Text>
      {section && section.bullets.length > 0 ? (
        section.bullets.map((b, i) => (
          <View
            key={i}
            style={[styles.hairlineSoft, { flexDirection: "row", paddingVertical: 6, gap: 8 }]}
          >
            {kind === "PACKING_CHECKLIST" && (
              <View style={{ width: 10, height: 10, borderWidth: 1, borderColor: "#666", borderRadius: 2, marginTop: 3 }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.body}>{b.zh || b.en}</Text>
              {!!b.en && b.en !== b.zh && (
                <Text style={[styles.muted, { fontSize: 8, marginTop: 1 }]}>{b.en}</Text>
              )}
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.muted}>
          尚未產生 AI 建議。請至 /trips/{data.tripId}/ai 頁面產生後再匯出。
        </Text>
      )}
    </Page>
  );
}

function DailySchedulePages({ data, styles, size, orientation, palette }: SectionProps) {
  return (
    <>
      {data.days.map((d) => {
        const items = d.items.filter((it) => !it.isAllDay);
        const allDay = d.items.filter((it) => it.isAllDay);
        return (
          <Page key={d.id} size={size} orientation={orientation} style={styles.page}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <View>
                <Text style={[styles.label, { color: palette.brandAccent }]}>DAY {d.dayIndex}</Text>
                <Text style={styles.h2}>{d.date} · 週{d.weekday}</Text>
              </View>
              <Text style={styles.muted}>{items.length} 站 · {allDay.length} 整日</Text>
            </View>
            <View style={[styles.hairline, { marginBottom: 12 }]} />
            {allDay.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>整日項目</Text>
                {allDay.map((it) => {
                  const place = it.placeId ? data.places[it.placeId] : null;
                  return (
                    <View key={it.id} style={{ marginTop: 2 }}>
                      <Text style={styles.body}>
                        · {place?.name ?? "—"} {place?.category ? `· ${place.category}` : ""}
                      </Text>
                      <KindMetadataBlock item={it} styles={styles} palette={palette} />
                    </View>
                  );
                })}
              </View>
            )}
            {items.length === 0 ? (
              <Text style={styles.muted}>本日尚未排定行程</Text>
            ) : (
              items.map((it, idx) => {
                const place = it.placeId ? data.places[it.placeId] : null;
                const transport = d.transports.find((t) => t.fromItemId === it.id);
                return (
                  <View key={it.id}>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        paddingVertical: 8,
                        borderBottom: `1px solid ${palette.hairlineSoft}`,
                      }}
                    >
                      <Text style={[styles.mono, { width: 56, color: palette.muted }]}>
                        {it.startTime}–{it.endTime}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.body, { fontWeight: "bold" }]}>
                          {idx + 1}. {place?.name ?? "—"}
                          {it.hasTicket && "  🎫"}
                        </Text>
                        <Text style={styles.muted}>
                          {place?.category ?? ""}
                          {place?.rating ? ` · ⭐ ${place.rating.toFixed(1)}` : ""}
                          {it.durationMin ? ` · ${it.durationMin} 分鐘` : ""}
                        </Text>
                        {!!it.note && (
                          <Text style={[styles.muted, { fontStyle: "italic", marginTop: 2 }]}>
                            {it.note}
                          </Text>
                        )}
                        {/* Phase 14f — kind metadata block */}
                        <KindMetadataBlock item={it} styles={styles} palette={palette} />
                      </View>
                    </View>
                    {transport && (
                      <TransportDetailBlock transport={transport} styles={styles} />
                    )}
                  </View>
                );
              })
            )}
          </Page>
        );
      })}
    </>
  );
}

function modeLabel(m: string) {
  if (m === "DRIVING") return "開車";
  if (m === "TRANSIT") return "大眾運輸";
  if (m === "WALKING") return "步行";
  if (m === "BICYCLING") return "腳踏車";
  if (m === "TAXI") return "計程車";
  if (m === "FLIGHT") return "飛機";
  if (m === "CUSTOM") return "自訂";
  return m;
}

// Phase 11.4 — render transport segment with mode-specific detail.
//   · TRANSIT → show line / dep-arr stops / times / transfer count / fare
//   · FLIGHT  → show airline / flight # / IATA pair / dep-arr time / terminal
//   · others  → one-line summary (existing behaviour)
function TransportDetailBlock({
  transport,
  styles,
}: {
  transport: import("./pdf-data-service").PdfTransport;
  styles: ReturnType<typeof makeStyles>;
}) {
  const km = (transport.distanceM / 1000).toFixed(1);
  const min = Math.round(transport.durationSec / 60);
  const fareLabel =
    transport.fareAmount != null && transport.fareAmount > 0
      ? `${transport.fareCurrency ?? ""} ${Math.round(transport.fareAmount)}`
      : null;

  // FREE / placeholder transit segments — terse line so the day flow stays
  // readable without claiming false data
  if (transport.isFree || (transport.durationSec === 0 && !transport.flight && !transport.transitStepsCanonical)) {
    return (
      <View style={{ paddingVertical: 2, paddingLeft: 64 }}>
        <Text style={[styles.muted, { fontSize: 8, fontStyle: "italic" }]}>
          ↓ 移動方式尚未設定
        </Text>
      </View>
    );
  }

  // FLIGHT — boarding-pass-style mini block
  if (transport.mode === "FLIGHT" && transport.flight) {
    const f = transport.flight;
    const ticketLine =
      f.ticketPrice != null
        ? `${f.ticketCurrency ?? ""} ${Math.round(f.ticketPrice).toLocaleString()}`
        : null;
    return (
      <View
        style={{
          marginVertical: 4,
          marginLeft: 64,
          padding: 6,
          borderLeft: "2px solid #0ea5e9",
          backgroundColor: "#f0f9ff",
        }}
      >
        <View style={{ flexDirection: "row", gap: 6, alignItems: "baseline" }}>
          <Text style={[styles.body, { fontWeight: "bold", fontSize: 10 }]}>
            ✈ {f.flightNumber ?? "—"}
          </Text>
          {f.airline && <Text style={styles.muted}>{f.airline}</Text>}
          {f.isInternational === true && <Text style={styles.muted}>· 國際</Text>}
          {f.isInternational === false && <Text style={styles.muted}>· 國內</Text>}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4, alignItems: "center" }}>
          <View style={{ alignItems: "center" }}>
            <Text style={[styles.mono, { fontSize: 14, fontWeight: "bold" }]}>
              {f.depAirport ?? "—"}
            </Text>
            <Text style={styles.mono}>{f.depTime ?? "--:--"}</Text>
          </View>
          <Text style={styles.muted}>───✈───</Text>
          <View style={{ alignItems: "center" }}>
            <Text style={[styles.mono, { fontSize: 14, fontWeight: "bold" }]}>
              {f.arrAirport ?? "—"}
            </Text>
            <Text style={styles.mono}>
              {f.arrTime ?? "--:--"}
              {f.arrDateOffset && f.arrDateOffset > 0 ? ` +${f.arrDateOffset}` : ""}
            </Text>
          </View>
          <View style={{ marginLeft: "auto", alignItems: "flex-end" }}>
            <Text style={styles.muted}>飛行 {min} 分（當地時間）</Text>
            {ticketLine && <Text style={styles.muted}>機票 {ticketLine}</Text>}
            {!ticketLine && fareLabel && <Text style={styles.muted}>{fareLabel}</Text>}
          </View>
        </View>
        {(f.terminal || f.seatNumber || f.bookingRef) && (
          <Text style={[styles.muted, { fontSize: 8, marginTop: 2 }]}>
            {f.terminal ? `航廈/登機門：${f.terminal}` : ""}
            {f.terminal && (f.seatNumber || f.bookingRef) ? "  ·  " : ""}
            {f.seatNumber ? `座位：${f.seatNumber}` : ""}
            {f.seatNumber && f.bookingRef ? "  ·  " : ""}
            {f.bookingRef ? `PNR：${f.bookingRef}` : ""}
          </Text>
        )}
      </View>
    );
  }

  // Phase 12 — canonical TransitSteps (pasted Google Maps text or API-converted).
  // Preferred over the legacy transitSteps array.
  if (transport.mode === "TRANSIT" && transport.transitStepsCanonical) {
    const ts = transport.transitStepsCanonical;
    return (
      <View style={{ marginVertical: 4, marginLeft: 64 }}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "baseline" }}>
          <Text style={[styles.muted, { fontSize: 8, fontWeight: "bold" }]}>
            ↓ 大眾運輸 · {km} km · {min} 分
          </Text>
          {fareLabel && (
            <Text style={[styles.muted, { fontSize: 8 }]}>· {fareLabel}</Text>
          )}
          {ts.serviceFrequencyMin != null && (
            <Text style={[styles.muted, { fontSize: 8 }]}>
              · 班距 {ts.serviceFrequencyMin} 分
            </Text>
          )}
        </View>
        {ts.steps.map((s, i) => {
          if (s.kind === "walk") {
            return (
              <Text key={i} style={[styles.muted, { fontSize: 8, marginLeft: 8 }]}>
                ↳ 步行 {Math.round(s.durationSec / 60)} 分
                {s.distanceM > 0 ? ` · ${s.distanceM >= 1000 ? (s.distanceM / 1000).toFixed(2) + " km" : s.distanceM + " m"}` : ""}
              </Text>
            );
          }
          // ride
          const lineLabel = `${s.lineCode ? `[${s.lineCode}] ` : ""}${s.lineName}${s.serviceType ? " · " + s.serviceType : ""}`;
          return (
            <View key={i} style={{ marginLeft: 8, marginTop: 2 }}>
              <Text style={[styles.body, { fontSize: 9, fontWeight: "bold" }]}>
                {lineLabel}
              </Text>
              <Text style={[styles.muted, { fontSize: 8 }]}>
                {s.departureTime} {s.fromStation}
                {s.fromStationId ? ` (${s.fromStationId})` : ""}
                {" → "}
                {s.toStation}
                {s.toStationId ? ` (${s.toStationId})` : ""}
                {" "}
                {s.arrivalTime}
                {s.numStops > 0 ? ` · ${s.numStops} 站` : ""}
                {s.platform ? ` · ${s.platform}` : ""}
                {s.headsign ? ` · 往 ${s.headsign}` : ""}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  // Phase 12 — driving segments (toll / fuel / rest areas)
  if (transport.mode === "DRIVING" && transport.drivingSegments) {
    const ds = transport.drivingSegments;
    const total = ds.segments.reduce((s, x) => s + x.distanceM, 0);
    const pct = (kind: "surface" | "toll-road" | "highway") => {
      if (total === 0) return 0;
      const sum = ds.segments.filter((s) => s.kind === kind).reduce((s, x) => s + x.distanceM, 0);
      return Math.round((sum / total) * 100);
    };
    return (
      <View style={{ marginVertical: 4, marginLeft: 64 }}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "baseline" }}>
          <Text style={[styles.muted, { fontSize: 8, fontWeight: "bold" }]}>
            ↓ 駕車 · {km} km · {min} 分
          </Text>
          {pct("surface") > 0 && <Text style={[styles.muted, { fontSize: 8 }]}>· 平面 {pct("surface")}%</Text>}
          {pct("toll-road") > 0 && <Text style={[styles.muted, { fontSize: 8 }]}>· 收費 {pct("toll-road")}%</Text>}
          {pct("highway") > 0 && <Text style={[styles.muted, { fontSize: 8 }]}>· 高速 {pct("highway")}%</Text>}
          <Text style={[styles.muted, { fontSize: 8 }]}>
            · 油費 {ds.fuelEstimate.currency} {Math.round(ds.fuelEstimate.cost).toLocaleString()}
          </Text>
          {ds.tollTotal && ds.tollTotal.amount > 0 && (
            <Text style={[styles.muted, { fontSize: 8 }]}>
              · 過路費 {ds.tollTotal.currency} {Math.round(ds.tollTotal.amount).toLocaleString()}
            </Text>
          )}
        </View>
        {ds.segments.map((s, i) => {
          const tollLabel =
            s.tollAmount != null && s.tollCurrency
              ? ` · ${s.tollCurrency} ${Math.round(s.tollAmount)}`
              : "";
          return (
            <Text key={i} style={[styles.muted, { fontSize: 8, marginLeft: 8 }]}>
              ↳ {s.roadName ?? (s.kind === "surface" ? "平面" : s.kind === "toll-road" ? "收費道路" : "高速公路")} · {(s.distanceM / 1000).toFixed(1)} km · {Math.round(s.durationSec / 60)} 分{tollLabel}
            </Text>
          );
        })}
        {ds.restAreas.length > 0 && (
          <View style={{ marginLeft: 8, marginTop: 2 }}>
            <Text style={[styles.muted, { fontSize: 8 }]}>休息站：</Text>
            {ds.restAreas.map((r, i) => (
              <Text key={i} style={[styles.muted, { fontSize: 8, marginLeft: 8 }]}>
                · {r.name} ({r.kmFromStart.toFixed(1)} km · {r.type}{r.direction === "outbound" ? " · 去程" : ""})
                {r.notes ? ` — ${r.notes}` : ""}
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  }

  // TRANSIT (legacy — list each step from directionsCacheJson)
  if (transport.mode === "TRANSIT" && transport.transitSteps.length > 0) {
    return (
      <View style={{ marginVertical: 4, marginLeft: 64 }}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "baseline" }}>
          <Text style={[styles.muted, { fontSize: 8, fontWeight: "bold" }]}>
            ↓ 大眾運輸 · {km} km · {min} 分
          </Text>
          {transport.transferCount != null && transport.transferCount > 0 && (
            <Text style={[styles.muted, { fontSize: 8 }]}>
              · 轉乘 {transport.transferCount} 次
            </Text>
          )}
          {fareLabel && (
            <Text style={[styles.muted, { fontSize: 8 }]}>· {fareLabel}</Text>
          )}
        </View>
        {transport.transitSteps.map((s, i) => {
          if (s.kind === "WALK") {
            return (
              <Text key={i} style={[styles.muted, { fontSize: 8, marginLeft: 8 }]}>
                ↳ 步行 {(s.distanceMeters / 1000).toFixed(2)} km · {Math.round(s.durationSec / 60)} 分
              </Text>
            );
          }
          // TRANSIT step
          return (
            <View key={i} style={{ marginLeft: 8, marginTop: 2 }}>
              <View style={{ flexDirection: "row", gap: 4, alignItems: "baseline" }}>
                <Text style={[styles.body, { fontSize: 9, fontWeight: "bold" }]}>
                  {s.lineNameShort ?? s.lineName}
                </Text>
                {s.headsign && (
                  <Text style={[styles.muted, { fontSize: 8 }]}>→ {s.headsign}</Text>
                )}
                {s.headwaySec != null && (
                  <Text style={[styles.muted, { fontSize: 8 }]}>
                    · 每 {Math.round(s.headwaySec / 60)} 分
                  </Text>
                )}
              </View>
              <Text style={[styles.muted, { fontSize: 8 }]}>
                {s.departureTime ?? "--:--"} {s.departureStop} → {s.arrivalStop} {s.arrivalTime ?? "--:--"}
                {s.stopCount != null && ` · ${s.stopCount} 站`}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  // Default — single-line summary (existing behaviour) + notes on second line
  return (
    <View style={{ paddingVertical: 4, paddingLeft: 64 }}>
      <Text style={[styles.muted, { fontSize: 8 }]}>
        ↓ {modeLabel(transport.mode)}
        {transport.transitLine ? ` · ${transport.transitLine}` : ""}
        {" · "}{km} km · {min} 分鐘
        {fareLabel ? ` · ${fareLabel}` : ""}
      </Text>
      {transport.notes && (
        <Text style={[styles.muted, { fontSize: 8, fontStyle: "italic", marginTop: 1 }]}>
          {transport.notes}
        </Text>
      )}
    </View>
  );
}

function CostPage({ data, styles, size, orientation, palette }: SectionProps) {
  const total = data.totalCost || 1;
  const rows: { label: string; amount: number; color: string }[] = [
    { label: "餐飲", amount: data.costBreakdown.food, color: palette.badgePink },
    { label: "住宿", amount: data.costBreakdown.lodging, color: palette.badgeEmerald },
    { label: "交通", amount: data.costBreakdown.transport, color: palette.badgeOrange },
    { label: "票卷", amount: data.costBreakdown.ticket, color: palette.warning },
    { label: "其他", amount: data.costBreakdown.misc, color: palette.muted },
  ];
  return (
    <Page size={size} orientation={orientation} style={styles.page}>
      <Text style={styles.label}>COST SUMMARY</Text>
      <Text style={[styles.h2, { marginBottom: 4 }]}>費用總表</Text>
      <Text style={[styles.muted, { marginBottom: 16 }]}>
        基準幣別：{data.baseCurrency} · 預估總額：{formatCurrency(data.totalCost, data.baseCurrency as CurrencyCode)}
      </Text>

      {/* Stacked bar */}
      <View style={{ flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
        {rows.map((r) => (
          <View
            key={r.label}
            style={{
              width: `${(r.amount / total) * 100}%`,
              backgroundColor: r.color,
            }}
          />
        ))}
      </View>

      {rows.map((r) => (
        <View
          key={r.label}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 6,
            borderBottom: `1px solid ${palette.hairlineSoft}`,
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.color, marginRight: 8 }} />
          <Text style={[styles.body, { flex: 1 }]}>{r.label}</Text>
          <Text style={[styles.body, { fontFamily: "Courier" }]}>
            {formatCurrency(r.amount, data.baseCurrency as CurrencyCode)}
          </Text>
          <Text style={[styles.muted, { width: 56, textAlign: "right" }]}>
            {((r.amount / total) * 100).toFixed(0)}%
          </Text>
        </View>
      ))}

      <View style={{ marginTop: 12, paddingTop: 8, borderTop: `1px solid ${palette.hairline}`, flexDirection: "row" }}>
        <Text style={[styles.body, { flex: 1, fontWeight: "bold" }]}>總計</Text>
        <Text style={[styles.body, { fontFamily: "Courier", fontWeight: "bold" }]}>
          {formatCurrency(data.totalCost, data.baseCurrency as CurrencyCode)}
        </Text>
      </View>

      {data.expenses.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={styles.label}>分項記錄（最近 {Math.min(20, data.expenses.length)} 筆）</Text>
          {data.expenses.slice(0, 20).map((e) => (
            <View
              key={e.id}
              style={{
                flexDirection: "row",
                paddingVertical: 4,
                borderBottom: `1px solid ${palette.hairlineSoft}`,
              }}
            >
              <Text style={[styles.muted, { width: 60 }]}>{e.category}</Text>
              <Text style={[styles.body, { flex: 1 }]}>{e.note ?? "—"}</Text>
              <Text style={[styles.body, { fontFamily: "Courier" }]}>
                {formatCurrency(e.amount, e.currency as CurrencyCode)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Page>
  );
}

function TicketsPage({ data, styles, size, orientation, palette }: SectionProps) {
  return (
    <Page size={size} orientation={orientation} style={styles.page}>
      <Text style={styles.label}>TICKETS</Text>
      <Text style={[styles.h2, { marginBottom: 12 }]}>票卷附頁</Text>
      {data.tickets.length === 0 ? (
        <Text style={styles.muted}>本趟旅程尚未登記票卷。</Text>
      ) : (
        data.tickets.map((t) => (
          <View
            key={t.id}
            style={{
              padding: 10,
              marginBottom: 8,
              borderRadius: 6,
              border: `1px solid ${palette.hairline}`,
              flexDirection: "row",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: palette.warning }]}>
                {t.category}
                {t.dayIndex ? ` · DAY ${t.dayIndex}` : ""}
              </Text>
              <Text style={[styles.body, { fontWeight: "bold", marginTop: 2 }]}>{t.title}</Text>
              {!!t.placeName && <Text style={styles.muted}>{t.placeName}</Text>}
              {!!t.bookingRef && (
                <Text style={[styles.mono, { marginTop: 2 }]}>REF · {t.bookingRef}</Text>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.muted}>x{t.quantity}</Text>
              <Text style={[styles.body, { fontFamily: "Courier" }]}>
                {formatCurrency(t.price * t.quantity, t.currency as CurrencyCode)}
              </Text>
              <View
                style={{
                  marginTop: 6,
                  width: 40,
                  height: 40,
                  border: `1px dashed ${palette.hairline}`,
                  borderRadius: 4,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 6, color: palette.mutedSoft }}>QR</Text>
              </View>
            </View>
          </View>
        ))
      )}
    </Page>
  );
}

// Phase 14f — render kind-specific metadata under each ScheduleItem in
// the daily schedule pages. Read-only; mirrors the in-app KindSummaryBlock.
function KindMetadataBlock({
  item,
  styles,
  palette,
}: {
  item: import("./pdf-data-service").PdfScheduleItem;
  styles: ReturnType<typeof makeStyles>;
  palette: Pal;
}) {
  const m = item.metadata;
  if (!m) return null;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  const bool = (v: unknown): boolean => v === true;
  const money = (a: number, c?: string | null) => `${c ?? ""} ${Math.round(a).toLocaleString()}`.trim();

  if (item.kind === "LODGING") {
    const total = num(m.totalCost);
    const cur = str(m.ticketCurrency) ?? str(m.currency);
    const nights = num(m.nights);
    const guests = num(m.guestCount) ?? 1;
    const perNight = total && nights ? Math.round(total / nights) : null;
    const perPer = total && nights && guests ? Math.round(total / nights / guests) : null;
    return (
      <View style={metaCardStyle(palette)}>
        <Text style={[styles.label, { color: palette.brandAccent, marginBottom: 2 }]}>住宿</Text>
        {nights && <MetaRow styles={styles} label="總共" value={`${nights} 晚`} />}
        {total != null && (
          <View style={{ marginVertical: 2 }}>
            <Text style={[styles.body, { fontSize: 14, fontWeight: "bold" }]}>{money(total, cur)}</Text>
            <Text style={styles.muted}>
              {perNight != null && `每晚 ${money(perNight, cur)}`}
              {perPer != null && ` · 每人每晚 ${money(perPer, cur)}（${guests} 人）`}
            </Text>
          </View>
        )}
        {(str(m.checkInTime) || str(m.checkOutTime)) && (
          <MetaRow styles={styles} label="時間" value={`入住 ${str(m.checkInTime) ?? "—"} · 退房 ${str(m.checkOutTime) ?? "—"}`} />
        )}
        {str(m.bookingPlatform) && <MetaRow styles={styles} label="平台" value={str(m.bookingPlatform)!} />}
        {str(m.bookingRef) && <MetaRow styles={styles} label="訂房" value={str(m.bookingRef)!} />}
        {bool(m.breakfastIncluded) && <MetaRow styles={styles} label="早餐" value="含" />}
        {bool(m.parkingAvailable) && (
          <MetaRow
            styles={styles}
            label="停車"
            value={
              num(m.parkingFeePerNight) != null && num(m.parkingFeePerNight)! > 0
                ? `有（${money(num(m.parkingFeePerNight)!, cur)}/晚）`
                : "有（含房價）"
            }
          />
        )}
        {str(m.wifiPassword) && <MetaRow styles={styles} label="Wi-Fi" value={str(m.wifiPassword)!} />}
        {str(m.cancellationPolicy) && <MetaRow styles={styles} label="退訂" value={str(m.cancellationPolicy)!} />}
      </View>
    );
  }

  if (item.kind === "CAR_RENTAL") {
    const role = str(m.segmentRole);
    const total = num(m.totalCost);
    const cur = str(m.ticketCurrency) ?? str(m.currency);
    const days = num(m.rentalDays);
    return (
      <View style={metaCardStyle(palette)}>
        <Text style={[styles.label, { color: palette.brandAccent, marginBottom: 2 }]}>{role === "RETURN" ? "還車" : "取車"}</Text>
        {str(m.vendor) && <MetaRow styles={styles} label="租車公司" value={str(m.vendor)!} />}
        {str(m.carModel) && <MetaRow styles={styles} label="車型" value={str(m.carModel)!} />}
        {str(m.bookingRef) && <MetaRow styles={styles} label="訂位代號" value={str(m.bookingRef)!} />}
        {(str(m.pickupDate) || str(m.pickupTime)) && (
          <MetaRow styles={styles} label="取車" value={`${str(m.pickupDate) ?? ""} ${str(m.pickupTime) ?? ""} ${str(m.pickupLocation) ? `· ${str(m.pickupLocation)}` : ""}`} />
        )}
        {(str(m.returnDate) || str(m.returnTime)) && (
          <MetaRow styles={styles} label="還車" value={`${str(m.returnDate) ?? ""} ${str(m.returnTime) ?? ""} ${str(m.returnLocation) ? `· ${str(m.returnLocation)}` : ""}`} />
        )}
        {num(m.dailyRate) != null && days && (
          <MetaRow styles={styles} label="租金" value={`${money(num(m.dailyRate)!, cur)} / 天 × ${days} 天`} />
        )}
        {str(m.fuelPolicy) && <MetaRow styles={styles} label="加油" value={fuelLabel(str(m.fuelPolicy)!)} />}
        {str(m.addOns) && <MetaRow styles={styles} label="加裝" value={str(m.addOns)!} />}
        {total != null && role !== "RETURN" && (
          <Text style={[styles.body, { fontSize: 13, fontWeight: "bold", marginTop: 2 }]}>
            總費用 {money(total, cur)}
          </Text>
        )}
      </View>
    );
  }

  if (item.kind === "ATTRACTION") {
    const tickets = Array.isArray(m.tickets) ? (m.tickets as Array<{ label?: string; unitPrice?: number; quantity?: number }>) : null;
    const cur = str(m.ticketCurrency);
    const total =
      tickets && tickets.length > 0
        ? tickets.reduce((s, t) => s + (Number(t.unitPrice) || 0) * (Number(t.quantity) || 0), 0)
        : num(m.ticketPrice) ?? 0;
    if (!tickets && total === 0 && !str(m.openingHours) && !str(m.highlights)) return null;
    return (
      <View style={metaCardStyle(palette)}>
        <Text style={[styles.label, { color: palette.brandAccent, marginBottom: 2 }]}>景點詳情</Text>
        {tickets && tickets.length > 0 && (
          <View style={{ marginBottom: 2 }}>
            <Text style={styles.muted}>票價</Text>
            {tickets.map((t, i) => {
              const p = Number(t.unitPrice) || 0;
              const q = Number(t.quantity) || 0;
              return (
                <Text key={i} style={[styles.muted, { fontSize: 8 }]}>
                  · {t.label ?? "票券"} · {money(p, cur)} × {q} = {money(p * q, cur)}
                </Text>
              );
            })}
            <Text style={[styles.body, { fontWeight: "bold" }]}>合計 {money(total, cur)}</Text>
          </View>
        )}
        {!tickets && total > 0 && <MetaRow styles={styles} label="票價" value={money(total, cur)} />}
        {str(m.openingHours) && <MetaRow styles={styles} label="開放" value={str(m.openingHours)!} />}
        {str(m.highlights) && (
          <View style={{ marginTop: 2 }}>
            <Text style={styles.muted}>重點</Text>
            {str(m.highlights)!
              .split("\n")
              .filter(Boolean)
              .map((line, i) => (
                <Text key={i} style={[styles.muted, { fontSize: 8 }]}>· {line}</Text>
              ))}
          </View>
        )}
      </View>
    );
  }

  if (item.kind === "MEAL") {
    const avg = num(m.averagePrice);
    const party = num(m.partySize);
    const total = avg && party ? avg * party : null;
    const cur = str(m.ticketCurrency) ?? str(m.currency);
    const period = str(m.mealPeriod);
    if (!avg && !str(m.cuisine) && !str(m.mustTry)) return null;
    return (
      <View style={metaCardStyle(palette)}>
        <Text style={[styles.label, { color: palette.brandAccent, marginBottom: 2 }]}>餐飲詳情</Text>
        {period && <MetaRow styles={styles} label="時段" value={mealPeriodLabel(period)} />}
        {str(m.cuisine) && <MetaRow styles={styles} label="菜系" value={str(m.cuisine)!} />}
        {avg != null && (
          <MetaRow
            styles={styles}
            label="人均"
            value={`${money(avg, cur)}${party ? ` × ${party} 人 = ${money(total ?? 0, cur)}` : ""}`}
          />
        )}
        {str(m.reservationRef) && <MetaRow styles={styles} label="訂位" value={str(m.reservationRef)!} />}
        {str(m.mustTry) && (
          <View style={{ marginTop: 2 }}>
            <Text style={styles.muted}>必點</Text>
            {str(m.mustTry)!.split("\n").filter(Boolean).map((line, i) => (
              <Text key={i} style={[styles.muted, { fontSize: 8 }]}>· {line}</Text>
            ))}
          </View>
        )}
      </View>
    );
  }

  if (item.kind === "FREE") {
    const budget = num(m.budget);
    const cur = str(m.ticketCurrency) ?? str(m.currency);
    if (!budget && !str(m.plan)) return null;
    return (
      <View style={metaCardStyle(palette)}>
        <Text style={[styles.label, { color: palette.brandAccent, marginBottom: 2 }]}>自由時間</Text>
        {str(m.plan) && <MetaRow styles={styles} label="計劃" value={str(m.plan)!} />}
        {budget != null && <MetaRow styles={styles} label="預算" value={money(budget, cur)} />}
        {str(m.alternativePlan) && <MetaRow styles={styles} label="備案" value={str(m.alternativePlan)!} />}
      </View>
    );
  }

  return null;
}

function MetaRow({ styles, label, value }: { styles: ReturnType<typeof makeStyles>; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 4, marginBottom: 1 }}>
      <Text style={[styles.muted, { width: 50, fontSize: 8 }]}>{label}</Text>
      <Text style={[styles.body, { flex: 1, fontSize: 8 }]}>{value}</Text>
    </View>
  );
}
function metaCardStyle(palette: { surfaceSoft: string; hairlineSoft: string }) {
  return {
    marginTop: 4,
    padding: 4,
    backgroundColor: palette.surfaceSoft,
    borderLeft: `2px solid ${palette.hairlineSoft}`,
  };
}
function fuelLabel(p: string): string {
  return p === "FULL_TO_FULL" ? "滿油還" : p === "FULL_TO_EMPTY" ? "同油位還" : p === "PRE_PURCHASED" ? "預購油" : "其他";
}
function mealPeriodLabel(p: string): string {
  return p === "BREAKFAST" ? "早餐" : p === "LUNCH" ? "午餐" : p === "DINNER" ? "晚餐" : p === "LATE_NIGHT" ? "宵夜" : p;
}

function BackCoverPage({
  data,
  styles,
  size,
  orientation,
}: {
  data: PdfTripData;
  styles: ReturnType<typeof makeStyles>;
  size: "A4" | "A5" | "LETTER";
  orientation: "portrait" | "landscape";
}) {
  return (
    <Page size={size} orientation={orientation} style={[styles.page, { padding: 0 }]}>
      <View style={{ flex: 1, padding: 56, justifyContent: "space-between" }}>
        <View>
          <Text style={styles.label}>EMERGENCY · 緊急聯絡</Text>
          <View style={[styles.hairline, { marginVertical: 8 }]} />
          <Text style={styles.body}>· 旅伴：________________________________</Text>
          <Text style={styles.body}>· 住宿：________________________________</Text>
          <Text style={styles.body}>· 駐外辦事處：__________________________</Text>
          <Text style={styles.body}>· 信用卡掛失：__________________________</Text>
        </View>
        <View>
          <Text style={[styles.muted, { fontSize: 9 }]}>{data.title}</Text>
          <Text style={[styles.muted, { fontSize: 9 }]}>{data.startDate} – {data.endDate}</Text>
          <Text style={[styles.muted, { fontSize: 9, marginTop: 8 }]}>由 旅遊規劃Z 製作 · {new Date().toISOString().slice(0, 10)}</Text>
        </View>
      </View>
    </Page>
  );
}
