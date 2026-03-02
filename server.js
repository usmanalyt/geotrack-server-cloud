const express = require('express');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
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

// =========================================================
// 🌟 NEW: Send the location history to the web dashboard
// =========================================================
app.get('/api/history', async (req, res) => {
    try {
        // Fetch past locations, sorted from oldest to newest
        const history = await Location.find().sort({ timestamp: 1 });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// 🌟 NEW: The Admin command to wipe the database
app.delete('/api/history', async (req, res) => {
    try {
        await Location.deleteMany({}); // This deletes everything in the collection!
        console.log("🗑️ Database history wiped by admin.");
        res.status(200).send({ message: "History cleared successfully!" });
    } catch (err) {
        console.error("Failed to clear history:", err);
        res.status(500).send({ error: "Failed to clear history" });
    }
});

io.on('connection', (socket) => {
    console.log(`📱 New device connected: ${socket.id}`);

    socket.on('send-location', async (data) => {
        // Instantly tell the dashboard to move the pin
        socket.broadcast.emit('update-map', {
            id: socket.id,
            latitude: data.latitude,
            longitude: data.longitude
        });

        // Permanently save it to the cloud
        try {
            const newLocation = new Location({
                deviceId: socket.id,
                latitude: data.latitude,
                longitude: data.longitude
            });
            await newLocation.save();
        } catch (error) {
            console.error("❌ Error saving to database:", error);
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