export interface ShopSectionsResponseObject {
    status: number;
    data: ShopSectionsData;
}

export interface ShopSectionsData {
    hash: string;
    updated: string;
    date: string;
    sections: ShopSection[];
}

interface ShopSection {
    id: string;
    name: string;
    quantity: number;
    sections: SectionSection[];
}

interface SectionSection {
    id: string;
    name: null | string;
    index: number;
    hidden: boolean;
    showTimer: boolean;
    landingPriority: number;
    showIneligibleOffers: boolean;
    sortOffersByOwnership: boolean;
    enableToastNotification: boolean;
    showIneligibleOffersIfGiftable: boolean;
}
