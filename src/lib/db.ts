// src/lib/db.ts
// Conector seguro para PostgreSQL independiente con soporte para fallback
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

let pool: pg.Pool | null = null;
let lastDbCheck = 0;
let lastDbStatus = false;

function resolveConnectionString(): string | undefined {
  let url = process.env.DATABASE_URL;

  // Cargar .env de la raíz del proyecto si no está cargado
  if (!url) {
    try {
      const envPath = path.resolve(__dirname, '..', '..', '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const match = content.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
        if (match && match[1]) {
          url = match[1].trim();
        }
      }
    } catch {
      // Ignorar error de lectura
    }
  }

  if (url) {
    return url.replace(/^["']|["']$/g, '').trim();
  }

  if (process.env.POSTGRES_HOST) {
    return `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'criscodev'}`;
  }

  return undefined;
}

export function getPool(): pg.Pool | null {
  if (pool) return pool;

  const connectionString = resolveConnectionString();
  if (!connectionString) return null;

  try {
    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' && !connectionString.includes('127.0.0.1') && !connectionString.includes('localhost')
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.warn('[PostgreSQL Pool Warning]', err.message);
    });

    return pool;
  } catch {
    pool = null;
    return null;
  }
}

export async function query<T extends pg.QueryResultRow = any>(text: string, params: any[] = []): Promise<pg.QueryResult<T>> {
  const activePool = getPool();
  if (!activePool) {
    throw new Error('DATABASE_NOT_CONFIGURED: No hay conexión a PostgreSQL configurada.');
  }

  const client = await activePool.connect();
  try {
    const res = await client.query<T>(text, params);
    return res;
  } finally {
    client.release();
  }
}

export async function isDatabaseAvailable(): Promise<boolean> {
  const now = Date.now();
  if (now - lastDbCheck < 15000) {
    return lastDbStatus;
  }
  lastDbCheck = now;
  const activePool = getPool();
  if (!activePool) {
    lastDbStatus = false;
    return false;
  }
  try {
    const res = await activePool.query('SELECT 1 as test');
    lastDbStatus = res.rows.length > 0;
    return lastDbStatus;
  } catch {
    lastDbStatus = false;
    return false;
  }
}
