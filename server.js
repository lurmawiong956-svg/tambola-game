const express = require("express")
const http    = require("http")
const { Server } = require("socket.io")

const app    = express()
const server = http.createServer(app)
const io     = new Server(server, { cors: { origin: "*" } })

// Serve static files from public/ or current directory
const path = require("path")
const fs = require("fs")
const publicDir = fs.existsSync(path.join(__dirname, "public")) 
  ? path.join(__dirname, "public") 
  : __dirname
app.use(express.static(publicDir))

/* ── TICKET GENERATION ── */
function shuffle(arr){
  for(let i = arr.length-1; i > 0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]]
  }
}

function sampleBinaryMatrix(rowSums, colSums){
  const R=rowSums.length, C=colSums.length
  for(let attempt=0; attempt<500; attempt++){
    let mat=Array.from({length:R},()=>new Array(C).fill(0))
    let rLeft=[...rowSums], cLeft=[...colSums], ok=true
    let colOrder=Array.from({length:C},(_,i)=>i); shuffle(colOrder)
    for(let c of colOrder){
      let need=cLeft[c], availRows=[]
      for(let r=0;r<R;r++) if(rLeft[r]>0) availRows.push(r)
      if(availRows.length<need){ok=false;break}
      let grouped=[],i=0
      availRows.sort((a,b)=>rLeft[b]-rLeft[a])
      while(i<availRows.length){
        let cap=rLeft[availRows[i]],g=[]
        while(i<availRows.length&&rLeft[availRows[i]]===cap){g.push(availRows[i]);i++}
        shuffle(g);grouped.push(...g)
      }
      grouped.slice(0,need).forEach(r=>{mat[r][c]=1;rLeft[r]--;cLeft[c]--})
    }
    if(ok&&rLeft.every(r=>r===0)&&cLeft.every(c=>c===0)) return mat
  }
  return null
}

function generateSheet(){
  const colRanges=[[1,9],[10,19],[20,29],[30,39],[40,49],[50,59],[60,69],[70,79],[80,90]]
  const colTotals=[9,10,10,10,10,10,10,10,11]
  const extraMat=sampleBinaryMatrix(Array(6).fill(6),colTotals.map(t=>t-6))
  if(!extraMat) return generateSheet()
  const colCounts=extraMat.map(row=>row.map(v=>1+v))
  let sheet=Array.from({length:6},()=>([[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]]))
  let pendingPerTicket=Array.from({length:6},()=>[])
  for(let c=0;c<9;c++){
    let [start,end]=colRanges[c], pool=[]
    for(let n=start;n<=end;n++) pool.push(n)
    shuffle(pool); let idx=0
    for(let t=0;t<6;t++){
      let count=colCounts[t][c]
      let nums=pool.slice(idx,idx+count).sort((a,b)=>a-b)
      idx+=count; pendingPerTicket[t].push({c,nums})
    }
  }
  for(let t=0;t<6;t++){
    let pending=pendingPerTicket[t]
    for(let attempt=0;attempt<500;attempt++){
      sheet[t]=[[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]]
      let rowAvail=[5,5,5],ok=true
      let order=[...pending];shuffle(order);order.sort((a,b)=>b.nums.length-a.nums.length)
      for(let {c,nums} of order){
        let availRows=[0,1,2].filter(r=>rowAvail[r]>0)
        if(availRows.length<nums.length){ok=false;break}
        let grouped=[],i=0
        availRows.sort((a,b)=>rowAvail[b]-rowAvail[a])
        while(i<availRows.length){
          let cap=rowAvail[availRows[i]],g=[]
          while(i<availRows.length&&rowAvail[availRows[i]]===cap){g.push(availRows[i]);i++}
          shuffle(g);grouped.push(...g)
        }
        grouped.slice(0,nums.length).sort((a,b)=>a-b).forEach((r,i)=>{sheet[t][r][c]=nums[i];rowAvail[r]--})
      }
      if(ok&&rowAvail.every(r=>r===0)) break
    }
  }
  return sheet
}

