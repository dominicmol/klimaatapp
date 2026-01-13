// ============================================
// CLASS: RoomManager
// Verantwoordelijk voor alles wat met kamers te maken heeft:
// - Kamers laden en tonen
// - Kamers aanmaken, bewerken en verwijderen
// - Devices koppelen en ontkoppelen
// - Navigatie tussen pagina's
// ============================================

class RoomManager {
    
    constructor(apiService) {
        this.api = apiService;                  // Referentie naar ApiService voor server communicatie
        this.rooms = [];                        // Array met alle kamers
        this.currentRoomId = null;              // ID van de momenteel geopende kamer
        this.currentRoom = null;                // Data object van de momenteel geopende kamer
        this.editMode = false;                  // true = bewerken, false = nieuwe kamer aanmaken
        this.unassignedDevices = [];            // Array met devices die nog niet aan een kamer gekoppeld zijn
        
        this.sensorTypes = {                    // Lookup tabel voor sensor type namen en kleuren
            'temperature': { name: 'Temperatuur', unit: 'C', color: '#E07B67' },
            'humidity': { name: 'Luchtvochtigheid', unit: '%', color: '#2D5A3D' },
            'presence': { name: 'Aanwezigheid', unit: '%', color: '#6B7B6C' },
            'co2': { name: 'CO2', unit: 'ppm', color: '#8B4513' },
            'light': { name: 'Lichtsterkte', unit: '%', color: '#FFD700' },
            'noise': { name: 'Ruis', unit: 'dB', color: '#4169E1' }
        };
        
        this.cacheElements();                   // Sla referenties naar DOM elementen op
        this.bindEvents();                      // Koppel event listeners aan buttons
    }
    
    // Slaat referenties naar veelgebruikte DOM elementen op in variabelen
    // Dit is sneller dan elke keer document.getElementById aan te roepen
    cacheElements() {
        this.roomsContainer = document.getElementById('rooms-container');           // Container voor kamer cards
        this.devicesContainer = document.getElementById('devices-container');       // Container voor device cards
        this.deviceSelect = document.getElementById('device-select');               // Dropdown voor device selectie
        this.addDeviceSection = document.getElementById('add-device-section');      // Sectie voor device toevoegen
        this.roomModal = document.getElementById('room-modal');                     // Modal voor kamer toevoegen/bewerken
        this.deleteModal = document.getElementById('delete-modal');                 // Modal voor verwijder bevestiging
        this.toast = document.getElementById('toast');                              // Toast notificatie element
        this.navLinks = document.querySelectorAll('.nav-link');                     // Navigatie links
        this.pages = document.querySelectorAll('.page');                            // Pagina secties
        this.filterRoom = document.getElementById('filter-room');                   // Filter dropdown voor kamers
    }
    
