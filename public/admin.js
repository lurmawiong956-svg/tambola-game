/* ── LOGIN ── */
function doLogin(){
  const user = document.getElementById("loginUser").value.trim()
  const pass = document.getElementById("loginPass").value
  const err  = document.getElementById("loginError")

  if(user === "warbah13" && pass === "Lur@12345"){
    document.getElementById("loginScreen").style.display = "none"
    document.getElementById("adminApp").style.display    = "block"
    err.innerText = ""
  } else {
    err.innerText = "❌ Invalid username or password"
    document.getElementById("loginPass").value = ""
  }
}

// Allow Enter key to submit login
document.addEventListener("DOMContentLoaded", () => {
  ["loginUser","loginPass"].forEach(id => {
    const el = document.getElementById(id)
    if(el) el.addEventListener("keydown", e => { if(e.key==="Enter") doLogin() })
  })
})

const socket = io()

let numbers           = []
let calledNumbers     = []
let pendingHolds      = {}
let confirmedBookings = {}
let winnersList = []  // { prize, playerName, ticketNum }
let autoTimer         = null
let autoPaused        = false
let callIntervalSec   = 10

for(let i = 1; i <= 90; i++) numbers.push(i)

/* ── PRIZE LIST ── */
const ALL_PRIZES = [
  { key:"earlyFive",    label:"🚀 Early Five"        },
  { key:"earlySeven",   label:"7️⃣ Early Seven"       },
  { key:"topLine",      label:"🏆 Top Line"           },
  { key:"middleLine",   label:"🥈 Middle Line"        },
  { key:"bottomLine",   label:"🥉 Bottom Line"        },
  { key:"corners",      label:"🔲 Four Corners"       },
  { key:"star",         label:"⭐ Star"               },
  { key:"bullseye",     label:"🎯 Bullseye"           },
  { key:"leftEdge",     label:"⬅️ Left Edge"          },
  { key:"rightEdge",    label:"➡️ Right Edge"         },
  { key:"firstAndLast", label:"↔️ First & Last"       },
  { key:"anyTwoLines",  label:"✌️ Any Two Lines"      },
  { key:"fullHouse",    label:"🎉 Full House"          },
  { key:"secondHouse",  label:"🥇 Second Full House"  },
  { key:"thirdHouse",   label:"🏅 Third Full House"   }
]

/* ── PRIZE CHECKBOXES (pre-game setup) ── */
function renderPrizeCheckboxes(){
  const container = document.getElementById("prizeCheckboxes")
  if(!container) return
  container.innerHTML = ""
  ALL_PRIZES.forEach(p => {
    const label = document.createElement("label")
    label.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;padding:7px 10px;background:rgba(255,255,255,0.05);border-radius:8px;border:1px solid rgba(255,255,255,0.08);font-size:13px;color:#fff;"
    const cb = document.createElement("input")
    cb.type = "checkbox"; cb.id = "prize_"+p.key; cb.checked = true
    cb.style.cssText = "width:16px;height:16px;cursor:pointer;accent-color:#ffcc80;"
    label.appendChild(cb)
    label.appendChild(document.createTextNode(p.label))
    container.appendChild(label)
  })
}

function selectAllPrizes(){ ALL_PRIZES.forEach(p => { const cb = document.getElementById("prize_"+p.key); if(cb) cb.checked = true }) }
function clearAllPrizes(){  ALL_PRIZES.forEach(p => { const cb = document.getElementById("prize_"+p.key); if(cb) cb.checked = false }) }
function getActivePrizes(){
  return ALL_PRIZES.filter(p => { const cb = document.getElementById("prize_"+p.key); return cb && cb.checked }).map(p => p.key)
}

/* ── GAME PRIZE TOGGLES (live during game) ── */
function renderGamePrizeToggles(activePrizes){
  const container = document.getElementById("gamePrizeToggles")
  if(!container) return
  container.innerHTML = ""
  ALL_PRIZES.forEach(p => {
    const isOn = activePrizes ? activePrizes.includes(p.key) : true
    const row  = document.createElement("div")
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;"
      + "background:rgba(255,255,255,0.05);border-radius:8px;border:1px solid rgba(255,255,255,0.08);"
    row.innerHTML =
      '<span style="font-size:13px;color:#fff;font-weight:500;">'+p.label+'</span>' +
      '<div id="gtbtn_'+p.key+'" onclick="toggleGamePrize(\''+p.key+'\')" style="width:42px;height:22px;border-radius:11px;cursor:pointer;transition:all 0.2s;background:'+(isOn?'#43a047':'rgba(255,255,255,0.15)')+';position:relative;">' +
        '<div id="gtdot_'+p.key+'" style="position:absolute;top:3px;'+(isOn?'right':'left')+':3px;width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;"></div>' +
      '</div>'
    container.appendChild(row)
  })
}