function generateAllSheets(totalTickets){
  const sheetsNeeded=Math.ceil(totalTickets/6), sheets=[]
  for(let s=0;s<sheetsNeeded;s++) sheets.push(generateSheet())
  return sheets
}

/* ── PRIZE DEFINITIONS ── */
const PRIZE_DEFS = [
  { key:"earlyFive",    label:"🚀 Early Five",       check:(t,m)=>{ let c=0; t.forEach(r=>r.forEach(n=>{if(n>0&&m.includes(n))c++})); return c>=5 }},
  { key:"earlySeven",   label:"7️⃣ Early Seven",      check:(t,m)=>{ let c=0; t.forEach(r=>r.forEach(n=>{if(n>0&&m.includes(n))c++})); return c>=7 }},
  { key:"topLine",      label:"🏆 Top Line",          check:(t,m)=>t[0].filter(n=>n>0).every(n=>m.includes(n))},
  { key:"middleLine",   label:"🥈 Middle Line",       check:(t,m)=>t[1].filter(n=>n>0).every(n=>m.includes(n))},
  { key:"bottomLine",   label:"🥉 Bottom Line",       check:(t,m)=>t[2].filter(n=>n>0).every(n=>m.includes(n))},
  { key:"corners",      label:"🔲 Four Corners",      check:(t,m)=>{
    const top=t[0].filter(n=>n>0),bot=t[2].filter(n=>n>0)
    return [top[0],top[top.length-1],bot[0],bot[bot.length-1]].every(n=>m.includes(n))
  }},
  { key:"star",         label:"⭐ Star",               check:(t,m)=>{
    const top=t[0].filter(n=>n>0),mid=t[1].filter(n=>n>0),bot=t[2].filter(n=>n>0)
    const centre=mid[Math.floor(mid.length/2)]
    return [top[0],top[top.length-1],centre,bot[0],bot[bot.length-1]].every(n=>m.includes(n))
  }},
  { key:"bullseye",     label:"🎯 Bullseye",           check:(t,m)=>{ const mid=t[1].filter(n=>n>0); return m.includes(mid[Math.floor(mid.length/2)]) }},
  { key:"leftEdge",     label:"⬅️ Left Edge",          check:(t,m)=>[0,1,2].every(r=>{ const n=t[r].find(v=>v>0); return n&&m.includes(n) })},
  { key:"rightEdge",    label:"➡️ Right Edge",         check:(t,m)=>[0,1,2].every(r=>{ const n=[...t[r]].reverse().find(v=>v>0); return n&&m.includes(n) })},
  { key:"firstAndLast", label:"↔️ First & Last",       check:(t,m)=>[0,1,2].every(r=>{ const row=t[r].filter(n=>n>0); return m.includes(row[0])&&m.includes(row[row.length-1]) })},
  { key:"anyTwoLines",  label:"✌️ Any Two Lines",      check:(t,m)=>{ let c=0; t.forEach(r=>{if(r.filter(n=>n>0).every(n=>m.includes(n)))c++}); return c>=2 }},
  { key:"fullHouse",    label:"🎉 Full House",          check:(t,m)=>t.every(r=>r.filter(n=>n>0).every(n=>m.includes(n)))},
  { key:"secondHouse",  label:"🥇 Second Full House",  check:(t,m)=>t.every(r=>r.filter(n=>n>0).every(n=>m.includes(n)))},
  { key:"thirdHouse",   label:"🏅 Third Full House",   check:(t,m)=>t.every(r=>r.filter(n=>n>0).every(n=>m.includes(n)))}
]
const MULTI_KEYS = ["fullHouse","secondHouse","thirdHouse"]

