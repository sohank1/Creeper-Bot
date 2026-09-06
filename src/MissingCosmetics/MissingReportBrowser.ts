import { Client, MessageActionRow, MessageAttachment, MessageButton, MessageEmbed, MessageSelectMenu } from "discord.js";
import { todayUTC, validReportDate, validMinimumDays, reportDescription } from "./MissingReport";
import { MissingHistoryService } from "./MissingHistory";
import { renderMissingCosmeticsImage } from "./MissingCosmeticsImage";
import { performance } from "perf_hooks";
import { MissingTelemetry, MissingTiming, timingLabel } from "./MissingTelemetry";

export interface AvailableReportDay { date: string; count: number }

export function reportControls(owner: string, date: string, picker = false, available: AvailableReportDay[] = [], minimum = 300): MessageActionRow[] {
    const id = (action: string) => `missing-report:${owner}:${date}:${action}:${minimum}`;
    const button = (action: string, label: string, disabled = false) => new MessageButton()
        .setCustomId(id(action)).setLabel(label).setStyle("SECONDARY").setDisabled(disabled);
    const rows: MessageActionRow[] = [];
    if (picker && available.length) {
        const [year, month] = date.split("-").map(Number);
        const select = (action: string, placeholder: string, options: { label: string; value: string; default?: boolean }[]) =>
            new MessageActionRow().addComponents(new MessageSelectMenu().setCustomId(id(action)).setPlaceholder(placeholder).addOptions(options));
        const years = [...new Set(available.map(day => day.date.slice(0, 4)))].sort();
        const yearRow = select("year", "📆 Year (UTC)", years.slice(-25).map(value => ({ label: value, value, default: Number(value) === year })));
        const months = [...new Set(available.filter(day => Number(day.date.slice(0, 4)) === year).map(day => Number(day.date.slice(5, 7))))].sort((a, b) => a - b);
        const monthRow = select("month", "🗓️ Month (UTC)", months.map(value => ({
            label: new Date(Date.UTC(year, value - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" }), value: String(value), default: value === month,
        })));
        const days = available.filter(day => day.date.slice(0, 7) === date.slice(0, 7)).sort((a, b) => a.date.localeCompare(b.date)).map(day => ({
            label: `${new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })} (${day.count} ${day.count === 1 ? "item" : "items"})`, value: String(Number(day.date.slice(8))),
        }));
        rows.push(select("day", "📅 Choose date", days.slice(0, 25)));
        if (days.length > 25) rows.push(select("day-late", "More returning-items days", days.slice(25)));
        rows.push(monthRow, yearRow);
    }
    rows.push(new MessageActionRow().addComponents(
        button("prev", "←", !available.some(day => day.date < date)),
        button(picker ? "report" : "picker", picker ? "View report" : "Choose date").setStyle("PRIMARY").setEmoji(picker ? "🖼️" : "📅"),
        button("next", "→", !available.some(day => day.date > date)),
        button("filter", `${minimum}+ days`).setStyle("SUCCESS").setEmoji("🔎"),
    ));
    return rows;
}

export function resolveReportDate(date: string, available: AvailableReportDay[], today = todayUTC()) {
    return date === today && !available.some(day => day.date === date)
        ? available.filter(day => day.date < date).sort((a, b) => b.date.localeCompare(a.date))[0]?.date || date : date;
}

export function registerMissingReportBrowser(client: Client) {
    const busy = new Set<string>();
    const histories = new MissingHistoryService();
    const telemetry = new MissingTelemetry();
    client.on("interactionCreate", async interaction => {
        const command = interaction.isCommand() && interaction.commandName === "fortnite"
            && interaction.options.getSubcommandGroup(false) === "cosmetic" && interaction.options.getSubcommand(false) === "missing";
        const component = (interaction.isButton() || interaction.isSelectMenu()) && interaction.customId.startsWith("missing-report:");
        if (!command && !component) return;
        if (!interaction.isCommand() && !interaction.isButton() && !interaction.isSelectMenu()) return;
        let date = todayUTC();
        let action = "report";
        let minimum = 300;
        if (interaction.isCommand()) { date = interaction.options.getString("date") || date; minimum = interaction.options.getInteger("days") ?? 300; }
        else {
            const [, owner, selected, operation, threshold] = interaction.customId.split(":");
            if (owner !== interaction.user.id) { await interaction.reply({ content: "Open your own report with /fortnite cosmetic missing.", ephemeral: true }); return; }
            date = selected; action = operation;
            minimum = threshold === undefined ? 300 : Number(threshold);
        }
        if (interaction.isSelectMenu() && action === "threshold") minimum = Number(interaction.values[0]);
        if (!validMinimumDays(minimum)) { await interaction.reply({ content: "Minimum days must be a whole number from 1 to 100,000.", ephemeral: true }); return; }
        if (!validReportDate(date)) { await interaction.reply({ content: "Use a valid date in YYYY-MM-DD format, from 2017 through today (UTC).", ephemeral: true }); return; }
        if (busy.has(interaction.user.id)) { await interaction.reply({ content: "Your report is still loading. Please try again in a moment.", ephemeral: true }); return; }
        busy.add(interaction.user.id);
        const started = performance.now();
        const timing: MissingTiming = { action, date, minimum, historyMs: 0, indexMs: 0, calculationMs: 0, renderMs: 0, deliveryMs: 0, cleanupMs: 0, totalMs: 0, cached: false, items: 0, imageBytes: 0, outcome: "success" };
        const deliver = async (payload: any) => {
            const start = performance.now();
            try { return await interaction.editReply(payload); }
            finally { timing.deliveryMs += performance.now() - start; }
        };
        try {
            if (interaction.isCommand()) await interaction.deferReply({ ephemeral: false });
            else await interaction.deferUpdate();
            if (action === "filter") {
                const presets = [...new Set([30, 90, 180, 300, 365, 730, 1000, minimum])].sort((a, b) => a - b);
                const select = new MessageSelectMenu().setCustomId(`missing-report:${interaction.user.id}:${date}:threshold:${minimum}`)
                    .setPlaceholder("Minimum days away").addOptions(presets.map(value => ({ label: `${value}+ days${value === 300 ? " (default)" : ""}`, value: String(value), default: value === minimum })));
                await deliver({ content: `Choose a minimum number of days away, or enter any whole number (1–100,000) with:\n\`/fortnite cosmetic missing date:${date} days:${minimum}\``, embeds: [], attachments: [],
                    components: [new MessageActionRow().addComponents(select), new MessageActionRow().addComponents(
                        new MessageButton().setCustomId(`missing-report:${interaction.user.id}:${date}:report:${minimum}`).setLabel("View report").setEmoji("🖼️").setStyle("PRIMARY"),
                    )] });
                return;
            }
            const loaded = await histories.measured();
            timing.historyMs = loaded.loadMs; timing.indexMs = loaded.buildMs; timing.cached = loaded.cached;
            const history = loaded.index;
            const mathStart = performance.now();
            const available = history.available(minimum);
            timing.calculationMs = performance.now() - mathStart;
            const metrics = () => `Math ${(loaded.buildMs + performance.now() - mathStart).toFixed(1)} ms · History ${loaded.loadMs.toFixed(0)} ms (${loaded.cached ? "cached" : "load + index"})`;
            if (action === "prev" || action === "next") {
                const days = [...available];
                const adjacent = action === "prev" ? days.find(day => day.date < date) : days.reverse().find(day => day.date > date);
                if (!adjacent) {
                    await interaction.followUp({ content: `No ${action === "prev" ? "earlier" : "later"} day with qualifying returns was found in the API histories.`, ephemeral: true });
                    return;
                }
                date = adjacent.date;
            }
            if (action === "today") date = todayUTC();
            if (interaction.isSelectMenu() && action !== "threshold") {
                const number = Number(interaction.values[0]);
                let [year, month, day] = date.split("-").map(Number);
                if (action === "year") year = number;
                else if (action === "month") month = number;
                else day = number;
                day = Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate());
                date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                if (date > todayUTC()) date = todayUTC();
            }
            if (!validReportDate(date)) throw new Error("Invalid report date");
            if (["picker", "year", "month"].includes(action)) {
                if (available.length && !available.some(day => day.date === date)) {
                    date = (available.find(day => day.date.slice(0, 7) === date.slice(0, 7))
                        || available.find(day => day.date.slice(0, 4) === date.slice(0, 4)) || available[0]).date;
                }
                timing.calculationMs = performance.now() - mathStart;
                timing.date = date;
                await deliver({ content: available.length
                    ? `📅 **Return dates · ${minimum}+ days away**\nOnly dates with matching returns are listed. Choose a date below, or change the month/year.\n-# ${metrics()}`
                    : `No days with ${minimum}+ day returns were found in the available item histories.`, embeds: [], attachments: [], components: reportControls(interaction.user.id, date, true, available, minimum) });
                return;
            }
            const requestedDate = date;
            date = resolveReportDate(date, available);
            const report = history.report(date, minimum);
            const calculationMetrics = metrics();
            timing.calculationMs = performance.now() - mathStart;
            timing.date = date;
            const items = report.items;
            timing.items = items.length;
            const embed = new MessageEmbed().setColor("#2186DB").setTitle(`Back from the vault · ${date}`)
                .setDescription(items.length ? `**${items.length} ${items.length === 1 ? "item" : "items"} returned after ${minimum}+ days away**\n${requestedDate !== date ? `No matching returns today; showing the closest earlier date: **${date}**.\n` : ""}Full report in the image below.` : `No ${minimum}+ day returns were found on ${date}. Choose another date or lower the days filter.`)
                .setFooter({ text: `UTC · API history coverage${date !== todayUTC() ? " · Current artwork · * Current known price, not historical" : ""}` });
            let render: Awaited<ReturnType<typeof renderMissingCosmeticsImage>>;
            try {
                if (items.length) {
                    try {
                        const renderStarted = performance.now();
                        try {
                        render = await renderMissingCosmeticsImage(items, date, "item-shop", minimum);
                        timing.imageBytes = render.image.length;
                        } finally { timing.renderMs = performance.now() - renderStarted; }
                    } catch (error) { timing.outcome = "image-fallback"; console.error("Missing report image failed:", error); embed.setDescription(reportDescription(items).slice(0, 4096)); embed.addField("Artwork unavailable", "Choose the date again to retry the image."); }
                }
                embed.addField("⚡ Calculation", calculationMetrics);
                await deliver({ content: null, embeds: [embed], attachments: [],
                    files: render ? [new MessageAttachment(render.image, "returning-cosmetics.png")] : [], components: reportControls(interaction.user.id, date, false, available, minimum) });
            } finally {
                const cleanup = performance.now();
                await render?.close().catch(console.error);
                timing.cleanupMs = performance.now() - cleanup;
            }
            timing.totalMs = performance.now() - started;
            embed.fields[embed.fields.length - 1] = { name: "⚡ Performance", value: timingLabel(timing), inline: false };
            // Edit only the embed: retain the standalone attachment, no second upload.
            await deliver({ embeds: [embed] }).catch(error => console.warn("Missing report metrics update failed:", error.message));
        } catch (error) {
            timing.outcome = "failure";
            console.error("Missing report browser failed:", error);
            if (interaction.deferred || interaction.replied) await interaction.editReply({ content: "Couldn't load this report. Please try again shortly.", embeds: [], attachments: [], components: reportControls(interaction.user.id, date, false, [], minimum) }).catch(console.error);
        } finally { timing.totalMs = performance.now() - started; telemetry.record(timing); busy.delete(interaction.user.id); }
    });
}
