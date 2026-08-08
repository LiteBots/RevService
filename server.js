const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serwowanie plików statycznych (HTML, CSS, JS) z folderu 'Public'
// Dodajemy opcję extensions: ['html'], co automatycznie pozwala na dostęp bez końcówki .html
app.use(express.static(path.join(__dirname, 'Public'), {
    extensions: ['html']
}));

// Serwowanie plików statycznych z głównego katalogu (np. png, jpg) 
// Używamy prefixu '/assets', aby chronić pliki źródłowe
app.use('/assets', express.static(__dirname));

// Domyślna ścieżka dla strony głównej
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Zdefiniowane ścieżki dla czystych linków (przyjazne URL)
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'login.html'));
});

app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'panel.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'admin.html'));
});

// Start serwera
app.listen(PORT, () => {
    console.log(`\n🚀 Serwer RevSerwis działa!`);
    console.log(`🌐 Otwórz w przeglądarce: http://localhost:${PORT}\n`);
});
