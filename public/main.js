const socket = io()

socket.on("connect", () => { console.log("✅ Connected:", socket.id) })
socket.on("connect_error", (err) => { console.error("❌ Connection failed:", err.message) })

let bookedTickets    = {}
let onHoldTickets    = {}
let selectedTickets  = []
let myHeldTickets    = []
let myBookedTickets  = []
let previewTicketNum = null
let markedNumbers    = []
let ticketSheets     = []
let totalTickets     = 0
let startTime        = null
let countdownInterval= null
let currentScreen    = "waitScreen"

function showScreen(id){
  ["waitScreen","bookingScreen","countdownScreen","gameScreen"].forEach(s => {
    document.getElementById(s).style.display = (s === id) ? "block" : "none"
  })
  currentScreen = id
}

function createBoard(){
  const board = document.getElementById("board")
  if(!board) return
  board.innerHTML = ""
  for(let i = 1; i <= 90; i++){
    const box = document.createElement("div")
    box.className = "number"; box.id = "b"+i; box.innerText = i
    if(markedNumbers.includes(i)) box.classList.add("called")
    board.appendChild(box)
  }
}

/* ── BUILD TICKET LIST ──
   For booking/countdown screens: show full ticket grids with inline booking.
   For game screen: show booked tickets list (unchanged).
── */
function buildTicketList(listId, infoId){
  const list = document.getElementById(listId)
  if(!list || !totalTickets) return
  list.innerHTML = ""

  // ── GAME SCREEN: show all booked tickets as grids ──
  if(listId === "ticketList"){
    const bookedEntries = Object.entries(bookedTickets).sort((a,b) => parseInt(a[0]) - parseInt(b[0]))
    if(bookedEntries.length === 0){
      list.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:13px;padding:16px;">No tickets booked yet</p>'
      updateInfo(infoId); return
    }
    bookedEntries.forEach(([tNum, playerName]) => {
      const num = parseInt(tNum)
      if(!ticketSheets.length) return
      const ticket = ticketSheets[Math.floor((num-1)/6)][(num-1)%6]
      if(!ticket) return
      const card = document.createElement("div")
      card.id = "allcard"+num; card.className = "ticketCard"
      card.style.cssText = "margin-bottom:12px;padding:14px 16px;"
      const hdr = document.createElement("div")
      hdr.className = "ticket-header"
      hdr.innerHTML = '<span class="ticket-label">🎟 Ticket #<strong>'+num+'</strong> &nbsp;·&nbsp; Sheet '+(Math.floor((num-1)/6)+1)+'</span>'
        +'<span class="ticket-name">✅ '+playerName+'</span>'
      card.appendChild(hdr)
      const grid = document.createElement("div")
      grid.className = "ticket"
      for(let r = 0; r < 3; r++){
        for(let c = 0; c < 9; c++){
          const cell = document.createElement("div")
          const val  = ticket[r][c]
          if(val !== 0){
            cell.className = "cell" + (markedNumbers.includes(val) ? " marked" : "")
            cell.innerText = val; cell.id = "allcell_"+num+"_"+val
          } else { cell.className = "cell empty" }
          grid.appendChild(cell)
        }
      }
      card.appendChild(grid)
      list.appendChild(card)
    })
    updateInfo(infoId); return
  }

  // ── BOOKING / COUNTDOWN SCREENS: show ALL tickets as grids with tap-to-select ──
  ensureFloatingBookBar()
  const totalSheets = Math.ceil(totalTickets / 6)
  for(let s = 0; s < totalSheets; s++){
    const block = document.createElement("div")
    block.className = "sheetBlock"
    block.style.cssText = "background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px 12px;margin-bottom:16px;"
    const label = document.createElement("div")
    label.className = "sheetLabel"
    label.innerText = "Sheet "+(s+1)+"  —  Tickets "+(s*6+1)+" to "+Math.min(s*6+6, totalTickets)
    block.appendChild(label)

    const grid = document.createElement("div")
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:9px;"

    for(let t = 0; t < 6; t++){
      const num = s*6+t+1; if(num > totalTickets) break
      const ticket = ticketSheets[s] && ticketSheets[s][t]
      if(!ticket) continue

      const card = buildBookingTicketCard(num, ticket)
      card.id = "bookcard"+num
      grid.appendChild(card)
    }
    block.appendChild(grid)
    list.appendChild(block)
  }
  updateInfo(infoId)
}

/* ── FLOATING BOOKING BAR ── */
function ensureFloatingBookBar(){
  if(document.getElementById("floatingBookBar")) return
  const bar = document.createElement("div")
  bar.id = "floatingBookBar"
  // styles in CSS #floatingBookBar
  bar.innerHTML = `
    <div class="fbb-row">
      <span id="fbbCount"></span>
      <input id="fbbName" type="text" placeholder="Your name…">
      <button id="fbbBook" onclick="bookAllGridSelected()">✅ Book</button>
      <button id="fbbClear" onclick="clearGridSelection()">✖</button>
    </div>
    <div id="fbbTicketList"></div>
  `
  document.body.appendChild(bar)

  // Add bottom padding to page so bar doesn't cover content
  document.body.style.paddingBottom = "90px"

  const inp = bar.querySelector("#fbbName")
  if(inp) inp.addEventListener("keydown", e => { if(e.key === "Enter") bookAllGridSelected() })
}

function updateFloatingBar(){
  const bar = document.getElementById("floatingBookBar")
  if(!bar) return
  const count = gridSelectedTickets.length
  if(count === 0){
    bar.style.display = "none"
    return
  }
  bar.style.display = "flex"
  const countEl = document.getElementById("fbbCount")
  const listEl  = document.getElementById("fbbTicketList")
  if(countEl) countEl.innerText = count === 1 ? "1 ticket selected" : count+" tickets selected"
  if(listEl)  listEl.innerText  = "Ticket" + (count > 1 ? "s" : "") + " #" + gridSelectedTickets.join(", #")
}

let gridSelectedTickets = []

function toggleGridSelect(num){
  if(gridSelectedTickets.includes(num)){
    gridSelectedTickets = gridSelectedTickets.filter(t => t !== num)
  } else {
    gridSelectedTickets.push(num)
  }
  // Update card visual
  const card = document.getElementById("bookcard"+num)
  if(card){
    const isSelected = gridSelectedTickets.includes(num)
    if(isSelected) card.classList.add("selected"); else card.classList.remove("selected")
    const footer = document.getElementById("bookfooter"+num)
    if(footer){
      footer.style.background = isSelected ? "#c8e6c9" : "#f0e6c8"
      footer.style.color = isSelected ? "#1b5e20" : "#888"
      const label = footer.querySelector(".select-label")
      if(label){ label.innerText = isSelected ? "✓ Selected" : "Tap to select" }
    }
  }
  updateFloatingBar()
}

