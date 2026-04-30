import {
  Landmark,
  UtensilsCrossed,
  Coffee,
  BedDouble,
  TreePine,
  Mountain,
  ShoppingBag,
  Building2,
  Home,
  Camera,
  Palette,
  Music,
  Train,
  Plane,
  CircleParking,
  ConciergeBell,
  Wine,
  IceCreamCone,
  Drama,
  Soup,
  type LucideIcon,
} from "lucide-react";

export type PlaceIconKey =
  | "shrine"        // 神社
  | "temple"        // 寺院
  | "landmark"      // 一般景點
  | "restaurant"    // 餐廳
  | "ramen"         // 拉麵 / 麵食
  | "cafe"          // 咖啡
  | "bar"           // 酒吧
  | "dessert"       // 甜點
  | "lodging"       // 住宿
  | "machiya"       // 町家 / 歷史街道
  | "park"          // 公園 / 庭園
  | "mountain"      // 山 / 觀景台
  | "shopping"      // 購物
  | "museum"        // 美術館 / 博物館
  | "theater"       // 劇場 / 表演
  | "music"         // 音樂活動
  | "station"       // 車站
  | "airport"       // 機場
  | "parking"       // 停車場
  | "free";         // 自由活動

// Each icon entry: lucide icon + brand-aligned tint pair (bg + fg).
// Colors map to DESIGN-claude.md tokens; muted enough for cream canvas.
type IconEntry = { icon: LucideIcon; bg: string; fg: string; label: string };

export const placeIconRegistry: Record<PlaceIconKey, IconEntry> = {
  shrine:     { icon: Landmark,         bg: "bg-primary/12",      fg: "text-primary-active", label: "神社" },
  temple:     { icon: Landmark,         bg: "bg-accent-amber/20", fg: "text-ink",            label: "寺院" },
  landmark:   { icon: Camera,           bg: "bg-accent-amber/15", fg: "text-ink",            label: "景點" },
  restaurant: { icon: UtensilsCrossed,  bg: "bg-primary/12",      fg: "text-primary-active", label: "餐廳" },
  ramen:      { icon: Soup,             bg: "bg-primary/12",      fg: "text-primary-active", label: "麵食" },
  cafe:       { icon: Coffee,           bg: "bg-warning/15",      fg: "text-ink",            label: "咖啡" },
  bar:        { icon: Wine,             bg: "bg-primary/12",      fg: "text-primary-active", label: "酒吧" },
  dessert:    { icon: IceCreamCone,     bg: "bg-warning/15",      fg: "text-ink",            label: "甜點" },
  lodging:    { icon: BedDouble,        bg: "bg-accent-teal/20",  fg: "text-ink",            label: "住宿" },
  machiya:    { icon: Home,             bg: "bg-accent-amber/15", fg: "text-ink",            label: "町家" },
  park:       { icon: TreePine,         bg: "bg-success/15",      fg: "text-ink",            label: "公園" },
  mountain:   { icon: Mountain,         bg: "bg-success/15",      fg: "text-ink",            label: "山景" },
  shopping:   { icon: ShoppingBag,      bg: "bg-accent-amber/15", fg: "text-ink",            label: "購物" },
  museum:     { icon: Palette,          bg: "bg-accent-teal/20",  fg: "text-ink",            label: "美術館" },
  theater:    { icon: Drama,            bg: "bg-primary/12",      fg: "text-primary-active", label: "劇場" },
  music:      { icon: Music,            bg: "bg-primary/12",      fg: "text-primary-active", label: "音樂" },
  station:    { icon: Train,            bg: "bg-muted/15",        fg: "text-muted",          label: "車站" },
  airport:    { icon: Plane,            bg: "bg-brand-accent/15", fg: "text-brand-accent",   label: "機場" },
  parking:    { icon: CircleParking,    bg: "bg-warning/15",      fg: "text-ink",            label: "停車場" },
  free:       { icon: ConciergeBell,    bg: "bg-surface-card",    fg: "text-muted",          label: "自由" },
};

