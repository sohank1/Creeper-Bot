export interface CombinedItemShopResponseObject {
  status: number
  data: CombinedItemShopData
}

interface CombinedItemShopData {
  hash: string
  date: string
  vbuckIcon: string
  featured: Featured
  daily: Daily
  votes: any
  voteWinners: any
}

interface Featured {
  name: string
  entries: Entry[]
}

export interface Entry {
  regularPrice: number
  finalPrice: number
  bundle?: Bundle
  banner?: Banner
  giftable: boolean
  refundable: boolean
  sortPriority: number
  categories: string[]
  sectionId: string
  section: Section
  devName: string
  offerId: string
  displayAssetPath?: string
  tileSize: string
  newDisplayAssetPath?: string
  newDisplayAsset?: NewDisplayAsset
  items: Item[]
}

interface Bundle {
  name: string
  info: string
  image: string
}

interface Banner {
  value: string
  intensity: string
  backendValue: string
}

interface Section {
  id: string
  name: string
  index: number
  landingPriority: number
  sortOffersByOwnership: boolean
  showIneligibleOffers: boolean
  showIneligibleOffersIfGiftable: boolean
  showTimer: boolean
  enableToastNotification: boolean
  hidden: boolean
}

interface NewDisplayAsset {
  id: string
  cosmeticId?: string
  materialInstances: MaterialInstance[]
}

interface MaterialInstance {
  id: string
  images: Images
  colors: Colors
  scalings: Scalings
  flags: any
}

interface Images {
  OfferImage: string
  Background: string
  FNMTexture?: string
}

interface Colors {
  Background_Color_A: string
  Background_Color_B: string
  FallOff_Color?: string
  MF_RadialCoordinates?: string
  ColorCircuitBackground?: string
  ColorCircuitBackground2?: string
  RGB3?: string
  RGB4?: string
  RGB5?: string
  TextilePanSpeed?: string
  TextilePerspective?: string
  TextileScale?: string
}

interface Scalings {
  Gradient_Hardness?: number
  Gradient_Position_X: number
  Gradient_Position_Y: number
  Gradient_Size: number
  Spotlight_Intensity?: number
  Spotlight_Position_X?: number
  Spotlight_Position_Y?: number
  Spotlight_Size?: number
  FallOffColor_Fill_Percent?: number
  FallOffColor_Postion?: number
  OffsetImage_X: number
  OffsetImage_Y: number
  OffsetImage_Y_Compensation?: number
  Scale_Compensation?: number
  ZoomImage_Percent: number
  RefractionDepthBias: number
  "Background-Balance"?: number
  "Vignette Density"?: number
  "Vignette Radius"?: number
  "Vignette-Strength"?: number
  ContrastBackground2?: number
  Falloff?: number
  Intensity?: number
  RadialDensity_02?: number
  RadialRadius_02?: number
  Subtract?: number
  Vignette_G_Position_Y?: number
  Vignette_G_Power?: number
  Vignette_G_Radius?: number
  Vignette_G_Scale_X?: number
  Vignette_R_Power?: number
  Vignette_R_Radius?: number
  Vignette_R_Scale_Y?: number
  GradientAngle?: number
  GradientScale?: number
  FallOffColor_DecayRate?: number
  "Density-Enhanced"?: number
  "Effect-Bump-Multiply"?: number
  "Effect-Time-Factor"?: number
  "Radius-Enhanced"?: number
  "Sine Offset"?: number
  "Streak Angle"?: number
  "Streak Power Angle"?: number
  "Streak-G-Multiply-Max"?: number
  "Streak-G-Multiply-Min"?: number
  "Streak-G-Power-Max"?: number
  "Streak-G-Power_Min"?: number
  "Streak-G-U-Offset"?: number
  "Streak-G-U-Tile"?: number
  "Streak-G-V-Offset"?: number
  "Streak-G-V-Tile"?: number
  "Streak-R-Multiply-Max"?: number
  "Streak-R-Multiply-Min"?: number
  "Streak-R-Power-Max"?: number
  "Streak-R-Power-Min"?: number
  "Streak-R-U-Offset"?: number
  "Streak-R-U-Tile"?: number
  "Streak-R-V-Offset"?: number
  "Streak-R-V-Tile"?: number
  Darken?: number
  TextileInvertAngle?: number
  TextilePatternRepeat?: number
  "Density-Smoke"?: number
  "Radius-Smoke"?: number
  "Smoke-Intensity"?: number
  "Smoke-Offset-X"?: number
  "Smoke-Offset-Y"?: number
  "Suit Scale"?: number
  Spotlight_Hardness?: number
}