function clearGridSelection(){
  const prev = [...gridSelectedTickets]
  gridSelectedTickets = []
  prev.forEach(num => {
    const card = document.getElementById("bookcard"+num)
    if(card){
      card.classList.remove("selected")
      const footer = document.getElementById("bookfooter"+num)
      if(footer){
        footer.style.background = "#f0e6c8"
        footer.style.color = "#888"
        const label = footer.querySelector(".select-label")
        if(label){ label.innerText = "Tap to select" }
      }
    }
  })
  updateFloatingBar()
}

function bookAllGridSelected(){
  const bar = document.getElementById("floatingBookBar")
  const inp = bar ? bar.querySelector("#fbbName") : null
  const name = inp ? inp.value.trim() : ""
  if(!name){
    if(inp){ inp.focus(); inp.style.borderColor="#e53935"; setTimeout(()=>inp.style.borderColor="rgba(255,255,255,0.3)",1500) }
    showToast("⚠️ Please enter your name first")
    return
  }
  if(gridSelectedTickets.length === 0){ showToast("⚠️ No tickets selected"); return }

  // Filter out any that got booked/held since selection
  const conflict = gridSelectedTickets.filter(t => bookedTickets[t] || onHoldTickets[t])
  if(conflict.length > 0){
    showToast("⚠️ Ticket(s) #"+conflict.join(", #")+" no longer available — removed from selection")
    gridSelectedTickets = gridSelectedTickets.filter(t => !bookedTickets[t] && !onHoldTickets[t])
    conflict.forEach(num => {
      const card = document.getElementById("bookcard"+num)
      if(card){ card.classList.remove("selected") }
    })
    updateFloatingBar()
    if(gridSelectedTickets.length === 0) return
  }

  const ticketsToHold = [...gridSelectedTickets]
  clearGridSelection()
  if(inp) inp.value = ""

  socket.emit("requestHold", { tickets: ticketsToHold, playerName: name })
  showToast("📨 Request sent for Ticket"+( ticketsToHold.length > 1 ? "s" : "")+" #"+ticketsToHold.join(", #")+"!")

  const sheetsText = ticketsToHold.map(n => "Ticket #"+n+" (Sheet "+(Math.floor((n-1)/6)+1)+")").join("\n")
  const msg = "🎱 *Tambola Booking Request*\n\n👤 *Name:* "+name+"\n🎟 *Tickets:*\n"+sheetsText+"\n\nPlease confirm! 🙏"
  setTimeout(() => window.open("https://wa.me/918731873667?text="+encodeURIComponent(msg),"_blank"), 300)
}

/* ── BUILD A SINGLE TICKET CARD FOR BOOKING SCREEN ── */
function buildBookingTicketCard(num, ticket){
  const isMyBooked = myBookedTickets.includes(num)
  const isMyHeld   = myHeldTickets.includes(num)
  const isBooked   = !!bookedTickets[num]
  const isOnHold   = !!onHoldTickets[num]
  const isAvail    = !isBooked && !isOnHold && !isMyHeld && !isMyBooked
  const isSelected = gridSelectedTickets.includes(num)

  const card = document.createElement("div")
  card.style.cssText = [
    "",
    "box-shadow:"+(isSelected ? "0 0 0 3px rgba(67,160,71,0.4), 0 4px 16px rgba(0,0,0,0.3)" : "0 4px 16px rgba(0,0,0,0.3)")+";",
    "outline:"+(isSelected ? "3px solid #43a047" : "none")+";",
    isAvail ? "cursor:pointer;" : ""
  ].join("")

  // Clicking anywhere on an available card toggles selection
  if(isAvail){
    card.onclick = (e) => {
      // Don't trigger if clicking inside footer (in case of future inputs)
      toggleGridSelect(num)
    }
  }

  // Header
  let hdrBg = "linear-gradient(135deg,#1976d2,#0d47a1)"
  let hdrText = ""
  if(isMyBooked){
    hdrBg = "linear-gradient(135deg,#00acc1,#006064)"
    hdrText = '<span style="color:#ffeb3b;font-size:12px;font-weight:700;">✅ '+bookedTickets[num]+'</span>'
  } else if(isBooked){
    hdrBg = "linear-gradient(135deg,#424242,#212121)"
    hdrText = '<span style="color:#ef9a9a;font-size:12px;font-weight:700;">🔒 '+bookedTickets[num]+'</span>'
  } else if(isMyHeld){
    hdrBg = "linear-gradient(135deg,#f57f17,#e65100)"
    hdrText = '<span style="color:#fff3e0;font-size:12px;font-weight:700;">⏳ Awaiting...</span>'
  } else if(isOnHold){
    hdrBg = "linear-gradient(135deg,#bf360c,#870000)"
    hdrText = '<span style="color:#ffccbc;font-size:12px;font-weight:700;">⏳ On Hold</span>'
  } else if(isSelected){
    hdrBg = "linear-gradient(135deg,#43a047,#2e7d32)"
    hdrText = '<span style="color:#fff;font-size:12px;font-weight:700;">✓ Selected</span>'
  } else {
    hdrText = '<span style="color:#a5d6a7;font-size:12px;font-weight:700;">Tap to select</span>'
  }

  const hdr = document.createElement("div")
  hdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:"+hdrBg+";"
  hdr.innerHTML = '<span style="color:white;font-weight:700;font-size:13px;">🎟 Ticket #'+num+'</span>'+hdrText
  card.appendChild(hdr)

  // Ticket grid
  const gridWrap = document.createElement("div")
  gridWrap.style.cssText = "padding:10px 10px 6px;"
  const ticketGrid = document.createElement("div")
  ticketGrid.style.cssText = "display:grid;grid-template-columns:repeat(9,1fr);gap:3px;"
  for(let r = 0; r < 3; r++){
    for(let c = 0; c < 9; c++){
      const cell = document.createElement("div")
      const val  = ticket[r][c]
      if(val !== 0){
        cell.style.cssText = "height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border-radius:5px;border:1px solid #e0e0e0;background:#f8f9fa;color:#1a1a2e;"
        cell.innerText = val
      } else {
        cell.style.cssText = "height:36px;border-radius:5px;background:#e9ecef;border:1px solid #dee2e6;"
      }
      ticketGrid.appendChild(cell)
    }
  }
  gridWrap.appendChild(ticketGrid)
  card.appendChild(gridWrap)

  // Footer strip
  const footer = document.createElement("div")
  footer.id = "bookfooter"+num
  if(isAvail){
    footer.style.cssText = "padding:6px 12px;text-align:center;border-top:1px solid #eee;background:"+(isSelected?"#e8f5e9":"#f5f5f5")+";"
    const label = document.createElement("span")
    label.className = "select-label"
    label.style.cssText = "font-size:12px;font-weight:600;color:"+(isSelected?"#2e7d32":"#888")+";"
    label.innerText = isSelected ? "✓ Selected" : "Tap to select"
    footer.appendChild(label)
  } else if(isBooked && !isMyBooked){
    footer.style.cssText = "padding:6px 12px;text-align:center;background:#f5f5f5;border-top:1px solid #eee;"
    footer.innerHTML = '<span style="font-size:12px;color:#757575;font-weight:600;">Booked by '+bookedTickets[num]+'</span>'
  } else if(isOnHold){
    footer.style.cssText = "padding:6px 12px;text-align:center;background:#fff3e0;border-top:1px solid #ffe0b2;"
    footer.innerHTML = '<span style="font-size:12px;color:#e65100;font-weight:600;">On hold by '+onHoldTickets[num]+'</span>'
  } else if(isMyHeld){
    footer.style.cssText = "padding:6px 12px;text-align:center;background:#fff8e1;border-top:1px solid #ffecb3;"
    footer.innerHTML = '<span style="font-size:12px;color:#f57f17;font-weight:600;">⏳ Pending confirmation...</span>'
  } else if(isMyBooked){
    footer.style.cssText = "padding:6px 12px;text-align:center;background:#e8f5e9;border-top:1px solid #c8e6c9;"
    footer.innerHTML = '<span style="font-size:12px;color:#2e7d32;font-weight:700;">✅ Booked: '+bookedTickets[num]+'</span>'
  }
  card.appendChild(footer)

  return card
}

