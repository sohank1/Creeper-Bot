type JobEntry = {
    id: string;
    name: string;
    schedule: string;
    enabled: boolean;
    runCount: number;
    successCount: number;
    failureCount: number;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
};

const components = new Map<string, unknown>();
const jobs = new Map<string, JobEntry>();

function upsertJob(id: string, name: string, schedule: string, enabled = true) {
    const existing = jobs.get(id);
    if (existing) {
        existing.name = name;
        existing.schedule = schedule;
        existing.enabled = enabled;
        return existing;
    }

    const created: JobEntry = {
        id,
        name,
        schedule,
        enabled,
        runCount: 0,
        successCount: 0,
        failureCount: 0,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastSuccessAt: null,
        lastError: null,
    };
    jobs.set(id, created);
    return created;
}

export function registerComponent<T>(id: string, component: T): T {
    components.set(id, component);
    return component;
}

export function getComponent<T = any>(id: string): T | undefined {
    return components.get(id) as T | undefined;
}

export function getRegisteredComponentIds() {
    return [...components.keys()].sort();
}

export function getRegisteredJobs() {
    return [...jobs.values()];
}

export function createTrackedJob<T extends any[], R>(
    id: string,
    name: string,
    schedule: string,
    handler: (...args: T) => Promise<R> | R,
): (...args: T) => Promise<R> {
    upsertJob(id, name, schedule, true);

    return async (...args: T): Promise<R> => {
        const job = upsertJob(id, name, schedule, true);
        job.runCount++;
        job.lastStartedAt = new Date().toISOString();

        try {
            const result = await handler(...args);
            job.successCount++;
            job.lastSuccessAt = new Date().toISOString();
            job.lastError = null;
            return result;
        } catch (error: any) {
            job.failureCount++;
            job.lastError = error?.message || String(error);
            throw error;
        } finally {
            job.lastFinishedAt = new Date().toISOString();
        }
    };
}
