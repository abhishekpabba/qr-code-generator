import pg from 'pg';
const { Pool } = pg;
let pool;
export function getPool(){
  if(!process.env.DATABASE_URL) throw Object.assign(new Error('DATABASE_URL is not configured'),{status:503});
  if(!pool) pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:false}});
  return pool;
}
export async function ensureSchema(){
  const db=getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id UUID PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Dynamic QR',
      payload TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'url',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS qr_codes_owner_idx ON qr_codes(owner_id);
    CREATE TABLE IF NOT EXISTS qr_scans (
      id UUID PRIMARY KEY,
      code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      device TEXT,
      os TEXT,
      referrer TEXT,
      ip_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS qr_scans_code_idx ON qr_scans(code_id);
    CREATE INDEX IF NOT EXISTS qr_scans_at_idx ON qr_scans(at);
  `);
}
export function ownerFrom(req){return String(req.headers['x-qr-owner']||'').trim().slice(0,120)}
export function json(res,status,data){res.status(status).setHeader('Content-Type','application/json');res.end(JSON.stringify(data))}
