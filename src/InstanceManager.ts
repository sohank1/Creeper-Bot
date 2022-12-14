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
    private _instance: ProdServerInstance = {
        id: v4(),
        status: null,
        platform: null,
        createdAt: null,
        lastPing: null,
    }
    private _keepKey: string;
    private _shutdownKey: string;

    constructor(private _redis: RedisClient, private _subscriber: RedisClient, platform: string, private _redisKey: string, private events: { onKeep: () => void; onShutdown: () => void }) {
        this._instance.platform = platform;
        this._keepKey = `${_redisKey}-keep`;
        this._shutdownKey = `${_redisKey}-shutdown`;

        this._subscriber.subscribe(this._keepKey, (newestServerId) => this._handleKeepServer(newestServerId))
        this._subscriber.subscribe(this._shutdownKey, (newestServerId) => this._handleShutdownServer(newestServerId))

        console.log(`Created Instance Manager for server ${this._instance.id}`)
    }

    public async addInstance() {
        console.log("adding instance")
        this._instance.createdAt = new Date().toISOString();

        let prodServers: ProdServers = JSON.parse(await this._redis.get(this._redisKey));
        if (!prodServers) prodServers = { instances: [this._instance] }
        else prodServers.instances.push(this._instance);

        await this._redis.set(this._redisKey, JSON.stringify(prodServers));
        this.checkForNewServersInterval();
        this.pingInterval();
        this.cleanUpDeadServersInterval();
    }

    public async setStatus(s: ProdServerInstance["status"]) {
        console.log(`Setting server ${this._instance.id} status to ${s}`);

        this._instance.status = s;
        this._updateServerInRedis(this._instance.id, this._instance);
    }

    private checkForNewServersInterval() {
        setInterval(async () => {
            console.log("checking for new servers")

            const prodServers: ProdServers = JSON.parse(await this._redis.get(this._redisKey));
            const newestServer = prodServers.instances.find(i => new Date(i.createdAt) >= new Date(this._instance.createdAt) && i.platform === this._instance.platform);
            if (newestServer.status !== "online") this._redis.publish(this._keepKey, newestServer.id);

            const olderServers = prodServers.instances.filter(i => i.id !== newestServer.id && i.platform === this._instance.platform);
            for (const s of olderServers) this._redis.publish(this._shutdownKey, s.id);

        }, 7000)
    }

    private _handleKeepServer(newestServerId: string) {
        if (newestServerId === this._instance.id && this._instance.status === "online") this.events.onKeep();
    }

    private _handleShutdownServer(newestServerId: string) {
        if (newestServerId === this._instance.id && this._instance.status === "offline") this.events.onShutdown();
    }

    private pingInterval() {
        setInterval(async () => {
            console.log("pinging");

            this._instance.lastPing = new Date().toISOString();
            await this._updateServerInRedis(this._instance.id, this._instance);
        }, 10000)
    }

    private cleanUpDeadServersInterval() {
        setInterval(async () => {
            console.log("cleaning up dead servers");

            const prodServers: ProdServers = JSON.parse(await this._redis.get(this._redisKey));
            const deadServers = prodServers.instances.filter((i) => new Date().getTime() - 20000 > new Date(i.lastPing).getTime() && i.platform === process.env.HOST_TYPE);
            for (const s of deadServers) {
                prodServers.instances.splice(prodServers.instances.findIndex(i => i.createdAt === s.id, 1));
                await this._redis.set(this._redisKey, JSON.stringify(prodServers));
            }
        }, 30000)
    }


    private async _updateServerInRedis(id: string, newInstanceData: ProdServerInstance) {
        console.log("updating server in redis");

        const prodServers: ProdServers = JSON.parse(await this._redis.get(this._redisKey));
        const i = prodServers.instances.findIndex(instance => instance.id === id);
        prodServers.instances[i] = newInstanceData;

        await this._redis.set(this._redisKey, JSON.stringify(prodServers))
    }

}
