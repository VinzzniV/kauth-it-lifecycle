import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { masterData } from "../../../db/schema";

const itemSchema = z.object({
  id: z.string().min(1), kind: z.enum(["group", "application", "task", "ou"]), label: z.string().min(1), value: z.string(), owner: z.string().min(1), active: z.boolean(),
});

export async function GET() {
  try { return Response.json({ items: await getDb().select().from(masterData) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Stammdaten nicht verfügbar" }, { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const item = itemSchema.parse(await request.json());
    await getDb().insert(masterData).values({ ...item, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: masterData.id, set: { kind: item.kind, label: item.label, value: item.value, owner: item.owner, active: item.active, updatedAt: new Date().toISOString() } });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Stammdatum konnte nicht gespeichert werden" }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(await request.json());
    const existing = await getDb().select().from(masterData).where(eq(masterData.id, id)).limit(1);
    if (existing.length) await getDb().update(masterData).set({ active: false, updatedAt: new Date().toISOString() }).where(eq(masterData.id, id));
    else await getDb().insert(masterData).values({ id, kind: "application", label: id, value: "", owner: "IT", active: false, updatedAt: new Date().toISOString() });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Stammdatum konnte nicht entfernt werden" }, { status: 400 }); }
}
