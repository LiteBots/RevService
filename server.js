const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Pobieranie kodu PIN z zakładki Variables na Railway
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

// Niezbędne middleware do parsowania JSON wysyłanego z panelu logowania
app.use(express.json());

// Tworzymy API, które przyjmuje zapytanie z RevMi.html i sprawdza PIN
app.post('/api/verify-pin', (req, res) => {
    const { pin } = req.body;
    
    if (pin === ADMIN_PIN) {
        res.json({ success: true, message: 'Zalogowano pomyślnie' });
    } else {
        res.status(401).json({ success: false, message: 'Nieprawidłowy PIN' });
    }
});

// Serwowanie plików statycznych z folderu 'Public' (grafiki, style itp.)
app.use(express.static(path.join(__dirname, 'Public'), {
    extensions: ['html']
}));


// ==========================================
// DEFINIOWANIE KONKRETNYCH ŚCIEŻEK (ROUTING)
// ==========================================

// Strona główna (jeśli masz plik index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// System RevMi
app.get('/revmi', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'revmi.html'));
});

// Przeprowadzki
app.get('/przeprowadzki', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'przeprowadzki.html'));
});

// Przewozy osób
app.get('/przewozy-osob', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'przewozy-osob.html'));
});

// Opróżnianie i utylizacja
app.get('/oproznianie-utylizacja', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'oproznianie-utylizacja.html'));
});

// Transport
app.get('/transport', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'transport.html'));
});

// Polityka prywatności - obsługa linku z polskimi znakami
app.get('/polityka-prywatności', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'polityka-prywatności.html'));
});

// Polityka prywatności - obsługa "czystego" linku bez polskich znaków (rekomendowane w SEO)
app.get('/polityka-prywatnosci', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'polityka-prywatności.html'));
});

// Uruchomienie serwera
app.listen(PORT, () => {
    console.log(`Serwer działa poprawnie na porcie ${PORT}`);
});
