import CountingModel, { CountingDoc } from "./Counting.model";

export class CountingService {
    private _cache = new Map<string, CountingDoc>();

    constructor() {
        // setInterval(() => console.log(JSON.stringify(Array.from(this._cacheArray), null, 2)), 5000)
    }

    private get _cacheArray() {
        return this._cache.values()
    }

    public async findOneByGuild(guildId: string): Promise<CountingDoc> {
        // return the element from the cache array if it is found
        for (const e of this._cacheArray) if (e.guildId === guildId) return e;

        // otherwise fetch it from the db and cache it
        const d = await CountingModel.findOne({ guildId })
        d && this._cache.set(d._id, d)

        return d || null
    }

    /**
     * Only use this method if document is already in the cache
     * It will be in the cache if a message in the server was sent
     * @param modifiedPaths - An array of paths that are needed when an array is updated. If you specify this then it will not overwrite. Mongoose can't save arrays unless you put the path
     */
    public async saveDoc(doc: CountingDoc, modifiedPaths?: string[]): Promise<CountingDoc> {
        // update it in the cache
        this._cache.set(doc._id, doc);

        // save the doc to the db
        if (modifiedPaths) {
            for (const p of modifiedPaths) doc.markModified(p)
            await doc.save();
            return doc;
        }

        await doc.update(doc, { overwrite: true })
        return doc;

    }
}