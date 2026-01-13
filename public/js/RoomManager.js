// RoomManager - regelt alles wat met kamers te maken heeft (laden, tonen, CRUD, devices koppelen)

class RoomManager {
    
    constructor(apiService) {
        this.api = apiService;  // Referentie naar ApiService om server calls te doen
        this.rooms = [];  // Array om alle kamers in op te slaan
        this.currentRoomId = null;  // ID van de kamer die nu open is
        this.currentRoom = null;  // Data object van de kamer die nu open is
        this.editMode = false;  // true = bewerken, false = nieuwe kamer
        this.unassignedDevices = [];  // Devices die nog niet aan een kamer gekoppeld zijn
        
        this.sensorTypes = {  // Lookup tabel om technische namen om te zetten naar Nederlandse namen
            'temperature': { name: 'Temperatuur', unit: 'C', color: '#E07B67' },
            'humidity': { name: 'Luchtvochtigheid', unit: '%', color: '#2D5A3D' },
            'presence': { name: 'Aanwezigheid', unit: '%', color: '#6B7B6C' },
            'co2': { name: 'CO2', unit: 'ppm', color: '#8B4513' },
            'light': { name: 'Lichtsterkte', unit: '%', color: '#FFD700' },
            'noise': { name: 'Ruis', unit: 'dB', color: '#4169E1' }
        };
        
        this.cacheElements();  // Sla DOM elementen op in variabelen
        this.bindEvents();  // Koppel click events aan buttons
    }
    
    // Slaat veelgebruikte DOM elementen op zodat ze niet elke keer opgezocht hoeven worden
    cacheElements() {
        this.roomsContainer = document.getElementById('rooms-container');  // Div waar kamer cards in komen
        this.devicesContainer = document.getElementById('devices-container');  // Div waar device cards in komen
        this.deviceSelect = document.getElementById('device-select');  // Dropdown voor device selectie
        this.addDeviceSection = document.getElementById('add-device-section');  // Hele sectie voor device toevoegen
        this.roomModal = document.getElementById('room-modal');  // Modal popup voor kamer toevoegen/bewerken
        this.deleteModal = document.getElementById('delete-modal');  // Modal popup voor verwijder bevestiging
        this.toast = document.getElementById('toast');  // Toast notificatie element rechtsonder
        this.navLinks = document.querySelectorAll('.nav-link');  // Alle navigatie links (Dashboard, Historie)
        this.pages = document.querySelectorAll('.page');  // Alle pagina secties
        this.filterRoom = document.getElementById('filter-room');  // Kamer filter dropdown op historie pagina
    }
    
