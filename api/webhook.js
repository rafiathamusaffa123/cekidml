import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
const SITE_URL = process.env.SITE_URL || 'https://atha-one.vercel.app/';
const WA_NUMBER = process.env.WA_NUMBER || '628817055190';
const SECRET = process.env.WEBHOOK_SECRET;
const API = `https://api.telegram.org/bot${TOKEN}`;

async function tg(method, payload) {
  const r = await fetch(`${API}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!data.ok) console.error('Telegram API error:', data);
  return data;
}
const isAdmin = id => ADMIN_IDS.includes(String(id));
const money = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n));
const esc = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

async function saveUser(u) {
  await supabase.from('bot_users').upsert({ telegram_id: String(u.id), username: u.username || null, first_name: u.first_name || null, updated_at: new Date().toISOString() }, { onConflict: 'telegram_id' });
}
async function products(best = false) {
  let q = supabase.from('products').select('*').eq('active', true).order('category').order('name').limit(50);
  if (best) q = q.eq('best_seller', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
async function home(chatId, name) {
  const text = `⚡ <b>ATHA STORE</b> ⚡\n<i>Your Trusted Digital Partner</i>\n\nHalo ${esc(name || 'teman')}! Selamat datang di layanan ATHA STORE.\n\nPilih menu di bawah untuk melihat produk, promo, atau menghubungi admin.`;
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [
    [{ text: '🛍️ Katalog Produk', callback_data: 'catalog' }, { text: '🔥 Best Seller', callback_data: 'best' }],
    [{ text: '🎟️ Promo', callback_data: 'promos' }, { text: '📱 Layanan iPhone', callback_data: 'iphone' }],
    [{ text: '🌐 Order Website', url: SITE_URL }, { text: '💬 WhatsApp Admin', url: `https://wa.me/${WA_NUMBER}` }],
    [{ text: 'ℹ️ Bantuan', callback_data: 'help' }]
  ] } });
}
async function showProducts(chatId, best = false) {
  const list = await products(best);
  if (!list.length) return tg('sendMessage', { chat_id: chatId, text: best ? 'Belum ada produk best seller.' : 'Katalog masih kosong. Admin dapat menambahkan produk melalui /addproduct.' });
  const groups = {};
  for (const p of list) (groups[p.category] ||= []).push(p);
  let text = best ? '🔥 <b>BEST SELLER ATHA STORE</b>\n\n' : '🛍️ <b>KATALOG ATHA STORE</b>\n\n';
  for (const [cat, items] of Object.entries(groups)) {
    text += `<b>${esc(cat)}</b>\n`;
    for (const p of items) text += `• ${esc(p.name)} — <b>${money(p.price)}</b>${p.description ? `\n  <i>${esc(p.description)}</i>` : ''}\n`;
    text += '\n';
  }
  text += '🛒 Pesan melalui website atau hubungi admin.';
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🛒 ORDER WEBSITE', url: SITE_URL }], [{ text: '💬 CHAT ADMIN', url: `https://wa.me/${WA_NUMBER}` }], [{ text: '⬅️ Menu Utama', callback_data: 'home' }]] } });
}
async function showPromos(chatId) {
  const { data, error } = await supabase.from('promos').select('*').eq('active', true).order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  if (!data?.length) return tg('sendMessage', { chat_id: chatId, text: 'Saat ini belum ada promo aktif. Pantau terus ATHA STORE ya! 🎟️' });
  let text = '🎟️ <b>PROMO ATHA STORE</b>\n\n';
  for (const p of data) text += `🎫 <code>${esc(p.code)}</code> — ${Number(p.discount_percent)}%\n${esc(p.description || 'Promo spesial ATHA STORE')}\n\n`;
  text += '<i>Catatan: tanyakan syarat promo kepada admin sebelum checkout.</i>';
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🌐 BUKA WEBSITE', url: SITE_URL }], [{ text: '⬅️ Menu Utama', callback_data: 'home' }]] } });
}
async function adminHelp(chatId) {
  const text = `🛠️ <b>PANEL ADMIN ATHA STORE</b>\n\n<code>/addproduct Kategori|Nama|Harga|Deskripsi</code>\n<code>/editprice ID|HargaBaru</code>\n<code>/delproduct ID</code>\n<code>/best ID</code> — toggle best seller\n<code>/products</code> — lihat produk dan ID\n<code>/addpromo Kode|DiskonPersen|Deskripsi</code>\n<code>/delpromo KODE</code>\n<code>/broadcast Pesan</code>\n<code>/stats</code> — jumlah pengguna\n\nContoh:\n<code>/addproduct Mobile Legends|Weekly Diamond Pass|28255|Masa aktif 7 hari</code>`;
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}
const parts = s => s.split('|').map(x => x.trim());
async function adminCommand(chatId, userId, text) {
  if (!isAdmin(userId)) return tg('sendMessage', { chat_id: chatId, text: '⛔ Perintah ini khusus admin ATHA STORE.' });
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(' ');
  try {
    if (cmd === '/admin') return adminHelp(chatId);
    if (cmd === '/addproduct') {
      const [category, name, price, description = ''] = parts(arg);
      if (!category || !name || !price || !Number.isFinite(Number(price)) || Number(price) < 0) return tg('sendMessage', { chat_id: chatId, text: 'Format: /addproduct Kategori|Nama|Harga|Deskripsi' });
      const { error } = await supabase.from('products').insert({ category, name, price: Number(price), description });
      if (error) throw error;
      return tg('sendMessage', { chat_id: chatId, text: `✅ Produk <b>${esc(name)}</b> berhasil ditambahkan.`, parse_mode: 'HTML' });
    }
    if (cmd === '/editprice') {
      const [id, price] = parts(arg);
      if (!id || !Number.isFinite(Number(price)) || Number(price) < 0) return tg('sendMessage', { chat_id: chatId, text: 'Format: /editprice ID|HargaBaru' });
      const { error } = await supabase.from('products').update({ price: Number(price) }).eq('id', Number(id));
      if (error) throw error;
      return tg('sendMessage', { chat_id: chatId, text: '✅ Harga produk diperbarui.' });
    }
    if (cmd === '/delproduct') {
      const id = Number(arg);
      if (!id) return tg('sendMessage', { chat_id: chatId, text: 'Format: /delproduct ID' });
      const { error } = await supabase.from('products').update({ active: false }).eq('id', id);
      if (error) throw error;
      return tg('sendMessage', { chat_id: chatId, text: '✅ Produk dinonaktifkan dari katalog.' });
    }
    if (cmd === '/best') {
      const id = Number(arg);
      const { data, error } = await supabase.from('products').select('best_seller').eq('id', id).single();
      if (error) throw error;
      const { error: e } = await supabase.from('products').update({ best_seller: !data.best_seller }).eq('id', id);
      if (e) throw e;
      return tg('sendMessage', { chat_id: chatId, text: `✅ Status best seller sekarang: ${!data.best_seller ? 'AKTIF' : 'NONAKTIF'}.` });
    }
    if (cmd === '/products') {
      const { data, error } = await supabase.from('products').select('id,category,name,price,active,best_seller').order('id').limit(100);
      if (error) throw error;
      const out = data?.map(p => `#${p.id} | ${p.category} | ${p.name} | ${money(p.price)} | ${p.active ? 'aktif' : 'nonaktif'} | ${p.best_seller ? 'best seller' : '-'}`).join('\n') || 'Belum ada produk.';
      return tg('sendMessage', { chat_id: chatId, text: `<pre>${esc(out)}</pre>`, parse_mode: 'HTML' });
    }
    if (cmd === '/addpromo') {
      const [code, discount, description = ''] = parts(arg);
      const d = Number(discount);
      if (!code || !Number.isInteger(d) || d < 1 || d > 100) return tg('sendMessage', { chat_id: chatId, text: 'Format: /addpromo Kode|DiskonPersen|Deskripsi (1-100)' });
      const { error } = await supabase.from('promos').upsert({ code: code.toUpperCase(), discount_percent: d, description, active: true }, { onConflict: 'code' });
      if (error) throw error;
      return tg('sendMessage', { chat_id: chatId, text: `✅ Promo ${esc(code.toUpperCase())} berhasil disimpan.`, parse_mode: 'HTML' });
    }
    if (cmd === '/delpromo') {
      if (!arg) return tg('sendMessage', { chat_id: chatId, text: 'Format: /delpromo KODE' });
      const { error } = await supabase.from('promos').update({ active: false }).eq('code', arg.toUpperCase());
      if (error) throw error;
      return tg('sendMessage', { chat_id: chatId, text: '✅ Promo dinonaktifkan.' });
    }
    if (cmd === '/stats') {
      const { count, error } = await supabase.from('bot_users').select('*', { count: 'exact', head: true });
      if (error) throw error;
      const { count: pc } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true);
      return tg('sendMessage', { chat_id: chatId, text: `📊 <b>STATISTIK ATHA STORE</b>\nPengguna bot: ${count || 0}\nProduk aktif: ${pc || 0}`, parse_mode: 'HTML' });
    }
    if (cmd === '/broadcast') {
      if (!arg) return tg('sendMessage', { chat_id: chatId, text: 'Format: /broadcast Pesan pengumuman' });
      const { data, error } = await supabase.from('bot_users').select('telegram_id').limit(5000);
      if (error) throw error;
      let sent = 0;
      for (const u of data || []) {
        const result = await tg('sendMessage', { chat_id: u.telegram_id, text: `📢 <b>INFO ATHA STORE</b>\n\n${esc(arg)}`, parse_mode: 'HTML' });
        if (result?.ok) sent++;
      }
      return tg('sendMessage', { chat_id: chatId, text: `Broadcast selesai. Terkirim: ${sent}/${data?.length || 0}.` });
    }
    return tg('sendMessage', { chat_id: chatId, text: 'Perintah admin tidak dikenal. Ketik /admin untuk bantuan.' });
  } catch (e) {
    console.error(e);
    return tg('sendMessage', { chat_id: chatId, text: `❌ Terjadi kesalahan: ${String(e.message || e).slice(0, 250)}` });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ATHA STORE Telegram webhook aktif.');
  if (!TOKEN || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !SECRET) return res.status(500).send('Environment variables belum lengkap.');
  if (req.headers['x-telegram-bot-api-secret-token'] !== SECRET) return res.status(401).send('Unauthorized');
  try {
    const update = req.body;
    if (update?.message) {
      const m = update.message;
      if (m.from) await saveUser(m.from);
      if (m.chat.type !== 'private') return res.status(200).send('ok');
      const text = m.text || '';
      if (text === '/start' || text.startsWith('/start ')) await home(m.chat.id, m.from.first_name);
      else if (text === '/help') await tg('sendMessage', { chat_id: m.chat.id, text: 'Gunakan tombol menu untuk katalog, best seller, promo, dan bantuan. Admin: ketik /admin.' });
      else if (text.startsWith('/')) await adminCommand(m.chat.id, m.from.id, text);
      else await home(m.chat.id, m.from.first_name);
    }
    if (update?.callback_query) {
      const q = update.callback_query;
      await tg('answerCallbackQuery', { callback_query_id: q.id });
      const chatId = q.message.chat.id;
      if (q.data === 'home') await home(chatId, q.from.first_name);
      else if (q.data === 'catalog') await showProducts(chatId, false);
      else if (q.data === 'best') await showProducts(chatId, true);
      else if (q.data === 'promos') await showPromos(chatId);
      else if (q.data === 'iphone') await tg('sendMessage', { chat_id: chatId, text: '📱 <b>LAYANAN IPHONE ATHA STORE</b>\n\nUnblock IMEI / buka jaringan iPhone mulai Rp170.000.\n\nHubungi admin untuk pengecekan tipe perangkat, status IMEI, dan ketersediaan layanan. Hasil tidak dijamin sebelum pengecekan.', parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '💬 TANYA ADMIN', url: `https://wa.me/${WA_NUMBER}` }], [{ text: '⬅️ Menu Utama', callback_data: 'home' }]] } });
      else if (q.data === 'help') await tg('sendMessage', { chat_id: chatId, text: `ℹ️ <b>BANTUAN ATHA STORE</b>\nGunakan tombol katalog untuk melihat produk. Pemesanan dilakukan melalui website: ${esc(SITE_URL)}\nAdmin WhatsApp: ${WA_NUMBER}`, parse_mode: 'HTML' });
    }
    return res.status(200).send('ok');
  } catch (e) {
    console.error('Webhook error:', e);
    return res.status(200).send('handled');
  }
}
