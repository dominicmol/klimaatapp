// KLIMAATAPP SERVER
// Ontvangt requests van de website en haalt data uit de database

// Imports - benodigde tools

require('dotenv').config();  
// Laadt geheime wachtwoorden uit .env bestand (staat niet op GitHub)

const express = require('express');  
// Express = framework om makkelijk een server te bouwen

const cors = require('cors');  
// CORS zorgt dat de website mag communiceren met de server

const mysql = require('mysql2/promise');  
// Maakt communicatie met MySQL database mogelijk


// App aanmaken

const app = express();  
// Maak de server aan

const PORT = process.env.PORT || 3000;  
// Op welke poort draait de server? (Railway geeft dit mee, anders 3000)


// Middleware - dingen die ELKE request moet doorlopen

app.use(cors());  
// Zet CORS open

app.use(express.json());  
// Zorgt dat JSON gelezen kan worden (de taal waarin frontend en backend communiceren)


// Database verbinding (pool = meerdere verbindingen klaar voor gebruik)

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'klimaatapp',
    connectionLimit: 10,  // Max 10 verbindingen tegelijk
});


// Test of database werkt bij opstarten

async function testConnection() {
    // async = deze functie moet soms wachten
    try {
        const connection = await pool.getConnection();  // await = wacht tot klaar
        console.log('[OK] Database connected successfully');
        connection.release();  // Geef verbinding terug aan pool
    } catch (error) {
        console.error('[ERROR] Database connection failed:', error.message);
    }
}


// Cleanup functie - verwijdert data ouder dan 4 dagen (anders wordt database te groot)

async function cleanupOldData() {
    try {
        // Bereken 4 dagen geleden (4 * 24 uur * 60 min * 60 sec * 1000 ms)
        const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
        
        // Verwijder oude metingen (? wordt vervangen door fourDaysAgo - veilig tegen hackers)
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


// API ROUTES - KAMERS


// GET /api/rooms - Alle kamers ophalen

app.get('/api/rooms', async (req, res) => {
    // req = binnenkomende vraag, res = antwoord dat teruggestuurd wordt
    try {
        // Haal alle kamers op
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
        // SELECT = welke kolommen, FROM = uit welke tabel, LEFT JOIN = koppel devices
        // COUNT = tel devices, GROUP BY = per kamer, ORDER BY = sorteer A-Z

        // Voor elke kamer de laatste temperatuur/humidity ophalen
        for (let room of rooms) {
            // for loop = pak elke kamer één voor één
            
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
            // Geeft de LAATSTE temperatuur en humidity voor deze kamer

            room.latest = {};
            latestReadings.forEach(r => {
                room.latest[r.type] = { value: r.value, measured_at: r.measured_at };
            });

            // Check of sensor online is (gezien in laatste 30 min)
            const [onlineCheck] = await pool.query(`
                SELECT MAX(last_seen_at) as last_seen
                FROM devices
                WHERE room_id = ?
            `, [room.room_id]);
            
            const lastSeen = onlineCheck[0]?.last_seen;  // ?. = als dit bestaat
            room.is_online = lastSeen && (Date.now() - new Date(lastSeen).getTime()) < 30 * 60 * 1000;
        }

        res.json(rooms);  // Stuur kamers terug als JSON
        
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).json({ error: 'Database error' });  // 500 = server error
    }
});


// GET /api/rooms/:id - Details van één kamer (de :id is een variabele)

app.get('/api/rooms/:id', async (req, res) => {
    try {
        const roomId = req.params.id;
        // ^ Haal de :id uit de URL
        // Bij /api/rooms/5 is roomId = 5

        // Haal de kamer op
        const [rooms] = await pool.query(
            'SELECT * FROM rooms WHERE room_id = ?', 
            [roomId]
        );
        
        // Check of de kamer bestaat
        if (rooms.length === 0) {
            return res.status(404).json({ error: 'Room not found' });
            // ^ 404 = "niet gevonden"
        }
        
        const room = rooms[0];
        // rooms is een array, het eerste item wordt gepakt

        // Haal alle devices van deze kamer op
        const [devices] = await pool.query(`
            SELECT * FROM devices WHERE room_id = ? ORDER BY name
        `, [roomId]);

        // Voor elk device, haal de sensoren en laatste metingen op
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
            // ^ "LIMIT 1" = geef maar 1 resultaat (de nieuwste)
            
            device.sensors = sensors;
            // ^ Hang de sensoren aan het device object
            
            device.is_online = device.last_seen_at && 
                (Date.now() - new Date(device.last_seen_at).getTime()) < 30 * 60 * 1000;
        }

        room.devices = devices;
        // ^ Hang alle devices aan de kamer
        
        res.json(room);
        // ^ Stuur alles terug
        
    } catch (error) {
        console.error('Error fetching room:', error);
        res.status(500).json({ error: 'Database error' });
    }
});