/* ── REFRESH A SINGLE BOOKING CARD ── */
function refreshBookingCard(num){
  const oldCard = document.getElementById("bookcard"+num)
  if(!oldCard || !ticketSheets.length) return
  const sheetIdx = Math.floor((num-1)/6)
  const ticketIdx = (num-1) % 6
  const ticket = ticketSheets[sheetIdx] && ticketSheets[sheetIdx][ticketIdx]
  if(!ticket) return
  // If this ticket is now booked/held, remove from selection silently
  if((bookedTickets[num] || onHoldTickets[num]) && gridSelectedTickets.includes(num)){
    gridSelectedTickets = gridSelectedTickets.filter(t => t !== num)
    updateFloatingBar()
  }
  const newCard = buildBookingTicketCard(num, ticket)
  newCard.id = "bookcard"+num
  oldCard.replaceWith(newCard)
}

/* ── REFRESH ALL BOOKING CARDS ── */
function refreshAllBookingCards(){
  if(currentScreen !== "bookingScreen" && currentScreen !== "countdownScreen") return
  for(let i = 1; i <= totalTickets; i++){
    refreshBookingCard(i)
  }
}

function getTicketClass(num){
  if(myBookedTickets.includes(num))  return "ticketButton mybooked"
  if(bookedTickets[num])             return "ticketButton booked"
  if(myHeldTickets.includes(num))    return "ticketButton myhold"
  if(onHoldTickets[num])             return "ticketButton onhold"
  if(selectedTickets.includes(num))  return "ticketButton selected"
  if(num === previewTicketNum)       return "ticketButton previewing"
  return "ticketButton"
}

function refreshTicketButtons(){
  for(let i = 1; i <= totalTickets; i++){
    const btn = document.getElementById("tbtn"+i)
    if(btn) btn.className = getTicketClass(i)
  }
}

function updateInfo(infoId){
  const el = document.getElementById(infoId)
  if(!el || !totalTickets) return
  const booked = Object.keys(bookedTickets).length
  const onHold = Object.keys(onHoldTickets).length
  const available = totalTickets - booked - onHold
  el.innerHTML =
    '<span class="info-pill avail">'+available+' available</span>'+
    '<span class="info-pill held">'+onHold+' on hold</span>'+
    '<span class="info-pill booked">'+booked+' booked</span>'
}

function updateAllInfo(){
  ["ticketInfoPre","ticketInfoCd","ticketInfo"].forEach(id => updateInfo(id))
}

function updateSelectionPanel(){
  // Not used for booking-screen grid mode, kept for game screen compatibility
  const text = selectedTickets.length === 0 ? "" :
    selectedTickets.length === 1 ? "Ticket #"+selectedTickets[0]+" selected"
    : selectedTickets.length+" tickets: #"+selectedTickets.join(", #")
  const panels = [
    { panel:"selectionPanelPre", count:"selectionCountPre" },
    { panel:"selectionPanelCd",  count:"selectionCountCd"  },
    { panel:"selectionPanel",    count:"selectionCount"    }
  ]
  panels.forEach(({ panel, count }) => {
    const p = document.getElementById(panel), c = document.getElementById(count)
    if(!p) return
    p.style.display = selectedTickets.length > 0 ? "block" : "none"
    if(c) c.innerText = text
  })
}

function ticketClicked(num){
  unlockAudio()
  if(bookedTickets[num] && !myBookedTickets.includes(num)){ previewTicket(num); return }
  if(onHoldTickets[num] && !myHeldTickets.includes(num)){ alert("Ticket #"+num+" is on hold by "+onHoldTickets[num]); return }
  if(myBookedTickets.includes(num) || myHeldTickets.includes(num)){ previewTicket(num); return }
  if(selectedTickets.includes(num)) selectedTickets = selectedTickets.filter(t => t !== num)
  else selectedTickets.push(num)
  previewTicketNum = num
  previewTicket(num); refreshTicketButtons(); updateSelectionPanel(); updateAllInfo()
}

function previewTicket(num){
  const areaMap = { "bookingScreen":"ticketPreviewAreaPre", "countdownScreen":"ticketPreviewAreaCd", "gameScreen":"ticketPreviewArea" }
  const el = document.getElementById(areaMap[currentScreen] || "ticketPreviewArea")
  if(!el) return
  previewTicketNum = num
  const ticket = ticketSheets[Math.floor((num-1)/6)][(num-1)%6]
  const isMyBooked = myBookedTickets.includes(num), isMyHeld = myHeldTickets.includes(num)
  const isBooked = !!bookedTickets[num], isOnHold = !!onHoldTickets[num], isSelected = selectedTickets.includes(num)
  let status = ""
  if(isMyBooked)      status = '<span class="ticket-name">✅ '+bookedTickets[num]+'</span>'
  else if(isMyHeld)   status = '<span class="ticket-name" style="color:#ffcc80">⏳ Awaiting Confirmation</span>'
  else if(isBooked)   status = '<span class="ticket-name" style="color:#ef9a9a">🔒 '+bookedTickets[num]+'</span>'
  else if(isOnHold)   status = '<span class="ticket-name" style="color:#ffcc80">⏳ On Hold — '+onHoldTickets[num]+'</span>'
  else if(isSelected) status = '<span class="ticket-name" style="color:#80deea">✓ Selected</span>'
  else                status = '<span class="ticket-name" style="color:#a5d6a7">Available</span>'
  el.innerHTML = ""
  const card = document.createElement("div"); card.className = "ticketCard"
  const hdr = document.createElement("div"); hdr.className = "ticket-header"
  hdr.innerHTML = '<span class="ticket-label">🎟 Ticket No: <strong>'+num+'</strong></span>'+status
  card.appendChild(hdr)
  const grid = document.createElement("div"); grid.className = "ticket"
  for(let r = 0; r < 3; r++){
    for(let c = 0; c < 9; c++){
      const cell = document.createElement("div"), val = ticket[r][c]
      if(val !== 0){ cell.className = "cell"+(markedNumbers.includes(val) ? " marked" : ""); cell.innerText = val; cell.id = "t"+val }
      else { cell.className = "cell empty" }
      grid.appendChild(cell)
    }
  }
  card.appendChild(grid); el.appendChild(card)
}

