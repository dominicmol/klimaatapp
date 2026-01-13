// ChartManager - regelt grafieken en historie tabel op de historie pagina

class ChartManager {
    
    constructor(apiService, roomManager) {
        this.api = apiService;  // Referentie naar ApiService voor server calls
        this.roomManager = roomManager;  // Referentie naar RoomManager om sensor types op te halen
        this.charts = {};  // Object om Chart.js instances in op te slaan, key = sensor type
        
        this.deviceColors = [  // Kleuren voor verschillende devices in grafieken
            '#2D5A3D', '#E07B67', '#4169E1',  // Groen, koraal, blauw
            '#FFD700', '#8B4513', '#6B7B6C',  // Goud, bruin, grijs
            '#FF6347', '#20B2AA', '#9370DB', '#3CB371'  // Extra kleuren voor meer devices
        ];
        
        this.cacheElements();  // Sla DOM elementen op
        this.bindEvents();  // Koppel event listeners
    }
    
    // Slaat veelgebruikte DOM elementen op
    cacheElements() {
        this.chartsContainer = document.getElementById('charts-container');  // Container voor alle grafieken
        this.historyTbody = document.getElementById('history-tbody');  // Tbody van historie tabel
        this.filterRoom = document.getElementById('filter-room');  // Kamer filter dropdown
        this.filterSensor = document.getElementById('filter-sensor');  // Sensor type filter dropdown
    }
    
    // Koppelt event listeners
    bindEvents() {
        var self = this;
        
        // Filter button - herlaad data met geselecteerde filters
        document.getElementById('btn-filter').addEventListener('click', function() {
            self.loadHistory();  // Herlaad tabel
            self.initAllCharts();  // Herlaad grafieken
            self.showToast('Filter toegepast');
        });
        
        // Luister naar event van RoomManager wanneer historie pagina geopend wordt
        document.addEventListener('historyPageOpened', function() {
            self.loadSensorTypeFilter();  // Vul sensor dropdown
            self.loadHistory();  // Laad historie data
            setTimeout(function() {  // Kleine delay zodat DOM klaar is
                self.initAllCharts();  // Initialiseer grafieken
            }, 100);
        });
    }
    
    // Vult de sensor type filter dropdown
    loadSensorTypeFilter() {
        var sensorTypes = this.roomManager.getSensorTypes();  // Haal sensor types op van RoomManager
        var html = '<option value="">Alle sensoren</option>';  // Eerste optie = geen filter
        
        var types = Object.keys(sensorTypes);  // Haal alle keys uit object en zet in array
        for (var i = 0; i < types.length; i++) {  // Loop door alle sensor types
            var type = types[i];  // Huidige type, bijv 'temperature'
            html += '<option value="' + type + '">' + sensorTypes[type].name + '</option>';  // Voeg option toe
        }
        
        this.filterSensor.innerHTML = html;  // Plaats options in select element
    }
    
    // Haalt meetgegevens op en toont ze in de tabel
    loadHistory() {
        var self = this;
        var roomFilter = this.filterRoom.value;  // Geselecteerde kamer of leeg
        var sensorFilter = this.filterSensor.value;  // Geselecteerde sensor of leeg
        
        // Bouw query string met filters
        var queryString = '?limit=100';  // Max 100 resultaten
        if (roomFilter) {  // Als kamer geselecteerd
            queryString += '&room_id=' + roomFilter;
        }
        if (sensorFilter) {  // Als sensor geselecteerd
            queryString += '&sensor_type=' + sensorFilter;
        }

        this.api.get('/api/measurements' + queryString)  // Haal data op van server
            .then(function(measurements) {
                self.renderHistory(measurements);  // Render in tabel
            })
            .catch(function() {
                self.historyTbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Kon data niet laden</td></tr>';
            });
    }
    
    // Bouwt HTML voor de historie tabel
    renderHistory(measurements) {
        if (measurements.length === 0) {  // Als geen data
            this.historyTbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Geen metingen gevonden</td></tr>';
            return;
        }
        
        var sensorTypes = this.roomManager.getSensorTypes();  // Haal sensor types op voor Nederlandse namen
        var html = '';
        
        for (var i = 0; i < measurements.length; i++) {  // Loop door alle metingen
            var m = measurements[i];  // Huidige meting object
            var dateStr = this.formatDateTime(new Date(m.measured_at));  // Format datum
            var roomName = m.room_name || '-';  // Kamer naam of '-' als niet gekoppeld
            var deviceId = m.dev_eui ? m.dev_eui.slice(-8) : '-';  // Laatste 8 chars van device ID
            var sensorType = sensorTypes[m.sensor_type] ? sensorTypes[m.sensor_type].name : m.sensor_type;  // Nederlandse naam
            var value = m.value + ' ' + (m.unit || '');  // Waarde + unit
            
            html +=  // Bouw tabel rij
                '<tr>' +
                    '<td>' + dateStr + '</td>' +
                    '<td>' + roomName + '</td>' +
                    '<td><code>' + deviceId + '</code></td>' +
                    '<td>' + sensorType + '</td>' +
                    '<td class="value-cell">' + value + '</td>' +
                '</tr>';
        }
        
        this.historyTbody.innerHTML = html;  // Plaats HTML in tbody
    }
    
