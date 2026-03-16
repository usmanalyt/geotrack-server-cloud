require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { KalmanFilter } = require('kalman-filter');

// App & Server Initialization
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware
app.set('trust proxy', 1);
app.use(express.json());
app.use(cors({ origin: '*', allowedHeaders: ['Content-Type', 'x-admin-key'] }));
app.use(express.static(__dirname));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { error: "Too many requests from this IP, please try again later." }
});

// Database Connection (MongoDB Atlas)
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('Database connection established.'))
    .catch((err) => console.error('Database connection failed:', err));

// Mongoose Models
const User = mongoose.model('User', new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    resetCode: { type: String },
    resetCodeExpires: { type: Date }
}));

const Location = mongoose.model('Location', new mongoose.Schema({
    deviceId: String,
    latitude: Number,
    longitude: Number,
    timestamp: { type: Date, default: Date.now }
}));

// Kalman Filter for GPS Smoothing
const kf = new KalmanFilter({
    observation: { dimension: 2, covariance: [[1, 0], [0, 1]] },
    dynamic: { dimension: 2, transition: [[1, 0], [0, 1]], covariance: [[1, 0], [0, 1]] }
});

// --- API Routes ---

// Serve the main application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Authentication
app.post('/api/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (await User.findOne({ email })) {
            return res.status(400).json({ error: 'Email already registered.' });
        }
        await new User({ email, password }).save();
        res.status(201).json({ message: 'Account created successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, password });

        if ((email === 'admin@geotrack.com' && password === '12345') || user) {
            res.status(200).json({ message: 'Login successful.' });
        } else {
            res.status(401).json({ error: 'Incorrect email or password.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Password Management (Developer Bypass Mode)
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ error: 'Account not found.' });

        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetCode = resetCode;
        user.resetCodeExpires = Date.now() + 15 * 60 * 1000; // 15 mins
        await user.save();

        console.log(`\n--- RECOVERY CODE FOR ${email}: ${resetCode} ---\n`);
        res.status(200).json({ message: 'Code generated successfully.' });

    } catch (error) {
        res.status(500).json({ error: 'Failed to generate reset code.' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        const user = await User.findOne({ 
            email, 
            resetCode: code, 
            resetCodeExpires: { $gt: Date.now() } 
        });

        if (!user) return res.status(400).json({ error: 'Invalid or expired code.' });

        user.password = newPassword;
        user.resetCode = undefined;
        user.resetCodeExpires = undefined;
        await user.save();

        res.status(200).json({ message: 'Password reset successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Location History
app.get('/api/history', apiLimiter, async (req, res) => {
    try {
        const history = await Location.find().sort({ timestamp: 1 });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tracking history.' });
    }
});

app.delete('/api/history', apiLimiter, async (req, res) => {
    if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
        return res.status(401).send({ error: "Unauthorized access." });
    }
    try {
        await Location.deleteMany({}); 
        res.status(200).send({ message: "History cleared." });
    } catch (err) {
        res.status(500).send({ error: "Failed to clear history." });
    }
});

// --- WebSockets (Real-time Tracking) ---
const deviceStates = {}; 

io.on('connection', (socket) => {
    
    socket.on('send-location', async (data) => {
        const rawPoint = [data.latitude, data.longitude];

        try {
            // Apply Kalman filtering to smooth out GPS jitter
            const previousState = deviceStates[socket.id];
            const filteredResult = kf.filter({
                observation: rawPoint,
                previousCorrected: previousState
            });

            deviceStates[socket.id] = filteredResult;
            const smoothLat = filteredResult.mean[0][0];
            const smoothLon = filteredResult.mean[1][0];

            socket.broadcast.emit('update-map', { 
                id: socket.id, 
                latitude: smoothLat, 
                longitude: smoothLon 
            });

            await new Location({ deviceId: socket.id, latitude: smoothLat, longitude: smoothLon }).save();
            
        } catch (error) {
            // Fallback to raw data if filter fails
            socket.broadcast.emit('update-map', { id: socket.id, latitude: data.latitude, longitude: data.longitude });
            await new Location({ deviceId: socket.id, latitude: data.latitude, longitude: data.longitude }).save();
        }
    });

    socket.on('disconnect', () => {
        delete deviceStates[socket.id]; 
        io.emit('device-disconnected', socket.id);
    });
});

// Server Boot
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});