require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const MONGO_URL = process.env.MONGO_URL;

let dbConnected = false;

// Połączenie z MongoDB
if (MONGO_URL) {
    mongoose.connect(MONGO_URL)
        .then(() => {
            dbConnected = true;
            console.log('✅ Połączono z bazą MongoDB');
        })
        .catch(err => console.error('❌ Błąd połączenia z MongoDB:', err));
} else {
    console.warn('⚠️ Brak zmiennej MONGO_URL. System zapisu nie zadziała!');
}

// Schematy Bazy Danych
const PracownikSchema = new mongoose.Schema({
    imie: String,
    rola: String,
    dzial: String,
    zarobki: { type: Number, default: 0 },
    zleceniaCount: { type: Number, default: 0 },
    status: { type: String, default: 'Dostępny' }
});
const Pracownik = mongoose.model('Pracownik', PracownikSchema);

const ZlecenieSchema = new mongoose.Schema({
    typ: String,
    data: String,
    stawka: Number,
    ekipa: String,
    skad: String,
    dokad: String,
    opis: String,
    status: { type: String, default: 'W trakcie' },
    createdAt: { type: Date, default: Date.now }
});
const Zlecenie = mongoose.model('Zlecenie', ZlecenieSchema);

// Middleware
app.use(express.json());
app.use(cookieParser());

// Routing HTML
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Logowanie
app.post('/api/login', (req, res) => {
    if (req.body.pin === ADMIN_PIN) {
        res.cookie('auth_token', 'zalogowano', { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });
        return res.status(200).json({ success: true });
    }
    return res.status(401).json({ success: false, message: 'Błędny PIN' });
});

app.get('/api/check-auth', (req, res) => {
    if (req.cookies.auth_token === 'zalogowano') return res.status(200).json({ authenticated: true });
    return res.status(401).json({ authenticated: false });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('auth_token');
    return res.status(200).json({ success: true });
});

const requireAuth = (req, res, next) => {
    if (req.cookies.auth_token === 'zalogowano') next();
    else res.status(401).json({ error: 'Brak autoryzacji' });
};

// API: Pracownicy
app.get('/api/pracownicy', requireAuth, async (req, res) => {
    if (!dbConnected) return res.json([]); 
    try {
        const pracownicy = await Pracownik.find();
        res.json(pracownicy);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pracownicy', requireAuth, async (req, res) => {
    if (!dbConnected) return res.status(500).json({ error: 'Brak połączenia z MongoDB!' });
    try {
        const nowy = new Pracownik(req.body);
        await nowy.save();
        res.json({ success: true, pracownik: nowy });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// NOWE API: Dodawanie wypłaty (zwiększanie zarobków)
app.post('/api/pracownicy/wyplata', requireAuth, async (req, res) => {
    if (!dbConnected) return res.status(500).json({ error: 'Brak połączenia z MongoDB!' });
    try {
        const { imie, kwota } = req.body;
        // Znajdź pracownika po imieniu i zwiększ jego zarobki ($inc)
        const pracownik = await Pracownik.findOneAndUpdate(
            { imie: imie },
            { $inc: { zarobki: Number(kwota) } },
            { new: true }
        );
        if (!pracownik) return res.status(404).json({ error: 'Nie znaleziono pracownika' });
        res.json({ success: true, pracownik });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// API: Zlecenia
app.get('/api/zlecenia', requireAuth, async (req, res) => {
    if (!dbConnected) return res.json([]);
    try {
        const zlecenia = await Zlecenie.find().sort({ createdAt: -1 });
        res.json(zlecenia);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/zlecenia', requireAuth, async (req, res) => {
    if (!dbConnected) return res.status(500).json({ error: 'Brak połączenia z MongoDB!' });
    try {
        const nowe = new Zlecenie(req.body);
        await nowe.save();
        res.json({ success: true, zlecenie: nowe });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));
