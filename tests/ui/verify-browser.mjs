import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const directory = "docs/ui-ux/screenshots";
mkdirSync(directory, { recursive: true });
mkdirSync("work", { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const base = process.env.UI_PREVIEW_URL || "http://127.0.0.1:18081";
const passed = [], errors = [], mutations = [];
let page;
try {
  for (const [width, height] of [[1440,900],[1280,720],[390,844]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (request.url().includes("/api/") && request.method() !== "GET") mutations.push(request.url()); });
    const screenshot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: `${directory}/after-${name}-${width}.png`, animations: "disabled" }); };
    const goto = async (path) => { await page.goto(base + path); await page.getByRole("button", { name: "Datei einlesen", exact: true }).waitFor(); await page.waitForTimeout(100); };
    await goto("/");
    await page.getByText("Offene Vorgänge", { exact: true }).waitFor();
    await page.getByRole("textbox", { name: "Mitarbeiter suchen" }).waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overview overflow ${width}`);
    await screenshot("overview");
    await goto("/aufgaben");
    assert.equal(await page.getByRole("button", { name: "Offen", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('[data-slot="checkbox"][data-state="checked"]').count(), 0);
    await page.getByRole("button", { name: "Erledigt", exact: true }).click();
    assert.ok(await page.locator('[data-slot="checkbox"][data-state="checked"]').count() > 0);
    await page.getByRole("button", { name: "Alle", exact: true }).click();
    await page.getByRole("button", { name: "Offen", exact: true }).click();
    await screenshot("tasks");
    await page.getByRole("button", { name: "Akte öffnen: Test Fall 1", exact: true }).first().click();
    assert.equal(await page.getByRole("tab", { name: "Aufgaben", exact: true }).getAttribute("aria-selected"), "true");
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    await goto("/mitarbeiter");
    await page.getByRole("textbox", { name: "Mitarbeiter suchen" }).fill("keine-treffer-xyz");
    await page.getByText("Keine Mitarbeiter für diese Suche gefunden.").waitFor();
    await screenshot("search-empty");
    await page.getByRole("button", { name: "Suche zurücksetzen", exact: true }).click();
    await page.getByRole("textbox", { name: "Mitarbeiter suchen" }).focus();
    let keyboardReached = false;
    for (let i=0;i<15;i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Akte öffnen: Test Fall 1")) { keyboardReached = true; break; }
    }
    assert.ok(keyboardReached, `keyboard record link ${width}`);
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), "none");
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-slot")), "dialog-title");
    assert.equal(await page.getByRole("button", { name: "Mitarbeiter löschen", exact: true }).isVisible(), false);
    await page.getByText("Referenzmetadaten", { exact: true }).waitFor();
    await page.getByRole("tab", { name: "Automation", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    assert.equal(await page.getByRole("tab", { name: "Historie", exact: true }).getAttribute("aria-selected"), "true");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Akte öffnen: Test Fall 2", exact: true }).click();
    await screenshot("record");
    await page.getByRole("tab", { name: "Automation", exact: true }).click();
    await page.getByText("Letztes Ergebnis / Handlungsbedarf", { exact: true }).waitFor();
    const plan = page.getByText("Plan / Vorschau eines neuen vollständigen Auftrags", { exact: true });
    assert.equal(await plan.locator("..").getAttribute("open"), null);
    await screenshot("result");
    const before = await page.getByRole("tab", { name: "Automation", exact: true }).boundingBox();
    await page.getByTestId("record-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const after = await page.getByRole("tab", { name: "Automation", exact: true }).boundingBox();
    assert.equal(before.y, after.y, `tabs remain reachable ${width}`);
    await page.getByRole("button", { name: "Schließen", exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Rückgängig machen", exact: true }).click();
    await page.getByRole("alertdialog").waitFor();
    await page.getByText("Wird zurückgenommen", { exact: true }).waitFor();
    await page.getByText("Bleibt bestehen / manuell zu bearbeiten", { exact: true }).waitFor();
    assert.match(await page.getByTestId("rollback-scope").innerText(), /Microsoft 365/);
    assert.match(await page.getByTestId("rollback-scope").innerText(), /HelpDesk/);
    await screenshot("rollback");
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    for (const [id, expected] of [[3,"Fehlgeschlagen"],[4,"Teilweise erfolgreich"],[5,"Abgeschlossen"],[6,"Prüfung erforderlich"]]) {
      await page.getByRole("button", { name: `Akte öffnen: Test Fall ${id}`, exact: true }).click();
      await page.getByRole("tab", { name: "Automation", exact: true }).click();
      assert.match(await page.getByRole("region", { name: "Letztes Ergebnis und Handlungsbedarf" }).innerText(), new RegExp(expected));
      if (id === 5) {
        assert.equal(await page.getByRole("button", { name: /HelpDesk-Ticket erstellen wiederholen/ }).count(), 0);
        assert.match(await page.getByTestId("record-scroll").innerText(), /zugeordnete echte Wiederholung erfolgreich/);
        await screenshot("retry-group");
      }
      if (id === 6) assert.match(await page.getByTestId("record-scroll").innerText(), /Automatische Wiederholung gesperrt/);
      await page.keyboard.press("Escape");
    }
    await goto("/automationen");
    await page.getByRole("button", { name: "Ergebnis in der Akte ansehen", exact: true }).click();
    assert.equal(await page.getByRole("tab", { name: "Automation", exact: true }).getAttribute("aria-selected"), "true");
    await page.keyboard.press("Escape");
    await screenshot("automations");
    await page.getByRole("button", { name: "Echt ausführen", exact: true }).click();
    await page.getByTestId("execution-scope").waitFor();
    const firstScope = await page.getByTestId("execution-scope").innerText();
    for (const value of ["Test Fall 1", "Microsoft 365", "HelpDesk", "Active Directory", "Aktionen"]) assert.ok(firstScope.includes(value), value);
    await screenshot("approval");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Test Fall 3/ }).click();
    await page.getByRole("button", { name: "Echt ausführen", exact: true }).click();
    assert.match(await page.getByTestId("execution-scope").innerText(), /Test Fall 3/);
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await page.getByText("Geplante Aktionen und Regelherkunft", { exact: true }).click();
    await page.getByRole("link", { name: "Stammdaten: Benutzerkonto anlegen", exact: true }).first().click();
    await page.getByRole("tab", { name: "Aufgaben", exact: true }).waitFor();
    assert.equal(await page.getByRole("tab", { name: "Aufgaben", exact: true }).getAttribute("aria-selected"), "true");
    assert.match(page.url(), /register=task/);
    await page.goto(base + "/status/" + "a".repeat(31) + "3");
    await page.getByText("Zugänge und Geräte", { exact: true }).waitFor();
    const publicText = await page.locator("body").innerText();
    assert.ok(!publicText.includes("Test Referenz"));
    assert.ok(!publicText.includes("requested"));
    assert.match(publicText, /Beantragt/); assert.match(publicText, /nicht bestätigt/);
    assert.match(publicText, /Fehlgeschlagen/);
    await screenshot("public");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `public overflow ${width}`);
    passed.push(`${width}×${height}: navigation/search, filters/direct records, keyboard focus/Enter/arrows/Escape, summary/result priority, sticky tabs, approval identity, rollback limits, retries/review restriction, public status`);
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(mutations, []);
  writeFileSync("docs/ui-ux/browser-evidence.json", JSON.stringify({ status: "passed", synthetic: true, browser: await browser.version(), passed, errors, externalOrMutationRequests: mutations }, null, 2));
  console.log(JSON.stringify({ status: "passed", passed }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: "work/browser-failure.png" }); writeFileSync("work/browser-failure.html", await page.content()); }
  throw error;
} finally { await browser.close(); }
