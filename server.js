const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serwowanie plików statycznych (HTML) z folderu 'Public'
app.use(express.static(path.join(__dirname, 'Public')));

// Serwowanie plików statycznych z głównego katalogu (np. png, jpg) 
// Używamy prefixu '/assets', aby nie udostępniać przypadkiem wrażliwych plików źródłowych jak server.js
app.use('/assets', express.static(__dirname));

// Domyślna ścieżka dla strony głównej
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Start serwera
app.listen(PORT, () => {
    console.log(`\n🚀 Serwer RevSerwis działa!`);
    console.log(`🌐 Otwórz w przeglądarce: http://localhost:${PORT}\n`);
});