/* ── PRIZE CHECK ── */
function checkPrizes(){
  const marked = gameState.calledNumbers
  const booked = gameState.bookedTickets
  const sheets = gameState.sheets
  const active = gameState.activePrizes

  if(!marked.length || !Object.keys(booked).length) return

  const prizes = (active && active.length > 0) ? PRIZE_DEFS.filter(p => active.includes(p.key)) : PRIZE_DEFS

  // Separate full house prizes — handle them specially
  const normalPrizes = prizes.filter(p => !["fullHouse","secondHouse","thirdHouse"].includes(p.key))
  const doFullHouse  = prizes.some(p => p.key === "fullHouse")
  const doSecond     = prizes.some(p => p.key === "secondHouse")
  const doThird      = prizes.some(p => p.key === "thirdHouse")

  Object.entries(booked).forEach(([tNum, playerName]) => {
    const ticketNum = parseInt(tNum)
    const sheetIdx  = Math.floor((ticketNum-1)/6)
    const ticketIdx = (ticketNum-1)%6
    const ticket    = sheets[sheetIdx] && sheets[sheetIdx][ticketIdx]
    if(!ticket) return

    // ── Check normal prizes (one winner each globally) ──
    normalPrizes.forEach(prize => {
      if(gameState.globalClaimed[prize.key]) return  // already claimed globally
      const claimKey = ticketNum+"_"+prize.key
      if(gameState.globalClaimed[claimKey]) return   // this ticket already claimed it
      if(prize.check(ticket, marked)){
        gameState.globalClaimed[prize.key]  = { playerName, ticketNum }
        gameState.globalClaimed[claimKey]   = { playerName, ticketNum }
        console.log("✅", prize.label, "→", playerName, "Ticket #"+ticketNum)
        saveState()
        io.emit("prizeClaimed", { ticketNum, playerName, prize: prize.label, prizeKey: prize.key })
      }
    })

    // ── Check Full House (each ticket can only win ONE house prize) ──
    const ticketAlreadyWonHouse = gameState.globalClaimed[ticketNum+"_house"]
    if(!ticketAlreadyWonHouse){
      const isFullHouse = PRIZE_DEFS.find(p=>p.key==="fullHouse").check(ticket, marked)
      if(isFullHouse){
        // Determine which house prize this ticket gets
        const fhCount = gameState.globalClaimed["fullHouseCount"] || 0

        if(fhCount === 0 && doFullHouse && !gameState.globalClaimed["fullHouse"]){
          gameState.globalClaimed["fullHouse"] = { playerName, ticketNum }
          gameState.globalClaimed["fullHouseCount"] = 1
          gameState.globalClaimed[ticketNum+"_house"] = true
          console.log("✅ Full House →", playerName, "Ticket #"+ticketNum)
          io.emit("prizeClaimed", { ticketNum, playerName, prize: "🎉 Full House", prizeKey: "fullHouse" })
        } else if(fhCount === 1 && doSecond && !gameState.globalClaimed["secondHouse"]){
          gameState.globalClaimed["secondHouse"] = { playerName, ticketNum }
          gameState.globalClaimed["fullHouseCount"] = 2
          gameState.globalClaimed[ticketNum+"_house"] = true
          console.log("✅ Second Full House →", playerName, "Ticket #"+ticketNum)
          io.emit("prizeClaimed", { ticketNum, playerName, prize: "🥇 Second Full House", prizeKey: "secondHouse" })
        } else if(fhCount === 2 && doThird && !gameState.globalClaimed["thirdHouse"]){
          gameState.globalClaimed["thirdHouse"] = { playerName, ticketNum }
          gameState.globalClaimed["fullHouseCount"] = 3
          gameState.globalClaimed[ticketNum+"_house"] = true
          console.log("✅ Third Full House →", playerName, "Ticket #"+ticketNum)
          io.emit("prizeClaimed", { ticketNum, playerName, prize: "🏅 Third Full House", prizeKey: "thirdHouse" })
        }
      }
    }
  })

  // Check game over
  const allDone = prizes.every(p => {
    if(p.key==="fullHouse")   return gameState.globalClaimed["fullHouse"]
    if(p.key==="secondHouse") return gameState.globalClaimed["secondHouse"]
    if(p.key==="thirdHouse")  return gameState.globalClaimed["thirdHouse"]
    return gameState.globalClaimed[p.key]
  })
  if(allDone){
    console.log("🎉 GAME OVER")
    io.emit("gameOver")
  }
}

