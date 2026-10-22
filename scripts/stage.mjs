// Copy the static site (index.html, src/, data/) into dist/ for deployment,
// leaving out dev-only files like scripts/ and package.json.
//
// Usage: node scripts/stage.mjs [outDir]

import { cp, rm } from 'node:fs/promises';

const outDir = process.argv[2] ?? 'dist';
const files = ['index.html', 'src', 'data'];

await rm(outDir, { recursive: true, force: true });
for (const f of files) await cp(f, `${outDir}/${f}`, { recursive: true });
console.log(`staged ${files.join(', ')} -> ${outDir}/`);
