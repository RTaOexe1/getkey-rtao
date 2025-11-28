require('express');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DB_PATH = path.join(__dirname,'data','db.sqlite');
async function initDb(){
  const db = await open({ filename:DB_PATH, driver:sqlite3.Database });
  await db.exec('CREATE TABLE IF NOT EXISTS sessions(sessionId TEXT PRIMARY KEY, method TEXT, completed INTEGER DEFAULT 0, createdAt INTEGER);');
  await db.exec('CREATE TABLE IF NOT EXISTS keys(key TEXT PRIMARY KEY, sessionId TEXT, isUsed INTEGER DEFAULT 0, expireAt INTEGER);');
  return db;
}
let dbPromise = initDb();
app.use(express.static(path.join(__dirname)));
app.post('/api/create-link', async (req,res)=>{
  const { method } = req.body;
  const sessionId = uuidv4();
  const db = await dbPromise;
  await db.run('INSERT INTO sessions(sessionId, method, completed, createdAt) VALUES(?,?,?,?)', sessionId, method||'linkvertise',0,Date.now());
  const returnUrl = encodeURIComponent(`${BASE_URL}/api/verify?session=${sessionId}`);
  const external = (method==='workink') ? `https://work.ink/yourid?r=${returnUrl}` : `https://linkvertise.com/yourid?r=${returnUrl}`;
  res.json({ status:'ok', sessionId, link:external });
});
app.get('/api/verify', async (req,res)=>{
  const session=req.query.session;
  if(!session) return res.status(400).send('missing session');
  const db = await dbPromise;
  const row = await db.get('SELECT * FROM sessions WHERE sessionId=?', session);
  if(!row) return res.status(404).send('session not found');
  await db.run('UPDATE sessions SET completed=1 WHERE sessionId=?', session);
  res.redirect(`${BASE_URL}/getkey.html?session=${session}`);
});
app.get('/api/get-key', async (req,res)=>{
  const session = req.query.session;
  if(!session) return res.status(400).json({error:'missing session'});
  const db = await dbPromise;
  const row = await db.get('SELECT * FROM sessions WHERE sessionId=?', session);
  if(!row) return res.status(404).json({error:'session not found'});
  if(!row.completed) return res.status(403).json({error:'task not completed'});
  const key = uuidv4().replace(/-/g,'').slice(0,20);
  const expireAt = Date.now() + 24*60*60*1000;
  await db.run('INSERT INTO keys(key, sessionId, isUsed, expireAt) VALUES(?,?,?,?)', key, session, 0, expireAt);
  res.json({status:'ok', key, expiresAt:expireAt});
});
app.post('/api/use-key', async (req,res)=>{
  const {key} = req.body;
  const db = await dbPromise;
  const row = await db.get('SELECT * FROM keys WHERE key=?', key);
  if(!row) return res.json({valid:false,error:'invalid key'});
  if(row.isUsed) return res.json({valid:false,error:'key already used'});
  if(Date.now()>row.expireAt) return res.json({valid:false,error:'key expired'});
  await db.run('UPDATE keys SET isUsed=1 WHERE key=?', key);
  res.json({valid:true});
});
app.listen(PORT,()=>console.log('Server running on', PORT));
