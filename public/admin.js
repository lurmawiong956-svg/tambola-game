/* ── LOGIN ── */
let pendingRestore = null
let isLoggedIn     = false

function doLogin(){
  const user = document.getElementById("loginUser").value.trim()
  const pass = document.getElementById("loginPass").value
  const err  = document.getElementById("loginError")

  if(user === "warbah13" && pass === "Lur@12345"){
    document.getElementById("loginScreen").style.display = "none"
    document.getElementById("adminApp").style.display    = "block"
    isLoggedIn = true
    err.innerText = ""
    if(pendingRestore){ restoreAdminState(pendingRestore); pendingRestore = null }
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

/* ── NUMBER COMMENTARY ── */
const NUMBER_CALLS = {
  1:"Kelly's Eye",2:"One Little Duck",3:"Cup of Tea",4:"Knock at the Door",
  5:"Man Alive",6:"Tom Mix",7:"Lucky Seven",8:"One Fat Lady",9:"Doctor's Orders",
  10:"Prime Minister's Den",11:"Legs Eleven",12:"One Dozen",13:"Unlucky for Some",
  14:"Valentine's Day",15:"Young and Keen",16:"Sweet Sixteen",17:"Dancing Queen",
  18:"Coming of Age",19:"Goodbye Teens",20:"One Score",21:"Key of the Door",
  22:"Two Little Ducks",23:"The Lord is My Shepherd",24:"Two Dozen",25:"Duck and Dive",
  26:"Half a Crown",27:"Gateway to Heaven",28:"Over Weight",29:"Rise and Shine",
  30:"Dirty Gertie",31:"Get Up and Run",32:"Buckle My Shoe",33:"Dirty Knee",
  34:"Ask for More",35:"Jump and Jive",36:"Three Dozen",37:"More than Eleven",
  38:"Christmas Cake",39:"Steps",40:"Life Begins",41:"Time for Fun",
  42:"Winnie the Pooh",43:"Down on Your Knees",44:"Droopy Drawers",45:"Halfway There",
  46:"Up to Tricks",47:"Four and Seven",48:"Four Dozen",49:"PC",50:"Half a Century",
  51:"Tweak of the Thumb",52:"Danny La Rue",53:"Stuck in a Tree",54:"Clean the Floor",
  55:"Snakes Alive",56:"Was She Worth It",57:"Heinz Varieties",58:"Make Them Wait",
  59:"Brighton Line",60:"Five Dozen",61:"Baker's Bun",62:"Turn the Screw",
  63:"Tickle Me",64:"Red Raw",65:"Old Age Pension",66:"Clickety Click",
  67:"Made in Heaven",68:"Saving Grace",69:"Either Way Up",70:"Three Score and Ten",
  71:"Bang on the Drum",72:"Six Dozen",73:"Queen Bee",74:"Hit the Floor",
  75:"Strive and Strive",76:"Trombones",77:"Sunset Strip",78:"Heaven's Gate",
  79:"One More Time",80:"Eight and Blank",81:"Stop and Run",82:"Straight On Through",
  83:"Time for Tea",84:"Seven Dozen",85:"Staying Alive",86:"Between the Sticks",
  87:"Torquay in Devon",88:"Two Fat Ladies",89:"Nearly There",90:"Top of the Shop"
}

function announceNumber(num){
  if(!window.speechSynthesis) return
  const text = "Number " + num + "... " + (NUMBER_CALLS[num] || "")
  const utter = new SpeechSynthesisUtterance(text)
  utter.rate = 0.85; utter.pitch = 1.0; utter.volume = 1.0
  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Google")||v.name.includes("Natural")||v.name.includes("Premium")))
    || voices.find(v => v.lang.startsWith("en"))
  if(preferred) utter.voice = preferred
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
}

/* ── CALL NUMBER ── */
function callNumber(){
  if(numbers.length === 0){ clearInterval(autoTimer); document.getElementById("autoStatus").innerText = "🎉 All 90 numbers called!"; return }
  const idx = Math.floor(Math.random() * numbers.length)
  const num = numbers.splice(idx, 1)[0]
  calledNumbers.push(num)
  document.getElementById("currentNumber").innerText = num
  const box = document.getElementById("b"+num); if(box) box.classList.add("called")
  announceNumber(num)
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
socket.on("gameStarted", (data) => {
  if(!isLoggedIn){
    pendingRestore = data  // save for after login
    return
  }
  restoreAdminState(data)
})

function restoreAdminState(data){
  const { onHoldTickets, bookedTickets, totalTickets, calledNumbers, startTime, activePrizes: ap } = data
  pendingHolds={}; confirmedBookings={}
  if(onHoldTickets) Object.entries(onHoldTickets).forEach(([n,d])=>{pendingHolds[n]={playerName:d.playerName}})
  if(bookedTickets) Object.entries(bookedTickets).forEach(([n,name])=>{confirmedBookings[n]=name})

  if(totalTickets > 0){
    document.getElementById("setupSection").style.display = "none"
    document.getElementById("gameSection").style.display  = "block"
    document.getElementById("ticketCount").value          = totalTickets

    const gameIsLive = calledNumbers && calledNumbers.length > 0

    if(gameIsLive){
      // Game is running — show controls, hide setup
      document.getElementById("timingSetup").style.display    = "none"
      document.getElementById("resetBtnPre").style.display    = "none"
      document.getElementById("gameControls").style.display   = "block"
      document.getElementById("activePrizeSection").style.display = (ap && ap.length) ? "block" : "none"
      document.getElementById("gameInfo").innerText = totalTickets + " tickets — game running"
      createBoard()
      calledNumbers.forEach(n => {
        const idx = numbers.indexOf(n); if(idx > -1) numbers.splice(idx, 1)
        const box = document.getElementById("b"+n); if(box) box.classList.add("called")
      })
      document.getElementById("currentNumber").innerText = calledNumbers[calledNumbers.length-1]
      if(ap && ap.length) renderGamePrizeToggles(ap)
      updateAutoStatus()
    } else {
      // Tickets ready but game not started yet — show timing setup
      document.getElementById("timingSetup").style.display  = "block"
      document.getElementById("resetBtnPre").style.display  = "block"
      document.getElementById("gameControls").style.display = "none"
      document.getElementById("activePrizeSection").style.display = "none"
      document.getElementById("gameInfo").innerText = totalTickets + " tickets sent — set timing and start game"
      createBoard()
      renderPrizeCheckboxes()
    }
  }
  renderHoldTable(); renderBookedTable()
}
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

/* ── RESTORE WINNERS ON RELOAD ── */
socket.on("existingClaims", (claims) => {
  Object.entries(claims).forEach(([key, data]) => {
    if(!data || !data.playerName) return
    // Only process base prize keys (not per-ticket keys like "5_fullHouse")
    const prizeKeys = ["earlyFive","earlySeven","topLine","middleLine","bottomLine",
      "corners","star","bullseye","leftEdge","rightEdge","firstAndLast",
      "anyTwoLines","fullHouse","secondHouse","thirdHouse"]
    if(!prizeKeys.includes(key)) return
    const prize = ALL_PRIZES.find(p => p.key === key)
    if(!prize) return
    winnersList.push({ prize: prize.label, playerName: data.playerName, ticketNum: data.ticketNum })
    const noEl = document.getElementById("noPrizes")
    const log  = document.getElementById("prizeLog")
    if(!log) return
    if(noEl) noEl.style.display = "none"
    const sheet = Math.floor((data.ticketNum-1)/6)+1
    const row = document.createElement("div")
    row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:10px 14px;margin-bottom:8px;background:rgba(255,255,255,0.06);border-radius:10px;border:1px solid rgba(255,215,0,0.15);flex-wrap:wrap;gap:6px;"
    row.innerHTML =
      '<span style="font-size:15px;font-weight:700;color:#ffcc80;min-width:160px;">'+prize.label+'</span>'+
      '<span style="font-size:14px;color:#a5d6a7;font-weight:600;">'+data.playerName+'</span>'+
      '<span style="font-size:13px;color:rgba(255,255,255,0.5);">Ticket #'+data.ticketNum+' · Sheet '+sheet+'</span>'
    log.appendChild(row)
  })
})

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