function toggleGamePrize(key){
  const btn = document.getElementById("gtbtn_"+key)
  const dot = document.getElementById("gtdot_"+key)
  if(!btn) return
  const isOn = btn.getAttribute("data-on") === "true"
  const newOn = !isOn
  btn.setAttribute("data-on", newOn ? "true" : "false")
  btn.style.background = newOn ? "#43a047" : "rgba(255,255,255,0.15)"
  if(dot){ dot.style.right = newOn ? "3px" : ""; dot.style.left = newOn ? "" : "3px" }
  sendActivePrizesUpdate()
}

function toggleAllGamePrizes(state){
  ALL_PRIZES.forEach(p => {
    const btn = document.getElementById("gtbtn_"+p.key)
    const dot = document.getElementById("gtdot_"+p.key)
    if(!btn) return
    btn.setAttribute("data-on", state ? "true" : "false")
    btn.style.background = state ? "#43a047" : "rgba(255,255,255,0.15)"
    if(dot){ dot.style.right = state ? "3px" : ""; dot.style.left = state ? "" : "3px" }
  })
  sendActivePrizesUpdate()
}

function sendActivePrizesUpdate(){
  const active = ALL_PRIZES.filter(p => {
    const btn = document.getElementById("gtbtn_"+p.key)
    return btn && btn.getAttribute("data-on") === "true"
  }).map(p => p.key)
  console.log("Sending active prizes:", active)
  socket.emit("updateActivePrizes", active)
}

/* ── SET READY ── */
function setReady(){
  const errorEl = document.getElementById("setupError")
  let count = parseInt(document.getElementById("ticketCount").value)
  if(!count || count < 6 || count > 1000){ errorEl.innerText = "Tickets must be between 6 and 1000."; return }
  if(count % 6 !== 0){ count = Math.floor(count/6)*6; errorEl.innerText = "Rounded to "+count+" tickets (must be multiple of 6)." }
  else { errorEl.innerText = "" }

  socket.emit("setTicketCount", { count })

  document.getElementById("setupSection").style.display = "none"
  document.getElementById("gameSection").style.display  = "block"
  document.getElementById("timingSetup").style.display  = "block"
  document.getElementById("gameControls").style.display = "none"
  document.getElementById("resetBtnPre").style.display  = "block"
  document.getElementById("activePrizeSection").style.display = "none"
  document.getElementById("gameInfo").innerText = count + " tickets sent — set timing and start game"
  createBoard()
  renderPrizeCheckboxes()
}

/* ── START GAME ── */
function startGame(){
  let count = parseInt(document.getElementById("ticketCount").value)
  if(count % 6 !== 0) count = Math.floor(count/6)*6
  callIntervalSec = parseInt(document.getElementById("callInterval").value) || 10
  const delay     = parseInt(document.getElementById("startDelay").value)   || 30
  const activePrizes = getActivePrizes()

  socket.emit("startGame", { startDelay: delay, callInterval: callIntervalSec, activePrizes })

  document.getElementById("timingSetup").style.display        = "none"
  document.getElementById("resetBtnPre").style.display        = "none"
  document.getElementById("activePrizeSection").style.display = "block"
  document.getElementById("gameInfo").innerText = count+" tickets  ·  countdown "+delay+"s  ·  auto-call every "+callIntervalSec+"s"
  document.getElementById("autoStatus").innerText = "⏳ Auto-call starts after countdown ("+delay+"s)..."

  renderGamePrizeToggles(activePrizes)
  // Sync active prizes to server immediately (no delay needed since activePrizes already set in startGame)
  socket.emit("updateActivePrizes", activePrizes)

  setTimeout(() => {
    document.getElementById("gameControls").style.display = "block"
    // Re-send active prizes when game actually goes live (after countdown)
    sendActivePrizesUpdate()
    startAutoCall()
  }, delay * 1000)
}

