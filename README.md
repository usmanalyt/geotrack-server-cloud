# C-Track 📍 | Real-Time GPS Tracking Platform

C-Track is a full-stack, real-time GPS tracking application. It features a responsive, glassmorphism-inspired dashboard that receives live location data from connected mobile devices, plotting them instantly on an interactive map.

<img width="1366" height="768" alt="darshboard2" src="https://github.com/user-attachments/assets/15f5cbac-110e-4fc5-bd6f-38012b48bc2c" />



![n](https://github.com/user-attachments/assets/67748851-24de-4f72-8396-cc0818489f04)




## ✨ Key Features

* **Real-Time WebSockets:** Sub-second latency tracking using `Socket.io`, ensuring the map updates the exact moment the device moves.
* **Interactive Mapping:** Powered by `Leaflet.js` with integrated Google Maps layers (Streets, Satellite) and a sleek Dark Mode.
* **Live Distance & Telemetry:** Calculates the real-time distance between the admin dashboard and the tracking device, alongside speed and accuracy metrics.
* **Reverse Geocoding:** Automatically translates raw GPS coordinates into human-readable street and neighborhood names using the OpenStreetMap API.
* **GPS Smoothing:** Implements a backend **Kalman Filter** to smooth out GPS jitter and prevent erratic pin jumping.
* **Secure Authentication:** Full login/signup system with encrypted sessions and database-driven password resets.
* **Responsive Glassmorphism UI:** Built completely with Tailwind CSS, ensuring the dashboard looks like a native app on both mobile phones and desktop monitors.

## 🛠️ Tech Stack

**Frontend:**
* HTML5 / CSS3 / JavaScript
* Tailwind CSS (Styling & Responsive Design)
* Leaflet.js (Map Rendering)
* Socket.io-client (Real-time connection)

**Backend:**
* Node.js & Express.js
* Socket.io (WebSocket Server)
* MongoDB Atlas & Mongoose (Database)
* Kalman-Filter (Data processing)





   📡 How it Works

    The Emitter (tracker.html): Uses the HTML5 Geolocation API to request the device's high-accuracy coordinates. It beams this data to the server via WebSockets.

    The Server (server.js): Receives the raw coordinates, passes them through a Kalman filter for mathematical smoothing, saves the snapshot to MongoDB, and broadcasts the clean coordinates to all connected dashboards.

    The Dashboard (dashboard.html): Receives the broadcast, updates the custom Google Maps SVG pin, pans the camera, and triggers a reverse-geocode fetch to display the current street name.
