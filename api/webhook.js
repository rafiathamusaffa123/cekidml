
const { Telegraf, Markup } = require("telegraf");
const { createClient } = require("@supabase/supabase-js");

const bot = new Telegraf(process.env.BOT_TOKEN);

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const ADMIN_ID = Number(process.env.ADMIN_ID);
const STORE = "ATHA STORE";

const rupiah = n =>
  "Rp" + Number(n).toLocaleString("id-ID");

const isAdmin = id => id === ADMIN_ID;

async function sendMenu(ctx) {
  return ctx.reply(
    `🔥 ${STORE} 🔥

Selamat datang di toko kami!

🎮 Top Up Game
💎 Akun Premium
🛒 Keranjang Belanja
📦 Riwayat Pesanan

Silakan pilih menu:`,
    Markup.inlineKeyboard([
      [Markup.button.callback("🛍️ Katalog Produk", "catalog")],
      [Markup.button.callback("🛒 Keranjang", "cart")],
      [Markup.button.callback("📦 Pesanan Saya", "myorders")],
      [Markup.button.callback("👨‍💻 Hubungi Admin", "contact")]
    ])
  );
}

// START
bot.start(async ctx => {
  const u = ctx.from;

  await db.from("customers").upsert({
    user_id: u.id,
    username: u.username || null,
    first_name: u.first_name || null
  });

  await sendMenu(ctx);
});

// KATALOG
bot.action("catalog", async ctx => {
  await ctx.answerCbQuery();

  const { data, error } = await db
    .from("products")
    .select("category")
    .eq("active", true);

  if (error) return ctx.reply("Database sedang bermasalah.");

  const categories = [...new Set(data.map(x => x.category))];

  const buttons = categories.map(c => [
    Markup.button.callback(c, "category:" + c)
  ]);

  await ctx.reply(
    "📦 PILIH KATEGORI PRODUK",
    Markup.inlineKeyboard(buttons)
  );
});

// PRODUK DALAM KATEGORI
bot.action(/^category:(.+)$/, async ctx => {
  await ctx.answerCbQuery();

  const category = ctx.match[1];

  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("category", category)
    .eq("active", true);

  if (error || !data?.length) {
    return ctx.reply("Produk belum tersedia.");
  }

  const buttons = data.map(p => [
    Markup.button.callback(
      `${p.name} - ${rupiah(p.price)}`,
      "product:" + p.id
    )
  ]);

  await ctx.reply(
    `🛍️ ${category.toUpperCase()}\n\nPilih produk:`,
    Markup.inlineKeyboard(buttons)
  );
});

// DETAIL PRODUK
bot.action(/^product:(\d+)$/, async ctx => {
  await ctx.answerCbQuery();

  const { data: p } = await db
    .from("products")
    .select("*")
    .eq("id", Number(ctx.match[1]))
    .eq("active", true)
    .single();

  if (!p) return ctx.reply("Produk tidak ditemukan.");

  await ctx.reply(
    `📦 DETAIL PRODUK

Nama: ${p.name}
Kategori: ${p.category}
Harga: ${rupiah(p.price)}

${p.description || ""}`,
    Markup.inlineKeyboard([
      [Markup.button.callback("➕ Tambah ke Keranjang", "add:" + p.id)],
      [Markup.button.callback("🛒 Lihat Keranjang", "cart")]
    ])
  );
});

// TAMBAH KERANJANG
bot.action(/^add:(\d+)$/, async ctx => {
  await ctx.answerCbQuery();

  const productId = Number(ctx.match[1]);

  const { data: p } = await db
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("active", true)
    .single();

  if (!p) return ctx.reply("Produk tidak tersedia.");

  const { data: old } = await db
    .from("carts")
    .select("quantity")
    .eq("user_id", ctx.from.id)
    .eq("product_id", productId)
    .maybeSingle();

  const { error } = await db.from("carts").upsert({
    user_id: ctx.from.id,
    product_id: productId,
    quantity: (old?.quantity || 0) + 1
  }, { onConflict: "user_id,product_id" });

  if (error) return ctx.reply("Gagal menambahkan produk.");

  await ctx.reply("✅ Produk ditambahkan ke keranjang!");
});