/* ── AUTO CALL ── */
function startAutoCall(){
  if(autoTimer) clearInterval(autoTimer)
  autoPaused = false
  document.getElementById("autoBtn").innerText = "⏸ Pause"
  updateAutoStatus()
  autoTimer = setInterval(() => { if(!autoPaused) callNumber() }, callIntervalSec * 1000)
}

function toggleAuto(){
  autoPaused = !autoPaused
  document.getElementById("autoBtn").innerText = autoPaused ? "▶ Resume" : "⏸ Pause"
  updateAutoStatus()
}

function updateAutoStatus(){
  const el = document.getElementById("autoStatus")
  if(el) el.innerText = autoPaused ? "⏸ Auto-call paused" : "▶ Auto-calling every "+callIntervalSec+"s"
}

function callNow(){ callNumber() }

/* ── CALL NUMBER ── */
function callNumber(){
  if(numbers.length === 0){ clearInterval(autoTimer); document.getElementById("autoStatus").innerText = "🎉 All 90 numbers called!"; return }
  const idx = Math.floor(Math.random() * numbers.length)
  const num = numbers.splice(idx, 1)[0]
  calledNumbers.push(num)
  document.getElementById("currentNumber").innerText = num
  const box = document.getElementById("b"+num); if(box) box.classList.add("called")
  // Always send current active prizes with each number call
  const activePrizes = getActivePrizesFromToggles()
  socket.emit("callNumber", { number: num, activePrizes })
}

function getActivePrizesFromToggles(){
  // Read from live toggle buttons (data-on must be explicitly "true")
  const toggleBtns = ALL_PRIZES.filter(p => {
    const btn = document.getElementById("gtbtn_"+p.key)
    return btn && btn.getAttribute("data-on") === "true"
  }).map(p => p.key)

  if(toggleBtns.length > 0) return toggleBtns

  // Fall back to setup checkboxes
  return ALL_PRIZES.filter(p => {
    const cb = document.getElementById("prize_"+p.key)
    return cb && cb.checked
  }).map(p => p.key)
}

/* ── RESET ── */
function resetGame(){
  if(!confirm("Reset the game?")) return
  clearInterval(autoTimer); autoTimer = null; autoPaused = false
  numbers = []; for(let i = 1; i <= 90; i++) numbers.push(i)
  calledNumbers = []; pendingHolds = {}; confirmedBookings = {}
  document.getElementById("currentNumber").innerText    = "-"
  document.getElementById("gameSection").style.display  = "none"
  document.getElementById("setupSection").style.display = "block"
  document.getElementById("setupError").innerText       = ""
  document.getElementById("autoStatus").innerText       = ""
  document.getElementById("gameControls").style.display = "none"
  document.getElementById("timingSetup").style.display  = "none"
  document.getElementById("activePrizeSection").style.display = "none"
  winnersList = []
  const prizeLog = document.getElementById("prizeLog"); if(prizeLog) prizeLog.innerHTML = ""
  const noPrizes = document.getElementById("noPrizes"); if(noPrizes) noPrizes.style.display = "block"
  renderHoldTable(); renderBookedTable()
  socket.emit("resetGame")
}

/* ── BOARD ── */
function createBoard(){
  const board = document.getElementById("board")
  if(!board) return
  board.innerHTML = ""
  for(let i = 1; i <= 90; i++){
    const box = document.createElement("div")
    box.className = "number"; box.id = "b"+i; box.innerText = i
    board.appendChild(box)
  }
}

/* ── CONFIRM / RELEASE ── */
function confirmHold(ticketNum){ socket.emit("confirmHold", ticketNum); delete pendingHolds[ticketNum]; renderHoldTable() }
function releaseHold(ticketNum){
  if(!confirm("Release hold on Ticket #"+ticketNum+"?")) return
  socket.emit("releaseHold", ticketNum); delete pendingHolds[ticketNum]; renderHoldTable()
}

