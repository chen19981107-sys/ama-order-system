const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// 數據庫配置
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ama_order_system",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 創建連接池
let pool;

// 初始化數據庫
async function initializeDatabase() {
  try {
    pool = mysql.createPool(dbConfig);
    
    const connection = await pool.getConnection();
    
    // 創建表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        date DATE NOT NULL,
        time VARCHAR(10) NOT NULL,
        items JSON NOT NULL,
        totalPrice INT DEFAULT 0,
        note TEXT,
        location VARCHAR(200),
        status VARCHAR(50) DEFAULT 'making',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_date (date),
        INDEX idx_phone (phone)
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date DATE UNIQUE NOT NULL,
        location VARCHAR(200),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    connection.release();
    console.log("✅ 數據庫初始化成功");
  } catch (err) {
    console.error("❌ 數據庫初始化失敗:", err.message);
    // 如果數據庫不存在，嘗試創建
    if (err.code === "ER_BAD_DB_ERROR") {
      console.log("正在創建數據庫...");
      const tempConfig = { ...dbConfig };
      delete tempConfig.database;
      const tempPool = mysql.createPool(tempConfig);
      const connection = await tempPool.getConnection();
      await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
      connection.release();
      tempPool.end();
      // 重新初始化
      await initializeDatabase();
    }
  }
}

// 中間件
app.use(cors());
app.use(express.json());

// 靜態文件服務
const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// 提供 login.html 作為 / 和 /login 端點
app.get("/", (req, res) => {
  const loginPath = path.join(__dirname, "public", "login.html");
  if (fs.existsSync(loginPath)) {
    res.sendFile(loginPath);
  } else {
    res.status(404).send("login.html not found");
  }
});

app.get("/login", (req, res) => {
  const loginPath = path.join(__dirname, "public", "login.html");
  if (fs.existsSync(loginPath)) {
    res.sendFile(loginPath);
  } else {
    res.status(404).send("login.html not found");
  }
});

// 提供 order-form.html 作為 /order 端點
app.get("/order", (req, res) => {
  const orderFormPath = path.join(__dirname, "public", "order-form.html");
  if (fs.existsSync(orderFormPath)) {
    res.sendFile(orderFormPath);
  } else {
    res.status(404).send("order-form.html not found");
  }
});

// 提供 admin.html 作為 /admin 端點
app.get("/admin", (req, res) => {
  const adminPath = path.join(__dirname, "public", "admin.html");
  if (fs.existsSync(adminPath)) {
    res.sendFile(adminPath);
  } else {
    res.status(404).send("admin.html not found");
  }
});

// 提供 admin-panel.html 作為 /admin-panel 端點
app.get("/admin-panel", (req, res) => {
  const adminPanelPath = path.join(__dirname, "public", "admin-panel.html");
  if (fs.existsSync(adminPanelPath)) {
    res.sendFile(adminPanelPath);
  } else {
    res.status(404).send("admin-panel.html not found");
  }
});

// ===== 出車地點 API =====

// 獲取指定日期的出車地點
app.get("/api/location", async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      "SELECT location FROM locations WHERE date = ?",
      [targetDate]
    );
    connection.release();
    
    const location = rows.length > 0 ? rows[0].location : "未設定";
    console.log(`✅ 查詢地點成功: ${targetDate} -> ${location}`);
    res.json({ location, date: targetDate });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 獲取所有日期的出車地點
app.get("/api/locations", async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query("SELECT date, location FROM locations");
    connection.release();
    
    const locations = {};
    rows.forEach(row => {
      locations[row.date.toISOString().split('T')[0]] = row.location;
    });
    
    console.log("✅ 查詢所有地點成功");
    res.json({ locations });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 設定指定日期的出車地點
app.post("/api/location", async (req, res) => {
  try {
    const { date, location } = req.body;
    
    if (!date) {
      return res.status(400).json({ error: "日期不能為空" });
    }
    
    const connection = await pool.getConnection();
    await connection.query(
      "INSERT INTO locations (date, location) VALUES (?, ?) ON DUPLICATE KEY UPDATE location = ?",
      [date, location || "未設定", location || "未設定"]
    );
    connection.release();
    
    console.log(`✅ 設定地點成功: ${date} -> ${location}`);
    res.json({ success: true, message: "地點已設定" });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 刪除指定日期的出車地點
app.delete("/api/location", async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: "日期不能為空" });
    }
    
    const connection = await pool.getConnection();
    await connection.query("DELETE FROM locations WHERE date = ?", [date]);
    connection.release();
    
    console.log(`✅ 刪除地點成功: ${date}`);
    res.json({ success: true, message: "地點已刪除" });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// ===== 訂單 API =====

// 提交訂單
app.post("/api/order", async (req, res) => {
  try {
    const { name, phone, date, time, items, totalPrice, note, location } = req.body;
    
    // 驗證必要字段
    if (!name || !phone || !date || !time || !items || items.length === 0) {
      return res.status(400).json({ error: "缺少必要字段" });
    }
    
    const connection = await pool.getConnection();
    const [result] = await connection.query(
      "INSERT INTO orders (name, phone, date, time, items, totalPrice, note, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [name, phone, date, time, JSON.stringify(items), totalPrice, note || null, location || "未設定"]
    );
    connection.release();
    
    const orderId = result.insertId;
    console.log(`✅ 新訂單已保存 (ID: ${orderId})`);
    res.json({ success: true, orderId, message: "訂單已提交" });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 獲取所有訂單
app.get("/api/orders", async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      "SELECT * FROM orders ORDER BY createdAt DESC"
    );
    connection.release();
    
    const orders = rows.map(row => ({
      ...row,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items
    }));
    
    console.log(`✅ 查詢訂單成功，共 ${orders.length} 筆`);
    res.json({ orders });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 按日期查詢訂單
app.get("/api/orders/:date", async (req, res) => {
  try {
    const { date } = req.params;
    
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      "SELECT * FROM orders WHERE date = ? ORDER BY createdAt DESC",
      [date]
    );
    connection.release();
    
    const orders = rows.map(row => ({
      ...row,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items
    }));
    
    console.log(`✅ 查詢 ${date} 的訂單成功，共 ${orders.length} 筆`);
    res.json({ orders });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 更新訂單狀態
app.put("/api/order/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: "狀態不能為空" });
    }
    
    const connection = await pool.getConnection();
    const [result] = await connection.query(
      "UPDATE orders SET status = ? WHERE id = ?",
      [status, id]
    );
    connection.release();
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "訂單不存在" });
    }
    
    console.log(`✅ 訂單狀態已更新 (ID: ${id}, 狀態: ${status})`);
    res.json({ success: true, message: "訂單已更新" });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 刪除訂單
app.delete("/api/order/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    const [result] = await connection.query(
      "DELETE FROM orders WHERE id = ?",
      [id]
    );
    connection.release();
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "訂單不存在" });
    }
    
    console.log(`✅ 訂單已刪除 (ID: ${id})`);
    res.json({ success: true, message: "訂單已刪除" });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 健康檢查
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// 啟動服務器
async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`🚀 服務器已啟動: http://localhost:${PORT}`);
    console.log(`📄 點餐頁面: http://localhost:${PORT}/order`);
    console.log(`📊 管理後台: http://localhost:${PORT}/admin-panel`);
  });
}

startServer().catch(err => {
  console.error("❌ 服務器啟動失敗:", err);
  process.exit(1);
});
