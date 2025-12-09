
// // import axios from "axios";
// // import { BaseCommandInteraction, CacheType, Client, EmbedField, MessageActionRow, MessageAttachment, MessageEmbed, MessageSelectMenu, SelectMenuInteraction } from "discord.js";
// // import { version } from "../../index";
// // import { platformChoices } from "../fortniteCommand";
// // import * as cheerio from 'cheerio';
// // import path from "path";
// // import { createCanvas, loadImage, CanvasRenderingContext2D } from "canvas";

// // const loadingStr = "Loading more... <a:loading:1140700893898084382>";

// // export class FortniteStats {
// //     private interaction: BaseCommandInteraction<CacheType>;

// //     constructor(private client: Client) {
// //         this.client.on("interactionCreate", (i) => {
// //             if (!i.isCommand()) return
// //             if (i.commandName !== "fortnite") return
// //             if (!i.options.get('username')) return

// //             this.interaction = i;
// //             return void this.getStats()
// //         })

// //         this.client.on("interactionCreate", async (i) => {
// //             if (i.isSelectMenu() && i.user.id === i.customId.split(":")[3] && i.customId.startsWith("platform-select")) return this.handlePlatformSelect(i)
// //         })
// //     }

// //     private async getStats(): Promise<void> {
// //         const username = <string>this.interaction.options.get('username').value
// //         const platform = <string>this.interaction.options.get('platform')?.value || "epic"

// //         try {
// //             if (!this.interaction.replied) {
// //                 await this.interaction.reply({ content: loadingStr });
// //             }

// //             const r = await axios.get(`https://fortnite-api.com/v2/stats/br/v2?image=all&accountType=${platform}&name=${username}`, {
// //                 headers: {
// //                     'content-type': "application/json",
// //                     'Authorization': process.env.FORTNITE_API_KEY
// //                 }
// //             });

// //             // Change: Pass full data object
// //             const attachment = await this.generateProgressAttachment(r.data.data);

// //             const e = new MessageEmbed({ footer: { text: version } })
// //                 .setTitle(`Fortnite stats for ${r.data.data.account.name}` || "No data");

// //             const userId = this.interaction.user.id;
// //             (userId === "481158632008974337" || userId == "539928835953524757") && e.addField("ID", r.data.data.account.id);

// //             // Change: Image now contains all stats, removing individual fields
// //             e.setImage(`attachment://progress.png`)
// //                 .setColor("#2186DB")
// //                 .setTimestamp();

// //             await this.interaction.editReply({ embeds: [e], files: [attachment], content: " " });
// //             this.updateWithRanks(this.interaction, e, r.data.data.account.name);

// //         } catch (e) {
// //             console.log(e.response?.status || e);
// //             const row = new MessageActionRow().addComponents(
// //                 new MessageSelectMenu()
// //                     .setCustomId(`platform-select-username:${username}:authorId:${this.interaction.user.id}`)
// //                     .addOptions(platformChoices.map(opt => {
// //                         return {
// //                             label: opt.name.split(">")[1],
// //                             emoji: opt.name.split(">")[0],
// //                             value: opt.value,
// //                             ...(opt.value === platform && { default: true })
// //                         }
// //                     })),
// //             )

// //             await this.interaction.editReply({
// //                 content: `Error: "${e.response?.data?.error || "Unknown error"}"\n\nDid you specify the correct platform?`,
// //                 components: [row]
// //             });
// //         }
// //     }

// //     private async handlePlatformSelect(i: SelectMenuInteraction<CacheType>): Promise<void> {
// //         const username = i.customId.split(":")[1]
// //         const platform = i.values[0]

// //         i.component.options.splice(i.component.options.findIndex(o => o.default), 1);
// //         i.component.options.splice(i.component.options.findIndex(o => o.value === platform), 1);
// //         i.component.options = i.component.options.map((e) => ({ ...e, default: false }))
// //         i.component.placeholder = "";

// //         try {
// //             await i.update({ content: loadingStr, components: [] });

// //             const r = await axios.get(`https://fortnite-api.com/v2/stats/br/v2?image=all&accountType=${platform}&name=${username}`, {
// //                 headers: { 'content-type': "application/json", 'Authorization': process.env.FORTNITE_API_KEY }
// //             });

// //             // Change: Pass full data object
// //             const attachment = await this.generateProgressAttachment(r.data.data);

// //             const e = new MessageEmbed({ footer: { text: version } })
// //                 .setTitle(`Fortnite stats for ${r.data.data.account.name}`)
// //                 .setImage(`attachment://progress.png`)
// //                 .setColor("#2186DB")
// //                 .setTimestamp();

// //             await i.editReply({ embeds: [e], files: [attachment], content: " " });
// //             this.updateWithRanks(i, e, r.data.data.account.name);

// //         } catch (e) {
// //             await i.editReply({
// //                 content: `Error: "${e.response?.data?.error}"\n\n`,
// //                 components: i.component.options.length === 0 ? [] : [new MessageActionRow().addComponents(new MessageSelectMenu(i.component))]
// //             });
// //         }
// //     }

// //     private async updateWithRanks(i: BaseCommandInteraction<CacheType> | SelectMenuInteraction<CacheType>, e: MessageEmbed, name: string) {
// //         try {
// //             const { data } = await axios.get(`http://api.scraperapi.com/?api_key=${process.env.SCRAPER_API_KEY}&render=true&url=https://fortnitetracker.com/profile/all/${name.replace(" ", "%20")}/competitive`);
// //             const $ = cheerio.load(data)
// //             const modes: EmbedField[] = []

