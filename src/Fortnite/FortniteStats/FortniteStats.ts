
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
import * as fs from "fs";
import spriteData from "../FortniteSprites/spriteData.json";
// 1. Import registerFont
import { createCanvas, loadImage, registerFont, CanvasRenderingContext2D } from "@napi-rs/canvas/node-canvas";
import { registerComponent } from "../../runtimeDiagnostics";
import { FortniteSeasonContext, resolveCurrentFortniteSeason } from "../FortniteSprites/fortniteSeason";
import { getFortniteSeasonEmoji, getFortniteSeasonEmojiAssetUrl } from "../fortniteSeasonEmoji";

const loadingStr = "Loading more... <a:loading:1140700893898084382>";

type LevelStats = {
    perDay: Array<number | null>;
    perWeek: Array<number | null>;
    daysLeft: number | null;
    weeksLeft: number | null;
};

type SeasonCardLabel = {
    name: string;
    emoji?: string;
};

export class FortniteStats {
    private static memoryCachedSeasonEndDate: Date | null = null;
    private static memoryCacheLastFetchTime: number = 0;
    private static memoryCachedSeasonContext: FortniteSeasonContext | null = null;
    private static memorySeasonContextLastFetchTime: number = 0;
    private static seasonEmojiImageCache = new Map<string, ReturnType<typeof loadImage>>();
    private static fortniteProfileImage: any | null = null;
    private static fortniteProfileImageFetchedAt = 0;
    private static fortniteProfileImageRefreshPromise: Promise<any | null> | null = null;
    private static readonly fortniteProfileImageRefreshMs = 6 * 60 * 60 * 1000;
    private lastStatsRequestAt: string | null = null;
    private lastStatsError: string | null = null;
    private statsRequestsHandled = 0;

    constructor(private client: Client) {
        registerComponent("fortniteStats", this);
        void this.fetchSeasonContext();
        void this.fetchSeasonEndDate();
        this.client.on("interactionCreate", (i) => {
            if (!i.isCommand()) return
            if (i.commandName !== "fortnite") return
            if (!i.options.get('username')) return

            return void this.getStats(i)
        })

        this.client.on("interactionCreate", async (i) => {
            if (i.isSelectMenu() && i.user.id === i.customId.split(":")[3] && i.customId.startsWith("platform-select")) return this.handlePlatformSelect(i)
        })
    }

    public getDiagnostics() {
        return {
            statsRequestsHandled: this.statsRequestsHandled,
            lastStatsRequestAt: this.lastStatsRequestAt,
            lastStatsError: this.lastStatsError,
            seasonEndDateCached: !!FortniteStats.memoryCachedSeasonEndDate,
            seasonEndCacheFetchedAt: FortniteStats.memoryCacheLastFetchTime
                ? new Date(FortniteStats.memoryCacheLastFetchTime).toISOString()
                : null,
            seasonEndDate: FortniteStats.memoryCachedSeasonEndDate?.toISOString() || null,
        };
    }

    private getPersistedSeasonContext(): FortniteSeasonContext | null {
        const dataPaths = [
            path.join(process.cwd(), ".cache", "fortnite-sprites", "spriteData.json"),
            path.join(process.cwd(), "src", "Fortnite", "FortniteSprites", "spriteData.json")
        ];

        for (const dataPath of dataPaths) {
            try {
                if (!fs.existsSync(dataPath)) continue;
                const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
                const context = parsed?.seasonContext as FortniteSeasonContext | undefined;
                if (context?.id && Number.isFinite(context.chapter) && context.season) return context;
            } catch {
                // Try the next persisted/bundled source.
            }
        }

        return (spriteData?.seasonContext as FortniteSeasonContext | undefined) || null;
    }

