import Image from "next/image";
import iconSmall from "../../public/brand/icon-small.jpg";

// Phase 15 — Brand mark now renders the real Travel Planner Z icon (gold
// paper plane on dark rounded square). Imported as a static asset so Next
// gets dimension info at build time and serves an optimised <img>.
// Component name kept as `SpikeMark` for backwards compat with existing
// import sites (TopNav / Footer / page headers).
export function SpikeMark({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={iconSmall}
      alt="Travel Planner Z"
      width={size}
      height={size}
      className={`rounded-[22%] ${className ?? ""}`}
    />
  );
}
