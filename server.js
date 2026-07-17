require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Pobieranie PINu ze zmiennych środowiskowych Railway. 
// Jeśli nie jest ustawiony, domyślnie to '1234'.
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint: Logowanie
app.post('/api/login', (req, res) => {
    const { pin } = req.body;
    
    if (pin === ADMIN_PIN) {
        // Zabezpieczenie poprzez httpOnly cookie - ważne 24 godziny
        res.cookie('auth_token', 'zalogowano', {
            maxAge: 24 * 60 * 60 * 1000, 
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production' // na Railway włączy się dla HTTPS
        });
        return res.status(200).json({ success: true });
    } else {
        return res.status(401).json({ success: false, message: 'Błędny kod PIN' });
    }
});

// Endpoint: Sprawdzanie czy użytkownik jest zalogowany
app.get('/api/check-auth', (req, res) => {
    if (req.cookies.auth_token === 'zalogowano') {
        return res.status(200).json({ authenticated: true });
    }
    return res.status(401).json({ authenticated: false });
});

// Endpoint: Wylogowanie
app.post('/api/logout', (req, res) => {
    res.clearCookie('auth_token');
    return res.status(200).json({ success: true });
});

// Start serwera
app.listen(PORT, () => {
    console.log(`Serwer RevAdmin działa na porcie ${PORT}`);
});