function getMyName(){
  if(myBookedTickets.length) return bookedTickets[myBookedTickets[0]] || ""
  if(myHeldTickets.length)   return onHoldTickets[myHeldTickets[0]] || ""
  return ""
}

function bookAllSelected(){
  if(selectedTickets.length === 0){ alert("No tickets selected"); return }
  let name = ""
  for(const id of ["playerName","playerNamePre","playerNameCd"]){
    const el = document.getElementById(id); if(el && el.value.trim()){ name = el.value.trim(); break }
  }
  if(!name){ alert("Please enter your name"); return }
  const conflict = selectedTickets.filter(t => bookedTickets[t] || onHoldTickets[t])
  if(conflict.length > 0){
    alert("Ticket(s) #"+conflict.join(", #")+" no longer available.")
    selectedTickets = selectedTickets.filter(t => !bookedTickets[t] && !onHoldTickets[t])
    refreshTicketButtons(); updateSelectionPanel(); updateAllInfo(); return
  }
  const ticketsToHold = [...selectedTickets]; selectedTickets = []
  updateSelectionPanel(); refreshTicketButtons(); updateAllInfo()
  socket.emit("requestHold", { tickets: ticketsToHold, playerName: name })
  showToast("📨 Request sent! Tickets #"+ticketsToHold.join(", #")+" on hold.")
  const sheetsText = ticketsToHold.map(num => "Ticket #"+num+" (Sheet "+(Math.floor((num-1)/6)+1)+")").join("\n")
  const msg = "🎱 *Tambola Booking Request*\n\n👤 *Name:* "+name+"\n🎟 *Tickets:*\n"+sheetsText+"\n\nPlease confirm! 🙏"
  setTimeout(() => window.open("https://wa.me/918731873667?text="+encodeURIComponent(msg),"_blank"), 300)
}

function clearSelection(){ selectedTickets = []; updateSelectionPanel(); refreshTicketButtons(); updateAllInfo() }

function showMyTickets(){
  const hasAny = myBookedTickets.length > 0 || myHeldTickets.length > 0
  const sections = [
    { sec:"myTicketsSectionPre", list:"myTicketsListPre" },
    { sec:"myTicketsSectionCd",  list:"myTicketsListCd"  },
    { sec:"myTicketsSection",    list:"myTicketsList"    }
  ]
  sections.forEach(({ sec, list }) => {
    const sEl = document.getElementById(sec), lEl = document.getElementById(list)
    if(!sEl) return
    sEl.style.display = hasAny ? "block" : "none"
    if(!lEl) return
    lEl.innerHTML = ""
    myHeldTickets.forEach(num => lEl.appendChild(buildTicketCard(num, "hold")))
    myBookedTickets.forEach(num => lEl.appendChild(buildTicketCard(num, "booked")))
  })
}

function buildTicketCard(num, type){
  const card = document.createElement("div"); card.className = "ticketCard"; card.style.marginBottom = "12px"
  const hdr = document.createElement("div"); hdr.className = "ticket-header"
  if(type === "hold") hdr.style.background = "linear-gradient(135deg,#f57f17,#e65100)"
  hdr.innerHTML = '<span class="ticket-label">🎟 Ticket #<strong>'+num+'</strong></span>'
    + (type === "hold" ? '<span class="ticket-name">⏳ Awaiting Confirmation</span>' : '<span class="ticket-name">✅ '+(bookedTickets[num]||"")+'</span>')
  card.appendChild(hdr); renderMiniTicket(card, num); return card
}

function renderMiniTicket(card, num){
  const ticket = ticketSheets[Math.floor((num-1)/6)][(num-1)%6]
  const grid = document.createElement("div"); grid.className = "ticket"
  for(let r = 0; r < 3; r++){
    for(let c = 0; c < 9; c++){
      const cell = document.createElement("div"), val = ticket[r][c]
      if(val !== 0){ cell.className = "cell"+(markedNumbers.includes(val) ? " marked" : ""); cell.innerText = val; cell.id = "mt"+num+"c"+val }
      else { cell.className = "cell empty" }
      grid.appendChild(cell)
    }
  }
  card.appendChild(grid)
}

function startCountdown(st){
  if(countdownInterval) clearInterval(countdownInterval)
  function tick(){
    const rem = Math.max(0, Math.ceil((st - Date.now()) / 1000))
    const el = document.getElementById("countdownTimer"); if(el) el.innerText = rem
    if(rem <= 0){ clearInterval(countdownInterval); countdownInterval = null; goLive() }
  }
  tick(); countdownInterval = setInterval(tick, 500)
}

function goLive(){
  unlockAudio(); showScreen("gameScreen")
  buildTicketList("ticketList","ticketInfo"); createBoard()
  markedNumbers.forEach(n => { const b = document.getElementById("b"+n); if(b) b.classList.add("called") })
  if(markedNumbers.length > 0){ const el = document.getElementById("currentNumber"); if(el) el.innerText = markedNumbers[markedNumbers.length-1] }
  updateCalledNumbersList()
  showMyTickets(); refreshTicketButtons()
}

