// TESTING.md 6.4 : budget de poids de la charge initiale, bloquant.
// Somme les octets gzip du JS et du CSS references par dist/index.html
// (script, modulepreload, feuilles de style) ; les vues chargees a la
// demande n'y comptent pas.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const DIST = path.resolve(process.argv[2] ?? 'dist');
const BUDGET_BYTES = { js: 200 * 1000, css: 30 * 1000 };

const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map(
  (match) => match[1],
);

const totals = { js: 0, css: 0 };
for (const reference of references) {
  const kind = reference.endsWith('.css') ? 'css' : 'js';
  totals[kind] += gzipSync(readFileSync(path.join(DIST, reference))).length;
}

let failed = false;
for (const kind of ['js', 'css']) {
  const used = totals[kind];
  const limit = BUDGET_BYTES[kind];
  const verdict = used <= limit ? 'ok' : 'DEPASSE';
  console.log(
    `budget ${kind.toUpperCase()} initial : ${(used / 1000).toFixed(1)} ko gzip sur ${limit / 1000} ko (${verdict})`,
  );
  failed ||= used > limit;
}
process.exit(failed ? 1 : 0);
