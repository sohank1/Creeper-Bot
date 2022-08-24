export interface CosmeticsResponse {
    status: number;
    data: Cosmetic[];
}

export type Cosmetics = Cosmetic[];

export interface Cosmetic {
    id: string;
    name: string;
    description: string;
    type: Rarity;
    rarity: Rarity;
    series: Series | null;
    set: Set | null;
    introduction: Introduction | null;
    images: Images;
    variants: Variant[] | null;
    searchTags: string[] | null;
    gameplayTags: string[] | null;
    metaTags: string[] | null;
    showcaseVideo: null | string;
    dynamicPakId: null | string;
    displayAssetPath: null | string;
    definitionPath: null | string;
    path: string;
    added: string;
    shopHistory: Date[] | null;
    itemPreviewHeroPath?: string;
    customExclusiveCallout?: string;
    exclusiveDescription?: string;
    unlockRequirements?: string;
    builtInEmoteIds?: string[];
}

export interface Images {
    smallIcon: null | string;
    icon: null | string;
    featured: null | string;
    other: Other | null;
}

export interface Other {
    background?: string;
    coverart?: string;
    decal?: string;
}

export interface Introduction {
    chapter: string;
    season: string;
    text: Text;
    backendValue: number;
}

export enum Text {
    IntroducedInChapter1Season1 = "Introduced in Chapter 1, Season 1.",
    IntroducedInChapter1Season2 = "Introduced in Chapter 1, Season 2.",
    IntroducedInChapter1Season3 = "Introduced in Chapter 1, Season 3.",
    IntroducedInChapter1Season4 = "Introduced in Chapter 1, Season 4.",
    IntroducedInChapter1Season5 = "Introduced in Chapter 1, Season 5.",
    IntroducedInChapter1Season6 = "Introduced in Chapter 1, Season 6.",
    IntroducedInChapter1Season7 = "Introduced in Chapter 1, Season 7.",
    IntroducedInChapter1Season8 = "Introduced in Chapter 1, Season 8.",
    IntroducedInChapter1Season9 = "Introduced in Chapter 1, Season 9.",
    IntroducedInChapter1SeasonX = "Introduced in Chapter 1, Season X.",
    IntroducedInChapter2Season1 = "Introduced in Chapter 2, Season 1.",
    IntroducedInChapter2Season2 = "Introduced in Chapter 2, Season 2.",
    IntroducedInChapter2Season3 = "Introduced in Chapter 2, Season 3.",
    IntroducedInChapter2Season4 = "Introduced in Chapter 2, Season 4.",
    IntroducedInChapter2Season5 = "Introduced in Chapter 2, Season 5.",
    IntroducedInChapter2Season6 = "Introduced in Chapter 2, Season 6.",
    IntroducedInChapter2Season7 = "Introduced in Chapter 2, Season 7.",
    IntroducedInChapter2Season8 = "Introduced in Chapter 2, Season 8.",
    IntroducedInChapter3Season1 = "Introduced in Chapter 3, Season 1.",
    IntroducedInChapter3Season2 = "Introduced in Chapter 3, Season 2.",
    IntroducedInChapter3Season3 = "Introduced in Chapter 3, Season 3.",
    IntroducedInChapter3Season5 = "Introduced in Chapter 3, Season 5.",
}

export interface Rarity {
    value: RarityValue;
    displayValue: DisplayValueEnum;
    backendValue: RarityBackendValue;
}

export enum RarityBackendValue {
    AthenaBackpack = "AthenaBackpack",
    AthenaCharacter = "AthenaCharacter",
    AthenaDance = "AthenaDance",
    AthenaEmoji = "AthenaEmoji",
    AthenaGlider = "AthenaGlider",
    AthenaItemWrap = "AthenaItemWrap",
    AthenaLoadingScreen = "AthenaLoadingScreen",
    AthenaMusicPack = "AthenaMusicPack",
    AthenaPet = "AthenaPet",
    AthenaPetCarrier = "AthenaPetCarrier",
    AthenaPickaxe = "AthenaPickaxe",
    AthenaSkyDiveContrail = "AthenaSkyDiveContrail",
    AthenaSpray = "AthenaSpray",
    AthenaToy = "AthenaToy",
    BannerToken = "BannerToken",
    EFortRarityCommon = "EFortRarity::Common",
    EFortRarityEpic = "EFortRarity::Epic",
    EFortRarityLegendary = "EFortRarity::Legendary",
    EFortRarityMythic = "EFortRarity::Mythic",
    EFortRarityRare = "EFortRarity::Rare",
    EFortRarityUnattainable = "EFortRarity::Unattainable",
    EFortRarityUncommon = "EFortRarity::Uncommon",
}

