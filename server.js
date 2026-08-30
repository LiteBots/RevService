const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// Zmienne z Railway
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/revmi';

// Middleware
app.use(express.json());

// ==========================================
// POŁĄCZENIE Z MONGODB
// ==========================================
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Połączono z MongoDB!'))
    .catch(err => console.error('Błąd połączenia z MongoDB:', err));

// ==========================================
// SCHEMATY BAZY DANYCH
// ==========================================
const TaskSchema = new mongoose.Schema({
    name: String,
    price: Number,
    address: String,
    people: Number,
    worker: String,
    car: String,
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', TaskSchema);

const ExpenseSchema = new mongoose.Schema({
    price: Number,
    category: String,
    desc: String,
    createdAt: { type: Date, default: Date.now }
});
const Expense = mongoose.model('Expense', ExpenseSchema);

const EmployeeSchema = new mongoose.Schema({
    name: String,
    role: String,
    pin: String // 4-cyfrowy PIN pracownika
});
const Employee = mongoose.model('Employee', EmployeeSchema);

const FleetSchema = new mongoose.Schema({
    name: String,
    plates: String
});
const Fleet = mongoose.model('Fleet', FleetSchema);


// ==========================================
// API - LOGOWANIE
// ==========================================
app.post('/api/login', async (req, res) => {
    const { pin } = req.body;
    
    // 1. Sprawdzenie czy to główny Admin
    if (pin === ADMIN_PIN) {
        return res.json({ success: true, role: 'admin', name: 'Gracjan Błachnio (Admin)' });
    }
    
    // 2. Sprawdzenie czy to pracownik w bazie
    try {
        const employee = await Employee.findOne({ pin: pin });
        if (employee) {
            return res.json({ success: true, role: 'worker', name: employee.name });
        }
        // Błędny PIN
        res.status(401).json({ success: false, message: 'Nieprawidłowy PIN' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Błąd bazy danych' });
    }
});


// ==========================================
// API - POBIERANIE WSZYSTKICH DANYCH
// ==========================================
app.get('/api/data', async (req, res) => {
    try {
        const tasks = await Task.find().sort({ createdAt: -1 });
        const expenses = await Expense.find().sort({ createdAt: -1 });
        const employees = await Employee.find();
        const fleet = await Fleet.find();
        res.json({ tasks, expenses, employees, fleet });
    } catch (err) {
        res.status(500).json({ error: 'Błąd pobierania danych' });
    }
});


// ==========================================
// API - DODAWANIE DO BAZY
// ==========================================
app.post('/api/tasks', async (req, res) => {
    const task = new Task(req.body);
    await task.save();
    res.json({ success: true, task });
});

app.post('/api/tasks/:id/complete', async (req, res) => {
    await Task.findByIdAndUpdate(req.params.id, { completed: true });
    res.json({ success: true });
});

app.post('/api/expenses', async (req, res) => {
    const expense = new Expense(req.body);
    await expense.save();
    res.json({ success: true, expense });
});

app.post('/api/employees', async (req, res) => {
    const emp = new Employee(req.body);
    await emp.save();
    res.json({ success: true, emp });
});

app.post('/api/fleet', async (req, res) => {
    const fleet = new Fleet(req.body);
    await fleet.save();
    res.json({ success: true, fleet });
});


// ==========================================
// SERWOWANIE PLIKÓW HTML I ŚCIEŻKI
// ==========================================
app.use(express.static(path.join(__dirname, 'Public'), { extensions: ['html'] }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'Public', 'index.html')));
app.get('/revmi', (req, res) => res.sendFile(path.join(__dirname, 'Public', 'revmi.html')));
app.get('/przeprowadzki', (req, res) => res.sendFile(path.join(__dirname, 'Public', 'przeprowadzki.html')));
app.get('/przewozy-osob', (req, res) => res.sendFile(path.join(__dirname, 'Public', 'przewozy-osob.html')));
app.get('/oproznianie-utylizacja', (req, res) => res.sendFile(path.join(__dirname, 'Public', 'oproznianie-utylizacja.html')));
app.get('/transport', (req, res) => res.sendFile(path.join(__dirname, 'Public', 'transport.html')));
app.get('/polityka-prywatności', (req, res) => res.sendFile(path.join(__dirname, 'Public', 'polityka-prywatności.html')));
app.get('/polityka-prywatnosci', (req, res) => res.sendFile(path.join(__dirname, 'Public', 'polityka-prywatności.html')));

app.listen(PORT, () => {
    console.log(`Serwer działa poprawnie na porcie ${PORT}`);
});
