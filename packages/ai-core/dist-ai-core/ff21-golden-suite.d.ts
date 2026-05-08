/**
 * Purpose: Build the FF-21 executable golden scenario proof matrix from tracked scenario artifacts.
 */
export type Ff21GoldenProofType = 'browser-runtime' | 'product-runtime' | 'cli' | 'contract' | 'trace-replay' | 'load';
export type Ff21GoldenScenarioStatus = 'proven' | 'blocked';
export type Ff21GoldenScenario = {
    id: string;
    title: string;
    proofType: Ff21GoldenProofType;
    command: string;
    evidencePath: string;
    status: Ff21GoldenScenarioStatus;
    releaseLabel: 'release' | 'slow';
    notes: string;
};
export type Ff21GoldenSuite = {
    status: 'complete' | 'incomplete';
    scenarios: Ff21GoldenScenario[];
};
export declare function buildFf21GoldenSuite(): Ff21GoldenSuite;
//# sourceMappingURL=ff21-golden-suite.d.ts.map