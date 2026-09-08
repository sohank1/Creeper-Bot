import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import ts from "typescript";
import axios from "axios";
import { MissingHistoryIndex } from "../MissingCosmetics/MissingHistory";
import { renderMissingCosmeticsImage } from "../MissingCosmetics/MissingCosmeticsImage";
import { storedMissingBotLogo } from "../MissingCosmetics/MissingBranding";

// Compile the verified running revision in memory; never alter the worktree.
function historicalModule(file: string, overrides: Record<string, any> = {}) {
    const Module = require("module");
    const filename = path.resolve(file);
    const module = new Module(filename, moduleRequireParent());
    module.filename = filename;
    module.paths = Module._nodeModulePaths(path.dirname(filename));
    const normalRequire = module.require.bind(module);
    module.require = (name: string) => overrides[name] || normalRequire(name);
    const source = execFileSync("git", ["show", `e3bff22:${file}`], { encoding: "utf8" });
    module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
    return module.exports;
}
function moduleRequireParent() { return module; }

async function main() {
    const data = (await axios.get("https://fortnite-api.com/v2/cosmetics?responseFlags=7", { timeout: 45000 })).data.data;
    const report = new MissingHistoryIndex(data).report("2023-05-10", 300);
    if (!report.items.length) throw new Error("Reference date has no report");
    const preview = historicalModule("src/MissingCosmetics/MissingPreview.ts");
    const running = historicalModule("src/MissingCosmetics/MissingCosmeticsImage.ts", { "./MissingPreview": preview });
    const output = path.resolve("artifacts/runtime-comparison");
    await fs.promises.mkdir(output, { recursive: true });
    for (const [name, renderer] of [["running", running.renderMissingCosmeticsImage], ["restored", renderMissingCosmeticsImage]] as const) {
        const render = await renderer(report.items, report.date, "item-shop", 300, storedMissingBotLogo());
        try { await fs.promises.writeFile(path.join(output, `${name}.png`), render.image); }
        finally { await render.close(); }
    }
    console.log(JSON.stringify({ date: report.date, count: report.items.length, output }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
