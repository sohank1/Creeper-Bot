import { v4 } from "uuid";
import { createClient } from "redis";

interface ProdServerInstance {
    id: string;
    /**
     * If the server is running the application or the post script
     */
    status: "online" | "offline";
    /**
     * The hosting platform of the instance. Ex: heroku, mogenius, render, ect
     */
    platform: string;

    /**
     * The time that the instance was created, in string form
     */
    createdAt: string;

    /**
     * The last time the server pinged, in string form
     */
    lastPing: string;

    /**
     * The version of the application that the server is running
     */
    version: string;
}

export interface ProdServers {
    instances: ProdServerInstance[]
}

// export enum ProcessCodes {
//     "Shutdown" = "SHUTDOWN_SERVER",
//     "Keep" = "KEEP",
// }

type RedisClient = typeof createClient extends () => infer ResultType
    ? ResultType
    : never;

export class InstanceManager {
    public _instance: ProdServerInstance = {
        id: v4(),
        status: null,
        platform: null,
        createdAt: null,
        lastPing: null,
        version: null
    }
    private _keepKey: string;
    private _shutdownKey: string;

    constructor(private _redis: RedisClient, private _subscriber: RedisClient, platform: string, version: string, private _redisKey: string, private events: { onKeep: () => void; onShutdown: () => void }) {
        this._instance.platform = platform;
        this._instance.version = version;
        this._keepKey = `${_redisKey}-keep`;
        this._shutdownKey = `${_redisKey}-shutdown`;

        this._subscriber.subscribe(this._keepKey, (newestServerId) => this._handleKeepServer(newestServerId))
        this._subscriber.subscribe(this._shutdownKey, (newestServerId) => this._handleShutdownServer(newestServerId))

        console.log(`Created Instance Manager for server ${this._instance.id}`)
    }

    public async addInstance() {
        console.log("adding instance")
        this._instance.createdAt = new Date().toISOString();
        this._instance.lastPing = new Date().toISOString();

        let prodServers: ProdServers = JSON.parse(await this._redis.get(this._redisKey));
        if (!prodServers) prodServers = { instances: [this._instance] }
        else prodServers.instances.push(this._instance);

        console.log("saving prod servers", prodServers);
        await this._redis.set(this._redisKey, JSON.stringify(prodServers));
        console.log("after saving the prod servers here is the data fetched again", JSON.parse(await this._redis.get(this._redisKey)));

        this.pingInterval();
        this.checkForNewServersInterval();
        this.cleanUpDeadServersInterval();
    }

    public async setStatus(s: ProdServerInstance["status"]) {
        console.log(`Setting server ${this._instance.id} status to ${s}`);

        this._instance.status = s;
        this._updateServerInRedis(this._instance.id, this._instance);
        console.log("successfully set status", JSON.parse(await this._redis.get(this._redisKey)));
    }

    private checkForNewServersInterval() {
        setInterval(async () => {
            console.log("checking for new servers", JSON.parse(await this._redis.get(this._redisKey)));

            const prodServers: ProdServers = JSON.parse(await this._redis.get(this._redisKey));
            const newestServer = prodServers.instances.find(i => new Date(i.createdAt) >= new Date(this._instance.createdAt) && i.platform === this._instance.platform);
            console.log("newest server: ", newestServer);
            console.log("all servers", prodServers.instances);
            console.log("this server", this._instance);


            if (newestServer?.status !== "online") {
                console.log(`newest server status is online. publishing keep message key: ${this._keepKey} server: ${newestServer} `)
                newestServer.id && this._redis.publish(this._keepKey, newestServer.id);
            }

            const olderServers = prodServers.instances.filter(i => i.id !== newestServer.id && i.platform === this._instance.platform);
            console.log("older servers", olderServers);
            for (const s of olderServers) if (s?.id) {
                console.log(`shutting down old server: ${s}`)
                this._redis.publish(this._shutdownKey, s.id);
            }
        }, 7000)
    }

    private _handleKeepServer(newestServerId: string) {
        console.log(`got a keep ${newestServerId}`)
        if (newestServerId === this._instance.id && this._instance.status === "offline") this.events.onKeep(); // only keep if the server is offline and in post script mode
    }

    private _handleShutdownServer(newestServerId: string) {
        console.log(`got a message to shutdown ${newestServerId}`)
        if (newestServerId === this._instance.id && this._instance.status === "online") this.events.onShutdown(); // only shutdown if the server is already online
    }

    private pingInterval() {
        setInterval(async () => {
            console.log("pinging");

            this._instance.lastPing = new Date().toISOString();
            await this._updateServerInRedis(this._instance.id, this._instance);

            console.log("successfully pinged", JSON.parse(await this._redis.get(this._redisKey)));
        }, 10000)
    }

    private cleanUpDeadServersInterval() {
        setInterval(async () => {
            const prodServers: ProdServers = JSON.parse(await this._redis.get(this._redisKey));
            const deadServers = prodServers.instances.filter((i) => new Date().getTime() - 20000 > new Date(i.lastPing).getTime() && i.platform === process.env.HOST_TYPE);
            console.log("dead servers", deadServers);
            for (const s of deadServers) {
                const index = prodServers.instances.findIndex(i => i.id === s.id, 1);
                if (index === -1) return;

                console.log(`before removing dead server ${s.id} from prod servers`, prodServers);
                prodServers.instances.splice(index);
                console.log(`after removing dead server ${s.id} from prod servers`, prodServers);

                await this._redis.set(this._redisKey, JSON.stringify(prodServers));
            }
        }, 30000)
    }


    private async _updateServerInRedis(id: string, newInstanceData: ProdServerInstance) {
        const prodServers: ProdServers = JSON.parse(await this._redis.get(this._redisKey));
        console.log("fetched prod servers in _updateServerInRedis()", prodServers);
        if (!prodServers) return;

        const i = prodServers.instances.findIndex(instance => instance.id === id);
        console.log(`index of instance with id ${id} is ${i} in the prod servers array`)
        if (i === -1) return;

        prodServers.instances[i] = newInstanceData;
        await this._redis.set(this._redisKey, JSON.stringify(prodServers));
        console.log("updated prod servers in _updateServerInRedis()", prodServers);
        console.log("after updating prod servers in _updateServerInRedis() here is the data fetched again", JSON.parse(await this._redis.get(this._redisKey)));

    }

}
