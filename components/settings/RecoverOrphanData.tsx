"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, RotateCcw } from "lucide-react";
import { claimAllOrphansAction, scanOrphansAction } from "@/app/(actions)/recover-actions";

type Scan = Awaited<ReturnType<typeof scanOrphansAction>>;
type ClaimResult = Awaited<ReturnType<typeof claimAllOrphansAction>>;

export function RecoverOrphanData() {
  const [scan, setScan] = useState<Scan | null>(null);
  const [scanning, setScanning] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<ClaimResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    scanOrphansAction()
      .then(setScan)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setScanning(false));
  }, []);

  async function handleClaim() {
    if (!scan) return;
    const total = scan.orphanTrips + scan.orphanSettings.length + scan.orphanApiLogs;
    if (
      !confirm(
        `這會把 DB 中所有不屬於你的資料（${scan.orphanTrips} 筆行程、${scan.orphanSettings.length} 組設定、${scan.orphanApiLogs} 筆 API log）全部認到你目前的身份下。\n\n如果這個 DB 只有你一個人在用，就放心按確定。\n如果有多位真實使用者共用，這個動作會把別人的資料也合併到你身上。\n\n確定要繼續嗎？`,
      )
    )
      return;
    setClaiming(true);
    setErr(null);
    try {
      const r = await claimAllOrphansAction();
      setClaimed(r);
      // Re-scan to reflect the new state
      const next = await scanOrphansAction();
      setScan(next);
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setClaiming(false);
    }
  }

  if (scanning) {
    return (
      <div className="flex items-center gap-2 text-caption text-muted">
        <Loader2 size={14} className="animate-spin" />
        檢查中…
      </div>
    );
  }

  if (err) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-error/30 bg-error/5 p-3 text-caption text-error">
        <AlertTriangle size={14} />
        <span>{err}</span>
      </div>
    );
  }

  if (!scan) return null;

  const orphanTotal = scan.orphanTrips + scan.orphanSettings.length + scan.orphanApiLogs;
  const idShort = scan.currentUserId.slice(-8);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-hairline-soft bg-surface-soft p-3 text-[11px] text-muted leading-relaxed">
        <p>
          目前身份：<code className="font-mono text-ink">…{idShort}</code> · 你名下行程 {scan.myTrips} 筆
        </p>
      </div>

      {orphanTotal === 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-caption text-success">
          <CheckCircle2 size={14} />
          <span>沒有孤立資料 — 這個 DB 中所有資料都歸屬於你目前的身份。</span>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-caption text-ink">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-warning" />
              <div className="space-y-1">
                <p className="font-medium">發現孤立資料</p>
                <ul className="list-disc pl-4 text-[12px] text-muted">
                  {scan.orphanTrips > 0 && <li>{scan.orphanTrips} 筆行程屬於其他 user id</li>}
                  {scan.orphanSettings.length > 0 && (
                    <li>
                      {scan.orphanSettings.length} 組舊 Settings
                      {scan.orphanSettings.some((s) => s.hasKeys) && (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded-pill bg-badge-violet/15 px-1.5 py-px text-[10px] text-ink">
                          <KeyRound size={9} /> 含 API keys
                        </span>
                      )}
                    </li>
                  )}
                  {scan.orphanApiLogs > 0 && <li>{scan.orphanApiLogs} 筆 API 用量紀錄</li>}
                </ul>
                <p className="text-[11px] text-muted-soft">
                  通常是你每次用了不同的 Vercel deployment URL（domain 不同 → cookie 不同 → 像新使用者）造成的。
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleClaim}
            disabled={claiming}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-button text-on-primary hover:opacity-90 disabled:opacity-60"
          >
            {claiming ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            {claiming ? "認領中…" : "把全部認到我身上"}
          </button>
        </>
      )}

      {claimed && (
        <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-caption text-success">
          <CheckCircle2 size={14} />
          <span>
            完成 · 行程 {claimed.claimedTrips} · API log {claimed.claimedApiLogs}
            {claimed.settingsAdopted && " · 已採用舊 Settings（含 API keys）"}
          </span>
        </div>
      )}
    </div>
  );
}
