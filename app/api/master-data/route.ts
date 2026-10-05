import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { masterData } from "../../../db/schema";
import { mergeMasterData } from "../../data";

const itemSchema = z.object({
  id: z.string().min(1).max(100), kind: z.enum(["location", "group", "application", "task", "ou", "helpdesk"]), label: z.string().trim().min(1).max(200), value: z.string().trim().max(2000), owner: z.string().trim().min(1).max(200), active: z.boolean(),
});

export async function GET() {
  try { return Response.json({ items: mergeMasterData(await getDb().select().from(masterData) as Parameters<typeof mergeMasterData>[0]) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Stammdaten nicht verfügbar" }, { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const item = itemSchema.parse(await request.json());
    if (item.active && !item.value) return Response.json({ error: "Aktive Stammdaten benötigen einen technischen Wert." }, { status: 400 });
    if (item.kind === "task" && !["manual", "agent"].includes(item.value)) return Response.json({ error: "Aufgabenregel: Wert muss manual oder agent sein." }, { status: 400 });
    if (item.kind === "ou" && !/^OU=.+,DC=.+/i.test(item.value)) return Response.json({ error: "OU muss ein vollständiger Distinguished Name sein." }, { status: 400 });
    if (item.kind === "location" && !/^[A-Z]{2,5}$/.test(item.value)) return Response.json({ error: "Standortcode: 2–5 Großbuchstaben erforderlich." }, { status: 400 });
    await getDb().insert(masterData).values({ ...item, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: masterData.id, set: { kind: item.kind, label: item.label, value: item.value, owner: item.owner, active: item.active, updatedAt: new Date().toISOString() } });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Stammdatum konnte nicht gespeichert werden" }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(await request.json());
    const existing = await getDb().select().from(masterData).where(eq(masterData.id, id)).limit(1);
    if (existing.length) await getDb().update(masterData).set({ active: false, updatedAt: new Date().toISOString() }).where(eq(masterData.id, id));
    else {
      const defaultItem = mergeMasterData([]).find((item) => item.id === id);
      if (!defaultItem) return Response.json({ error: "Stammdatum wurde nicht gefunden." }, { status: 404 });
      await getDb().insert(masterData).values({ ...defaultItem, active: false, updatedAt: new Date().toISOString() });
    }
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Stammdatum konnte nicht entfernt werden" }, { status: 400 }); }
}