// //             $(".profile-ranks__container").each(function (i, el) {
// //                 modes.push({
// //                     name: `Ranked - ${$(this).children(".profile-ranks__title").eq(0).text()}`,
// //                     value: `${$(this).find(".profile-rank__name").eq(0).text()} - ${$(this).find(".profile-rank-progress").eq(0).text() || $(this).find(".profile-rank__rank--top").eq(0).text()}`,
// //                     inline: false,
// //                 })
// //             })

// //             e.addFields(modes);
// //             await i.editReply({ embeds: [e] })
// //         } catch (err) {
// //             console.log("Failed to fetch rank", err)
// //         }
// //     }

// //     private calcDailyLevelsPerGoal(currentLevel: number): { perDay: number[], perWeek: number[], daysLeft: number, weeksLeft: number } {
// //         const goals = [150, 200];
// //         const seasonEndDate = new Date("2026-03-03");

// //         const now = new Date();
// //         const timeDiff = seasonEndDate.getTime() - now.getTime();
// //         const daysLeft = Math.max(1, Math.round(timeDiff / (1000 * 3600 * 24)) - 1);

// //         const perDay = goals.map(goal => {
// //             if (currentLevel >= goal) return 0;
// //             return (goal - currentLevel) / daysLeft;
// //         })

// //         const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
// //         const perWeek = goals.map(goal => {
// //             if (currentLevel >= goal) return 0;
// //             return (goal - currentLevel) / weeksLeft;
// //         })

// //         return { perDay, perWeek, daysLeft, weeksLeft };
// //     }

// //     private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
// //         if (width < 2 * radius) radius = width / 2;
// //         if (height < 2 * radius) radius = height / 2;
// //         ctx.beginPath();
// //         ctx.moveTo(x + radius, y);
// //         ctx.arcTo(x + width, y, x + width, y + height, radius);
// //         ctx.arcTo(x + width, y + height, x, y + height, radius);
// //         ctx.arcTo(x, y + height, x, y, radius);
// //         ctx.arcTo(x, y, x + width, y, radius);
// //         ctx.closePath();
// //     }

// //     // --- UPDATED GENERATOR: Uses your exact style but with full stats ---
// //     private async generateProgressAttachment(data: any): Promise<MessageAttachment> {
// //         // Extract Data
// //         const bp = data.battlePass;
// //         const currentLevel = bp.level + (bp.progress / 100);
// //         const stats = data.stats.all;
// //         const overall = stats.overall;
// //         const accountName = data.account.name;

// //         // Change: Increased height to fit new stats, width stays same
// //         const width = 700;
// //         const height = 640;
// //         const canvas = createCanvas(width, height);
// //         const ctx = canvas.getContext("2d");

// //         // Layout Constants
// //         const contentX = 135;
// //         const rightPadding = 40;
// //         const leftPadding = 40;

// //         // --- 1. Background ---
// //         ctx.fillStyle = "#18191c";
// //         ctx.fillRect(0, 0, width, height);

// //         // --- 2. Load and Draw Icon ---
// //         const imagePath = path.join("assets", "battle-pass.png");
// //         try {
// //             const icon = await loadImage(imagePath);
// //             ctx.drawImage(icon, 25, 25, 85, 85);
// //         } catch (error) {
// //             console.error("Could not load battle-pass.png", error);
// //             ctx.fillStyle = "#2f3136";
// //             ctx.beginPath(); ctx.arc(67, 67, 42, 0, Math.PI * 2); ctx.fill();
// //         }

// //         // --- 3. Calculate Data ---
// //         // Change: 130+ Goal Logic
// //         const goal = currentLevel >= 130 ? 200 : 150;
// //         const percent = Math.min(currentLevel / goal, 1);
// //         const levelStats = this.calcDailyLevelsPerGoal(currentLevel);

// //         // --- 4. Header Text ---
// //         ctx.textBaseline = "bottom";

// //         // Change: Added Username
// //         ctx.fillStyle = "#ffffff";
// //         ctx.font = "bold 26px Sans";
// //         ctx.fillText(accountName.toUpperCase(), contentX, 45);

// //         // "LEVEL" Label
// //         ctx.fillStyle = "#b9bbbe";
// //         ctx.font = "bold 20px Sans";
// //         ctx.fillText("LEVEL", contentX, 75);

// //         // Level Number
// //         ctx.fillStyle = "#ffffff";
// //         ctx.font = "bold 45px Sans";
// //         ctx.fillText(`${Math.floor(currentLevel)}`, contentX + 70, 78);

// //         // Goal Text
// //         ctx.textAlign = "right";
// //         ctx.fillStyle = "#b9bbbe";
// //         ctx.font = "20px Sans";
// //         ctx.fillText(`GOAL ${goal}`, width - rightPadding, 75);

// //         // --- 5. The Progress Bar ---
// //         const barX = contentX;
// //         const barY = 95;
// //         const barWidth = width - contentX - rightPadding;
// //         const barHeight = 25;
// //         const radius = 12.5;

// //         // Empty Track
// //         ctx.fillStyle = "#2f3136";
// //         this.roundRect(ctx, barX, barY, barWidth, barHeight, radius);
// //         ctx.fill();

