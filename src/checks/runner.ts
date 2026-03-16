import {CheckResult, Layer, Session} from '../types.js';
import type {EnvConfig} from '../config/types.js';

// ─── Check contract ───────────────────────────────────────────────────────────

export type CheckFn = (
    env: EnvConfig,
    session: Session | null,
) => Promise<CheckResult>;

export type CheckUpdate = {
    layer: Layer;
    result: CheckResult;
};

/** Execution blocks: each inner array runs in parallel; blocks run serially. */
const LAYER_BLOCKS = [
    ['auth'],
    ['akamai', 'ping'],
    ['page'],
] as const satisfies readonly (readonly Layer[])[];

/** Order of execution of layer checks */
export const SWEEP_ORDER: Layer[] = LAYER_BLOCKS.flat();

// ─── Runner ───────────────────────────────────────────────────────────────────

/**
 * Determine if the sweep sould be continued based on previous results
 *
 * @param results - to verify is healthy or skipped
 * @return true sweep should continue; false otherwirse
 */
function isContinueSweep(results: CheckResult[]): boolean {
    return results.every(r => r.status !== 'failing' && r.status !== 'skipped');
}

/**
 * Sweep the layers in order, returning results as they come in. If any layer fails, subsequent layers are skipped.
 *
 * @param env - environment config to use for checks
 * @param session - current browser session
 * @param onUpdate - callback for when a layer check has finished its checkout
 * @param onRunning - callback for when a layer check starts running, useful for showing "running…" messages in the UI
 * @returns all accumulated results after running through the layers (including skipped layers if any)
 */
export async function runSweep(
    env: EnvConfig,
    session: Session | null,
    onUpdate: (update: CheckUpdate) => void,
    onRunning?: (layer: Layer) => void,
): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const {runAuthCheck} = await import('./auth.js');
    const {runAkamaiCheck} = await import('./akamai.js');
    const {runPingCheck} = await import('./ping.js');
    const {runPageCheck} = await import('./page.js');
    const layerChecks: Record<Layer, CheckFn> = {
        auth: runAuthCheck,
        akamai: runAkamaiCheck,
        ping: runPingCheck,
        page: runPageCheck,
    };

    for (const layerStage of LAYER_BLOCKS) {
        if (!isContinueSweep(results)) break;

        layerStage.forEach((layer) => onRunning?.(layer));
        const stageResults = await Promise.all(
            layerStage.map((layer) =>
                layerChecks[layer](env, session).then((r) => {
                    onUpdate({layer: r.layer, result: r});
                    return r;
                }),
            ),
        );
        results.push(...stageResults);
    }
    return results;
}