function printMyTickets(){
  if(myBookedTickets.length === 0){ alert("No confirmed tickets to print"); return }
  let html = '<div style="font-family:Arial,sans-serif;padding:20px;max-width:700px;margin:0 auto;"><h2 style="text-align:center;margin-bottom:20px;">🎱 My Tambola Tickets</h2>'
  myBookedTickets.forEach(num => {
    const ticket = ticketSheets[Math.floor((num-1)/6)][(num-1)%6], name = bookedTickets[num]||""
    html += '<div style="border:2px solid #1976d2;border-radius:10px;padding:12px;margin-bottom:16px;background:#e3f2fd;">'
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><strong>Ticket #'+num+'</strong><span style="color:#1976d2;font-weight:bold;">'+name+'</span></div>'
    html += '<table style="border-collapse:collapse;width:100%;"><tbody>'
    for(let r = 0; r < 3; r++){
      html += '<tr>'
      for(let c = 0; c < 9; c++){
        const val = ticket[r][c]
        html += val !== 0 ? '<td style="width:11%;height:42px;text-align:center;font-weight:bold;font-size:16px;border:1px solid #ccc;background:white;">'+val+'</td>'
          : '<td style="width:11%;height:42px;border:1px solid #bbb;background:#e0e0e0;"></td>'
      }
      html += '</tr>'
    }
    html += '</tbody></table></div>'
  })
  html += '</div>'
  const win = window.open('','_blank','width=750,height=900')
  win.document.write('<!DOCTYPE html><html><head><title>My Tickets</title><style>body{margin:0;background:white;}@media print{button{display:none!important;}}</style></head><body>'+html
    +'<div style="text-align:center;margin:20px;"><button onclick="window.print()" style="padding:10px 24px;font-size:16px;background:#1976d2;color:white;border:none;border-radius:6px;cursor:pointer;">🖨️ Print</button>'
    +'<button onclick="window.close()" style="padding:10px 24px;font-size:16px;background:#888;color:white;border:none;border-radius:6px;cursor:pointer;margin-left:10px;">✖ Close</button></div></body></html>')
  win.document.close()
}

function searchAndScroll(){
  const query = document.getElementById("searchInput").value.trim().toLowerCase()
  const resultsEl = document.getElementById("searchResults")
  if(resultsEl) resultsEl.innerHTML = ""
  // All tickets always stay visible — only highlight changes
  if(!query){
    document.querySelectorAll('[id^="allcard"]').forEach(card => {
      card.style.outline = ""
      card.style.boxShadow = ""
      card.style.opacity = ""
    })
    return
  }
  const matchIds = Object.entries(bookedTickets)
    .filter(([,name]) => name.toLowerCase().includes(query))
    .map(([tNum]) => "allcard"+tNum)
  document.querySelectorAll('[id^="allcard"]').forEach(card => {
    if(matchIds.includes(card.id)){
      card.style.outline = "2px solid var(--gold)"
      card.style.boxShadow = "0 0 0 4px var(--gold-dim), 0 8px 28px rgba(0,0,0,0.5)"
      card.style.opacity = "1"
    } else {
      card.style.outline = ""
      card.style.boxShadow = ""
      card.style.opacity = "0.38"
    }
  })
  if(matchIds.length > 0){
    const firstCard = document.getElementById(matchIds[0])
    if(firstCard) firstCard.scrollIntoView({ behavior:"smooth", block:"center" })
  } else if(resultsEl){
    resultsEl.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:6px;">No tickets found for "'+query+'"</p>'
    // No match — reset all to full opacity
    document.querySelectorAll('[id^="allcard"]').forEach(card => { card.style.opacity = "" })
  }
}

function searchTickets(){ searchAndScroll() }

function clearSearch(){
  document.getElementById("searchInput").value = ""
  const resultsEl = document.getElementById("searchResults"); if(resultsEl) resultsEl.innerHTML = ""
  document.querySelectorAll('[id^="allcard"]').forEach(card => {
    card.style.outline = ""
    card.style.boxShadow = ""
    card.style.opacity = ""
  })
}

/* ── WINNERS LIST (multiple winners per prize) ── */
let playerWinnersStore = []

function addToWinnersList(prize, prizeKey, playerName, ticketNum){
  ticketNum = parseInt(ticketNum)
  // Prevent duplicate entry for same ticket + prize
  if(playerWinnersStore.find(w => w.prizeKey === prizeKey && w.ticketNum === ticketNum)) return
  playerWinnersStore.push({ prize, prizeKey, playerName, ticketNum })

  const sheet = Math.floor((ticketNum-1)/6)+1
  ;["winnersSection","winnersSectionCd"].forEach(secId => { const s = document.getElementById(secId); if(s) s.style.display = "block" })
  ;["winnersSection","winnersSectionCd"].forEach(secId => { const s = document.getElementById(secId); if(s) s.className = "winners-section" })

  ;["playerWinnersList","playerWinnersListCd"].forEach(listId => {
    const list = document.getElementById(listId); if(!list) return
    const groupId = "wgroup_"+listId+"_"+prizeKey
    const existing = document.getElementById(groupId)
    const badgeHtml = '<span class="winner-badge"><span class="wname">'+playerName+'</span><span class="wticket">#'+ticketNum+'·Sh'+sheet+'</span><button onclick="viewWinnerTicket('+ticketNum+')" style="font-size:9px;padding:1px 5px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:3px;cursor:pointer;margin-left:2px;margin:0;box-shadow:none;">👁</button></span>'
    if(existing){
      const wb = existing.querySelector(".winner-badges")
      if(wb) wb.insertAdjacentHTML("beforeend", badgeHtml)
    } else {
      const row = document.createElement("div")
      row.id = groupId
      row.className = "prize-group"
      row.innerHTML = '<div class="prize-group-label">'+prize+'</div><div class="winner-badges">'+badgeHtml+'</div>'
      list.insertBefore(row, list.firstChild)
    }
  })
}

