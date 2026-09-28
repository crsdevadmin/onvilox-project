// Guard-rail: no source file in the modular code may exceed MAX lines.
// Oncology became hard to change because single pages grew to 3,000–8,600
// lines. This check runs before every build and fails it if that starts again.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const MAX = 400;
const ROOTS = ['src', '../server/core', '../server/modules'];
const EXT = /\.(tsx?|jsx?|mjs|cjs|css)$/;
const bad = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.test(name)) {
      const lines = readFileSync(p, 'utf8').split('\n').length;
      if (lines > MAX) bad.push(`${relative('.', p)}: ${lines} lines`);
    }
  }
}
ROOTS.forEach(walk);
if (bad.length) {
  console.error(`Files over ${MAX} lines — split them into smaller components/modules:\n  ` + bad.join('\n  '));
  process.exit(1);
}
console.log(`size check ok (every file ≤ ${MAX} lines)`);
