// server.js - Node server for Telegram bot + serves React WebApp
const express = require('express');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');
const cron = require('node-cron');
const cors = require('cors');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin123';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'secret';
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !DATABASE_URL) {
  console.error("Missing BOT_TOKEN or DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// serve React build
app.use('/', express.static(path.join(__dirname, 'webapp', 'dist')));

// fallback for SPA
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/telegram')) return next();
  res.sendFile(path.join(__dirname, 'webapp', 'dist', 'index.html'));
});

// minimal DB init
const initSQL = `
CREATE TABLE IF NOT EXISTS cards(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  rarity TEXT NOT NULL,
  image TEXT DEFAULT '',
  coins_per_hour INT DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE,
  username TEXT,
  coins INT DEFAULT 0,
  last_pack_at BIGINT DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_cards(
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  card_id INT REFERENCES cards(id),
  qty INT DEFAULT 1,
  acquired_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS packs(
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  size INT,
  cards_json TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketplace(
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  card_id INT REFERENCES cards(id),
  price INT,
  status TEXT DEFAULT 'open',
  bought_by INT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS trades(
  id SERIAL PRIMARY KEY,
  from_user INT NOT NULL,
  to_user INT,
  offered_json TEXT,
  requested_json TEXT,
  status TEXT DEFAULT 'open',
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS trades_meta(
  id SERIAL PRIMARY KEY,
  trade_id INT REFERENCES trades(id),
  to_telegram_id BIGINT
);
`;

pool.query(initSQL).catch(e=>console.error('init sql err', e.message));

// helpers
const now = ()=> Math.floor(Date.now()/1000);
const RARITY_INCOME_PER_HOUR = { common:1, rare:3, epic:8, legendary:25 };

async function getUserByTg(tgId){
  const r = await pool.query("SELECT * FROM users WHERE telegram_id=$1",[tgId]);
  return r.rows[0];
}
async function createUser(tgId, username){
  const r = await pool.query("INSERT INTO users(telegram_id, username, coins, last_pack_at, created_at) VALUES($1,$2,0,0,$3) RETURNING *",[tgId, username, now()]);
  return r.rows[0];
}
async function pickRandomCard(){
  const r = await pool.query("SELECT * FROM cards");
  if (!r.rows.length) return null;
  return r.rows[Math.floor(Math.random()*r.rows.length)];
}
async function addCardToUser(userId, cardId, qty=1){
  const r = await pool.query("SELECT * FROM user_cards WHERE user_id=$1 AND card_id=$2",[userId, cardId]);
  if (r.rows.length){
    await pool.query("UPDATE user_cards SET qty=qty+$1 WHERE id=$2",[qty, r.rows[0].id]);
  } else {
    await pool.query("INSERT INTO user_cards(user_id, card_id, qty, acquired_at) VALUES($1,$2,$3,$4)",[userId, cardId, qty, now()]);
  }
}
async function grantPack(user, size){
  const cards=[];
  for(let i=0;i<size;i++){
    const c = await pickRandomCard();
    if(c){
      await addCardToUser(user.id, c.id, 1);
      cards.push({id:c.id, name:c.name, rarity:c.rarity, image:c.image});
    }
  }
  await pool.query("INSERT INTO packs(user_id,size,cards_json,created_at) VALUES ($1,$2,$3,$4)",[user.id, size, JSON.stringify(cards), now()]);
  return cards;
}
async function accrueCoins(u){
  const since = u.last_pack_at || u.created_at;
  const nowt = now();
  if (nowt<=since) return 0;
  const secs = nowt-since;
  const hours = secs/3600;
  const r = await pool.query("SELECT uc.qty, c.rarity FROM user_cards uc JOIN cards c ON uc.card_id=c.id WHERE uc.user_id=$1",[u.id]);
  let earned=0;
  for(const row of r.rows){
    earned += (RARITY_INCOME_PER_HOUR[row.rarity]||0) * row.qty * hours;
  }
  earned = Math.floor(earned);
  if (earned>0){
    await pool.query("UPDATE users SET coins=coins+$1, last_pack_at=$2 WHERE id=$3",[earned,nowt,u.id]);
  }
  return earned;
}

