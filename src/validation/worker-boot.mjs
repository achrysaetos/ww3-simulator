// Worker thread entry for the validation pool: the sources are TypeScript, so load them through tsx.
import { tsImport } from 'tsx/esm/api';

await tsImport('./worker.ts', import.meta.url);