// //         // Filled Gradient Track
// //         if (percent > 0) {
// //             const fillWidth = Math.max(barWidth * percent, radius * 2);
// //             const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
// //             gradient.addColorStop(0, "#43B581");
// //             gradient.addColorStop(1, "#00A8FC");

// //             ctx.fillStyle = gradient;
// //             ctx.shadowColor = "rgba(67, 181, 129, 0.4)";
// //             ctx.shadowBlur = 15;
// //             this.roundRect(ctx, barX, barY, Math.min(fillWidth, barWidth), barHeight, radius);
// //             ctx.fill();
// //             ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
// //         }

// //         // --- 6. BP Stats Grid (Row 1) ---
// //         let statBoxY = 155;
// //         ctx.textAlign = "left";
// //         ctx.textBaseline = "top";

// //         // Separator 1 (Adjusted to start at contentX like before)
// //         ctx.strokeStyle = "#2f3136";
// //         ctx.lineWidth = 2;
// //         ctx.beginPath();
// //         ctx.moveTo(contentX, 140);
// //         ctx.lineTo(width - rightPadding, 140);
// //         ctx.stroke();

// //         const drawStat = (label: string, value: string, x: number, y: number, color: string = "#ffffff") => {
// //             ctx.fillStyle = "#72767d";
// //             ctx.font = "bold 13px Sans";
// //             ctx.fillText(label.toUpperCase(), x, y);
// //             ctx.fillStyle = color;
// //             ctx.font = "bold 24px Sans";
// //             ctx.fillText(value, x, y + 25);
// //         };

// //         drawStat("Levels Left", `${Math.max(0, goal - currentLevel).toFixed(2)}`, contentX, statBoxY);
// //         drawStat("Days Left", `${levelStats.daysLeft}`, contentX + 130, statBoxY);

// //         const targetIndex = goal === 150 ? 0 : 1;
// //         const val = levelStats.perDay[targetIndex]?.toFixed(1) || "0";
// //         const difficultyColor = parseFloat(val) > 2.5 ? "#ED4245" : (parseFloat(val) > 1.5 ? "#FEE75C" : "#43B581");

// //         drawStat(`Levels/Day`, val, contentX + 260, statBoxY, difficultyColor);
// //         drawStat(`Levels/Week`, levelStats.perWeek[targetIndex]?.toFixed(1) || "0", contentX + 410, statBoxY);


// //         // ==========================================
// //         //         PART 2: LIFETIME STATS
// //         // ==========================================

// //         statBoxY += 85; // Gap for next section

// //         // Header
// //         ctx.fillStyle = "#b9bbbe"; ctx.font = "bold 16px Sans";
// //         ctx.fillText("LIFETIME STATS", leftPadding, statBoxY);

// //         // Separator 2
// //         ctx.beginPath();
// //         ctx.moveTo(leftPadding, statBoxY + 25);
// //         ctx.lineTo(width - rightPadding, statBoxY + 25);
// //         ctx.stroke();

// //         statBoxY += 45; // Move down for data

// //         const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
// //         const colWidth = (width - 80) / 3;
// //         const rowHeight = 70;

// //         // Row 1
// //         drawStat("Wins", fmt(overall.wins), leftPadding, statBoxY, "#43B581");
// //         drawStat("K/D Ratio", String(overall.kd), leftPadding + colWidth, statBoxY);
// //         drawStat("Win Rate", `${overall.winRate}%`, leftPadding + (colWidth * 2), statBoxY);

// //         statBoxY += rowHeight;

// //         // Row 2
// //         drawStat("Kills", fmt(overall.kills), leftPadding, statBoxY);
// //         drawStat("Matches", fmt(overall.matches), leftPadding + colWidth, statBoxY);
// //         drawStat("Days Played", (overall.minutesPlayed / 1440).toFixed(1), leftPadding + (colWidth * 2), statBoxY);


// //         // ==========================================
// //         //         PART 3: MODE BREAKDOWN
// //         // ==========================================

// //         statBoxY += 85; // Gap

// //         // Header
// //         ctx.fillStyle = "#b9bbbe"; ctx.font = "bold 16px Sans";
// //         ctx.fillText("MODE BREAKDOWN", leftPadding, statBoxY);

// //         // Separator 3
// //         ctx.beginPath();
// //         ctx.moveTo(leftPadding, statBoxY + 25);
// //         ctx.lineTo(width - rightPadding, statBoxY + 25);
// //         ctx.stroke();

// //         statBoxY += 45;

// //         // Modes
// //         const modes = [
// //             { l: "Solo Wins", v: stats.solo?.wins || 0 },
// //             { l: "Duo Wins", v: stats.duo?.wins || 0 },
// //             { l: "Squad Wins", v: stats.squad?.wins || 0 },
// //             { l: "LTM Wins", v: stats.ltm?.wins || 0 }
// //         ];

// //         const modeColWidth = (width - 80) / 4;

// //         modes.forEach((m, i) => {
// //             const x = leftPadding + (i * modeColWidth);
// //             drawStat(m.l, fmt(m.v), x, statBoxY);
// //         });

// //         // ==========================================
// //         //         FOOTER
// //         // ==========================================
// //         const lastUpdate = new Date(overall.lastModified).toLocaleString("en-US", { timeZone: "America/New_York" });
// //         ctx.fillStyle = "#4f545c"; ctx.font = "12px Sans"; ctx.textAlign = "center";
// //         ctx.fillText(`Last Update: ${lastUpdate}`, width / 2, height - 15);

// //         const buffer = canvas.toBuffer("image/png");
// //         return new MessageAttachment(buffer, "progress.png");
// //     }
// // }


