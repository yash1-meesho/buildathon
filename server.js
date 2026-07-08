const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const multer = require("multer");

const db = require("./lib/db");
const {
  SLOTS,
  slotToMinutes,
  minutesToSlotLabel,
  isRushSlot,
  isRushNow,
  currentSlotStart,
  nowMinutesIST,
  todayIST,
} = require("./lib/time");

const PORT = process.env.PORT || 3000;
const MAPS_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "meesho-room-booking-maps")
  : path.join(__dirname, "public", "maps");
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/maps", express.static(MAPS_DIR));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error("Only image uploads are allowed"));
    cb(null, true);
  },
});

const VALID_FLOORS = [3, 4, 5, 11];

// ---------- helpers ----------

function isValidSlot(s) {
  return SLOTS.includes(s);
}

function slotsAreContiguous(slots) {
  for (let i = 1; i < slots.length; i++) {
    if (slotToMinutes(slots[i]) - slotToMinutes(slots[i - 1]) !== 30) return false;
  }
  return true;
}

function bookingRangeLabel(booking) {
  const start = booking.slots[0];
  const endMin = slotToMinutes(booking.slots[booking.slots.length - 1]) + 30;
  return `${start}-${minutesToSlotLabel(endMin)}`;
}

function activeBookingsForRoom(state, roomId) {
  return state.bookings.filter((b) => b.roomId === roomId && b.status === "active");
}

function roomOccupancy(state, room) {
  const nowSlot = currentSlotStart();
  const active = activeBookingsForRoom(state, room.id);
  const current = active.find((b) => b.slots.includes(nowSlot));
  if (current) {
    return { status: "occupied", currentBooking: current };
  }
  return { status: "vacant", currentBooking: null };
}

function fitLabel(capacity, strength) {
  if (capacity <= strength + 2) return "perfect";
  if (capacity <= strength * 2) return "good";
  return "oversized";
}

function computeState() {
  const state = db.load();
  const rooms = state.rooms.map((r) => ({ ...r, ...roomOccupancy(state, r) }));
  return {
    date: state.date,
    rooms,
    bookings: state.bookings,
    maps: state.maps,
    mapVersion: state.mapVersion || {},
    slots: SLOTS,
    now: {
      minutes: nowMinutesIST(),
      slot: currentSlotStart(),
      isRush: isRushNow(),
    },
  };
}

// ---------- routes ----------

app.get("/api/state", (req, res) => {
  res.json(computeState());
});