// Bot setup
const bot = new Telegraf(BOT_TOKEN);
bot.start(async (ctx)=>{
  let u = await getUserByTg(ctx.from.id);
  if(!u) u = await createUser(ctx.from.id, ctx.from.username||'');
  const webAppUrl = `${WEBHOOK_BASE_URL}/?tg=${ctx.from.id}`;
  return ctx.reply('Open Game WebApp', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Open Game WebApp', web_app: { url: webAppUrl } }],
        [{ text: 'Open free pack (5)', callback_data: 'open_pack' }]
      ]
    }
  });
});
bot.action('open_pack', async (ctx)=>{
  const u = await getUserByTg(ctx.from.id);
  if(!u) return ctx.answerCbQuery('Start first');
  const nowt = now();
  if(nowt - (u.last_pack_at||0) < 1800) {
    const left = 1800 - (nowt-(u.last_pack_at||0));
    return ctx.answerCbQuery(`Wait ${Math.ceil(left/60)} min.`);
  }
  const cards = await grantPack(u,5);
  await pool.query("UPDATE users SET last_pack_at=$1 WHERE id=$2",[nowt,u.id]);
  await ctx.reply('You opened pack:\\n' + cards.map(c=>`${c.name} [${c.rarity}]`).join('\\n'));
  await ctx.answerCbQuery('Pack opened');
});

// webhook
app.post(`/telegram/${WEBHOOK_SECRET}`, (req,res)=>{ bot.handleUpdate(req.body); res.sendStatus(200); });

// API endpoints used by React WebApp
function extractUserIdFromInit(initData){
  try { return initData.user && initData.user.id; } catch(e){ return null; }
}

app.post('/api/inventory', async (req,res)=>{
  const init = req.body.initDataUnsafe || {};
  const tgId = extractUserIdFromInit(init);
  if(!tgId) return res.status(400).json({error:'no user'});
  let u = await getUserByTg(tgId);
  if(!u) u = await createUser(tgId, init.user && init.user.username || '');
  await accrueCoins(u);
  const rows = await pool.query("SELECT uc.qty, c.* FROM user_cards uc JOIN cards c ON uc.card_id=c.id WHERE uc.user_id=$1",[u.id]);
  const coins = (await pool.query("SELECT coins FROM users WHERE id=$1",[u.id])).rows[0].coins;
  res.json({coins: coins, cards: rows.rows});
});

app.get('/api/cards', async (req,res)=>{
  const r = await pool.query("SELECT id,name,rarity,image,coins_per_hour FROM cards ORDER BY id DESC");
  res.json({cards: r.rows});
});

