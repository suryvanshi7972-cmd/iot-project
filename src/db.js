const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, 'iot.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log(`Connected to SQLite database at: ${dbPath}`);
  }
});

// Promisified DB helpers
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize schema
const initDB = async () => {
  try {
    // 1. Users table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Sensor readings table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS sensor_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        temperature REAL NOT NULL,
        humidity REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Index for fast pagination and sorting
    await dbRun(`
      CREATE INDEX IF NOT EXISTS idx_sensor_created_at 
      ON sensor_readings (created_at DESC)
    `);

    // 3. Device state table (Key-Value for LED, LCD, etc.)
    await dbRun(`
      CREATE TABLE IF NOT EXISTS device_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default LED state if not present
    const ledState = await dbGet(`SELECT value FROM device_state WHERE key = 'led_status'`);
    if (!ledState) {
      await dbRun(
        `INSERT INTO device_state (key, value) VALUES ('led_status', 'false')`
      );
    }

    // Seed default LCD message if not present
    const lcdState = await dbGet(`SELECT value FROM device_state WHERE key = 'lcd_message'`);
    if (!lcdState) {
      const defaultLcd = JSON.stringify({
        row1: 'TSS GROUP 4',
        row2: 'SYSTEM ONLINE'
      });
      await dbRun(
        `INSERT INTO device_state (key, value) VALUES ('lcd_message', ?)`,
        [defaultLcd]
      );
    }

    // Optional: Seed demo sensor data if table is completely empty
    const countRow = await dbGet(`SELECT COUNT(*) as count FROM sensor_readings`);
    if (countRow && countRow.count === 0) {
      console.log('Seeding initial environment data for demo...');
      const now = Date.now();
      for (let i = 15; i >= 0; i--) {
        const dummyTime = new Date(now - i * 30000).toISOString();
        const dummyTemp = +(26.5 + (Math.sin(i) * 2.5)).toFixed(1);
        const dummyHum = +(58.0 + (Math.cos(i) * 5.0)).toFixed(1);
        await dbRun(
          `INSERT INTO sensor_readings (temperature, humidity, created_at) VALUES (?, ?, ?)`,
          [dummyTemp, dummyHum, dummyTime]
        );
      }
    }

    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
};

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDB
};
