const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// 使用 /tmp 目錄存儲數據（Vercel 無法持久化，但本地可以）
const DATA_DIR = process.env.NODE_ENV === "production" ? "/tmp" : path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const LOCATIONS_FILE = path.join(DATA_DIR, "locations.json");

// 確保數據目錄存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 初始化數據文件
function initializeDataFiles() {
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(LOCATIONS_FILE)) {
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify({}, null, 2));
  }
}

initializeDataFiles();

// 中間件
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ===== 出車地點 API =====

// 獲取指定日期的出車地點
app.get("/api/location", (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE, "utf8"));
    const location = locations[targetDate] || "未設定";
    
    console.log(`✅ 查詢地點成功: ${targetDate} -> ${location}`);
    res.json({ location, date: targetDate });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 獲取所有日期的出車地點
app.get("/api/locations", (_req, res) => {
  try {
    const locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE, "utf8"));
    console.log("✅ 查詢所有地點成功");
    res.json({ locations });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 設定指定日期的出車地點
app.post("/api/location", (req, res) => {
  try {
    const { date, location } = req.body;
    
    if (!date) {
      return res.status(400).json({ error: "日期不能為空" });
    }
    
    const locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE, "utf8"));
    locations[date] = location || "未設定";
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2));
    
    console.log(`✅ 設定地點成功: ${date} -> ${location}`);
    res.json({ success: true, message: "地點已設定" });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 刪除指定日期的出車地點
app.delete("/api/location", (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: "日期不能為空" });
    }
    
    const locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE, "utf8"));
    delete locations[date];
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2));
    
    console.log(`✅ 刪除地點成功: ${date}`);
    res.json({ success: true, message: "地點已刪除" });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// ===== 訂單 API =====

// 提交訂單
app.post("/api/order", (req, res) => {
  try {
    const { name, phone, date, time, items, totalPrice, note, location } = req.body;
    
    // 驗證必要字段
    if (!name || !phone || !date || !time || !items || items.length === 0) {
      return res.status(400).json({ error: "缺少必要字段" });
    }
    
    const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    
    const orderId = orders.length > 0 ? Math.max(...orders.map(o => o.id)) + 1 : 1;
    
    const newOrder = {
      id: orderId,
      name,
      phone,
      date,
      time,
      items,
      totalPrice,
      note: note || null,
      location: location || "未設定",
      createdAt: new Date().toISOString()
    };
    
    orders.push(newOrder);
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    
    console.log(`✅ 新訂單已保存 (ID: ${orderId})`);
    res.json({ success: true, orderId, message: "訂單已提交" });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 獲取所有訂單
app.get("/api/orders", (_req, res) => {
  try {
    const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    console.log(`✅ 查詢訂單成功，共 ${orders.length} 筆`);
    res.json({ orders: orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 按日期查詢訂單
app.get("/api/orders/:date", (req, res) => {
  try {
    const { date } = req.params;
    const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    const filteredOrders = orders.filter(o => o.date === date).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    console.log(`✅ 查詢 ${date} 的訂單成功，共 ${filteredOrders.length} 筆`);
    res.json({ orders: filteredOrders });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 更新訂單狀態
app.put("/api/order/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: "狀態不能為空" });
    }
    
    const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    const order = orders.find(o => o.id === parseInt(id));
    
    if (!order) {
      return res.status(404).json({ error: "訂單不存在" });
    }
    
    order.status = status;
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    
    console.log(`✅ 訂單狀態已更新 (ID: ${id}, 狀態: ${status})`);
    res.json({ success: true, message: "訂單已更新" });
  } catch (err) {
    console.error("[錯誤]", err.message);
    res.status(500).json({ error: "數據庫錯誤" });
  }
});

// 刪除訂單
app.delete("/api/order/:id", (req, res) => {
  try {
    const { id } = req.params;
    
    const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    const index = orders.findIndex(o => o.id === parseInt(id));
    
    if (index === -1) {
      return res.status(404).json({ error: "訂單不存在" });
    }
    
    orders.splice(index, 1);
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    
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
app.listen(PORT, () => {
  console.log(`🚀 服務器已啟動: http://localhost:${PORT}`);
  console.log(`📄 點餐頁面: http://localhost:${PORT}/order`);
});
