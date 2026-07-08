const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Shift epoch by IST offset, then read back with UTC getters to get IST wall-clock
// fields regardless of the host/container's own timezone.
function istParts(date = new Date()) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

function todayIST() {
  const p = istParts();
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function nowMinutesIST() {
  // Optional override for testing/demoing without waiting for the real clock
  // to land inside the 09:00-19:00 window (e.g. MOCK_NOW_MIN=930 for 15:30).
  if (process.env.MOCK_NOW_MIN !== undefined) return Number(process.env.MOCK_NOW_MIN);
  const p = istParts();
  return p.hours * 60 + p.minutes;
}

const DAY_START_MIN = 9 * 60; // 09:00
const DAY_END_MIN = 19 * 60; // 19:00
const SLOT_LEN = 30;
const RUSH_START_MIN = 15 * 60; // 15:00
const RUSH_END_MIN = 18 * 60; // 18:00

const SLOTS = [];
for (let m = DAY_START_MIN; m < DAY_END_MIN; m += SLOT_LEN) {
  const h = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  SLOTS.push(`${h}:${mm}`);
}

function slotToMinutes(slot) {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
}

function minutesToSlotLabel(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function isRushSlot(slot) {
  const m = slotToMinutes(slot);
  return m >= RUSH_START_MIN && m < RUSH_END_MIN;
}

function isRushNow() {
  const m = nowMinutesIST();
  return m >= RUSH_START_MIN && m < RUSH_END_MIN;
}

function currentSlotStart() {
  const m = nowMinutesIST();
  const flo = Math.floor((m - DAY_START_MIN) / SLOT_LEN) * SLOT_LEN + DAY_START_MIN;
  return minutesToSlotLabel(Math.max(flo, DAY_START_MIN));
}

module.exports = {
  todayIST,
  nowMinutesIST,
  SLOTS,
  SLOT_LEN,
  DAY_START_MIN,
  DAY_END_MIN,
  slotToMinutes,
  minutesToSlotLabel,
  isRushSlot,
  isRushNow,
  currentSlotStart,
};