// POST /api/rooms - Nieuwe kamer aanmaken

app.post('/api/rooms', async (req, res) => {
    try {
        const { name } = req.body;
        // ^ Haal de naam uit de request body
        // De frontend stuurt: { "name": "Slaapkamer" }
        
        // Check of er een naam is meegegeven
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Room name is required' });
            // ^ 400 = "bad request" (jij deed iets fout)
        }

        // Voeg de kamer toe aan de database
        const [result] = await pool.query(
            'INSERT INTO rooms (name) VALUES (?)',
            [name.trim()]
        );
        // ^ INSERT INTO = voeg een rij toe
        // name.trim() = verwijder spaties aan begin/eind

        // Stuur bevestiging terug
        res.status(201).json({
            room_id: result.insertId,  // Het ID dat MySQL heeft gegenereerd
            name: name.trim(),
            message: 'Room created successfully'
        });
        // ^ 201 = "created" (succesvol aangemaakt)
        
    } catch (error) {
        // Check of de naam al bestaat
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Room name already exists' });
        }
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Database error' });
    }
});


// PUT /api/rooms/:id - Kamer wijzigen

app.put('/api/rooms/:id', async (req, res) => {
    try {
        const roomId = req.params.id;
        const { name } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Room name is required' });
        }

        // Update de kamer in de database
        const [result] = await pool.query(
            'UPDATE rooms SET name = ? WHERE room_id = ?',
            [name.trim(), roomId]
        );
        // ^ UPDATE = wijzig bestaande data
        // SET name = ? = zet de naam naar de nieuwe waarde
        // WHERE room_id = ? = alleen voor deze kamer

        // Check of de kamer bestond
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

        const [result] = await pool.query(
            'DELETE FROM rooms WHERE room_id = ?', 
            [roomId]
        );
        // ^ DELETE FROM = verwijder rijen
        // De devices worden automatisch losgekoppeld door de database
        // (dit staat ingesteld in de schema.sql met ON DELETE SET NULL)

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }

        res.json({ message: 'Room deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting room:', error);
        res.status(500).json({ error: 'Database error' });
    }
});


// API ROUTES - DEVICES


// GET /api/devices - Alle sensoren ophalen (?unassigned=1 voor alleen losse)

