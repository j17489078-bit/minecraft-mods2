const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "mods.json");
const HASH_FILE = path.join(ROOT, "config", "admin.hash");
const UPLOAD_DIR = path.join(ROOT, "public", "downloads");
const PUBLIC_DIR = path.join(ROOT, "public");

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.mkdirSync(path.dirname(HASH_FILE), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

/* ---------- tiny JSON "database" ---------- */

function readMods() {
  try {
    const list = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}
function writeMods(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}
function slugify(name) {
  return (
    String(name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "mod"
  );
}
function uniqueSlug(base, list) {
  let slug = base;
  let n = 2;
  while (list.some((m) => m.id === slug)) {
    slug = base + "-" + n;
    n++;
  }
  return slug;
}
function splitList(v) {
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ---------- admin password ---------- */

if (!fs.existsSync(HASH_FILE)) {
  console.warn("\n[minecraft-mods-site] No admin password is set yet.");
  console.warn('Run: npm run set-password -- "a password at least 8 characters"\n');
}
function checkPassword(pw) {
  if (!fs.existsSync(HASH_FILE)) return false;
  if (!pw || typeof pw !== "string") return false;
  const hash = fs.readFileSync(HASH_FILE, "utf8").trim();
  try {
    return bcrypt.compareSync(pw, hash);
  } catch (e) {
    return false;
  }
}

/* ---------- app ---------- */

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
app.use(
  session({
    secret: SESSION_SECRET,
    name: "mms.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 60 * 60 * 1000
    }
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: "Sign in first." });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Wait a while and try again." }
});

app.get("/api/session", (req, res) => {
  res.json({ authed: !!(req.session && req.session.authed) });
});

app.post("/api/login", loginLimiter, (req, res) => {
  const password = req.body && req.body.password;
  if (!checkPassword(password)) {
    return res.status(401).json({ error: "Wrong password." });
  }
  req.session.authed = true;
  res.json({ authed: true });
});

app.post("/api/logout", (req, res) => {
  if (!req.session) return res.json({ authed: false });
  req.session.destroy(() => res.json({ authed: false }));
});

app.get("/api/mods", (req, res) => {
  res.json(readMods());
});

/* jar uploads: only ever reached through requireAuth below */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const base = slugify(path.basename(file.originalname, path.extname(file.originalname)));
    cb(null, base + "-" + Date.now() + ".jar");
  }
});
function fileFilter(req, file, cb) {
  if (path.extname(file.originalname).toLowerCase() !== ".jar") {
    return cb(new Error("Only .jar files are accepted."));
  }
  cb(null, true);
}
const upload = multer({ storage, fileFilter, limits: { fileSize: 200 * 1024 * 1024 } });

app.post("/api/mods", requireAuth, (req, res) => {
  upload.single("jar")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed." });
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "A mod name is required." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Attach a .jar file." });
    }

    const list = readMods();
    const mod = {
      id: uniqueSlug(slugify(b.name), list),
      name: String(b.name).trim().slice(0, 60),
      cat: String(b.cat || "").trim().slice(0, 24),
      version: String(b.version || "").trim().slice(0, 20),
      file: req.file.filename,
      desc: String(b.desc || "").trim().slice(0, 300),
      loaders: splitList(b.loaders).slice(0, 5),
      mc: splitList(b.mc).slice(0, 5),
      tags: splitList(b.tags).slice(0, 4),
      downloads: 0,
      added: new Date().toISOString().slice(0, 10),
      featured: b.featured === "on" || b.featured === "true" || b.featured === true
    };
    list.unshift(mod);
    writeMods(list);
    res.status(201).json(mod);
  });
});

app.put("/api/mods/:id", requireAuth, (req, res) => {
  const list = readMods();
  const mod = list.find((m) => m.id === req.params.id);
  if (!mod) return res.status(404).json({ error: "Mod not found." });
  const b = req.body || {};
  if (typeof b.name === "string" && b.name.trim()) mod.name = b.name.trim().slice(0, 60);
  if (typeof b.cat === "string") mod.cat = b.cat.trim().slice(0, 24);
  if (typeof b.version === "string") mod.version = b.version.trim().slice(0, 20);
  if (typeof b.desc === "string") mod.desc = b.desc.trim().slice(0, 300);
  if (typeof b.loaders === "string") mod.loaders = splitList(b.loaders).slice(0, 5);
  if (typeof b.mc === "string") mod.mc = splitList(b.mc).slice(0, 5);
  if (typeof b.tags === "string") mod.tags = splitList(b.tags).slice(0, 4);
  if (typeof b.featured === "boolean") mod.featured = b.featured;
  writeMods(list);
  res.json(mod);
});

app.delete("/api/mods/:id", requireAuth, (req, res) => {
  const list = readMods();
  const idx = list.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Mod not found." });
  const [removed] = list.splice(idx, 1);
  writeMods(list);
  if (removed.file) fs.unlink(path.join(UPLOAD_DIR, removed.file), () => {});
  res.json({ ok: true });
});

/* public: bump a download counter (no auth needed to download) */
app.post("/api/mods/:id/download", (req, res) => {
  const list = readMods();
  const mod = list.find((m) => m.id === req.params.id);
  if (!mod) return res.status(404).json({ error: "Mod not found." });
  mod.downloads = (mod.downloads || 0) + 1;
  writeMods(list);
  res.json({ downloads: mod.downloads });
});

app.use("/downloads", express.static(UPLOAD_DIR, { index: false, dotfiles: "deny" }));
app.use(express.static(PUBLIC_DIR, { index: "index.html" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Minecraft Mods site running at http://localhost:${PORT}`);
});
