import { execSync } from "child_process";
import { Client, MessageEmbed, TextChannel } from "discord.js";
import { launch, Page } from 'puppeteer';
import DonaldModel, { DonaldData } from './DonaldTracker.model';

export class DonaldTracker {
    public data: { location: string; banner: string; };

    constructor(private client: Client) {
        console.log(execSync('npm i').toString());
        console.log(execSync(`apt-get update \ # Install latest chrome dev package, which installs the necessary libs to # make the bundled version of Chromium that Puppeteer installs work. && apt-get install -y wget --no-install-recommends \ && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \ && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \ && apt-get update \ && apt-get install -y google-chrome-unstable --no-install-recommends \ && rm -rf /var/lib/apt/lists/* \ && wget --quiet https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh -O /usr/sbin/wait-for-it.sh \ && chmod +x /usr/sbin/wait-for-it.sh`).toString());
        console.log(execSync('node node_modules/puppeteer/install.js').toString());
        this.scrape();
    }

    private async scrape(): Promise<void> {
        let browser = null;
        let page: Page = null;

        (async () => {
            console.log("launching")
            browser = await launch();
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