/* ── RENDER HOLD TABLE ── */
function renderHoldTable(){
  const keys=Object.keys(pendingHolds), badge=document.getElementById("holdBadge")
  const noEl=document.getElementById("noHolds"), table=document.getElementById("holdTable"), tbody=document.getElementById("holdTableBody")
  if(!tbody) return
  if(keys.length===0){ badge.style.display="none"; noEl.style.display="block"; table.style.display="none"; return }
  badge.innerText=keys.length; badge.style.display="inline-flex"
  noEl.style.display="none"; table.style.display="table"; tbody.innerHTML=""
  keys.forEach(num => {
    const {playerName}=pendingHolds[num], sheet=Math.floor((num-1)/6)+1
    const tr=document.createElement("tr")
    tr.innerHTML='<td style="color:#ffcc80;font-weight:700;">#'+num+'</td>'+
      '<td style="color:rgba(255,255,255,0.6)">Sheet '+sheet+'</td>'+
      '<td style="color:#fff;">'+playerName+'</td>'+
      '<td><button class="confirmBtn" onclick="confirmHold('+num+')">✅ Confirm</button>'+
      '<button class="releaseBtn" onclick="releaseHold('+num+')">❌ Release</button></td>'
    tbody.appendChild(tr)
  })
}

/* ── RENDER BOOKED TABLE ── */
function renderBookedTable(){
  const keys=Object.keys(confirmedBookings), count=document.getElementById("bookedCount")
  const noEl=document.getElementById("noBookings"), table=document.getElementById("bookedTable"), tbody=document.getElementById("bookedTableBody")
  if(!tbody) return
  count.innerText=keys.length+" ticket"+(keys.length!==1?"s":"")
  if(keys.length===0){ noEl.style.display="block"; table.style.display="none"; return }
  noEl.style.display="none"; table.style.display="table"; tbody.innerHTML=""
  keys.sort((a,b)=>parseInt(a)-parseInt(b)).forEach(num => {
    const name=confirmedBookings[num], sheet=Math.floor((num-1)/6)+1
    const tr=document.createElement("tr")
    tr.innerHTML='<td style="color:#ffcc80;font-weight:700;">#'+num+'</td>'+
      '<td style="color:rgba(255,255,255,0.6)">Sheet '+sheet+'</td>'+
      '<td style="color:#a5d6a7;font-weight:600;">'+name+'</td>'
    tbody.appendChild(tr)
  })
}

/* ── NOTIFY ── */
function notifyAdmin(held){
  try {
    const ctx=new(window.AudioContext||window.webkitAudioContext)(), osc=ctx.createOscillator(), gain=ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value=880
    gain.gain.setValueAtTime(0.3,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.4)
  } catch(e){}
  const s=document.getElementById("holdSection")
  if(s){ s.style.transition="background 0.2s"; s.style.background="rgba(255,165,0,0.3)"; setTimeout(()=>{s.style.background="rgba(255,165,0,0.08)"},600) }
  if(Notification&&Notification.permission==="granted")
    new Notification("🎱 Tambola Booking",{body:held.map(h=>h.playerName+" #"+h.ticketNum).join(", ")})
  else if(Notification&&Notification.permission!=="denied") Notification.requestPermission()
}

/* ── SOCKET EVENTS ── */
socket.on("holdRequest", ({held}) => { held.forEach(({ticketNum,playerName})=>{pendingHolds[ticketNum]={playerName}}); renderHoldTable(); notifyAdmin(held) })
socket.on("ticketBooked", ({ticketNum,playerName}) => { delete pendingHolds[ticketNum]; confirmedBookings[ticketNum]=playerName; renderHoldTable(); renderBookedTable() })
socket.on("holdRemoved", (ticketNum) => { delete pendingHolds[ticketNum]; renderHoldTable() })
socket.on("numberCalled", (number) => {
  const num = typeof number === "object" ? number.number : number
  document.getElementById("currentNumber").innerText = num
  const box = document.getElementById("b"+num); if(box) box.classList.add("called")
})
socket.on("gameStarted", ({onHoldTickets,bookedTickets}) => {
  pendingHolds={}; confirmedBookings={}
  if(onHoldTickets) Object.entries(onHoldTickets).forEach(([n,d])=>{pendingHolds[n]={playerName:d.playerName}})
  if(bookedTickets) Object.entries(bookedTickets).forEach(([n,name])=>{confirmedBookings[n]=name})
  renderHoldTable(); renderBookedTable()
})
socket.on("prizeClaimed", ({ticketNum,playerName,prize}) => {
  // Store in winners list
  winnersList.push({ prize, playerName, ticketNum })

  const noEl=document.getElementById("noPrizes"), log=document.getElementById("prizeLog")
  if(!log) return
  if(noEl) noEl.style.display="none"

  const sheet = Math.floor((ticketNum-1)/6)+1
  const row=document.createElement("div")
  row.style.cssText="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;margin-bottom:8px;background:rgba(255,255,255,0.06);border-radius:10px;border:1px solid rgba(255,215,0,0.15);flex-wrap:wrap;gap:6px;"
  row.innerHTML=
    '<span style="font-size:15px;font-weight:700;color:#ffcc80;min-width:160px;">'+prize+'</span>'+
    '<span style="font-size:14px;color:#a5d6a7;font-weight:600;">'+playerName+'</span>'+
    '<span style="font-size:13px;color:rgba(255,255,255,0.5);">Ticket #'+ticketNum+' · Sheet '+sheet+'</span>'
  log.insertBefore(row,log.firstChild)

  // Flash and sound
  const sec=document.getElementById("prizeSection")
  if(sec){ sec.style.transition="background 0.2s"; sec.style.background="rgba(255,215,0,0.25)"; setTimeout(()=>{sec.style.background="rgba(67,160,71,0.07)"},700) }
  try {
    const ctx=new(window.AudioContext||window.webkitAudioContext)(), osc=ctx.createOscillator(), gain=ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value=660; osc.type="sine"
    gain.gain.setValueAtTime(0.4,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.6)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.6)
  } catch(e){}
})

