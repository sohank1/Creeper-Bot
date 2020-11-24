export interface Motd {
    id: string;
    title: string;
    tabTitle: string;
    body: string;
    image: string;
    tileImage: string;
    sortingPriority: number;
    hidden: boolean;
}

export interface Message {
    title: string;
    body: string;
    image: string;
    adspace?: any;
}

export interface Br {
    hash: string;
    date: Date;
    image: string;
    motds: Motd[];
    messages: Message[];
}

export interface Message2 {
    title: string;
    body: string;
    image: string;
    adspace: string;
}

export interface Stw {
    hash: string;
    date: Date;
    image?: any;
    motds?: any;
    messages: Message2[];
}

export interface Motd2 {
    id: string;
    title: string;
    tabTitle: string;
    body: string;
    image: string;
    tileImage: string;
    sortingPriority: number;
    hidden: boolean;
}

export interface Message3 {
    title: string;
    body: string;
    image: string;
    adspace?: any;
}

export interface Creative {
    hash: string;
    date: Date;
    image: string;
    motds: Motd2[];
    messages: Message3[];
}

export interface Data {
    br: Br;
    stw: Stw;
    creative: Creative;
}

export interface NewsResponseObject {
    status: number;
    data: Data;
}
