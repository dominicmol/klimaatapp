-- ============================================
-- KLIMAATAPP DATABASE SCHEMA
-- MySQL compatible (Railway, PlanetScale, TiDB)
-- ============================================

-- Table: rooms
CREATE TABLE IF NOT EXISTS rooms (
    room_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: devices
CREATE TABLE IF NOT EXISTS devices (
    dev_eui VARCHAR(16) PRIMARY KEY,
    room_id INT,
    name VARCHAR(100),
    last_seen_at TIMESTAMP NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id)
        ON DELETE SET NULL 
        ON UPDATE CASCADE
);

-- Table: sensors
CREATE TABLE IF NOT EXISTS sensors (
    dev_eui VARCHAR(16) NOT NULL,
    channel TINYINT NOT NULL,
    type VARCHAR(50) NOT NULL,
    unit VARCHAR(20),
    min_value DECIMAL(10,2),
    max_value DECIMAL(10,2),
    PRIMARY KEY (dev_eui, channel),
    FOREIGN KEY (dev_eui) REFERENCES devices(dev_eui)
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

-- Table: measurements
CREATE TABLE IF NOT EXISTS measurements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    dev_eui VARCHAR(16) NOT NULL,
    channel TINYINT NOT NULL,
    value DECIMAL(10,2) NOT NULL,
    measured_at TIMESTAMP NOT NULL,
    FOREIGN KEY (dev_eui, channel) 
        REFERENCES sensors(dev_eui, channel)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    INDEX idx_measured_at (measured_at),
    INDEX idx_dev_channel (dev_eui, channel),
    INDEX idx_dev_channel_time (dev_eui, channel, measured_at DESC)
);

-- ============================================
-- EXAMPLE DATA (optional, for testing)
-- ============================================

-- INSERT INTO rooms (name) VALUES ('AS210'), ('AS211'), ('AS212');
