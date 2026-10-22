// Worker thread entry for the ensemble's outputs pool: the sources are TypeScript, so load them through tsx.
import { tsImport } from 'tsx/esm/api';

await tsImport('./outputs-worker.ts', import.meta.url);
