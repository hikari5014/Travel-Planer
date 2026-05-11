import Link from "next/link";
import { ArrowLeft, KeyRound, Lock } from "lucide-react";
import { SpikeMark } from "@/components/brand/SpikeMark";
import { isAdminPasswordSet } from "@/lib/auth/admin";
import { isCurrentUserAdmin } from "@/lib/auth/current-user";
import { loginAsAdminAction } from "@/app/(actions)/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const showError = sp.error === "1";
  const passwordConfigured = isAdminPasswordSet();
  const alreadyAdmin = await isCurrentUserAdmin();

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-hairline-soft bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-content items-center gap-4 px-lg">
          <Link href="/" className="flex items-center gap-2 text-muted hover:text-ink">
            <SpikeMark size={14} />
            <span className="text-caption">旅遊規劃Z</span>
          </Link>
          <span className="text-muted-soft">/</span>
          <span className="text-title-sm text-ink">管理者登入</span>
          <Link
            href="/"
            className="ml-auto inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink"
          >
            <ArrowLeft size={12} strokeWidth={2} />
            返回工作區
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-5 px-lg py-2xl">
        <div className="flex items-center gap-2 text-muted">
          <Lock size={14} strokeWidth={1.8} />
          <span className="text-caption-uppercase">Admin Sign-in</span>
        </div>
        <h1 className="text-display-sm text-ink">登入管理者帳號</h1>
        <p className="text-body-sm text-muted">
          管理者帳號讓你的 API keys 與行程資料綁在固定的 user id（<code className="rounded bg-surface-card px-1 font-mono text-[11px]">admin</code>），不會因為換瀏覽器、換 Vercel preview URL 或清 cookie 而看不到自己的資料。其他人仍透過邀請連結加入你的行程。
        </p>

        {!passwordConfigured && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-[11px] text-warning">
            <p className="font-semibold">尚未設定 ADMIN_PASSWORD 環境變數</p>
            <p className="mt-1 text-muted">
              在 Vercel → Settings → Environment Variables 加入 <code className="rounded bg-surface-card px-1 font-mono">ADMIN_PASSWORD</code>（Production / Preview / Development 三個 scope 都要勾），重新 deploy 後才能登入。
            </p>
          </div>
        )}

        {alreadyAdmin && (
          <div className="rounded-md border border-success/40 bg-success/5 p-3 text-[11px] text-success">
            你目前已經是管理者身份。
            <Link href="/settings" className="ml-1 underline">
              前往設定 →
            </Link>
          </div>
        )}

        {showError && (
          <div className="rounded-md border border-error/40 bg-error/5 p-3 text-[11px] text-error">
            密碼錯誤
          </div>
        )}

        <form action={loginAsAdminAction} className="space-y-3">
          <label className="block">
            <span className="text-caption text-muted">密碼</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={!passwordConfigured}
              className="mt-1 h-10 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-body-sm focus:border-ink focus:outline-none disabled:opacity-50"
            />
          </label>
          <button
            type="submit"
            disabled={!passwordConfigured}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
          >
            <KeyRound size={13} strokeWidth={1.8} />
            登入
          </button>
        </form>

        <p className="text-[11px] text-muted-soft">
          忘記密碼 / 想換密碼：直接到 Vercel 改 <code className="rounded bg-surface-card px-1 font-mono">ADMIN_PASSWORD</code> env var 後 Redeploy 即可。沒有「重設」流程，因為這是個人 deployment。
        </p>
      </main>
    </div>
  );
}
