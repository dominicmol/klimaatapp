// ApiService - regelt alle communicatie met de backend server

class ApiService {
    
    constructor() {
        this.baseUrl = '';  // Leeg omdat frontend en backend op dezelfde server draaien
    }
    
    // GET request - haalt data op van de server
    get(endpoint) {
        return fetch(this.baseUrl + endpoint)  // fetch() stuurt HTTP request naar de server
            .then(function(response) {  // .then() vangt het antwoord op zodra server reageert
                if (!response.ok) {  // response.ok is true bij status 200-299
                    throw new Error('Server gaf een foutmelding');
                }
                return response.json();  // Zet response om van JSON string naar JavaScript object
            });
    }
    
    // POST request - maakt nieuwe data aan op de server
    post(endpoint, data) {
        var options = {
            method: 'POST',  // POST = nieuwe data aanmaken
            headers: {
                'Content-Type': 'application/json'  // Vertelt server dat data in JSON formaat is
            },
            body: JSON.stringify(data)  // Zet JavaScript object om naar JSON string
        };
        
        return fetch(this.baseUrl + endpoint, options)  // Voer fetch uit met de options erbij
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Server gaf een foutmelding');
                }
                return response.json();
            });
    }
    
    // PUT request - werkt bestaande data bij op de server
    put(endpoint, data) {
        var options = {
            method: 'PUT',  // PUT = bestaande data bijwerken
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        };
        
        return fetch(this.baseUrl + endpoint, options)  // Voer fetch uit met de options erbij
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Server gaf een foutmelding');
                }
                return response.json();
            });
    }
    
    // DELETE request - verwijdert data van de server
    delete(endpoint) {
        var options = {
            method: 'DELETE',  // DELETE = data verwijderen
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        return fetch(this.baseUrl + endpoint, options)  // Voer fetch uit met de options erbij
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Server gaf een foutmelding');
                }
                return response.json();
            });
    }
}