// import axios from "axios";
// import { BaseCommandInteraction, CacheType, Client, EmbedField, MessageActionRow, MessageAttachment, MessageEmbed, MessageSelectMenu, SelectMenuInteraction } from "discord.js";
// import { version } from "../../index";
// import { platformChoices } from "../fortniteCommand";
// import * as cheerio from 'cheerio';
// import path from "path";
// import { createCanvas, loadImage, CanvasRenderingContext2D } from "canvas";

// const loadingStr = "Loading more... <a:loading:1140700893898084382>";

// export class FortniteStats {
//     private interaction: BaseCommandInteraction<CacheType>;

//     constructor(private client: Client) {
//         this.client.on("interactionCreate", (i) => {
//             if (!i.isCommand()) return
//             if (i.commandName !== "fortnite") return
//             if (!i.options.get('username')) return

//             this.interaction = i;
//             return void this.getStats()
//         })

//         this.client.on("interactionCreate", async (i) => {
//             if (i.isSelectMenu() && i.user.id === i.customId.split(":")[3] && i.customId.startsWith("platform-select")) return this.handlePlatformSelect(i)
//         })
//     }

//     private async getStats(): Promise<void> {
//         const username = <string>this.interaction.options.get('username').value
//         const platform = <string>this.interaction.options.get('platform')?.value || "epic"

//         try {
//             if (!this.interaction.replied) {
//                 await this.interaction.reply({ content: loadingStr });
//             }

//             const r = await axios.get(`https://fortnite-api.com/v2/stats/br/v2?image=all&accountType=${platform}&name=${username}`, {
//                 headers: {
//                     'content-type': "application/json",
//                     'Authorization': process.env.FORTNITE_API_KEY
//                 }
//             });

//             // Pass full data object to allow future expansion if needed, though mostly using level data here
//             const attachment = await this.generateProgressAttachment(r.data.data.battlePass.level + (r.data.data.battlePass.progress / 100));

//             const e = new MessageEmbed({ footer: { text: version } })
//                 .setTitle(`Fortnite stats for ${r.data.data.account.name}` || "No data");

//             const userId = this.interaction.user.id;
//             (userId === "481158632008974337" || userId == "539928835953524757") && e.addField("ID", r.data.data.account.id);

//             e.addField("Battle Pass Level", `${r.data.data.battlePass.level}.${r.data.data.battlePass.progress}` || "No data")
//                 .setImage(`attachment://progress.png`)
//                 .addField("Wins", String(r.data.data.stats.all.overall.wins) || "No data", true)
//                 .addField("KD", String(r.data.data.stats.all.overall.kd) || "No data", true)
//                 .addField("Win Rate", String(r.data.data.stats.all.overall.winRate + "%") || "No data", true)
//                 .addField("Matches", String(r.data.data.stats.all.overall.matches) || "No data", true)
//                 .addField("Kills", String(r.data.data.stats.all.overall.kills) || "No data", true)
//                 .addField("Days Played", String((r.data.data.stats.all.overall.minutesPlayed / 1440).toFixed(1)) || "No data", true)
//                 .addField("Last Update", new Date(r.data.data.stats.all.overall.lastModified).toLocaleString("en-US", { timeZone: "America/New_York" }) || "No data")
//                 .setColor("#2186DB")
//                 .setTimestamp();

//             await this.interaction.editReply({ embeds: [e], files: [attachment], content: " " });
//             this.updateWithRanks(this.interaction, e, r.data.data.account.name);

//         } catch (e) {
//             console.log(e.response?.status || e);
//             const row = new MessageActionRow().addComponents(
//                 new MessageSelectMenu()
//                     .setCustomId(`platform-select-username:${username}:authorId:${this.interaction.user.id}`)
//                     .addOptions(platformChoices.map(opt => {
//                         return {
//                             label: opt.name.split(">")[1],
//                             emoji: opt.name.split(">")[0],
//                             value: opt.value,
//                             ...(opt.value === platform && { default: true })
//                         }
//                     })),
//             )

//             await this.interaction.editReply({
//                 content: `Error: "${e.response?.data?.error || "Unknown error"}"\n\nDid you specify the correct platform?`,
//                 components: [row]
//             });
//         }
//     }

//     private async handlePlatformSelect(i: SelectMenuInteraction<CacheType>): Promise<void> {
//         const username = i.customId.split(":")[1]
//         const platform = i.values[0]

//         i.component.options.splice(i.component.options.findIndex(o => o.default), 1);
//         i.component.options.splice(i.component.options.findIndex(o => o.value === platform), 1);
//         i.component.options = i.component.options.map((e) => ({ ...e, default: false }))
//         i.component.placeholder = "";

//         try {
//             await i.update({ content: loadingStr, components: [] });

//             const r = await axios.get(`https://fortnite-api.com/v2/stats/br/v2?image=all&accountType=${platform}&name=${username}`, {
//                 headers: { 'content-type': "application/json", 'Authorization': process.env.FORTNITE_API_KEY }
//             });

//             const attachment = await this.generateProgressAttachment(r.data.data.battlePass.level + (r.data.data.battlePass.progress / 100));

