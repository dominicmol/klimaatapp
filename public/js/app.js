// app.js - Start de applicatie en maakt instances van alle classes

console.log('app.js wordt geladen...');

// Stap 1: Maak instances van alle classes in de juiste volgorde

console.log('ApiService aanmaken...');
var api = new ApiService();

console.log('RoomManager aanmaken...');
var roomManager = new RoomManager(api);

console.log('ChartManager aanmaken...');
var chartManager = new ChartManager(api, roomManager);

// Stap 2: Start de applicatie

console.log('Kamers laden...');
roomManager.loadRooms();

console.log('App gestart!');