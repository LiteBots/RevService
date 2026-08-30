const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Prawidłowe serwowanie plików statycznych z folderu 'Public'
// Automatycznie pozwala na dostęp bez wpisywania końcówki .html
app.use(express.static(path.join(__dirname, 'Public'), {
    extensions: ['html']
}));

// Domyślna ścieżka dla strony głównej
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// ==========================================
// PRZYJAZNE LINKI DLA PODSTRON USŁUGOWYCH
// ==========================================
app.get('/przeprowadzki', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'przeprowadzki.html'));
});

app.get('/przewozy-osob', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'przewozy-osob.html'));
});

app.get('/utylizacja', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'utylizacja.html'));
});

app.get('/transport', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'transport.html'));
});

app.get('/prywatnosc', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'prywatnosc.html'));
});

// ==========================================
// SYSTEMY ZARZĄDZANIA (RevMi / RevControl)
// ==========================================
app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'panel.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'admin.html'));
});

// Główna aplikacja PWA RevMi (bez logowania)
app.get('/revmi', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'revmi.html'));
});

// ==========================================
// OBSŁUGA BŁĘDÓW
// ==========================================
// Jeśli nikt nie trafił w żaden z powyższych linków (np. literówka w URL), 
// serwer awaryjnie wczyta stronę główną, zamiast wyświetlać błąd "Cannot GET"
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Start serwera z flagą '0.0.0.0' gwarantującą bezproblemowe działanie na chmurach (Railway)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Serwer RevSerwis działa na porcie ${PORT}!`);
    console.log(`🌐 Otwórz w przeglądarce: http://localhost:${PORT}\n`);
});