//             const e = new MessageEmbed({ footer: { text: version } })
//                 .setTitle(`Fortnite stats for ${r.data.data.account.name}`)
//                 .addField("Battle Pass Level", `${r.data.data.battlePass.level}.${r.data.data.battlePass.progress}`)
//                 .setImage(`attachment://progress.png`)
//                 .addField("Wins", String(r.data.data.stats.all.overall.wins), true)
//                 .addField("KD", String(r.data.data.stats.all.overall.kd), true)
//                 .addField("Win Rate", String(r.data.data.stats.all.overall.winRate + "%"), true)
//                 .setColor("#2186DB")
//                 .setTimestamp();

//             await i.editReply({ embeds: [e], files: [attachment], content: " " });
//             this.updateWithRanks(i, e, r.data.data.account.name);

//         } catch (e) {
//             await i.editReply({
//                 content: `Error: "${e.response?.data?.error}"\n\n`,
//                 components: i.component.options.length === 0 ? [] : [new MessageActionRow().addComponents(new MessageSelectMenu(i.component))]
//             });
//         }
//     }

//     private async updateWithRanks(i: BaseCommandInteraction<CacheType> | SelectMenuInteraction<CacheType>, e: MessageEmbed, name: string) {
//         try {
//             const { data } = await axios.get(`http://api.scraperapi.com/?api_key=${process.env.SCRAPER_API_KEY}&render=true&url=https://fortnitetracker.com/profile/all/${name.replace(" ", "%20")}/competitive`);
//             const $ = cheerio.load(data)
//             const modes: EmbedField[] = []

//             $(".profile-ranks__container").each(function (i, el) {
//                 modes.push({
//                     name: `Ranked - ${$(this).children(".profile-ranks__title").eq(0).text()}`,
//                     value: `${$(this).find(".profile-rank__name").eq(0).text()} - ${$(this).find(".profile-rank-progress").eq(0).text() || $(this).find(".profile-rank__rank--top").eq(0).text()}`,
//                     inline: false,
//                 })
//             })

//             const winsIndex = e.fields.findIndex(f => f.name.includes("Wins"));
//             if (winsIndex !== -1) {
//                 e.fields.splice(winsIndex, 0, ...modes);
//             } else {
//                 e.addFields(modes);
//             }

//             await i.editReply({ embeds: [e] })
//         } catch (err) {
//             console.log("Failed to fetch rank", err)
//         }
//     }

//     private calcDailyLevelsPerGoal(currentLevel: number): { perDay: number[], perWeek: number[], daysLeft: number, weeksLeft: number } {
//         const goals = [150, 200];
//         const seasonEndDate = new Date("2026-03-03");

//         const now = new Date();
//         const timeDiff = seasonEndDate.getTime() - now.getTime();
//         const daysLeft = Math.max(1, Math.round(timeDiff / (1000 * 3600 * 24)) - 1);

//         const perDay = goals.map(goal => {
//             if (currentLevel >= goal) return 0;
//             return (goal - currentLevel) / daysLeft;
//         })

//         const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
//         const perWeek = goals.map(goal => {
//             if (currentLevel >= goal) return 0;
//             return (goal - currentLevel) / weeksLeft;
//         })

//         console.log({ perDay, perWeek, daysLeft, weeksLeft });
//         return { perDay, perWeek, daysLeft, weeksLeft };
//     }

//     private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
//         if (width < 2 * radius) radius = width / 2;
//         if (height < 2 * radius) radius = height / 2;
//         ctx.beginPath();
//         ctx.moveTo(x + radius, y);
//         ctx.arcTo(x + width, y, x + width, y + height, radius);
//         ctx.arcTo(x + width, y + height, x, y + height, radius);
//         ctx.arcTo(x, y + height, x, y, radius);
//         ctx.arcTo(x, y, x + width, y, radius);
//         ctx.closePath();
//     }

//     private async generateProgressAttachment(currentLevel: number): Promise<MessageAttachment> {
//         const width = 700;
//         const height = 220;
//         const canvas = createCanvas(width, height);
//         const ctx = canvas.getContext("2d");

//         // --- Layout Constants ---
//         const contentX = 135;
//         const rightPadding = 40;

//         // --- 1. Background ---
//         ctx.fillStyle = "#18191c";
//         ctx.fillRect(0, 0, width, height);

//         // --- 2. Load and Draw Icon ---
//         const imagePath = path.join("assets", "battle-pass.png");

//         try {
//             const icon = await loadImage(imagePath);
//             ctx.drawImage(icon, 25, 25, 85, 85);
//         } catch (error) {
//             console.error("Could not load battle-pass.png", error);
//             ctx.fillStyle = "#2f3136";
//             ctx.beginPath();
//             ctx.arc(67, 67, 42, 0, Math.PI * 2);
//             ctx.fill();
//         }

//         // --- 3. Calculate Data ---
//         // Change: 130+ Goal Logic
//         const goal = currentLevel >= 130 ? 200 : 150;

//         const percent = Math.min(currentLevel / goal, 1);
//         const stats = this.calcDailyLevelsPerGoal(currentLevel);

//         // --- 4. Header Text ---
//         ctx.textBaseline = "bottom";

//         // "LEVEL" Label
//         ctx.fillStyle = "#b9bbbe";
//         ctx.font = "bold 20px Sans";
//         ctx.textAlign = "left";
//         ctx.fillText("LEVEL", contentX, 55);

//         // Level Number
//         ctx.fillStyle = "#ffffff";
//         ctx.font = "bold 45px Sans";
//         ctx.fillText(`${Math.floor(currentLevel)}`, contentX + 70, 58);

