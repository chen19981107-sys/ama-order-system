import express from "express";
import cors from "cors";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// LINE Messaging API 設定（從環境變數讀取）
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_NOTIFY_USER_ID = process.env.LINE_NOTIFY_USER_ID || "";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 服務靜態檔案
app.use(express.static(path.join(__dirname, "public")));

// ===== SQLite 數據庫設定 =====
import fs from "fs";

const DB_PATH = path.join(__dirname, "data", "orders.db");

// 確保 data 目錄存在
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
}

// 初始化數據庫
const db = new Database(DB_PATH);
console.log("[啟動] 已連接 SQLite 數據庫");

// 初始化數據庫表
function initializeDatabase() {
  try {
    // 出車地點表
    db.exec(`
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        location TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[啟動] locations 表已準備");

    // 訂單表
    db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        items TEXT NOT NULL,
        total_price INTEGER NOT NULL,
        note TEXT,
        location TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[啟動] orders 表已準備");

    // 店家表
    db.exec(`
      CREATE TABLE IF NOT EXISTS shops (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'shop',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[啟動] shops 表已準備");

    // 管理員表
    db.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[啟動] admins 表已準備");

    // 初始化默認數據
    initializeDefaultData();
  } catch (err) {
    console.error("[錯誤] 無法初始化數據庫:", err.message);
  }
}

// 初始化默認數據
function initializeDefaultData() {
  try {
    const shopStmt = db.prepare("INSERT OR IGNORE INTO shops (id, name, username, password, role) VALUES (?, ?, ?, ?, ?)");
    shopStmt.run("S0000", "ㄚ嬤灶咖", "shop1", "1234", "shop");
    console.log("[啟動] 默認店家已插入");

    const adminStmt = db.prepare("INSERT OR IGNORE INTO admins (id, username, password, role) VALUES (?, ?, ?, ?)");
    adminStmt.run("admin_001", "chen1107", "asd123852", "admin");
    console.log("[啟動] 默認管理員已插入");
  } catch (err) {
    console.error("[錯誤] 無法插入默認數據:", err.message);
  }
}

// 初始化數據庫
initializeDatabase();

// 健康檢查
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// 取得菜單（靜態菜單，可依需求修改）
app.get("/api/menu", (_req, res) => {
  const menu = [
    { id: 1, name: "泰式拌飯", price: 140 },
    { id: 2, name: "咖哩雞飯", price: 140 },
    { id: 3, name: "燒肉丼飯", price: 100 },
    { id: 4, name: "親子丼飯", price: 100 },
    { id: 5, name: "牛肉丼飯", price: 110 },
    { id: 6, name: "鯛魚丼飯", price: 110 },
    { id: 7, name: "虱目魚丼飯", price: 110 },
    { id: 8, name: "豬多多", price: 140 },
    { id: 9, name: "牛多多", price: 160 },
  ];
  res.json({ menu });
});

// ===== 出車地點 API =====

// 獲取指定日期的出車地點
app.get("/api/location", (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  try {
    const stmt = db.prepare("SELECT location FROM locations WHERE date = ?");
    const row = stmt.get(targetDate);
    const location = row ? row.location : "未設定";
    res.json({ location, date: targetDate });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 獲取所有日期的出車地點
app.get("/api/locations", (_req, res) => {
  try {
    const stmt = db.prepare("SELECT date, location FROM locations ORDER BY date");
    const rows = stmt.all();
    const locations = {};
    rows.forEach(row => {
      locations[row.date] = row.location;
    });
    res.json({ locations });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 設定指定日期的出車地點
app.post("/api/location", (req, res) => {
  const { date, location } = req.body;
  
  if (!date) {
    return res.status(400).json({ error: "日期不能為空" });
  }
  
  if (!location || !location.trim()) {
    return res.status(400).json({ error: "地點不能為空" });
  }
  
  const trimmedLocation = location.trim();
  
  try {
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO locations (date, location, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
    );
    stmt.run(date, trimmedLocation);
    console.log(`[${new Date().toISOString()}] ${date} 的出車地點已更新: ${trimmedLocation}`);
    res.json({ success: true, date, location: trimmedLocation });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 刪除指定日期的出車地點
app.delete("/api/location", (req, res) => {
  const { date } = req.body;
  
  if (!date) {
    return res.status(400).json({ error: "日期不能為空" });
  }
  
  try {
    const stmt = db.prepare("DELETE FROM locations WHERE date = ?");
    const result = stmt.run(date);
    if (result.changes === 0) {
      return res.status(404).json({ error: "該日期無設定地點" });
    }
    console.log(`[${new Date().toISOString()}] ${date} 的出車地點已刪除`);
    res.json({ success: true, message: `${date} 的地點已刪除` });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// ===== 登入 API =====

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  
  try {
    // 查查店家
    const shopStmt = db.prepare("SELECT * FROM shops WHERE username = ? AND password = ?");
    const shop = shopStmt.get(username, password);
    
    if (shop) {
      return res.json({
        success: true,
        user: {
          id: shop.id,
          username: shop.username,
          role: "shop",
          shopId: shop.id,
          shopName: shop.name
        }
      });
    }
    
    // 查查管理元
    const adminStmt = db.prepare("SELECT * FROM admins WHERE username = ? AND password = ?");
    const admin = adminStmt.get(username, password);
    
    if (admin) {
      return res.json({
        success: true,
        user: {
          id: admin.id,
          username: admin.username,
          role: "admin"
        }
      });
    }
    
    res.status(401).json({ error: "用戶名或密碼錯誤" });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 取得所有店家（僅管理員）
app.get("/api/shops", (req, res) => {
  const { role } = req.query;
  if (role !== "admin") {
    return res.status(403).json({ error: "權限不足" });
  }
  
  try {
    const stmt = db.prepare("SELECT id, name, username, role FROM shops");
    const shops = stmt.all();
    res.json({ shops });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// ===== 訂單 API =====

// 提交訂單
app.post("/api/order", (req, res) => {
  const { name, phone, date, time, items, totalPrice, note, location } = req.body;
  
  if (!name || !phone || !date || !time || !items || totalPrice === undefined) {
    return res.status(400).json({ error: "缺少必要欄位" });
  }
  
  try {
    const itemsJson = JSON.stringify(items);
    const stmt = db.prepare(
      "INSERT INTO orders (name, phone, date, time, items, total_price, note, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const result = stmt.run(name, phone, date, time, itemsJson, totalPrice, note || "", location || "未設定");
    const orderId = result.lastInsertRowid;
    
    console.log(`[${new Date().toISOString()}] 新訂單已保存 (ID: ${orderId})`);
    
    // 發送 LINE 通知（如果有配置）
    if (LINE_CHANNEL_ACCESS_TOKEN && LINE_NOTIFY_USER_ID) {
      const message = `新訂單通知\n姓名: ${name}\n電話: ${phone}\n日期: ${date}\n時間: ${time}\n總金額: $${totalPrice}`;
      axios.post("https://notify-api.line.me/api/notify", 
        `message=${encodeURIComponent(message)}`,
        { headers: { "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` } }
      ).catch(err => console.error("[警告] LINE 通知發送失敗:", err.message));
    }
    
    res.json({ success: true, orderId: orderId });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 獲取所有訂單
app.get("/api/orders", (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM orders ORDER BY created_at DESC");
    const rows = stmt.all();
    const orders = rows.map(row => ({
      ...row,
      items: JSON.parse(row.items)
    }));
    res.json({ orders });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 獲取指定日期的訂單
app.get("/api/orders/:date", (req, res) => {
  const { date } = req.params;
  
  try {
    const stmt = db.prepare("SELECT * FROM orders WHERE date = ? ORDER BY created_at DESC");
    const rows = stmt.all(date);
    const orders = rows.map(row => ({
      ...row,
      items: JSON.parse(row.items)
    }));
    res.json({ orders });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 更新訂單狀態
app.put("/api/order/:id", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: "狀態不能為空" });
  }
  
  try {
    const stmt = db.prepare("UPDATE orders SET status = ? WHERE id = ?");
    const result = stmt.run(status, id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "訂單不存在" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 刪除訂單
app.delete("/api/order/:id", (req, res) => {
  const { id } = req.params;
  
  try {
    const stmt = db.prepare("DELETE FROM orders WHERE id = ?");
    const result = stmt.run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "訂單不存在" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// ===== 頁面路由 =====

// 訂單表單
app.get("/order", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "order-form.html"));
});

// 店家後台
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// 管理員後台
app.get("/admin-panel", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-panel.html"));
});

// 登入頁面
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ===== 啟動服務器 =====

app.listen(PORT, () => {
  console.log(`[啟動] 服務器已啟動，監聽端口 ${PORT}`);
  console.log(`[啟動] 訪問 http://localhost:${PORT}`);
});
