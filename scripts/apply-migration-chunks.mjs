/**
 * Split migration chunks into smaller SQL files for MCP apply_migration.
 * Run: node scripts/apply-migration-chunks.mjs
 */
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dir, 'mig-parts');
fs.mkdirSync(outDir, { recursive: true });

const chunks = [
  { file: '01_extensions_enums_functions.sql', skipUntil: '-- 3. HELPER FUNCTIONS' },
  { file: '02_tables.sql' },
  { file: '03_indexes.sql' },
  { file: '04_triggers_rls_enable.sql' },
  { file: '05_rls_policies.sql' },
  { file: '06_grants.sql' },
  { file: '07_storage_seed.sql' },
];

let partNum = 0;
for (const { file, skipUntil } of chunks) {
  let sql = fs.readFileSync(resolve(__dir, 'mig-chunks', file), 'utf8');
  if (skipUntil) {
    const i = sql.indexOf(skipUntil);
    if (i >= 0) sql = sql.slice(i);
  }
  // Split large chunks by statement boundaries (max ~12k per part)
  const maxLen = 12000;
  if (sql.length <= maxLen) {
    const name = `${String(++partNum).padStart(2, '0')}_${file.replace('.sql', '')}.sql`;
    fs.writeFileSync(resolve(outDir, name), sql);
    console.log(name, sql.length);
    continue;
  }
  const statements = sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  let buf = '';
  for (const stmt of statements) {
    const piece = stmt + ';\n';
    if (buf.length + piece.length > maxLen && buf.length > 0) {
      const name = `${String(++partNum).padStart(2, '0')}_${file.replace('.sql', '')}_part.sql`;
      fs.writeFileSync(resolve(outDir, name), buf);
      console.log(name, buf.length);
      buf = '';
    }
    buf += piece;
  }
  if (buf.trim()) {
    const name = `${String(++partNum).padStart(2, '0')}_${file.replace('.sql', '')}_part.sql`;
    fs.writeFileSync(resolve(outDir, name), buf);
    console.log(name, buf.length);
  }
}

console.log('Parts written to', outDir);