//         // Goal Text
//         ctx.textAlign = "right";
//         ctx.fillStyle = "#b9bbbe";
//         ctx.font = "20px Sans";
//         ctx.fillText(`GOAL ${goal}`, width - rightPadding, 55);

//         // --- 5. The Progress Bar ---
//         const barX = contentX;
//         const barY = 75;
//         const barWidth = width - contentX - rightPadding;
//         const barHeight = 25;
//         const radius = 12.5;

//         // Empty Track
//         ctx.fillStyle = "#2f3136";
//         this.roundRect(ctx, barX, barY, barWidth, barHeight, radius);
//         ctx.fill();

//         // Filled Gradient Track
//         if (percent > 0) {
//             const fillWidth = Math.max(barWidth * percent, radius * 2);
//             const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
//             gradient.addColorStop(0, "#43B581");
//             gradient.addColorStop(1, "#00A8FC");

//             ctx.fillStyle = gradient;
//             ctx.shadowColor = "rgba(67, 181, 129, 0.4)";
//             ctx.shadowBlur = 15;
//             this.roundRect(ctx, barX, barY, fillWidth, barHeight, radius);
//             ctx.fill();
//             ctx.shadowColor = "transparent";
//             ctx.shadowBlur = 0;
//         }

//         // --- 6. Stats Grid (Bottom Section) ---
//         const statBoxY = 135;
//         ctx.textAlign = "left";
//         ctx.textBaseline = "top";

//         // Separator Line
//         ctx.strokeStyle = "#2f3136";
//         ctx.lineWidth = 2;
//         ctx.beginPath();
//         ctx.moveTo(contentX, 120);
//         ctx.lineTo(width - rightPadding, 120);
//         ctx.stroke();

//         // Helper to draw columns
//         const drawStat = (label: string, value: string, xOffset: number, color: string = "#ffffff") => {
//             const x = contentX + xOffset;
//             ctx.fillStyle = "#72767d";
//             ctx.font = "bold 14px Sans";
//             ctx.fillText(label.toUpperCase(), x, statBoxY);

//             ctx.fillStyle = color;
//             ctx.font = "bold 24px Sans";
//             ctx.fillText(value, x, statBoxY + 25);
//         };

//         drawStat("Levels Left", `${Math.max(0, goal - currentLevel).toFixed(2)}`, 0);
//         drawStat("Days Left", `${stats.daysLeft}`, 130);

//         // Use index 0 (150) or 1 (200) depending on current goal
//         const targetIndex = goal === 150 ? 0 : 1;

//         const val = stats.perDay[targetIndex]?.toFixed(2) || "0";
//         const difficultyColor = parseFloat(val) > 2.5 ? "#ED4245" : (parseFloat(val) > 1.5 ? "#FEE75C" : "#43B581");

//         drawStat(`Levels/Day REQ`, val, 260, difficultyColor);
//         drawStat(`Levels/Week`, stats.perWeek[targetIndex]?.toFixed(2) || "0", 410);

//         const buffer = canvas.toBuffer("image/png");
//         return new MessageAttachment(buffer, "progress.png");
//     }
// }

import axios from "axios";
import { BaseCommandInteraction, CacheType, Client, EmbedField, MessageActionRow, MessageAttachment, MessageEmbed, MessageSelectMenu, SelectMenuInteraction } from "discord.js";
import { version } from "../../index";
import { platformChoices } from "../fortniteCommand";
import * as cheerio from 'cheerio';
import path from "path";
// 1. Import registerFont
import { createCanvas, loadImage, registerFont, CanvasRenderingContext2D } from "canvas";

const loadingStr = "Loading more... <a:loading:1140700893898084382>";

export class FortniteStats {
    private interaction: BaseCommandInteraction<CacheType>;

    constructor(private client: Client) {
        this.client.on("interactionCreate", (i) => {
            if (!i.isCommand()) return
            if (i.commandName !== "fortnite") return
            if (!i.options.get('username')) return

            this.interaction = i;
            return void this.getStats()
        })

        this.client.on("interactionCreate", async (i) => {
            if (i.isSelectMenu() && i.user.id === i.customId.split(":")[3] && i.customId.startsWith("platform-select")) return this.handlePlatformSelect(i)
        })
    }