    // Koppelt event listeners aan alle klikbare elementen
    bindEvents() {
        var self = this;  // Sla this op in variabele, nodig omdat this in callback functies anders werkt
        
        // Navigatie links - klik om van pagina te wisselen
        for (var i = 0; i < this.navLinks.length; i++) {  // Loop door alle nav links
            this.navLinks[i].addEventListener('click', function(e) {  // Voeg click listener toe aan elke link
                e.preventDefault();  // Voorkom dat browser naar href navigeert
                var targetPage = this.dataset.page;  // Haal data-page attribuut op (dashboard of history)
                self.showPage(targetPage);  // Roep showPage aan met de pagina naam
            });
        }
        
        // Button: Nieuwe kamer toevoegen op dashboard
        document.getElementById('btn-add-room').addEventListener('click', function() {
            self.openAddRoomModal();  // Open de modal voor nieuwe kamer
        });
        
        // Button: Terug naar overzicht (op kamer detail pagina)
        document.getElementById('btn-back').addEventListener('click', function() {
            self.goBackToDashboard();  // Ga terug naar dashboard
        });
        
        // Button: Kamer bewerken (op kamer detail pagina)
        document.getElementById('btn-edit-room').addEventListener('click', function() {
            self.openEditRoomModal();  // Open modal met huidige kamer data
        });
        
        // Button: Kamer verwijderen (op kamer detail pagina)
        document.getElementById('btn-delete-room').addEventListener('click', function() {
            self.confirmDeleteRoom();  // Open bevestiging modal
        });
        
        // Button: Device toevoegen aan kamer
        document.getElementById('btn-assign-device').addEventListener('click', function() {
            self.assignSelectedDevice();  // Koppel geselecteerde device aan huidige kamer
        });
        
        // Modal buttons - Kamer modal sluiten
        document.getElementById('modal-close').addEventListener('click', function() {
            self.closeModal();
        });
        document.getElementById('modal-cancel').addEventListener('click', function() {
            self.closeModal();
        });
        document.getElementById('modal-save').addEventListener('click', function() {
            self.saveRoom();  // Sla kamer op (nieuw of bewerkt)
        });
        
        // Modal buttons - Delete modal
        document.getElementById('delete-modal-close').addEventListener('click', function() {
            self.closeDeleteModal();
        });
        document.getElementById('delete-modal-cancel').addEventListener('click', function() {
            self.closeDeleteModal();
        });
        document.getElementById('delete-modal-confirm').addEventListener('click', function() {
            self.deleteRoom();  // Verwijder de kamer definitief
        });
        
        // Klik buiten modal = modal sluiten
        this.roomModal.addEventListener('click', function(e) {
            if (e.target === self.roomModal) {  // Check of er op overlay geklikt is, niet op modal zelf
                self.closeModal();
            }
        });
        this.deleteModal.addEventListener('click', function(e) {
            if (e.target === self.deleteModal) {
                self.closeDeleteModal();
            }
        });
        
        // Escape toets = modals sluiten
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {  // Check of Escape ingedrukt is
                self.closeModal();
                self.closeDeleteModal();
            }
        });
    }
    
    // Wisselt tussen pagina's (dashboard, room, history)
    showPage(pageName) {
        // Eerst alle nav links inactive maken, dan de juiste active
        for (var i = 0; i < this.navLinks.length; i++) {
            this.navLinks[i].classList.remove('active');  // Verwijder active class
            if (this.navLinks[i].dataset.page === pageName) {  // Als dit de juiste link is
                this.navLinks[i].classList.add('active');  // Voeg active class toe
            }
        }
        
        // Eerst alle pagina's verbergen, dan de juiste tonen
        for (var i = 0; i < this.pages.length; i++) {
            this.pages[i].classList.remove('active');  // Verberg pagina
            if (this.pages[i].id === pageName + '-page') {  // Als dit de juiste pagina is (bijv. 'dashboard-page')
                this.pages[i].classList.add('active');  // Toon pagina
            }
        }
        
        // Als historie pagina geopend wordt, stuur event naar ChartManager
        if (pageName === 'history') {
            var event = new CustomEvent('historyPageOpened');  // Maak custom event aan
            document.dispatchEvent(event);  // Verstuur event, ChartManager luistert hiernaar
        }
    }
    
    // Navigeert terug naar het dashboard
    goBackToDashboard() {
        this.currentRoomId = null;  // Reset huidige kamer
        this.currentRoom = null;
        this.showPage('dashboard');  // Toon dashboard
        this.loadRooms();  // Herlaad kamers voor bijgewerkte data
    }
    
    // Haalt alle kamers op van de server en toont ze
    loadRooms() {
        var self = this;
        this.roomsContainer.innerHTML = '<div class="loading">Kamers laden...</div>';  // Toon loading state
        
        this.api.get('/api/rooms')  // Haal kamers op via ApiService
            .then(function(data) {  // Bij succes
                self.rooms = data;  // Sla kamers op in class variabele
                self.renderRooms();  // Render de kamer cards
                self.updateRoomFilter();  // Update filter dropdown op historie pagina
            })
            .catch(function(error) {  // Bij fout
                self.roomsContainer.innerHTML = '<div class="empty-state"><p>Kon kamers niet laden. Is de backend actief?</p></div>';
                self.showToast('Fout bij laden kamers', true);  // true = error toast (rood)
            });
    }
    
    // Bouwt de HTML voor alle kamer cards
    renderRooms() {
        if (this.rooms.length === 0) {  // Als er geen kamers zijn
            this.roomsContainer.innerHTML = 
                '<div class="add-room-card" id="add-room-card-empty">' +
                    '<div class="add-room-icon">+</div>' +
                    '<span class="add-room-text">Eerste kamer toevoegen</span>' +
                '</div>';
            
            var self = this;
            document.getElementById('add-room-card-empty').addEventListener('click', function() {
                self.openAddRoomModal();
            });
            return;  // Stop functie hier
        }

        var html = '';  // String om HTML in op te bouwen
        
        for (var i = 0; i < this.rooms.length; i++) {  // Loop door alle kamers
            var room = this.rooms[i];  // Huidige kamer object
            
            // Haal temperatuur en vochtigheid op, of '--' als niet beschikbaar
            var temp = '--';
            var humidity = '--';
            if (room.latest && room.latest.temperature) {  // Check of data bestaat
                temp = room.latest.temperature.value;
            }
            if (room.latest && room.latest.humidity) {
                humidity = room.latest.humidity.value;
            }
            
            var statusClass = room.is_online ? '' : 'offline';  // CSS class voor status dot kleur
            var statusText = room.is_online ? 'Online' : 'Offline';
            var deviceText = room.device_count === 1 ? 'device' : 'devices';  // Enkelvoud of meervoud
            
            // Bouw HTML voor deze kamer card met data attributen voor click events
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

        // Voeg "nieuwe kamer" card toe aan het einde
        html += 
            '<div class="add-room-card" id="add-room-card">' +
                '<div class="add-room-icon">+</div>' +
                '<span class="add-room-text">Nieuwe kamer toevoegen</span>' +
            '</div>';

        this.roomsContainer.innerHTML = html;  // Plaats HTML in container
        this.bindRoomCardEvents();  // Koppel click events aan de nieuwe elementen
    }
    
    // Koppelt click events aan dynamisch gegenereerde kamer cards
    bindRoomCardEvents() {
        var self = this;
        
        // Click op kamer card = open kamer detail
        var roomCards = document.querySelectorAll('.room-card');  // Selecteer alle kamer cards
        for (var i = 0; i < roomCards.length; i++) {
            roomCards[i].addEventListener('click', function(e) {
                if (e.target.classList.contains('btn-icon')) return;  // Niet openen als op button geklikt
                var roomId = this.dataset.roomId;  // Haal room ID uit data attribuut
                self.openRoom(parseInt(roomId));  // parseInt zet string om naar nummer
            });
        }
        
        // Click op edit button in card
        var editButtons = document.querySelectorAll('.btn-edit-room');
        for (var i = 0; i < editButtons.length; i++) {
            editButtons[i].addEventListener('click', function(e) {
                e.stopPropagation();  // Stop event bubbling zodat card click niet triggert
                var roomId = this.dataset.roomId;
                self.openEditRoomModalFor(parseInt(roomId));
            });
        }
        
        // Click op delete button in card
        var deleteButtons = document.querySelectorAll('.btn-delete-room');
        for (var i = 0; i < deleteButtons.length; i++) {
            deleteButtons[i].addEventListener('click', function(e) {
                e.stopPropagation();  // Stop event bubbling
                var roomId = this.dataset.roomId;
                self.confirmDeleteRoomFor(parseInt(roomId));
            });
        }
        
        // Click op "Nieuwe kamer" card
        var addRoomCard = document.getElementById('add-room-card');
        if (addRoomCard) {
            addRoomCard.addEventListener('click', function() {
                self.openAddRoomModal();
            });
        }
    }
    
    // Opent de detail pagina van een kamer
    openRoom(roomId) {
        var self = this;
        this.currentRoomId = roomId;  // Sla huidige kamer ID op
        this.devicesContainer.innerHTML = '<div class="loading">Laden...</div>';
        this.showPage('room');  // Wissel naar kamer pagina
        
        // Verwijder active class van nav links (kamer pagina zit niet in nav)
        for (var i = 0; i < this.navLinks.length; i++) {
            this.navLinks[i].classList.remove('active');
        }

        this.api.get('/api/rooms/' + roomId)  // Haal kamer details op inclusief devices
            .then(function(data) {
                self.currentRoom = data;  // Sla kamer data op
                
                // Update titel en subtitle op de pagina
                document.getElementById('room-title').textContent = 'Kamer ' + self.currentRoom.name;
                var deviceCount = self.currentRoom.devices ? self.currentRoom.devices.length : 0;
                document.getElementById('room-subtitle').textContent = deviceCount + ' device(s)';

                self.renderDevices();  // Toon devices
                self.loadUnassignedDevices();  // Laad beschikbare devices voor dropdown
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
        
        for (var i = 0; i < this.currentRoom.devices.length; i++) {  // Loop door alle devices
            var device = this.currentRoom.devices[i];
            
            var statusClass = device.is_online ? '' : 'offline';
            var lastSeenText = device.last_seen_at ? 
                'Laatste update: ' + this.getTimeAgo(new Date(device.last_seen_at)) :  // Bereken tijd geleden
                'Nog geen data';
            
            // Bouw HTML voor sensoren van dit device
            var sensorsHtml = '';
            if (device.sensors) {
                for (var j = 0; j < device.sensors.length; j++) {  // Loop door alle sensoren
                    var sensor = device.sensors[j];
                    var sensorValue = sensor.latest_value !== null ? sensor.latest_value : '--';  // Waarde of '--'
                    var sensorUnit = sensor.unit || '';  // Unit of lege string
                    
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
                var devEui = this.dataset.devEui;  // Haal device EUI uit data attribuut
                self.unassignDevice(devEui);
            });
        }
    }
    
    // Haalt devices op die nog niet aan een kamer gekoppeld zijn
    loadUnassignedDevices() {
        var self = this;
        
        this.api.get('/api/devices?unassigned=1')  // Query parameter filtert op ongekoppelde devices
            .then(function(devices) {
                self.unassignedDevices = devices;  // Sla devices op
                self.renderDeviceSelect();  // Vul de dropdown
            })
            .catch(function(error) {
                console.error('Fout bij laden devices:', error);
            });
    }
    
    // Vult de device select dropdown met beschikbare devices
    renderDeviceSelect() {
        var html = '<option value="">-- Selecteer een device --</option>';  // Eerste optie = placeholder
        
        for (var i = 0; i < this.unassignedDevices.length; i++) {  // Loop door beschikbare devices
            var device = this.unassignedDevices[i];
            var deviceName = device.name || 'Device ' + device.dev_eui.slice(-4);  // Naam of laatste 4 chars
            html += '<option value="' + device.dev_eui + '">' + deviceName + ' (' + device.dev_eui.slice(-8) + ')</option>';
        }
        
        this.deviceSelect.innerHTML = html;  // Plaats options in select element
        
        // Verberg hele sectie als er geen devices beschikbaar zijn
        if (this.unassignedDevices.length === 0) {
            this.addDeviceSection.style.display = 'none';
        } else {
            this.addDeviceSection.style.display = 'flex';
        }
    }
    
    // Koppelt het geselecteerde device aan de huidige kamer
    assignSelectedDevice() {
        var self = this;
        var selectedDevEui = this.deviceSelect.value;  // Haal geselecteerde waarde uit dropdown
        
        if (!selectedDevEui) {  // Check of er iets geselecteerd is
            this.showToast('Selecteer eerst een device', true);
            return;
        }
        
        this.api.put('/api/devices/' + selectedDevEui + '/room', { room_id: this.currentRoomId })  // Update device
            .then(function() {
                self.showToast('Device toegevoegd aan kamer');
                self.openRoom(self.currentRoomId);  // Herlaad pagina om wijziging te tonen
            })
            .catch(function(error) {
                self.showToast('Fout bij toevoegen device', true);
            });
    }
    
    // Ontkoppelt een device van de huidige kamer
    unassignDevice(devEui) {
        var self = this;
        
        if (!confirm('Weet je zeker dat je dit device wilt ontkoppelen van deze kamer?')) {
            return;  // Stop als gebruiker annuleert
        }
        
        this.api.put('/api/devices/' + devEui + '/room', { room_id: null })  // null = geen kamer
            .then(function() {
                self.showToast('Device ontkoppeld van kamer');
                self.openRoom(self.currentRoomId);  // Herlaad kamer pagina
                self.loadRooms();  // Herlaad dashboard voor bijgewerkte counts
            })
            .catch(function(error) {
                self.showToast('Fout bij ontkoppelen device', true);
            });
    }
    
    // Opent modal voor nieuwe kamer
    openAddRoomModal() {
        this.editMode = false;  // Zet edit mode uit
        document.getElementById('modal-title').textContent = 'Nieuwe kamer toevoegen';
        document.getElementById('room-name-input').value = '';  // Leeg input veld
        this.roomModal.classList.add('active');  // Toon modal met CSS transition
    }
    
    // Opent modal voor bewerken van huidige kamer
    openEditRoomModal() {
        if (this.currentRoom) {
            this.openEditRoomModalFor(this.currentRoom.room_id);
        }
    }
    
    // Opent modal voor bewerken van specifieke kamer
    openEditRoomModalFor(roomId) {
        var room = null;
        for (var i = 0; i < this.rooms.length; i++) {  // Zoek kamer in array
            if (this.rooms[i].room_id === roomId) {
                room = this.rooms[i];
                break;  // Stop loop als gevonden
            }
        }
        if (!room) return;  // Stop als niet gevonden
        
        this.editMode = true;  // Zet edit mode aan
        this.currentRoomId = roomId;
        document.getElementById('modal-title').textContent = 'Kamer bewerken';
        document.getElementById('room-name-input').value = room.name;  // Vul huidige naam in
        this.roomModal.classList.add('active');
    }
    
    // Sluit de kamer modal
    closeModal() {
        this.roomModal.classList.remove('active');  // Verberg modal met CSS transition
    }
    
    // Slaat kamer op (nieuw of bewerkt)
    saveRoom() {
        var self = this;
        var name = document.getElementById('room-name-input').value.trim();  // Haal naam op, trim spaties
        
        if (!name) {  // Check of naam niet leeg is
            this.showToast('Vul een kamernaam in', true);
            return;
        }

        var endpoint = this.editMode ? '/api/rooms/' + this.currentRoomId : '/api/rooms';  // PUT of POST endpoint
        var method = this.editMode ? 'put' : 'post';  // Bepaal welke methode te gebruiken
        
        this.api[method](endpoint, { name: name })  // Roep api.put() of api.post() aan
            .then(function() {
                self.showToast('Kamer ' + name + (self.editMode ? ' bijgewerkt' : ' aangemaakt'));
                self.closeModal();
                self.loadRooms();  // Herlaad kamers
                if (self.currentRoomId && self.editMode) {
                    self.openRoom(self.currentRoomId);  // Herlaad kamer detail als in edit mode
                }
            })
            .catch(function(error) {
                self.showToast('Fout bij opslaan', true);
            });
    }
    
    // Opent verwijder bevestiging voor huidige kamer
    confirmDeleteRoom() {
        if (this.currentRoom) {
            this.confirmDeleteRoomFor(this.currentRoom.room_id);
        }
    }
    
    // Opent verwijder bevestiging voor specifieke kamer
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
        document.getElementById('delete-room-name').textContent = room.name;  // Toon naam in modal
        this.deleteModal.classList.add('active');
    }
    
    // Sluit verwijder modal
    closeDeleteModal() {
        this.deleteModal.classList.remove('active');
    }
    
    // Verwijdert de kamer definitief
    deleteRoom() {
        var self = this;
        if (!this.currentRoomId) return;
        
        this.api.delete('/api/rooms/' + this.currentRoomId)  // Stuur DELETE request
            .then(function() {
                self.closeDeleteModal();
                self.showToast('Kamer verwijderd');
                self.currentRoomId = null;
                self.currentRoom = null;
                self.goBackToDashboard();  // Terug naar dashboard
            })
            .catch(function() {
                self.showToast('Fout bij verwijderen', true);
            });
    }
    
    // Zet technische sensor type om naar Nederlandse naam
    getSensorTypeName(type) {
        if (this.sensorTypes[type]) {  // Check of type in lookup tabel staat
            return this.sensorTypes[type].name;
        }
        return type;  // Return originele type als niet gevonden
    }
    
    // Berekent hoe lang geleden een datum was
    getTimeAgo(date) {
        var now = Date.now();  // Huidige tijd in milliseconden sinds 1970
        var diffMs = now - date.getTime();  // Verschil in milliseconden
        var diffMins = Math.floor(diffMs / 60000);  // Deel door 60000 voor minuten
        var diffHours = Math.floor(diffMs / 3600000);  // Deel door 3600000 voor uren
        var diffDays = Math.floor(diffMs / 86400000);  // Deel door 86400000 voor dagen
        
        if (diffMins < 1) return 'Zojuist';
        if (diffMins < 60) return diffMins + ' min geleden';
        if (diffHours < 24) return diffHours + ' uur geleden';
        return diffDays + ' dagen geleden';
    }
    
    // Toont toast notificatie rechtsonder in scherm
    showToast(message, isError) {
        this.toast.textContent = message;  // Zet tekst
        
        if (isError) {
            this.toast.className = 'toast error';  // Rode achtergrond
        } else {
            this.toast.className = 'toast';  // Groene achtergrond
        }
        
        this.toast.classList.add('show');  // Maak zichtbaar met CSS transition
        
        var self = this;
        setTimeout(function() {  // Na 3 seconden verbergen
            self.toast.classList.remove('show');
        }, 3000);
    }
    
    // Update de kamer filter dropdown op historie pagina
    updateRoomFilter() {
        var html = '<option value="">Alle kamers</option>';  // Eerste optie = geen filter
        
        for (var i = 0; i < this.rooms.length; i++) {  // Loop door alle kamers
            html += '<option value="' + this.rooms[i].room_id + '">' + this.rooms[i].name + '</option>';
        }
        
        this.filterRoom.innerHTML = html;  // Plaats in select element
    }
    
    // Geeft kamers array terug voor gebruik door andere classes
    getRooms() {
        return this.rooms;
    }
    
    // Geeft sensor types terug voor gebruik door ChartManager
    getSensorTypes() {
        return this.sensorTypes;
    }
}