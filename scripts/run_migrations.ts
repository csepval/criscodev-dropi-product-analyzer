// scripts/run_migrations.ts
// Ejecutor de migraciones SQL para criscodev-dropi-product-analyzer
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, isDatabaseAvailable } from '../src/lib/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('=== Ejecutando migraciones SQL de Dropi Product Analyzer ===');
  const dbOk = await isDatabaseAvailable();
  if (!dbOk) {
    console.warn('[Aviso] PostgreSQL no está disponible en este momento.');
    console.warn('[Aviso] El proyecto continuará operando en modo almacenamiento local JSON resiliente (src/data/).');
    process.exit(0);
  }

  const migrationsDir = path.resolve(__dirname, '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error('Error: No se encontró la carpeta de migraciones en:', migrationsDir);
    process.exit(1);
  }

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf-8');
    console.log(`Aplicando ${file}...`);
    await query(sql);
    console.log(`✓ ${file} aplicado correctamente.`);
  }

  console.log('✓ Todas las migraciones completadas exitosamente en PostgreSQL.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error ejecutando migración:', err);
  process.exit(1);
});
