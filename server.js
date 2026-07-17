require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
// Zmienna z linkiem do MongoDB z Railway
const MONGODB_URI = process.env.MONGODB_URI;

// Połączenie z MongoDB
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('✅ Połączono z MongoDB'))
        .catch(err => console.error('❌ Błąd połączenia z MongoDB:', err));
} else {
    console.warn('⚠️ Brak zmiennej MONGODB_URI. Dane nie będą zapisywane w bazie!');
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
    status: { type: String, default: 'Oczekuje' },
    createdAt: { type: Date, default: Date.now }
});
const Zlecenie = mongoose.model('Zlecenie', ZlecenieSchema);

// Middleware
app.use(express.json());
app.use(cookieParser());

// Routing dla plików HTML
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// --- AUTORYZACJA ---
app.post('/api/login', (req, res) => {
    if (req.body.pin === ADMIN_PIN) {
        res.cookie('auth_token', 'zalogowano', { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });
        return res.status(200).json({ success: true });
    }
    return res.status(401).json({ success: false, message: 'Błędny kod PIN' });
});

app.get('/api/check-auth', (req, res) => {
    if (req.cookies.auth_token === 'zalogowano') return res.status(200).json({ authenticated: true });
    return res.status(401).json({ authenticated: false });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('auth_token');
    return res.status(200).json({ success: true });
});

// Middleware zabezpieczający endpointy danych (tylko zalogowani mają dostęp)
const requireAuth = (req, res, next) => {
    if (req.cookies.auth_token === 'zalogowano') next();
    else res.status(401).json({ error: 'Brak autoryzacji' });
};

// --- API: PRACOWNICY ---
app.get('/api/pracownicy', requireAuth, async (req, res) => {
    const pracownicy = await Pracownik.find();
    res.json(pracownicy);
});

app.post('/api/pracownicy', requireAuth, async (req, res) => {
    const nowyPracownik = new Pracownik(req.body);
    await nowyPracownik.save();
    res.json({ success: true, pracownik: nowyPracownik });
});

// --- API: ZLECENIA ---
app.get('/api/zlecenia', requireAuth, async (req, res) => {
    // Pobiera zlecenia sortując od najnowszych
    const zlecenia = await Zlecenie.find().sort({ createdAt: -1 });
    res.json(zlecenia);
});

app.post('/api/zlecenia', requireAuth, async (req, res) => {
    const noweZlecenie = new Zlecenie(req.body);
    await noweZlecenie.save();
    res.json({ success: true, zlecenie: noweZlecenie });
});

app.listen(PORT, () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});
