// ══════════════════════════════════════════════════════════
// LIVE TIMING ENGINE — Simulación segundo a segundo
// F1 Manager 2026 — v2.0
// ══════════════════════════════════════════════════════════

const LTE = {

  state: {
    session:         null,
    phase:           null,   // "Q1" | "Q2" | "Q3" | "race"
    running:         false,
    speed:           1,
    tickInterval:    null,
    currentTime:     0,
    sessionDuration: 0,
    totalLaps:       0,
    weather:         "dry",
    weatherTimeline: [],
    scActive:        false,
    scTimeLeft:      0,
    vscActive:       false,
    vscTimeLeft:     0,
    bestSectors:     { s1: Infinity, s2: Infinity, s3: Infinity },
    events:          [],
    finished:        false,
    circuit:         null,
    race:            null,
    eliminatedDrivers: [],  // IDs eliminados en Q1/Q2
  },

  drivers:    [],
  onTick:     null,
  onEvent:    null,
  onFinish:   null,
  onSCChange: null,

  // ════════════════════════════════════════════════════════
  // INICIALIZACIÓN
  // ════════════════════════════════════════════════════════

  init(sessionType, driversData, teamsData, circuit, race, weather, weatherTimeline, compounds, practiceData) {
    this.stop();

    const isRace     = sessionType === "race";
    const isPractice = sessionType === "practice";
    const laps   = circuit.laps || 58;
    const baseT  = circuit.baseTime || 86.5;

    const sessionDuration = isRace ? laps * (baseT + 5) : isPractice ? laps * (baseT + 5) : 2700;

    this.state = {
      session:           sessionType,
      phase:             isRace ? "race" : "Q1",
      running:           false,
      speed:             1,
      tickInterval:      null,
      currentTime:       0,
      sessionDuration,
      totalLaps:         laps,
      weather,
      weatherTimeline,
      scActive:          false,
      scTimeLeft:        0,
      vscActive:         false,
      vscTimeLeft:       0,
      bestSectors:       { s1: Infinity, s2: Infinity, s3: Infinity },
      events:            [],
      finished:          false,
      circuit,
      race,
      eliminatedDrivers: [],
    };

    // Determinar compuesto más blando disponible para clasificación
    // Compuesto más blando del circuito para clasificación
    const circuitCompounds = circuit?.compounds || ["C3", "C4", "C5"];
    const qualCompound = circuitCompounds[0]; // el más blando asignado (primero)

    this.drivers = driversData
      .filter((d) => d.role !== "tester")
      .map((driver) => {
        const team      = teamsData.find((t) => t.id === driver.teamId);
        const carScore  = team?.performance?.overall || 70;
        const puScore   = team?.powerUnit?.overall   || 80;
        const rubberBonus = practiceData?.data?.trackRubber || 0;

        const driverScore =
          driver.attributes.pace        * 0.35 +
          driver.attributes.qualifying  * 0.25 +
          driver.attributes.consistency * 0.20 +
          driver.attributes.experience  * 0.10 +
          driver.form                   * 0.10;

        const combinedScore = carScore * 0.55 + driverScore * 0.25 + puScore * 0.20;

        // Tiempo de vuelta base — spread real entre equipos
        // Mercedes (96) ≈ 79.5s, Cadillac (66) ≈ 83.5s → ~4s de diferencia
        // Spread más realista: top team ~1.5s más rápido que midfield, ~3s más que cola
const spreadFactor = this.state.session === "practice" ? 18.0 : 14.0;
const lapTimeBase  = baseT - (combinedScore / 100) * spreadFactor - rubberBonus;
        console.log(driver.name, team?.shortName, "combined:", Math.round(combinedScore), "lapBase:", lapTimeBase.toFixed(3));

        // Variación aleatoria pequeña por sesión (no por vuelta)
        const sessionVariation = (Math.random() - 0.5) * 0.4;
        const finalLapBase = lapTimeBase + sessionVariation;

        // Sectores proporcionales
        const s1Base = finalLapBase * 0.28;
        const s2Base = finalLapBase * 0.38;
        const s3Base = finalLapBase * 0.34;

        // Estrategia de carrera
        let strategy = null;
        if (isRace) {
          strategy = this._chooseStrategy(driver, team, laps, compounds);
        }

        // Salida escalonada en Q1 — equipos débiles salen primero
        // Top teams (combinedScore > 88) esperan más
        const scoreRank = Math.max(0, 90 - combinedScore); // 0 para top, ~24 para peores
        const initialDelay = (isRace || isPractice) ? 0
         : Math.floor(scoreRank * 8 + Math.random() * 30);

        // Ciclo de vuelta en clasificación
        // "outlap" → "push" → "inlap"
        // Outlap: ~1.04x el tiempo base (calienta neumáticos)
        // Push: tiempo base (intento rápido)
        // Inlap: ~1.06x (vuelve a boxes)

        return {
          driverId:      driver.id,
          driverName:    driver.name,
          driverNumber:  driver.number,
          teamId:        team?.id,
          teamName:      team?.shortName || "-",
          teamColor:     team?.color     || "#aaa",
          isPlayer:      team?.id === (window.selectedTeam?.id) || team?.id === (window.playerTeamId),

          combinedScore,
          lapTimeBase:   finalLapBase,
          s1Base,
          s2Base,
          s3Base,

          // Estado en pista
          position:      0,
          currentLap:    0,
          currentSector: 1,
          timeInSector:  0,
          timeInLap:     0,
          totalRaceTime: 0,

          // Sectores
          lastS1: null, lastS2: null, lastS3: null,
          prevS1: null, prevS2: null, prevS3: null,
          curS1:  null, curS2:  null,

          // Mejores tiempos
          bestLap: Infinity,
          bestS1:  Infinity,
          bestS2:  Infinity,
          bestS3:  Infinity,
          lastLap: null,

          // Carrera
          gap:               0,
          interval:          0,
          pitStops:          0,
          lapsOnTyre:        0,
          compound:          isRace ? (strategy?.stints?.[0]?.compound || "medium") : qualCompound,
          stints:            strategy?.stints  || [],
          pitLaps:           strategy?.pitLaps || [],
          currentStintIndex: 0,

          // Pit
          inPit:           initialDelay > 0,
          pitTimeLeft:     initialDelay,
          awaitingPitwall: initialDelay > 0 && (team?.id === (window.selectedTeam?.id) || team?.id === (window.playerTeamId)),

          // DNF
          dnf:       false,
          dnfReason: null,
          eliminated: false,

          // Clasificación
          qualifyingBestLap: Infinity,
          qualifyingLaps:    0,
          lapPhase:          "outlap",  // "outlap" | "push" | "inlap"
           // ERS y combustible
          ersMode:      "qualy",   // recarga | neutral | boost | overtake | qualy
          fuelMode:     "push",    // ahorro | neutral | push
          battery:      100,       // 0-100%
          fuel:         100,       // 0-100%
          fuelPerLap:   0,         // se calcula según circuito
          lapPhaseCount:     0,
          pitCallPending:    false,
          pitCall:           false,
        };
      });

    this._shuffleInitialOrder();
  },

  // ════════════════════════════════════════════════════════
  // CONTROL
  // ════════════════════════════════════════════════════════

  play() {
    if (this.state.finished) return;
    this.state.running = true;
    this._startInterval();
  },

  pause() {
    this.state.running = false;
    this._clearInterval();
  },

  stop() {
    this.pause();
    this.state.finished = false;
  },

  setSpeed(speed) {
    this.state.speed = speed;
    if (this.state.running) {
      this._clearInterval();
      this._startInterval();
    }
  },

  skipToEnd() {
    this.pause();
    let safety = 0;
    while (!this.state.finished && safety < 999999) {
      this._tick();
      safety++;
    }
    if (this.onTick) this.onTick(this.state, this.drivers);
  },

  _startInterval() {
    const delay = Math.round(1000 / this.state.speed);
    this.state.tickInterval = setInterval(() => { this._tick(); }, delay);
  },

  _clearInterval() {
    if (this.state.tickInterval) {
      clearInterval(this.state.tickInterval);
      this.state.tickInterval = null;
    }
  },

  // ════════════════════════════════════════════════════════
  // TICK — 1 segundo de tiempo de carrera
  // ════════════════════════════════════════════════════════

  _tick() {
  if (this.state.finished) return;

  this.state.currentTime++;

  if (this.state.session === "qualifying") {
    this._tickQualifying();
  } else if (this.state.session === "practice") {
    this._tickRace(); // usa el motor de carrera base
    this._tickPracticePrograms(); // gestión de programas encima
  } else {
    this._tickRace();
  }

  this._updatePositions();

  if (this.onTick) this.onTick(this.state, this.drivers);

  if (this._isSessionFinished()) {
    this._finishSession();
  }
},

  // ════════════════════════════════════════════════════════
  // CLASIFICACIÓN — tick
  // ════════════════════════════════════════════════════════

  _tickQualifying() {
    const t = this.state.currentTime;

    // Transiciones de fase con eliminación
    let newPhase = "Q1";
    if (t >= 1980)      newPhase = "Q3";
    else if (t >= 1080) newPhase = "Q2";

    if (newPhase !== this.state.phase) {
      this._eliminateDrivers(this.state.phase);
      this.state.phase = newPhase;
      this._addEvent(`🏁 Comienza ${newPhase}`);

      // Reset best laps para Q2/Q3
     this.drivers.forEach((d) => {
        if (!d.eliminated) {
          d.qualifyingBestLap = Infinity;
          d.bestLap  = Infinity;
          d.bestS1   = Infinity;
          d.bestS2   = Infinity;
          d.bestS3   = Infinity;
          d.inPit    = true;
          d.lapPhase = "outlap";
          if (d.isPlayer) {
            d.pitTimeLeft     = 99999;
            d.awaitingPitwall = true;
          } else {
            d.pitTimeLeft = Math.floor(Math.random() * 60) + 30;
          }
        }
      });
    }

    this.drivers.forEach((d) => {
      if (d.dnf || d.eliminated) return;

if (d.inPit) {
        if (d.isPlayer && d.awaitingPitwall) return;

        d.pitTimeLeft--;
        if (d.pitTimeLeft <= 0) {
          d.inPit           = false;
          d.awaitingPitwall = false;
          d.lapPhase        = "outlap";
          d.lapPhaseCount   = 0;
          d.timeInSector    = 0;
          d.timeInLap       = 0;
          d.currentSector   = 1;
          d.curS1           = null;
          d.curS2           = null;
        }
        return;
      }

      if (d.isPlayer && d.pitCallPending && !d.inPit) {
        // Solo entra a boxes al completar la vuelta actual (se procesa en _completeSectorQual)
        // No hacemos nada aquí — el flag se procesa al completar S3
      }

      // Factor de velocidad según fase de vuelta
      const phaseFactor = d.lapPhase === "outlap" ? 1.08
        : d.lapPhase === "inlap"  ? 1.07
        : 1.0; // push

      const sectorTarget = this._getSectorTarget(d, phaseFactor);
      d.timeInSector += 1 + (Math.random() - 0.5) * 0.1;
      d.timeInLap    += 1 + (Math.random() - 0.5) * 0.1;

      if (d.timeInSector >= sectorTarget) {
        this._completeSectorQual(d);
      }
    });
  },

  _eliminateDrivers(phase) {
    if (phase === "Q1") {
      // Eliminar P17-P22 (los 6 más lentos)
      const active = this.drivers
        .filter((d) => !d.eliminated)
        .sort((a, b) => {
          if (a.qualifyingBestLap === Infinity) return 1;
          if (b.qualifyingBestLap === Infinity) return -1;
          return a.qualifyingBestLap - b.qualifyingBestLap;
        });

      active.slice(16).forEach((d) => {
        d.eliminated = true;
        d.inPit      = true;
        this.state.eliminatedDrivers.push(d.driverId);
        this._addEvent(`🔴 ${d.driverName} eliminado en Q1 — P${active.indexOf(d) + 1}`);
      });

    } else if (phase === "Q2") {
      // Eliminar P11-P16 (los siguientes 6 más lentos)
      const active = this.drivers
        .filter((d) => !d.eliminated)
        .sort((a, b) => {
          if (a.qualifyingBestLap === Infinity) return 1;
          if (b.qualifyingBestLap === Infinity) return -1;
          return a.qualifyingBestLap - b.qualifyingBestLap;
        });

      active.slice(10).forEach((d) => {
        d.eliminated = true;
        d.inPit      = true;
        this.state.eliminatedDrivers.push(d.driverId);
        this._addEvent(`🔴 ${d.driverName} eliminado en Q2 — P${active.indexOf(d) + 1}`);
      });
    }
  },

  _completeSectorQual(d) {
    const sectorTime = d.timeInSector;

    if (d.currentSector === 1) {
      d.curS1  = sectorTime;
      d.lastS1 = sectorTime;
      if (d.lapPhase === "push") {
        if (sectorTime < d.bestS1) d.bestS1 = sectorTime;
        if (sectorTime < this.state.bestSectors.s1) this.state.bestSectors.s1 = sectorTime;
      }
      d.currentSector = 2;
      d.timeInSector  = 0;

    } else if (d.currentSector === 2) {
      d.curS2  = sectorTime;
      d.lastS2 = sectorTime;
      if (d.lapPhase === "push") {
        if (sectorTime < d.bestS2) d.bestS2 = sectorTime;
        if (sectorTime < this.state.bestSectors.s2) this.state.bestSectors.s2 = sectorTime;
      }
      d.currentSector = 3;
      d.timeInSector  = 0;

    } else if (d.currentSector === 3) {
      d.lastS3 = sectorTime;
      if (d.lapPhase === "push") {
        if (sectorTime < d.bestS3) d.bestS3 = sectorTime;
        if (sectorTime < this.state.bestSectors.s3) this.state.bestSectors.s3 = sectorTime;
      }

      const lapTime = d.timeInLap;
      d.lastLap     = lapTime;
      d.currentLap++;
      // Contar vueltas de programa en modo práctica
if (this.state.session === "practice") {
  // Contar vueltas del programa actual
  if (d._practiceLapsDone !== undefined) d._practiceLapsDone++;

  // Contar vueltas TOTALES y sincronizar al estado de práctica
  d._totalPracticeLaps = (d._totalPracticeLaps || 0) + 1;

  if (d.confidence < 100) {
    d.confidence = Math.min(100, (d.confidence || 0) + 2);
  }

  // Sincronizar lapsDone al practiceSessionState para desbloqueo de reglajes
  if (typeof practiceSessionState !== "undefined") {
    const ds = practiceSessionState.driverStates?.[d.driverId];
    if (ds) {
      ds.lapsDone = d._totalPracticeLaps;
    }
  }
}
      d.lapsOnTyre++;
      if (d.lapPhase === "push") d.qualifyingLaps++;
      d.lapPhaseCount++;

      // Si era vuelta push — registrar tiempo
      if (d.lapPhase === "push") {
        // Calcular tiempo real como suma de sectores de esta vuelta
        const realLapTime = d.lastS1 + d.lastS2 + d.lastS3;
        if (realLapTime < d.qualifyingBestLap) {
          d.qualifyingBestLap = realLapTime;
          d.bestLap           = realLapTime;
          d.lastLap           = realLapTime;
          this._addEvent(`⚡ ${d.driverName} — ${this._fmt(lapTime)}`);
        }
        // Después de push → inlap
        // Si hay orden de boxes pendiente → inlap directo
        if (d.pitCallPending) {
          d.lapPhase        = "inlap";
          d.pitCallPending  = false;
        } else {
          d.lapPhase = "inlap";
        }

      } else if (d.lapPhase === "outlap") {
        // Si hay orden de boxes durante outlap → cambiar a inlap directamente
        d.lapPhase = d.pitCallPending ? "inlap" : "push";
        if (d.pitCallPending) d.pitCallPending = false;

      } else if (d.lapPhase === "inlap") {
        d.inPit         = true;
        d.lapPhase      = "outlap";
        d.lapPhaseCount = 0;

        const timeLeft    = this.state.sessionDuration - this.state.currentTime;
        const phaseStart  = this.state.phase === "Q3" ? 1980
          : this.state.phase === "Q2" ? 1080 : 0;
        const phaseDur    = this.state.phase === "Q3" ? 720
          : this.state.phase === "Q2" ? 900 : 1080;
        const timeInPhase = this.state.currentTime - phaseStart;
        const phaseLeft   = phaseDur - timeInPhase;

        // Piloto del jugador — no sale solo, espera instrucciones del pitwall
        if (d.isPlayer) {
          d.pitTimeLeft     = 99999;
          d.awaitingPitwall = true;
          d.pitCallPending  = false;
          return;
        }

        // IA — decidir si sale o no
        const shouldPit = this._aiShouldGoOut(d, phaseLeft);
        d.pitTimeLeft   = shouldPit
          ? Math.floor(Math.random() * 30) + 20
          : 99999;
      }

      // Reiniciar vuelta
      d.currentSector = 1;
      d.timeInSector  = 0;
      d.timeInLap     = 0;
      d.prevS1 = d.lastS1;
      d.prevS2 = d.lastS2;
      d.prevS3 = d.lastS3;
      d.curS1  = null;
      d.curS2  = null;
    }
  },

  // ════════════════════════════════════════════════════════
  // CARRERA — tick
  // ════════════════════════════════════════════════════════

  _tickRace() {
    // SC / VSC
    if (this.state.scActive) {
      this.state.scTimeLeft--;
      if (this.state.scTimeLeft <= 0) {
        this.state.scActive = false;
        if (this.onSCChange) this.onSCChange("clear");
        this._addEvent(`✅ Safety Car retirado — pista despejada`);
      }
    }

    if (this.state.vscActive) {
      this.state.vscTimeLeft--;
      if (this.state.vscTimeLeft <= 0) {
        this.state.vscActive = false;
        if (this.onSCChange) this.onSCChange("clear");
        this._addEvent(`✅ Virtual Safety Car retirado`);
      }
    }

    // Evento aleatorio SC/VSC
    if (!this.state.scActive && !this.state.vscActive && Math.random() < 0.0005) {
      if (Math.random() < 0.4) {
        this.state.vscActive   = true;
        this.state.vscTimeLeft = 120;
        if (this.onSCChange) this.onSCChange("vsc");
        this._addEvent(`🟡 Virtual Safety Car desplegado`);
      } else {
        this.state.scActive   = true;
        this.state.scTimeLeft = 240;
        if (this.onSCChange) this.onSCChange("sc");
        this._addEvent(`🟠 Safety Car desplegado`);
      }
    }

    // Clima
    const approxLap = Math.floor(this.state.currentTime / (this.state.circuit?.baseTime || 86));
    const weather   = this.state.weatherTimeline[approxLap] || "dry";
    if (weather !== this.state.weather) {
      this.state.weather = weather;
      this._addEvent(`🌦️ Cambio de clima: ${weather}`);
    }

    this.drivers.forEach((d) => {
      if (d.dnf) return;

      if (d.inPit) {
  d.pitTimeLeft--;
  if (d.pitTimeLeft <= 0) {
    d.inPit      = false;
    d.lapsOnTyre = 0;

    if (this.state.session === "practice") {
  const nextPlan = d._practicePrograms?.[d._practiceProgramIdx];
  if (nextPlan) {
    d.compound = nextPlan.compound;

    // Verificar si tiene sets nuevos disponibles para este compuesto
    const inv  = window.practicetyreInventory;
    if (inv && typeof getAvailableTyreSets === "function") {
      const sets   = getAvailableTyreSets(inv, d.driverId, nextPlan.compound);
      d._tyreIsNew = sets.new.length > 0;

      // Marcar el set como usado en el inventario
      if (typeof markTyreSetUsed === "function") {
        markTyreSetUsed(inv, d.driverId, nextPlan.compound, d._tyreIsNew);
      }
    } else {
      d._tyreIsNew = true;
    }
  }
      if (!d.awaitingPitwall) {
        this._addEvent(`🔧 ${d.driverName} sale — ${d.compound?.toUpperCase()}`);
      }
    } else {
      d.currentStintIndex = Math.min(d.currentStintIndex + 1, d.stints.length - 1);
      d.compound  = d.stints[d.currentStintIndex]?.compound || "medium";
      this._addEvent(`🔧 ${d.driverName} sale de boxes — ${d.compound.toUpperCase()}`);
    }
  }
  return;
}

      const scFactor = this.state.scActive ? 1.4 : this.state.vscActive ? 1.2 : 1.0;

      // Degradación real por compuesto + circuito + piloto
      const degradationPen = typeof calculateTyreDegradation === "function"
        ? calculateTyreDegradation(
            d.driverId,
            d.compound,
            d.lapsOnTyre,
            this.state.circuit,
            null
          ) / 3  // dividido en 3 sectores
        : 0;

      const sectorTarget = this._getSectorTarget(d, scFactor, degradationPen);
      d.timeInSector += 1 + (Math.random() - 0.5) * 0.1;
      d.timeInLap    += 1 + (Math.random() - 0.5) * 0.1;

      if (d.timeInSector >= sectorTarget) {
        this._completeSectorRace(d);
      }

      // DNF — probabilidad ajustada según tipo de sesión
const team        = window.teams?.find((t) => t.id === d.teamId);
const reliability = team?.performance?.reliability || 80;
const puRel       = team?.powerUnit?.reliability   || 80;
const combined    = reliability * 0.6 + puRel * 0.4;

// En práctica: ~5-10x menos probable que en carrera
// En carrera: base normal por vuelta
const dnfDivisor  = this.state.session === "practice" ? (320 * 92 * 25) : (320 * 92);
const dnfChance   = (100 - combined) / dnfDivisor;

if (Math.random() < dnfChance) {
  d.dnf = true;
  const reasons = this.state.session === "practice"
    ? ["problema de fiabilidad", "accidente leve", "fallo de sensor", "problema hidráulico"]
    : ["problema mecánico", "accidente", "fallo eléctrico", "fallo de frenos"];
  d.dnfReason = reasons[Math.floor(Math.random() * reasons.length)];

  if (this.state.session === "practice") {
    this._addEvent(`🔴 ${d.driverName} — ${d.dnfReason}, termina la sesión anticipadamente`);
  } else {
    this._addEvent(`🚨 ${d.driverName} abandona — ${d.dnfReason}`);

    if (!this.state.scActive && Math.random() < 0.5) {
      this.state.scActive   = true;
      this.state.scTimeLeft = 200;
      if (this.onSCChange) this.onSCChange("sc");
      this._addEvent(`🟠 Safety Car desplegado por el incidente de ${d.driverName}`);
    }
  }
}
    });
  },

_tickPracticePrograms() {
  this.drivers.forEach((d) => {
    if (d.dnf || d.inPit) return;
    if (!d._practicePrograms?.length) return;

    const plan = d._practicePrograms[d._practiceProgramIdx];
    if (!plan) return;

    // Contar vueltas del programa
    // Se actualiza en _completeSectorRace cuando currentLap sube
    const lapsDone = d._practiceLapsDone || 0;
    if (lapsDone >= plan.laps) {
      // Completó el programa — volver a boxes
      const prog = typeof WORK_PROGRAMS !== "undefined"
        ? WORK_PROGRAMS.find((p) => p.id === plan.programId)
        : null;

      const progName = prog?.name || plan.programId;

      this._addEvent(
        `📋 ${d.driverName} completó "${progName}" — regresa a boxes`
      );
      
// Radio del piloto al completar programa
if (typeof ltAddRadioMessage === "function") {
  const radioMsgs = [
    `"Box, box. El stint terminó, volviendo."`,
    `"Confirmado, entro. ¿Cómo están los datos?"`,
    `"Terminé el programa, en camino al garaje."`,
    `"Copy, regreso. ¿Qué vieron los ingenieros?"`,
  ];
  const msg = radioMsgs[Math.floor(Math.random() * radioMsgs.length)];
  ltAddRadioMessage(d.driverName, d.teamColor, msg, "radio");
}

      d.inPit           = true;
d.pitTimeLeft     = d.isPlayer ? 99999 : Math.floor(Math.random() * 25) + 10;
d.awaitingPitwall = d.isPlayer;
d._practiceProgramIdx++;
d._practiceLapsDone = 0;
d.pitStops = (d.pitStops || 0) + 1;

// Tracking de neumáticos — marcar compuesto anterior como usado
if (!d.isPlayer && window.practicetyreInventory) {
  const prevPlan = d._practicePrograms?.[d._practiceProgramIdx - 1];
  if (prevPlan) {
    markTyreSetUsed(
      window.practicetyreInventory,
      d.driverId,
      prevPlan.compound,
      true
    );
    d._tyreIsNew = false; // el próximo stint puede ser con usado
  }
} // contar entrada a boxes

      // Confianza sube al completar programa
      if (d.confidence < 100) {
        d.confidence = Math.min(100, (d.confidence || 0) + 10);
      }

      // Llamar al callback de renderer si es piloto del jugador
      if (d.isPlayer && typeof completePracticeProgram === "function") {
        const ds = typeof practiceSessionState !== "undefined"
          ? practiceSessionState.driverStates?.[d.driverId]
          : null;
        if (ds) {
          ds.programs[ds.currentProgramIdx] = plan;
          completePracticeProgram(ds);
        }
      }
    }
  });
},

  _completeSectorRace(d) {
  const sectorTime        = d.timeInSector;
  const isPracticeOrQuali = this.state.session === "practice" ||
                            this.state.session === "qualifying";
  const isOutLap          = isPracticeOrQuali && d.lapsOnTyre === 0;
  const isInLap           = isPracticeOrQuali && d.lapPhase === "inlap";
  const isValidLap        = !isPracticeOrQuali || (!isOutLap && !isInLap);

  if (d.currentSector === 1) {
    d.curS1  = sectorTime;
    d.lastS1 = sectorTime;
    if (isValidLap) {
      if (sectorTime < d.bestS1) d.bestS1 = sectorTime;
      if (sectorTime < this.state.bestSectors.s1) this.state.bestSectors.s1 = sectorTime;
    }
    d.currentSector = 2;
    d.timeInSector  = 0;

  } else if (d.currentSector === 2) {
    d.curS2  = sectorTime;
    d.lastS2 = sectorTime;
    if (isValidLap) {
      if (sectorTime < d.bestS2) d.bestS2 = sectorTime;
      if (sectorTime < this.state.bestSectors.s2) this.state.bestSectors.s2 = sectorTime;
    }
    d.currentSector = 3;
    d.timeInSector  = 0;

  } else if (d.currentSector === 3) {
    const lapTime = d.timeInLap;

    d.lastS3 = sectorTime;
    if (isValidLap) {
      if (sectorTime < d.bestS3) d.bestS3 = sectorTime;
      if (sectorTime < this.state.bestSectors.s3) this.state.bestSectors.s3 = sectorTime;
    }

    d.lastLap = lapTime;

    if (this.state.session === "race") {
      d.totalRaceTime += lapTime;
    }

    d.currentLap++;
    d.lapsOnTyre++;

    // Mejor vuelta — solo vueltas válidas
    if (isValidLap && lapTime < d.bestLap) {
      d.bestLap = lapTime;
      this._addEvent(`⚡ ${d.driverName} — VR: ${this._fmt(lapTime)}`);
    }

    // Práctica — contadores
    if (this.state.session === "practice") {
      if (d._practiceLapsDone !== undefined) d._practiceLapsDone++;

      d._totalPracticeLaps = (d._totalPracticeLaps || 0) + 1;

      if (d.confidence < 100) {
        d.confidence = Math.min(100, (d.confidence || 0) + 2);
      }

      // Sincronizar lapsDone para desbloqueo de reglajes
      if (typeof practiceSessionState !== "undefined") {
        const ds = practiceSessionState.driverStates?.[d.driverId];
        if (ds) ds.lapsDone = d._totalPracticeLaps;
      }
    }

    if (typeof recordTyreLap === "function") {
      recordTyreLap(d.driverId);
    }

    this._updateERSAndFuel(d, lapTime);
    if (!d.isPlayer) this._aiManageERS(d);

    d.currentSector = 1;
    d.timeInSector  = 0;
    d.timeInLap     = 0;
    d.prevS1 = d.lastS1;
    d.prevS2 = d.lastS2;
    d.prevS3 = d.lastS3;
    d.curS1  = null;
    d.curS2  = null;

    // Pit stop — solo en carrera
    if (this.state.session === "race") {
      if (d.pitLaps?.includes(d.currentLap) || d.pitCall) {
        d.inPit       = true;
        d.pitTimeLeft = 22;
        d.pitStops    = (d.pitStops || 0) + 1;
        d.pitCall     = false;
        this._addEvent(`🔧 ${d.driverName} entra a boxes`);
      }
    }
  }
},

  // ════════════════════════════════════════════════════════
  // HELPERS DE SECTOR
  // ════════════════════════════════════════════════════════

  _getSectorTarget(d, factor, degradationPen) {
  const base = d.currentSector === 1 ? d.s1Base
    : d.currentSector === 2 ? d.s2Base
    : d.s3Base;
  const noise = (Math.random() - 0.5) * 0.25;
  const deg   = degradationPen || 0;

  const ersEffect  = this._getERSEffect(d.ersMode || "neutral");
  const fuelEffect = this._getFuelEffect(d.fuelMode || "neutral");
  // Evolución de pista — tiempos bajan conforme avanza la sesión
let trackEvolution = 1.0;
if (this.state.session === "practice") {
  const sessionProgress = Math.min(1, this.state.currentTime / 3600);
  const baseRubber      = this.state.trackRubber || 0;
  // Mejora máxima: ~1.5% en pista limpia, ~0.8% si ya hay rubber
  const maxImprovement  = 0.015 - baseRubber * 0.5;
  trackEvolution        = 1.0 - (sessionProgress * Math.max(0, maxImprovement));
}
  const ersPerSector  = ersEffect.time  / 3;
  const fuelPerSector = fuelEffect.time / 3;

  // Factor de programa de trabajo (solo en práctica)
  let programFactor = 1.0;
  if (this.state.session === "practice" && d._practicePrograms?.length) {
    const plan = d._practicePrograms[d._practiceProgramIdx];
    if (plan) {
      const circuit  = this.state.circuit;
      const fuelLoad = circuit?.fuelLoad || 105;

      const programFactors = {
        install:       1.08,
        aero_corr:     1.05,
        setup_balance: 1.04,
        tyre_deg:      1.03,
        race_sim:      1.06 + (fuelLoad / 100) * 0.04,
        quali_prep:    0.98,
        cooling:       1.06,
        parts_eval:    1.03,
        wet_test:      1.10,
      };
      programFactor = programFactors[plan.programId] ?? 1.0;
    }
  }

  // Outlap más lenta en práctica y clasificación
  let phaseFactor = factor || 1.0;
  if (this.state.session !== "race") {
    if (d.lapPhase === "outlap") phaseFactor *= 1.08;
    if (d.lapPhase === "inlap")  phaseFactor *= 1.06;
  }

  return (base + noise + deg + ersPerSector + fuelPerSector)
  * phaseFactor
  * programFactor
  * (this.state.session === "practice" ? trackEvolution : 1.0);
},

  // ════════════════════════════════════════════════════════
  // POSICIONES
  // ════════════════════════════════════════════════════════

  _updatePositions() {
  if (this.state.session === "qualifying") {
    const active    = this.drivers.filter((d) => !d.eliminated);
    const eliminated = this.drivers.filter((d) => d.eliminated);

    active.sort((a, b) => {
      if (a.qualifyingBestLap === Infinity) return 1;
      if (b.qualifyingBestLap === Infinity) return -1;
      return a.qualifyingBestLap - b.qualifyingBestLap;
    });

    active.forEach((d, i) => {
      d.position = i + 1;
      d.gap      = i === 0 ? 0 : d.qualifyingBestLap - active[0].qualifyingBestLap;
      d.interval = i === 0 ? 0 : d.qualifyingBestLap - active[i-1].qualifyingBestLap;
    });

    eliminated.forEach((d, i) => {
      d.position = active.length + i + 1;
    });

  } else if (this.state.session === "practice") {
    // En práctica: ordenar por mejor vuelta (como clasificación)
    const onTrack  = this.drivers.filter((d) => !d.dnf && isFinite(d.bestLap));
    const noTime   = this.drivers.filter((d) => !d.dnf && !isFinite(d.bestLap));
    const dnf      = this.drivers.filter((d) => d.dnf);

    onTrack.sort((a, b) => a.bestLap - b.bestLap);

    onTrack.forEach((d, i) => {
      d.position = i + 1;
      d.gap      = i === 0 ? 0 : d.bestLap - onTrack[0].bestLap;
      d.interval = i === 0 ? 0 : d.bestLap - onTrack[i - 1].bestLap;
    });

    noTime.forEach((d, i) => {
      d.position = onTrack.length + i + 1;
      d.gap      = null;
      d.interval = null;
    });

    dnf.forEach((d, i) => {
      d.position = onTrack.length + noTime.length + i + 1;
      d.gap      = null;
      d.interval = null;
    });

  } else {
    const sorted = [...this.drivers].sort((a, b) => {
      if (a.dnf && !b.dnf) return 1;
      if (!a.dnf && b.dnf) return -1;
      const aProgress = a.currentLap + (a.timeInLap / (a.lapTimeBase || 90));
      const bProgress = b.currentLap + (b.timeInLap / (b.lapTimeBase || 90));
      return bProgress - aProgress;
    });

    const leader = sorted.find((d) => !d.dnf);

    sorted.forEach((d, i) => {
      d.position = i + 1;
      if (d.dnf) { d.gap = null; d.interval = null; return; }

      if (leader && d !== leader) {
        const lapDiff = leader.currentLap - d.currentLap;
        d.gap = lapDiff > 0
          ? `+${lapDiff} VTA`
          : d.totalRaceTime - leader.totalRaceTime;
      } else {
        d.gap = 0;
      }

      d.interval = i === 0 ? 0
        : sorted[i-1]?.dnf ? null
        : d.totalRaceTime - sorted[i-1].totalRaceTime;
    });
  }
},

  // ════════════════════════════════════════════════════════
  // FIN DE SESIÓN
  // ════════════════════════════════════════════════════════

  _isSessionFinished() {
  if (this.state.session === "qualifying") {
    return this.state.currentTime >= this.state.sessionDuration;
  } else if (this.state.session === "practice") {
    // 60 minutos = 3600 segundos de simulación
    return this.state.currentTime >= 3600;
  } else {
    const leader = this.drivers.find((d) => !d.dnf);
    return leader && leader.currentLap >= this.state.totalLaps;
  }
},

  _finishSession() {
    if (this.state.session === "qualifying") {
      // Eliminación final de Q2 si no se hizo
      if (this.state.phase === "Q3") {
        // Ya se hicieron las eliminaciones
      }
    }
    this.state.finished = true;
    this.pause();
    this._addEvent(`🏁 Sesión finalizada`);
    if (this.onFinish) this.onFinish(this.state, this.drivers);
  },

  // ════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════

  _addEvent(text) {
    this.state.events.unshift(text);
    if (this.state.events.length > 50) this.state.events.pop();
    if (this.onEvent) this.onEvent(text);
  },

  _fmt(seconds) {
    if (!seconds || !isFinite(seconds)) return "-";
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(3).padStart(6, "0");
    return `${m}:${s}`;
  },

  _shuffleInitialOrder() {
    for (let i = this.drivers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.drivers[i], this.drivers[j]] = [this.drivers[j], this.drivers[i]];
    }
    this.drivers.forEach((d, i) => { d.position = i + 1; });
  },

  _chooseStrategy(driver, team, laps, compounds) {
    const tireManagement = driver?.attributes?.tireManagement || 80;
    const teamPerf       = team?.performance?.overall || 75;

    let startCompound = "medium";
    if (tireManagement >= 90 && Math.random() < 0.25) startCompound = "soft";
    if (teamPerf < 76  && Math.random() < 0.35) startCompound = "hard";

    const secondCompound = startCompound === "soft"
      ? (Math.random() < 0.75 ? "medium" : "hard")
      : startCompound === "medium"
        ? (Math.random() < 0.6  ? "hard"   : "soft")
        : (Math.random() < 0.75 ? "medium" : "soft");

    const pitLap = Math.floor(laps * (0.35 + Math.random() * 0.2));

    return {
      stints:  [
        { compound: startCompound,  laps: pitLap },
        { compound: secondCompound, laps: laps - pitLap },
      ],
      pitLaps: [pitLap],
    };
  },
  // ════════════════════════════════════════════════════════
  // ERS Y COMBUSTIBLE
  // ════════════════════════════════════════════════════════

  _getERSEffect(mode) {
    const effects = {
      recarga:  { time: +0.8, battery: +35 },
      neutral:  { time:  0.0, battery:   0 },
      boost:    { time: -0.3, battery: -30 },
      overtake: { time: -0.6, battery: -50 },
      qualy:    { time: -0.9, battery: -85 },
    };
    return effects[mode] || effects.neutral;
  },

  _getFuelEffect(mode) {
    const effects = {
      ahorro:  { time: +0.4, fuel: -15 },
      neutral: { time:  0.0, fuel:   0 },
      push:    { time: -0.3, fuel: +20 },
    };
    return effects[mode] || effects.neutral;
  },

  _updateERSAndFuel(d, lapTime) {
    const isRace = this.state.session === "race";
    const circuit = this.state.circuit;

    // Consumo de batería por vuelta (porcentaje)
    const ersEffect  = this._getERSEffect(d.ersMode);
    const fuelEffect = this._getFuelEffect(d.fuelMode);

    // Batería
    d.battery += ersEffect.battery;
    d.battery  = Math.min(100, Math.max(0, d.battery));

    // Si se agota batería en modo agresivo → volver a neutral
    if (d.battery <= 5 && (d.ersMode === "boost" || d.ersMode === "overtake" || d.ersMode === "qualy")) {
      d.ersMode = "neutral";
      this._addEvent(`⚡ ${d.driverName} — batería agotada, vuelve a modo neutral`);
    }

    // Recarga parcial en cada vuelta (simulación simplificada de frenadas)
    const rechargeRate = circuit?.ersProfile === "high_demand" ? 8
      : circuit?.ersProfile === "low_demand" ? 15 : 12;
    if (d.ersMode === "recarga") {
      d.battery = Math.min(100, d.battery + rechargeRate);
    } else {
      d.battery = Math.min(100, d.battery + rechargeRate * 0.4);
    }

    // Combustible (solo en carrera)
    if (isRace) {
      const baseFuelPerLap = 100 / (circuit?.laps || 58);
      const fuelUsed = baseFuelPerLap * (1 + fuelEffect.fuel / 100);
      d.fuel -= fuelUsed;
      d.fuel  = Math.max(0, d.fuel);

      // DNF por falta de combustible
      if (d.fuel <= 0 && !d.dnf) {
        d.dnf     = true;
        d.dnfReason = "sin combustible";
        this._addEvent(`🚨 ${d.driverName} abandona — sin combustible`);
      }
    }
  },

  _aiManageERS(d) {
    const isRace = this.state.session === "race";
    const lapsLeft = this.state.totalLaps - d.currentLap;

    if (!isRace) {
      // Clasificación — siempre qualy en push
      d.ersMode  = "qualy";
      d.fuelMode = "push";
      return;
    }

    // Carrera — gestión inteligente
    // Si está en zona de puntos y tiene batería → boost
    if (d.battery > 40 && d.position <= 10) {
      d.ersMode = "boost";
    } else if (d.battery < 20) {
      d.ersMode = "recarga";
    } else {
      d.ersMode = "neutral";
    }

    // Gestión de combustible
    if (d.fuel < 20 && lapsLeft > 10) {
      d.fuelMode = "ahorro";
      this._addEvent(`⛽ ${d.driverName} — modo ahorro de combustible`);
    } else if (d.fuel > 60 && lapsLeft < 20) {
      d.fuelMode = "push";
    } else {
      d.fuelMode = "neutral";
    }
  },

  _aiShouldGoOut(d, timeLeft) {
    // No hay tiempo suficiente para otro intento
    const lapTimeEstimate = d.lapTimeBase * 3; // outlap + push + inlap
    if (timeLeft < lapTimeEstimate + 30) return false;

    // Ya tiene un tiempo y está cómodamente clasificado
    if (d.qualifyingBestLap < Infinity) {
      const active = this.drivers.filter((dd) => !dd.eliminated);
      const sorted = [...active].sort((a, b) => a.qualifyingBestLap - b.qualifyingBestLap);
      const myPos  = sorted.findIndex((dd) => dd.driverId === d.driverId) + 1;
      const cutPos = this.state.phase === "Q1" ? 16
        : this.state.phase === "Q2" ? 10 : 0;

      // Si está muy cubierto y le queda poco tiempo → no sale
      if (myPos <= cutPos - 4 && timeLeft < 300) return false;

      // Si está en zona segura con bastante margen → puede guardarse neumáticos
      if (myPos <= cutPos - 2 && Math.random() < 0.4) return false;
    }

    // Equipos débiles hacen más intentos
    const isWeakTeam = d.combinedScore < 80;
    if (isWeakTeam) return timeLeft > lapTimeEstimate + 60;

    return true;
  },
};
