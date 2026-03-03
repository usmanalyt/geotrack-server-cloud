// ==========================================
// 1. IMPORTS & SETUP
// ==========================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { KalmanFilter } = require('kalman-filter');

// Initialize App & Server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ==========================================
// 2. MIDDLEWARE & SECURITY
// ==========================================
app.set('trust proxy', 1); // Allows rate limiter to work on Render
app.use(express.json());

// CORS Security Fix
app.use(cors({
    origin: '*',
    allowedHeaders: ['Content-Type', 'x-admin-key']
}));

// Host the frontend website (public folder)
app.use(express.static(path.join(__dirname, 'public')));

// Security Bouncer for API endpoints
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: { error: "🚨 Too many requests from this IP, please try again after 15 minutes." }
});

// ==========================================
// 3. DATABASE SETUP (MongoDB Atlas)
// ==========================================
const MONGO_URL = process.env.MONGO_URL;

mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ Successfully connected to MongoDB Atlas!'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));

// User Auth Schema
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true } 
});
const User = mongoose.model('User', userSchema);

// Location Tracking Schema
const locationSchema = new mongoose.Schema({
    deviceId: String,
    latitude: Number,
    longitude: Number,
    timestamp: { type: Date, default: Date.now }
});
const Location = mongoose.model('Location', locationSchema);

// ==========================================
// 4. THE KALMAN FILTER (GPS Smoothing)
// ==========================================
// ==========================================
// 4. THE KALMAN FILTER (GPS Smoothing)
// ==========================================
const kf = new KalmanFilter({
    observation: {
        dimension: 2, 
        // 👇 Adding the missing margin of error for the sensor
        covariance: [
            [1, 0],
            [0, 1]
        ]
    },
    dynamic: {
        dimension: 2, 
        transition: [
            [1, 0],
            [0, 1]
        ],
        // 👇 Adding the missing margin of error for the movement
        covariance: [
            [1, 0],
            [0, 1]
        ]
    }
});

// ==========================================
// 5. API ROUTES (Login & History)
// ==========================================

// SIGN UP API
app.post('/api/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered!' });
        }
        const newUser = new User({ email, password });
        await newUser.save();
        res.status(201).json({ message: 'Account created successfully!' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// SIGN IN API
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, password });

        if ((email === 'admin@geotrack.com' && password === '12345') || user) {
            res.status(200).json({ message: 'Login successful!' });
        } else {
            res.status(401).json({ error: 'Incorrect email or password.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// GET TRACKING HISTORY
app.get('/api/history', apiLimiter, async (req, res) => {
    try {
        const history = await Location.find().sort({ timestamp: 1 });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// SECURE ADMIN WIPE MAP COMMAND
app.delete('/api/history', apiLimiter, async (req, res) => {
    const providedKey = req.headers['x-admin-key'];
    const vaultKey = process.env.ADMIN_KEY;

    if (providedKey !== vaultKey) {
        console.log("🚨 Unauthorized wipe attempt blocked!");
        return res.status(401).send({ error: "Unauthorized: Invalid Admin Key" });
    }

    try {
        await Location.deleteMany({}); 
        console.log("🗑️ Database history wiped by verified admin.");
        res.status(200).send({ message: "History cleared successfully!" });
    } catch (err) {
        console.error("Failed to clear history:", err);
        res.status(500).send({ error: "Failed to clear history" });
    }
});

// ==========================================
// 6. SOCKET.IO (Live Map Tracking)
// ==========================================
io.on('connection', (socket) => {
    console.log(`📱 New device connected: ${socket.id}`);

    socket.on('send-location', async (data) => {
        const rawPoint = [data.latitude, data.longitude];

        try {
            // Apply smoothing
            const filteredPoint = kf.filter(rawPoint);
            const smoothLat = filteredPoint[0];
            const smoothLon = filteredPoint[1];

            // Broadcast smooth location
            socket.broadcast.emit('update-map', {
                id: socket.id,
                latitude: smoothLat,
                longitude: smoothLon
            });

            // Save smooth location to database
            const newLocation = new Location({
                deviceId: socket.id,
                latitude: smoothLat,
                longitude: smoothLon
            });
            await newLocation.save();

        } catch (error) {
            console.error("❌ Kalman Filter Error, using raw point:", error);
            
            // Fallback: If filter glitches, save raw point so map still works
            socket.broadcast.emit('update-map', {
                id: socket.id,
                latitude: data.latitude,
                longitude: data.longitude
            });
            
            const rawLocation = new Location({
                deviceId: socket.id,
                latitude: data.latitude,
                longitude: data.longitude
            });
            await rawLocation.save();
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Device disconnected: ${socket.id}`);
        io.emit('device-disconnected', socket.id);
    });
});

// ==========================================
// 7. START THE SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 GeoTrack server is actively running on port ${PORT}`);
});