// KERANJANG
bot.action("cart", async ctx => {
  await ctx.answerCbQuery();

  const { data, error } = await db
    .from("carts")
    .select("quantity, products(id,name,price,active)")
    .eq("user_id", ctx.from.id);

  if (error) return ctx.reply("Gagal mengambil keranjang.");

  const items = (data || []).filter(x => x.products?.active);

  if (!items.length) {
    return ctx.reply("🛒 Keranjang kamu masih kosong.");
  }

  let total = 0;
  let text = "🛒 KERANJANG BELANJA\n\n";

  for (const item of items) {
    const p = item.products;
    const subtotal = p.price * item.quantity;
    total += subtotal;

    text += `${p.name}\n`;
    text += `${item.quantity} x ${rupiah(p.price)} = ${rupiah(subtotal)}\n\n`;
  }

  text += `TOTAL: ${rupiah(total)}`;

  await ctx.reply(
    text,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ CHECKOUT", "checkout")],
      [Markup.button.callback("🗑️ Kosongkan Keranjang", "clearcart")]
    ])
  );
});

// KOSONGKAN KERANJANG
bot.action("clearcart", async ctx => {
  await ctx.answerCbQuery();

  await db.from("carts").delete()
    .eq("user_id", ctx.from.id);

  await ctx.reply("🗑️ Keranjang berhasil dikosongkan.");
});

// CHECKOUT
bot.action("checkout", async ctx => {
  await ctx.answerCbQuery();

  const { data: items } = await db
    .from("carts")
    .select("quantity,products(name,price,active)")
    .eq("user_id", ctx.from.id);

  const valid = (items || []).filter(
    x => x.products?.active
  );

  if (!valid.length) return ctx.reply("Keranjang kosong.");

  const total = valid.reduce(
    (sum, x) => sum + x.products.price * x.quantity, 0
  );

  const code = "ATHA" + Date.now().toString().slice(-8);

  const { data: order, error } = await db
    .from("orders")
    .insert({
      order_code: code,
      user_id: ctx.from.id,
      customer_name: ctx.from.first_name,
      total,
      status: "pending"
    })
    .select()
    .single();

  if (error) return ctx.reply("Checkout gagal. Coba lagi.");

  const orderItems = valid.map(x => ({
    order_id: order.id,
    product_name: x.products.name,
    price: x.products.price,
    quantity: x.quantity
  }));

  const { error: itemError } = await db
    .from("order_items")
    .insert(orderItems);

  if (itemError) {
    await db.from("orders").delete().eq("id", order.id);
    return ctx.reply("Gagal membuat detail pesanan.");
  }

  await db.from("carts").delete().eq("user_id", ctx.from.id);

  await ctx.reply(
    `🧾 PESANAN BERHASIL DIBUAT

Nomor: ${code}
Total: ${rupiah(total)}

💳 Silakan lakukan pembayaran manual melalui admin.

Setelah membayar, kirim bukti pembayaran berupa FOTO di chat bot ini.

Status: MENUNGGU PEMBAYARAN`
  );

  await bot.telegram.sendMessage(
    ADMIN_ID,
    `🔔 PESANAN BARU

Nomor: ${code}
Pelanggan: ${ctx.from.first_name}
User ID: ${ctx.from.id}
Total: ${rupiah(total)}

Periksa database untuk detail produk.`
  );
});

