import type { SVGProps } from "react";

// Cal.com-style brand mark — a filled near-black circle.
// Component name kept as `SpikeMark` for backwards compat with existing imports;
// rendering is now the Cal-style dot.
export function SpikeMark({
  size = 16,
  className,
  ...rest
}: { size?: number; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      {/* Inner notch — small white wedge for Cal-style optical accent */}
      <path
        d="M 12 4 A 8 8 0 0 1 20 12 L 16 12 A 4 4 0 0 0 12 8 Z"
        fill="white"
        opacity="0.95"
      />
    </svg>
  );
}
