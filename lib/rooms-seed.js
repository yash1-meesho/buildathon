// Seed room list, built from the labels visible on the real floor-plan maps
// (public/maps/floor{3,4,5,11}.png). Codes follow the office's own F0<floor>-<TYPE>-<n>
// convention where it was legible on the map; positions are placed as a staging strip
// on the left edge (top/left/width/height in %) — open "Edit layout" in the app once
// to drag each box onto the real room it represents, then it's saved for good.

function stagingGrid(rooms) {
  const startTop = 3;
  const rowHeight = 7.5;
  const gap = 1.2;
  return rooms.map((r, i) => ({
    ...r,
    top: startTop + i * (rowHeight + gap),
    left: 0.8,
    width: 9,
    height: rowHeight,
  }));
}

const FLOOR_3 = stagingGrid([
  { code: "F03-BR-01", name: "Board Room", capacity: 14 },
  { code: "F03-TR-01", name: "Training Room", capacity: 20 },
  { code: "F03-HUB-01", name: "Hub Room", capacity: 6 },
  { code: "F03-6PAX-01", name: "6 Pax Room", capacity: 6 },
  { code: "F03-4PAX-01", name: "4 Pax Room", capacity: 4 },
  { code: "F03-OM-03", name: "Open Meeting Room 03", capacity: 8 },
  { code: "F03-10PAX-01", name: "10 Pax Room", capacity: 10 },
]);

const FLOOR_4 = stagingGrid([
  { code: "F04-WR-01", name: "War Room", capacity: 10 },
  { code: "F04-HUB-01", name: "Hub Room", capacity: 6 },
  { code: "F04-14PAX-01", name: "14 Pax Room", capacity: 14 },
  { code: "F04-4PAX-01", name: "4 Pax Room A", capacity: 4 },
  { code: "F04-4PAX-02", name: "4 Pax Room B", capacity: 4 },
  { code: "F04-2PAX-01", name: "2 Pax Room", capacity: 2 },
  { code: "F04-OM-01", name: "Open Meeting Type 01", capacity: 6 },
  { code: "F04-OM-02", name: "Open Meeting Type 02", capacity: 8 },
  { code: "F04-IM-01", name: "Informal Meeting Room", capacity: 6 },
]);

const FLOOR_5 = stagingGrid([
  { code: "F05-6PAX-01", name: "6 Pax Room A", capacity: 6 },
  { code: "F05-6PAX-02", name: "6 Pax Room B", capacity: 6 },
  { code: "F05-3PAX-01", name: "3 Pax Room A", capacity: 3 },
  { code: "F05-3PAX-02", name: "3 Pax Room B", capacity: 3 },
  { code: "F05-10PAX-01", name: "10 Pax Room", capacity: 10 },
  { code: "F05-HUB-01", name: "Hub Room A", capacity: 6 },
  { code: "F05-HUB-02", name: "Hub Room B", capacity: 6 },
  { code: "F05-OM-01", name: "Open Meeting Type 02 (A)", capacity: 8 },
  { code: "F05-OM-04", name: "Open Meeting Type 02 (B)", capacity: 8 },
  { code: "F05-MPAX-01", name: "M-Pax Room", capacity: 8 },
]);

const FLOOR_11 = stagingGrid([
  { code: "F11-MPR-01", name: "Multipurpose Room", capacity: 30 },
  { code: "F11-SR-01", name: "Silent Room", capacity: 46 },
  { code: "F11-10PAX-01", name: "10 Pax Room", capacity: 10 },
  { code: "F11-8PAX-01", name: "8 Pax Room A", capacity: 8 },
  { code: "F11-8PAX-02", name: "8 Pax Room B", capacity: 8 },
  { code: "F11-6PAX-01", name: "6 Pax Room A", capacity: 6 },
  { code: "F11-6PAX-02", name: "6 Pax Room B", capacity: 6 },
  { code: "F11-4PAX-01", name: "4 Pax Room A", capacity: 4 },
  { code: "F11-4PAX-02", name: "4 Pax Room B", capacity: 4 },
  { code: "F11-COLLAB-01", name: "Collab Room A", capacity: 4 },
  { code: "F11-COLLAB-02", name: "Collab Room B", capacity: 4 },
]);

function buildSeedRooms() {
  const floors = { 3: FLOOR_3, 4: FLOOR_4, 5: FLOOR_5, 11: FLOOR_11 };
  const rooms = [];
  let seq = 1;
  for (const floor of Object.keys(floors)) {
    for (const r of floors[floor]) {
      rooms.push({
        id: `room-${seq++}`,
        floor: Number(floor),
        ...r,
      });
    }
  }
  return rooms;
}

module.exports = { buildSeedRooms };