    // Initialiseert alle grafieken
    initAllCharts() {
        var self = this;
        
        // Vernietig bestaande grafieken om memory leaks te voorkomen
        var chartKeys = Object.keys(this.charts);  // Haal alle chart keys op
        for (var i = 0; i < chartKeys.length; i++) {  // Loop door bestaande charts
            if (this.charts[chartKeys[i]]) {
                this.charts[chartKeys[i]].destroy();  // Chart.js destroy methode ruimt geheugen op
            }
        }
        this.charts = {};  // Reset charts object
        
        // Bouw query string met filters
        var roomFilter = this.filterRoom.value;
        var sensorFilter = this.filterSensor.value;
        var queryString = '?';
        
        if (roomFilter) {
            queryString += 'room_id=' + roomFilter + '&';
        }
        if (sensorFilter) {
            queryString += 'sensor_type=' + sensorFilter;
        }
        
        this.api.get('/api/measurements/chart' + queryString)  // Haal chart data op (gegroepeerd per uur)
            .then(function(chartData) {
                self.renderAllCharts(chartData, sensorFilter);  // Render de grafieken
            })
            .catch(function(error) {
                console.error('Grafiek data laden mislukt:', error);
                self.chartsContainer.innerHTML = '<div class="empty-state">Kon grafiekdata niet laden</div>';
            });
    }
    
