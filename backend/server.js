const express = require("express");
const cors = require("cors");
const http = require("http");
const redisConfig = require('./config/redis');
const { encode, decode } = require('@msgpack/msgpack');

require("dotenv").config();

const connectDB = require("./config/db");
const vehicleRoutes = require("./routes/vehicleRoutes");
const authRoutes = require("./routes/authRoutes");
const driverRoutes = require("./routes/driverRoutes");
const tripRoutes = require("./routes/tripRoutes");
const alertRoutes = require("./routes/alertRoutes");
const aiRoutes = require("./routes/aiRoutes");
const enterpriseRoutes = require("./routes/enterpriseRoutes");
const auditRoutes = require("./routes/auditRoutes");
const User = require("./models/User");

const { Server } = require("socket.io");

const app = express();

// Secure CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:5173'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

connectDB();

app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/enterprise", enterpriseRoutes);
app.use("/api/audit", auditRoutes);

app.get("/", (req, res) => {
    res.send("FleetDash Backend Running");
});

// Health Check Endpoint (Render / Deployment monitoring)
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        message: "FleetDash Backend Running",
        service: "FleetDash API",
        timestamp: new Date().toISOString()
    });
});


const server = http.createServer(app);

const socketOrigin = process.env.SOCKET_ORIGIN || 'http://localhost:5173';
const io = new Server(server, { cors: { origin: socketOrigin, credentials: true } });

const createDemoUser = async () => {
  // Only create demo user in development mode
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const demoUser = new User({
        email: 'manager@fleetdash.com',
        password: 'password123',
        role: 'Manager'
      });
      await demoUser.save();
      console.log('✅ Demo user created: manager@fleetdash.com / [REDACTED]');
    }
  } catch (error) {
    console.error('Error creating demo user:', error.message);
  }
};

const startServer = async () => {
    // Check Redis status after a short delay
    setTimeout(() => {
        if (redisConfig.isRedisConnected()) {
            console.log('✅ Redis Connected');
            setupRedisListener();
        } else {
            console.log('⚠️  Redis disabled - running without cache');
        }
    }, 100);

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`Server running on ${PORT}`);
    });

    // Create demo user after DB is connected (development only)
    setTimeout(() => {
        createDemoUser();
    }, 1000);
};

const setupRedisListener = () => {
    try {
        const subscriber = redisConfig.redis.duplicate();
        
        subscriber.subscribe('vehicle:updates', (err, count) => {
            if (err) console.error('Subscribe error:', err);
            else console.log(`Subscribed to ${count} channel(s)`);
        });

        subscriber.on('message', (channel, message) => {
            if (channel === 'vehicle:updates') {
                try {
                    const data = JSON.parse(message);
                    const binaryData = encode(data);
                    io.emit('vehicleUpdateBinary', binaryData);
                } catch (err) {
                    console.error('Error processing Redis message:', err);
                }
            }
        });
    } catch (err) {
        console.error('Failed to setup Redis listener:', err.message);
    }
};

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => console.log('Client disconnected'));
});

startServer();
