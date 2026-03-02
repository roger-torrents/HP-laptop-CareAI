import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("hp_care.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    model TEXT NOT NULL,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    results TEXT NOT NULL,
    summary TEXT NOT NULL,
    overall_health TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS warranties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    model TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth Routes
  app.post("/api/auth/signup", (req, res) => {
    const { email, password, name } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO users (email, password, name) VALUES (?, ?, ?)");
      const result = stmt.run(email, password, name);
      res.json({ id: result.lastInsertRowid, email, name });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password) as any;
    if (user) {
      res.json({ id: user.id, email: user.email, name: user.name });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Inspection Routes
  app.post("/api/inspections", (req, res) => {
    const { user_id, model, results, summary, overall_health } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO inspections (user_id, model, results, summary, overall_health) VALUES (?, ?, ?, ?, ?)");
      const result = stmt.run(user_id, model, JSON.stringify(results), summary, overall_health);
      res.json({ id: result.lastInsertRowid });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/inspections/:userId", (req, res) => {
    const { userId } = req.params;
    const inspections = db.prepare("SELECT * FROM inspections WHERE user_id = ? ORDER BY date DESC").all(userId);
    res.json(inspections.map((i: any) => ({ ...i, results: JSON.parse(i.results) })));
  });

  // Warranty Routes
  app.post("/api/warranties", (req, res) => {
    const { user_id, model, serial_number, expiry_date } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO warranties (user_id, model, serial_number, expiry_date) VALUES (?, ?, ?, ?)");
      const result = stmt.run(user_id, model, serial_number, expiry_date);
      res.json({ id: result.lastInsertRowid });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/warranties/:userId", (req, res) => {
    const { userId } = req.params;
    const warranties = db.prepare("SELECT * FROM warranties WHERE user_id = ?").all(userId);
    res.json(warranties);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
