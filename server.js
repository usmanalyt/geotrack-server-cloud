const express = require('express');
const cors = require('cors'); // 👈 ADD THIS LINE
require('dotenv').config();
// 🌟 NEW: The Kalman GPS Filter (Digital Shock Absorber)
const KalmanFilter = require('kalman-filter').KalmanFilter;

// Simple configuration for pedestrian-level movement in 2D (lat/lon)
const kf = new KalmanFilter({
    observation: {
        sensor: {
            // We are tracking in standard 2D Cartesian space (Latitude and Longitude)
            matrix: [
                [1, 0],
                [0, 1]
            ]
        }
    }
});
const rateLimit = require('express-rate-limit');

// 🌟 NEW: The Security Bouncer
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: "🚨 Too many requests from this IP, please try again after 15 minutes." }
});

const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
app.set('trust proxy', 1); // 👈 ADD THIS LINE so the rate limiter works on Render
app.use(express.json());
// 🌟 NEW: The CORS Security Fix to allow the Admin Password
app.use(cors({
    origin: '*',
    allowedHeaders: ['Content-Type', 'x-admin-key']
}));
const server = http.createServer(app);

// Your working Atlas database connection
const MONGO_URL = process.env.MONGO_URL;

mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ Successfully connected to MongoDB Atlas!'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));

const locationSchema = new mongoose.Schema({
    deviceId: String,
    latitude: Number,
    longitude: Number,
    timestamp: { type: Date, default: Date.now }
});
const Location = mongoose.model('Location', locationSchema);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static('public'));


// 🌟 NEW: Send the location history to the web dashboard

app.get('/api/history', apiLimiter, async (req, res) => {
    try {
        // Fetch past locations, sorted from oldest to newest
        const history = await Location.find().sort({ timestamp: 1 });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// 🌟 NEW: The Admin command to wipe the database
// 🌟 NEW: Secure Admin command to wipe the database
// 🌟 NEW: Secure Admin command with Debugging
app.delete('/api/history', apiLimiter, async (req, res) => {
    const providedKey = req.headers['x-admin-key'];
    const vaultKey = process.env.ADMIN_KEY;

    // 🕵️ THE SPY: Print exactly what both passwords are!
    console.log(`🧐 DEBUG - Password typed in browser: '${providedKey}'`);
    console.log(`🧐 DEBUG - Password saved in Render: '${vaultKey}'`);

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

io.on('connection', (socket) => {
    console.log(`📱 New device connected: ${socket.id}`);

   // 🌟 NEW: Upgraded connection logic with smoothing
    socket.on('send-location', async (data) => {
        // 1. Pack the raw GPS data
        const rawPoint = [data.latitude, data.longitude];

        try {
            // 2. RUN THE SMOOTHING TRAP! 
            // The filter uses its history to produce a filtered point
            const filteredPoint = kf.filter(rawPoint);

            // Break it back down into lat/lon
            const smoothLat = filteredPoint[0];
            const smoothLon = filteredPoint[1];

            // 3. (Optional Debug) See the smoothing difference in your Render logs
            console.log(`🧐 Raw: ${data.latitude.toFixed(6)},${data.longitude.toFixed(6)} -> Smoothed: ${smoothLat.toFixed(6)},${smoothLon.toFixed(6)}`);

            // 4. Broadcast the SMOOTHED location to the dashboard
            socket.broadcast.emit('update-map', {
                id: socket.id,
                latitude: smoothLat,
                longitude: smoothLon
            });

            // 5. Permanently save the SMOOTHED location to the cloud database
            const newLocation = new Location({
                deviceId: socket.id,
                latitude: smoothLat,
                longitude: smoothLon
            });
            await newLocation.save();

        } catch (error) {
            console.error("❌ Kalman Filter Error:", error);
            // Fallback: If the filter fails, just save the raw point so we don't lose data
            // (Keep your old backup socket.broadcast.emit and newLocation.save() logic here as a fallback)
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Device disconnected: ${socket.id}`);
        io.emit('device-disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 GeoTrack server is actively running on port ${PORT}`);
});