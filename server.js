const express = require("express")
const http    = require("http")
const { Server } = require("socket.io")

const app    = express()
const server = http.createServer(app)
const io     = new Server(server, { cors: { origin: "*" } })

const path = require("path")
const fs   = require("fs")
const mongoose = require("mongoose")

const publicDir = fs.existsSync(path.join(__dirname, "public"))
  ? path.join(__dirname, "public")
  : __dirname
app.use(express.static(publicDir))

/* ── MONGODB CONNECTION ── */
const MONGODB_URI = process.env.MONGODB_URI ||
  "mongodb+srv://lurmawiong956_db_user:Lur%4012345@tambola.u98nv0u.mongodb.net/tambola?retryWrites=true&w=majority&appName=tambola"

mongoose.connect(MONGODB_URI)
  .then(() => { console.log("✅ MongoDB connected"); loadState() })
  .catch(e => console.log("❌ MongoDB error:", e.message))

/* ── MONGODB SCHEMA ── */
const GameSchema = new mongoose.Schema({
  _id:           { type: String, default: "gamestate" },
  started:       Boolean,
  totalTickets:  Number,
  bookedTickets: { type: mongoose.Schema.Types.Mixed, default: {} },
  onHoldTickets: { type: mongoose.Schema.Types.Mixed, default: {} },
  calledNumbers: [Number],
  startTime:     Number,
  activePrizes:  [String],
  globalClaimed: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false })

const Game = mongoose.model("Game", GameSchema)

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

/* ── PRIZE CHECK ──
   Rule: For each prize, collect ALL tickets that qualify RIGHT NOW in one pass.
   If the prize has never been claimed before, award all simultaneous winners at once,
   then permanently lock the prize — no further claims ever.
   globalClaimed[prizeKey] = array of { playerName, ticketNum } (locked after first award).
   globalClaimed[ticketNum+"_"+prizeKey] = guard so a ticket isn't re-processed.
── */
function checkPrizes(){
  const marked = gameState.calledNumbers
  const booked = gameState.bookedTickets
  const sheets = gameState.sheets
  const active = gameState.activePrizes
  if(!marked.length || !Object.keys(booked).length) return
  const prizes = (active && active.length > 0) ? PRIZE_DEFS.filter(p => active.includes(p.key)) : PRIZE_DEFS
  const normalPrizes = prizes.filter(p => !["fullHouse","secondHouse","thirdHouse"].includes(p.key))
  const doFullHouse  = prizes.some(p => p.key === "fullHouse")
  const doSecond     = prizes.some(p => p.key === "secondHouse")
  const doThird      = prizes.some(p => p.key === "thirdHouse")

  // ── Normal prizes ──
  normalPrizes.forEach(prize => {
    // Prize already claimed — permanently locked, skip entirely
    if(gameState.globalClaimed[prize.key]) return

    // Collect all tickets that qualify right now in one pass
    const simultaneous = []
    Object.entries(booked).forEach(([tNum, playerName]) => {
      const ticketNum = parseInt(tNum)
      if(gameState.globalClaimed[ticketNum+"_"+prize.key]) return  // this ticket already processed
      const ticket = sheets[Math.floor((ticketNum-1)/6)] && sheets[Math.floor((ticketNum-1)/6)][(ticketNum-1)%6]
      if(!ticket) return
      if(prize.check(ticket, marked)) simultaneous.push({ ticketNum, playerName, tNum })
    })

    if(simultaneous.length === 0) return

    // Award all simultaneous winners, then lock the prize
    gameState.globalClaimed[prize.key] = []
    simultaneous.forEach(({ ticketNum, playerName, tNum }) => {
      gameState.globalClaimed[tNum+"_"+prize.key] = { playerName, ticketNum }
      gameState.globalClaimed[prize.key].push({ playerName, ticketNum })
      io.emit("prizeClaimed", { ticketNum, playerName, prize: prize.label, prizeKey: prize.key })
    })
    saveState()
  })

  // ── Full House prizes (sequential: 1st, 2nd, 3rd) ──
  if(doFullHouse || doSecond || doThird){
    const fullHouseCheck = PRIZE_DEFS.find(p => p.key === "fullHouse").check

    // Collect all tickets that qualify and haven't been processed for any house prize
    const qualifying = []
    Object.entries(booked).forEach(([tNum, playerName]) => {
      if(gameState.globalClaimed[tNum+"_fullHouse"])   return
      if(gameState.globalClaimed[tNum+"_secondHouse"]) return
      if(gameState.globalClaimed[tNum+"_thirdHouse"])  return
      const ticketNum = parseInt(tNum)
      const ticket = sheets[Math.floor((ticketNum-1)/6)] && sheets[Math.floor((ticketNum-1)/6)][(ticketNum-1)%6]
      if(!ticket) return
      if(fullHouseCheck(ticket, marked)) qualifying.push({ ticketNum, playerName, tNum })
    })

    if(qualifying.length > 0){
      // Award 1st house to ALL simultaneous qualifiers if not yet claimed
      if(doFullHouse && !gameState.globalClaimed["fullHouse"]){
        gameState.globalClaimed["fullHouse"] = []
        qualifying.forEach(({ ticketNum, playerName, tNum }) => {
          gameState.globalClaimed[tNum+"_fullHouse"] = { playerName, ticketNum }
          gameState.globalClaimed["fullHouse"].push({ playerName, ticketNum })
          io.emit("prizeClaimed", { ticketNum, playerName, prize: "🎉 Full House", prizeKey: "fullHouse" })
        })
        saveState()
      }
      // 2nd house: only if 1st already claimed and 2nd not yet
      else if(doSecond && gameState.globalClaimed["fullHouse"] && !gameState.globalClaimed["secondHouse"]){
        gameState.globalClaimed["secondHouse"] = []
        qualifying.forEach(({ ticketNum, playerName, tNum }) => {
          gameState.globalClaimed[tNum+"_secondHouse"] = { playerName, ticketNum }
          gameState.globalClaimed["secondHouse"].push({ playerName, ticketNum })
          io.emit("prizeClaimed", { ticketNum, playerName, prize: "🥇 Second Full House", prizeKey: "secondHouse" })
        })
        saveState()
      }
      // 3rd house: only if 1st and 2nd already claimed and 3rd not yet
      else if(doThird && gameState.globalClaimed["fullHouse"] && gameState.globalClaimed["secondHouse"] && !gameState.globalClaimed["thirdHouse"]){
        gameState.globalClaimed["thirdHouse"] = []
        qualifying.forEach(({ ticketNum, playerName, tNum }) => {
          gameState.globalClaimed[tNum+"_thirdHouse"] = { playerName, ticketNum }
          gameState.globalClaimed["thirdHouse"].push({ playerName, ticketNum })
          io.emit("prizeClaimed", { ticketNum, playerName, prize: "🏅 Third Full House", prizeKey: "thirdHouse" })
        })
        saveState()
      }
    }
  }

  // Game over: every active prize has been claimed
  const allDone = prizes.every(p => !!gameState.globalClaimed[p.key])
  if(allDone){ console.log("🎉 GAME OVER"); io.emit("gameOver") }
}

