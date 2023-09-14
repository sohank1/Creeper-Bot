export type FormatedSections = { name: string; quantity: number }[];

export interface EpicModesResponseObject {
    channels: Channels;
    cacheIntervalMins: number;
    currentTime: Date;
}

export interface Channels {
    "standalone-store": StandaloneStore;
    "client-matchmaking": ClientMatchmaking;
    tk: Tk;
    "featured-islands": FeaturedIslands;
    "community-votes": CommunityVotes;
    "client-events": ClientEvents;
}

export interface ClientEvents {
    states: ClientEventsState[];
    cacheExpire: Date;
}

export interface ClientEventsState {
    validFrom: Date;
    activeEvents: PurpleActiveEvent[];
    state: PurpleState;
}

export interface PurpleActiveEvent {
    eventType: string;
    activeUntil: Date;
    activeSince: Date;
}

export interface PurpleState {
    activeStorefronts: any[];
    eventNamedWeights: EventNamedWeights;
    activeEvents: FluffyActiveEvent[];
    seasonNumber: number;
    seasonTemplateId: string;
    matchXpBonusPoints: number;
    eventPunchCardTemplateId: string;
    seasonBegin: Date;
    seasonEnd: Date;
    seasonDisplayedEnd: Date;
    weeklyStoreEnd: Date;
    stwEventStoreEnd: Date;
    stwWeeklyStoreEnd: Date;
    sectionStoreEnds: SectionStoreEnds;
    rmtPromotion: string;
    dailyStoreEnd: Date;
}

export interface FluffyActiveEvent {
    instanceId: string;
    devName: string;
    eventName: string;
    eventStart: Date;
    eventEnd: Date;
    eventType: string;
}

export interface EventNamedWeights {
}

export interface SectionStoreEnds {
    Marvel9: Date;
    Marvel10: Date;
    Marvel11: Date;
    Marvel12: Date;
    Marvel: Date;
    Marvel2: Date;
    Marvel3: Date;
    Marvel4: Date;
    Marvel5: Date;
    Marvel6: Date;
    Marvel7: Date;
    Marvel8: Date;
    Marvel17: Date;
    Marvel18: Date;
    Marvel19: Date;
    Marvel20: Date;
    UnchartedB: Date;
    Daily: Date;
    Featured: Date;
    Featured2: Date;
    Featured3: Date;
    Marvel13: Date;
    Marvel14: Date;
    Marvel15: Date;
    Marvel16: Date;
}

export interface ClientMatchmaking {
    states: ClientMatchmakingState[];
    cacheExpire: Date;
}

export interface ClientMatchmakingState {
    validFrom: Date;
    activeEvents: any[];
    state: FluffyState;
}

export interface FluffyState {
    region: Region;
}

export interface Region {
    OCE: Asia;
    CN: Asia;
    REGIONID: Asia;
    ASIA?: Asia;
}

export interface Asia {
    eventFlagsForcedOff: string[];
}

export interface CommunityVotes {
    states: CommunityVotesState[];
    cacheExpire: Date;
}

export interface CommunityVotesState {
    validFrom: Date;
    activeEvents: any[];
    state: TentacledState;
}

export interface TentacledState {
    electionId: string;
    candidates: any[];
    electionEnds: Date;
    numWinners: number;
}

export interface FeaturedIslands {
    states: FeaturedIslandsState[];
    cacheExpire: Date;
}

export interface FeaturedIslandsState {
    validFrom: Date;
    activeEvents: any[];
    state: StickyState;
}

export interface StickyState {
    islandCodes: any[];
    playlistCuratedContent: EventNamedWeights;
    playlistCuratedHub: PlaylistCuratedHub;
    islandTemplates: any[];
}

export interface PlaylistCuratedHub {
    Playlist_PlaygroundV2: string;
    Playlist_Creative_PlayOnly: string;
}

export interface StandaloneStore {
    states: StandaloneStoreState[];
    cacheExpire: Date;
}

export interface StandaloneStoreState {
    validFrom: Date;
    activeEvents: any[];
    state: IndigoState;
}

export interface IndigoState {
    activePurchaseLimitingEventIds: any[];
    storefront: EventNamedWeights;
    rmtPromotionConfig: any[];
    storeEnd: Date;
}

export interface Tk {
    states: TkState[];
    cacheExpire: Date;
}

export interface TkState {
    validFrom: Date;
    activeEvents: any[];
    state: IndecentState;
}

export interface IndecentState {
    k: string[];
}


export interface AllShopSectionsResponseObject {
    _title: string;
    sectionList: SectionList;
    _noIndex: boolean;
    _activeDate: Date;
    lastModified: Date;
    _locale: string;
    _templateName: string;
    _suggestedPrefetch: any[];
}

export interface SectionList {
    _type: string;
    sections: Section[];
}

export interface Section {
    bSortOffersByOwnership: boolean;
    bShowIneligibleOffersIfGiftable: boolean;
    bEnableToastNotification: boolean;
    background: Background;
    _type: SectionType;
    landingPriority?: number;
    bHidden: boolean;
    sectionId: string;
    bShowTimer: boolean;
    sectionDisplayName?: string;
    bShowIneligibleOffers: boolean;
}

export enum SectionType {
    ShopSection = "ShopSection",
}

export interface Background {
    stage: Stage;
    _type: BackgroundType;
    key: Key;
}

export enum BackgroundType {
    DynamicBackground = "DynamicBackground",
}

export enum Key {
    Vault = "vault",
}

export enum Stage {
    Default = "default",
}