/* ── STATE PERSISTENCE ── */
const STATE_FILE = path.join(__dirname, "gamestate.json")

function saveState(){
  try {
    const toSave = {
      started:       gameState.started,
      totalTickets:  gameState.totalTickets,
      bookedTickets: gameState.bookedTickets,
      onHoldTickets: gameState.onHoldTickets,
      calledNumbers: gameState.calledNumbers,
      startTime:     gameState.startTime,
      activePrizes:  gameState.activePrizes,
      globalClaimed: gameState.globalClaimed
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(toSave))
  } catch(e){ console.log("Save error:", e.message) }
}

function loadState(){
  try {
    if(!fs.existsSync(STATE_FILE)) return
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))
    if(!saved.started) return
    console.log("📂 Restoring game state...")
    gameState.started       = saved.started
    gameState.totalTickets  = saved.totalTickets
    gameState.bookedTickets = saved.bookedTickets || {}
    gameState.onHoldTickets = saved.onHoldTickets || {}
    gameState.calledNumbers = saved.calledNumbers || []
    gameState.startTime     = saved.startTime
    gameState.activePrizes  = saved.activePrizes  || []
    gameState.globalClaimed = saved.globalClaimed || {}
    gameState.sheets        = generateAllSheets(saved.totalTickets)
    console.log("✅ Restored:", saved.totalTickets, "tickets,", saved.calledNumbers.length, "numbers called")
  } catch(e){ console.log("Load error:", e.message) }
}

/* ── GAME STATE ── */
let gameState = {
  started:       false,
  totalTickets:  0,
  sheets:        [],
  bookedTickets: {},
  onHoldTickets: {},
  calledNumbers: [],
  startTime:     null,
  activePrizes:  [],
  globalClaimed: {}
}

// Load saved state on startup
loadState()

