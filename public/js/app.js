(() => {
  "use strict";

  let STATE = null;
  let currentFloor = 3;
  let editMode = false;
  let pollTimer = null;
  let modalOpen = false;

  // booking modal selection state
  let bookingRoom = null;
  let anchorSlot = null;
  let selectedSlots = [];

  // occupied modal state
  let occBooking = null;
  let occRoom = null;

  const el = (id) => document.getElementById(id);

  // ---------- time helpers (mirror server logic) ----------
  function slotToMinutes(slot) {
    const [h, m] = slot.split(":").map(Number);
    return h * 60 + m;
  }
  function minutesLabel(mins) {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
  }
  function isRushSlot(slot) {
    const m = slotToMinutes(slot);
    return m >= 15 * 60 && m < 18 * 60;
  }
  function isPastSlot(slot) {
    if (!STATE) return false;
    return slotToMinutes(slot) < slotToMinutes(STATE.now.slot);
  }

  // ---------- data fetch ----------
  async function fetchState() {
    const res = await fetch("/api/state");
    STATE = await res.json();
    render();
  }

  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  // ---------- toast ----------
  function toast(message, type = "info") {
    const stack = el("toastStack");
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = message;
    stack.appendChild(t);
    setTimeout(() => t.remove(), 3800);
  }

  // ---------- room helpers ----------
  function roomsOnFloor(floor) {
    return STATE.rooms.filter((r) => r.floor === floor);
  }

  function activeBookingsForRoom(roomId) {
    return STATE.bookings.filter((b) => b.roomId === roomId && b.status === "active");
  }

  function isRoomFreeForSlots(room, slots) {
    return !activeBookingsForRoom(room.id).some((b) => b.slots.some((s) => slots.includes(s)));
  }

  function fitLabel(capacity, strength) {
    if (capacity <= strength + 2) return "perfect";
    if (capacity <= strength * 2) return "good";
    return "oversized";
  }

  // ---------- render ----------
  function render() {
    if (!STATE) return;
    renderRushBanner();
    renderDashboard();
    renderMap();
    if (modalOpen && el("bookModal").hidden === false && bookingRoom) {
      const fresh = STATE.rooms.find((r) => r.id === bookingRoom.id);
      if (fresh) { bookingRoom = fresh; renderSlotGrid(); }
    }
  }

  function renderRushBanner() {
    el("rushIndicator").hidden = !STATE.now.isRush;
  }

  function renderDashboard() {
    const rooms = roomsOnFloor(currentFloor);
    const vacant = rooms.filter((r) => r.status === "vacant").length;
    el("statTotal").textContent = rooms.length;
    el("statVacant").textContent = vacant;
    el("statOccupied").textContent = rooms.length - vacant;
  }

  function renderMap() {
    const mapFile = STATE.maps[currentFloor];
    const img = el("mapImage");
    const empty = el("mapEmpty");
    if (!mapFile) {
      img.style.display = "none";
      empty.hidden = false;
      el("roomLayer").innerHTML = "";
      return;
    }
    empty.hidden = true;
    img.style.display = "block";
    const v = (STATE.mapVersion && STATE.mapVersion[currentFloor]) || 0;
    const wantedSrc = `maps/${mapFile}?v=${v}`;
    if (!img.src.endsWith(wantedSrc)) img.src = wantedSrc;

    const layer = el("roomLayer");
    layer.innerHTML = "";
    for (const room of roomsOnFloor(currentFloor)) {
      layer.appendChild(buildRoomBox(room));
    }
  }

  function buildRoomBox(room) {
    const box = document.createElement("div");
    box.className = `room-box ${room.status}`;
    box.style.top = room.top + "%";
    box.style.left = room.left + "%";
    box.style.width = room.width + "%";
    box.style.height = room.height + "%";
    box.dataset.roomId = room.id;

    const chip = document.createElement("div");
    chip.className = "room-chip";
    chip.innerHTML = `${room.name}<small>${room.code} · ${room.capacity} seats</small>`;
    box.appendChild(chip);

    if (editMode) {
      box.classList.add("editing");
      const handle = document.createElement("div");
      handle.className = "resize-handle";
      box.appendChild(handle);
      attachDragResize(box, room, handle);
    } else {
      box.addEventListener("click", () => onRoomClick(room));
    }

    if (room.id === window.__pulseRoomId) {
      box.classList.add("pulse");
      setTimeout(() => box.classList.remove("pulse"), 3000);
    }

    return box;
  }

  function onRoomClick(room) {
    if (room.status === "occupied") openOccupiedModal(room);
    else openBookModal(room);
  }

  // ---------- booking modal ----------
  function openBookModal(room) {
    bookingRoom = room;
    anchorSlot = null;
    selectedSlots = [];
    el("bookRoomName").textContent = `${room.name} (${room.code})`;
    el("bookRoomMeta").textContent = `Floor ${room.floor} · Capacity ${room.capacity} seats`;
    el("strengthInput").value = 1;
    el("strengthInput").max = room.capacity;
    el("bookedByInput").value = "";
    el("bookError").hidden = true;
    renderSlotGrid();
    updateSummary();
    openModal("bookModal");
  }

  function renderSlotGrid() {
    const grid = el("slotGrid");
    grid.innerHTML = "";
    for (const slot of STATE.slots) {
      const booking = activeBookingsForRoom(bookingRoom.id).find((b) => b.slots.includes(slot));
      const past = isPastSlot(slot);
      const cell = document.createElement("div");
      cell.className = "slot-cell";
      if (isRushSlot(slot)) cell.classList.add("rush");
      if (booking) {
        cell.classList.add("booked");
        cell.title = `Booked by ${booking.bookedBy}`;
      } else if (past) {
        cell.classList.add("past");
      } else if (selectedSlots.includes(slot)) {
        cell.classList.add("selected");
      }
      cell.textContent = slot;
      if (!booking && !past) cell.addEventListener("click", () => onSlotClick(slot));
      grid.appendChild(cell);
    }
  }

  function onSlotClick(slot) {
    if (!anchorSlot) {
      anchorSlot = slot;
      selectedSlots = [slot];
    } else if (slot === anchorSlot && selectedSlots.length === 1) {
      anchorSlot = null;
      selectedSlots = [];
    } else {
      const aM = slotToMinutes(anchorSlot);
      const sM = slotToMinutes(slot);
      const lo = Math.min(aM, sM);
      const hi = Math.max(aM, sM);
      const range = [];
      for (let m = lo; m <= hi; m += 30) range.push(minutesLabel(m));

      const isBlocked = (s) => {
        const booked = activeBookingsForRoom(bookingRoom.id).some((b) => b.slots.includes(s));
        return booked || isPastSlot(s);
      };
      const blockerIdx = range.findIndex(isBlocked);
      let finalRange = range;
      if (blockerIdx !== -1) {
        toast("Range hits a booked/past slot — trimmed to nearest available", "error");
        finalRange = sM >= aM ? range.slice(0, blockerIdx) : range.slice(blockerIdx + 1);
        if (finalRange.length === 0) finalRange = [anchorSlot];
      }
      selectedSlots = finalRange.sort((a, b) => slotToMinutes(a) - slotToMinutes(b));
    }
    renderSlotGrid();
    updateSummary();
  }

  function updateSummary() {
    const rangeEl = el("summaryRange");
    const metaEl = el("summaryMeta");
    const btn = el("confirmBookBtn");
    const warn = el("oversizeWarning");
    warn.hidden = true;

    if (selectedSlots.length === 0) {
      rangeEl.textContent = "No slot selected";
      metaEl.textContent = "";
      btn.disabled = true;
      return;
    }
    const start = selectedSlots[0];
    const end = minutesLabel(slotToMinutes(selectedSlots[selectedSlots.length - 1]) + 30);
    rangeEl.textContent = `${start} – ${end}`;
    const rush = selectedSlots.some(isRushSlot);
    metaEl.textContent = `${selectedSlots.length} slot(s)${rush ? " · ⚡ Rush hour" : ""}`;
    btn.disabled = false;

    const strength = Number(el("strengthInput").value) || 1;
    if (bookingRoom.capacity > strength * 2) {
      const alt = STATE.rooms
        .filter((r) => r.id !== bookingRoom.id && r.capacity >= strength && r.capacity <= strength * 2)
        .filter((r) => isRoomFreeForSlots(r, selectedSlots))
        .sort((a, b) => a.capacity - b.capacity)[0];
      warn.hidden = false;
      warn.textContent = alt
        ? `This room is oversized for ${strength} people — consider ${alt.name} (Floor ${alt.floor}, ${alt.capacity} seats) instead.`
        : `This room is oversized for ${strength} people, but no better-fit room is free for this slot right now.`;
    }
  }

  async function confirmBooking() {
    const strength = Number(el("strengthInput").value);
    const bookedBy = el("bookedByInput").value.trim();
    el("bookError").hidden = true;
    try {
      const { booking } = await api("POST", "/api/bookings", {
        roomId: bookingRoom.id,
        slots: selectedSlots,
        strength,
        bookedBy,
      });
      const end = minutesLabel(slotToMinutes(booking.slots[booking.slots.length - 1]) + 30);
      toast(`${bookingRoom.name} booked, ${booking.slots[0]}–${end} · ${strength} people`, "success");
      closeModals();
      await fetchState();
    } catch (e) {
      el("bookError").textContent = e.message;
      el("bookError").hidden = false;
    }
  }

  // ---------- occupied modal ----------
  function openOccupiedModal(room) {
    occRoom = room;
    occBooking = room.currentBooking;
    el("occRoomName").textContent = `${room.name} (${room.code})`;
    el("occRoomMeta").textContent = `Floor ${room.floor} · Capacity ${room.capacity} seats`;
    const end = minutesLabel(slotToMinutes(occBooking.slots[occBooking.slots.length - 1]) + 30);
    el("occDetails").innerHTML = `
      <div class="occ-row"><span>Time slot</span><strong>${occBooking.slots[0]} – ${end}</strong></div>
      <div class="occ-row"><span>Booked by</span><strong>${occBooking.bookedBy}</strong></div>
      <div class="occ-row"><span>Strength</span><strong>${occBooking.strength} people</strong></div>
    `;
    openModal("occupiedModal");
  }

  async function leaveEarly() {
    try {
      await api("POST", `/api/bookings/${occBooking.id}/leave-early`, {});
      toast(`${occRoom.name} is now free`, "success");
      closeModals();
      await fetchState();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  // ---------- find a room ----------
  function populateFindSlotSelects() {
    const start = el("findStart");
    const end = el("findEnd");
    start.innerHTML = "";
    end.innerHTML = "";
    for (const slot of STATE.slots) {
      const disabled = isPastSlot(slot) ? "disabled" : "";
      start.innerHTML += `<option value="${slot}" ${disabled}>${slot}</option>`;
      end.innerHTML += `<option value="${slot}" ${disabled}>${slot}</option>`;
    }
    start.value = STATE.now.slot;
    end.value = STATE.now.slot;
  }

  async function runFindSearch() {
    const strength = Number(el("findStrength").value);
    const s = el("findStart").value;
    const e = el("findEnd").value;
    const lo = Math.min(slotToMinutes(s), slotToMinutes(e));
    const hi = Math.max(slotToMinutes(s), slotToMinutes(e));
    const slots = [];
    for (let m = lo; m <= hi; m += 30) slots.push(minutesLabel(m));

    const results = el("findResults");
    results.innerHTML = "<p class='empty-note'>Searching…</p>";
    try {
      const data = await api("GET", `/api/suggest?strength=${strength}&slots=${slots.join(",")}`);
      if (data.suggestions.length === 0) {
        results.innerHTML = "<p class='empty-note'>No vacant room fits that group right now. Try a smaller strength or different slot.</p>";
        return;
      }
      results.innerHTML = "";
      const banner = data.rush ? `<p class="muted" style="margin:0 0 4px">⚡ Rush hour — optimized allotment applied</p>` : "";
      results.insertAdjacentHTML("beforeend", banner);
      for (const s of data.suggestions.slice(0, 12)) {
        const card = document.createElement("div");
        card.className = "find-card";
        card.innerHTML = `
          <div>
            <div class="find-card-name">${s.room.name} <span class="muted">(${s.room.code})</span></div>
            <div class="find-card-meta">Floor ${s.room.floor} · ${s.room.capacity} seats</div>
          </div>
          <span class="fit-chip fit-${s.fit}">${s.fit}</span>
        `;
        card.addEventListener("click", () => jumpToSuggestion(s.room, slots, strength));
        results.appendChild(card);
      }
    } catch (e2) {
      results.innerHTML = `<p class="empty-note">${e2.message}</p>`;
    }
  }

  function jumpToSuggestion(room, slots, strength) {
    closeModals();
    setFloor(room.floor);
    window.__pulseRoomId = room.id;
    render();
    setTimeout(() => { window.__pulseRoomId = null; }, 3200);
    setTimeout(() => {
      const fresh = STATE.rooms.find((r) => r.id === room.id);
      openBookModal(fresh);
      anchorSlot = slots[0];
      selectedSlots = slots.filter((s) => !isPastSlot(s) && !activeBookingsForRoom(room.id).some((b) => b.slots.includes(s)));
      el("strengthInput").value = strength;
      renderSlotGrid();
      updateSummary();
    }, 300);
  }

  // ---------- layout calibration ----------
  function attachDragResize(box, room, handle) {
    const stage = el("mapStage");

    box.addEventListener("mousedown", (e) => {
      if (e.target === handle) return;
      e.preventDefault();
      const stageRect = stage.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const startTop = room.top, startLeft = room.left;

      function onMove(ev) {
        const dxPct = ((ev.clientX - startX) / stageRect.width) * 100;
        const dyPct = ((ev.clientY - startY) / stageRect.height) * 100;
        room.top = Math.min(100 - room.height, Math.max(0, startTop + dyPct));
        room.left = Math.min(100 - room.width, Math.max(0, startLeft + dxPct));
        box.style.top = room.top + "%";
        box.style.left = room.left + "%";
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saveLayout(room);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const stageRect = stage.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const startW = room.width, startH = room.height;

      function onMove(ev) {
        const dwPct = ((ev.clientX - startX) / stageRect.width) * 100;
        const dhPct = ((ev.clientY - startY) / stageRect.height) * 100;
        room.width = Math.min(60, Math.max(2, startW + dwPct));
        room.height = Math.min(60, Math.max(2, startH + dhPct));
        box.style.width = room.width + "%";
        box.style.height = room.height + "%";
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saveLayout(room);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  async function saveLayout(room) {
    try {
      await api("PATCH", `/api/rooms/${room.id}/layout`, {
        top: room.top, left: room.left, width: room.width, height: room.height,
      });
    } catch (e) {
      toast("Failed to save layout: " + e.message, "error");
    }
  }

  // ---------- map upload ----------
  async function uploadMap(file) {
    const fd = new FormData();
    fd.append("map", file);
    try {
      const res = await fetch(`/api/maps/${currentFloor}`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      toast("Map updated for this floor", "success");
      await fetchState();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  // ---------- modal plumbing ----------
  function openModal(id) {
    el(id).hidden = false;
    modalOpen = true;
  }
  function closeModals() {
    for (const id of ["bookModal", "occupiedModal", "findModal"]) el(id).hidden = true;
    modalOpen = false;
  }

  // ---------- floor switching ----------
  function setFloor(floor) {
    currentFloor = floor;
    document.querySelectorAll(".floor-tab").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.floor) === floor);
    });
    render();
  }

  // ---------- init ----------
  function init() {
    document.querySelectorAll(".floor-tab").forEach((btn) => {
      btn.addEventListener("click", () => setFloor(Number(btn.dataset.floor)));
    });

    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", closeModals);
    });
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModals(); });
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModals(); });

    el("confirmBookBtn").addEventListener("click", confirmBooking);
    el("strengthInput").addEventListener("input", updateSummary);
    el("leaveEarlyBtn").addEventListener("click", leaveEarly);

    el("editLayoutBtn").addEventListener("click", () => {
      editMode = !editMode;
      el("editLayoutBtn").textContent = editMode ? "✓ Done editing" : "✎ Edit layout";
      el("calibrateHint").hidden = !editMode;
      render();
    });

    el("mapUploadInput").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) uploadMap(file);
      e.target.value = "";
    });

    el("findRoomBtn").addEventListener("click", () => {
      populateFindSlotSelects();
      el("findResults").innerHTML = "";
      openModal("findModal");
    });
    el("findGoBtn").addEventListener("click", runFindSearch);

    fetchState();
    pollTimer = setInterval(fetchState, 5000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
