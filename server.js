import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const DATA = path.join(__dirname, 'data', 'db.json');
const UPLOADS = path.join(__dirname, 'uploads');
const VIEWS = path.join(__dirname, 'views');
const PUBLIC = path.join(__dirname, 'public');

const hasPostgres = !!process.env.DATABASE_URL;
const pool = hasPostgres ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false } }) : null;
let schemaReady = false;

if (!hasPostgres && !isProd) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.mkdirSync(UPLOADS, { recursive: true });
  if (!fs.existsSync(DATA)) fs.writeFileSync(DATA, JSON.stringify({ codes: [], scans: [], folders: [] }, null, 2));
}

async function ensureSchema() {
  if (!pool || schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id UUID PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      mode TEXT NOT NULL,
      payload TEXT NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      design JSONB NOT NULL DEFAULT '{}'::jsonb,
      folder TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      owner_id TEXT NOT NULL DEFAULT 'legacy'
    );
    ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'legacy';
    CREATE TABLE IF NOT EXISTS qr_scans (
      id UUID PRIMARY KEY,
      code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      device TEXT,
      os TEXT,
      ip_hash TEXT,
      referrer TEXT
    );
    CREATE INDEX IF NOT EXISTS qr_scans_code_id_idx ON qr_scans(code_id);
    CREATE INDEX IF NOT EXISTS qr_scans_at_idx ON qr_scans(at);
    CREATE TABLE IF NOT EXISTS contact_messages (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  schemaReady = true;
}

const fileDb = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const saveFileDb = (x) => fs.writeFileSync(DATA, JSON.stringify(x, null, 2));
const normalizeCode = (r) => ({
  id: r.id, slug: r.slug, name: r.name, type: r.type, mode: r.mode, payload: r.payload,
  meta: r.meta || {}, design: r.design || {}, folder: r.folder || '', status: r.status,
  createdAt: new Date(r.created_at || r.createdAt).toISOString(), updatedAt: new Date(r.updated_at || r.updatedAt).toISOString(), ownerId: r.owner_id || r.ownerId || 'legacy'
});
const normalizeScan = (r) => ({
  id: r.id, codeId: r.code_id || r.codeId, at: new Date(r.at).toISOString(), device: r.device, os: r.os,
  ipHash: r.ip_hash || r.ipHash, referrer: r.referrer || ''
});

async function listCodes(ownerId) {
  if (pool) { await ensureSchema(); return (await pool.query('SELECT * FROM qr_codes WHERE owner_id=$1 ORDER BY updated_at DESC',[ownerId])).rows.map(normalizeCode); }
  if (isProd) return [];
  return fileDb().codes.filter(c=>(c.ownerId||'legacy')===ownerId).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
}
async function createCode(body, ownerId) {
  const now = new Date().toISOString();
  const code = { id: crypto.randomUUID(), slug: crypto.randomBytes(5).toString('hex'), name: body.name || 'Untitled QR', type: body.type || 'url', mode: body.mode || 'dynamic', payload: body.payload || '', meta: body.meta || {}, design: body.design || {}, folder: body.folder || '', status: 'active', createdAt: now, updatedAt: now, ownerId };
  if (pool) {
    await ensureSchema();
    const q = await pool.query(`INSERT INTO qr_codes (id,slug,name,type,mode,payload,meta,design,folder,status,created_at,updated_at,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [code.id,code.slug,code.name,code.type,code.mode,code.payload,code.meta,code.design,code.folder,code.status,now,now,ownerId]);
    return normalizeCode(q.rows[0]);
  }
  if (isProd) throw Object.assign(new Error('Production dynamic QR storage is not configured. Add DATABASE_URL.'),{status:503});
  const x=fileDb(); x.codes.push(code); saveFileDb(x); return code;
}
async function updateCode(id, body, ownerId) {
  if (pool) {
    await ensureSchema();
    const old = (await pool.query('SELECT * FROM qr_codes WHERE id=$1 AND owner_id=$2',[id,ownerId])).rows[0];
    if (!old) return null;
    const c = { ...normalizeCode(old), ...body, id: old.id, slug: old.slug, updatedAt: new Date().toISOString() };
    const q=await pool.query(`UPDATE qr_codes SET name=$2,type=$3,mode=$4,payload=$5,meta=$6,design=$7,folder=$8,status=$9,updated_at=$10 WHERE id=$1 AND owner_id=$11 RETURNING *`,[id,c.name,c.type,c.mode,c.payload,c.meta||{},c.design||{},c.folder||'',c.status||'active',c.updatedAt,ownerId]);
    return normalizeCode(q.rows[0]);
  }
  if (isProd) throw Object.assign(new Error('Production dynamic QR storage is not configured. Add DATABASE_URL.'),{status:503});
  const x=fileDb(), i=x.codes.findIndex(c=>c.id===id&&(c.ownerId||'legacy')===ownerId); if(i<0)return null; x.codes[i]={...x.codes[i],...body,id:x.codes[i].id,slug:x.codes[i].slug,updatedAt:new Date().toISOString()}; saveFileDb(x); return x.codes[i];
}
async function deleteCode(id, ownerId) {
  if (pool) { await ensureSchema(); await pool.query('DELETE FROM qr_codes WHERE id=$1 AND owner_id=$2',[id,ownerId]); return; }
  if (isProd) throw Object.assign(new Error('Production dynamic QR storage is not configured. Add DATABASE_URL.'),{status:503});
  const x=fileDb(); x.codes=x.codes.filter(c=>!(c.id===id&&(c.ownerId||'legacy')===ownerId)); x.scans=x.scans.filter(s=>s.codeId!==id); saveFileDb(x);
}
async function getCodeBySlug(slug) {
  if (pool) { await ensureSchema(); const r=(await pool.query('SELECT * FROM qr_codes WHERE slug=$1',[slug])).rows[0]; return r?normalizeCode(r):null; }
  if (isProd) return null;
  return fileDb().codes.find(c=>c.slug===slug)||null;
}
async function recordScan(codeId, scan) {
  if (pool) { await ensureSchema(); await pool.query('INSERT INTO qr_scans (id,code_id,at,device,os,ip_hash,referrer) VALUES ($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),codeId,scan.at,scan.device,scan.os,scan.ipHash,scan.referrer]); return; }
  if (isProd) return;
  const x=fileDb(); x.scans.push({id:crypto.randomUUID(),codeId,...scan}); saveFileDb(x);
}
async function scansFor(codeId) {
  if (pool) { await ensureSchema(); return (await pool.query('SELECT * FROM qr_scans WHERE code_id=$1 ORDER BY at ASC',[codeId])).rows.map(normalizeScan); }
  if (isProd) return [];
  return fileDb().scans.filter(s=>s.codeId===codeId);
}
async function allScans() {
  if (pool) { await ensureSchema(); return (await pool.query('SELECT * FROM qr_scans ORDER BY at ASC')).rows.map(normalizeScan); }
  if (isProd) return [];
  return fileDb().scans;
}

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://www.googletagmanager.com https://pagead2.googlesyndication.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com; object-src 'none'; base-uri 'self'; form-action 'self'");
  if(isProd) res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
const sessionSecret = process.env.SESSION_SECRET || (!isProd ? 'qr-studio-local-dev-secret' : '');
const parseCookies=(h='')=>Object.fromEntries(h.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));
const sign=v=>crypto.createHmac('sha256',sessionSecret).update(v).digest('hex').slice(0,32);
app.use((req,res,next)=>{
  if(!sessionSecret){req.ownerId=null;return next();}
  const raw=parseCookies(req.headers.cookie||'').qr_session;let id='';
  if(raw){const [v,sig]=raw.split('.');if(v&&sig){const expected=sign(v);if(sig.length===expected.length&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(sig)))id=v;}}
  if(!id){id=crypto.randomUUID();const val=`${id}.${sign(id)}`;res.append('Set-Cookie',`qr_session=${encodeURIComponent(val)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${isProd?'; Secure':''}`);}
  req.ownerId=id;next();
});
const buckets=new Map();
function rateLimit(limit,windowMs){return (req,res,next)=>{const now=Date.now(),key=(req.ip||'unknown')+':'+req.path;let b=buckets.get(key);if(!b||now-b.start>windowMs)b={start:now,count:0};b.count++;buckets.set(key,b);if(b.count>limit)return res.status(429).json({error:'Too many requests. Please try again shortly.'});next();}}
app.use('/api',rateLimit(180,60_000));
app.use(express.static(PUBLIC,{maxAge:isProd?'1d':0,etag:true,index:false}));
if (!isProd && fs.existsSync(UPLOADS)) app.use('/uploads',express.static(UPLOADS));

const originFor = (req) => process.env.SITE_URL?.replace(/\/$/,'') || `${req.protocol}://${req.get('host')}`;
function serveView(file,req,res){
  let html=fs.readFileSync(path.join(VIEWS,file),'utf8');
  html=html.replaceAll('{{SITE_URL}}',originFor(req)).replaceAll('{{GA_ID}}',process.env.GA_MEASUREMENT_ID||'').replaceAll('{{ADSENSE_CLIENT}}',process.env.ADSENSE_CLIENT||'').replaceAll('{{GSC_META}}',process.env.GSC_VERIFICATION?`<meta name="google-site-verification" content="${String(process.env.GSC_VERIFICATION).replace(/["<>]/g,'')}">`:'').replaceAll('{{ADSENSE_META}}',process.env.ADSENSE_CLIENT?`<meta name="google-adsense-account" content="${String(process.env.ADSENSE_CLIENT).replace(/["<>]/g,'')}">`:'');
  res.type('html').send(html);
}

app.get('/site-config.js',(req,res)=>{res.type('application/javascript').set('Cache-Control','no-store').send(`window.SITE_CONFIG=${JSON.stringify({siteUrl:originFor(req),gaId:process.env.GA_MEASUREMENT_ID||'',adsenseClient:process.env.ADSENSE_CLIENT||''})};`)});
app.post('/api/contact',rateLimit(5,60*60_000),async(req,res,next)=>{try{const name=String(req.body.name||'').trim().slice(0,120),email=String(req.body.email||'').trim().slice(0,180),message=String(req.body.message||'').trim().slice(0,4000);if(!name||!/^\S+@\S+\.\S+$/.test(email)||!message)return res.status(400).send('Please provide a valid name, email and message.');if(pool){await ensureSchema();await pool.query('INSERT INTO contact_messages (id,name,email,message) VALUES ($1,$2,$3,$4)',[crypto.randomUUID(),name,email,message]);}else if(!isProd){const log=path.join(path.dirname(DATA),'contact.ndjson');fs.appendFileSync(log,JSON.stringify({id:crypto.randomUUID(),name,email,message,createdAt:new Date().toISOString()})+'\n');}else{return res.status(503).send('Contact storage is not configured yet.');}res.type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Message received — QR Studio</title><style>body{font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#faf9fd;color:#17171b}.x{text-align:center;max-width:560px;padding:30px}a{color:#5d46df}</style><div class="x"><h1>Thanks — message received.</h1><p>Your feedback has been saved.</p><a href="/">Return home</a></div>');}catch(e){next(e)}});
app.get('/api/health', async (_,res)=>{try{if(pool)await ensureSchema();res.json({ok:true,service:'qr-studio',storage:pool?'postgres':'local-file',time:new Date().toISOString()})}catch(e){res.status(503).json({ok:false,error:'database unavailable'})}});

const safeName=n=>n.replace(/[^a-zA-Z0-9._-]/g,'_');
const memoryUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024},fileFilter:(_,f,cb)=>{const ok=/^(image\/|audio\/|video\/|application\/pdf$)/.test(f.mimetype);cb(ok?null:new Error('Unsupported file type'),ok)}});
const diskUpload=!isProd?multer({storage:multer.diskStorage({destination:(_,__,cb)=>cb(null,UPLOADS),filename:(_,f,cb)=>cb(null,Date.now()+'-'+safeName(f.originalname))}),limits:{fileSize:20*1024*1024}}):null;
app.post('/api/upload',rateLimit(20,60*60_000),(req,res,next)=>{
  const uploader=isProd?memoryUpload.single('file'):diskUpload.single('file'); uploader(req,res,async err=>{if(err)return next(err);try{
    if(!req.file)return res.status(400).json({error:'No file uploaded'});
    if(isProd){
      const { put }=await import('@vercel/blob'); const opts={access:'public',contentType:req.file.mimetype};if(process.env.BLOB_READ_WRITE_TOKEN)opts.token=process.env.BLOB_READ_WRITE_TOKEN;const blob=await put(`qr-studio/${Date.now()}-${safeName(req.file.originalname)}`,req.file.buffer,opts);
      return res.json({url:blob.url,name:req.file.originalname,size:req.file.size});
    }
    res.json({url:`${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`,name:req.file.originalname,size:req.file.size});
  }catch(e){next(e)}})
});

const uaInfo=(ua='')=>({device:/mobile|iphone|android/i.test(ua)?'Mobile':/ipad|tablet/i.test(ua)?'Tablet':'Desktop',os:/windows/i.test(ua)?'Windows':/android/i.test(ua)?'Android':/iphone|ipad|ios/i.test(ua)?'iOS':/mac os|macintosh/i.test(ua)?'macOS':/linux/i.test(ua)?'Linux':'Other'});
app.get('/api/codes',async(req,res,next)=>{try{res.json(req.ownerId?await listCodes(req.ownerId):[])}catch(e){next(e)}});
app.post('/api/codes',async(req,res,next)=>{try{if(!req.ownerId)return res.status(503).json({error:'SESSION_SECRET is required for saved QR codes.'});res.json(await createCode(req.body,req.ownerId))}catch(e){next(e)}});
app.put('/api/codes/:id',async(req,res,next)=>{try{if(!req.ownerId)return res.status(503).json({error:'Session unavailable'});const c=await updateCode(req.params.id,req.body,req.ownerId);if(!c)return res.status(404).json({error:'Not found'});res.json(c)}catch(e){next(e)}});
app.delete('/api/codes/:id',async(req,res,next)=>{try{if(!req.ownerId)return res.status(503).json({error:'Session unavailable'});await deleteCode(req.params.id,req.ownerId);res.json({ok:true})}catch(e){next(e)}});
app.post('/api/codes/:id/toggle',async(req,res,next)=>{try{if(!req.ownerId)return res.status(503).json({error:'Session unavailable'});const codes=await listCodes(req.ownerId);const c=codes.find(x=>x.id===req.params.id);if(!c)return res.status(404).json({error:'Not found'});res.json(await updateCode(c.id,{status:c.status==='active'?'paused':'active'},req.ownerId))}catch(e){next(e)}});
app.get('/api/codes/:id/analytics',async(req,res,next)=>{try{if(!req.ownerId)return res.status(403).json({error:'Session unavailable'});const owned=(await listCodes(req.ownerId)).some(c=>c.id===req.params.id);if(!owned)return res.status(404).json({error:'Not found'});const scans=await scansFor(req.params.id);const by=(key)=>Object.entries(scans.reduce((a,s)=>(a[s[key]||'Unknown']=(a[s[key]||'Unknown']||0)+1,a),{})).sort((a,b)=>b[1]-a[1]);const days=Object.entries(scans.reduce((a,s)=>{const d=s.at.slice(0,10);a[d]=(a[d]||0)+1;return a;},{})).sort();res.json({total:scans.length,unique:new Set(scans.map(s=>s.ipHash)).size,devices:by('device'),os:by('os'),days,recent:scans.slice(-50).reverse()})}catch(e){next(e)}});
app.get('/api/export.csv',async(req,res,next)=>{try{if(!req.ownerId)return res.status(403).send('Session unavailable');const [codes,scans]=await Promise.all([listCodes(req.ownerId),allScans()]);const ownedIds=new Set(codes.map(c=>c.id));const ownedScans=scans.filter(s=>ownedIds.has(s.codeId));const rows=['code,scan_time,device,os,referrer'];for(const s of ownedScans){const c=codes.find(q=>q.id===s.codeId);rows.push([c?.name||'',s.at,s.device,s.os,s.referrer||''].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(','));}res.type('text/csv').send(rows.join('\n'))}catch(e){next(e)}});

app.get('/r/:slug',async(req,res,next)=>{try{const c=await getCodeBySlug(req.params.slug);if(!c)return res.status(404).send('QR code not found');if(c.status!=='active')return res.status(410).send('This QR code is paused.');const ua=uaInfo(req.get('user-agent')||'');const ip=(req.ip||'').slice(0,80);await recordScan(c.id,{at:new Date().toISOString(),...ua,ipHash:crypto.createHash('sha256').update(ip+(process.env.IP_HASH_SALT||'qr-studio')).digest('hex').slice(0,24),referrer:(req.get('referer')||'').slice(0,1000)});if(c.meta?.landingHtml)return res.type('html').send(c.meta.landingHtml);if(/^https?:\/\//i.test(c.payload))return res.redirect(302,c.payload);res.type('text/plain').send(c.payload)}catch(e){next(e)}});

const seoRoutes={
  '/':'index.html','/url-qr-code-generator/':'url-qr-code-generator.html','/wifi-qr-code-generator/':'wifi-qr-code-generator.html','/vcard-qr-code-generator/':'vcard-qr-code-generator.html','/email-qr-code-generator/':'email-qr-code-generator.html','/sms-qr-code-generator/':'sms-qr-code-generator.html','/whatsapp-qr-code-generator/':'whatsapp-qr-code-generator.html','/qr-code-with-logo/':'qr-code-with-logo.html','/qr-code-for-business-card/':'qr-code-for-business-card.html','/qr-code-for-restaurant-menu/':'qr-code-for-restaurant-menu.html','/qr-code-for-google-reviews/':'qr-code-for-google-reviews.html','/bulk-qr-code-generator/':'bulk-qr-code-generator.html','/barcode-generator/':'barcode-generator.html','/static-vs-dynamic-qr-code/':'static-vs-dynamic-qr-code.html','/about/':'about.html','/contact/':'contact.html','/privacy/':'privacy.html','/terms/':'terms.html'
};
for(const [route,file] of Object.entries(seoRoutes)) app.get(route,(req,res)=>serveView(file,req,res));
app.get('/robots.txt',(req,res)=>res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /r/\n\nSitemap: ${originFor(req)}/sitemap.xml\n`));
app.get('/sitemap.xml',(req,res)=>{const base=originFor(req),urls=Object.keys(seoRoutes).filter(x=>!['/contact/','/privacy/','/terms/'].includes(x));res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>${base}${u}</loc><changefreq>${u==='/'?'weekly':'monthly'}</changefreq><priority>${u==='/'?'1.0':'0.8'}</priority></url>`).join('')}</urlset>`)});
app.get('/ads.txt',(req,res)=>{const id=(process.env.ADSENSE_PUBLISHER_ID||'').trim();res.type('text/plain').send(id?`google.com, ${id}, DIRECT, f08c47fec0942fa0\n`:'# Add ADSENSE_PUBLISHER_ID after AdSense approval.\n')});
app.get('/app',(_,res)=>res.redirect(301,'/app/'));

app.use((req,res)=>res.status(404).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page not found — QR Studio</title><style>body{font-family:system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#faf9ff;color:#17171b}.x{text-align:center;max-width:560px;padding:30px}a{color:#5b45dc}</style><div class="x"><h1>404</h1><h2>That page isn’t here.</h2><p>Use the QR Studio homepage or open the generator.</p><p><a href="/">Home</a> · <a href="/app/">Open generator</a></p></div>`));
app.use((err,req,res,next)=>{console.error(err);res.status(err.status||500).json({error:isProd?'Unexpected server error':(err.message||'Unexpected server error')})});

if (!process.env.VERCEL) app.listen(PORT,()=>console.log(`QR Studio running at http://localhost:${PORT}`));
export default app;
