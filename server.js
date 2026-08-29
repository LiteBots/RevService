const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware do parsowania JSON (na wypadek, gdybyś chciał w przyszłości dodać backend API)
app.use(express.json());

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

// Polityka prywatności
app.get('/prywatnosc', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'prywatnosc.html'));
});

// ==========================================
// SYSTEMY ZARZĄDZANIA (RevMi / RevControl)
// ==========================================
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'login.html'));
});

app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'panel.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'admin.html'));
});

// Nowa aplikacja PWA RevMi
app.get('/revmi', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'revmi.html'));
});

// Start serwera
app.listen(PORT, () => {
    console.log(`\n🚀 Serwer RevSerwis działa na porcie ${PORT}!`);
    console.log(`🌐 Otwórz w przeglądarce: http://localhost:${PORT}\n`);
});