    private async fetchSeasonContext(): Promise<FortniteSeasonContext | null> {
        const CACHE_TTL_MS = 15 * 60 * 1000;
        if (
            FortniteStats.memoryCachedSeasonContext
            && (Date.now() - FortniteStats.memorySeasonContextLastFetchTime) < CACHE_TTL_MS
        ) {
            return FortniteStats.memoryCachedSeasonContext;
        }

        try {
            const season = await resolveCurrentFortniteSeason();
            FortniteStats.memoryCachedSeasonContext = season;
            FortniteStats.memorySeasonContextLastFetchTime = Date.now();
            return season;
        } catch (error) {
            console.warn("Failed to fetch Fortnite season context from fortnite.gg.", error);
        }

        const fallbackContext = this.getPersistedSeasonContext();
        if (fallbackContext) {
            FortniteStats.memoryCachedSeasonContext = fallbackContext;
            FortniteStats.memorySeasonContextLastFetchTime = Date.now();
            return fallbackContext;
        }

        return null;
    }

    private getPersistedSeasonEndDate(): Date | null {
        const fallbackEndDate = new Date(this.getPersistedSeasonContext()?.endsAt || "");
        return !Number.isNaN(fallbackEndDate.getTime()) && fallbackEndDate.getTime() > Date.now()
            ? fallbackEndDate
            : null;
    }

    private async fetchSeasonEndDate(): Promise<Date | null> {
        const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
        if (FortniteStats.memoryCachedSeasonEndDate && (Date.now() - FortniteStats.memoryCacheLastFetchTime) < CACHE_TTL_MS) {
            return FortniteStats.memoryCachedSeasonEndDate;
        }

        // Use the persisted catalog first so a blocked/slow live page never
        // delays the actual stats response. The next sprite catalog refresh
        // updates this value for the following process run.
        const fallbackEndDate = this.getPersistedSeasonEndDate();
        if (fallbackEndDate) {
            FortniteStats.memoryCachedSeasonEndDate = fallbackEndDate;
            FortniteStats.memoryCacheLastFetchTime = Date.now();
            return fallbackEndDate;
        }

        try {
            const season = await resolveCurrentFortniteSeason();
            if (season.endsAt) {
                const parsedSeasonEndDate = new Date(season.endsAt);

                if (!Number.isNaN(parsedSeasonEndDate.getTime()) && parsedSeasonEndDate.getTime() > Date.now()) {
                    FortniteStats.memoryCachedSeasonEndDate = parsedSeasonEndDate;
                    FortniteStats.memoryCacheLastFetchTime = Date.now();
                    return parsedSeasonEndDate;
                }
            }
        } catch (error) {
            console.warn("Failed to fetch Fortnite season end date from fortnite.gg.", error);
        }

        // The live season source is useful for keeping this value current, but
        // it must not take the stats command down when it is blocked or changes
        // its markup. The sprite catalog is refreshed from the same season
        // source and gives us a safe persisted fallback between refreshes.
        const refreshedFallbackEndDate = this.getPersistedSeasonEndDate();
        if (refreshedFallbackEndDate) {
            FortniteStats.memoryCachedSeasonEndDate = refreshedFallbackEndDate;
            FortniteStats.memoryCacheLastFetchTime = Date.now();
            return refreshedFallbackEndDate;
        }

        return null;
    }

    private getSeasonEndOrdinalSuffix(day: number): string {
        if (day % 100 >= 11 && day % 100 <= 13) return "th";

        switch (day % 10) {
            case 1: return "st";
            case 2: return "nd";
            case 3: return "rd";
            default: return "th";
        }
    }

