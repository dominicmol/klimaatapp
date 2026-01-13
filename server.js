/**
 * KLIMAATAPP BACKEND
 * Node.js + Express + MySQL
 * 
 * API Endpoints:
 * - GET  /api/rooms              - Alle kamers ophalen
 * - GET  /api/rooms/:id          - Kamer met devices en laatste metingen
 * - POST /api/rooms              - Nieuwe kamer aanmaken
 * - PUT  /api/rooms/:id          - Kamer bijwerken
 * - DELETE /api/rooms/:id        - Kamer verwijderen
 * - GET  /api/devices            - Alle devices (optioneel: ?unassigned=1)
 * - PUT  /api/devices/:dev_eui/room - Device aan kamer koppelen/ontkoppelen
 * - GET  /api/measurements       - Historische metingen (met filters)
 * - GET  /api/measurements/chart - Data voor grafieken (per uur)
 * - POST /api/webhook/ttn        - TTN Webhook ontvanger
 * - DELETE /api/measurements/cleanup - Verwijder oude data (ouder dan 4 dagen)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection pool
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    port: process.env.MYSQL_PORT || process.env.DB_PORT || 3306,
    user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'klimaatapp',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection on startup
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('[OK] Database connected successfully');
        connection.release();
    } catch (error) {
        console.error('[ERROR] Database connection failed:', error.message);
    }
}

// ============================================
// DATA CLEANUP - Verwijder data ouder dan 4 dagen
// ============================================

// Cleanup functie - wordt aangeroepen bij elke webhook EN kan handmatig
async function cleanupOldData() {
    try {
        const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
        
        const [result] = await pool.query(
            'DELETE FROM measurements WHERE measured_at < ?',
            [fourDaysAgo]
        );
        
        if (result.affectedRows > 0) {
            console.log('[CLEANUP] Deleted', result.affectedRows, 'old measurements');
        }
        
        return result.affectedRows;
    } catch (error) {
        console.error('[ERROR] Cleanup failed:', error.message);
        return 0;
    }
}

// Handmatige cleanup endpoint
app.delete('/api/measurements/cleanup', async (req, res) => {
    try {
        const deleted = await cleanupOldData();
        res.json({ 
            success: true, 
            message: 'Cleanup completed',
            deleted_rows: deleted
        });
    } catch (error) {
        res.status(500).json({ error: 'Cleanup failed' });
    }
});

// ============================================
// API ROUTES - ROOMS
// ============================================

// GET /api/rooms - Alle kamers met device count en laatste meetwaarden
app.get('/api/rooms', async (req, res) => {
    try {
        const [rooms] = await pool.query(`
            SELECT 
                r.room_id,
                r.name,
                r.created_at,
                COUNT(DISTINCT d.dev_eui) as device_count
            FROM rooms r
            LEFT JOIN devices d ON r.room_id = d.room_id
            GROUP BY r.room_id
            ORDER BY r.name
        `);

        // Voor elke kamer, haal laatste temperatuur en humidity op
        for (let room of rooms) {
            const [latestReadings] = await pool.query(`
                SELECT 
                    s.type,
                    m.value,
                    m.measured_at
                FROM measurements m
                JOIN sensors s ON m.dev_eui = s.dev_eui AND m.channel = s.channel
                JOIN devices d ON s.dev_eui = d.dev_eui
                WHERE d.room_id = ?
                AND s.type IN ('temperature', 'humidity')
                AND m.measured_at = (
                    SELECT MAX(m2.measured_at)
                    FROM measurements m2
                    WHERE m2.dev_eui = m.dev_eui AND m2.channel = m.channel
                )
            `, [room.room_id]);

            room.latest = {};
            latestReadings.forEach(r => {
                room.latest[r.type] = { value: r.value, measured_at: r.measured_at };
            });

            // Check if any device is online (last seen within 30 min)
            const [onlineCheck] = await pool.query(`
                SELECT MAX(last_seen_at) as last_seen
                FROM devices
                WHERE room_id = ?
            `, [room.room_id]);
            
            const lastSeen = onlineCheck[0]?.last_seen;
            room.is_online = lastSeen && (Date.now() - new Date(lastSeen).getTime()) < 30 * 60 * 1000;
        }

        res.json(rooms);
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/rooms/:id - Kamer detail met alle devices en sensoren
app.get('/api/rooms/:id', async (req, res) => {
    try {
        const roomId = req.params.id;

        // Haal kamer op
        const [rooms] = await pool.query('SELECT * FROM rooms WHERE room_id = ?', [roomId]);
        if (rooms.length === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }
        const room = rooms[0];

        // Haal devices op
        const [devices] = await pool.query(`
            SELECT * FROM devices WHERE room_id = ? ORDER BY name
        `, [roomId]);

        // Voor elk device, haal sensoren en laatste metingen op
        for (let device of devices) {
            const [sensors] = await pool.query(`
                SELECT s.*, 
                    (SELECT m.value FROM measurements m 
                     WHERE m.dev_eui = s.dev_eui AND m.channel = s.channel 
                     ORDER BY m.measured_at DESC LIMIT 1) as latest_value,
                    (SELECT m.measured_at FROM measurements m 
                     WHERE m.dev_eui = s.dev_eui AND m.channel = s.channel 
                     ORDER BY m.measured_at DESC LIMIT 1) as latest_measured_at
                FROM sensors s
                WHERE s.dev_eui = ?
                ORDER BY s.channel
            `, [device.dev_eui]);
            
            device.sensors = sensors;
            device.is_online = device.last_seen_at && 
                (Date.now() - new Date(device.last_seen_at).getTime()) < 30 * 60 * 1000;
        }

        room.devices = devices;
        res.json(room);
    } catch (error) {
        console.error('Error fetching room:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/rooms - Nieuwe kamer aanmaken
app.post('/api/rooms', async (req, res) => {
    try {
        const { name } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Room name is required' });
        }

        const [result] = await pool.query(
            'INSERT INTO rooms (name) VALUES (?)',
            [name.trim()]
        );

        res.status(201).json({
            room_id: result.insertId,
            name: name.trim(),
            message: 'Room created successfully'
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Room name already exists' });
        }
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// PUT /api/rooms/:id - Kamer bijwerken
app.put('/api/rooms/:id', async (req, res) => {
    try {
        const roomId = req.params.id;
        const { name } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Room name is required' });
        }

        const [result] = await pool.query(
            'UPDATE rooms SET name = ? WHERE room_id = ?',
            [name.trim(), roomId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }

        res.json({ message: 'Room updated successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Room name already exists' });
        }
        console.error('Error updating room:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// DELETE /api/rooms/:id - Kamer verwijderen
app.delete('/api/rooms/:id', async (req, res) => {
    try {
        const roomId = req.params.id;

        // Devices worden automatisch losgekoppeld (ON DELETE SET NULL)
        const [result] = await pool.query('DELETE FROM rooms WHERE room_id = ?', [roomId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }

        res.json({ message: 'Room deleted successfully' });
    } catch (error) {
        console.error('Error deleting room:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// ============================================
// API ROUTES - DEVICES
// ============================================

// GET /api/devices - Alle devices ophalen (optioneel: ?unassigned=1 voor alleen niet-gekoppelde)
app.get('/api/devices', async (req, res) => {
    try {
        const { unassigned } = req.query;

        let query = `
            SELECT d.dev_eui, d.name, d.room_id, d.last_seen_at, r.name as room_name
            FROM devices d
            LEFT JOIN rooms r ON d.room_id = r.room_id
        `;

        if (unassigned === '1') {
            query += ' WHERE d.room_id IS NULL';
        }

        query += ' ORDER BY d.name';

        const [devices] = await pool.query(query);
        res.json(devices);
    } catch (error) {
        console.error('Error fetching devices:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// PUT /api/devices/:dev_eui/room - Device aan kamer koppelen of ontkoppelen
app.put('/api/devices/:dev_eui/room', async (req, res) => {
    try {
        const devEui = req.params.dev_eui;
        const { room_id } = req.body;

        // Check of device bestaat
        const [existingDevice] = await pool.query(
            'SELECT dev_eui FROM devices WHERE dev_eui = ?',
            [devEui]
        );

        if (existingDevice.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Als room_id meegegeven is, check of kamer bestaat
        if (room_id !== null && room_id !== undefined) {
            const [rooms] = await pool.query(
                'SELECT room_id FROM rooms WHERE room_id = ?',
                [room_id]
            );
            if (rooms.length === 0) {
                return res.status(400).json({ error: 'Room not found' });
            }
        }

        // Update device room_id (null = ontkoppelen)
        await pool.query(
            'UPDATE devices SET room_id = ? WHERE dev_eui = ?',
            [room_id || null, devEui]
        );

        res.json({ 
            message: room_id ? 'Device gekoppeld aan kamer' : 'Device ontkoppeld van kamer',
            dev_eui: devEui,
            room_id: room_id || null
        });
    } catch (error) {
        console.error('Error updating device room:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// ============================================
// API ROUTES - MEASUREMENTS
// ============================================

// GET /api/measurements - Historische metingen met filters (max 4 dagen)
app.get('/api/measurements', async (req, res) => {
    try {
        const { room_id, sensor_type, limit = 100 } = req.query;
        
        // Alleen data van laatste 4 dagen
        const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
        
        let query = `
            SELECT 
                m.id,
                m.value,
                m.measured_at,
                s.type as sensor_type,
                s.unit,
                d.dev_eui,
                d.name as device_name,
                r.name as room_name,
                r.room_id
            FROM measurements m
            JOIN sensors s ON m.dev_eui = s.dev_eui AND m.channel = s.channel
            JOIN devices d ON m.dev_eui = d.dev_eui
            LEFT JOIN rooms r ON d.room_id = r.room_id
            WHERE m.measured_at >= ?
        `;
        const params = [fourDaysAgo];

        if (room_id) {
            query += ' AND r.room_id = ?';
            params.push(room_id);
        }

        if (sensor_type) {
            query += ' AND s.type = ?';
            params.push(sensor_type);
        }

        query += ' ORDER BY m.measured_at DESC LIMIT ?';
        params.push(parseInt(limit));

        const [measurements] = await pool.query(query, params);
        res.json(measurements);
    } catch (error) {
        console.error('Error fetching measurements:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/measurements/chart - Data voor grafieken (per UUR, per device)
app.get('/api/measurements/chart', async (req, res) => {
    try {
        const { room_id, sensor_type } = req.query;
        
        // Laatste 4 dagen
        const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

        let query = `
            SELECT 
                d.name as device_name,
                d.dev_eui,
                s.type as sensor_type,
                s.unit,
                DATE_FORMAT(m.measured_at, '%Y-%m-%d %H:00:00') as hour,
                AVG(m.value) as avg_value,
                MIN(m.value) as min_value,
                MAX(m.value) as max_value,
                COUNT(*) as measurement_count
            FROM measurements m
            JOIN sensors s ON m.dev_eui = s.dev_eui AND m.channel = s.channel
            JOIN devices d ON m.dev_eui = d.dev_eui
            LEFT JOIN rooms r ON d.room_id = r.room_id
            WHERE m.measured_at >= ?
        `;
        const params = [fourDaysAgo];

        if (room_id) {
            query += ' AND r.room_id = ?';
            params.push(room_id);
        }

        if (sensor_type) {
            query += ' AND s.type = ?';
            params.push(sensor_type);
        }

        query += ` GROUP BY d.dev_eui, d.name, s.type, s.unit, hour ORDER BY hour ASC, d.name`;

        const [data] = await pool.query(query, params);
        res.json(data);
    } catch (error) {
        console.error('Error fetching chart data:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/sensor-types - Beschikbare sensor types ophalen
app.get('/api/sensor-types', async (req, res) => {
    try {
        const [types] = await pool.query(`
            SELECT DISTINCT type, unit 
            FROM sensors 
            WHERE type IS NOT NULL AND type != 'unknown'
            ORDER BY type
        `);
        res.json(types);
    } catch (error) {
        console.error('Error fetching sensor types:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// ============================================
// TTN WEBHOOK
// ============================================

// POST /api/webhook/ttn - Ontvang data van The Things Network
app.post('/api/webhook/ttn', async (req, res) => {
    try {
        console.log('[WEBHOOK] TTN data received');
        
        // Cleanup oude data bij elke webhook (efficiënt)
        cleanupOldData();
        
        const payload = req.body;
        
        // Extract device info
        const devEui = payload.end_device_ids?.dev_eui;
        const deviceId = payload.end_device_ids?.device_id;
        const receivedAt = payload.received_at || new Date().toISOString();
        const decodedPayload = payload.uplink_message?.decoded_payload;

        if (!devEui) {
            console.log('[WARNING] No dev_eui in payload');
            return res.status(400).json({ error: 'Missing dev_eui' });
        }

        if (!decodedPayload) {
            console.log('[WARNING] No decoded_payload in payload');
            return res.status(400).json({ error: 'Missing decoded_payload' });
        }

        console.log('[DEVICE]', devEui);
        console.log('[DATA]', decodedPayload);

        // Check of device bestaat, zo niet maak aan
        const [existingDevice] = await pool.query(
            'SELECT * FROM devices WHERE dev_eui = ?',
            [devEui]
        );

        if (existingDevice.length === 0) {
            // Maak nieuw device aan (zonder kamer)
            await pool.query(
                'INSERT INTO devices (dev_eui, name) VALUES (?, ?)',
                [devEui, deviceId || 'Device ' + devEui.slice(-4)]
            );
            console.log('[NEW] Device created:', devEui);
        }

        // Update last_seen_at
        await pool.query(
            'UPDATE devices SET last_seen_at = ? WHERE dev_eui = ?',
            [new Date(receivedAt), devEui]
        );

        // Channel mapping volgens Bart:
        // Channel 1 = relatieve luchtvochtigheid [%]
        // Channel 2 = temperatuur [Celsius]
        // Channel 3 = procentuele aanwezigheid [%]
        // Channel 4 = CO2 [ppm]
        // Channel 5 = Licht [%]
        // Channel 6 = Ruis [dB]
        const channelMapping = {
            1: { type: 'humidity', unit: '%' },
            2: { type: 'temperature', unit: 'C' },
            3: { type: 'presence', unit: '%' },
            4: { type: 'co2', unit: 'ppm' },
            5: { type: 'light', unit: '%' },
            6: { type: 'noise', unit: 'dB' }
        };

        let savedCount = 0;

        for (const [key, value] of Object.entries(decodedPayload)) {
            if (typeof value !== 'number') continue;

            // Haal channel nummer uit key (bijv. "temperature_2" -> 2)
            const channelMatch = key.match(/_(\d+)$/);
            if (!channelMatch) continue;
            
            const channelNum = parseInt(channelMatch[1]);
            const mapping = channelMapping[channelNum];
            
            if (!mapping) continue;

            const sensorType = mapping.type;
            const unit = mapping.unit;

            // Sensor aanmaken OF updaten (upsert)
            await pool.query(
                `INSERT INTO sensors (dev_eui, channel, type, unit)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    type = VALUES(type),
                    unit = VALUES(unit)`,
                [devEui, channelNum, sensorType, unit]
            );

            // Sla meting op
            await pool.query(
                'INSERT INTO measurements (dev_eui, channel, value, measured_at) VALUES (?, ?, ?, ?)',
                [devEui, channelNum, value, new Date(receivedAt)]
            );
            console.log('[SAVED]', sensorType, '=', value, unit);

            savedCount++;
        }

        res.json({ 
            success: true, 
            message: 'Processed ' + savedCount + ' sensor values',
            dev_eui: devEui
        });

    } catch (error) {
        console.error('[ERROR] Webhook error:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
});

// ============================================
// HEALTH CHECK & STATIC FILES
// ============================================

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend files
app.use(express.static('public'));

// Start server
app.listen(PORT, async () => {
    console.log('Klimaatapp server running on port', PORT);
    await testConnection();
    
    // Initial cleanup bij opstarten
    cleanupOldData();
});