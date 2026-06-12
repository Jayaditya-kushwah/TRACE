import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import routes from './routes';
import { initDb } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure uploads and temp directory exist
const uploadsDir = path.join(__dirname, '../../uploads');
const tempDir = path.join(__dirname, '../temp');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static evidence files (secure access can be controlled, but for MVP we expose files)
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api', routes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Boot server and initialize database
app.listen(PORT, async () => {
  console.log(`TRACE Backend Server running on http://localhost:${PORT}`);
  try {
    await initDb();
  } catch (error) {
    console.error('Failed to initialize database during startup:', error);
  }
});
