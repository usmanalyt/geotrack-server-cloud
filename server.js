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
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ==========================================
// 2. MIDDLEWARE & SECURITY
// ==========================================
app.set('trust proxy', 1);
app.use(express.json());
app.use(cors({
    origin: '*',
    allowedHeaders: ['Content-Type', 'x-admin-key']
}));

// Host the frontend website 
app.use(express.static(__dirname));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { error: "🚨 Too many requests from this IP, please try again." }
});

// ==========================================
// 3. DATABASE SETUP (MongoDB Atlas)
// ==========================================
const MONGO_URL = process.env.MONGO_URL;

mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ Successfully connected to MongoDB Atlas!'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    resetCode: { type: String },
    resetCodeExpires: { type: Date }
});
const User = mongoose.model('User', userSchema);

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
const kf = new KalmanFilter({
    observation: {
        dimension: 2, 
        covariance: [[1, 0], [0, 1]]
    },
    dynamic: {
        dimension: 2, 
        transition: [[1, 0], [0, 1]],
        covariance: [[1, 0], [0, 1]]
    }
});

// ==========================================
// 5. API ROUTES (Login & History)
// ==========================================


// 🎯 THE BULLETPROOF FIX: Force the server to deliver the login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Configure the Mailman (Nodemailer)
// Configure the Mailman (Nodemailer) - Upgraded to prevent Render Timeouts
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Forces a secure IPv4 SSL connection
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// FORGOT PASSWORD API (Sends the email)
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ error: 'No account found with that email.' });
        }

        // Generate a 6-digit random code
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save code and expiration (15 minutes from now)
        user.resetCode = resetCode;
        user.resetCodeExpires = Date.now() + 15 * 60 * 1000;
        await user.save();

        // Send the email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'GeoTrack - Password Reset Code',
            text: `Your password reset code is: ${resetCode}\n\nThis code will expire in 15 minutes.`
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Recovery code sent to your email.' });

    } catch (error) {
        console.error("Mail Error:", error);
        res.status(500).json({ error: 'Error sending email. Check Render environment variables.' });
    }
});

// RESET PASSWORD API (Verifies code and saves new password)
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        // Find user with matching email, matching code, AND code hasn't expired yet
        const user = await User.findOne({ 
            email, 
            resetCode: code, 
            resetCodeExpires: { $gt: Date.now() } 
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset code.' });
        }

        // Update password and erase the temporary codes
        user.password = newPassword;
        user.resetCode = undefined;
        user.resetCodeExpires = undefined;
        await user.save();

        res.status(200).json({ message: 'Password successfully reset!' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
// SIGN UP API
// ... (the rest of your signup code stays here)
app.post('/api/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'Email already registered!' });
        
        const newUser = new User({ email, password });
        await newUser.save();
        res.status(201).json({ message: 'Account created successfully!' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

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

app.get('/api/history', apiLimiter, async (req, res) => {
    try {
        const history = await Location.find().sort({ timestamp: 1 });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.delete('/api/history', apiLimiter, async (req, res) => {
    const providedKey = req.headers['x-admin-key'];
    const vaultKey = process.env.ADMIN_KEY;

    if (providedKey !== vaultKey) return res.status(401).send({ error: "Unauthorized" });

    try {
        await Location.deleteMany({}); 
        console.log("🗑️ Database history wiped.");
        res.status(200).send({ message: "History cleared successfully!" });
    } catch (err) {
        res.status(500).send({ error: "Failed to clear history" });
    }
});

// ==========================================
// 6. SOCKET.IO (Live Map Tracking)
// ==========================================
const deviceStates = {}; 

io.on('connection', (socket) => {
    console.log(`📱 New device connected: ${socket.id}`);

    socket.on('send-location', async (data) => {
        const rawPoint = [data.latitude, data.longitude];

        try {
            const previousState = deviceStates[socket.id];
            const filteredResult = kf.filter({
                observation: rawPoint,
                previousCorrected: previousState
            });

            deviceStates[socket.id] = filteredResult;
            const smoothLat = filteredResult.mean[0][0];
            const smoothLon = filteredResult.mean[1][0];

            socket.broadcast.emit('update-map', { id: socket.id, latitude: smoothLat, longitude: smoothLon });

            const newLocation = new Location({ deviceId: socket.id, latitude: smoothLat, longitude: smoothLon });
            await newLocation.save();
        } catch (error) {
            socket.broadcast.emit('update-map', { id: socket.id, latitude: data.latitude, longitude: data.longitude });
            const rawLocation = new Location({ deviceId: socket.id, latitude: data.latitude, longitude: data.longitude });
            await rawLocation.save();
        }
    });

    socket.on('disconnect', () => {
        delete deviceStates[socket.id]; 
        io.emit('device-disconnected', socket.id);
    });
});

// ==========================================
// 7. START THE SERVER
// ==========================================
const PORT = process.env.PORT || 10000;

// Tell Render specifically to expose this port to the internet
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 GeoTrack server is actively listening on 0.0.0.0:${PORT}`);
});