export enum DisplayValueEnum {
    AIIronManEmote = "AI Iron Man Emote",
    BackBling = "Back Bling",
    Banner = "Banner",
    BuiltInEmote = "Built-In Emote",
    Common = "Common",
    Contrail = "Contrail",
    DarkSeries = "DARK SERIES",
    DcSeries = "DC SERIES",
    Emote = "Emote",
    Emoticon = "Emoticon",
    Epic = "Epic",
    FrozenSeries = "Frozen Series",
    GamingLegendsSeries = "Gaming Legends Series",
    Glider = "Glider",
    HarvestingTool = "Harvesting Tool",
    IconSeries = "Icon Series",
    LavaSeries = "Lava Series",
    Legendary = "Legendary",
    LoadingScreen = "Loading Screen",
    MarvelSeries = "MARVEL SERIES",
    Music = "Music",
    MusicPack = "Music Pack",
    Mythic = "Mythic",
    NoBackBling = "No Back Bling",
    Null = "null",
    Outfit = "Outfit",
    Pet = "PET",
    Rare = "Rare",
    ShadowSeries = "Shadow Series",
    SlurpSeries = "Slurp Series",
    Social = "Social",
    Spray = "Spray",
    StarWarsSeries = "Star Wars Series",
    TestSpray = "Test Spray",
    Toy = "Toy",
    Unattainable = "Unattainable",
    Uncommon = "Uncommon",
    ValueBuiltInEmote = "Built-in Emote",
    ValuePet = "Pet",
    Wrap = "Wrap",
}

export enum RarityValue {
    Backpack = "backpack",
    Banner = "banner",
    Common = "common",
    Contrail = "contrail",
    Dark = "dark",
    Dc = "dc",
    Emoji = "emoji",
    Emote = "emote",
    Epic = "epic",
    Frozen = "frozen",
    Gaminglegends = "gaminglegends",
    Glider = "glider",
    Icon = "icon",
    Lava = "lava",
    Legendary = "legendary",
    Loadingscreen = "loadingscreen",
    Marvel = "marvel",
    Music = "music",
    Mythic = "mythic",
    Outfit = "outfit",
    Pet = "pet",
    Petcarrier = "petcarrier",
    Pickaxe = "pickaxe",
    Rare = "rare",
    Shadow = "shadow",
    Slurp = "slurp",
    Spray = "spray",
    Starwars = "starwars",
    Toy = "toy",
    Uncommon = "uncommon",
    Wrap = "wrap",
}

export interface Series {
    value: DisplayValueEnum;
    image: null | string;
    colors: Color[];
    backendValue: SeriesBackendValue;
}

export enum SeriesBackendValue {
    CUBESeries = "CUBESeries",
    ColumbusSeries = "ColumbusSeries",
    CreatorCollabSeries = "CreatorCollabSeries",
    DCUSeries = "DCUSeries",
    FrozenSeries = "FrozenSeries",
    LavaSeries = "LavaSeries",
    MarvelSeries = "MarvelSeries",
    PlatformSeries = "PlatformSeries",
    ShadowSeries = "ShadowSeries",
    SlurpSeries = "SlurpSeries",
}

export enum Color {
    A500A8Ff = "a500a8ff",
    B30102Ff = "b30102ff",
    Ce00Aeff = "ce00aeff",
    D60203Ff = "d60203ff",
    D8Edffff = "d8edffff",
    Dc240Fff = "dc240fff",
    Ed1C24Ff = "ed1c24ff",
    Face36Ff = "face36ff",
    Ff4Fc5Ff = "ff4fc5ff",
    Ffd800Ff = "ffd800ff",
    Ffffffff = "ffffffff",
    The000F2Bff = "000f2bff",
    The001F47Ff = "001f47ff",
    The003169Ff = "003169ff",
    The003F82Ff = "003f82ff",
    The004C71Ff = "004c71ff",
    The0053A9Ff = "0053a9ff",
    The0059Edff = "0059edff",
    The007Af1Ff = "007af1ff",
    The009Bd4Ff = "009bd4ff",
    The00C3F1Ff = "00c3f1ff",
    The025253Ff = "025253ff",
    The040A14Ff = "040a14ff",
    The050500Ff = "050500ff",
    The0A1833Ff = "0a1833ff",
    The0D0027Ff = "0d0027ff",
    The171717Ff = "171717ff",
    The1B91Ffff = "1b91ffff",
    The1C8Bdaff = "1c8bdaff",
    The1Df9F7Ff = "1df9f7ff",
    The2555B2Ff = "2555b2ff",
    The280102Ff = "280102ff",
    The28085Fff = "28085fff",
    The2Bc9Caff = "2bc9caff",
    The37Daadff = "37daadff",
    The392038Ff = "392038ff",
    The3E1398Ff = "3e1398ff",
    The3F0043Ff = "3f0043ff",
    The4A4A4Aff = "4a4a4aff",
    The5328D6Ff = "5328d6ff",
    The5Cf2F3Ff = "5cf2f3ff",
    The5D005EFF = "5d005eff",
    The5E197Bff = "5e197bff",
    The610709Ff = "610709ff",
    The8078Ffff = "8078ffff",
    The86Ddffff = "86ddffff",
    The999999Ff = "999999ff",
    The9A0035Ff = "9a0035ff",
}

export interface Set {
    value: null | string;
    text: null | string;
    backendValue: string;
}

export interface Variant {
    channel: Channel
    type: null | string;
    options: Option[];
}

export enum Channel {
    ClothingColor = "ClothingColor",
    Emissive = "Emissive",
    Hair = "Hair",
    JerseyColor = "JerseyColor",
    Material = "Material",
    Mesh = "Mesh",
    Numeric = "Numeric",
    Particle = "Particle",
    Parts = "Parts",
    Pattern = "Pattern",
    PetTemperament = "PetTemperament",
    ProfileBanner = "ProfileBanner",
    Progressive = "Progressive",
}

export interface Option {
    tag: string;
    name: null | string;
    image: string;
    unlockRequirements?: string;
}
