// src/lib/pancocosDb.ts
// Conexión a la base de datos de Pancocos (BD `pancocos`), distinta de la BD propia del analizador.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

let pancocosPool: pg.Pool | null = null;

function resolvePancocosConnectionString(): string | undefined {
  let url = process.env.PANCOCOS_DATABASE_URL;

  if (!url) {
    try {
      const envPath = path.resolve(__dirname, '..', '..', '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const match = content.match(/^PANCOCOS_DATABASE_URL=["']?([^"'\r\n]+)["']?/m);
        if (match && match[1]) {
          url = match[1].trim();
        }
      }
    } catch {
      // Se ignora: si no hay URL se informa más abajo con un error claro.
    }
  }

  return url ? url.replace(/^["']|["']$/g, '').trim() : undefined;
}

export function getPancocosPool(): pg.Pool {
  if (pancocosPool) return pancocosPool;

  const connectionString = resolvePancocosConnectionString();
  if (!connectionString) {
    throw new Error(
      'PANCOCOS_DATABASE_URL no está configurada. Define la conexión a la base de datos de Pancocos en .env.',
    );
  }

  const isLocal = connectionString.includes('127.0.0.1') || connectionString.includes('localhost');

  pancocosPool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' && !isLocal ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pancocosPool.on('error', (err) => {
    console.warn('[Pancocos PostgreSQL Pool Warning]', err.message);
  });

  return pancocosPool;
}

