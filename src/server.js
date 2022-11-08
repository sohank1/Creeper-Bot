const { Client } = require("discord.js");

const client = new Client({ restTimeOffset: 75, intents: new Intents(["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS",]) });
client.login(process.env.NODE_ENV == 'production' ? process.env.BOT_TOKEN : process.env.DEV_BOT_TOKEN);

const postScriptSpawnedAt = new Date().toISOString();

const app = express();
const port = process.env.PORT || 3001;
app.get("/", (req, res) => res.status(200).json({ msg: 'message from spawned script', postScriptSpawnedAt }));
app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)

    client.on("ready", () => {
        const countChannel = client.channels.cache.get('1039551756805361744')
        let count = 1;
        setInterval(() => {
            countChannel.send(`[\`${serverStartedAt}\`] ---- count: ${count}`)
            count++
        }, 1000)
    })

    setInterval(() => {
        try {
            if (process.env.NODE_ENV === "production" && process.env?.HOST_TYPE === "render") {
                console.log(`Fetching the render url from post script. This shouldn't be happening for a long amount of time. This script spawned at: ${postScriptSpawnedAt}`);
                axios.get('https://creeper-bot.onrender.com/');
            }
            // var os = require('os');

            //   console.log(os.cpus());
            //   console.log(os.totalmem() / 1024 / 1024);
            //  console.log(os.freemem() / 1024 / 1024)
        }
        catch (e) {
            console.log(e.message);
        }
    }, 5000)
});