// admin CRUD
app.get('/api/admin/cards', async (req,res)=>{
  const token = req.headers['x-admin-token'];
  if(token !== ADMIN_TOKEN) return res.status(403).json({error:'forbidden'});
  const r = await pool.query("SELECT * FROM cards ORDER BY id DESC");
  res.json({cards: r.rows});
});
app.post('/api/admin/cards', async (req,res)=>{
  const token = req.headers['x-admin-token'];
  if(token !== ADMIN_TOKEN) return res.status(403).json({error:'forbidden'});
  const {name, description, rarity, image, coins_per_hour} = req.body;
  if(!name||!rarity||!image) return res.status(400).json({error:'name,rarity,image required'});
  const r = await pool.query("INSERT INTO cards(name,description,rarity,image,coins_per_hour,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[name,description||'',rarity,image||'', coins_per_hour||0, now()]);
  res.json({card: r.rows[0]});
});
app.put('/api/admin/cards/:id', async (req,res)=>{
  const token = req.headers['x-admin-token'];
  if(token !== ADMIN_TOKEN) return res.status(403).json({error:'forbidden'});
  const id = req.params.id;
  const {name, description, rarity, image, coins_per_hour} = req.body;
  const r = await pool.query("UPDATE cards SET name=$1, description=$2, rarity=$3, image=$4, coins_per_hour=$5 WHERE id=$6 RETURNING *",[name,description||'',rarity,image||'', coins_per_hour||0, id]);
  res.json({card: r.rows[0]});
});
app.delete('/api/admin/cards/:id', async (req,res)=>{
  const token = req.headers['x-admin-token'];
  if(token !== ADMIN_TOKEN) return res.status(403).json({error:'forbidden'});
  const id = req.params.id;
  await pool.query("DELETE FROM cards WHERE id=$1",[id]);
  res.json({ok:true});
});

// marketplace endpoints (simplified)
app.get('/api/marketplace', async (req,res)=>{
  const r = await pool.query("SELECT m.id, m.user_id, m.card_id, m.price, m.created_at, c.name, c.rarity, c.image, u.telegram_id FROM marketplace m JOIN cards c ON m.card_id=c.id JOIN users u ON m.user_id=u.id WHERE m.status='open' ORDER BY m.created_at DESC");
  res.json({list: r.rows});
});
app.post('/api/marketplace', async (req,res)=>{
  const { initDataUnsafe, card_id, price } = req.body;
  const tgId = extractUserIdFromInit(initDataUnsafe||{});
  if(!tgId) return res.status(400).json({error:'no user'});
  let u = await getUserByTg(tgId);
  if(!u) u = await createUser(tgId, initDataUnsafe.user && initDataUnsafe.user.username || '');
  const uc = await pool.query("SELECT * FROM user_cards WHERE user_id=$1 AND card_id=$2",[u.id, card_id]);
  if(!uc.rows.length || uc.rows[0].qty<1) return res.status(400).json({error:'no card'});
  await pool.query("UPDATE user_cards SET qty=qty-1 WHERE id=$1",[uc.rows[0].id]);
  await pool.query("INSERT INTO marketplace(user_id, card_id, price, status, created_at) VALUES($1,$2,$3,'open',$4)",[u.id, card_id, price, now()]);
  res.json({ok:true});
});
app.post('/api/marketplace/buy', async (req,res)=>{
  const { initDataUnsafe, listing_id } = req.body;
  const tgId = extractUserIdFromInit(initDataUnsafe||{});
  if(!tgId) return res.status(400).json({error:'no user'});
  let buyer = await getUserByTg(tgId);
  if(!buyer) buyer = await createUser(tgId, initDataUnsafe.user && initDataUnsafe.user.username || '');
  const listing = (await pool.query("SELECT m.*, u.telegram_id as seller_tg FROM marketplace m JOIN users u ON m.user_id=u.id WHERE m.id=$1",[listing_id])).rows[0];
  if(!listing || listing.status!=='open') return res.status(400).json({error:'not open'});
  if(buyer.coins < listing.price) return res.status(400).json({error:'not enough coins'});
  await pool.query("UPDATE users SET coins=coins-$1 WHERE id=$2",[listing.price, buyer.id]);
  await pool.query("UPDATE users SET coins=coins+$1 WHERE id=$2",[listing.price, listing.user_id]);
  await pool.query("UPDATE marketplace SET status='sold', bought_by=$1 WHERE id=$2",[buyer.id, listing_id]);
  await addCardToUser(buyer.id, listing.card_id, 1);
  res.json({ok:true});
});

// trades endpoints (create/accept)
app.post('/api/trade/create', async (req,res)=>{
  const { initDataUnsafe, to_telegram_id, offered, requested } = req.body;
  const tgId = extractUserIdFromInit(initDataUnsafe||{});
  if(!tgId) return res.status(400).json({error:'no user'});
  let fromUser = await getUserByTg(tgId);
  if(!fromUser) fromUser = await createUser(tgId, initDataUnsafe.user && initDataUnsafe.user.username || '');
  const nowt = now();
  const r = await pool.query("INSERT INTO trades(from_user, to_user, offered_json, requested_json, status, created_at) VALUES($1,$2,$3,$4,'open',$5) RETURNING id",[fromUser.id, null, JSON.stringify(offered), JSON.stringify(requested), nowt]);
  await pool.query("INSERT INTO trades_meta(trade_id, to_telegram_id) VALUES($1,$2)",[r.rows[0].id, to_telegram_id]);
  res.json({ok:true, trade_id: r.rows[0].id});
});
app.post('/api/trade/accept', async (req,res)=>{
  const { initDataUnsafe, trade_id } = req.body;
  const tgId = extractUserIdFromInit(initDataUnsafe||{});
  if(!tgId) return res.status(400).json({error:'no user'});
  const trade = (await pool.query("SELECT t.*, tm.to_telegram_id FROM trades t LEFT JOIN trades_meta tm ON tm.trade_id=t.id WHERE t.id=$1",[trade_id])).rows[0];
  if(!trade) return res.status(400).json({error:'not found'});
  if(trade.status!=='open') return res.status(400).json({error:'not open'});
  if(parseInt(trade.to_telegram_id)!==parseInt(tgId)) return res.status(403).json({error:'not for you'});
  const fromUser = (await pool.query("SELECT * FROM users WHERE id=$1",[trade.from_user])).rows[0];
  const toUser = await getUserByTg(tgId);
  if(!toUser) return res.status(400).json({error:'recipient missing'});
  const offered = JSON.parse(trade.offered_json);
  const requested = JSON.parse(trade.requested_json);
  for(const it of offered){
    const uc = (await pool.query("SELECT * FROM user_cards WHERE user_id=$1 AND card_id=$2",[fromUser.id, it.card_id])).rows[0];
    if(!uc || uc.qty < it.qty) return res.status(400).json({error:'from user lacks cards'});
  }
  for(const it of requested){
    const uc = (await pool.query("SELECT * FROM user_cards WHERE user_id=$1 AND card_id=$2",[toUser.id, it.card_id])).rows[0];
    if(!uc || uc.qty < it.qty) return res.status(400).json({error:'you lack cards'});
  }
  async function transfer(fromId, toId, card_id, qty){
    await pool.query("UPDATE user_cards SET qty=qty-$1 WHERE user_id=$2 AND card_id=$3",[qty, fromId, card_id]);
    await addCardToUser(toId, card_id, qty);
  }
  for(const it of offered) await transfer(fromUser.id, toUser.id, it.card_id, it.qty);
  for(const it of requested) await transfer(toUser.id, fromUser.id, it.card_id, it.qty);
  await pool.query("UPDATE trades SET status='accepted', to_user=(SELECT id FROM users WHERE telegram_id=$1) WHERE id=$2",[tgId, trade_id]);
  res.json({ok:true});
});

// health
app.get('/api/health', (req,res)=> res.json({ok:true}));

// start server
app.listen(PORT, async ()=>{
  console.log('Server on', PORT);
  if(WEBHOOK_BASE_URL){
    try{
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, { url: `${WEBHOOK_BASE_URL}/telegram/${WEBHOOK_SECRET}` });
      console.log('Webhook set');
    }catch(e){ console.log('Webhook set failed', e.message); }
  }
});

// cron job
cron.schedule('*/5 * * * *', async ()=>{
  try{
    const users = (await pool.query("SELECT * FROM users")).rows;
    for(const u of users) await accrueCoins(u);
  }catch(e){ console.error('cron err', e.message); }
});


// open_pack API used by webapp (grants pack and returns cards)
app.post('/api/open_pack', async (req,res)=>{
  const init = req.body.initDataUnsafe || {};
  const tgId = init.user && init.user.id;
  if(!tgId) return res.status(400).json({error:'no user'});
  let u = await getUserByTg(tgId);
  if(!u) u = await createUser(tgId, init.user && init.user.username || '');
  const nowt = now();
  if(nowt - (u.last_pack_at || 0) < 1800) return res.status(400).json({error:'cooldown'});
  const cards = await grantPack(u,5);
  await pool.query('UPDATE users SET last_pack_at=$1 WHERE id=$2',[nowt,u.id]);
  res.json({cards});
});
