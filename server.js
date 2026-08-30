const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Pobieranie kodu PIN z zakładki Variables na Railway
// Jeśli zmienna Admin_Pin nie jest ustawiona, zapasowo ustawi '1234'
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

// Serwowanie plików statycznych z folderu 'Public'
app.use(express.static(path.join(__dirname, 'Public'), {
    extensions: ['html']
}));

// Fallback: jeśli ktoś wejdzie bezpośrednio na /revmi, wyślij plik
app.get('/revmi', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'revmi.html'));
});

app.listen(PORT, () => {
    console.log(`Serwer RevMi działa na porcie ${PORT}`);
});
