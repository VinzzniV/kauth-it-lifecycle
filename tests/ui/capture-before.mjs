import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
const directory = "docs/ui-ux/screenshots";
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const url = process.env.UI_BEFORE_URL || "http://127.0.0.1:18081";
  for (const [route, name] of [["/", "overview"], ["/aufgaben", "tasks"], ["/automationen", "automations"]]) {
    await page.goto(url + route); await page.getByRole("button", { name: "Datei einlesen", exact: true }).waitFor(); await page.waitForTimeout(300);
    await page.screenshot({ path: `${directory}/before-${name}-1440.png` });
    if (route === "/automationen") {
      await page.getByRole("button", { name: "Echt ausführen", exact: true }).click();
      await page.getByRole("alertdialog").waitFor(); await page.waitForTimeout(300); await page.screenshot({ path: `${directory}/before-approval-1440.png`, animations: "disabled" }); await page.keyboard.press("Escape");
    }
  }
  await page.goto(url + "/mitarbeiter"); await page.getByText("Test Fall 2", { exact: true }).click();
  await page.getByRole("dialog").waitFor(); await page.screenshot({ path: `${directory}/before-record-1440.png` });
  await page.getByRole("tab", { name: "Automation", exact: true }).click(); await page.screenshot({ path: `${directory}/before-result-1440.png` });
  await page.getByRole("button", { name: "Rückgängig machen", exact: true }).click(); await page.getByRole("alertdialog").waitFor(); await page.waitForTimeout(300); await page.screenshot({ path: `${directory}/before-rollback-1440.png`, animations: "disabled" });
  await page.goto(url + "/status/" + "a".repeat(31) + "3"); await page.getByText("Bereitgestellte Zugänge und Geräte").waitFor(); await page.screenshot({ path: `${directory}/before-public-1440.png` });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url); await page.getByRole("button", { name: "Datei einlesen", exact: true }).waitFor(); await page.waitForTimeout(300); await page.screenshot({ path: `${directory}/before-overview-390.png` });
  writeFileSync("work/before-evidence.json", JSON.stringify({ synthetic: true, browser: await browser.version(), sizes: [[1440,900],[390,844]], captured: true }, null, 2));
} finally { await browser.close(); }
