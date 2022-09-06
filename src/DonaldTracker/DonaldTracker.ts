import { Client, Collection, MessageEmbed, Snowflake, TextChannel } from "discord.js";
// import Puppeteer from 'puppeteer';
import Chromium from "chrome-aws-lambda"
import DonaldModel, { DonaldData } from './DonaldTracker.model';
import newsChannels from "./../news/newsChannels.json"
const { puppeteer: Puppeteer } = Chromium

export const browser = Puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: [
        //    '--no-sandbox',
        // '--disable-setuid-sandbox',
        //  '--incognito',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--no-sandbox',
        '--no-zygote',
        '--single-process'

    ],
});

export class DonaldTracker {
    public data: { location: string; banner: string; };

    constructor(private client: Client) {
        this.scrape();
    }

    private async scrape(): Promise<void> {
        console.log("launching")
        const c = (<TextChannel>this.client.channels.cache.get('767763290004652037')) || (<TextChannel>this.client.channels.cache.get("725143127723212830"))


        const page = await (await browser).newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36"
        )
        c.send(`opened page: ${page.url()}`)

        page.setDefaultNavigationTimeout(0);

        setInterval(async () => {
            console.log("going..")
            await page.goto('https://twitter.com/DonaldMustard', { waitUntil: "networkidle2" });
            c?.send(`Successfully went to page: ${await page.title()}`)
            // await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

            const data = await page.evaluate(() => {
                const location = document.querySelectorAll('span span span');
                const banner = <HTMLImageElement>document.querySelector('.css-9pa8cd');

                return {
                    location: Array.from(location).map(l => l.textContent)[1],
                    banner: banner?.src,
                }

            });

            this.data = data;
            console.log(this.data);

            c?.send({ files: [await page.screenshot({ fullPage: true }) as Buffer] })

            c?.send(
                `Successfully got data: \`\`\`json
            ${JSON.stringify(this.data, null, 2)}
            \`\`\`
            `)



            const doc = await DonaldModel.findOne();
            if (data.banner && data.banner !== doc.banner || data.location !== doc.location) {
                // We have new data.

                this.saveData();
                this.sendMessage(doc);
            }
        }, 300000)  //5 mins 300000

    }

    public async saveData(): Promise<void> {
        await DonaldModel.updateMany({}, this.data);
    }

    public async sendMessage(doc: DonaldData | any): Promise<void> {
        const e = new MessageEmbed()
            .setTitle('Donald Mustard Stalker')
            .setDescription('I detected that Donald Mustard was updated!')
            .setColor('#2186DB')
            .setImage(this.data.banner)
            .setThumbnail(doc.banner)
            .addField('Location', `~~${doc.location}~~\n${this.data.location}`)
            .addField('Banner', `~~${doc.banner}~~\n${this.data.banner}`)
            .setTimestamp(new Date());

        for (const s of Object.values(newsChannels)) (<TextChannel>this.client.channels.cache.get(s.channel))?.send({ embeds: [e] });
    }

}