// FOTO BUKTI PEMBAYARAN
bot.on("photo", async ctx => {
  const photo = ctx.message.photo;
  const fileId = photo[photo.length - 1].file_id;

  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq("user_id", ctx.from.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!order) {
    return ctx.reply("Tidak ada pesanan yang menunggu pembayaran.");
  }

  await db.from("orders").update({
    payment_proof: fileId,
    status: "review"
  }).eq("id", order.id);

  await ctx.reply("✅ Bukti pembayaran terkirim. Tunggu pemeriksaan admin.");

  await bot.telegram.sendPhoto(ADMIN_ID, fileId, {
    caption:
      `💳 BUKTI PEMBAYARAN

Order: ${order.order_code}
Pelanggan: ${ctx.from.first_name}
Total: ${rupiah(order.total)}`,
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ TERIMA", "approve:" + order.id),
        Markup.button.callback("❌ TOLAK", "reject:" + order.id)
      ]
    ])
  });
});

// ADMIN: TERIMA PEMBAYARAN
bot.action(/^approve:(\d+)$/, async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("Akses ditolak.");
  }

  const id = Number(ctx.match[1]);

  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("status", "review")
    .single();

  if (!order) return ctx.reply("Pesanan tidak ditemukan atau sudah diproses.");

  await db.from("orders").update({
    status: "processing"
  }).eq("id", id);

  await bot.telegram.sendMessage(
    order.user_id,
    `✅ PEMBAYARAN DITERIMA!

Order: ${order.order_code}
Status: SEDANG DIPROSES

Terima kasih sudah berbelanja di ${STORE}.`
  );

  await ctx.editMessageCaption("✅ PEMBAYARAN DITERIMA. PESANAN DIPROSES.");
});

// ADMIN: TOLAK PEMBAYARAN
bot.action(/^reject:(\d+)$/, async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("Akses ditolak.");
  }

  const id = Number(ctx.match[1]);

  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("status", "review")
    .single();

  if (!order) return ctx.reply("Pesanan tidak ditemukan.");

  await db.from("orders").update({
    status: "rejected"
  }).eq("id", id);

  await bot.telegram.sendMessage(
    order.user_id,
    `❌ PEMBAYARAN BELUM DITERIMA

Order: ${order.order_code}

Silakan hubungi admin untuk pemeriksaan lebih lanjut.`
  );

  await ctx.editMessageCaption("❌ PEMBAYARAN DITOLAK.");
});

// RIWAYAT PESANAN
bot.action("myorders", async ctx => {
  await ctx.answerCbQuery();

  const { data } = await db
    .from("orders")
    .select("order_code,total,status,created_at")
    .eq("user_id", ctx.from.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data?.length) return ctx.reply("Belum ada riwayat pesanan.");

  let text = "📦 RIWAYAT PESANAN\n\n";

  for (const o of data) {
    text += `Order: ${o.order_code}\n`;
    text += `Total: ${rupiah(o.total)}\n`;
    text += `Status: ${o.status.toUpperCase()}\n\n`;
  }

  await ctx.reply(text);
});

// PANEL ADMIN
bot.command("admin", async ctx => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Akses admin ditolak.");
  }

  await ctx.reply(
    `👑 PANEL ADMIN ${STORE}

Perintah admin:

/addproduct Nama | Kategori | Harga
/editprice ID | Harga
/delproduct ID
/orders
/finish KODE_ORDER
/broadcast Pesan

Contoh:
/addproduct 59 Diamonds | Mobile Legends | 16000`
  );
});

// TAMBAH PRODUK
bot.command("addproduct", async ctx => {
  if (!isAdmin(ctx.from.id)) return;

  const raw = ctx.message.text.replace("/addproduct", "").trim();
  const [name, category, price] = raw.split("|").map(x => x.trim());

  if (!name || !category || !/^\d+$/.test(price || "")) {
    return ctx.reply("Format: /addproduct Nama | Kategori | Harga");
  }

  const { error } = await db.from("products").insert({
    name, category, price: Number(price), active: true
  });

  await ctx.reply(error ? "Gagal menambah produk." : "✅ Produk berhasil ditambahkan.");
});