function viewWinnerTicket(ticketNum){
  ticketNum = parseInt(ticketNum)
  if(!ticketSheets.length) return
  const ticket = ticketSheets[Math.floor((ticketNum-1)/6)] && ticketSheets[Math.floor((ticketNum-1)/6)][(ticketNum-1)%6]
  if(!ticket) return
  const playerName = bookedTickets[ticketNum] || "", sheet = Math.floor((ticketNum-1)/6)+1
  const old = document.getElementById("winnerTicketPopup"); if(old) old.remove()
  const overlay = document.createElement("div"); overlay.id = "winnerTicketPopup"
  overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;"
  overlay.onclick = (e) => { if(e.target === overlay) overlay.remove() }
  const card = document.createElement("div")
  card.style.cssText = "background:white;border-radius:16px;padding:20px;max-width:520px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.5);"
  const hdr = document.createElement("div")
  hdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:10px 14px;background:linear-gradient(135deg,#1976d2,#0d47a1);border-radius:10px;color:white;"
  hdr.innerHTML = '<span style="font-size:15px;font-weight:700;">🎟 Ticket #'+ticketNum+' · Sheet '+sheet+'</span><span style="font-size:14px;color:#ffeb3b;font-weight:600;">'+playerName+'</span>'
  card.appendChild(hdr)
  const grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:repeat(9,1fr);gap:4px;"
  for(let r=0;r<3;r++){
    for(let c=0;c<9;c++){
      const cell = document.createElement("div"), val = ticket[r][c]
      if(val !== 0){
        const marked = markedNumbers.includes(val)
        cell.style.cssText = "padding:8px 2px;text-align:center;font-weight:700;font-size:13px;border-radius:6px;border:1px solid #ddd;"+(marked?"background:#43a047;color:white;":"background:#f5f5f5;color:#333;")
        cell.innerText = val
      } else { cell.style.cssText = "padding:8px 2px;border-radius:6px;background:#e0e0e0;" }
      grid.appendChild(cell)
    }
  }
  card.appendChild(grid)
  const closeBtn = document.createElement("button"); closeBtn.innerText = "✖ Close"
  closeBtn.style.cssText = "margin-top:14px;width:100%;padding:10px;font-size:14px;background:#1976d2;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;"
  closeBtn.onclick = () => overlay.remove(); card.appendChild(closeBtn)
  overlay.appendChild(card); document.body.appendChild(overlay)
}

function showToast(msg){
  let t = document.getElementById("toastMsg")
  if(!t){
    t = document.createElement("div"); t.id="toastMsg"
    t.style.cssText="position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(20,20,50,0.97);color:#fff;padding:14px 24px;border-radius:12px;font-size:14px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.5);z-index:9999;border:1px solid rgba(255,255,255,0.15);max-width:90vw;text-align:center;transition:opacity 0.4s;"
    document.body.appendChild(t)
  }
  t.innerText=msg; t.style.opacity="1"; t.style.display="block"
  clearTimeout(t._timer)
  t._timer=setTimeout(()=>{t.style.opacity="0";setTimeout(()=>{t.style.display="none"},400)},4000)
}

/* ── SOCKET EVENTS ── */
socket.on("gameStarted", (data) => {
  totalTickets = parseInt(data.totalTickets) || 0
  ticketSheets = data.sheets || []
  bookedTickets = data.bookedTickets || {}
  onHoldTickets = data.onHoldTickets || {}
  markedNumbers = data.calledNumbers || []
  selectedTickets = []; myHeldTickets = []; myBookedTickets = []; previewTicketNum = null
  startTime = data.startTime || null
  const now = Date.now()
  if(data.calledNumbers && data.calledNumbers.length > 0){ goLive() }
  else if(data.gameLive){ goLive() }
  else if(startTime && now < startTime){ showScreen("countdownScreen"); buildTicketList("ticketListCd","ticketInfoCd"); startCountdown(startTime) }
  else if(startTime && now >= startTime){ goLive() }
  else { showScreen("bookingScreen"); buildTicketList("ticketListPre","ticketInfoPre") }
})

socket.on("gameCountdown", ({ startTime: st, activePrizes }) => {
  startTime = st
  activePrizeKeys = activePrizes && activePrizes.length > 0 ? activePrizes : null
  if(currentScreen === "gameScreen") return
  showScreen("countdownScreen"); buildTicketList("ticketListCd","ticketInfoCd")
  refreshAllBookingCards(); updateSelectionPanel(); showMyTickets(); startCountdown(st)
})

socket.on("ticketsOnHold", (heldList) => {
  heldList.forEach(({ ticketNum, playerName }) => {
    onHoldTickets[ticketNum] = playerName
    if(!myHeldTickets.includes(ticketNum)) myHeldTickets.push(ticketNum)
    refreshBookingCard(ticketNum)
  })
  updateAllInfo(); showMyTickets()
})

socket.on("holdFailed", (failedList) => {
  failedList.forEach(({ ticketNum }) => { selectedTickets = selectedTickets.filter(t=>t!==ticketNum) })
  refreshAllBookingCards(); updateSelectionPanel(); updateAllInfo()
})

socket.on("ticketBooked", ({ ticketNum, playerName }) => {
  bookedTickets[ticketNum] = playerName
  delete onHoldTickets[ticketNum]
  const isMyTicket = myHeldTickets.includes(ticketNum)
  if(isMyTicket) myHeldTickets = myHeldTickets.filter(t=>t!==ticketNum)
  const myName = getMyName()
  if((isMyTicket || (myName && myName.toLowerCase()===playerName.toLowerCase())) && !myBookedTickets.includes(ticketNum)){
    myBookedTickets.push(ticketNum)
    showToast("✅ Ticket #"+ticketNum+" confirmed for "+playerName+"!")
  }
  refreshBookingCard(ticketNum)
  updateAllInfo()
  if(previewTicketNum===ticketNum) previewTicket(ticketNum)
  showMyTickets()
  if(currentScreen === "gameScreen") buildTicketList("ticketList","ticketInfo")
})

socket.on("holdRemoved", (ticketNum) => {
  delete onHoldTickets[ticketNum]
  refreshBookingCard(ticketNum)
  updateAllInfo()
  if(previewTicketNum===ticketNum) previewTicket(ticketNum)
  showMyTickets()
})

socket.on("yourHoldReleased", (ticketNum) => {
  myHeldTickets = myHeldTickets.filter(t=>t!==ticketNum)
  refreshBookingCard(ticketNum)
  showToast("⚠️ Admin released your hold on Ticket #"+ticketNum+".")
  showMyTickets()
})

socket.on("bookingReleased", ({ ticketNum, playerName }) => {
  delete bookedTickets[ticketNum]
  myBookedTickets = myBookedTickets.filter(t => t !== ticketNum)
  refreshBookingCard(ticketNum)
  updateAllInfo()
  if(previewTicketNum === ticketNum) previewTicket(ticketNum)
  showMyTickets()
  if(currentScreen === "gameScreen") buildTicketList("ticketList","ticketInfo")
  showToast("⚠️ Ticket #"+ticketNum+" booking has been released by admin")
})

/* ── NUMBER COMMENTARY ── */
const NUMBER_CALLS = {
  1:"Number 1 — Kelly's Eye!",2:"Number 2 — One Little Duck!",3:"Number 3 — Cup of Tea!",
  4:"Number 4 — Knock at the Door!",5:"Number 5 — Man Alive!",6:"Number 6 — Tom Mix!",
  7:"Number 7 — Lucky Seven!",8:"Number 8 — One Fat Lady!",9:"Number 9 — Doctor's Orders!",
  10:"Number 10 — Minister's Den!",11:"Number 11 — Legs Eleven!",12:"Number 12 — One Dozen!",
  13:"Number 13 — Unlucky for Some!",14:"Number 14 — Valentine's Day!",15:"Number 15 — Young and Keen!",
  16:"Number 16 — Sweet Sixteen!",17:"Number 17 — Dancing Queen!",18:"Number 18 — Coming of Age!",
  19:"Number 19 — Goodbye Teens!",20:"Number 20 — One Score!",21:"Number 21 — Key of the Door!",
  22:"Number 22 — Two Little Ducks!",23:"Number 23 — The Lord is My Shepherd!",24:"Number 24 — Two Dozen!",
  25:"Number 25 — Duck and Dive!",26:"Number 26 — Half a Crown!",27:"Number 27 — Gateway to Heaven!",
  28:"Number 28 — Over Weight!",29:"Number 29 — Rise and Shine!",30:"Number 30 — Dirty Gertie!",
  31:"Number 31 — Get Up and Run!",32:"Number 32 — Buckle My Shoe!",33:"Number 33 — Dirty Knee!",
  34:"Number 34 — Ask for More!",35:"Number 35 — Jump and Jive!",36:"Number 36 — Three Dozen!",
  37:"Number 37 — More than Eleven!",38:"Number 38 — Christmas Cake!",39:"Number 39 — Steps!",
  40:"Number 40 — Life Begins!",41:"Number 41 — Time for Fun!",42:"Number 42 — Winnie the Pooh!",
  43:"Number 43 — Down on Your Knees!",44:"Number 44 — Droopy Drawers!",45:"Number 45 — Halfway There!",
  46:"Number 46 — Up to Tricks!",47:"Number 47 — Four and Seven!",48:"Number 48 — Four Dozen!",
  49:"Number 49 — PC!",50:"Number 50 — Half a Century!",51:"Number 51 — Tweak of the Thumb!",
  52:"Number 52 — Danny La Rue!",53:"Number 53 — Stuck in a Tree!",54:"Number 54 — Clean the Floor!",
  55:"Number 55 — Snakes Alive!",56:"Number 56 — Was She Worth It?",57:"Number 57 — Heinz Varieties!",
  58:"Number 58 — Make Them Wait!",59:"Number 59 — Brighton Line!",60:"Number 60 — Five Dozen!",
  61:"Number 61 — Baker's Bun!",62:"Number 62 — Turn the Screw!",63:"Number 63 — Tickle Me!",
  64:"Number 64 — Red Raw!",65:"Number 65 — Old Age Pension!",66:"Number 66 — Clickety Click!",
  67:"Number 67 — Made in Heaven!",68:"Number 68 — Saving Grace!",69:"Number 69 — Either Way Up!",
  70:"Number 70 — Three Score and Ten!",71:"Number 71 — Bang on the Drum!",72:"Number 72 — Six Dozen!",
  73:"Number 73 — Queen Bee!",74:"Number 74 — Hit the Floor!",75:"Number 75 — Strive and Strive!",
  76:"Number 76 — Trombones!",77:"Number 77 — Sunset Strip!",78:"Number 78 — Heaven's Gate!",
  79:"Number 79 — One More Time!",80:"Number 80 — Eight and Blank!",81:"Number 81 — Stop and Run!",
  82:"Number 82 — Straight On Through!",83:"Number 83 — Time for Tea!",84:"Number 84 — Seven Dozen!",
  85:"Number 85 — Staying Alive!",86:"Number 86 — Between the Sticks!",87:"Number 87 — Torquay in Devon!",
  88:"Number 88 — Two Fat Ladies!",89:"Number 89 — Nearly There!",90:"Number 90 — Top of the Shop!"
}

let audioUnlocked = false, audioEnabled = true

;["click","touchstart","keydown"].forEach(evt => {
  document.addEventListener(evt, function onFirst(){ unlockAudio(); document.removeEventListener(evt, onFirst) }, { once: true })
})

function toggleAudioCommentary(){
  unlockAudio(); audioEnabled = !audioEnabled
  const btn = document.getElementById("audioBtn"); if(btn) btn.innerText = audioEnabled ? "🔊 Audio: ON" : "🔇 Audio: OFF"
}

function unlockAudio(){
  if(audioUnlocked) return
  if(window.speechSynthesis){ const u = new SpeechSynthesisUtterance(""); u.volume = 0; window.speechSynthesis.speak(u); audioUnlocked = true }
}

function announceNumber(num){
  if(!window.speechSynthesis || !audioEnabled) return
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(NUMBER_CALLS[num] || "Number "+num)
  utter.rate = 0.85; utter.pitch = 1.0; utter.volume = 1.0
  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Google")||v.name.includes("Natural")||v.name.includes("Premium"))) || voices.find(v => v.lang.startsWith("en"))
    if(preferred) utter.voice = preferred
    window.speechSynthesis.speak(utter)
  }
  if(window.speechSynthesis.getVoices().length > 0) trySpeak()
  else window.speechSynthesis.onvoiceschanged = trySpeak
}

