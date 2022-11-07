const app = express();
const port = process.env.PORT || 3001;
app.get("/", (req, res) => res.sendStatus(200));
app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)


    setInterval(() => {
        try {
            if (process.env.NODE_ENV === "production" && process.env?.HOST_TYPE === "render") {
                console.log('fetching onrender url')
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