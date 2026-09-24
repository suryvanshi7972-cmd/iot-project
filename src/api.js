const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('./db');

// Helper to format ISO timestamp to Asia/Kolkata (+5:30)
function formatKolkataDateTime(isoString) {
  // Ensure we treat the UTC timestamp properly
  const date = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');

  // Intl formatting for Asia/Kolkata
  const timeFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  const dateFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return {
    time: timeFormatter.format(date),
    date: dateFormatter.format(date)
  };
}

// -------------------------------------------------------------
// SENSOR ENDPOINTS (DHT11)
// -------------------------------------------------------------

// POST /api/sensor/data - ESP8266 pushes temperature and humidity
router.post('/sensor/data', async (req, res) => {
  try {
    const { temperature, humidity } = req.body;

    if (temperature === undefined || humidity === undefined) {
      return res.status(400).json({ success: false, message: 'Missing temperature or humidity data' });
    }

    const tempNum = parseFloat(temperature);
    const humNum = parseFloat(humidity);

    if (isNaN(tempNum) || isNaN(humNum)) {
      return res.status(400).json({ success: false, message: 'Invalid sensor values' });
    }

    const nowISO = new Date().toISOString();
    const result = await dbRun(
      'INSERT INTO sensor_readings (temperature, humidity, created_at) VALUES (?, ?, ?)',
      [tempNum, humNum, nowISO]
    );

    const kolkata = formatKolkataDateTime(nowISO);

    return res.status(201).json({
      success: true,
      message: 'Sensor reading saved successfully',
      data: {
        id: result.lastID,
        temperature: tempNum,
        humidity: humNum,
        time: kolkata.time,
        date: kolkata.date,
        rawTimestamp: nowISO
      }
    });
  } catch (error) {
    console.error('Error saving sensor data:', error);
    return res.status(500).json({ success: false, message: 'Failed to record sensor reading' });
  }
});

// GET /api/sensor/latest - Get the most recent sensor reading
router.get('/sensor/latest', async (req, res) => {
  try {
    const latest = await dbGet('SELECT * FROM sensor_readings ORDER BY created_at DESC LIMIT 1');

    if (!latest) {
      return res.json({
        success: true,
        data: {
          temperature: 0.0,
          humidity: 0.0,
          time: '--:--:--',
          date: '--/--/----',
          rawTimestamp: null
        }
      });
    }

    const kolkata = formatKolkataDateTime(latest.created_at);

    // Get today's min and max temperature
    const stats = await dbGet(`
      SELECT 
        MIN(temperature) as minTemp, 
        MAX(temperature) as maxTemp,
        AVG(temperature) as avgTemp,
        MIN(humidity) as minHum,
        MAX(humidity) as maxHum
      FROM sensor_readings
      WHERE created_at >= datetime('now', '-24 hours')
    `);

    return res.json({
      success: true,
      data: {
        id: latest.id,
        temperature: latest.temperature,
        humidity: latest.humidity,
        time: kolkata.time,
        date: kolkata.date,
        rawTimestamp: latest.created_at,
        stats: stats || {}
      }
    });
  } catch (error) {
    console.error('Error fetching latest sensor data:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving sensor data' });
  }
});

// GET /api/sensor/history - Paginated records (20 per page, latest first)
router.get('/sensor/history', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const countRow = await dbGet('SELECT COUNT(*) as total FROM sensor_readings');
    const totalRecords = countRow ? countRow.total : 0;
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    const rows = await dbAll(
      'SELECT * FROM sensor_readings ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    const formattedRecords = rows.map((r, index) => {
      const kolkata = formatKolkataDateTime(r.created_at);
      return {
        rowNumber: offset + index + 1,
        id: r.id,
        temperature: r.temperature,
        humidity: r.humidity,
        time: kolkata.time,
        date: kolkata.date,
        rawTimestamp: r.created_at
      };
    });

    return res.json({
      success: true,
      page,
      limit,
      totalPages,
      totalRecords,
      data: formattedRecords
    });
  } catch (error) {
    console.error('Error retrieving sensor history:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve sensor history' });
  }
});

// GET /api/sensor/chart - Recent readings for Chart.js graphing
router.get('/sensor/chart', async (req, res) => {
  try {
    const limit = Math.max(10, Math.min(50, parseInt(req.query.limit) || 20));
    const rows = await dbAll(
      'SELECT * FROM sensor_readings ORDER BY created_at DESC, id DESC LIMIT ?',
      [limit]
    );

    // Reverse to chronological order (oldest to newest) for chart plotting
    const chronological = rows.reverse().map(r => {
      const kolkata = formatKolkataDateTime(r.created_at);
      return {
        id: r.id,
        temperature: r.temperature,
        humidity: r.humidity,
        label: kolkata.time
      };
    });

    return res.json({
      success: true,
      data: chronological
    });
  } catch (error) {
    console.error('Error retrieving chart data:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve chart data' });
  }
});

// DELETE /api/sensor/:id - Delete a specific record
router.delete('/sensor/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }

    const result = await dbRun('DELETE FROM sensor_readings WHERE id = ?', [id]);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    return res.json({ success: true, message: `Record #${id} deleted successfully` });
  } catch (error) {
    console.error('Error deleting record:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete record' });
  }
});

