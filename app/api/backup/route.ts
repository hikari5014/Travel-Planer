import { NextResponse } from "next/server";
import { exportAllAsJson, importFromJson } from "@/lib/services/backup-service";

// GET /api/backup → download JSON snapshot
export async function GET() {
  const snapshot = await exportAllAsJson();
  const filename = `travel-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(snapshot, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

// POST /api/backup with JSON body → wipe + restore
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "請求 body 必須是 JSON" }, { status: 400 });
  }
  try {
    const result = await importFromJson(body);
    return NextResponse.json({ ok: true, counts: result.counts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "匯入失敗" },
      { status: 400 },
    );
  }
}