    // Koppelt event listeners aan alle interactieve elementen
    // Event listeners luisteren naar gebruiker acties zoals klikken
    bindEvents() {
        var self = this;                        // Sla 'this' op in variabele voor gebruik in callback functies
        
        // Navigatie links - wisselen tussen pagina's
        for (var i = 0; i < this.navLinks.length; i++) {
            this.navLinks[i].addEventListener('click', function(e) {
                e.preventDefault();             // Voorkom standaard link gedrag (pagina herladen)
                var targetPage = this.dataset.page;  // Haal data-page attribuut op uit HTML
                self.showPage(targetPage);      // Toon de juiste pagina
            });
        }
        
        // Button: Nieuwe kamer toevoegen
        document.getElementById('btn-add-room').addEventListener('click', function() {
            self.openAddRoomModal();
        });
        
        // Button: Terug naar overzicht
        document.getElementById('btn-back').addEventListener('click', function() {
            self.goBackToDashboard();
        });
        
        // Button: Kamer bewerken
        document.getElementById('btn-edit-room').addEventListener('click', function() {
            self.openEditRoomModal();
        });
        
        // Button: Kamer verwijderen
        document.getElementById('btn-delete-room').addEventListener('click', function() {
            self.confirmDeleteRoom();
        });
        
        // Button: Device toevoegen aan kamer
        document.getElementById('btn-assign-device').addEventListener('click', function() {
            self.assignSelectedDevice();
        });
        
        // Modal buttons - Kamer modal
        document.getElementById('modal-close').addEventListener('click', function() {
            self.closeModal();
        });
        document.getElementById('modal-cancel').addEventListener('click', function() {
            self.closeModal();
        });
        document.getElementById('modal-save').addEventListener('click', function() {
            self.saveRoom();
        });
        
        // Modal buttons - Delete modal
        document.getElementById('delete-modal-close').addEventListener('click', function() {
            self.closeDeleteModal();
        });
        document.getElementById('delete-modal-cancel').addEventListener('click', function() {
            self.closeDeleteModal();
        });
        document.getElementById('delete-modal-confirm').addEventListener('click', function() {
            self.deleteRoom();
        });
        
        // Sluit modals wanneer buiten de modal geklikt wordt
        this.roomModal.addEventListener('click', function(e) {
            if (e.target === self.roomModal) {  // Check of er op de overlay geklikt is, niet op de modal zelf
                self.closeModal();
            }
        });
        this.deleteModal.addEventListener('click', function(e) {
            if (e.target === self.deleteModal) {
                self.closeDeleteModal();
            }
        });
        
        // Sluit modals met Escape toets
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {           // Luister naar Escape toets
                self.closeModal();
                self.closeDeleteModal();
            }
        });
    }
    
    // ============================================
    // NAVIGATIE METHODES
    // ============================================
    
    // Toont een specifieke pagina en verbergt de andere
    showPage(pageName) {
        for (var i = 0; i < this.navLinks.length; i++) {
            this.navLinks[i].classList.remove('active');  // Verwijder 'active' class van alle links
            if (this.navLinks[i].dataset.page === pageName) {
                this.navLinks[i].classList.add('active'); // Voeg 'active' toe aan de juiste link
            }
        }
        
        for (var i = 0; i < this.pages.length; i++) {
            this.pages[i].classList.remove('active');     // Verberg alle pagina's
            if (this.pages[i].id === pageName + '-page') {
                this.pages[i].classList.add('active');    // Toon de juiste pagina
            }
        }
        
        // Als historie pagina geopend wordt, trigger een event voor ChartManager
        if (pageName === 'history') {
            var event = new CustomEvent('historyPageOpened');  // Maak een custom event aan
            document.dispatchEvent(event);      // Stuur het event, ChartManager luistert hiernaar
        }
    }
    
    // Gaat terug naar het dashboard
    goBackToDashboard() {
        this.currentRoomId = null;              // Reset huidige kamer
        this.currentRoom = null;
        this.showPage('dashboard');             // Toon dashboard pagina
        this.loadRooms();                       // Herlaad kamers om eventuele wijzigingen te tonen
    }
    
    // ============================================
    // KAMERS LADEN EN TONEN
    // ============================================
    
    // Haalt alle kamers op van de server en toont ze
    loadRooms() {
        var self = this;
        this.roomsContainer.innerHTML = '<div class="loading">Kamers laden...</div>';  // Toon loading tekst
        
        this.api.get('/api/rooms')              // Haal kamers op via ApiService
            .then(function(data) {              // Als succesvol, data bevat array met kamers
                self.rooms = data;              // Sla kamers op in class variabele
                self.renderRooms();             // Toon de kamers
                self.updateRoomFilter();        // Update de filter dropdown op historie pagina
            })
            .catch(function(error) {            // Bij een fout
                self.roomsContainer.innerHTML = '<div class="empty-state"><p>Kon kamers niet laden. Is de backend actief?</p></div>';
                self.showToast('Fout bij laden kamers', true);  // Toon foutmelding
            });
    }
    
    // Bouwt de HTML voor alle kamer cards en plaatst ze in de container
    renderRooms() {
        if (this.rooms.length === 0) {          // Als er geen kamers zijn
            this.roomsContainer.innerHTML = 
                '<div class="add-room-card" id="add-room-card-empty">' +
                    '<div class="add-room-icon">+</div>' +
                    '<span class="add-room-text">Eerste kamer toevoegen</span>' +
                '</div>';
            
            var self = this;
            document.getElementById('add-room-card-empty').addEventListener('click', function() {
                self.openAddRoomModal();
            });
            return;                             // Stop hier als er geen kamers zijn
        }

        var html = '';                          // String om HTML op te bouwen
        
        for (var i = 0; i < this.rooms.length; i++) {
            var room = this.rooms[i];
            
            // Haal temperatuur en vochtigheid op, of '--' als niet beschikbaar
            var temp = '--';
            var humidity = '--';
            if (room.latest && room.latest.temperature) {
                temp = room.latest.temperature.value;
            }
            if (room.latest && room.latest.humidity) {
                humidity = room.latest.humidity.value;
            }
            
            var statusClass = room.is_online ? '' : 'offline';  // CSS class voor online/offline status
            var statusText = room.is_online ? 'Online' : 'Offline';
            var deviceText = room.device_count === 1 ? 'device' : 'devices';  // Enkelvoud/meervoud
            
            // Bouw HTML voor deze kamer card
            html += 
                '<div class="room-card" data-room-id="' + room.room_id + '">' +
                    '<div class="room-card-header">' +
                        '<span class="room-name">' + room.name + '</span>' +
                        '<span class="room-status">' +
                            '<span class="status-dot ' + statusClass + '"></span>' +
                            statusText +
                        '</span>' +
                    '</div>' +
                    '<div class="room-stats">' +
                        '<div class="stat">' +
                            '<span class="stat-value">' + temp + '<small>C</small></span>' +
                            '<span class="stat-label">Temperatuur</span>' +
                        '</div>' +
                        '<div class="stat">' +
                            '<span class="stat-value">' + humidity + '<small>%</small></span>' +
                            '<span class="stat-label">Vochtigheid</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="room-footer">' +
                        '<span class="room-devices">' + room.device_count + ' ' + deviceText + '</span>' +
                        '<div class="room-actions">' +
                            '<button class="btn-icon btn-edit-room" data-room-id="' + room.room_id + '" title="Bewerken">E</button>' +
                            '<button class="btn-icon delete btn-delete-room" data-room-id="' + room.room_id + '" title="Verwijderen">X</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }

        // Voeg "Nieuwe kamer toevoegen" card toe aan het einde
        html += 
            '<div class="add-room-card" id="add-room-card">' +
                '<div class="add-room-icon">+</div>' +
                '<span class="add-room-text">Nieuwe kamer toevoegen</span>' +
            '</div>';

        this.roomsContainer.innerHTML = html;   // Plaats alle HTML in de container
        this.bindRoomCardEvents();              // Koppel click events aan de nieuwe elementen
    }
    
    // Koppelt click events aan de dynamisch gegenereerde kamer cards
    bindRoomCardEvents() {
        var self = this;
        
        // Click op kamer card - open kamer detail
        var roomCards = document.querySelectorAll('.room-card');
        for (var i = 0; i < roomCards.length; i++) {
            roomCards[i].addEventListener('click', function(e) {
                // Voorkom dat kamer opent als er op edit/delete button geklikt wordt
                if (e.target.classList.contains('btn-icon')) return;
                var roomId = this.dataset.roomId;  // Haal room ID op uit data attribuut
                self.openRoom(parseInt(roomId));   // Open de kamer (parseInt zet string om naar nummer)
            });
        }
        
        // Click op edit button in kamer card
        var editButtons = document.querySelectorAll('.btn-edit-room');
        for (var i = 0; i < editButtons.length; i++) {
            editButtons[i].addEventListener('click', function(e) {
                e.stopPropagation();            // Voorkom dat click event naar parent (room-card) gaat
                var roomId = this.dataset.roomId;
                self.openEditRoomModalFor(parseInt(roomId));
            });
        }
        
        // Click op delete button in kamer card
        var deleteButtons = document.querySelectorAll('.btn-delete-room');
        for (var i = 0; i < deleteButtons.length; i++) {
            deleteButtons[i].addEventListener('click', function(e) {
                e.stopPropagation();
                var roomId = this.dataset.roomId;
                self.confirmDeleteRoomFor(parseInt(roomId));
            });
        }
        
        // Click op "Nieuwe kamer toevoegen" card
        var addRoomCard = document.getElementById('add-room-card');
        if (addRoomCard) {
            addRoomCard.addEventListener('click', function() {
                self.openAddRoomModal();
            });
        }
    }
    
    // ============================================
    // KAMER DETAIL PAGINA
    // ============================================
    
    // Opent de detail pagina van een specifieke kamer
    openRoom(roomId) {
        var self = this;
        this.currentRoomId = roomId;            // Sla huidige kamer ID op
        this.devicesContainer.innerHTML = '<div class="loading">Laden...</div>';
        this.showPage('room');                  // Wissel naar kamer pagina
        
        // Verwijder 'active' class van nav links (kamer pagina zit niet in nav)
        for (var i = 0; i < this.navLinks.length; i++) {
            this.navLinks[i].classList.remove('active');
        }

        this.api.get('/api/rooms/' + roomId)    // Haal kamer details op van server
            .then(function(data) {
                self.currentRoom = data;        // Sla kamer data op
                
                // Update pagina titel en subtitle
                document.getElementById('room-title').textContent = 'Kamer ' + self.currentRoom.name;
                var deviceCount = self.currentRoom.devices ? self.currentRoom.devices.length : 0;
                document.getElementById('room-subtitle').textContent = deviceCount + ' device(s)';

                self.renderDevices();           // Toon de devices
                self.loadUnassignedDevices();   // Laad beschikbare devices voor dropdown
            })
            .catch(function(error) {
                self.devicesContainer.innerHTML = '<div class="empty-state"><p>Kon kamer niet laden</p></div>';
            });
    }
    
    // Bouwt de HTML voor alle devices in de huidige kamer
    renderDevices() {
        if (!this.currentRoom.devices || this.currentRoom.devices.length === 0) {
            this.devicesContainer.innerHTML = '<div class="empty-state"><p>Geen devices gekoppeld aan deze kamer. Gebruik de dropdown hierboven om een device toe te voegen.</p></div>';
            return;
        }

        var self = this;
        var html = '';
        
        for (var i = 0; i < this.currentRoom.devices.length; i++) {
            var device = this.currentRoom.devices[i];
            
            var statusClass = device.is_online ? '' : 'offline';
            var lastSeenText = device.last_seen_at ? 
                'Laatste update: ' + this.getTimeAgo(new Date(device.last_seen_at)) : 
                'Nog geen data';
            
            // Bouw HTML voor sensoren van dit device
            var sensorsHtml = '';
            if (device.sensors) {
                for (var j = 0; j < device.sensors.length; j++) {
                    var sensor = device.sensors[j];
                    var sensorValue = sensor.latest_value !== null ? sensor.latest_value : '--';
                    var sensorUnit = sensor.unit || '';
                    
                    sensorsHtml += 
                        '<div class="sensor-card">' +
                            '<div class="sensor-label">' + this.getSensorTypeName(sensor.type) + '</div>' +
                            '<div class="sensor-value">' + sensorValue + 
                                '<span class="sensor-unit">' + sensorUnit + '</span>' +
                            '</div>' +
                        '</div>';
                }
            }
            
            // Bouw HTML voor device card
            html += 
                '<div class="device-card">' +
                    '<div class="device-header">' +
                        '<div>' +
                            '<div class="device-name">' + (device.name || 'Device') + '</div>' +
                            '<div class="device-last-seen">' +
                                '<span class="status-dot ' + statusClass + '" style="display:inline-block;vertical-align:middle;margin-right:6px;"></span>' +
                                lastSeenText +
                            '</div>' +
                        '</div>' +
                        '<div style="display:flex;gap:8px;align-items:center;">' +
                            '<span class="device-eui">' + device.dev_eui + '</span>' +
                            '<button class="btn btn-danger btn-sm btn-unassign-device" data-dev-eui="' + device.dev_eui + '">Ontkoppelen</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="sensors-grid">' + sensorsHtml + '</div>' +
                '</div>';
        }
        
        this.devicesContainer.innerHTML = html;
        
        // Koppel click events aan ontkoppel buttons
        var unassignButtons = document.querySelectorAll('.btn-unassign-device');
        for (var i = 0; i < unassignButtons.length; i++) {
            unassignButtons[i].addEventListener('click', function() {
                var devEui = this.dataset.devEui;  // Haal device EUI op uit data attribuut
                self.unassignDevice(devEui);
            });
        }
    }
    
    // ============================================
    // DEVICE KOPPELING
    // ============================================
    
    // Haalt alle devices op die nog niet aan een kamer gekoppeld zijn
    loadUnassignedDevices() {
        var self = this;
        
        this.api.get('/api/devices?unassigned=1')  // Query parameter filtert op niet-gekoppelde devices
            .then(function(devices) {
                self.unassignedDevices = devices;
                self.renderDeviceSelect();      // Vul de dropdown met de devices
            })
            .catch(function(error) {
                console.error('Fout bij laden devices:', error);
            });
    }
    
    // Vult de device select dropdown met beschikbare devices
    renderDeviceSelect() {
        var html = '<option value="">-- Selecteer een device --</option>';
        
        for (var i = 0; i < this.unassignedDevices.length; i++) {
            var device = this.unassignedDevices[i];
            var deviceName = device.name || 'Device ' + device.dev_eui.slice(-4);  // slice(-4) pakt laatste 4 karakters
            html += '<option value="' + device.dev_eui + '">' + deviceName + ' (' + device.dev_eui.slice(-8) + ')</option>';
        }
        
        this.deviceSelect.innerHTML = html;
        
        // Verberg sectie als er geen devices beschikbaar zijn
        if (this.unassignedDevices.length === 0) {
            this.addDeviceSection.style.display = 'none';
        } else {
            this.addDeviceSection.style.display = 'flex';
        }
    }
    
    // Koppelt het geselecteerde device aan de huidige kamer
    assignSelectedDevice() {
        var self = this;
        var selectedDevEui = this.deviceSelect.value;  // Haal geselecteerde waarde op uit dropdown
        
        if (!selectedDevEui) {                  // Check of er iets geselecteerd is
            this.showToast('Selecteer eerst een device', true);
            return;
        }
        
        this.api.put('/api/devices/' + selectedDevEui + '/room', { room_id: this.currentRoomId })
            .then(function() {
                self.showToast('Device toegevoegd aan kamer');
                self.openRoom(self.currentRoomId);  // Herlaad kamer pagina om wijziging te tonen
            })
            .catch(function(error) {
                self.showToast('Fout bij toevoegen device', true);
            });
    }
    
    // Ontkoppelt een device van de huidige kamer
    unassignDevice(devEui) {
        var self = this;
        
        if (!confirm('Weet je zeker dat je dit device wilt ontkoppelen van deze kamer?')) {
            return;                             // Stop als gebruiker op Annuleren klikt
        }
        
        this.api.put('/api/devices/' + devEui + '/room', { room_id: null })  // null = geen kamer
            .then(function() {
                self.showToast('Device ontkoppeld van kamer');
                self.openRoom(self.currentRoomId);  // Herlaad kamer pagina
                self.loadRooms();               // Herlaad dashboard voor bijgewerkte device counts
            })
            .catch(function(error) {
                self.showToast('Fout bij ontkoppelen device', true);
            });
    }
    
    // ============================================
    // MODAL FUNCTIES
    // ============================================
    
    // Opent de modal voor het toevoegen van een nieuwe kamer
    openAddRoomModal() {
        this.editMode = false;                  // Zet edit mode uit
        document.getElementById('modal-title').textContent = 'Nieuwe kamer toevoegen';
        document.getElementById('room-name-input').value = '';  // Leeg input veld
        this.roomModal.classList.add('active'); // Toon modal door 'active' class toe te voegen
    }
    
    // Opent de modal voor het bewerken van de huidige kamer
    openEditRoomModal() {
        if (this.currentRoom) {
            this.openEditRoomModalFor(this.currentRoom.room_id);
        }
    }
    
    // Opent de modal voor het bewerken van een specifieke kamer
    openEditRoomModalFor(roomId) {
        var room = null;
        for (var i = 0; i < this.rooms.length; i++) {
            if (this.rooms[i].room_id === roomId) {
                room = this.rooms[i];
                break;
            }
        }
        if (!room) return;                      // Stop als kamer niet gevonden
        
        this.editMode = true;                   // Zet edit mode aan
        this.currentRoomId = roomId;
        document.getElementById('modal-title').textContent = 'Kamer bewerken';
        document.getElementById('room-name-input').value = room.name;  // Vul huidige naam in
        this.roomModal.classList.add('active');
    }
    
    // Sluit de kamer modal
    closeModal() {
        this.roomModal.classList.remove('active');
    }
    
    // Slaat de kamer op (nieuw of bewerkt)
    saveRoom() {
        var self = this;
        var name = document.getElementById('room-name-input').value.trim();  // trim() verwijdert spaties aan begin/eind
        
        if (!name) {                            // Check of naam niet leeg is
            this.showToast('Vul een kamernaam in', true);
            return;
        }

        var endpoint = this.editMode ? '/api/rooms/' + this.currentRoomId : '/api/rooms';
        var method = this.editMode ? 'put' : 'post';  // PUT voor update, POST voor nieuw
        
        this.api[method](endpoint, { name: name })  // Roep api.put() of api.post() aan
            .then(function() {
                self.showToast('Kamer ' + name + (self.editMode ? ' bijgewerkt' : ' aangemaakt'));
                self.closeModal();
                self.loadRooms();               // Herlaad kamers
                if (self.currentRoomId && self.editMode) {
                    self.openRoom(self.currentRoomId);  // Herlaad kamer detail als in edit mode
                }
            })
            .catch(function(error) {
                self.showToast('Fout bij opslaan', true);
            });
    }
    
    // Opent de verwijder bevestiging modal voor de huidige kamer
    confirmDeleteRoom() {
        if (this.currentRoom) {
            this.confirmDeleteRoomFor(this.currentRoom.room_id);
        }
    }
    
    // Opent de verwijder bevestiging modal voor een specifieke kamer
    confirmDeleteRoomFor(roomId) {
        var room = null;
        for (var i = 0; i < this.rooms.length; i++) {
            if (this.rooms[i].room_id === roomId) {
                room = this.rooms[i];
                break;
            }
        }
        if (!room) return;
        
        this.currentRoomId = roomId;
        document.getElementById('delete-room-name').textContent = room.name;  // Toon kamernaam in modal
        this.deleteModal.classList.add('active');
    }
    
    // Sluit de verwijder modal
    closeDeleteModal() {
        this.deleteModal.classList.remove('active');
    }
    
    // Verwijdert de kamer definitief
    deleteRoom() {
        var self = this;
        if (!this.currentRoomId) return;
        
        this.api.delete('/api/rooms/' + this.currentRoomId)
            .then(function() {
                self.closeDeleteModal();
                self.showToast('Kamer verwijderd');
                self.currentRoomId = null;
                self.currentRoom = null;
                self.goBackToDashboard();       // Ga terug naar dashboard
            })
            .catch(function() {
                self.showToast('Fout bij verwijderen', true);
            });
    }
    
    // ============================================
    // HULPFUNCTIES
    // ============================================
    
    // Geeft de Nederlandse naam van een sensor type terug
    getSensorTypeName(type) {
        if (this.sensorTypes[type]) {           // Check of type in lookup tabel staat
            return this.sensorTypes[type].name;
        }
        return type;                            // Return originele type als niet gevonden
    }
    
    // Berekent hoe lang geleden een datum was en geeft leesbare tekst terug
    getTimeAgo(date) {
        var now = Date.now();                   // Huidige tijd in milliseconden
        var diffMs = now - date.getTime();      // Verschil in milliseconden
        var diffMins = Math.floor(diffMs / 60000);    // Zet om naar minuten
        var diffHours = Math.floor(diffMs / 3600000); // Zet om naar uren
        var diffDays = Math.floor(diffMs / 86400000); // Zet om naar dagen
        
        if (diffMins < 1) return 'Zojuist';
        if (diffMins < 60) return diffMins + ' min geleden';
        if (diffHours < 24) return diffHours + ' uur geleden';
        return diffDays + ' dagen geleden';
    }
    
    // Toont een toast notificatie
    showToast(message, isError) {
        this.toast.textContent = message;
        
        if (isError) {
            this.toast.className = 'toast error';  // Rode achtergrond voor errors
        } else {
            this.toast.className = 'toast';        // Groene achtergrond voor succes
        }
        
        this.toast.classList.add('show');          // Maak toast zichtbaar
        
        var self = this;
        setTimeout(function() {                    // Na 3 seconden toast verbergen
            self.toast.classList.remove('show');
        }, 3000);
    }
    
    // Update de kamer filter dropdown op de historie pagina
    updateRoomFilter() {
        var html = '<option value="">Alle kamers</option>';
        
        for (var i = 0; i < this.rooms.length; i++) {
            html += '<option value="' + this.rooms[i].room_id + '">' + this.rooms[i].name + '</option>';
        }
        
        this.filterRoom.innerHTML = html;
    }
    
    // Geeft de lijst met kamers terug (voor gebruik door andere classes)
    getRooms() {
        return this.rooms;
    }
    
    // Geeft de sensor types terug (voor gebruik door ChartManager)
    getSensorTypes() {
        return this.sensorTypes;
    }
}