    private async getStats(): Promise<void> {
        const username = <string>this.interaction.options.get('username').value
        const platform = <string>this.interaction.options.get('platform')?.value || "epic"

        try {
            if (!this.interaction.replied) {
                await this.interaction.reply({ content: loadingStr });
            }

            const r = await axios.get(`https://fortnite-api.com/v2/stats/br/v2?image=all&accountType=${platform}&name=${username}`, {
                headers: {
                    'content-type': "application/json",
                    'Authorization': process.env.FORTNITE_API_KEY
                }
            });

            // 2. Pass data to generator
            const attachment = await this.generateProgressAttachment(r.data.data);

            const e = new MessageEmbed({ footer: { text: version } })
                .setTitle(`Fortnite stats for ${r.data.data.account.name}` || "No data");

            const userId = this.interaction.user.id;
            (userId === "481158632008974337" || userId == "539928835953524757") && e.addField("ID", r.data.data.account.id);

            // 3. Clean Embed (Image Only)
            e.setImage(`attachment://progress.png`)
            e.addField("Battle Pass Level", `${r.data.data.battlePass.level}.${r.data.data.battlePass.progress}` || "No data")
                .setImage(`attachment://progress.png`)
                .addField("Wins", String(r.data.data.stats.all.overall.wins) || "No data", true)
                .addField("KD", String(r.data.data.stats.all.overall.kd) || "No data", true)
                .addField("Win Rate", String(r.data.data.stats.all.overall.winRate + "%") || "No data", true)
                .addField("Matches", String(r.data.data.stats.all.overall.matches) || "No data", true)
                .addField("Kills", String(r.data.data.stats.all.overall.kills) || "No data", true)
                .addField("Days Played", String((r.data.data.stats.all.overall.minutesPlayed / 1440).toFixed(1)) || "No data", true)
                .addField("Last Update", new Date(r.data.data.stats.all.overall.lastModified).toLocaleString("en-US", { timeZone: "America/New_York" }) || "No data")
                .setColor("#2186DB")
                .setTimestamp();

            await this.interaction.editReply({ embeds: [e], files: [attachment], content: " " });
            this.updateWithRanks(this.interaction, e, r.data.data.account.name);

        } catch (e) {
            console.log(e.response?.status || e);
            const row = new MessageActionRow().addComponents(
                new MessageSelectMenu()
                    .setCustomId(`platform-select-username:${username}:authorId:${this.interaction.user.id}`)
                    .addOptions(platformChoices.map(opt => {
                        return {
                            label: opt.name.split(">")[1],
                            emoji: opt.name.split(">")[0],
                            value: opt.value,
                            ...(opt.value === platform && { default: true })
                        }
                    })),
            )

            await this.interaction.editReply({
                content: `Error: "${e.response?.data?.error || "Unknown error"}"\n\nDid you specify the correct platform?`,
                components: [row]
            });
        }
    }

    private async handlePlatformSelect(i: SelectMenuInteraction<CacheType>): Promise<void> {
        const username = i.customId.split(":")[1]
        const platform = i.values[0]

        i.component.options.splice(i.component.options.findIndex(o => o.default), 1);
        i.component.options.splice(i.component.options.findIndex(o => o.value === platform), 1);
        i.component.options = i.component.options.map((e) => ({ ...e, default: false }))
        i.component.placeholder = "";

        try {
            await i.update({ content: loadingStr, components: [] });

            const r = await axios.get(`https://fortnite-api.com/v2/stats/br/v2?image=all&accountType=${platform}&name=${username}`, {
                headers: { 'content-type': "application/json", 'Authorization': process.env.FORTNITE_API_KEY }
            });

            const attachment = await this.generateProgressAttachment(r.data.data);

            const e = new MessageEmbed({ footer: { text: version } })
                .setTitle(`Fortnite stats for ${r.data.data.account.name}`)
                .setImage(`attachment://progress.png`)
                .addField("Battle Pass Level", `${r.data.data.battlePass.level}.${r.data.data.battlePass.progress}` || "No data")
                .setImage(`attachment://progress.png`)
                .addField("Wins", String(r.data.data.stats.all.overall.wins) || "No data", true)
                .addField("KD", String(r.data.data.stats.all.overall.kd) || "No data", true)
                .addField("Win Rate", String(r.data.data.stats.all.overall.winRate + "%") || "No data", true)
                .addField("Matches", String(r.data.data.stats.all.overall.matches) || "No data", true)
                .addField("Kills", String(r.data.data.stats.all.overall.kills) || "No data", true)
                .addField("Days Played", String((r.data.data.stats.all.overall.minutesPlayed / 1440).toFixed(1)) || "No data", true)
                .addField("Last Update", new Date(r.data.data.stats.all.overall.lastModified).toLocaleString("en-US", { timeZone: "America/New_York" }) || "No data")
                .setColor("#2186DB")
                .setTimestamp();

            await i.editReply({ embeds: [e], files: [attachment], content: " " });
            this.updateWithRanks(i, e, r.data.data.account.name);

        } catch (e) {
            await i.editReply({
                content: `Error: "${e.response?.data?.error}"\n\n`,
                components: i.component.options.length === 0 ? [] : [new MessageActionRow().addComponents(new MessageSelectMenu(i.component))]
            });
        }
    }

    private async updateWithRanks(i: BaseCommandInteraction<CacheType> | SelectMenuInteraction<CacheType>, e: MessageEmbed, name: string) {
        try {
            const { data } = await axios.get(`http://api.scraperapi.com/?api_key=${process.env.SCRAPER_API_KEY}&render=true&url=https://fortnitetracker.com/profile/all/${name.replace(" ", "%20")}/competitive`);
            const $ = cheerio.load(data)
            const modes: EmbedField[] = []

            $(".profile-ranks__container").each(function (i, el) {
                modes.push({
                    name: `Ranked - ${$(this).children(".profile-ranks__title").eq(0).text()}`,
                    value: `${$(this).find(".profile-rank__name").eq(0).text()} - ${$(this).find(".profile-rank-progress").eq(0).text() || $(this).find(".profile-rank__rank--top").eq(0).text()}`,
                    inline: false,
                })
            })

            const winsIndex = e.fields.findIndex(f => f.name.includes("Wins"));
            if (winsIndex !== -1) {
                e.fields.splice(winsIndex, 0, ...modes);
            } else {
                e.addFields(modes);
            }

            await i.editReply({ embeds: [e] })
        } catch (err) {
            console.log("Failed to fetch rank", err)
        }
    }

