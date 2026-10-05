import { mkdirSync, writeFileSync } from "node:fs";
import { buildAutomationJob } from "../../app/data";
import { fixtureEmployees } from "./fixtures";
mkdirSync("work", { recursive: true });
writeFileSync("work/whatif-job.json", JSON.stringify(buildAutomationJob(fixtureEmployees[0]), null, 2));
