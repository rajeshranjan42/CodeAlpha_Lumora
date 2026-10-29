const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const connectDB = require('./config/db');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy server/.env.example to server/.env and fill it in.');
  process.exit(1);
}

const app = express();

app.set('trust proxy', 1); // Render sits behind a proxy: needed for correct client IPs / rate limiting
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow images across origins
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // photos/videos (Cloudinary), songs (Jamendo) and in-browser decrypted chat media (blob:)
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'media-src': ["'self'", 'blob:', 'https:'],
        'connect-src': ["'self'", 'https://res.cloudinary.com', 'ws:', 'wss:'],
      },
    },
  })
);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// acceptRanges lets the browser seek and stream long videos instead of downloading them whole
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d', acceptRanges: true, immutable: true }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'Lumora by CodeAlpha' }));
app.use('/api', routes);

// Serve the built React app in production (npm run build, then npm start)
const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));
app.get(/^\/(?!api|uploads).*/, (req, res, next) => {
  res.sendFile(path.join(dist, 'index.html'), (err) => err && next());
});

app.use(notFound);
app.use(errorHandler);

const http = require('http');
const initSocket = require('./socket');
const { purgeExpired } = require('./controllers/storyController');
const { purgeOld } = require('./controllers/notificationController');
const server = http.createServer(app);
// big video uploads on slow connections must not be cut off (Node's default is 5 minutes per request)
server.requestTimeout = 0;
server.headersTimeout = 65 * 1000;
server.keepAliveTimeout = 61 * 1000; // longer than Render's proxy so connections aren't dropped mid-stream
app.set('io', initSocket(server, process.env.CLIENT_ORIGIN || 'http://localhost:5173'));

const PORT = process.env.PORT || 5000;
connectDB()
  .then(() =>
    server.listen(PORT, () => {
      console.log(`✦ Lumora API running on http://localhost:${PORT}`);
      purgeExpired(); // remove expired stories (and their files) now, then every 10 minutes
      setInterval(purgeExpired, 10 * 60 * 1000);
      purgeOld();
      setInterval(purgeOld, 24 * 60 * 60 * 1000);
    })
  )
  .catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