// EDIT HARGA
bot.command("editprice", async ctx => {
  if (!isAdmin(ctx.from.id)) return;

  const [id, price] = ctx.message.text
    .replace("/editprice", "").split("|").map(x => x.trim());

  if (!/^\d+$/.test(id || "") || !/^\d+$/.test(price || "")) {
    return ctx.reply("Format: /editprice ID | Harga");
  }

  const { error } = await db.from("products")
    .update({ price: Number(price) })
    .eq("id", Number(id));

  await ctx.reply(error ? "Gagal mengubah harga." : "✅ Harga berhasil diperbarui.");
});

// HAPUS PRODUK (NONAKTIFKAN)
bot.command("delproduct", async ctx => {
  if (!isAdmin(ctx.from.id)) return;

  const id = ctx.message.text.replace("/delproduct", "").trim();

  if (!/^\d+$/.test(id)) {
    return ctx.reply("Format: /delproduct ID");
  }

  const { error } = await db.from("products")
    .update({ active: false })
    .eq("id", Number(id));

  await ctx.reply(error ? "Gagal menghapus produk." : "✅ Produk dinonaktifkan.");
});

// DAFTAR PESANAN ADMIN
bot.command("orders", async ctx => {
  if (!isAdmin(ctx.from.id)) return;

  const { data } = await db.from("orders")
    .select("order_code,user_id,total,status")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data?.length) return ctx.reply("Belum ada pesanan.");

  let text = "📊 DAFTAR PESANAN\n\n";

  for (const o of data) {
    text += `${o.order_code}\n`;
    text += `User: ${o.user_id}\n`;
    text += `${rupiah(o.total)} | ${o.status}\n\n`;
  }

  await ctx.reply(text);
});

// SELESAIKAN PESANAN
bot.command("finish", async ctx => {
  if (!isAdmin(ctx.from.id)) return;

  const code = ctx.message.text.replace("/finish", "").trim();

  const { data: order } = await db.from("orders")
    .select("*")
    .eq("order_code", code)
    .eq("status", "processing")
    .single();

  if (!order) return ctx.reply("Pesanan tidak ditemukan atau belum diproses.");

  await db.from("orders").update({
    status: "completed"
  }).eq("id", order.id);

  await bot.telegram.sendMessage(
    order.user_id,
    `🎉 PESANAN SELESAI!

Order: ${code}

Terima kasih telah berbelanja di ${STORE}!`
  );

  await ctx.reply("✅ Pesanan berhasil diselesaikan.");
});

// BROADCAST
bot.command("broadcast", async ctx => {
  if (!isAdmin(ctx.from.id)) return;

  const message = ctx.message.text.replace("/broadcast", "").trim();

  if (!message) return ctx.reply("Format: /broadcast Isi pesan");

  const { data: customers } = await db
    .from("customers")
    .select("user_id");

  let success = 0;

  for (const customer of customers || []) {
    try {
      await bot.telegram.sendMessage(customer.user_id, message);
      success++;
    } catch (e) {
      console.error("Broadcast gagal:", customer.user_id);
    }
  }

  await ctx.reply(`📢 Broadcast selesai.\nTerkirim: ${success}`);
});

// HUBUNGI ADMIN
bot.action("contact", async ctx => {
  await ctx.answerCbQuery();

  await ctx.reply(
    "👨‍💻 Untuk bantuan, silakan hubungi admin ATHA STORE."
  );
});

// ERROR HANDLER
bot.catch((err, ctx) => {
  console.error("BOT ERROR:", err);
});

// WEBHOOK
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).send("ATHA STORE ONLINE");
  }

  // KEAMANAN WEBHOOK
  if (
    req.headers["x-telegram-bot-api-secret-token"] !==
    process.env.WEBHOOK_SECRET
  ) {
    return res.status(403).send("Forbidden");
  }

  try {
    await bot.handleUpdate(req.body);
    return res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    return res.status(500).send("BOT ERROR");
  }
};
