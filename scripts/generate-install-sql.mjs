import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supabaseDirectory = resolve(projectRoot, 'supabase');
const outputPath = resolve(supabaseDirectory, 'install_all.sql');
const checkOnly = process.argv.includes('--check');

const readSource = async (name) =>
  (await readFile(resolve(supabaseDirectory, name), 'utf8')).trimEnd();

const reset = await readSource('install_reset.sql');
const sections = await Promise.all(
  [
    ['schema.sql', 'schema.sql'],
    ['rls.sql', 'rls.sql'],
    ['functions.sql', 'functions.sql'],
    ['demo services', 'demo_services.sql'],
  ].map(async ([label, name]) =>
    `-- ==================== ${label} ====================\n${await readSource(name)}`
  )
);
const generated = `${[reset, ...sections].join('\n\n')}\n`;

if (checkOnly) {
  const current = await readFile(outputPath, 'utf8');
  if (current !== generated) {
    console.error('supabase/install_all.sql is stale. Run: npm run sql:generate');
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, generated);
  console.log('Generated supabase/install_all.sql');
}
