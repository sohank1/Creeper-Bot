import CountingModel, { CountingDoc } from "./Counting.model";

export class CountingService {
    private _cache = new Map<string, CountingDoc>();

    constructor() {
        // setInterval(() => console.log(this._cache), 5000)
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
     */
    public async saveDoc(doc: CountingDoc): Promise<CountingDoc> {
        //  update it in the cache
        this._cache.set(doc._id, doc);

        // save the doc to the db
        await doc.save();

        return doc;
    }
}