app.post("/api/bookings", (req, res) => {
  const state = db.load();
  const { roomId, slots, strength, bookedBy } = req.body || {};

  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return res.status(404).json({ error: "Room not found" });

  const name = typeof bookedBy === "string" ? bookedBy.trim() : "";
  if (!name) return res.status(400).json({ error: "Booked By is required" });

  const str = Number(strength);
  if (!Number.isInteger(str) || str < 1) {
    return res.status(400).json({ error: "Strength must be a positive number" });
  }
  if (str > room.capacity) {
    return res.status(400).json({ error: `Strength exceeds ${room.name}'s capacity of ${room.capacity}` });
  }

  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: "Select at least one time slot" });
  }
  const sorted = [...slots].sort((a, b) => slotToMinutes(a) - slotToMinutes(b));
  if (!sorted.every(isValidSlot)) {
    return res.status(400).json({ error: "Invalid time slot selected" });
  }
  if (new Set(sorted).size !== sorted.length) {
    return res.status(400).json({ error: "Duplicate time slot selected" });
  }
  if (!slotsAreContiguous(sorted)) {
    return res.status(400).json({ error: "Selected slots must be contiguous, like picking a seat range" });
  }
  const nowSlotMin = slotToMinutes(currentSlotStart());
  if (slotToMinutes(sorted[0]) < nowSlotMin) {
    return res.status(400).json({ error: "Cannot book a time slot in the past" });
  }

  const conflicts = activeBookingsForRoom(state, roomId).filter((b) =>
    b.slots.some((s) => sorted.includes(s))
  );
  if (conflicts.length > 0) {
    const c = conflicts[0];
    return res.status(409).json({
      error: `Clashes with ${c.bookedBy}'s booking (${bookingRangeLabel(c)})`,
    });
  }

  const booking = {
    id: `bk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    roomId,
    date: state.date,
    slots: sorted,
    strength: str,
    bookedBy: name,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  state.bookings.push(booking);
  db.save(state);
  res.status(201).json({ booking, state: computeState() });
});

// Ends a booking early. Future bookings are cancelled outright; a booking that's
// currently in progress is truncated so the elapsed portion stays on record but
// the room frees up immediately.
app.post("/api/bookings/:id/leave-early", (req, res) => {
  const state = db.load();
  const booking = state.bookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status !== "active") return res.status(400).json({ error: "Booking is not active" });

  const nowMin = nowMinutesIST();
  const startMin = slotToMinutes(booking.slots[0]);

  if (nowMin < startMin) {
    booking.status = "cancelled";
  } else {
    const nowSlotMin = slotToMinutes(currentSlotStart());
    const remaining = booking.slots.filter((s) => slotToMinutes(s) < nowSlotMin);
    if (remaining.length === 0) {
      booking.status = "cancelled";
    } else {
      booking.slots = remaining;
      booking.status = "ended";
    }
    booking.endedAt = new Date().toISOString();
  }

  db.save(state);
  res.json({ booking, state: computeState() });
});

app.patch("/api/rooms/:id/layout", (req, res) => {
  const state = db.load();
  const room = state.rooms.find((r) => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: "Room not found" });

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v)));
  const { top, left, width, height } = req.body || {};
  if ([top, left, width, height].some((v) => v === undefined || Number.isNaN(Number(v)))) {
    return res.status(400).json({ error: "top, left, width, height are required numbers" });
  }

  room.width = clamp(width, 2, 60);
  room.height = clamp(height, 2, 60);
  room.left = clamp(left, 0, 100 - room.width);
  room.top = clamp(top, 0, 100 - room.height);

  db.save(state);
  res.json({ room });
});

app.post("/api/maps/:floor", upload.single("map"), (req, res) => {
  const floor = Number(req.params.floor);
  if (!VALID_FLOORS.includes(floor)) return res.status(400).json({ error: "Invalid floor" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const extByMime = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
  const ext = extByMime[req.file.mimetype] || "png";
  fs.mkdirSync(MAPS_DIR, { recursive: true });

  const state = db.load();
  // clean up any previous file for this floor with a different extension
  for (const oldExt of Object.values(extByMime)) {
    const p = path.join(MAPS_DIR, `floor${floor}.${oldExt}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const filename = `floor${floor}.${ext}`;
  fs.writeFileSync(path.join(MAPS_DIR, filename), req.file.buffer);

  state.maps[floor] = filename;
  state.mapVersion = state.mapVersion || {};
  state.mapVersion[floor] = Date.now();
  db.save(state);

  res.json({ maps: state.maps, mapVersion: state.mapVersion });
});

app.get("/api/suggest", (req, res) => {
  const state = db.load();
  const strength = Number(req.query.strength);
  if (!Number.isInteger(strength) || strength < 1) {
    return res.status(400).json({ error: "strength must be a positive integer" });
  }

  let slots = req.query.slots ? String(req.query.slots).split(",").filter(Boolean) : [currentSlotStart()];
  slots = [...new Set(slots)].sort((a, b) => slotToMinutes(a) - slotToMinutes(b));
  if (!slots.every(isValidSlot)) return res.status(400).json({ error: "Invalid slot in request" });
  if (!slotsAreContiguous(slots)) return res.status(400).json({ error: "Slots must be contiguous" });

  const rush = slots.some(isRushSlot);

  const candidates = state.rooms
    .filter((r) => r.capacity >= strength)
    .filter((r) => {
      const conflicts = activeBookingsForRoom(state, r.id).some((b) => b.slots.some((s) => slots.includes(s)));
      return !conflicts;
    })
    .map((r) => ({
      room: r,
      fit: fitLabel(r.capacity, strength),
    }))
    .sort((a, b) => a.room.capacity - b.room.capacity || a.room.floor - b.room.floor);

  res.json({ rush, slots, suggestions: candidates });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Meesho Room Booking running on http://localhost:${PORT} (date=${todayIST()})`);
  });
}

module.exports = app;
