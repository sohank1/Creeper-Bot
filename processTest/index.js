const { exec, spawn, fork } = require("child_process");
console.log("from index.js")

process.env.SOME_RANDOM = '3134312'

const mainProcess = fork("processTest/main.js")

mainProcess.on("message", (data) => {
  console.log(data)
})


// mainProcess.stdout.on("data", logData)
// mainProcess.stderr.on('data', logError)

setTimeout(() => {
  console.log("killing main.js process")
  mainProcess.kill()

  const newProcess = fork("processTest/post.js");

  newProcess.on("message", (data) => {
    console.log(data)
  })

}, 5000)
// process.exit(0)
  // client.destroy();