const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildSeedRooms } = require("./rooms-seed");
const { todayIST } = require("./time");

const IS_VERCEL = Boolean(process.env.VERCEL);
const SEED_DB_PATH = path.join(__dirname, "..", "data", "db.json");
const DB_PATH = IS_VERCEL
  ? path.join(os.tmpdir(), "meesho-room-booking-db.json")
  : SEED_DB_PATH;

function seedDb() {
  if (!fs.existsSync(SEED_DB_PATH)) return null;
  return JSON.parse(fs.readFileSync(SEED_DB_PATH, "utf8"));
}

function freshDb() {
  const seed = seedDb();
  if (seed) {
    return {
      ...seed,
      date: todayIST(),
      bookings: [],
    };
  }
  return {
    date: todayIST(),
    rooms: buildSeedRooms(),
    bookings: [],
    maps: { 3: "floor3.png", 4: "floor4.png", 5: "floor5.png", 11: "floor11.png" },
  };
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    const db = freshDb();
    save(db);
    return db;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

  // Self-prune: bookings are per-day. If the stored date isn't today (IST),
  // archive nothing, just wipe today's slate clean.
  const today = todayIST();
  if (db.date !== today) {
    db.date = today;
    db.bookings = [];
    save(db);
  }
  return db;
}

function save(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

module.exports = { load, save, DB_PATH };
