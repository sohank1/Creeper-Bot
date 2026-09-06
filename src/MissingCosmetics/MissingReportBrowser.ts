import { Client, MessageActionRow, MessageAttachment, MessageButton, MessageEmbed, MessageSelectMenu } from "discord.js";
import { todayUTC, validReportDate, validMinimumDays, reportDescription } from "./MissingReport";
import { MissingHistoryService } from "./MissingHistory";
import { renderMissingCosmeticsImage } from "./MissingCosmeticsImage";

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
        rows.push(select("year", "Year (UTC)", years.slice(-25).map(value => ({ label: value, value, default: Number(value) === year }))));
        const months = [...new Set(available.filter(day => Number(day.date.slice(0, 4)) === year).map(day => Number(day.date.slice(5, 7))))].sort((a, b) => a - b);
        rows.push(select("month", "Month (UTC)", months.map(value => ({
            label: new Date(Date.UTC(year, value - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" }), value: String(value), default: value === month,
        }))));
        const days = available.filter(day => day.date.slice(0, 7) === date.slice(0, 7)).sort((a, b) => a.date.localeCompare(b.date)).map(day => ({
            label: `${new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })} (${day.count} ${day.count === 1 ? "item" : "items"})`, value: String(Number(day.date.slice(8))),
        }));
        rows.push(select("day", "Choose a returning-items day", days.slice(0, 25)));
        if (days.length > 25) rows.push(select("day-late", "More returning-items days", days.slice(25)));
    }
    rows.push(new MessageActionRow().addComponents(
        button("prev", "Previous return day", date <= "2017-01-01"), button(picker ? "report" : "picker", picker ? "Back to report" : "Choose date"),
        button("next", "Next return day", date >= todayUTC()), button("today", "Today", date === todayUTC() && !picker),
        button("filter", `Filter: ${minimum}+ days`),
    ));
    return rows;
}

export function registerMissingReportBrowser(client: Client) {
    const busy = new Set<string>();
    const histories = new MissingHistoryService();
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
        try {
            if (interaction.isCommand()) await interaction.deferReply({ ephemeral: true });
            else await interaction.deferUpdate();
            if (action === "filter") {
                const presets = [...new Set([30, 90, 180, 300, 365, 730, 1000, minimum])].sort((a, b) => a - b);
                const select = new MessageSelectMenu().setCustomId(`missing-report:${interaction.user.id}:${date}:threshold:${minimum}`)
                    .setPlaceholder("Minimum days away").addOptions(presets.map(value => ({ label: `${value}+ days${value === 300 ? " (default)" : ""}`, value: String(value), default: value === minimum })));
                await interaction.editReply({ content: `Choose a minimum number of days away, or enter any whole number (1–100,000) with:\n\`/fortnite cosmetic missing date:${date} days:${minimum}\``, embeds: [], attachments: [],
                    components: [new MessageActionRow().addComponents(select), ...reportControls(interaction.user.id, date, false, [], minimum)] });
                return;
            }
            const history = await histories.get();
            if (action === "prev" || action === "next") {
                const days = history.available(minimum);
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
                const available = history.available(minimum);
                if (available.length && !available.some(day => day.date === date)) {
                    date = (available.find(day => day.date.slice(0, 7) === date.slice(0, 7))
                        || available.find(day => day.date.slice(0, 4) === date.slice(0, 4)) || available[0]).date;
                }
                await interaction.editReply({ content: available.length
                    ? `Choose a shop date (UTC). Only days with ${minimum}+ day returns are listed. Counts are calculated from available item histories.`
                    : `No days with ${minimum}+ day returns were found in the available item histories.`, embeds: [], attachments: [], components: reportControls(interaction.user.id, date, true, available, minimum) });
                return;
            }
            const report = history.report(date, minimum);
            const items = report.items;
            const embed = new MessageEmbed().setColor("#2186DB").setTitle(`Back from the vault · ${date}`)
                .setDescription(items.length ? reportDescription(items).slice(0, 4096) : `No ${minimum}+ day returns were found on ${date}. Use **Choose date** to browse days with matching returns, or **Filter** to change the minimum days away.`)
                .setFooter({ text: `${items.length} items · UTC · ${minimum}+ days away · API history coverage only${date !== todayUTC() ? " · Current artwork; historical prices unavailable" : ""}` });
            let render: Awaited<ReturnType<typeof renderMissingCosmeticsImage>>;
            try {
                if (items.length) {
                    try {
                        render = await renderMissingCosmeticsImage(items, date, "item-shop");
                        embed.setImage("attachment://returning-cosmetics.png");
                    } catch (error) { console.error("Missing report image failed:", error); embed.addField("Artwork unavailable", "The report is available below; try reopening it to retry the image."); }
                }
                await interaction.editReply({ content: null, embeds: [embed], attachments: [],
                    files: render ? [new MessageAttachment(render.image, "returning-cosmetics.png")] : [], components: reportControls(interaction.user.id, date, false, [], minimum) });
            } finally { await render?.close().catch(console.error); }
        } catch (error) {
            console.error("Missing report browser failed:", error);
            if (interaction.deferred || interaction.replied) await interaction.editReply({ content: "Couldn't load this report. Please try again shortly.", embeds: [], attachments: [], components: reportControls(interaction.user.id, date, false, [], minimum) }).catch(console.error);
        } finally { busy.delete(interaction.user.id); }
    });
}