// DELETE /api/sensor/clear/all - Clear all history records
router.delete('/sensor/clear/all', async (req, res) => {
  try {
    await dbRun('DELETE FROM sensor_readings');
    return res.json({ success: true, message: 'All sensor records cleared successfully.' });
  } catch (error) {
    console.error('Error clearing sensor data:', error);
    return res.status(500).json({ success: false, message: 'Failed to clear sensor records.' });
  }
});

// -------------------------------------------------------------
// SMART LCD 16x2 ENDPOINTS
// -------------------------------------------------------------

// GET /api/lcd - Get current LCD content
router.get('/lcd', async (req, res) => {
  try {
    const row = await dbGet(`SELECT value, updated_at FROM device_state WHERE key = 'lcd_message'`);
    let lcdData = { row1: 'TSS GROUP 4', row2: 'SYSTEM ONLINE' };

    if (row && row.value) {
      try {
        lcdData = JSON.parse(row.value);
      } catch (e) {
        lcdData = { row1: row.value.slice(0, 16), row2: '' };
      }
    }

    return res.json({
      success: true,
      row1: lcdData.row1 || '',
      row2: lcdData.row2 || '',
      updated_at: row ? row.updated_at : new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching LCD data:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch LCD text' });
  }
});

// POST /api/lcd - Update LCD Row 1 and Row 2
router.post('/lcd', async (req, res) => {
  try {
    let { row1 = '', row2 = '' } = req.body;

    // Enforce 16 chars per row limit
    row1 = String(row1).substring(0, 16);
    row2 = String(row2).substring(0, 16);

    const lcdPayload = JSON.stringify({ row1, row2 });
    const nowISO = new Date().toISOString();

    await dbRun(
      `INSERT INTO device_state (key, value, updated_at) 
       VALUES ('lcd_message', ?, ?) 
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [lcdPayload, nowISO]
    );

    return res.json({
      success: true,
      message: 'LCD display updated successfully!',
      lcd: { row1, row2, updated_at: nowISO }
    });
  } catch (error) {
    console.error('Error updating LCD:', error);
    return res.status(500).json({ success: false, message: 'Failed to update LCD display' });
  }
});

// -------------------------------------------------------------
// LED AUTOMATION ENDPOINTS
// -------------------------------------------------------------

// GET /api/led - Get current LED state
router.get('/led', async (req, res) => {
  try {
    const row = await dbGet(`SELECT value, updated_at FROM device_state WHERE key = 'led_status'`);
    const status = row && row.value === 'true';

    return res.json({
      success: true,
      status: status,
      updated_at: row ? row.updated_at : new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching LED state:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch LED status' });
  }
});

// POST /api/led - Set or toggle LED state
router.post('/led', async (req, res) => {
  try {
    let newStatus;
    if (req.body.status !== undefined) {
      newStatus = Boolean(req.body.status);
    } else {
      // Toggle if not provided
      const current = await dbGet(`SELECT value FROM device_state WHERE key = 'led_status'`);
      newStatus = !(current && current.value === 'true');
    }

    const nowISO = new Date().toISOString();
    await dbRun(
      `INSERT INTO device_state (key, value, updated_at) 
       VALUES ('led_status', ?, ?) 
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [newStatus ? 'true' : 'false', nowISO]
    );

    return res.json({
      success: true,
      status: newStatus,
      message: `LED turned ${newStatus ? 'ON' : 'OFF'}`,
      updated_at: nowISO
    });
  } catch (error) {
    console.error('Error updating LED:', error);
    return res.status(500).json({ success: false, message: 'Failed to toggle LED' });
  }
});

// -------------------------------------------------------------
// ESP8266 UNIFIED DEVICE SYNC ENDPOINT
// -------------------------------------------------------------
// Syncs sensor data from ESP8266 and returns current actuator targets (LED & LCD)
router.all('/device/sync', async (req, res) => {
  try {
    // If ESP sent sensor data in POST body, save it
    if (req.method === 'POST' && req.body && (req.body.temperature !== undefined || req.body.humidity !== undefined)) {
      const tempNum = parseFloat(req.body.temperature);
      const humNum = parseFloat(req.body.humidity);
      if (!isNaN(tempNum) && !isNaN(humNum)) {
        await dbRun(
          'INSERT INTO sensor_readings (temperature, humidity, created_at) VALUES (?, ?, ?)',
          [tempNum, humNum, new Date().toISOString()]
        );
      }
    }

    // Retrieve LED status
    const ledRow = await dbGet(`SELECT value FROM device_state WHERE key = 'led_status'`);
    const ledStatus = ledRow && ledRow.value === 'true';

    // Retrieve LCD message
    const lcdRow = await dbGet(`SELECT value FROM device_state WHERE key = 'lcd_message'`);
    let lcdData = { row1: 'TSS GROUP 4', row2: 'SYSTEM ONLINE' };
    if (lcdRow && lcdRow.value) {
      try {
        lcdData = JSON.parse(lcdRow.value);
      } catch (e) {
        lcdData = { row1: lcdRow.value.slice(0, 16), row2: '' };
      }
    }

    return res.json({
      success: true,
      led: { status: ledStatus },
      lcd: lcdData,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /api/device/sync:', error);
    return res.status(500).json({ success: false, message: 'Sync failed' });
  }
});

module.exports = router;
