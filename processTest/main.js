
setInterval(() => {
    console.log("from main " + process.env.SOME_RANDOM)

    process.send("here's some data " + process.env.SOME_RANDOM)
}, 1000)
