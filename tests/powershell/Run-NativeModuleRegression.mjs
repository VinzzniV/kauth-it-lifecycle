import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv[2]) throw new Error("Supply a sanitized saved WhatIf job path.");
const directory = path.dirname(fileURLToPath(import.meta.url));
const powershell = path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const env = { ...process.env, PSModulePath: path.join(process.env.ProgramFiles, "PowerShell", "7", "Modules") };
const baseline = spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", "if (Get-Command ConvertTo-SecureString -ErrorAction SilentlyContinue) { throw 'Native-module isolation was not reproduced.' }; Write-Output 'Inherited module path reproduces missing Security cmdlet.'"], { env, stdio: "inherit", windowsHide: true });
if (baseline.error) throw baseline.error;
if (baseline.status !== 0) process.exit(baseline.status ?? 1);
for (const [file, args] of [
  ["Run-ConfigurationRegression.ps1", []],
  ["Run-ServerEnvelopeRegression.ps1", ["-SavedJobPath", path.resolve(process.argv[2])]],
  ["Run-Regression.ps1", []],
]) {
  const result = spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", path.join(directory, file), ...args], { env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Node-launched Windows PowerShell passed with native modules absent from inherited PSModulePath.");