/* ── SOCKET ── */
io.on("connection", (socket) => {
  console.log("Connected:", socket.id)

  // Send state to late joiners
  if(gameState.started){
    socket.emit("gameStarted", {
      totalTickets:  gameState.totalTickets,
      sheets:        gameState.sheets,
      bookedTickets: gameState.bookedTickets,
      onHoldTickets: gameState.onHoldTickets,
      calledNumbers: gameState.calledNumbers,
      startTime:     gameState.startTime  // send always so client knows game state
    })
    // If countdown still running, send countdown event too
    if(gameState.startTime && Date.now() < gameState.startTime){
      socket.emit("gameCountdown", { startTime: gameState.startTime, activePrizes: gameState.activePrizes })
    }
    // Send existing winners to late joiners
    if(Object.keys(gameState.globalClaimed).length > 0){
      socket.emit("existingClaims", gameState.globalClaimed)
    }
    // Send active prizes so late joiners know what's active
    if(gameState.activePrizes && gameState.activePrizes.length > 0){
      socket.emit("activePrizesUpdated", gameState.activePrizes)
    }
  }

  socket.on("setTicketCount", ({ count }) => {
    gameState = {
      started: true, totalTickets: count,
      sheets: generateAllSheets(count),
      bookedTickets: {}, onHoldTickets: {}, calledNumbers: [],
      startTime: null, activePrizes: [], globalClaimed: {}
    }
    console.log("Game ready:", count, "tickets")
    saveState()
    io.emit("gameStarted", {
      totalTickets:  gameState.totalTickets,
      sheets:        gameState.sheets,
      bookedTickets: gameState.bookedTickets,
      onHoldTickets: gameState.onHoldTickets,
      calledNumbers: gameState.calledNumbers,
      startTime:     null
    })
  })

  socket.on("startGame", ({ startDelay, callInterval, activePrizes }) => {
    gameState.startTime    = Date.now() + (startDelay * 1000)
    gameState.activePrizes = activePrizes && activePrizes.length > 0 ? activePrizes : []
    console.log("🚀 Game starts in", startDelay, "s | Active prizes:", gameState.activePrizes)
    saveState()
    io.emit("gameCountdown", { startTime: gameState.startTime, activePrizes: gameState.activePrizes })
    // Check prizes immediately in case tickets already booked + numbers already called
    checkPrizes()
  })

  socket.on("requestHold", ({ tickets, playerName }) => {
    const held=[], failed=[]
    tickets.forEach(ticketNum => {
      if(gameState.bookedTickets[ticketNum]) failed.push({ ticketNum, reason:"Already booked" })
      else if(gameState.onHoldTickets[ticketNum]) failed.push({ ticketNum, reason:"Already on hold" })
      else {
        gameState.onHoldTickets[ticketNum] = { playerName, socketId: socket.id }
        held.push({ ticketNum, playerName })
      }
    })
    if(held.length > 0){
      io.emit("ticketsOnHold", held)
      io.emit("holdRequest", { held, playerName, socketId: socket.id })
    }
    if(failed.length > 0) socket.emit("holdFailed", failed)
  })

  socket.on("confirmHold", (ticketNum) => {
    const hold = gameState.onHoldTickets[ticketNum]
    if(!hold) return
    gameState.bookedTickets[ticketNum] = hold.playerName
    delete gameState.onHoldTickets[ticketNum]
    console.log("✅ Ticket #"+ticketNum+" confirmed for", hold.playerName)
    saveState()
    console.log("   Total booked now:", Object.keys(gameState.bookedTickets).length)
    io.emit("ticketBooked", { ticketNum, playerName: hold.playerName })
    io.emit("holdRemoved", ticketNum)
    // Check prizes immediately after confirming — numbers may already be called
    checkPrizes()
  })

  socket.on("releaseHold", (ticketNum) => {
    const hold = gameState.onHoldTickets[ticketNum]
    if(!hold) return
    const socketId = hold.socketId
    delete gameState.onHoldTickets[ticketNum]
    io.emit("holdRemoved", ticketNum)
    io.to(socketId).emit("yourHoldReleased", ticketNum)
  })

  socket.on("callNumber", (payload) => {
    // Support both old format (number) and new format ({ number, activePrizes })
    const number = typeof payload === "object" ? payload.number : payload
    const activePrizes = typeof payload === "object" ? payload.activePrizes : null

    gameState.calledNumbers.push(number)
    if(activePrizes && activePrizes.length > 0){
      gameState.activePrizes = activePrizes
    }
    io.emit("numberCalled", number)
    saveState()
    console.log("📣 Number:", number, "| Booked:", Object.keys(gameState.bookedTickets), "| Active:", gameState.activePrizes)
    checkPrizes()
  })

  socket.on("updateActivePrizes", (activePrizes) => {
    gameState.activePrizes = activePrizes || []
    console.log("🏆 Active prizes updated:", gameState.activePrizes)
    io.emit("activePrizesUpdated", gameState.activePrizes)
    checkPrizes()
  })

  socket.on("prizeClaimed", () => {})  // handled server-side only

  socket.on("resetGame", () => {
    gameState = {
      started: false, totalTickets: 0, sheets: [],
      bookedTickets: {}, onHoldTickets: {}, calledNumbers: [],
      startTime: null, activePrizes: [], globalClaimed: {}
    }
    try { fs.unlinkSync(STATE_FILE) } catch(e){}
    io.emit("resetGame")
  })

  socket.on("disconnect", () => console.log("Disconnected:", socket.id))
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => console.log("✅ Server running on port", PORT))
