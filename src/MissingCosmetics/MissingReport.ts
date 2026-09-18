import { MissingCosmeticImageItem } from "./MissingCosmeticsImage";

export interface MissingReport {
    date: string;
    description: string;
    items: MissingCosmeticImageItem[];
}

export const todayUTC = () => new Date().toISOString().slice(0, 10);
export const validMinimumDays = (value: number) => Number.isInteger(value) && value >= 1 && value <= 100000;
export const filteredItems = (report: MissingReport, minimum: number) => report.items.filter(item => item.daysMissing >= minimum);
export const reportDescription = (items: MissingCosmeticImageItem[]) => items.map(item => `${item.name} (${item.type}): ${item.daysMissing} days away · last seen ${item.lastSeenLabel}`).join("\n");
export function validReportDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
        && value >= "2017-01-01" && value <= todayUTC();
}
export function shiftDate(value: string, days: number): string {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