    // Rendert alle grafieken met Chart.js
    renderAllCharts(chartData, filterType) {
        var sensorTypes = this.roomManager.getSensorTypes();  // Haal sensor types op
        
        // Groepeer data per sensor type en device
        var dataByType = {};  // Structuur: { sensorType: { deviceName: { hour: value } } }
        var allHours = [];  // Array met alle unieke uren voor x-as
        
        for (var i = 0; i < chartData.length; i++) {  // Loop door alle data punten
            var d = chartData[i];  // Huidige data punt
            var type = d.sensor_type;  // Sensor type, bijv 'temperature'
            
            if (!dataByType[type]) {  // Als type nog niet bestaat in object
                dataByType[type] = {};  // Maak nieuw object aan
            }
            
            var deviceKey = d.device_name || d.dev_eui.slice(-8);  // Device naam of laatste 8 chars
            if (!dataByType[type][deviceKey]) {  // Als device nog niet bestaat
                dataByType[type][deviceKey] = {};
            }
            
            dataByType[type][deviceKey][d.hour] = parseFloat(d.avg_value);  // Sla gemiddelde waarde op per uur
            
            if (allHours.indexOf(d.hour) === -1) {  // Als uur nog niet in array zit
                allHours.push(d.hour);  // Voeg toe aan array
            }
        }
        
        allHours.sort();  // Sorteer uren chronologisch
        
        // Bepaal welke sensor types getoond worden
        var typesToShow = filterType ? [filterType] : Object.keys(sensorTypes);  // Gefilterd of allemaal
        
        // Bouw HTML voor grafiek cards
        var html = '';
        
        for (var t = 0; t < typesToShow.length; t++) {  // Loop door te tonen types
            var type = typesToShow[t];
            var typeInfo = sensorTypes[type] || { name: type, unit: '' };  // Info of fallback
            var hasData = dataByType[type] && Object.keys(dataByType[type]).length > 0;  // Check of data bestaat
            
            html +=  // Bouw card HTML
                '<div class="chart-card">' +
                    '<div class="chart-header">' +
                        '<div>' +
                            '<span class="chart-title">' + typeInfo.name + ' (' + typeInfo.unit + ')</span>' +
                            '<div class="chart-subtitle">Gemiddelde per uur, per device</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="chart-container">' +
                        (hasData ? '<canvas id="chart-' + type + '"></canvas>' : '<div class="chart-empty">Geen data beschikbaar</div>') +
                    '</div>' +
                '</div>';
        }
        
        this.chartsContainer.innerHTML = html;  // Plaats alle card HTML
        
        // Render elke grafiek met Chart.js
        for (var t = 0; t < typesToShow.length; t++) {
            var type = typesToShow[t];
            
            if (!dataByType[type] || Object.keys(dataByType[type]).length === 0) {  // Skip als geen data
                continue;
            }
            
            var canvas = document.getElementById('chart-' + type);  // Haal canvas element op
            if (!canvas) continue;  // Skip als niet gevonden
            
            var devices = Object.keys(dataByType[type]);  // Alle device namen voor dit type
            var datasets = [];  // Array voor Chart.js datasets
            
            // Maak dataset voor elk device
            for (var d = 0; d < devices.length; d++) {  // Loop door devices
                var deviceName = devices[d];
                var dataPoints = [];  // Array met waarden voor dit device
                
                for (var h = 0; h < allHours.length; h++) {  // Loop door alle uren
                    var value = dataByType[type][deviceName][allHours[h]];  // Haal waarde op voor dit uur
                    dataPoints.push(value !== undefined ? value : null);  // null voor ontbrekende data
                }
                
                datasets.push({  // Voeg dataset toe aan array
                    label: deviceName,  // Naam in legenda
                    data: dataPoints,  // Waarden array
                    borderColor: this.deviceColors[d % this.deviceColors.length],  // Kleur, % zorgt dat kleuren herhalen
                    backgroundColor: this.deviceColors[d % this.deviceColors.length] + '20',  // Zelfde kleur met 20% opacity
                    fill: false,  // Geen vulling onder lijn
                    tension: 0.3,  // Lichte curve in de lijn
                    pointRadius: 3,  // Grootte van datapunten
                    pointStyle: d === 0 ? 'circle' : d === 1 ? 'rect' : 'triangle',  // Verschillende punt vormen per device
                    borderWidth: 2,  // Lijndikte
                    borderDash: d === 1 ? [5, 5] : [],  // Stippellijn voor tweede device
                    spanGaps: true  // Trek lijn door over ontbrekende data
                });
            }
            
            // Format x-as labels (dag + uur)
            var labels = [];
            for (var h = 0; h < allHours.length; h++) {  // Loop door uren
                var hourDate = new Date(allHours[h]);  // Maak Date object
                var dayName = hourDate.toLocaleDateString('nl-NL', { weekday: 'short' });  // Korte dag (ma, di, etc)
                var hourStr = ('0' + hourDate.getHours()).slice(-2) + ':00';  // Uur met voorloop nul
                labels.push(dayName + ' ' + hourStr);  // Combineer tot label
            }
            
            // Maak Chart.js grafiek
            this.charts[type] = new Chart(canvas, {  // new Chart maakt een grafiek aan
                type: 'line',  // Lijn grafiek
                data: {
                    labels: labels,  // X-as labels
                    datasets: datasets  // Data per device
                },
                options: {
                    responsive: true,  // Past zich aan aan container grootte
                    maintainAspectRatio: false,  // Gebruik height van container
                    plugins: {
                        legend: {
                            position: 'bottom',  // Legenda onderaan
                            labels: { boxWidth: 12 }  // Kleinere kleur boxjes
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                maxRotation: 45,  // Roteer labels max 45 graden
                                minRotation: 45,  // Roteer labels min 45 graden
                                maxTicksLimit: 12  // Max 12 labels op x-as
                            }
                        },
                        y: {
                            beginAtZero: type === 'presence' || type === 'light'  // Start bij 0 voor percentage types
                        }
                    }
                }
            });
        }
    }
    
    // Format datum naar Nederlandse notatie
    formatDateTime(date) {
        var day = ('0' + date.getDate()).slice(-2);  // Dag met voorloop nul, slice(-2) pakt laatste 2 chars
        var month = ('0' + (date.getMonth() + 1)).slice(-2);  // Maand +1 want getMonth is 0-indexed
        var year = date.getFullYear();  // Volledig jaar
        var hours = ('0' + date.getHours()).slice(-2);  // Uur met voorloop nul
        var minutes = ('0' + date.getMinutes()).slice(-2);  // Minuten met voorloop nul
        
        return day + '-' + month + '-' + year + ' ' + hours + ':' + minutes;  // DD-MM-YYYY HH:MM
    }
    
    // Toont toast notificatie
    showToast(message, isError) {
        var toast = document.getElementById('toast');  // Haal toast element op
        toast.textContent = message;  // Zet tekst
        
        if (isError) {
            toast.className = 'toast error';  // Rode achtergrond voor errors
        } else {
            toast.className = 'toast';  // Groene achtergrond voor succes
        }
        
        toast.classList.add('show');  // Maak zichtbaar
        
        setTimeout(function() {  // Na 3 seconden verbergen
            toast.classList.remove('show');
        }, 3000);
    }
}