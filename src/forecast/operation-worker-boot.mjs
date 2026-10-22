// Worker thread entry for the operation forecast pool: the sources are TypeScript, so load them through tsx.
import { tsImport } from 'tsx/esm/api';

await tsImport('./operation-worker.ts', import.meta.url);