    private formatSeasonEndShort(endAt: string | Date | null | undefined): string | null {
        const endDate = endAt instanceof Date ? endAt : new Date(endAt || "");
        if (Number.isNaN(endDate.getTime())) return null;

        const parts = new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "America/New_York",
        }).formatToParts(endDate);
        const month = parts.find(part => part.type === "month")?.value;
        const dayValue = parts.find(part => part.type === "day")?.value;
        const day = Number(dayValue);
        if (!month || !Number.isFinite(day)) return null;

        return `ENDS ${month.toUpperCase()} ${day}${this.getSeasonEndOrdinalSuffix(day).toUpperCase()}`;
    }

    private getSeasonCardLabel(season: FortniteSeasonContext | null): SeasonCardLabel | null {
        if (!season?.displayName?.trim()) return null;

        const seasonNumber = Number(season.season);
        const emoji = Number.isFinite(seasonNumber)
            ? getFortniteSeasonEmoji(season.chapter, seasonNumber)
            : undefined;

        return {
            name: season.displayName.trim(),
            ...(emoji ? { emoji } : {}),
        };
    }

    private getStatsApiKey(): string {
        const apiKey = process.env.FORTNITE_API_KEY?.trim();
        if (!apiKey) {
            throw new Error("Fortnite stats are unavailable because FORTNITE_API_KEY is not configured.");
        }
        return apiKey;
    }

    private fetchStats(username: string, platform: string) {
        return axios.get("https://fortnite-api.com/v2/stats/br/v2", {
            params: {
                // The bot renders its own progress image; asking the provider
                // to render another image only adds latency and another failure
                // point to the stats request.
                image: "none",
                accountType: platform,
                name: username,
            },
            headers: {
                "content-type": "application/json",
                "Authorization": this.getStatsApiKey(),
            },
            timeout: 20_000,
        });
    }

    private createPlatformRow(username: string, platform: string, userId: string): MessageActionRow {
        return new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId(`platform-select-username:${encodeURIComponent(username)}:authorId:${userId}`)
                .addOptions(platformChoices.map(opt => {
                    const [emoji, label] = opt.name.split(">");
                    return {
                        label: label?.trim() || opt.value,
                        emoji: emoji ? `${emoji}>` : undefined,
                        value: opt.value,
                        ...(opt.value === platform && { default: true }),
                    };
                })),
        );
    }

    private getErrorMessage(error: any): string {
        if (error?.response?.status === 401) return "The Fortnite stats API key was rejected.";
        if (error?.response?.status === 403) return "The Fortnite stats API denied this request.";
        return error?.response?.data?.error || error?.message || String(error) || "Unknown error";
    }

    private shouldOfferPlatformChoice(error: any): boolean {
        const status = error?.response?.status;
        return status === 400 || status === 404;
    }

    private async respondWithError(
        interaction: BaseCommandInteraction<CacheType> | SelectMenuInteraction<CacheType>,
        content: string,
        components: MessageActionRow[] = [],
    ): Promise<void> {
        const payload = { content, components };
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(payload);
        } else {
            await interaction.reply(payload);
        }
    }

    private formatStat(value: unknown, suffix = ""): string {
        if (value === null || value === undefined || value === "") return "No data";
        if (typeof value === "number" && !Number.isFinite(value)) return "No data";
        return `${value}${suffix}`;
    }

    private formatDate(value: unknown): string {
        if (!value) return "No data";
        const date = new Date(String(value));
        if (Number.isNaN(date.getTime())) return "No data";
        return date.toLocaleString("en-US", { timeZone: "America/New_York" });
    }

    private createStatsEmbed(data: any, userId: string, attachment: MessageAttachment | null): MessageEmbed {
        const account = data?.account || {};
        const overall = data?.stats?.all?.overall || {};
        const battlePass = data?.battlePass || {};
        const level = Number(battlePass.level);
        const progress = Number(battlePass.progress);
        const battlePassLevel = Number.isFinite(level)
            ? `${level}${Number.isFinite(progress) ? `.${progress}` : ""}`
            : "No data";
        const minutesPlayed = Number(overall.minutesPlayed);
        const daysPlayed = Number.isFinite(minutesPlayed) ? (minutesPlayed / 1440).toFixed(1) : null;

        const embed = new MessageEmbed({ footer: { text: version } })
            .setTitle(`Fortnite stats for ${account.name || "player"}`)
            .addField("Battle Pass Level", battlePassLevel)
            .addField("Wins", this.formatStat(overall.wins), true)
            .addField("KD", this.formatStat(overall.kd), true)
            .addField("Win Rate", this.formatStat(overall.winRate, "%"), true)
            .addField("Matches", this.formatStat(overall.matches), true)
            .addField("Kills", this.formatStat(overall.kills), true)
            .addField("Days Played", this.formatStat(daysPlayed), true)
            .addField("Last Update", this.formatDate(overall.lastModified))
            .setColor("#2186DB")
            .setTimestamp();

        if (attachment) embed.setImage("attachment://progress.png");

        if ((userId === "481158632008974337" || userId === "539928835953524757") && account.id) {
            embed.addField("ID", account.id);
        }

        return embed;
    }

    private async getStats(interaction: BaseCommandInteraction<CacheType>): Promise<void> {
        const username = String(interaction.options.get("username")?.value || "").trim();
        const platform = String(interaction.options.get("platform")?.value || "epic");

        try {
            if (!interaction.replied) {
                await interaction.reply({ content: loadingStr });
            }

            const response = await this.fetchStats(username, platform);
            const data = response.data?.data;
            if (!data) throw new Error("Fortnite stats API returned no player data.");

            this.statsRequestsHandled++;
            this.lastStatsRequestAt = new Date().toISOString();
            this.lastStatsError = null;

            // The progress card is helpful, but it is not allowed to prevent
            // the actual player stats from being returned.
            let attachment: MessageAttachment | null = null;
            try {
                attachment = await this.generateProgressAttachment(data);
            } catch (error) {
                console.warn("Failed to render Fortnite stats progress card.", error);
            }

            const embed = this.createStatsEmbed(data, interaction.user.id, attachment);

            await interaction.editReply({
                embeds: [embed],
                files: attachment ? [attachment] : [],
                content: " ",
            });
            void this.updateWithRanks(interaction, embed, data.account?.name || username);
        } catch (error) {
            this.lastStatsError = this.getErrorMessage(error);
            console.log(error?.response?.status || error);

            const components = this.shouldOfferPlatformChoice(error)
                ? [this.createPlatformRow(username, platform, interaction.user.id)]
                : [];
            await this.respondWithError(
                interaction,
                `Error: "${this.getErrorMessage(error)}"${components.length ? "\n\nDid you specify the correct platform?" : ""}`,
                components,
            );
        }
    }

    private async handlePlatformSelect(i: SelectMenuInteraction<CacheType>): Promise<void> {
        const encodedUsername = i.customId.split(":")[1] || "";
        let username = encodedUsername;
        try {
            username = decodeURIComponent(encodedUsername);
        } catch {
            // Keep the raw value for buttons created by an older bot version.
        }
        const platform = String(i.values[0] || "epic");

        try {
            await i.update({ content: loadingStr, components: [] });

            const response = await this.fetchStats(username, platform);
            const data = response.data?.data;
            if (!data) throw new Error("Fortnite stats API returned no player data.");

            this.statsRequestsHandled++;
            this.lastStatsRequestAt = new Date().toISOString();
            this.lastStatsError = null;

            let attachment: MessageAttachment | null = null;
            try {
                attachment = await this.generateProgressAttachment(data);
            } catch (error) {
                console.warn("Failed to render Fortnite stats progress card.", error);
            }

            const embed = this.createStatsEmbed(data, i.user.id, attachment);

            await i.editReply({
                embeds: [embed],
                files: attachment ? [attachment] : [],
                content: " ",
            });
            void this.updateWithRanks(i, embed, data.account?.name || username);

        } catch (error) {
            this.lastStatsError = this.getErrorMessage(error);
            const components = this.shouldOfferPlatformChoice(error)
                ? [this.createPlatformRow(username, platform, i.user.id)]
                : [];
            await this.respondWithError(
                i,
                `Error: "${this.getErrorMessage(error)}"${components.length ? "\n\nDid you specify the correct platform?" : ""}`,
                components,
            );
        }
    }

    private async updateWithRanks(i: BaseCommandInteraction<CacheType> | SelectMenuInteraction<CacheType>, e: MessageEmbed, name: string) {
        try {
            const scraperApiKey = process.env.SCRAPER_API_KEY?.trim();
            if (!scraperApiKey || !name) return;

            const { data } = await axios.get("https://api.scraperapi.com/", {
                params: {
                    api_key: scraperApiKey,
                    render: true,
                    url: `https://fortnitetracker.com/profile/all/${encodeURIComponent(name)}/competitive`,
                },
                timeout: 20_000,
            });
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

    private async calcDailyLevelsPerGoal(currentLevel: number): Promise<LevelStats> {
        const goals = [150, 200];
        const seasonEndDate = await this.fetchSeasonEndDate();

        if (!seasonEndDate) {
            return {
                perDay: goals.map(() => null),
                perWeek: goals.map(() => null),
                daysLeft: null,
                weeksLeft: null,
            };
        }

        const now = new Date();
        const timeDiff = seasonEndDate.getTime() - now.getTime();
        const daysLeft = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));

        const perDay = goals.map(goal => {
            if (currentLevel >= goal) return 0;
            return (goal - currentLevel) / daysLeft;
        })

        const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
        const perWeek = goals.map(goal => {
            if (currentLevel >= goal) return 0;
            return (goal - currentLevel) / weeksLeft;
        })

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

    private fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
        if (ctx.measureText(value).width <= maxWidth) return value;

        const ellipsis = "…";
        let fitted = value;
        while (fitted.length > 1 && ctx.measureText(`${fitted}${ellipsis}`).width > maxWidth) {
            fitted = fitted.slice(0, -1);
        }
        return `${fitted}${ellipsis}`;
    }

    private async loadSeasonEmojiImage(emoji: string) {
        const assetUrl = getFortniteSeasonEmojiAssetUrl(emoji);
        let imagePromise = FortniteStats.seasonEmojiImageCache.get(assetUrl);
        if (!imagePromise) {
            imagePromise = loadImage(assetUrl);
            FortniteStats.seasonEmojiImageCache.set(assetUrl, imagePromise);
        }

        try {
            return await imagePromise;
        } catch {
            FortniteStats.seasonEmojiImageCache.delete(assetUrl);
            return null;
        }
    }

    private async resolveFortniteProfileImageUrl(): Promise<string | null> {
        try {
            const response = await axios.get("https://x.com/Fortnite", {
                timeout: 15_000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
                    Accept: "text/html,application/xhtml+xml",
                },
            });
            const html = String(response.data)
                .replace(/\\u002F/g, "/")
                .replace(/\\\//g, "/");
            const profileImageUrl = html.match(
                /https?:\/\/pbs\.twimg\.com\/profile_images\/[^"'?\\\s]+/i,
            )?.[0];
            return profileImageUrl
                ? profileImageUrl.replace(/_(?:normal|bigger|mini)\.(\w+)$/i, "_400x400.$1")
                : null;
        } catch {
            return null;
        }
    }

    private async fetchFortniteProfileImage() {
        const liveProfileImageUrl = await this.resolveFortniteProfileImageUrl();
        const imageSources = [
            liveProfileImageUrl,
            "https://unavatar.io/x/Fortnite",
            path.join("assets", "fortnite-twitter-profile.png"),
        ].filter((source): source is string => !!source);

        for (const source of imageSources) {
            try {
                return await loadImage(source);
            } catch {
                // Try the next live/fallback source.
            }
        }
        return null;
    }

    private async loadFortniteProfileImage() {
        const now = Date.now();
        const cacheIsFresh = FortniteStats.fortniteProfileImage
            && now - FortniteStats.fortniteProfileImageFetchedAt < FortniteStats.fortniteProfileImageRefreshMs;
        if (cacheIsFresh) return FortniteStats.fortniteProfileImage;

        if (!FortniteStats.fortniteProfileImageRefreshPromise) {
            FortniteStats.fortniteProfileImageRefreshPromise = this.fetchFortniteProfileImage()
                .then(image => {
                    if (image) {
                        FortniteStats.fortniteProfileImage = image;
                        FortniteStats.fortniteProfileImageFetchedAt = Date.now();
                    }
                    return image || FortniteStats.fortniteProfileImage;
                })
                .finally(() => {
                    FortniteStats.fortniteProfileImageRefreshPromise = null;
                });
        }

        return await FortniteStats.fortniteProfileImageRefreshPromise;
    }

    private async drawSeasonPill(
        ctx: CanvasRenderingContext2D,
        season: SeasonCardLabel,
        x: number,
        y: number,
        maxWidth: number,
    ): Promise<number> {
        const labelFont = "800 18px 'OpenSans'";
        const emojiFont = "20px 'Noto Color Emoji'";
        const pillHeight = 66;
        const profileImageSize = 50;
        const pillPaddingLeft = 12;
        const pillPaddingRight = 18;
        const profileGap = 16;
        const emojiSize = 27;
        const emojiGap = 16;
        const label = season.name.toUpperCase();
        const [emojiImage, profileImage] = await Promise.all([
            season.emoji ? this.loadSeasonEmojiImage(season.emoji) : Promise.resolve(null),
            this.loadFortniteProfileImage(),
        ]);
        const emojiWidth = season.emoji ? emojiSize : 0;
        const labelEmojiGap = season.emoji ? emojiGap : 0;
        const fixedWidth = pillPaddingLeft
            + profileImageSize
            + profileGap
            + labelEmojiGap
            + emojiWidth
            + pillPaddingRight;
        const availableLabelWidth = Math.max(1, maxWidth - fixedWidth);

        ctx.font = labelFont;
        const fittedLabel = this.fitText(ctx, label, availableLabelWidth);
        const labelWidth = ctx.measureText(fittedLabel).width;
        const pillWidth = Math.min(
            maxWidth,
            fixedWidth + labelWidth,
        );

        // A quiet, token-like chip matching the sprites UI: neutral panel fill,
        // restrained rule, the official Fortnite avatar, and the shared emoji asset.
        ctx.fillStyle = "rgba(35, 40, 46, 0.12)";
        this.roundRect(ctx, x, y, pillWidth, pillHeight, pillHeight / 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(117, 130, 143, 0.45)";
        ctx.lineWidth = 1.5;
        this.roundRect(ctx, x, y, pillWidth, pillHeight, pillHeight / 2);
        ctx.stroke();

        const profileX = x + pillPaddingLeft;
        const profileY = y + ((pillHeight - profileImageSize) / 2);
        ctx.save();
        ctx.beginPath();
        ctx.arc(
            profileX + (profileImageSize / 2),
            profileY + (profileImageSize / 2),
            profileImageSize / 2,
            0,
            Math.PI * 2,
        );
        ctx.clip();
        if (profileImage) {
            ctx.drawImage(profileImage, profileX, profileY, profileImageSize, profileImageSize);
        } else {
            ctx.fillStyle = "#3a424c";
            ctx.fill();
        }
        ctx.restore();

        ctx.textBaseline = "middle";
        ctx.font = labelFont;
        ctx.fillStyle = "#eef1f4";
        ctx.textAlign = "left";
        const labelX = x + pillPaddingLeft + profileImageSize + profileGap;
        ctx.fillText(fittedLabel, labelX, y + (pillHeight / 2));

        if (season.emoji) {
            const emojiX = labelX + labelWidth + emojiGap;

            if (emojiImage) {
                ctx.drawImage(emojiImage, emojiX, y + ((pillHeight - emojiSize) / 2), emojiSize, emojiSize);
            } else {
                ctx.font = emojiFont;
                ctx.fillStyle = "#ffffff";
                ctx.fillText(season.emoji, emojiX, y + (pillHeight / 2) - 1);
            }
        }

        return pillWidth;
    }

    private drawSeasonEndLabel(
        ctx: CanvasRenderingContext2D,
        label: string,
        x: number,
        y: number,
        maxWidth: number,
    ): void {
        if (maxWidth <= 0) return;

        const font = "800 18px 'OpenSans'";
        ctx.font = font;
        const fittedLabel = this.fitText(ctx, label, maxWidth);
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(fittedLabel, x, y);
    }

    private async generateProgressAttachment(data: any): Promise<MessageAttachment | null> {
        // --- 1. Register OPEN SANS Font ---
        try {
            registerFont(
                path.join("assets/open-sans/OpenSans-ExtraBold.ttf"),
                { family: "OpenSans" }
            );

        } catch (e) {
            console.log("Font error:", e);
        }

        const bp = data?.battlePass;
        const level = Number(bp?.level);
        if (!Number.isFinite(level)) return null;

        const progress = Number(bp?.progress);
        const currentLevel = level + (Number.isFinite(progress) ? progress / 100 : 0);

        const [season, levelStats] = await Promise.all([
            this.fetchSeasonContext(),
            this.calcDailyLevelsPerGoal(currentLevel),
        ]);
        const seasonCardLabel = this.getSeasonCardLabel(season);
        const liveSeasonEndLabel = this.formatSeasonEndShort(season?.endsAt);
        const seasonEndLabel = seasonCardLabel
            ? liveSeasonEndLabel || this.formatSeasonEndShort(await this.fetchSeasonEndDate())
            : null;

        // Render at 2x so Discord can scale the existing card down without
        // softening its Open Sans text or the season emoji.
        const renderScale = 2;
        const hasSeasonPill = !!seasonCardLabel;
        const width = hasSeasonPill ? 840 : 760;
        const height = hasSeasonPill ? 370 : 220;
        const canvas = createCanvas(width * renderScale, height * renderScale);
        const ctx = canvas.getContext("2d");
        ctx.scale(renderScale, renderScale);

        // Layout Constants
        const contentX = hasSeasonPill ? 150 : 135;
        const rightPadding = hasSeasonPill ? 46 : 40;
        const levelLabelY = hasSeasonPill ? 92 : 55;
        const levelValueY = hasSeasonPill ? 99 : 62;
        const progressBarY = hasSeasonPill ? 115 : 75;
        const statsY = hasSeasonPill ? 185 : 135;
        const separatorY = hasSeasonPill ? 170 : 120;

        // Colors
        const bgColor = "#18191c";
        const labelColor = "#72767d";
        const valueColor = "#ffffff";
        const highlightColor = "#43B581";

        // Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        // --- 2. Icon ---
        const imagePath = path.join("assets", "battle-pass.png");
        try {
            const icon = await loadImage(imagePath);
            ctx.drawImage(
                icon,
                hasSeasonPill ? 27 : 25,
                hasSeasonPill ? 58 : 25,
                hasSeasonPill ? 92 : 85,
                hasSeasonPill ? 92 : 85,
            );
        } catch (error) {
            const iconCenterX = hasSeasonPill ? 73 : 67;
            const iconCenterY = hasSeasonPill ? 104 : 67;
            const iconRadius = hasSeasonPill ? 46 : 42;
            ctx.fillStyle = "#2f3136";
            ctx.beginPath();
            ctx.arc(iconCenterX, iconCenterY, iconRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // --- 3. Logic ---
        const goal = currentLevel >= 130 ? 200 : 150;
        const percent = Math.min(currentLevel / goal, 1);

        // --- 4. Text ---
        ctx.textBaseline = "bottom";

        // Level Label (Open Sans)
        ctx.fillStyle = labelColor; ctx.font = "800 16px 'OpenSans'";
        ctx.fillText("LEVEL", contentX, levelLabelY);

        // Level Value (Open Sans)
        ctx.fillStyle = valueColor;
        ctx.font = `800 ${hasSeasonPill ? 42 : 40}px 'OpenSans'`;
        ctx.fillText(`${Math.floor(currentLevel)}`, contentX + (hasSeasonPill ? 68 : 66), levelValueY);

        // Goal (Open Sans)
        ctx.textAlign = "right"; ctx.fillStyle = labelColor; ctx.font = "800 18px 'OpenSans'";
        ctx.fillText(`GOAL ${goal}`, width - rightPadding, levelLabelY);

        // --- 5. Progress Bar ---
        const barX = contentX;
        const barY = progressBarY;
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
        const statBoxY = statsY;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        // Separator Line
        ctx.strokeStyle = "#2f3136"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(contentX, separatorY); ctx.lineTo(width - rightPadding, separatorY); ctx.stroke();

        // Helper to draw columns
        const drawStat = (label: string, value: string, xOffset: number, color: string = "#ffffff") => {
            const x = contentX + xOffset;
            ctx.fillStyle = labelColor; ctx.font = "bold 14px 'OpenSans'";
            ctx.fillText(label.toUpperCase(), x, statBoxY);

            ctx.fillStyle = color; ctx.font = "bold 24px 'OpenSans'";
            ctx.fillText(value, x, statBoxY + 25);
        };

        const statOffsets = hasSeasonPill ? [0, 170, 340, 520] : [0, 145, 290, 435];
        drawStat("Levels Left", `${Math.max(0, goal - currentLevel).toFixed(2)}`, statOffsets[0]);
        drawStat("Days Left", levelStats.daysLeft === null ? "N/A" : `${levelStats.daysLeft}`, statOffsets[1]);

        // Use index 0 (150) or 1 (200) depending on current goal
        const targetIndex = goal === 150 ? 0 : 1;
        const perDay = levelStats.perDay[targetIndex];
        const val = perDay === null ? "N/A" : perDay.toFixed(2);
        const difficultyColor = perDay === null
            ? labelColor
            : perDay > 2.5
                ? "#ED4245"
                : perDay > 1.5
                    ? "#FEE75C"
                    : highlightColor;

        drawStat(`Levels/Day REQ`, val, statOffsets[2], difficultyColor);
        const perWeek = levelStats.perWeek[targetIndex];
        drawStat(`Levels/Week`, perWeek === null ? "N/A" : perWeek.toFixed(2), statOffsets[3], perWeek === null ? labelColor : valueColor);

        if (seasonCardLabel) {
            const seasonEndGap = seasonEndLabel ? 24 : 0;
            ctx.font = "800 18px 'OpenSans'";
            const seasonEndWidth = seasonEndLabel ? ctx.measureText(seasonEndLabel).width : 0;
            const seasonPillMaxWidth = Math.max(
                1,
                width - contentX - rightPadding - seasonEndGap - seasonEndWidth,
            );
            const seasonPillY = 286;
            const seasonPillWidth = await this.drawSeasonPill(
                ctx,
                seasonCardLabel,
                contentX,
                seasonPillY,
                seasonPillMaxWidth,
            );
            if (seasonEndLabel) {
                const seasonEndX = contentX + seasonPillWidth + seasonEndGap;
                this.drawSeasonEndLabel(
                    ctx,
                    seasonEndLabel,
                    seasonEndX,
                    seasonPillY + 33,
                    width - rightPadding - seasonEndX,
                );
            }
        }

        const buffer = canvas.toBuffer("image/png");
        return new MessageAttachment(buffer, "progress.png");
    }
}
