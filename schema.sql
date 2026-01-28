CREATE TABLE IF NOT EXISTS rooms (
    room_id INT AUTO_INCREMENT PRIMARY KEY,      -- unieke kamer-ID, automatisch opgehoogd
    name VARCHAR(100) NOT NULL UNIQUE,           -- kamernaam, verplicht en uniek
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- aanmaakdatum, automatisch ingevuld
);

CREATE TABLE IF NOT EXISTS devices (
    dev_eui VARCHAR(16) PRIMARY KEY,             -- unieke device identifier van TTN (bijv. 70B3D57ED00454FA)
    room_id INT,                                 -- gekoppelde kamer, mag leeg zijn (niet toegewezen)
    name VARCHAR(100),                           -- optionele naam voor het device
    last_seen_at TIMESTAMP NULL,                 -- tijdstip van laatste ontvangen data
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) -- koppeling naar rooms tabel
        ON DELETE SET NULL                       -- bij verwijderen kamer wordt room_id NULL
        ON UPDATE CASCADE                        -- bij wijzigen room_id wordt deze mee gewijzigd
);

CREATE TABLE IF NOT EXISTS sensors (
    dev_eui VARCHAR(16) NOT NULL,                -- device waar deze sensor bij hoort
    channel TINYINT NOT NULL,                    -- kanaalnummer (1=humidity, 2=temp, 3=presence, 4=co2, 5=light, 6=noise)
    type VARCHAR(50) NOT NULL,                   -- sensortype (temperature, humidity, co2, etc.)
    unit VARCHAR(20),                            -- meeteenheid (C, %, ppm, dB)
    min_value DECIMAL(10,2),                     -- minimale verwachte waarde voor validatie
    max_value DECIMAL(10,2),                     -- maximale verwachte waarde voor validatie
    PRIMARY KEY (dev_eui, channel),              -- samengestelde sleutel: device + kanaal is uniek
    FOREIGN KEY (dev_eui) REFERENCES devices(dev_eui) -- koppeling naar devices tabel
        ON DELETE CASCADE                        -- bij verwijderen device worden sensoren ook verwijderd
        ON UPDATE CASCADE                        -- bij wijzigen dev_eui wordt deze mee gewijzigd
);

CREATE TABLE IF NOT EXISTS measurements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,        -- unieke meting-ID, automatisch opgehoogd
    dev_eui VARCHAR(16) NOT NULL,                -- device dat de meting heeft verstuurd
    channel TINYINT NOT NULL,                    -- kanaal van de sensor
    value DECIMAL(10,2) NOT NULL,                -- gemeten waarde (bijv. 21.5 voor temperatuur)
    measured_at TIMESTAMP NOT NULL,              -- tijdstip van de meting
    FOREIGN KEY (dev_eui, channel)               -- koppeling naar sensors tabel via samengestelde sleutel
        REFERENCES sensors(dev_eui, channel)
        ON DELETE CASCADE                        -- bij verwijderen sensor worden metingen ook verwijderd
        ON UPDATE CASCADE,                       -- bij wijzigen dev_eui/channel wordt deze mee gewijzigd
    INDEX idx_measured_at (measured_at),         -- index voor snel zoeken op tijd (cleanup query)
    INDEX idx_dev_channel (dev_eui, channel),    -- index voor snel zoeken op device + kanaal
    INDEX idx_dev_channel_time (dev_eui, channel, measured_at DESC) -- index voor grafieken (nieuwste eerst)
);