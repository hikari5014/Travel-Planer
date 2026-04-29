"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Plus,
  Shield,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";
import {
  createShareLinkAction,
  listShareLinksAction,
  listTripMembersAction,
  removeMemberAction,
  revokeShareLinkAction,
  updateMemberRoleAction,
} from "@/app/(actions)/share-actions";
import type { MemberPublic } from "@/lib/services/share-service";

// Owner-only collaboration management dialog. Renders three sections:
//  1. Active members (incl. owner)  — change role / kick
//  2. Active share links            — copy URL / revoke
//  3. Create new share link         — role + optional label

type ShareLinkRow = Awaited<ReturnType<typeof listShareLinksAction>>[number];

export function ShareDialog({
  tripId,
  isOwner,
  onClose,
}: {
  tripId: string;
  isOwner: boolean;
  onClose: () => void;
}) {
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [members, setMembers] = useState<MemberPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Just-created link (raw token visible only this once)
  const [justCreated, setJustCreated] = useState<{
    id: string;
    url: string;
    label: string | null;
    role: string;
  } | null>(null);
  // Form state for "new link" panel
  const [newRole, setNewRole] = useState<"editor" | "viewer">("editor");
  const [newLabel, setNewLabel] = useState("");
  const [creating, startCreate] = useTransition();
  const [revoking, startRevoke] = useTransition();
  const [updating, startUpdate] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const [l, m] = await Promise.all([
        listShareLinksAction(tripId),
        listTripMembersAction(tripId),
      ]);
      setLinks(l);
      setMembers(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // ESC closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function buildShareUrl(linkId: string, rawToken: string): string {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/trips/${tripId}/join?s=${encodeURIComponent(linkId)}&t=${encodeURIComponent(rawToken)}`;
  }

  function handleCreate() {
    if (!isOwner) return;
    setError(null);
    startCreate(async () => {
      try {
        const result = await createShareLinkAction({
          tripId,
          role: newRole,
          label: newLabel,
        });
        setJustCreated({
          id: result.id,
          url: buildShareUrl(result.id, result.token),
          label: result.label,
          role: result.role,
        });
        setNewLabel("");
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "建立失敗");
      }
    });
  }

  function handleRevoke(shareId: string, removeMembers: boolean) {
    if (!isOwner) return;
    if (!confirm(removeMembers ? "撤銷連結並把已加入的人踢出？" : "撤銷此分享連結？已加入的人保留存取。")) return;
    setError(null);
    startRevoke(async () => {
      try {
        await revokeShareLinkAction(tripId, shareId, removeMembers);
        if (justCreated?.id === shareId) setJustCreated(null);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "撤銷失敗");
      }
    });
  }

  function handleRemoveMember(userId: string, name: string) {
    if (!isOwner) return;
    if (!confirm(`移除「${name}」？對方下次重新整理就會看到「無權限」。`)) return;
    setError(null);
    startUpdate(async () => {
      try {
        await removeMemberAction(tripId, userId);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "移除失敗");
      }
    });
  }

  function handleChangeRole(userId: string, role: "editor" | "viewer") {
    if (!isOwner) return;
    setError(null);
    startUpdate(async () => {
      try {
        await updateMemberRoleAction(tripId, userId, role);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "變更失敗");
      }
    });
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((v) => (v === id ? null : v)), 1500);
    } catch {
      setError("複製失敗，請手動選取");
    }
  }

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] flex items-start justify-center bg-ink/40 px-4 pt-16 pb-8 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-pop"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline-soft px-5 py-4">
          <div>
            <p className="text-caption-uppercase text-muted-soft">SHARE</p>
            <h2 className="flex items-center gap-1.5 text-title-md text-ink">
              <LinkIcon size={16} strokeWidth={2} />
              邀請其他人共同編輯
            </h2>
            <p className="mt-1 text-caption text-muted">
              產生一段網址，把它寄給家人/旅伴。對方點開就會自動加入此旅程。
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        {!isOwner && (
          <div className="border-b border-hairline-soft bg-surface-soft px-5 py-3 text-caption text-muted">
            <span className="inline-flex items-center gap-1">
              <Shield size={12} /> 你不是這個旅程的擁有者，只能查看不能管理連結。
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-caption text-muted">
              <Loader2 size={14} className="animate-spin" /> 載入中…
            </div>
          ) : (
            <div className="space-y-5 p-5">
              {/* Members */}
              <section>
                <h3 className="mb-2 text-caption-uppercase text-muted-soft">目前成員（{members.length}）</h3>
                <ul className="space-y-1.5">
                  {members.map((m) => (
                    <li
                      key={m.userId}
                      className="flex items-center gap-3 rounded-md border border-hairline-soft bg-canvas p-2"
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-card text-caption text-ink">
                        {avatarInitials(m.displayName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-body-sm text-ink">
                          {m.displayName}
                          {m.isMe && <span className="rounded-pill bg-brand-accent/15 px-1.5 py-0.5 text-[9px] text-brand-accent">你</span>}
                          {m.isOwner && <span className="rounded-pill bg-success/15 px-1.5 py-0.5 text-[9px] text-success">擁有者</span>}
                        </p>
                        <p className="text-[11px] text-muted">
                          {roleLabel(m.role)} · 上次活動：{relTime(m.lastSeenAt)}
                        </p>
                      </div>
                      {isOwner && !m.isOwner && (
                        <div className="flex items-center gap-1">
                          <select
                            value={m.role}
                            disabled={updating}
                            onChange={(e) => handleChangeRole(m.userId, e.target.value as "editor" | "viewer")}
                            className="h-7 rounded border border-hairline bg-canvas px-1.5 text-[11px]"
                          >
                            <option value="editor">編輯者</option>
                            <option value="viewer">唯讀</option>
                          </select>
                          <button
                            disabled={updating}
                            onClick={() => handleRemoveMember(m.userId, m.displayName)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-error/10 hover:text-error disabled:opacity-60"
                            title="移除成員"
                          >
                            <UserMinus size={12} strokeWidth={1.8} />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              {/* Just-created link banner */}
              {justCreated && (
                <section className="rounded-md border border-success/40 bg-success/5 p-3">
                  <p className="flex items-center gap-1.5 text-caption font-medium text-success">
                    <Check size={12} /> 已建立連結（{roleLabel(justCreated.role)}{justCreated.label ? ` · ${justCreated.label}` : ""}）
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    這個 token 只會在這裡顯示一次。請立刻複製寄給對方。
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <input
                      readOnly
                      value={justCreated.url}
                      onFocus={(e) => e.currentTarget.select()}
                      className="h-9 flex-1 rounded-md border border-hairline bg-canvas px-2 font-mono text-[11px] text-ink focus:border-ink focus:outline-none"
                    />
                    <button
                      onClick={() => copy(justCreated.url, "just")}
                      className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-button text-on-primary hover:bg-primary-active"
                    >
                      {copiedId === "just" ? <><Check size={12} /> 已複製</> : <><Copy size={12} /> 複製</>}
                    </button>
                  </div>
                </section>
              )}

              {/* Existing links */}
              {isOwner && (
                <section>
                  <h3 className="mb-2 text-caption-uppercase text-muted-soft">分享連結（{links.filter((l) => !l.revokedAt).length} 個有效）</h3>
                  {links.length === 0 ? (
                    <p className="rounded-md border border-dashed border-hairline-soft bg-surface-soft p-3 text-caption text-muted-soft">
                      尚未建立過連結。下方建立一個。
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {links.map((l) => {
                        const isRevoked = !!l.revokedAt;
                        const isExpired = !!l.expiresAt && new Date(l.expiresAt) < new Date();
                        const inactive = isRevoked || isExpired;
                        return (
                          <li
                            key={l.id}
                            className={`flex items-center gap-3 rounded-md border bg-canvas p-2 ${
                              inactive ? "border-hairline-soft opacity-60" : "border-hairline-soft"
                            }`}
                          >
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-surface-card text-muted">
                              {l.role === "editor" ? <Pencil size={14} /> : <Eye size={14} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-body-sm text-ink">
                                {l.label || (l.role === "editor" ? "編輯者連結" : "唯讀連結")}
                              </p>
                              <p className="text-[11px] text-muted">
                                {roleLabel(l.role)} · {l.memberCount} 人已加入 · 建立於 {relTime(l.createdAt)}
                                {isRevoked && " · 已撤銷"}
                                {isExpired && !isRevoked && " · 已過期"}
                              </p>
                            </div>
                            {!inactive && (
                              <button
                                disabled={revoking}
                                onClick={() => handleRevoke(l.id, false)}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-error/10 hover:text-error disabled:opacity-60"
                                title="撤銷此連結（保留現有成員）"
                              >
                                <Trash2 size={12} strokeWidth={1.8} />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}

              {/* Create new */}
              {isOwner && (
                <section className="rounded-md border border-hairline bg-surface-soft p-3">
                  <h3 className="mb-2 text-caption-uppercase text-muted-soft">建立新連結</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="col-span-1 block">
                      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">權限</span>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as "editor" | "viewer")}
                        className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none"
                      >
                        <option value="editor">編輯者</option>
                        <option value="viewer">唯讀</option>
                      </select>
                    </label>
                    <label className="col-span-2 block">
                      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">備註（選填）</span>
                      <input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        maxLength={40}
                        placeholder="例：給家人 / 團員 A"
                        className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none"
                      />
                    </label>
                  </div>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="mt-3 inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
                  >
                    {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} strokeWidth={2} />}
                    產生連結
                  </button>
                </section>
              )}

              {error && (
                <div className="flex items-start gap-1.5 rounded-md border border-error/30 bg-error/5 p-3 text-caption text-error">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function avatarInitials(name: string): string {
  // Take first non-whitespace + last single char if 2+, else first char.
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 2) return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
  return trimmed[0].toUpperCase();
}

function roleLabel(role: string): string {
  if (role === "owner") return "擁有者";
  if (role === "editor") return "編輯者";
  if (role === "viewer") return "唯讀";
  return role;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - t) / 1000;
  if (diff < 60) return "剛剛";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(iso).toLocaleDateString("zh-TW");
}
