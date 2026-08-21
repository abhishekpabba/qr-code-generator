import crypto from 'crypto';
import { ensureSchema, getPool, ownerFrom, json } from './_db.js';

function safeUrl(v){
  try{const u=new URL(String(v||''));if(!['http:','https:'].includes(u.protocol))return null;return u.toString()}catch{return null}
}
function summarize(r){return {id:r.id,slug:r.slug,name:r.name,payload:r.payload,type:r.type,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,shortUrl:`/r/${r.slug}`}}

export default async function handler(req,res){
  try{
    await ensureSchema();
    const db=getPool();
    const owner=ownerFrom(req);
    if(!owner)return json(res,400,{error:'Missing browser owner token'});

    if(req.method==='POST'){
      const payload=safeUrl(req.body?.payload);
      if(!payload)return json(res,400,{error:'Dynamic QR currently requires a valid http/https destination'});
      const id=crypto.randomUUID(),slug=crypto.randomBytes(5).toString('hex'),name=String(req.body?.name||'Dynamic QR').slice(0,120);
      const q=await db.query(`INSERT INTO qr_codes(id,slug,owner_id,name,payload,type,status) VALUES($1,$2,$3,$4,$5,'url','active') RETURNING *`,[id,slug,owner,name,payload]);
      return json(res,201,summarize(q.rows[0]));
    }

    if(req.method==='GET'){
      const id=String(req.query?.id||'');
      if(id){
        const code=(await db.query('SELECT * FROM qr_codes WHERE id=$1 AND owner_id=$2',[id,owner])).rows[0];
        if(!code)return json(res,404,{error:'Dynamic QR not found'});
        const stats=(await db.query(`SELECT COUNT(*)::int scans, COUNT(DISTINCT DATE(at))::int active_days, MIN(at) first_scan, MAX(at) last_scan FROM qr_scans WHERE code_id=$1`,[id])).rows[0];
        const days=(await db.query(`SELECT DATE(at) day, COUNT(*)::int scans FROM qr_scans WHERE code_id=$1 GROUP BY DATE(at) ORDER BY day DESC LIMIT 30`,[id])).rows;
        return json(res,200,{...summarize(code),analytics:{...stats,days}});
      }
      const rows=(await db.query('SELECT * FROM qr_codes WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 50',[owner])).rows;
      return json(res,200,{codes:rows.map(summarize)});
    }

    if(req.method==='PATCH'){
      const id=String(req.query?.id||'');
      const payload=safeUrl(req.body?.payload);
      if(!id||!payload)return json(res,400,{error:'Valid id and destination are required'});
      const name=String(req.body?.name||'Dynamic QR').slice(0,120);
      const q=await db.query(`UPDATE qr_codes SET payload=$1,name=$2,updated_at=NOW() WHERE id=$3 AND owner_id=$4 RETURNING *`,[payload,name,id,owner]);
      if(!q.rows[0])return json(res,404,{error:'Dynamic QR not found'});
      return json(res,200,summarize(q.rows[0]));
    }

    if(req.method==='DELETE'){
      const id=String(req.query?.id||'');
      if(!id)return json(res,400,{error:'id is required'});
      await db.query('DELETE FROM qr_codes WHERE id=$1 AND owner_id=$2',[id,owner]);
      return json(res,200,{ok:true});
    }

    res.setHeader('Allow','GET, POST, PATCH, DELETE');
    return json(res,405,{error:'Method not allowed'});
  }catch(e){return json(res,e.status||500,{error:e.message||'Server error'})}
}
