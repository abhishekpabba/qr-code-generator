import crypto from 'crypto';
import { ensureSchema, getPool } from './_db.js';

function device(ua=''){return /Mobile|Android|iPhone|iPad/i.test(ua)?'mobile':'desktop'}
function os(ua=''){if(/iPhone|iPad|iOS/i.test(ua))return'iOS';if(/Android/i.test(ua))return'Android';if(/Windows/i.test(ua))return'Windows';if(/Mac OS|Macintosh/i.test(ua))return'macOS';return'other'}

export default async function handler(req,res){
  try{
    await ensureSchema();
    const db=getPool();
    const slug=String(req.query?.slug||'').trim();
    if(!slug)return res.status(400).send('Missing QR code');
    const code=(await db.query("SELECT * FROM qr_codes WHERE slug=$1 AND status='active'",[slug])).rows[0];
    if(!code)return res.status(404).send('QR code not found');
    const ua=String(req.headers['user-agent']||'');
    const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
    const salt=process.env.ANALYTICS_SALT||'qr-public-analytics';
    const ipHash=crypto.createHash('sha256').update(ip+salt).digest('hex').slice(0,24);
    db.query('INSERT INTO qr_scans(id,code_id,device,os,referrer,ip_hash) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),code.id,device(ua),os(ua),String(req.headers.referer||'').slice(0,500),ipHash]).catch(()=>{});
    res.statusCode=302;res.setHeader('Location',code.payload);res.setHeader('Cache-Control','no-store');res.end();
  }catch(e){res.status(e.status||500).send('Unable to open QR code')}
}
