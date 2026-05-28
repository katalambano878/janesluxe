/**
 * Prints migration parts as JSON array for batch MCP apply_migration.
 * Usage: node scripts/apply-mig-parts-via-mcp.mjs > scripts/mig-parts-manifest.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dir, 'mig-parts');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const manifest = files.map((f) => ({
  name: f.replace('.sql', '').replace(/^\d+_/, ''),
  file: f,
  query: fs.readFileSync(path.join(dir, f), 'utf8'),
}));
fs.writeFileSync(
  path.join(__dir, 'mig-parts-manifest.json'),
  JSON.stringify(manifest)
);
console.log('Wrote', manifest.length, 'parts to scripts/mig-parts-manifest.json');