/* ── SAVE / LOAD ── */
async function saveState(){
  try {
    const toSave = {
      started: gameState.started, totalTickets: gameState.totalTickets,
      bookedTickets: gameState.bookedTickets, onHoldTickets: gameState.onHoldTickets,
      calledNumbers: gameState.calledNumbers, startTime: gameState.startTime,
      activePrizes: gameState.activePrizes, globalClaimed: gameState.globalClaimed
    }
    await Game.findByIdAndUpdate("gamestate", { $set: toSave }, { upsert: true, new: true })
  } catch(e){ console.log("Save error:", e.message) }
}

async function loadState(){
  try {
    const saved = await Game.findById("gamestate")
    if(!saved || !saved.started){ console.log("No saved state"); return }
    console.log("📂 Restoring:", saved.totalTickets, "tickets,", saved.calledNumbers.length, "numbers")
    gameState.started       = saved.started
    gameState.totalTickets  = saved.totalTickets
    gameState.bookedTickets = saved.bookedTickets || {}
    gameState.onHoldTickets = saved.onHoldTickets || {}
    gameState.calledNumbers = saved.calledNumbers || []
    gameState.startTime     = saved.startTime
    gameState.activePrizes  = saved.activePrizes  || []
    gameState.globalClaimed = saved.globalClaimed || {}
    gameState.sheets        = generateAllSheets(saved.totalTickets)
    console.log("✅ State restored")
  } catch(e){ console.log("Load error:", e.message) }
}

/* ── GAME STATE ── */
let gameState = {
  started: false, totalTickets: 0, sheets: [],
  bookedTickets: {}, onHoldTickets: {}, calledNumbers: [],
  startTime: null, activePrizes: [], globalClaimed: {}
}