app.get('/api/devices', async (req, res) => {
    try {
        const { unassigned } = req.query;
        // ^ req.query = de ?parameters in de URL
        // /api/devices?unassigned=1 -> unassigned = "1"

        let query = `
            SELECT d.dev_eui, d.name, d.room_id, d.last_seen_at, r.name as room_name
            FROM devices d
            LEFT JOIN rooms r ON d.room_id = r.room_id
        `;

        // Als unassigned=1, filter op devices zonder kamer
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


// PUT /api/devices/:dev_eui/room - Sensor aan kamer koppelen

app.put('/api/devices/:dev_eui/room', async (req, res) => {
    try {
        const devEui = req.params.dev_eui;
        // ^ dev_eui = unieke ID van de sensor (komt van de fabrikant)
        
        const { room_id } = req.body;
        // ^ Welke kamer? (null = ontkoppelen)

        // Check of device bestaat
        const [existingDevice] = await pool.query(
            'SELECT dev_eui FROM devices WHERE dev_eui = ?',
            [devEui]
        );

        if (existingDevice.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Als er een room_id is, check of die kamer bestaat
        if (room_id !== null && room_id !== undefined) {
            const [rooms] = await pool.query(
                'SELECT room_id FROM rooms WHERE room_id = ?',
                [room_id]
            );
            if (rooms.length === 0) {
                return res.status(400).json({ error: 'Room not found' });
            }
        }

        // Update de koppeling
        await pool.query(
            'UPDATE devices SET room_id = ? WHERE dev_eui = ?',
            [room_id || null, devEui]
        );
        // ^ room_id || null = als room_id leeg is, gebruik null

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


// API ROUTES - METINGEN


// GET /api/measurements - Meetgegevens ophalen (met filters)

app.get('/api/measurements', async (req, res) => {
    try {
        const { room_id, sensor_type, limit = 100 } = req.query;
        // ^ Haal filters uit de URL
        // limit = 100 betekent: als niet meegegeven, gebruik 100
        
        // Alleen data van de laatste 4 dagen wordt getoond
        const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
        
        // Begin met de basis query
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

        // Voeg extra filters toe als ze er zijn
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


// GET /api/measurements/chart - Data voor grafieken (gegroepeerd per uur)

app.get('/api/measurements/chart', async (req, res) => {
    try {
        const { room_id, sensor_type } = req.query;
        
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
            AND NOT (s.type = 'co2' AND m.value > 5000)
        `;
        // ^ Die laatste regel filtert foute CO2 waarden
        // Waarom? Soms stuurt de sensor 65535 (sensor error)
        // CO2 boven 5000 ppm is fysiek onmogelijk binnenshuis
        
        const params = [fourDaysAgo];

        if (room_id) {
            query += ' AND r.room_id = ?';
            params.push(room_id);
        }

        if (sensor_type) {
            query += ' AND s.type = ?';
            params.push(sensor_type);
        }

        // GROUP BY hour = gemiddelde per uur berekenen
        query += ` GROUP BY d.dev_eui, d.name, s.type, s.unit, hour ORDER BY hour ASC, d.name`;

        const [data] = await pool.query(query, params);
        res.json(data);
        
    } catch (error) {
        console.error('Error fetching chart data:', error);
        res.status(500).json({ error: 'Database error' });
    }
});


// GET /api/sensor-types - Welke soorten sensoren zijn er?

app.get('/api/sensor-types', async (req, res) => {
    try {
        const [types] = await pool.query(`
            SELECT DISTINCT type, unit 
            FROM sensors 
            WHERE type IS NOT NULL AND type != 'unknown'
            ORDER BY type
        `);
        // ^ DISTINCT = geen dubbele waarden
        
        res.json(types);
    } catch (error) {
        console.error('Error fetching sensor types:', error);
        res.status(500).json({ error: 'Database error' });
    }
});


// TTN WEBHOOK - Ontvangt sensordata van The Things Network

app.post('/api/webhook/ttn', async (req, res) => {
    try {
        console.log('[WEBHOOK] TTN data received');
        
        // Ruim oude data op bij elke webhook
        // Zo blijft de database schoon
        cleanupOldData();
        
        // Pak de data uit het pakketje
        const payload = req.body;
        
        // Haal de belangrijke info eruit
        const devEui = payload.end_device_ids?.dev_eui;
        // ^ Unieke ID van de sensor
        
        const deviceId = payload.end_device_ids?.device_id;
        // ^ Naam van de sensor in TTN
        
        const receivedAt = payload.received_at || new Date().toISOString();
        // ^ Wanneer is het ontvangen?
        
        const decodedPayload = payload.uplink_message?.decoded_payload;
        // ^ De echte sensordata (temperatuur, humidity, etc.)

        // Check of alle info aanwezig is
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

        // Check of dit device al bekend is
        const [existingDevice] = await pool.query(
            'SELECT * FROM devices WHERE dev_eui = ?',
            [devEui]
        );

        // Nieuw device? Maak hem aan!
        if (existingDevice.length === 0) {
            await pool.query(
                'INSERT INTO devices (dev_eui, name) VALUES (?, ?)',
                [devEui, deviceId || 'Device ' + devEui.slice(-4)]
            );
            // ^ slice(-4) = laatste 4 tekens van de ID
            console.log('[NEW] Device created:', devEui);
        }

        // Update "laatst gezien" tijd
        await pool.query(
            'UPDATE devices SET last_seen_at = ? WHERE dev_eui = ?',
            [new Date(receivedAt), devEui]
        );

        // CHANNEL MAPPING
        // Dit vertaalt de ruwe data naar begrijpelijke types
        // Bart (de IoT beheerder) heeft dit zo ingesteld:
        const channelMapping = {
            1: { type: 'humidity', unit: '%' },      // Kanaal 1 = luchtvochtigheid
            2: { type: 'temperature', unit: 'C' },  // Kanaal 2 = temperatuur
            3: { type: 'presence', unit: '%' },     // Kanaal 3 = aanwezigheid
            4: { type: 'co2', unit: 'ppm' },        // Kanaal 4 = CO2
            5: { type: 'light', unit: '%' },        // Kanaal 5 = licht
            6: { type: 'noise', unit: 'dB' }        // Kanaal 6 = geluid
        };

        let savedCount = 0;

        // Loop door alle waarden in de payload
        for (const [key, value] of Object.entries(decodedPayload)) {
            // Object.entries maakt van { a: 1, b: 2 } -> [["a", 1], ["b", 2]]
            // Zo kan door elk key-value paar geloopt worden
            
            // Skip als het geen nummer is
            if (typeof value !== 'number') continue;
            // ^ "continue" = sla over, ga naar volgende

            // Haal channel nummer uit de key
            // Bijvoorbeeld: "temperature_2" -> de "2" is nodig
            const channelMatch = key.match(/_(\d+)$/);
            // ^ Dit is een "regular expression" (regex)
            // _(\d+)$ betekent: underscore, dan cijfers, aan het eind
            
            if (!channelMatch) continue;
            
            const channelNum = parseInt(channelMatch[1]);
            // ^ [1] is de eerste "capture group" (de cijfers)
            
            const mapping = channelMapping[channelNum];
            
            if (!mapping) continue;
            // ^ Onbekend kanaal? Sla over

            const sensorType = mapping.type;
            const unit = mapping.unit;

            // Sla de sensor op (of update als hij bestaat)
            await pool.query(
                `INSERT INTO sensors (dev_eui, channel, type, unit)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    type = VALUES(type),
                    unit = VALUES(unit)`,
                [devEui, channelNum, sensorType, unit]
            );
            // ^ "ON DUPLICATE KEY UPDATE" = als hij al bestaat, update hem
            // Dit voorkomt errors bij dubbele inserts

            // Sla de meting op
            await pool.query(
                'INSERT INTO measurements (dev_eui, channel, value, measured_at) VALUES (?, ?, ?, ?)',
                [devEui, channelNum, value, new Date(receivedAt)]
            );
            
            console.log('[SAVED]', sensorType, '=', value, unit);
            savedCount++;
        }

        // Stuur bevestiging terug naar TTN
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


// Health check en static files

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files (HTML, CSS, JS uit public map)
app.use(express.static('public'));

// Start de server
app.listen(PORT, async () => {
    console.log('Klimaatapp server running on port', PORT);
    await testConnection();
    cleanupOldData();
});