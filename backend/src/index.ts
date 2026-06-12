import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import apiRouter from "./routes/api.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(FRONTEND_DIST));

// Routes
app.use("/api", apiRouter);

// Health Check
app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "TRACE backend running",
  });
});

// Fallback to React index.html for UI routes
app.get(/^\/(?!api|health).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal Server Error",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving frontend from: ${FRONTEND_DIST}`);
});