    private calcDailyLevelsPerGoal(currentLevel: number): { perDay: number[], perWeek: number[], daysLeft: number, weeksLeft: number } {
        const goals = [150, 200];
        const seasonEndDate = new Date("2026-03-03");

        const now = new Date();
        const timeDiff = seasonEndDate.getTime() - now.getTime();
        const daysLeft = Math.max(1, Math.round(timeDiff / (1000 * 3600 * 24)) - 1);

        const perDay = goals.map(goal => {
            if (currentLevel >= goal) return 0;
            return (goal - currentLevel) / daysLeft;
        })

        const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
        const perWeek = goals.map(goal => {
            if (currentLevel >= goal) return 0;
            return (goal - currentLevel) / weeksLeft;
        })

        console.log({ perDay, perWeek, daysLeft, weeksLeft });
        return { perDay, perWeek, daysLeft, weeksLeft };
    }

    private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
        if (width < 2 * radius) radius = width / 2;
        if (height < 2 * radius) radius = height / 2;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
    }

    private async generateProgressAttachment(data: any): Promise<MessageAttachment> {
        // --- 1. Register OPEN SANS Font ---
        try {
            registerFont(
                path.join("assets/open-sans/OpenSans-ExtraBold.ttf"),
                { family: "OpenSans" }
            );

        } catch (e) {
            console.log("Font error:", e);
        }

        const bp = data.battlePass;
        const currentLevel = bp.level + (bp.progress / 100);

        // Compact Height (Battle Pass Only)
        const width = 700;
        const height = 220;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");

        // Layout Constants
        const contentX = 135;
        const rightPadding = 40;

        // Colors
        const bgColor = "#18191c";
        const labelColor = "#72767d"; // Gray
        const valueColor = "#ffffff"; // White
        const highlightColor = "#43B581"; // Green

        // Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        // --- 2. Icon ---
        const imagePath = path.join("assets", "battle-pass.png");
        try {
            const icon = await loadImage(imagePath);
            ctx.drawImage(icon, 25, 25, 85, 85);
        } catch (error) {
            ctx.fillStyle = "#2f3136"; ctx.beginPath(); ctx.arc(67, 67, 42, 0, Math.PI * 2); ctx.fill();
        }

        // --- 3. Logic ---
        const goal = currentLevel >= 130 ? 200 : 150;
        const percent = Math.min(currentLevel / goal, 1);
        const levelStats = this.calcDailyLevelsPerGoal(currentLevel);

        // --- 4. Text ---
        let cursorY = 40;
        ctx.textBaseline = "bottom";

        // Level Label (Open Sans)
        ctx.fillStyle = labelColor; ctx.font = "800 20px 'OpenSans'";
        ctx.fillText("LEVEL", contentX, 55);

        // Level Value (Open Sans)
        ctx.fillStyle = valueColor; ctx.font = "800  45px 'OpenSans'";
        ctx.fillText(`${Math.floor(currentLevel)}`, contentX + 70, 58);

        // Goal (Open Sans)
        ctx.textAlign = "right"; ctx.fillStyle = labelColor; ctx.font = "800  20px 'OpenSans'";
        ctx.fillText(`GOAL ${goal}`, width - rightPadding, 55);

        // --- 5. Progress Bar ---
        const barX = contentX;
        const barY = 75;
        const barWidth = width - contentX - rightPadding;
        const barHeight = 25;
        const radius = 12.5;

        // Empty Track
        ctx.fillStyle = "#2f3136";
        this.roundRect(ctx, barX, barY, barWidth, barHeight, radius); ctx.fill();

        // Filled Gradient Track
        if (percent > 0) {
            const fillWidth = Math.max(barWidth * percent, radius * 2);
            const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
            gradient.addColorStop(0, "#43B581"); gradient.addColorStop(1, "#00A8FC");
            ctx.fillStyle = gradient;
            ctx.shadowColor = "rgba(67, 181, 129, 0.4)"; ctx.shadowBlur = 15;
            this.roundRect(ctx, barX, barY, fillWidth, barHeight, radius); ctx.fill();
            ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
        }

        // --- 6. Stats Grid ---
        const statBoxY = 135;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        // Separator Line
        ctx.strokeStyle = "#2f3136"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(contentX, 120); ctx.lineTo(width - rightPadding, 120); ctx.stroke();

        // Helper to draw columns
        const drawStat = (label: string, value: string, xOffset: number, color: string = "#ffffff") => {
            const x = contentX + xOffset;
            ctx.fillStyle = labelColor; ctx.font = "bold 14px 'OpenSans'";
            ctx.fillText(label.toUpperCase(), x, statBoxY);

            ctx.fillStyle = color; ctx.font = "bold 24px 'OpenSans'";
            ctx.fillText(value, x, statBoxY + 25);
        };

        drawStat("Levels Left", `${Math.max(0, goal - currentLevel).toFixed(2)}`, 0);
        drawStat("Days Left", `${levelStats.daysLeft}`, 130);

        // Use index 0 (150) or 1 (200) depending on current goal
        const targetIndex = goal === 150 ? 0 : 1;
        const val = levelStats.perDay[targetIndex]?.toFixed(2) || "0";
        const difficultyColor = parseFloat(val) > 2.5 ? "#ED4245" : (parseFloat(val) > 1.5 ? "#FEE75C" : highlightColor);

        drawStat(`Levels/Day REQ`, val, 260, difficultyColor);
        drawStat(`Levels/Week`, levelStats.perWeek[targetIndex]?.toFixed(2) || "0", 410);

        const buffer = canvas.toBuffer("image/png");
        return new MessageAttachment(buffer, "progress.png");
    }
}