interface Item {
  id: string
  name: string
  description: string
  type: Type
  rarity: Rarity
  series?: Series
  set?: Set
  introduction: Introduction
  images: Images2
  variants?: Variant[]
  searchTags: any
  gameplayTags: string[]
  metaTags?: string[]
  showcaseVideo?: string
  dynamicPakId: any
  displayAssetPath?: string
  definitionPath?: string
  path: string
  added: string
  shopHistory: string[]
  itemPreviewHeroPath?: string
  builtInEmoteIds?: string[]
}

interface Type {
  value: string
  displayValue: string
  backendValue: string
}

interface Rarity {
  value: string
  displayValue: string
  backendValue: string
}

interface Series {
  value: string
  image: string
  colors: string[]
  backendValue: string
}

interface Set {
  value: string
  text: string
  backendValue: string
}

interface Introduction {
  chapter: string
  season: string
  text: string
  backendValue: number
}

interface Images2 {
  smallIcon: string
  icon: string
  featured?: string
  other?: Other
}

interface Other {
  coverart: string
}

interface Variant {
  channel: string
  type: string
  options: Option[]
}

interface Option {
  tag: string
  name: string
  image: string
}

interface Daily {
  name: string
  entries: Entry2[]
}

interface Entry2 {
  regularPrice: number
  finalPrice: number
  bundle: any
  banner: any
  giftable: boolean
  refundable: boolean
  sortPriority: number
  categories: string[]
  sectionId: string
  section: Section2
  devName: string
  offerId: string
  displayAssetPath?: string
  tileSize: string
  newDisplayAssetPath: string
  newDisplayAsset: NewDisplayAsset2
  items: Item2[]
}

interface Section2 {
  id: string
  name: string
  index: number
  landingPriority: number
  sortOffersByOwnership: boolean
  showIneligibleOffers: boolean
  showIneligibleOffersIfGiftable: boolean
  showTimer: boolean
  enableToastNotification: boolean
  hidden: boolean
}

interface NewDisplayAsset2 {
  id: string
  cosmeticId: string
  materialInstances: MaterialInstance2[]
}

interface MaterialInstance2 {
  id: string
  images: Images3
  colors: Colors2
  scalings: Scalings2
  flags: any
}

interface Images3 {
  OfferImage: string
  Background: string
}

interface Colors2 {
  Background_Color_B: string
  FallOff_Color: string
  Background_Color_A: string
}

interface Scalings2 {
  Gradient_Position_X: number
  Gradient_Position_Y: number
  Gradient_Size: number
  FallOffColor_Fill_Percent: number
  FallOffColor_Postion: number
  OffsetImage_X: number
  OffsetImage_Y: number
  ZoomImage_Percent: number
  RefractionDepthBias: number
  Gradient_Hardness?: number
  Spotlight_Hardness?: number
  Spotlight_Intensity?: number
  Spotlight_Position_X?: number
  Spotlight_Position_Y?: number
  Spotlight_Size?: number
  OffsetImage_Y_Compensation?: number
  Scale_Compensation?: number
}

interface Item2 {
  id: string
  name: string
  description: string
  type: Type2
  rarity: Rarity2
  series?: Series2
  set?: Set2
  introduction: Introduction2
  images: Images4
  variants: any
  searchTags: any
  gameplayTags: string[]
  metaTags: any
  showcaseVideo: string
  dynamicPakId: any
  displayAssetPath?: string
  definitionPath?: string
  path: string
  added: string
  shopHistory: string[]
  itemPreviewHeroPath?: string
}

interface Type2 {
  value: string
  displayValue: string
  backendValue: string
}

interface Rarity2 {
  value: string
  displayValue: string
  backendValue: string
}

interface Series2 {
  value: string
  image: any
  colors: string[]
  backendValue: string
}

interface Set2 {
  value: string
  text: string
  backendValue: string
}

interface Introduction2 {
  chapter: string
  season: string
  text: string
  backendValue: number
}

interface Images4 {
  smallIcon: string
  icon: string
  featured?: string
  other: any
}