/* ── CALLED NUMBERS LIST ── */
function updateCalledNumbersList(){
  const countEl = document.getElementById("calledCount")
  const listEl  = document.getElementById("calledList")
  if(!countEl || !listEl) return
  const total = markedNumbers.length
  countEl.innerText = total + " / 90 called"
  // Prepend newest number as a pill (most recent first)
  if(total === 0){ listEl.innerHTML = '<span style="color:var(--text-dim);font-size:11px;">No numbers called yet</span>'; return }
  // Rebuild fully (simple, always accurate)
  listEl.innerHTML = ""
  ;[...markedNumbers].reverse().forEach((n, i) => {
    const pill = document.createElement("span")
    pill.style.cssText = [
      "display:inline-flex;align-items:center;justify-content:center;",
      "width:30px;height:30px;border-radius:50%;",
      "font-family:'Playfair Display',serif;font-weight:700;font-size:12px;",
      i === 0
        ? "background:linear-gradient(135deg,var(--gold2),var(--gold));color:#1a0800;box-shadow:0 0 8px var(--gold-glow);"
        : "background:var(--bg3);color:var(--text-dim);border:1px solid rgba(255,255,255,0.08);"
    ].join("")
    pill.innerText = n
    listEl.appendChild(pill)
  })
}
  const el = document.getElementById("currentNumber"); if(el) el.innerText = number
  markedNumbers.push(number); announceNumber(number)
  const b = document.getElementById("b"+number); if(b) b.classList.add("called")
  const t = document.getElementById("t"+number); if(t) t.classList.add("marked")
  document.querySelectorAll('[id$="c'+number+'"]').forEach(cell => { if(cell.id.startsWith("mt")) cell.classList.add("marked") })
  document.querySelectorAll('[id^="allcell_"]').forEach(cell => {
    const parts = cell.id.split("_"), cellVal = parseInt(parts[parts.length-1])
    if(cellVal === number) cell.classList.add("marked")
  })
  updateCalledNumbersList()
})

