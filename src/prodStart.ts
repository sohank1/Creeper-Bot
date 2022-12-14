import { ChildProcess, fork } from "child_process";
import { createClient } from "redis";
import { InstanceManager } from "./InstanceManager";

(async () => {
    if (process.env.NODE_ENV !== "production") throw new Error("Only start the app in production");
    const redis = createClient({ url: process.env.REDIS_URI });

    const subscriber = redis.duplicate();
    await redis.connect()
    await subscriber.connect();
    const key = "creeper_bot_prod_server";

    let postScript: ChildProcess;
    const instanceManager = new InstanceManager(redis, subscriber, process.env.HOST_TYPE, key, {
        onKeep: () => {
            if (!postScript) return;
            console.log("Killing postScript");
            postScript.kill();
            postScript = null;

            mainProcess = fork("dist/index.js");
            mainProcess.on("message", onMainProcessMessage);
            mainProcess.on("spawn", onMainProcessMessage);
        },
        onShutdown: () => {
            if (!mainProcess) return;
            console.log("Killing mainProcess");
            mainProcess.kill();
            mainProcess = null;

            postScript = fork("dist/postScript.js");
            postScript.on("message", onPostScriptMessage);
            postScript.on("spawn", onPostScriptMessage);
        }
    });
    instanceManager.addInstance();


    let mainProcess = fork("dist/index.js");
    mainProcess.on("message", onMainProcessMessage);
    mainProcess.on("spawn", onMainProcessMessage);

    function onMainProcessMessage(data) {
        console.log(data);
        console.log("setting status to online")
        instanceManager.setStatus("online");
    }

    function onPostScriptMessage(data) {
        console.log(data);
        instanceManager.setStatus("offline");
    }



    process.on("exit", () => {
        console.log("ON EXIT EVENT FIRED")
    })

    process.on("SIGTERM ", () => {
        console.log("ON SIGTERM EVENT FIRED")
    })

    process.on('uncaughtException', (error) => {
        console.error("here is the error stack", error.stack);
        console.log("uncaughtException happened", error);
    });

})();
