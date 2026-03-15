const express = require("express")
const http    = require("http")
const { Server } = require("socket.io")

const app    = express()
const server = http.createServer(app)
const io     = new Server(server, { cors: { origin: "*" } })

app.use(express.static("public"))

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

  // Use selected prizes if configured, otherwise use ALL prizes
  const prizes = (active && active.length > 0) ? PRIZE_DEFS.filter(p => active.includes(p.key)) : PRIZE_DEFS
  console.log("🔍 checkPrizes | prizes:", prizes.map(p=>p.key), "| booked:", Object.keys(booked), "| numbers called:", marked.length)

  Object.entries(booked).forEach(([tNum, playerName]) => {
    const ticketNum = parseInt(tNum)
    const sheetIdx  = Math.floor((ticketNum-1)/6)
    const ticketIdx = (ticketNum-1)%6
    const ticket    = sheets[sheetIdx] && sheets[sheetIdx][ticketIdx]
    if(!ticket){ console.log("No ticket found for #"+ticketNum); return }

    prizes.forEach(prize => {
      // Prerequisite checks
      if(prize.key==="secondHouse" && !gameState.globalClaimed["fullHouse"]) return
      if(prize.key==="thirdHouse"  && !gameState.globalClaimed["secondHouse"]) return

      // Per-ticket claim key (prevents same ticket claiming same prize twice)
      const claimKey = ticketNum+"_"+prize.key
      if(gameState.globalClaimed[claimKey]) return

      // For non-multi prizes, only one winner globally
      if(!MULTI_KEYS.includes(prize.key) && gameState.globalClaimed[prize.key]) return

      // For fullHouse — only one winner (first ticket to complete)
      if(prize.key==="fullHouse" && gameState.globalClaimed["fullHouse"]) return
      // For secondHouse — only one winner
      if(prize.key==="secondHouse" && gameState.globalClaimed["secondHouse"]) return
      // For thirdHouse — only one winner
      if(prize.key==="thirdHouse" && gameState.globalClaimed["thirdHouse"]) return

      if(prize.check(ticket, marked)){
        // Record claim
        gameState.globalClaimed[claimKey] = { playerName, ticketNum }

        if(prize.key === "fullHouse"){
          // Count how many full houses claimed so far (excluding this one)
          const fhCount = Object.keys(gameState.globalClaimed)
            .filter(k => k.endsWith("_fullHouse") && k !== claimKey).length
          if(fhCount === 0) gameState.globalClaimed["fullHouse"]    = { playerName, ticketNum }
          else if(fhCount === 1) gameState.globalClaimed["secondHouse"] = { playerName, ticketNum }
          else if(fhCount === 2) gameState.globalClaimed["thirdHouse"]  = { playerName, ticketNum }
        } else if(!MULTI_KEYS.includes(prize.key)){
          gameState.globalClaimed[prize.key] = { playerName, ticketNum }
        }

        console.log("✅ PRIZE:", prize.label, "| Player:", playerName, "| Ticket #"+ticketNum)
        io.emit("prizeClaimed", { ticketNum, playerName, prize: prize.label, prizeKey: prize.key })

        // Check game over — all active prizes claimed
        const allDone = prizes.every(p => {
          if(p.key === "fullHouse")   return gameState.globalClaimed["fullHouse"]
          if(p.key === "secondHouse") return gameState.globalClaimed["secondHouse"]
          if(p.key === "thirdHouse")  return gameState.globalClaimed["thirdHouse"]
          return gameState.globalClaimed[p.key]
        })
        if(allDone){
          console.log("🎉 GAME OVER — all prizes claimed")
          io.emit("gameOver")
        }
      }
    })
  })
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
      startTime:     gameState.startTime
    })
    if(gameState.startTime && Date.now() < gameState.startTime){
      socket.emit("gameCountdown", { startTime: gameState.startTime, activePrizes: gameState.activePrizes })
    }
    if(Object.keys(gameState.globalClaimed).length > 0){
      socket.emit("existingClaims", gameState.globalClaimed)
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
    io.emit("resetGame")
  })

  socket.on("disconnect", () => console.log("Disconnected:", socket.id))
})

server.listen(5000, () => console.log("✅ Server running on http://localhost:5000"))