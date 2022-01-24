import { execSync } from "child_process";
import { Client, MessageEmbed, TextChannel } from "discord.js";
import { launch, Page } from 'puppeteer';
import DonaldModel, { DonaldData } from './DonaldTracker.model';

export class DonaldTracker {
    public data: { location: string; banner: string; };

    constructor(private client: Client) {
        this.scrape();
    }

    private async scrape(): Promise<void> {
        let browser = null;
        let page: Page = null;

        (async () => {
            console.log("launching")
            browser = await launch({
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                ],
            });
            page = await browser.newPage();

            setInterval(async () => {
                console.log("going..")
                await page.goto('https://twitter.com/DonaldMustard', { waitUntil: 'networkidle2' });

                const data = await page.evaluate(() => {
                    const location = document.querySelectorAll('span span span');
                    const banner = <HTMLImageElement>document.querySelector('.css-9pa8cd');

                    return {
                        location: Array.from(location).map(l => l.textContent)[1],
                        banner: banner.src,
                    }

                });

                this.data = data;
                console.log(this.data);

                const doc = await DonaldModel.findOne();
                if (data.banner !== doc.banner || data.location !== doc.location) {
                    // We have new data.

                    this.saveData();
                    this.sendMessage(doc);
                }
            }, 30000)  //300000

        })();
    }

    public async saveData(): Promise<void> {
        await DonaldModel.updateMany({}, this.data);
    }

    public async sendMessage(doc: DonaldData | any): Promise<void> {
        const e = new MessageEmbed()
            .setTitle('Donald Mustard Stalker')
            .setDescription('I detected that Donald Mustard was updated!')
            .setColor('2186DB')
            .setImage(this.data.banner)
            .setThumbnail(doc.banner)
            .addField('Location', `~~${doc.location}~~\n${this.data.location}`)
            .addField('Banner', `~~${doc.banner}~~\n${this.data.banner}`)
            .setTimestamp(new Date());

        (<TextChannel>this.client.channels.cache.get('678266554088947712')).send(e);
    }

}
