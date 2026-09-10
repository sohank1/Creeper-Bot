import fs from "fs";
import path from "path";
import { registerComponent } from "../runtimeDiagnostics";

export interface MissingTiming {
    action: string; date: string; minimum: number;
    username?: string;
    historyMs: number; indexMs: number; calculationMs: number; renderMs: number;
    deliveryMs: number; cleanupMs: number; totalMs: number;
    cached: boolean; items: number; imageBytes: number;
    outcome: "success" | "failure" | "image-fallback";
}

export class MissingTelemetry {
    private recent: MissingTiming[] = [];
    private requests = 0;
    private failures = 0;
    private pending = Promise.resolve();
    constructor() { registerComponent("missingCosmeticsTelemetry", this); }
    record(timing: MissingTiming) {
        this.requests++;
        if (timing.outcome !== "success") this.failures++;
        this.recent.push({ ...timing });
        if (this.recent.length > 50) this.recent.shift();
        const timestamp = new Date().toISOString();
        const directory = path.resolve(".cache", "missing-cosmetics", "telemetry");
        // Diagnostic timings only, never report snapshots or cosmetic data.
        this.pending = this.pending.then(async () => {
            await fs.promises.mkdir(directory, { recursive: true });
            await fs.promises.appendFile(path.join(directory, `${timestamp.slice(0, 10)}.jsonl`), JSON.stringify({ timestamp, ...timing }) + "\n");
        }).catch(error => console.warn("[MissingCosmetics] Telemetry write failed:", error.message));
    }
    getDiagnostics() { return { requests: this.requests, failures: this.failures, recent: [...this.recent] }; }
}

export function timingLabel(timing: MissingTiming) {
    return `Calculation ${(timing.indexMs + timing.calculationMs).toFixed(1)} ms (index ${timing.indexMs.toFixed(1)} + query ${timing.calculationMs.toFixed(1)})\nHistory ${timing.historyMs.toFixed(0)} ms · Render ${timing.renderMs.toFixed(0)} ms\nDelivery ${timing.deliveryMs.toFixed(0)} ms · Total to report ${timing.totalMs.toFixed(0)} ms`;
}