/* ── DOWNLOAD WINNERS ── */
function downloadWinners(){
  if(winnersList.length===0){ alert("No winners yet"); return }
  let text = "🎱 TAMBOLA WINNERS\n" + "=".repeat(40) + "\n\n"
  winnersList.forEach((w,i) => {
    text += (i+1)+". "+w.prize+"\n"
          + "   Player: "+w.playerName+"\n"
          + "   Ticket: #"+w.ticketNum+" (Sheet "+(Math.floor((w.ticketNum-1)/6)+1)+")\n\n"
  })
  const blob = new Blob([text], {type:"text/plain"})
  const a    = document.createElement("a")
  a.href     = URL.createObjectURL(blob)
  a.download = "tambola-winners.txt"
  a.click()
}

/* ── SHARE WINNERS (WhatsApp) ── */
function shareWinners(){
  if(winnersList.length===0){ alert("No winners yet"); return }
  let msg = "🎱 *Tambola Winners* 🎉\n\n"
  winnersList.forEach((w,i) => {
    msg += (i+1)+". "+w.prize+" — *"+w.playerName+"* (Ticket #"+w.ticketNum+")\n"
  })
  window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank")
}

/* ── GAME OVER ── */
socket.on("gameOver", () => {
  clearInterval(autoTimer); autoTimer = null
  document.getElementById("autoStatus").innerText = "🎉 All prizes claimed — Game Over!"

  const banner = document.createElement("div")
  banner.style.cssText =
    "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
    "background:linear-gradient(135deg,#4a148c,#6a1b9a);" +
    "border:2px solid #ffcc80;border-radius:20px;padding:36px 52px;" +
    "text-align:center;z-index:99999;box-shadow:0 8px 40px rgba(0,0,0,0.8);max-width:90vw;"
  banner.innerHTML =
    '<div style="font-size:56px;margin-bottom:8px;">🎉</div>' +
    '<div style="font-size:28px;font-weight:700;color:#ffcc80;margin-bottom:8px;">Game Over!</div>' +
    '<div style="font-size:15px;color:rgba(255,255,255,0.7);margin-bottom:20px;">All prizes have been claimed!</div>' +
    '<button onclick="this.parentElement.remove();downloadWinners()" style="padding:10px 24px;font-size:14px;background:#ffcc80;color:#4a148c;border:none;border-radius:10px;cursor:pointer;font-weight:700;margin:4px;">⬇️ Download Winners</button>' +
    '<button onclick="this.parentElement.remove();shareWinners()" style="padding:10px 24px;font-size:14px;background:#25d366;color:white;border:none;border-radius:10px;cursor:pointer;font-weight:700;margin:4px;">📤 Share Winners</button>' +
    '<button onclick="this.parentElement.remove()" style="padding:10px 24px;font-size:14px;background:rgba(255,255,255,0.15);color:white;border:none;border-radius:10px;cursor:pointer;margin:4px;">✖ Close</button>'
  document.body.appendChild(banner)

  // Celebratory sound
  try {
    const ctx = new(window.AudioContext||window.webkitAudioContext)()
    const notes = [523,659,784,1047]
    notes.forEach((freq,i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i*0.15)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.15 + 0.3)
      osc.start(ctx.currentTime + i*0.15)
      osc.stop(ctx.currentTime + i*0.15 + 0.3)
    })
  } catch(e){}
})