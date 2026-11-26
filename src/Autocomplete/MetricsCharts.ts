export type MetricsChartType = "line" | "bar";
export type MetricsChartColor = "blue" | "green" | "orange" | "purple" | "red";

export type MetricsChartDataset = {
    label: string;
    data: number[];
    color: MetricsChartColor;
};

export type MetricsChartConfig = {
    id: string;
    title: string;
    description: string;
    type: MetricsChartType;
    labels: string[];
    datasets: MetricsChartDataset[];
    stacked?: boolean;
    valueSuffix?: string;
    emptyMessage?: string;
};

export const METRICS_CHART_STYLES = `
.chart-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:16px}
.chart-panel{background:rgba(16,29,48,.91);border:1px solid var(--line);border-radius:11px;padding:17px;min-width:0;margin:0}
.chart-panel figcaption{display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:10px}
.chart-panel h2,.chart-panel h3{margin:0 0 4px}
.chart-panel figcaption p{margin:0;color:var(--muted);font-size:12px}
.chart-container{position:relative;width:100%;height:248px}
.chart-container canvas{display:block;width:100%!important;height:100%!important}
.chart-legend{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;color:var(--muted);font-size:11px}
.chart-legend span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.chart-legend i{width:8px;height:8px;border-radius:50%;background:var(--legend-color);display:inline-block}
.chart-empty{display:grid;place-items:center;min-height:180px;border:1px dashed var(--line);border-radius:8px;color:var(--muted);text-align:center;padding:20px}
.chart-note{margin-top:9px;color:var(--muted);font-size:11px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:760px){.chart-grid{grid-template-columns:1fr}.chart-panel{padding:13px}.chart-panel figcaption{display:block}.chart-legend{justify-content:flex-start;margin-top:8px}.chart-container{height:220px}}
`.trim();

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function chartId(value: string): string {
    const id = String(value || "chart").replace(/[^a-z0-9_-]/gi, "-").replace(/^-+|-+$/g, "");
    return id || "chart";
}

function finiteValue(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function safeJson(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

function hasData(config: MetricsChartConfig): boolean {
    return config.labels.length > 0 && config.datasets.some(dataset => dataset.data.some(value => finiteValue(value) > 0));
}

function chartDescription(config: MetricsChartConfig): string {
    const series = config.datasets.map(dataset => dataset.label).join(", ");
    const range = config.labels.length > 1
        ? `${config.labels[0]} through ${config.labels[config.labels.length - 1]}`
        : config.labels[0] || "the selected period";
    return `${config.description} Series: ${series || "none"}. Range: ${range}.`;
}

export function renderMetricsChart(config: MetricsChartConfig): string {
    const id = chartId(config.id);
    const normalized: MetricsChartConfig = {
        ...config,
        id,
        labels: config.labels.map(label => String(label)),
        datasets: config.datasets.map(dataset => ({
            ...dataset,
            data: dataset.data.map(finiteValue)
        }))
    };
    const description = chartDescription(normalized);
    const legend = normalized.datasets.map(dataset => `<span><i style="--legend-color:var(--${dataset.color})"></i>${escapeHtml(dataset.label)}</span>`).join("");
    if (!hasData(normalized)) {
        return `<figure class="chart-panel"><figcaption><div><h3>${escapeHtml(normalized.title)}</h3><p>${escapeHtml(normalized.description)}</p></div></figcaption><div class="chart-empty">${escapeHtml(normalized.emptyMessage || "No data has been recorded for this view yet.")}</div><p class="chart-note">The graph will fill in automatically as the bot writes telemetry.</p></figure>`;
    }
    return `<figure class="chart-panel"><figcaption><div><h3>${escapeHtml(normalized.title)}</h3><p>${escapeHtml(normalized.description)}</p></div><div class="chart-legend">${legend}</div></figcaption><div class="chart-container"><canvas id="${escapeHtml(id)}" role="img" aria-label="${escapeHtml(normalized.title)}: ${escapeHtml(description)}"><span>${escapeHtml(description)}</span></canvas></div><p class="chart-note sr-only">${escapeHtml(description)}</p><script type="application/json" class="metrics-chart-data" id="${escapeHtml(id)}-data">${safeJson(normalized)}</script></figure>`;
}

export function renderMetricsChartClient(): string {
    return `<script src="/metrics/chart.js" defer></script><script>
(() => {
    const start = () => {
        if (!window.Chart) return;
        const styles = getComputedStyle(document.documentElement);
        const color = (name) => styles.getPropertyValue('--' + name).trim();
        document.querySelectorAll('script.metrics-chart-data').forEach((node) => {
            let config;
            try { config = JSON.parse(node.textContent || '{}'); } catch (_) { return; }
            const canvas = document.getElementById(config.id);
            if (!canvas || !config.labels || !config.datasets) return;
            const datasets = config.datasets.map((dataset) => {
                const chartColor = color(dataset.color) || color('blue');
                return {
                    label: dataset.label,
                    data: dataset.data,
                    borderColor: chartColor,
                    backgroundColor: chartColor,
                    pointBackgroundColor: chartColor,
                    pointBorderColor: color('panel') || chartColor,
                    borderWidth: config.type === 'bar' ? 0 : 2,
                    pointRadius: config.type === 'bar' ? 0 : 2,
                    pointHoverRadius: config.type === 'bar' ? 0 : 4,
                    fill: false,
                    borderRadius: config.type === 'bar' ? 5 : 0,
                    borderSkipped: false
                };
            });
            const axisColor = color('muted') || '#94a8c2';
            const gridColor = color('line') || '#263a55';
            new window.Chart(canvas, {
                type: config.type,
                data: { labels: config.labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    normalized: true,
                    interaction: { mode: 'index', intersect: false },
                    scales: config.type === 'bar' ? {
                        x: { stacked: Boolean(config.stacked), ticks: { color: axisColor, autoSkip: true, maxRotation: 0, maxTicksLimit: 8 }, grid: { color: gridColor } },
                        y: { beginAtZero: true, stacked: Boolean(config.stacked), ticks: { color: axisColor, precision: 0 }, grid: { color: gridColor } }
                    } : {
                        x: { ticks: { color: axisColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: gridColor } },
                        y: { beginAtZero: true, ticks: { color: axisColor, precision: 0 }, grid: { color: gridColor } }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: (item) => item.dataset.label + ': ' + Number(item.raw || 0).toLocaleString('en-US') + (config.valueSuffix || '')
                            }
                        }
                    }
                }
            });
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
</script>`;
}