// Auto-resolve a place's icon from its category/types text (no AI).
// Order matters — more specific matches first.
export function resolvePlaceIcon(category: string, googleTypes?: string[]): PlaceIconKey {
  const c = category.toLowerCase();
  const t = (googleTypes ?? []).join(" ").toLowerCase();
  const all = `${c} ${t}`;

  // Lodging
  if (/(住宿|旅館|飯店|hotel|hostel|lodging|ryokan|airbnb)/i.test(all)) return "lodging";
  // Religious — shrine/temple
  if (/(神社|稻荷|大社|shrine)/i.test(all)) return "shrine";
  if (/(寺|寺院|temple|monastery)/i.test(all)) return "temple";
  // Food specifics first
  if (/(咖啡|cafe|café|coffee)/i.test(all)) return "cafe";
  if (/(拉麵|麵|烏龍|ramen|noodle)/i.test(all)) return "ramen";
  if (/(酒吧|居酒屋|bar|pub|wine)/i.test(all)) return "bar";
  if (/(甜點|冰|蛋糕|dessert|ice|sweet|bakery)/i.test(all)) return "dessert";
  if (/(餐廳|食|料理|定食|restaurant|food)/i.test(all)) return "restaurant";
  // Attraction subtypes
  if (/(町家|歷史街道|歷史|old town|historic)/i.test(all)) return "machiya";
  if (/(公園|庭園|park|garden)/i.test(all)) return "park";
  if (/(山|觀景|viewpoint|mountain|peak)/i.test(all)) return "mountain";
  if (/(購物|商店街|百貨|shopping|store|mall)/i.test(all)) return "shopping";
  if (/(美術館|博物館|museum|gallery|art)/i.test(all)) return "museum";
  if (/(劇場|theater|theatre|kabuki|noh)/i.test(all)) return "theater";
  if (/(音樂|演唱|live|concert|music)/i.test(all)) return "music";
  // Transit — airport before station so "羽田空港" / "成田機場" don't fall to station
  if (/(機場|空港|airport|aerodrome|terminal)/i.test(all)) return "airport";
  if (/(車站|駅|station)/i.test(all)) return "station";
  if (/(停車|parking)/i.test(all)) return "parking";
  // Generic fallback
  if (/(景點|attraction|sightseeing|tourist)/i.test(all)) return "landmark";
  return "landmark";
}

// Convenience helper: render the icon with its tint chip.
export function PlaceIconChip({
  iconKey,
  size = 16,
  className = "",
}: {
  iconKey: PlaceIconKey;
  size?: number;
  className?: string;
}) {
  const entry = placeIconRegistry[iconKey];
  const Icon = entry.icon;
  // chip box size scales with icon size
  const box = Math.round(size * 1.75);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md ${entry.bg} ${entry.fg} ${className}`}
      style={{ width: box, height: box }}
      aria-label={entry.label}
    >
      <Icon size={size} strokeWidth={1.8} />
    </span>
  );
}

// Map a resolved icon to the most-likely ScheduleItem kind. Airport → FLIGHT
// auto-activates the flight module; station → can stay ATTRACTION (user picks
// TRAIN manually if it's actually a train ride). Adding a new kind here is
// the single source of truth used by MapClickAddPopup / PlaceSearchDialog.
export function defaultKindForIcon(
  iconKey: PlaceIconKey,
):
  | "ATTRACTION"
  | "MEAL"
  | "LODGING"
  | "FREE"
  | "FLIGHT"
  | "CAR_RENTAL"
  | "TRAIN" {
  if (iconKey === "lodging") return "LODGING";
  if (iconKey === "airport") return "FLIGHT";
  if (
    iconKey === "restaurant" ||
    iconKey === "ramen" ||
    iconKey === "cafe" ||
    iconKey === "bar" ||
    iconKey === "dessert"
  ) {
    return "MEAL";
  }
  return "ATTRACTION";
}

// Bare icon (no chip) — for inline contexts.
export function PlaceIconBare({
  iconKey,
  size = 16,
  className = "",
}: {
  iconKey: PlaceIconKey;
  size?: number;
  className?: string;
}) {
  const entry = placeIconRegistry[iconKey];
  const Icon = entry.icon;
  return <Icon size={size} strokeWidth={1.8} className={`${entry.fg} ${className}`} />;
}
