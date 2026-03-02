# 🌍 GeoTrack - Real-Time IoT Geolocation App

GeoTrack is a full-stack, real-time location tracking architecture. It bridges mobile GPS hardware with a cloud-hosted backend, allowing for live device monitoring, historical route mapping, and perimeter security via a web dashboard.

## 🚀 Core Features
* **Real-Time WebSockets:** GPS coordinates are beamed from the mobile client to the server and instantly pushed to the web dashboard using `Socket.io` without page refreshes.
* **Multi-Device Fleet Tracking:** Dynamically assigns unique session IDs, color-coded map pins, and separate route histories for multiple active devices.
* **Geofencing Security:** Automatically generates a 50-meter Safe Zone perimeter around a device's starting location and triggers a red UI alert if the boundary is breached.
* **Historical Data Storage:** Persistently saves all coordinates with timestamps to a MongoDB database, allowing the map to redraw past routes.
* **Admin Controls:** Includes a secure command to wipe the database and reset the map.

## 🛠️ Tech Stack
* **Mobile Client:** React Native, Expo, Expo-Location
* **Backend Server:** Node.js, Express, Socket.io (Hosted on Render)
* **Database:** MongoDB Atlas (Mongoose)
* **Web Dashboard:** HTML/CSS/JS, Leaflet.js Maps, OpenStreetMap API

## 💡 How It Works
1. The React Native mobile app accesses the physical device's GPS chip.
2. Coordinates are transmitted via HTTP POST to the Render cloud server.
3. The server saves the payload to MongoDB and emits a WebSocket broadcast.
4. The web dashboard catches the broadcast and instantly updates the Leaflet map UI.
