"use client";

// Shared Kakao Maps JavaScript SDK loader. Used by both TransitKakaoMapsPanel
// (paste-and-parse dialog) and KakaoMapPanel (full editor map provider).
//
// Kakao requires you to register the domain at developers.kakao.com → 앱 설정
// → Web 플랫폼. Otherwise the script loads but every API call throws "appkey
// is invalid" or "Domain not registered".

const SDK_LOADED_FLAG = "__kakaoMapsSdkLoaded";

// Library tokens we need across panels — services for Places search,
// clusterer/drawing reserved for future use. Listed once here so the loader
// requests them in a single script tag (Kakao's SDK can't add libraries
// incrementally; you have to include them at load time).
const REQUIRED_LIBRARIES = "services";

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (cb: () => void) => void;
        Map: new (container: HTMLElement, opts: { center: KakaoLatLng; level?: number }) => KakaoMap;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        Marker: new (opts: { position: KakaoLatLng; map?: KakaoMap; image?: KakaoMarkerImage }) => KakaoMarker;
        MarkerImage: new (
          src: string,
          size: KakaoSize,
          opts?: { offset?: KakaoPoint; alt?: string },
        ) => KakaoMarkerImage;
        Size: new (w: number, h: number) => KakaoSize;
        Point: new (x: number, y: number) => KakaoPoint;
        LatLngBounds: new () => KakaoBounds;
        Polyline: new (opts: {
          path: KakaoLatLng[];
          strokeWeight?: number;
          strokeColor?: string;
          strokeOpacity?: number;
          strokeStyle?: "solid" | "shortdash" | "dash" | "longdash" | "dashdot";
          map?: KakaoMap;
        }) => KakaoPolyline;
        CustomOverlay: new (opts: {
          position: KakaoLatLng;
          content: string | HTMLElement;
          yAnchor?: number;
          xAnchor?: number;
          map?: KakaoMap;
          clickable?: boolean;
          zIndex?: number;
        }) => KakaoCustomOverlay;
        event: {
          addListener: (target: unknown, type: string, handler: (e?: KakaoMouseEvent) => void) => void;
          removeListener: (target: unknown, type: string, handler: (e?: KakaoMouseEvent) => void) => void;
        };
      };
    };
    [SDK_LOADED_FLAG]?: "pending" | "ready";
  }
}

export type KakaoLatLng = { __brand: "KakaoLatLng"; getLat: () => number; getLng: () => number };
export type KakaoMap = {
  setCenter: (latlng: KakaoLatLng) => void;
  setLevel: (level: number) => void;
  getLevel: () => number;
  setBounds: (b: KakaoBounds) => void;
  panTo: (latlng: KakaoLatLng) => void;
  getNode: () => HTMLElement;
};
export type KakaoMarker = { setMap: (m: KakaoMap | null) => void; setPosition: (p: KakaoLatLng) => void };
export type KakaoMarkerImage = { __brand: "KakaoMarkerImage" };
export type KakaoSize = { __brand: "KakaoSize" };
export type KakaoPoint = { __brand: "KakaoPoint" };
export type KakaoBounds = { extend: (p: KakaoLatLng) => void };
export type KakaoPolyline = { setMap: (m: KakaoMap | null) => void };
export type KakaoCustomOverlay = { setMap: (m: KakaoMap | null) => void; setPosition: (p: KakaoLatLng) => void };
export type KakaoMouseEvent = { latLng: KakaoLatLng };

export function loadKakaoSdk(appKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window[SDK_LOADED_FLAG] === "ready" && window.kakao?.maps) {
      resolve();
      return;
    }
    if (window[SDK_LOADED_FLAG] === "pending") {
      const start = Date.now();
      const wait = () => {
        if (window[SDK_LOADED_FLAG] === "ready" && window.kakao?.maps) return resolve();
        if (Date.now() - start > 15_000) return reject(new Error("Kakao SDK load timeout"));
        setTimeout(wait, 100);
      };
      wait();
      return;
    }
    window[SDK_LOADED_FLAG] = "pending";
    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      appKey,
    )}&libraries=${REQUIRED_LIBRARIES}&autoload=false`;
    script.async = true;
    script.onload = () => {
      window.kakao?.maps.load(() => {
        window[SDK_LOADED_FLAG] = "ready";
        resolve();
      });
    };
    script.onerror = () => {
      window[SDK_LOADED_FLAG] = undefined;
      reject(new Error("Kakao SDK script failed to load — check appkey or registered domain"));
    };
    document.head.appendChild(script);
  });
}