socket.on("resetGame", () => {
  if(countdownInterval){ clearInterval(countdownInterval); countdownInterval=null }
  claimedPrizes={}; globalClaimed={}; activePrizeKeys=null; playerWinnersStore=[]
  gridSelectedTickets=[]
  const bar=document.getElementById("floatingBookBar"); if(bar) bar.style.display="none"
  ;['playerWinnersList','playerWinnersListCd'].forEach(id=>{const e=document.getElementById(id);if(e)e.innerHTML=''})
  ;['winnersSection','winnersSectionCd'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none'})
  totalTickets=0; bookedTickets={}; onHoldTickets={}
  selectedTickets=[]; myHeldTickets=[]; myBookedTickets=[]
  markedNumbers=[]; ticketSheets=[]; previewTicketNum=null; startTime=null
  const el = document.getElementById("currentNumber"); if(el) el.innerText="-"
  const cc = document.getElementById("calledCount"); if(cc) cc.innerText = "0 / 90 called"
  const cl = document.getElementById("calledList"); if(cl) cl.innerHTML = ""
  showScreen("waitScreen"); createBoard()
})

const PRIZES = [
  { key:"earlyFive",    label:"🚀 Early Five",       desc:"First 5 numbers marked on ticket" },
  { key:"earlySeven",   label:"7️⃣ Early Seven",      desc:"First 7 numbers marked on ticket" },
  { key:"topLine",      label:"🏆 Top Line",          desc:"All numbers in top row" },
  { key:"middleLine",   label:"🥈 Middle Line",       desc:"All numbers in middle row" },
  { key:"bottomLine",   label:"🥉 Bottom Line",       desc:"All numbers in bottom row" },
  { key:"corners",      label:"🔲 Four Corners",      desc:"First & last of top and bottom rows" },
  { key:"star",         label:"⭐ Star",               desc:"Four corners + centre number" },
  { key:"bullseye",     label:"🎯 Bullseye",           desc:"Centre number of the ticket" },
  { key:"leftEdge",     label:"⬅️ Left Edge",          desc:"First number of each row" },
  { key:"rightEdge",    label:"➡️ Right Edge",         desc:"Last number of each row" },
  { key:"firstAndLast", label:"↔️ First & Last",       desc:"First & last of all 3 rows" },
  { key:"anyTwoLines",  label:"✌️ Any Two Lines",      desc:"Any 2 complete rows" },
  { key:"fullHouse",    label:"🎉 Full House",          desc:"All 15 numbers on the ticket" },
  { key:"secondHouse",  label:"🥇 Second Full House",  desc:"Second player to get Full House" },
  { key:"thirdHouse",   label:"🏅 Third Full House",   desc:"Third player to get Full House" }
]

let claimedPrizes = {}, globalClaimed = {}, activePrizeKeys = null
function checkWinners(){ /* server-side */ }

function showWinBanner(prizeLabel, prizeDesc, ticketNum, playerName){
  const old = document.getElementById("winBanner"); if(old) old.remove()
  const banner = document.createElement("div"); banner.id = "winBanner"
  banner.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg,#1a237e,#283593);border:2px solid #ffcc80;border-radius:20px;padding:32px 48px;text-align:center;z-index:99999;box-shadow:0 8px 40px rgba(0,0,0,0.7);max-width:90vw;transition:opacity 0.4s;"
  banner.innerHTML = '<div style="font-size:52px;margin-bottom:8px;">🎊</div>'
    +'<div style="font-size:24px;font-weight:700;color:#ffcc80;margin-bottom:4px;">'+prizeLabel+'</div>'
    +'<div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:12px;">'+prizeDesc+'</div>'
    +'<div style="font-size:15px;color:#fff;margin-bottom:2px;">Ticket #'+ticketNum+'</div>'
    +'<div style="font-size:20px;font-weight:700;color:#a5d6a7;">'+playerName+'</div>'
  document.body.appendChild(banner)
  if(!document.getElementById("winBannerStyle")){
    const s = document.createElement("style"); s.id="winBannerStyle"
    s.innerText = "@keyframes popIn{from{transform:translate(-50%,-50%) scale(0.4);opacity:0}to{transform:translate(-50%,-50%) scale(1);opacity:1}}"
    document.head.appendChild(s)
  }
  banner.style.animation = "popIn 0.4s ease"
  setTimeout(() => { banner.style.opacity="0"; setTimeout(()=>banner.remove(),400) }, 2500)
}

socket.on("activePrizesUpdated", (prizes) => { activePrizeKeys = prizes && prizes.length > 0 ? prizes : null })

socket.on("existingClaims", (claims) => {
  const prizeKeys = ["earlyFive","earlySeven","topLine","middleLine","bottomLine",
    "corners","star","bullseye","leftEdge","rightEdge","firstAndLast",
    "anyTwoLines","fullHouse","secondHouse","thirdHouse"]
  prizeKeys.forEach(key => {
    const data = claims[key]; if(!data) return
    const prize = PRIZES.find(p => p.key === key); if(!prize) return
    // Support both old (single object) and new (array) formats
    const winners = Array.isArray(data) ? data : [data]
    winners.forEach(w => {
      if(!w || !w.playerName) return
      addToWinnersList(prize.label, key, w.playerName, w.ticketNum)
    })
  })
})

socket.on("gameOver", () => { showGameOverBanner() })

function showGameOverBanner(){
  const old = document.getElementById("gameOverBanner"); if(old) return
  const banner = document.createElement("div"); banner.id = "gameOverBanner"
  banner.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg,#4a148c,#6a1b9a);border:2px solid #ffcc80;border-radius:20px;padding:36px 52px;text-align:center;z-index:99999;box-shadow:0 8px 40px rgba(0,0,0,0.8);max-width:90vw;"
  banner.innerHTML = '<div style="font-size:56px;margin-bottom:8px;">🎉</div><div style="font-size:28px;font-weight:700;color:#ffcc80;margin-bottom:8px;">Game Over!</div><div style="font-size:15px;color:rgba(255,255,255,0.7);">All prizes have been claimed!</div>'
  const btn = document.createElement("button"); btn.innerText = "✓ Close"
  btn.style.cssText = "padding:10px 28px;font-size:15px;background:#ffcc80;color:#4a148c;border:none;border-radius:10px;cursor:pointer;font-weight:700;margin-top:20px;"
  btn.onclick = () => banner.remove(); banner.appendChild(btn); document.body.appendChild(banner)
  if(!document.getElementById("winBannerStyle")){
    const s = document.createElement("style"); s.id="winBannerStyle"
    s.innerText = "@keyframes popIn{from{transform:translate(-50%,-50%) scale(0.4);opacity:0}to{transform:translate(-50%,-50%) scale(1);opacity:1}}"
    document.head.appendChild(s)
  }
  banner.style.animation = "popIn 0.4s ease"
}

socket.on("prizeClaimed", ({ ticketNum, playerName, prize, prizeKey }) => {
  ticketNum = parseInt(ticketNum)
  if(prizeKey) globalClaimed[prizeKey] = true
  addToWinnersList(prize, prizeKey, playerName, ticketNum)
  if(myBookedTickets.includes(ticketNum)){
    const prizeObj = PRIZES.find(p => p.label === prize)
    showWinBanner(prize, prizeObj ? prizeObj.desc : "", ticketNum, playerName)
  } else {
    showToast("🎊 "+playerName+" won "+prize+" on Ticket #"+ticketNum+"!")
  }
})

createBoard()
