import { fork } from "child_process";

if (process.env.NODE_ENV !== "production") throw new Error("Only start the app in production");

const mainProcess = fork("dist/index.js");

mainProcess.on("message", (data) => {
    console.log(data)

    if (data === "SHUTDOWN_SERVER") {
        mainProcess.kill();

        const newProcess = fork("dist/postScript.js");

        newProcess.on("message", (data) => {
            console.log(data);
            if (data === "SHUTDOWN_SERVER") mainProcess.kill();
            process.exit()
        })
    }
})