/* ── SOCKET ── */
io.on("connection", (socket) => {
  console.log("Connected:", socket.id, "| Started:", gameState.started, "| Numbers:", gameState.calledNumbers.length)

  if(gameState.started){
    const now = Date.now()
    const gameLive = gameState.calledNumbers.length > 0 ||
                     (gameState.startTime && now >= gameState.startTime)
    socket.emit("gameStarted", {
      totalTickets:  gameState.totalTickets,
      sheets:        gameState.sheets,
      bookedTickets: gameState.bookedTickets,
      onHoldTickets: gameState.onHoldTickets,
      calledNumbers: gameState.calledNumbers,
      startTime:     gameState.startTime,
      gameLive:      gameLive
    })
    if(gameState.startTime && now < gameState.startTime){
      socket.emit("gameCountdown", { startTime: gameState.startTime, activePrizes: gameState.activePrizes })
    }
    if(Object.keys(gameState.globalClaimed).length > 0){
      socket.emit("existingClaims", gameState.globalClaimed)
    }
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
    saveState()
    io.emit("gameStarted", {
      totalTickets: gameState.totalTickets, sheets: gameState.sheets,
      bookedTickets: gameState.bookedTickets, onHoldTickets: gameState.onHoldTickets,
      calledNumbers: gameState.calledNumbers, startTime: null, gameLive: false
    })
  })

  socket.on("startGame", ({ startDelay, callInterval, activePrizes }) => {
    gameState.startTime    = Date.now() + (startDelay * 1000)
    gameState.activePrizes = activePrizes && activePrizes.length > 0 ? activePrizes : []
    saveState()
    io.emit("gameCountdown", { startTime: gameState.startTime, activePrizes: gameState.activePrizes })
    checkPrizes()
  })

  socket.on("requestHold", ({ tickets, playerName }) => {
    const held=[], failed=[]
    tickets.forEach(ticketNum => {
      if(gameState.bookedTickets[ticketNum]) failed.push({ ticketNum, reason:"Already booked" })
      else if(gameState.onHoldTickets[ticketNum]) failed.push({ ticketNum, reason:"Already on hold" })
      else { gameState.onHoldTickets[ticketNum] = { playerName, socketId: socket.id }; held.push({ ticketNum, playerName }) }
    })
    if(held.length > 0){ io.emit("ticketsOnHold", held); io.emit("holdRequest", { held, playerName, socketId: socket.id }) }
    if(failed.length > 0) socket.emit("holdFailed", failed)
  })

  socket.on("confirmHold", (ticketNum) => {
    const hold = gameState.onHoldTickets[ticketNum]
    if(!hold) return
    gameState.bookedTickets[ticketNum] = hold.playerName
    delete gameState.onHoldTickets[ticketNum]
    saveState()
    io.emit("ticketBooked", { ticketNum, playerName: hold.playerName })
    io.emit("holdRemoved", ticketNum)
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

  socket.on("releaseConfirmedBooking", (ticketNum) => {
    if(!gameState.bookedTickets[ticketNum]) return
    const playerName = gameState.bookedTickets[ticketNum]
    delete gameState.bookedTickets[ticketNum]
    console.log("❌ Released confirmed booking: Ticket #"+ticketNum+" from", playerName)
    saveState()
    io.emit("bookingReleased", { ticketNum, playerName })
  })

  socket.on("callNumber", (payload) => {
    const number       = typeof payload === "object" ? payload.number : payload
    const activePrizes = typeof payload === "object" ? payload.activePrizes : null
    gameState.calledNumbers.push(number)
    if(activePrizes && activePrizes.length > 0) gameState.activePrizes = activePrizes
    io.emit("numberCalled", number)
    saveState()
    checkPrizes()
  })

  socket.on("updateActivePrizes", (activePrizes) => {
    gameState.activePrizes = activePrizes || []
    io.emit("activePrizesUpdated", gameState.activePrizes)
    checkPrizes()
  })

  socket.on("prizeClaimed", () => {})

  socket.on("resetGame", async () => {
    gameState = {
      started: false, totalTickets: 0, sheets: [],
      bookedTickets: {}, onHoldTickets: {}, calledNumbers: [],
      startTime: null, activePrizes: [], globalClaimed: {}
    }
    try { await Game.findByIdAndDelete("gamestate") } catch(e){}
    io.emit("resetGame")
  })

  socket.on("disconnect", () => console.log("Disconnected:", socket.id))
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => console.log("✅ Server running on port", PORT))
