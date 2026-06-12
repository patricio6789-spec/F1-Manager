const fs = require("fs");
const path = require("path");

let teams = [];
let drivers = [];
let selectedTeam = null;
let activeUpgrades = [];
let rivalUpgrades = [];
let news = [];
let playerStrategies = {};
let currentDate = "2026-01-01";
let currentRound = 0;
let driverStandings = [];
let constructorStandings = [];
let currentRaceData = null;
let qualifyingResults = null;
let raceWeather = "dry";
let testingState = null;
let testingGains = { aero: 0, chassis: 0, reliability: 0, pitStop: 0 };
let transactions = [];
let seasonEconomics = null;
let engineers = [];
let agreedTransfers = [];
let gardeningEngineers = [];
let currentNegotiation = null;
let practiceData = null;
let raceStrategy = null;
let compounds = [];
let currentRaceDecision = null;
let driverResultsHistory = {};
let sponsors = [];
let pendingEvents = [];
let regulations = null;
let usedDevelopmentTokens = { aero: 0, chassis: 0, powerUnit: 0 };
let racePenalties = [];
let tyreInventories = {};
let playerTeamId = null;
let aduoData = {
  measured: false,
  manufacturerScores: {},
  allowedUpgrades: {}
};


const PIT_STOP_LOSS = 22.5;
const WEATHER_STATES = {
  dry:       { label: "Seco",             icon: "☀️",  tyreSuggestion: ["soft","medium","hard"] },
  cloudy:    { label: "Nublado",          icon: "⛅",  tyreSuggestion: ["medium","hard"] },
  light_rain:{ label: "Lluvia ligera",    icon: "🌦️", tyreSuggestion: ["intermediate"] },
  heavy_rain:{ label: "Lluvia intensa",   icon: "🌧️", tyreSuggestion: ["wet"] },
  mixed:     { label: "Cambiante",        icon: "🌀",  tyreSuggestion: ["intermediate","medium"] },
};

const SC_TYPES = {
  none:    { label: "Sin incidente",        duration: 0 },
  vsc:     { label: "Virtual Safety Car",   duration: 2 },
  sc:      { label: "Safety Car",           duration: 4 },
  red_flag:{ label: "Bandera Roja",         duration: 0 },
};
const TYRE_COMPOUNDS = {
  soft:   { name: "Soft",   minPitLapFactor: 0.25, maxPitLapFactor: 0.45, paceBonus: -0.3, degradation: 0.06 },
  medium: { name: "Medium", minPitLapFactor: 0.35, maxPitLapFactor: 0.65, paceBonus:  0.0, degradation: 0.04 },
  hard:   { name: "Hard",   minPitLapFactor: 0.45, maxPitLapFactor: 0.75, paceBonus:  0.4, degradation: 0.02 },
};

function loadJson(fileName) {
  const filePath = path.join(__dirname, "data", fileName);
  const rawData = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(rawData);
}

function loadGameData() {
  try {
    teams = loadJson("teams.json");
    drivers = loadJson("drivers.json");

    try {
      regulations = loadJson("regulations.json");
    } catch (e) {
      console.warn("No se pudo cargar regulations.json, usando valores por defecto.");
      regulations = getDefaultRegulations();
    }

    console.log("Equipos cargados:", teams);
    console.log("Pilotos cargados:", drivers);

    return true;
  } catch (error) {
    console.error("Error cargando datos:", error);
    alert(
      "Error cargando datos del juego.\n\n" +
      "Revisá que existan estos archivos:\n" +
      "- data/teams.json\n" +
      "- data/drivers.json\n\n" +
      "Detalle técnico:\n" +
      error.message
    );
    return false;
  }
}

function getDefaultRegulations() {
  return {
    season: 2026,
    technical: {
      developmentTokens: { aero: 5, chassis: 4, powerUnit: 3 },
      costCap: 215000000,
      minWeight: 800,
      drs: { active: true, zones: 2 },
      aduo: { active: true, measurementRaces: 6, threshold1: 2, threshold2: 4 }
    },
    sporting: {
      pointsSystem: {
        "1": 25, "2": 18, "3": 15, "4": 12, "5": 10,
        "6": 8, "7": 6, "8": 4, "9": 2, "10": 1,
        "pole": 0, "fastestLap": 0
      },
      sprintWeekends: false,
      qualifyingFormat: "q1q2q3",
      preseason: { circuits: 1, days: 3 }
    },
    governance: {
      regulationCycleYears: 5,
      currentCycleStart: 2026,
      pendingVotes: []
    }
  };
}

function initTyreInventory(driverId, circuit) {
  const compounds = circuit?.compounds || ["C3", "C4", "C5"];
  const softId    = compounds[0]; // más blando
  const mediumId  = compounds[1];
  const hardId    = compounds[2];

  // Sets disponibles según reglamento 2026
  // Blando: 8, Medio: 4, Duro: 3
  // Todos nuevos al inicio del fin de semana
  return {
    driverId,
    sets: {
      [softId]:  { total: 8, used: 0, sets: Array(8).fill({ laps: 0, new: true }) },
      [mediumId]: { total: 4, used: 0, sets: Array(4).fill({ laps: 0, new: true }) },
      [hardId]:  { total: 3, used: 0, sets: Array(3).fill({ laps: 0, new: true }) },
    },
    // Set montado actualmente
    mounted: { compound: softId, laps: 0, isNew: true, setIndex: 0 },
  };
}

function getTyreInventory(driverId) {
  if (!tyreInventories[driverId]) {
    const circuit = currentRaceData?.circuit;
    tyreInventories[driverId] = initTyreInventory(driverId, circuit);
  }
  return tyreInventories[driverId];
}

function useTyreSet(driverId, compoundId, setIndex) {
  const inv = getTyreInventory(driverId);
  if (!inv.sets[compoundId]) return false;

  const set = inv.sets[compoundId].sets[setIndex];
  if (!set) return false;

  inv.mounted = {
    compound: compoundId,
    laps:     set.laps,
    isNew:    set.laps === 0,
    setIndex,
  };

  return true;
}

function recordTyreLap(driverId) {
  const inv = getTyreInventory(driverId);
  if (!inv.mounted) return;

  const { compound, setIndex } = inv.mounted;
  inv.mounted.laps++;
  inv.mounted.isNew = false;

  if (inv.sets[compound]?.sets[setIndex]) {
    inv.sets[compound].sets[setIndex] = {
      laps: inv.mounted.laps,
      new:  false,
    };
  }
}

function calculateTyreDegradation(driverId, compoundId, lapsOnTyre, circuit, driver) {
  const compoundData = window.compounds?.find((c) => c.id === compoundId);
  const tyreStress   = circuit?.tyreStress || 0.65;
  const trackTempMax = circuit?.trackTemp?.max || 35;

  // Factor de temperatura — más calor = más degradación
  const tempFactor = 1 + (trackTempMax - 30) / 100;

  // Softness del compuesto — C1=1.0, C5=0.30
  const softness = compoundData?.softness || 0.60;

  // Agresividad del piloto (aggression 70-90 → factor 0.95-1.05)
  const driverObj      = window.drivers?.find((d) => d.id === driverId);
  const aggression     = driverObj?.attributes?.aggression || 75;
  const driverFactor   = 0.90 + (aggression / 100) * 0.20;

  // Degradación base por vuelta
  const baseDeg = softness * tyreStress * tempFactor * driverFactor * 0.15;

  // Tiempo extra por lap según desgaste acumulado
  // Primeras vueltas casi sin degradación, luego aumenta
  const degradationPenalty = baseDeg * lapsOnTyre;

  // Penalización por neumático usado vs nuevo
  // Si el set tiene vueltas previas, empieza ya degradado
  const inv = tyreInventories[driverId];
  const prevLaps = inv?.mounted?.laps || 0;
  const usedPenalty = prevLaps > 0 ? prevLaps * baseDeg * 0.8 : 0;

  return degradationPenalty + usedPenalty;
}

function calculateADUO() {
  if (!regulations?.technical?.aduo?.active) return;
  if (currentRound < regulations.technical.aduo.measurementRaces) return;
  if (aduoData.measured) return;

  const manufacturers = {};

  // Recopilar datos de rendimiento en pista por fabricante
  teams.forEach((team) => {
    const manufacturer = team.powerUnit?.manufacturer;
    if (!manufacturer) return;

    if (!manufacturers[manufacturer]) {
      manufacturers[manufacturer] = {
        puOverall:   team.powerUnit.overall,
        racePoints:  0,
        raceCount:   0,
        teamCount:   0,
      };
    }

    // Sumar puntos reales de las primeras N carreras
    const teamDriversList = drivers.filter((d) => d.teamId === team.id);
    teamDriversList.forEach((driver) => {
      const history = driverResultsHistory[driver.id] || [];
      const recent  = history.slice(-regulations.technical.aduo.measurementRaces);
      manufacturers[manufacturer].racePoints += recent.reduce(
        (sum, r) => sum + (r.points || 0), 0
      );
      manufacturers[manufacturer].raceCount += recent.length;
    });

    manufacturers[manufacturer].teamCount++;
  });

  // Calcular score combinado por fabricante
  // 60% rendimiento base del motor + 40% puntos en pista normalizados
  const maxPoints = Math.max(
    ...Object.values(manufacturers).map((m) => m.racePoints || 1)
  );

  Object.keys(manufacturers).forEach((manufacturer) => {
    const m = manufacturers[manufacturer];
    const normalizedPoints = maxPoints > 0 ? (m.racePoints / maxPoints) * 100 : 50;
    m.combinedScore = Math.round(m.puOverall * 0.6 + normalizedPoints * 0.4);
  });

  // Encontrar el mejor fabricante como referencia
  const bestScore = Math.max(
    ...Object.values(manufacturers).map((m) => m.combinedScore)
  );

  // Calcular diferencia porcentual y asignar mejoras permitidas
  const allowedUpgrades = {};
  Object.keys(manufacturers).forEach((manufacturer) => {
    const score = manufacturers[manufacturer].combinedScore;
    const diffPct = ((bestScore - score) / bestScore) * 100;

    let upgrades = 0;
    if (diffPct >= regulations.technical.aduo.threshold2) upgrades = 2;
    else if (diffPct >= regulations.technical.aduo.threshold1) upgrades = 1;

    allowedUpgrades[manufacturer] = {
      diffPct:        Math.round(diffPct * 10) / 10,
      upgradesAllowed: upgrades,
      upgradesUsed:    0,
      combinedScore:  manufacturers[manufacturer].combinedScore,
    };
  });

  aduoData = {
    measured:           true,
    manufacturerScores: manufacturers,
    allowedUpgrades,
  };

  // Noticia sobre el ADUO
  const beneficiaries = Object.entries(allowedUpgrades)
    .filter(([, v]) => v.upgradesAllowed > 0)
    .map(([k, v]) => `${k} (${v.upgradesAllowed} mejora${v.upgradesAllowed > 1 ? "s" : ""})`);

  if (beneficiaries.length > 0) {
    addNews(
      "🔧 Reglamento",
      `La FIA activa el sistema ADUO tras ${regulations.technical.aduo.measurementRaces} carreras`,
      `Tras analizar las diferencias de rendimiento entre fabricantes de motores, la FIA ha habilitado mejoras de unidad de potencia para: ${beneficiaries.join(", ")}. Los fabricantes afectados podrán introducir actualizaciones de motor durante el resto de la temporada para reducir la brecha.`
    );
  } else {
    addNews(
      "🔧 Reglamento",
      `Sistema ADUO: todos los motores dentro del margen permitido`,
      `La FIA ha completado la medición de rendimiento tras las primeras ${regulations.technical.aduo.measurementRaces} carreras. Ningún fabricante supera el umbral del ${regulations.technical.aduo.threshold1}% de diferencia, por lo que no se habilitarán mejoras de motor por esta vía.`
    );
  }

  saveCurrentGame();
}

function applyADUOUpgrade(manufacturer, upgradeType) {
  if (!aduoData.measured) return false;

  const data = aduoData.allowedUpgrades[manufacturer];
  if (!data) return false;
  if (data.upgradesUsed >= data.upgradesAllowed) return false;

  // Aplicar mejora a todos los equipos con ese fabricante
  teams.forEach((team) => {
    if (team.powerUnit?.manufacturer !== manufacturer) return;

    if (upgradeType === "power") {
      team.powerUnit.power       = Math.min(99, team.powerUnit.power + 2);
      team.powerUnit.deployment  = Math.min(99, team.powerUnit.deployment + 1);
    }
    if (upgradeType === "reliability") {
      team.powerUnit.reliability = Math.min(99, team.powerUnit.reliability + 3);
    }

    // Recalcular overall de la UP
    team.powerUnit.overall = Math.round(
      team.powerUnit.power       * 0.40 +
      team.powerUnit.deployment  * 0.35 +
      team.powerUnit.reliability * 0.25
    );
  });

  data.upgradesUsed++;

  addNews(
    "🔧 Motor",
    `${manufacturer} introduce mejora de motor vía ADUO`,
    `${manufacturer} ha utilizado una de sus mejoras de unidad de potencia habilitadas por el sistema ADUO. Los equipos que usan motores ${manufacturer} notarán una mejora en ${upgradeType === "power" ? "potencia y despliegue" : "fiabilidad"} a partir de ahora.`
  );

  syncSelectedTeamWithTeams();
  saveCurrentGame();
  return true;
}

function showScreen(screenId) {
  const targetScreen = document.getElementById(screenId);

  if (!targetScreen) {
    alert(
      "No se encontró la pantalla: " + screenId +
      "\n\nRevisá que exista en index.html una sección con id='" + screenId + "'."
    );
    console.error("Pantalla no encontrada:", screenId);
    return;
  }

  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  targetScreen.classList.add("active");
}

function nuevaPartida() {
  const loaded = loadGameData();

  if (!loaded) return;

  selectedTeam = null;

  const confirmPanel = document.getElementById("confirmPanel");
  if (confirmPanel) {
    confirmPanel.classList.remove("active");
  }

  renderTeamSelection();
  showScreen("teamSelection");
}

function cargarPartida() {
  alert("No hay partidas guardadas todavía.");
}

function volverAlMenu() {
  selectedTeam = null;

  const confirmPanel = document.getElementById("confirmPanel");
  if (confirmPanel) {
    confirmPanel.classList.remove("active");
  }

  showScreen("mainMenu");
}

function getDriversByTeam(team) {
  return drivers.filter((driver) => team.drivers.includes(driver.id));
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function renderTeamSelection() {
  const grid = document.getElementById("teamsGrid");

  if (!grid) {
    alert("No se encontró el contenedor teamsGrid en index.html");
    return;
  }

  grid.innerHTML = "";

  teams.forEach((team) => {
    const teamDrivers = getDriversByTeam(team);

    const card = document.createElement("div");
    card.className = "team-card";
    card.style.borderLeftColor = team.color;

    card.innerHTML = `
      <div class="team-name">${team.name}</div>
      <div class="team-meta">${team.nationality} · Motor ${team.engine}</div>

      <div class="drivers">
        ${teamDrivers
          .map(
            (driver) => `
              <div class="driver">#${driver.number} — ${driver.name}</div>
            `
          )
          .join("")}
      </div>

      <div class="stats">
        <div class="stat">
          Performance
          <strong>${team.performance.overall}</strong>
        </div>

        <div class="stat">
          Presupuesto
          <strong>${formatMoney(team.budget)}</strong>
        </div>

        <div class="stat">
          Aero
          <strong>${team.performance.aero}</strong>
        </div>

        <div class="stat">
          Fiabilidad
          <strong>${team.performance.reliability}</strong>
        </div>
      </div>
    `;

    card.onclick = () => selectTeam(team.id);

    grid.appendChild(card);
  });
}

function selectTeam(teamId) {
  selectedTeam = teams.find((team) => team.id === teamId);

  if (!selectedTeam) return;

  const teamDrivers = getDriversByTeam(selectedTeam);

  document.getElementById("confirmTitle").textContent =
    selectedTeam.shortName;

  document.getElementById("confirmText").innerHTML = `
    Vas a iniciar la temporada 2026 con <strong>${selectedTeam.name}</strong>.<br><br>
    Pilotos: ${teamDrivers.map((d) => d.name).join(" y ")}.<br>
    Motor: ${selectedTeam.engine}.<br>
    Presupuesto inicial: ${formatMoney(selectedTeam.budget)}.
  `;

  document.getElementById("confirmPanel").classList.add("active");
}

function confirmarEquipo() {
  if (!selectedTeam) return;

  const teamDrivers = getDriversByTeam(selectedTeam);

  let season = null;

  try {
    season = loadJson("season.json");
  } catch (error) {
    console.error("No se pudo cargar season.json:", error);
  }

  engineers = [];
agreedTransfers = [];
gardeningEngineers = [];
currentNegotiation = null;
  activeUpgrades = [];
rivalUpgrades = [];
news = [];
playerStrategies = {};
currentDate = "2026-01-01";
currentRound = 0;
driverStandings = initDriverStandings();
constructorStandings = initConstructorStandings();
currentRaceData = null;
qualifyingResults = null;
transactions = [];
seasonEconomics = initSeasonEconomics();
loadSponsors();

  const saveData = {
  version: "0.7",
  createdAt: new Date().toISOString(),
  season: 2026,
  playerTeamId: selectedTeam.id,
  playerTeamName: selectedTeam.name,
  currentDate,
  currentRound,
  activeUpgrades,
  rivalUpgrades,
  news,
  teams,
  drivers,
  driverStandings,
  constructorStandings,
  transactions,
  seasonEconomics,
  engineers,
agreedTransfers,
gardeningEngineers,
playerStrategies,
};

  try {
    const savesDir = path.join(__dirname, "saves");

    if (!fs.existsSync(savesDir)) {
      fs.mkdirSync(savesDir);
    }

    const savePath = path.join(savesDir, "autosave.json");
    fs.writeFileSync(savePath, JSON.stringify(saveData, null, 2));

    renderManagerDashboard(selectedTeam, teamDrivers, season);

    showScreen("gameScreen");
  } catch (error) {
    console.error("Error guardando partida:", error);
    alert("No se pudo guardar la partida.\n\n" + error.message);
  }
 }

function renderManagerDashboard(team, teamDrivers, season) {
  if (!team) return;
  document.getElementById("dashboardTeamName").textContent = team.name;
  document.getElementById("dashboardDate").textContent = formatDateAR(currentDate);

  document.getElementById("summaryTeam").textContent = team.name;
  document.getElementById("summaryEngine").textContent = team.engine;
  document.getElementById("summaryDrivers").textContent =
    teamDrivers.map((driver) => driver.name).join(" / ");
  document.getElementById("summaryBudget").textContent = formatMoney(team.budget);

  setCarPerformance(team.performance);

  if (season && season.calendar && season.calendar.length > 0) {
    const nextRace = season.calendar.find((r) => r.round > currentRound);

    if (nextRace) {
      document.getElementById("nextEventTitle").textContent = nextRace.name;
      document.getElementById("nextEventInfo").textContent =
        `Ronda ${nextRace.round} — Fecha: ${nextRace.date}`;
      document.getElementById("nextEventSprint").textContent =
        nextRace.sprint ? "Formato: fin de semana Sprint" : "Formato: fin de semana tradicional";
    } else {
      document.getElementById("nextEventTitle").textContent = "Temporada finalizada";
      document.getElementById("nextEventInfo").textContent = "Todas las carreras han sido disputadas.";
      document.getElementById("nextEventSprint").textContent = "";
    }
  } else {
    document.getElementById("nextEventTitle").textContent = "Calendario no cargado";
    document.getElementById("nextEventInfo").textContent =
      "No se pudo leer season.json.";
    document.getElementById("nextEventSprint").textContent = "";
  }

  document.getElementById("seasonObjective").textContent =
    getSeasonObjective(team);

  updateNewsBadge();
}

function setCarPerformance(performance) {
  document.getElementById("carOverall").textContent = performance.overall;
  document.getElementById("carAero").textContent = performance.aero;
  document.getElementById("carChassis").textContent = performance.chassis;
  document.getElementById("carReliability").textContent = performance.reliability;

  document.getElementById("barOverall").style.width = performance.overall + "%";
  document.getElementById("barAero").style.width = performance.aero + "%";
  document.getElementById("barChassis").style.width = performance.chassis + "%";
  document.getElementById("barReliability").style.width = performance.reliability + "%";
}

function getSeasonObjective(team) {
  const overall = team.performance.overall;

  if (overall >= 90) {
    return "Objetivo: luchar por victorias, podios frecuentes y campeonato de constructores.";
  }

  if (overall >= 82) {
    return "Objetivo: consolidarse en zona de puntos, buscar podios aislados y terminar entre los mejores equipos del campeonato.";
  }

  if (overall >= 78) {
    return "Objetivo: pelear regularmente por puntos, mejorar el coche durante la temporada y acercarse al grupo medio-alto.";
  }

  if (overall >= 74) {
    return "Objetivo: sumar puntos cuando haya oportunidades, mejorar fiabilidad y desarrollar una base sólida para 2027.";
  }

  return "Objetivo: sobrevivir al primer año, construir infraestructura, reducir errores y preparar el crecimiento a mediano plazo.";
}

function openModule(moduleName) {
  console.log("Módulo clickeado:", moduleName);
  if (moduleName === "Calendario") {
    renderCalendarModule();
    showScreen("calendarScreen");
    return;
  }

  if (moduleName === "Coche") {
    renderCarModule();
    showScreen("carScreen");
    return;
  }

  if (moduleName === "Desarrollo") {
    renderDevelopmentModule();
    showScreen("developmentScreen");
    return;
  }

  if (moduleName === "Noticias") {
    renderNewsModule();
    showScreen("newsScreen");
    return;
  }

  if (moduleName === "Standings") {
  renderStandings();
  showScreen("standingsScreen");
  return;
}
if (moduleName === "Ingenieros") {
  renderEngineersModule();
  showScreen("engineersScreen");
  return;
}
if (moduleName === "Mercado") {
  openMarket();
  return;
}
if (moduleName === "Pilotos") {
  renderDriversModule();
  showScreen("driversScreen");
  return;
}
if (moduleName === "Finanzas") {
  renderFinancesModule();
  showScreen("financesScreen");
  return;
}
if (moduleName === "FinTemporada") {
  openEndOfSeason();
  return;
}
if (moduleName === "Testing") {
  openTesting();
  return;
}

if (moduleName === "Sponsors") {
  renderSponsorsModule();
  showScreen("sponsorsScreen");
  return;
}

if (moduleName === "Carrera") {
  openPracticeWeekend();
  return;
}

if (moduleName === "Reglamento") {
  renderRegulationsModule();
  showScreen("regulationsScreen");
  return;
}

  alert(
    "Módulo todavía no disponible: " +
    moduleName +
    "\n\nPróximo paso: construiremos este módulo como pantalla interna del juego."
  );
}
function renderCalendarModule() {
  const calendarList = document.getElementById("calendarList");

  if (!calendarList) {
    alert("No se encontró el contenedor calendarList.");
    return;
  }

  let season = null;
  let circuits = [];

  try {
    season = loadJson("season.json");
    circuits = loadJson("circuits.json");
  } catch (error) {
    alert("No se pudo cargar el calendario.\n\n" + error.message);
    return;
  }

  calendarList.innerHTML = "";

  season.calendar.forEach((race) => {
    const circuit = circuits.find((c) => c.id === race.circuitId);

    const card = document.createElement("div");
    card.className = "calendar-race-card";

    card.innerHTML = `
      <strong>Ronda ${race.round} — ${race.name}</strong>
      <span>Fecha: ${race.date}</span>
      <span>Circuito: ${circuit ? circuit.name : "No encontrado"}</span>
      <span>País: ${circuit ? circuit.country : "-"}</span>
      <span>Vueltas: ${circuit ? circuit.laps : "-"}</span>
      <span>Longitud: ${circuit ? circuit.length + " km" : "-"}</span>
      <span>Degradación: ${circuit ? circuit.degradation : "-"}</span>
      <span>Adelantamiento: ${circuit ? circuit.overtaking : "-"}</span>
      ${race.sprint ? `<div class="sprint-badge">SPRINT</div>` : ""}
    `;

    calendarList.appendChild(card);
  });
}function renderCarModule() {
  if (!selectedTeam) {
    alert("No hay equipo seleccionado.");
    return;
  }

  const performance = selectedTeam.performance;

  document.getElementById("carScreenSubtitle").textContent =
    `Análisis técnico de ${selectedTeam.name}`;

  document.getElementById("carModuleTeamName").textContent = selectedTeam.name;
  document.getElementById("carModuleEngine").textContent =
    `Motor: ${selectedTeam.engine}`;

  document.getElementById("moduleOverall").textContent = performance.overall;
  document.getElementById("moduleAero").textContent = performance.aero;
  document.getElementById("moduleChassis").textContent = performance.chassis;
  document.getElementById("moduleReliability").textContent = performance.reliability;
  document.getElementById("modulePitStop").textContent = performance.pitStop;

  document.getElementById("technicalDiagnosis").textContent =
    getTechnicalDiagnosis(selectedTeam);

  renderTechnicalRanking();
}

function renderTechnicalRanking() {
  const rankingBody = document.getElementById("technicalRankingBody");

  if (!rankingBody) {
    alert("No se encontró technicalRankingBody.");
    return;
  }

  const sortedTeams = [...teams].sort((a, b) => {
    return b.performance.overall - a.performance.overall;
  });

  rankingBody.innerHTML = "";

  sortedTeams.forEach((team, index) => {
    const row = document.createElement("tr");

    if (selectedTeam && team.id === selectedTeam.id) {
      row.classList.add("player-team-row");
    }

    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${team.name}</td>
      <td>${team.engine}</td>
      <td>${team.performance.overall}</td>
      <td>${team.performance.aero}</td>
      <td>${team.performance.chassis}</td>
      <td>${team.performance.reliability}</td>
      <td>${team.performance.pitStop}</td>
    `;

    rankingBody.appendChild(row);
  });
}

function getTechnicalDiagnosis(team) {
  const p = team.performance;

  const strengths = [];
  const weaknesses = [];

  if (p.aero >= p.overall) strengths.push("buena base aerodinámica");
  else weaknesses.push("aerodinámica por debajo del promedio del coche");

  if (p.chassis >= p.overall) strengths.push("chasis competitivo");
  else weaknesses.push("chasis con margen de mejora");

  if (p.reliability >= p.overall) strengths.push("fiabilidad sólida");
  else weaknesses.push("riesgo de problemas de fiabilidad");

  if (p.pitStop >= p.overall) strengths.push("operativa de boxes fuerte");
  else weaknesses.push("pit stops mejorables");

  let diagnosis = "";

  if (p.overall >= 90) {
    diagnosis += "El coche parte como una referencia de la parrilla. Tiene nivel para luchar por victorias desde el inicio de la temporada. ";
  } else if (p.overall >= 82) {
    diagnosis += "El coche tiene una base competitiva de zona media-alta. Puede pelear puntos con regularidad y aprovechar carreras caóticas para buscar podios. ";
  } else if (p.overall >= 78) {
    diagnosis += "El coche está en el grupo medio. La prioridad debería ser encontrar una dirección de desarrollo clara para acercarse a los equipos de punta. ";
  } else if (p.overall >= 74) {
    diagnosis += "El coche parte en la zona baja-media. El objetivo realista es sumar puntos cuando se abran oportunidades y mejorar durante el año. ";
  } else {
    diagnosis += "El coche parte como uno de los más débiles de la parrilla. La prioridad debe ser fiabilidad, correlación técnica y desarrollo a mediano plazo. ";
  }

  diagnosis += "Fortalezas detectadas: " + strengths.join(", ") + ". ";
  diagnosis += "Áreas débiles: " + weaknesses.join(", ") + ".";

  return diagnosis;
}function renderDevelopmentModule() {
  if (!selectedTeam) {
    alert("No hay equipo seleccionado.");
    return;
  }

  let upgrades = [];

  try {
    upgrades = loadJson("upgrades.json");
  } catch (error) {
    alert("No se pudo cargar upgrades.json.\n\n" + error.message);
    return;
  }

  document.getElementById("developmentSubtitle").textContent =
    `Mejoras disponibles para ${selectedTeam.name} — Fecha: ${formatDateAR(currentDate)}`;

  document.getElementById("developmentBudget").textContent =
    formatMoney(selectedTeam.budget);

  renderDevelopmentCarStats();
  renderActiveUpgrades();
  renderUpgradesList(upgrades);
}

function renderDevelopmentCarStats() {
  const container = document.getElementById("developmentCarStats");
  if (!container) return;

  const p = selectedTeam.performance;
  const tokens = regulations?.technical?.developmentTokens || 
    { aero: 99, chassis: 99, powerUnit: 99 };

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <div class="development-stat">
        <span>General</span>
        <strong>${p.overall}</strong>
      </div>
      <div class="development-stat">
        <span>Aerodinámica</span>
        <strong>${p.aero}</strong>
        <span style="color:${usedDevelopmentTokens.aero >= tokens.aero ? '#e10600' : '#4caf50'};
          font-size:11px;">
          Tokens: ${usedDevelopmentTokens.aero}/${tokens.aero}
        </span>
      </div>
      <div class="development-stat">
        <span>Chasis / Pit Stop</span>
        <strong>${p.chassis}</strong>
        <span style="color:${usedDevelopmentTokens.chassis >= tokens.chassis ? '#e10600' : '#4caf50'};
          font-size:11px;">
          Tokens: ${usedDevelopmentTokens.chassis}/${tokens.chassis}
        </span>
      </div>
      <div class="development-stat">
        <span>Fiabilidad / Motor</span>
        <strong>${p.reliability}</strong>
        <span style="color:${usedDevelopmentTokens.powerUnit >= tokens.powerUnit ? '#e10600' : '#4caf50'};
          font-size:11px;">
          Tokens: ${usedDevelopmentTokens.powerUnit}/${tokens.powerUnit}
        </span>
      </div>
    </div>
  `;
}

function renderUpgradesList(upgrades) {
  const list = document.getElementById("upgradesList");

  if (!list) {
    alert("No se encontró upgradesList.");
    return;
  }

  list.innerHTML = "";

  const activeUpgradeIds = activeUpgrades.map((upgrade) => upgrade.upgradeId);

  const availableUpgrades = upgrades.filter((upgrade) => {
    return !activeUpgradeIds.includes(upgrade.id);
  });

  if (availableUpgrades.length === 0) {
    list.innerHTML = `
      <div class="upgrade-card disabled">
        <h4>No hay mejoras disponibles</h4>
        <p>Todas las mejoras posibles ya están en desarrollo. Esperá a que finalicen para seguir evolucionando el coche.</p>
      </div>
    `;
    return;
  }

  availableUpgrades.forEach((upgrade) => {
    const canAfford = selectedTeam.budget >= upgrade.cost;

    const card = document.createElement("div");
    card.className = canAfford ? "upgrade-card" : "upgrade-card disabled";

    card.innerHTML = `
      <h4>${upgrade.name}</h4>
      <p>${upgrade.description}</p>

      <div class="upgrade-meta">
        <div>
          Área
          <strong>${translateArea(upgrade.area)}</strong>
        </div>

        <div>
          Costo
          <strong>${formatMoney(upgrade.cost)}</strong>
        </div>

        <div>
          Duración
          <strong>${upgrade.days} días</strong>
        </div>

        <div>
          Efecto
          <strong>+${upgrade.effect}</strong>
        </div>

        <div>
          Riesgo
          <strong>${translateRisk(upgrade.risk)}</strong>
        </div>
      </div>

      <button class="btn" ${canAfford ? "" : "disabled"}>
        ${canAfford ? "INICIAR DESARROLLO" : "SIN PRESUPUESTO"}
      </button>
    `;

    const button = card.querySelector("button");

    if (canAfford) {
      button.addEventListener("click", () => {
        applyUpgrade(upgrade);
      });
    }

    list.appendChild(card);
  });
}

function applyUpgrade(upgrade) {
  if (!selectedTeam) return;

  const confirmUpgrade = confirm(
    `¿Iniciar desarrollo?\n\n` +
    `${upgrade.name}\n` +
    `Costo: ${formatMoney(upgrade.cost)}\n` +
    `Duración: ${upgrade.days} días\n` +
    `Efecto esperado: +${upgrade.effect} en ${translateArea(upgrade.area)}\n\n` +
    `La mejora se aplicará cuando finalice el desarrollo.`
  );

  if (!confirmUpgrade) return;
  // Verificar tokens disponibles
  const tokenKey = upgrade.area === "aero" ? "aero"
    : upgrade.area === "reliability" ? "powerUnit"
    : "chassis";

  const used      = usedDevelopmentTokens[tokenKey] || 0;
  const maxTokens = regulations?.technical?.developmentTokens?.[tokenKey] || 99;

  if (used >= maxTokens) {
    alert(
      `No podés iniciar este desarrollo.\n\n` +
      `Límite de tokens para ${translateArea(upgrade.area)}: ${maxTokens}\n` +
      `Ya usaste: ${used} token${used !== 1 ? "s" : ""}\n\n` +
      `El reglamento limita la cantidad de mejoras por área durante la temporada.`
    );
    return;
  }

  if (selectedTeam.budget < upgrade.cost) {
    alert("No tenés presupuesto suficiente para esta mejora.");
    return;
  }

  selectedTeam.budget -= upgrade.cost;

  activeUpgrades.push({
    id: Date.now(),
    upgradeId: upgrade.id,
    name: upgrade.name,
    area: upgrade.area,
    cost: upgrade.cost,
    totalDays: upgrade.days,
    daysRemaining: upgrade.days,
    effect: upgrade.effect,
    risk: upgrade.risk,
    description: upgrade.description,
    startedAt: currentDate,
    status: "in_progress",
  });

addNews(
  "Rumor técnico",
  `${selectedTeam.shortName} prepara un paquete de ${translateArea(upgrade.area)}`,
  `Según versiones que circulan en el paddock, ${selectedTeam.shortName} estaría trabajando sobre ${upgrade.name.toLowerCase()}. Algunas fuentes creen que podría tratarse de ${getApproximateDevelopmentTime(upgrade.days)}, aunque el equipo no confirmó plazos, detalles técnicos ni el alcance real de la actualización.`
);
  syncSelectedTeamWithTeams();
  saveCurrentGame();
  renderDevelopmentModule();

  alert(
    `Desarrollo iniciado:\n\n` +
    `${upgrade.name}\n\n` +
    `Días restantes: ${upgrade.days}`
  );
}

function recalculateOverallPerformance() {
  const p = selectedTeam.performance;

  const newOverall = Math.round(
    p.aero * 0.35 +
    p.chassis * 0.25 +
    p.reliability * 0.2 +
    p.pitStop * 0.2
  );

  p.overall = Math.min(100, newOverall);
}

function syncSelectedTeamWithTeams() {
  const index = teams.findIndex((team) => team.id === selectedTeam.id);

  if (index !== -1) {
    teams[index] = selectedTeam;
  }
}

function saveCurrentGame() {
  try {
    if (!selectedTeam) {
      console.warn("saveCurrentGame cancelado: no hay equipo seleccionado todavía.");
      return;
    }

    const saveData = {
      version: "0.8",
      updatedAt: new Date().toISOString(),
      season: 2026,
      playerTeamId: selectedTeam.id,
      playerTeamName: selectedTeam.name,
      currentDate,
      currentRound,
      activeUpgrades,
      rivalUpgrades,
      playerStrategies,
      news,
      teams,
      drivers,
      transactions,
      seasonEconomics,
      driverStandings,
      constructorStandings,
      driverResultsHistory,
      usedDevelopmentTokens,
  };

    const savesDir = path.join(__dirname, "saves");

    if (!fs.existsSync(savesDir)) {
      fs.mkdirSync(savesDir);
    }

    const savePath = path.join(savesDir, "autosave.json");
    fs.writeFileSync(savePath, JSON.stringify(saveData, null, 2));
  } catch (error) {
    console.error("Error guardando partida:", error);
    alert("Hubo un error guardando la partida.\n\n" + error.message);
  }
}

function translateArea(area) {
  const map = {
    aero: "Aerodinámica",
    chassis: "Chasis",
    reliability: "Fiabilidad",
    pitStop: "Pit Stop",
  };

  return map[area] || area;
}

function translateRisk(risk) {
  const map = {
    low: "Bajo",
    medium: "Medio",
    high: "Alto",
  };

  return map[risk] || risk;
}function renderActiveUpgrades() {
  const list = document.getElementById("activeUpgradesList");

  if (!list) return;

  list.innerHTML = "";

  if (activeUpgrades.length === 0) {
    list.innerHTML = `
      <div class="active-upgrade-card">
        <h4>Sin mejoras en curso</h4>
        <p>No hay desarrollos activos. Elegí una mejora disponible para iniciar el trabajo técnico.</p>
      </div>
    `;
    return;
  }

  activeUpgrades.forEach((upgrade) => {
    const completedDays = upgrade.totalDays - upgrade.daysRemaining;
    const progress = Math.round((completedDays / upgrade.totalDays) * 100);

    const card = document.createElement("div");
    card.className = "active-upgrade-card";

    card.innerHTML = `
      <h4>${upgrade.name}</h4>
      <p>${upgrade.description}</p>

      <div class="upgrade-meta">
        <div>
          Área
          <strong>${translateArea(upgrade.area)}</strong>
        </div>

        <div>
          Días restantes
          <strong>${upgrade.daysRemaining}</strong>
        </div>

        <div>
          Efecto esperado
          <strong>+${upgrade.effect}</strong>
        </div>

        <div>
          Riesgo
          <strong>${translateRisk(upgrade.risk)}</strong>
        </div>
      </div>

      <div class="progress-bar">
        <div style="width: ${progress}%"></div>
      </div>
    `;

    list.appendChild(card);
  });
}

function advanceOneDay() {
  if (!selectedTeam) {
    alert("No hay equipo seleccionado.");
    return;
  }

  advanceDateByOneDay();

  activeUpgrades.forEach((upgrade) => {
    upgrade.daysRemaining -= 1;
  });

  rivalUpgrades.forEach((upgrade) => {
    upgrade.daysRemaining -= 1;
  });

  const completedUpgrades = activeUpgrades.filter(
    (upgrade) => upgrade.daysRemaining <= 0
  );

  activeUpgrades = activeUpgrades.filter(
    (upgrade) => upgrade.daysRemaining > 0
  );

  completedUpgrades.forEach((upgrade) => {
    completeUpgrade(upgrade);
    addNews(
      "Paddock",
      `${selectedTeam.shortName} podría estrenar novedades técnicas`,
      `En el paddock crecen los rumores sobre una posible actualización vinculada a ${translateArea(upgrade.area)}. Algunas fuentes apuntan a que el paquete de ${upgrade.name.toLowerCase()} ya estaría listo para llegar al coche, aunque el equipo evita confirmar el impacto real en rendimiento.`
    );
  });

  const completedRivalUpgrades = rivalUpgrades.filter(
    (upgrade) => upgrade.daysRemaining <= 0
  );

  rivalUpgrades = rivalUpgrades.filter(
    (upgrade) => upgrade.daysRemaining > 0
  );

  completedRivalUpgrades.forEach((upgrade) => {
    completeRivalUpgrade(upgrade);
    const team = teams.find((t) => t.id === upgrade.teamId);
    if (team) {
      addNews(
        "Paddock",
        `${team.shortName} podría llevar novedades al coche`,
        `Fuentes del paddock señalan que ${team.shortName} tendría listo un paquete relacionado con ${translateArea(upgrade.area)}. El equipo no dio detalles oficiales, pero se espera que la actualización pueda aparecer en pista próximamente.`
      );
    }
  });

  runRivalAI();
  checkGardeningCompletion();
  syncSelectedTeamWithTeams();

  const dayOfMonth = new Date(currentDate + "T00:00:00").getDate();
  if (dayOfMonth === 1) {
    processSponsorMonthlyIncome();
  }

  syncSelectedTeamWithTeams();
  saveCurrentGame();

  const teamDrivers = getDriversByTeam(selectedTeam);
  let season = null;
  try {
    season = loadJson("season.json");
  } catch (error) {
    console.error(error);
  }

  window.playerTeamId = selectedTeam.id;
  renderManagerDashboard(selectedTeam, teamDrivers, season);
  renderDevelopmentModule();
}

function advanceOneWeek() {
  if (!selectedTeam) {
    alert("No hay equipo seleccionado.");
    return;
  }

  for (let day = 0; day < 7; day++) {
    advanceDateByOneDay();

    activeUpgrades.forEach((u) => { u.daysRemaining -= 1; });
    rivalUpgrades.forEach((u)  => { u.daysRemaining -= 1; });

    const completedUpgrades = activeUpgrades.filter((u) => u.daysRemaining <= 0);
    activeUpgrades = activeUpgrades.filter((u) => u.daysRemaining > 0);

    completedUpgrades.forEach((upgrade) => {
      completeUpgrade(upgrade);
      addNews(
        "Paddock",
        `${selectedTeam.shortName} podría estrenar novedades técnicas`,
        `En el paddock crecen los rumores sobre una posible actualización vinculada a ${translateArea(upgrade.area)}.`
      );
    });

    const completedRivalUpgrades = rivalUpgrades.filter((u) => u.daysRemaining <= 0);
    rivalUpgrades = rivalUpgrades.filter((u) => u.daysRemaining > 0);

    completedRivalUpgrades.forEach((upgrade) => {
      completeRivalUpgrade(upgrade);
      const team = teams.find((t) => t.id === upgrade.teamId);
      if (team) {
        addNews(
          "Paddock",
          `${team.shortName} podría llevar novedades al coche`,
          `Fuentes del paddock señalan que ${team.shortName} tendría listo un paquete relacionado con ${translateArea(upgrade.area)}.`
        );
      }
    });

    runRivalAI();
    checkGardeningCompletion();

    const dayOfMonth = new Date(currentDate + "T00:00:00").getDate();
    if (dayOfMonth === 1) {
      processSponsorMonthlyIncome();
    }

    // Verificar propuesta de reglamento
    generateRegulationProposal();

    // Verificar eventos de pausa
    const pauseEvents = checkWeeklyPauseEvents();
    if (pauseEvents.length > 0) {
      syncSelectedTeamWithTeams();
      saveCurrentGame();

      const teamDrivers = getDriversByTeam(selectedTeam);
      let season = null;
      try { season = loadJson("season.json"); } catch (e) {}
      renderManagerDashboard(selectedTeam, teamDrivers, season);

      showPauseEventsModal(pauseEvents);
      return;
    }
  }

  syncSelectedTeamWithTeams();
  saveCurrentGame();

  const teamDrivers = getDriversByTeam(selectedTeam);
  let season = null;
  try { season = loadJson("season.json"); } catch (e) {}

  renderManagerDashboard(selectedTeam, teamDrivers, season);
  renderDevelopmentModule();
}

function showPauseEventsModal(events) {
  const existing = document.getElementById("pauseEventsModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "pauseEventsModal";
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.85); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
  `;

  modal.innerHTML = `
    <div style="background:#111; border:1px solid #333; border-radius:16px;
      padding:32px; max-width:520px; width:90%;">
      <div style="font-size:18px; font-weight:800; color:#ffcc00;
        margin-bottom:6px;">⏸ El tiempo se detiene</div>
      <div style="color:#aaa; font-size:13px; margin-bottom:24px;">
        Algo importante requiere tu atención antes de continuar.
      </div>

      ${events.map((e) => `
        <div style="background:#0a0a0a; border:1px solid #222;
          border-radius:10px; padding:16px; margin-bottom:12px;">
          <div style="font-size:15px; font-weight:700; color:#fff;
            margin-bottom:6px;">${e.title}</div>
          <div style="color:#aaa; font-size:13px; line-height:1.5;">
            ${e.message}
          </div>
          ${e.action ? `
            <button onclick="handlePauseAction('${e.action}')"
              style="margin-top:12px; background:#e10600; border:none;
              color:#fff; border-radius:8px; padding:8px 16px;
              cursor:pointer; font-size:12px; font-weight:700;">
              IR AHORA →
            </button>
          ` : ""}
        </div>
      `).join("")}

      <button onclick="closePauseEventsModal()"
        style="width:100%; margin-top:8px; background:#1a1a1a;
        border:1px solid #333; color:#aaa; border-radius:10px;
        padding:12px; cursor:pointer; font-size:13px; font-weight:700;">
        ENTENDIDO — CONTINUAR
      </button>
    </div>
  `;

  document.body.appendChild(modal);
}

function closePauseEventsModal() {
  const modal = document.getElementById("pauseEventsModal");
  if (modal) modal.remove();
}

function handlePauseAction(action) {
  closePauseEventsModal();
  if (action === "goToRace")     openPracticeWeekend();
  if (action === "openMarket")   openModule("Mercado");
  if (action === "openFinances") openModule("Finanzas");
  if (action === "openSponsors") openModule("Sponsors");
  if (action === "openVoting") {
    const vote = regulations?.governance?.pendingVotes?.[0];
    if (vote) showVotingModal(vote);
  }
}

function completeUpgrade(upgrade) {
  if (upgrade.area === "aero") {
    selectedTeam.performance.aero = Math.min(
      100, selectedTeam.performance.aero + upgrade.effect
    );
    usedDevelopmentTokens.aero++;
  }

  if (upgrade.area === "chassis" || upgrade.area === "pitStop") {
    selectedTeam.performance[upgrade.area] = Math.min(
      100, selectedTeam.performance[upgrade.area] + upgrade.effect
    );
    usedDevelopmentTokens.chassis++;
  }

  if (upgrade.area === "reliability") {
    selectedTeam.performance.reliability = Math.min(
      100, selectedTeam.performance.reliability + upgrade.effect
    );
    usedDevelopmentTokens.powerUnit++;
  }

  recalculateOverallPerformance();
}

function advanceDateByOneDay() {
  const date = new Date(currentDate + "T00:00:00");
  date.setDate(date.getDate() + 1);

  currentDate = date.toISOString().split("T")[0];
}

function checkWeeklyPauseEvents() {
  const events = [];

  // Gran Premio esta semana
  let season = null;
  try { season = loadJson("season.json"); } catch (e) {}
  if (season) {
    const upcoming = season.calendar.find((r) => r.round > currentRound);
    if (upcoming) {
      const raceDate  = new Date(upcoming.date + "T00:00:00");
      const today     = new Date(currentDate + "T00:00:00");
      const daysUntil = Math.ceil((raceDate - today) / 86400000);
      if (daysUntil <= 7 && daysUntil >= 0) {
        events.push({
          type:    "race_weekend",
          title:   `🏁 ${upcoming.name} esta semana`,
          message: `El ${upcoming.name} comienza en ${daysUntil} día${daysUntil !== 1 ? "s" : ""}. Es momento de preparar el fin de semana.`,
          action:  "goToRace",
        });
      }
    }
  }

  // Upgrade completado
  const justCompleted = activeUpgrades.filter((u) => u.daysRemaining <= 0);
  justCompleted.forEach((u) => {
    events.push({
      type:    "upgrade_done",
      title:   `🔧 Upgrade completado: ${u.name}`,
      message: `El desarrollo de ${u.name} ha finalizado y ya está aplicado al coche.`,
      action:  null,
    });
  });

  // Contrato venciendo esta semana
  const teamDrivers = getDriversByTeam(selectedTeam);
  teamDrivers.forEach((driver) => {
    const contractDate = new Date(`${driver.contract.until}-12-31T00:00:00`);
    const today        = new Date(currentDate + "T00:00:00");
    const daysUntil    = Math.ceil((contractDate - today) / 86400000);
    if (daysUntil <= 30 && daysUntil >= 0) {
      events.push({
        type:    "contract_expiring",
        title:   `⚠️ Contrato de ${driver.name} vence pronto`,
        message: `El contrato de ${driver.name} vence en ${daysUntil} días. Si no renovás, quedará libre al final de la temporada.`,
        action:  "openMarket",
      });
    }
  });

  // Presupuesto crítico
  if (selectedTeam.budget < seasonEconomics?.initialBudget * 0.15) {
    events.push({
      type:    "budget_critical",
      title:   `💸 Presupuesto crítico`,
      message: `El presupuesto de ${selectedTeam.name} ha caído a ${formatMoney(selectedTeam.budget)}. Revisá los gastos antes de continuar.`,
      action:  "openFinances",
    });
  }

  // Votación pendiente
  if (regulations?.governance?.pendingVotes?.length > 0) {
    const vote = regulations.governance.pendingVotes[0];
    if (!vote.playerVote) {
      events.push({
        type:    "pending_vote",
        title:   `🗳️ Votación pendiente: ${vote.title}`,
        message: `La FIA espera tu voto sobre "${vote.title}". Necesitás emitirlo antes de continuar.`,
        action:  "openVoting",
      });
    }
  }

  // Sponsor perdido esta semana
  const lostSponsors = sponsors.filter(
    (s) => s.teamId === null && s.warningCount === 0 &&
    s.contractUntil && s.contractUntil >= 2026
  );
  if (lostSponsors.length > 0) {
    events.push({
      type:    "sponsor_lost",
      title:   `💔 Sponsor abandona el equipo`,
      message: `Un sponsor ha decidido no continuar con ${selectedTeam.shortName}. Revisá el módulo de sponsors para buscar reemplazos.`,
      action:  "openSponsors",
    });
  }

  return events;
}

function formatDateAR(dateString) {
  const date = new Date(dateString + "T00:00:00");

  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}function goToDashboard() {
  if (!selectedTeam) {
    showScreen("mainMenu");
    return;
  }

  const teamDrivers = getDriversByTeam(selectedTeam);

  let season = null;

  try {
    season = loadJson("season.json");
  } catch (error) {
    console.error(error);
  }

  renderManagerDashboard(selectedTeam, teamDrivers, season);
  updateNewsBadge();
  showScreen("gameScreen");
}function getApproximateDevelopmentTime(days) {
  if (days <= 14) {
    return "un trabajo de corto plazo";
  }

  if (days <= 24) {
    return "un desarrollo de algunas semanas";
  }

  if (days <= 32) {
    return "un paquete cercano al mes de trabajo";
  }

  if (days <= 40) {
    return "un desarrollo de mediano plazo";
  }

  return "un proyecto técnico de largo alcance";
}function addNews(category, title, text) {
  news.unshift({
    id: Date.now(),
    date: currentDate,
    category,
    title,
    text,
    read: false,
  });

  updateNewsBadge();
}

function renderNewsModule() {
  const list = document.getElementById("newsList");

  if (!list) {
    alert("No se encontró newsList.");
    return;
  }

  list.innerHTML = "";

  if (news.length === 0) {
    list.innerHTML = `
      <div class="news-card">
        <div class="news-date">${formatDateAR(currentDate)}</div>
        <span class="news-category">Paddock</span>
        <h4>Sin novedades relevantes</h4>
        <p>Todavía no hay noticias generadas. Las decisiones técnicas, avances de desarrollo y eventos importantes aparecerán acá.</p>
      </div>
    `;

    updateNewsBadge();
    return;
  }

  news.forEach((item) => {
    const card = document.createElement("div");
    card.className = item.read ? "news-card" : "news-card unread-news";

    card.innerHTML = `
      <div class="news-date">${formatDateAR(item.date)}</div>
      <span class="news-category">${item.category}</span>
      ${item.read ? "" : `<span class="news-unread-label">NUEVA</span>`}
      <h4>${item.title}</h4>
      <p>${item.text}</p>
    `;

    list.appendChild(card);
  });

  news = news.map((item) => {
    return {
      ...item,
      read: true,
    };
  });

  updateNewsBadge();
  saveCurrentGame();
}
function updateNewsBadge() {
  const badge = document.getElementById("newsBadge");

  if (!badge) return;

  const unreadCount = news.filter((item) => !item.read).length;

  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.classList.add("active");
  } else {
    badge.textContent = "0";
    badge.classList.remove("active");
  }
}

function runRivalAI() {
  let upgrades = [];
  try {
    upgrades = loadJson("upgrades.json");
  } catch (error) {
    console.error("No se pudo cargar upgrades.json para IA rival:", error);
    return;
  }

  teams.forEach((team) => {
    if (!selectedTeam) return;
    if (team.id === selectedTeam.id) return;

    const profile = regulations?.developmentProfiles?.[team.id.toString()];
    if (!profile) return;

    const alreadyDeveloping = rivalUpgrades.some((u) => u.teamId === team.id);

    // Calcular probabilidad según perfil
    let developChance = 0;

    if (profile.pattern === "consistent") {
      // Red Bull — pequeñas mejoras constantes
      developChance = alreadyDeveloping ? 0.08 : 0.25;
    } else if (profile.pattern === "front_loaded") {
      // Ferrari, Haas, Racing Bulls — fuertes al inicio
      if (currentRound <= profile.peakEnd) {
        developChance = alreadyDeveloping ? 0.10 : 0.30;
      } else {
        // Después del pico, casi no desarrollan
        developChance = alreadyDeveloping ? 0.01 : 0.05;

        // Ferrari — si no pelea título, foco en siguiente temporada
        if (team.id === 4) {
          const constructorPos = constructorStandings.findIndex(
            (c) => c.teamId === team.id
          ) + 1;
          if (constructorPos > 3 && currentRound >= 15) {
            developChance = 0; // Foco total en 2027
          }
        }
      }
    } else if (profile.pattern === "late_bloomer") {
      // Mercedes, McLaren, Williams — mejoran en 2da mitad
      if (currentRound < profile.peakStart) {
        developChance = alreadyDeveloping ? 0.02 : 0.08;
      } else {
        developChance = alreadyDeveloping ? 0.12 : 0.35;
      }
    } else if (profile.pattern === "punctual") {
      // Aston Martin — paquetes en rondas específicas
      const packageRounds = [6, 12, 18];
      const nearPackage = packageRounds.some(
        (r) => Math.abs(currentRound - r) <= 1
      );
      developChance = nearPackage ? 0.70 : 0.02;
    } else if (profile.pattern === "distributed") {
      // Alpine — 3 paquetes distribuidos
      const rivalUpgradesCount = rivalUpgrades.filter(
        (u) => u.teamId === team.id
      ).length;
      const completedCount = Object.values(driverResultsHistory)
        .flat().length > 0 ? 1 : 0;
      developChance = rivalUpgradesCount < 3 ? 0.15 : 0.02;
    } else if (profile.pattern === "unknown") {
      // Audi, Cadillac — equipos nuevos, aprenden con el tiempo
      const seasonsPlayed = regulations.season - 2026;
      if (seasonsPlayed <= 2) {
        developChance = alreadyDeveloping ? 0.05 : 0.12;
      } else {
        // Construyen su propio patrón basado en resultados
        const constructorPos = constructorStandings.findIndex(
          (c) => c.teamId === team.id
        ) + 1;
        developChance = constructorPos <= 6
          ? (alreadyDeveloping ? 0.10 : 0.25)
          : (alreadyDeveloping ? 0.05 : 0.15);
      }
    }

    if (Math.random() > developChance) return;

    // Elegir área según perfil y situación
    const chosenArea = getRivalDevelopmentArea(team, profile);
    const possibleUpgrades = upgrades.filter(
      (u) => u.area === chosenArea && team.budget >= u.cost
    );

    if (possibleUpgrades.length === 0) return;

    // Equipos agresivos eligen mejoras más caras
    possibleUpgrades.sort((a, b) =>
      profile.aggression >= 3 ? b.effect - a.effect : a.cost - b.cost
    );

    const selectedUpgrade = possibleUpgrades[0];

    team.budget -= selectedUpgrade.cost;

    rivalUpgrades.push({
      id:          Date.now() + Math.random(),
      teamId:      team.id,
      upgradeId:   selectedUpgrade.id,
      name:        selectedUpgrade.name,
      area:        selectedUpgrade.area,
      cost:        selectedUpgrade.cost,
      totalDays:   selectedUpgrade.days,
      daysRemaining: selectedUpgrade.days,
      effect:      selectedUpgrade.effect,
      risk:        selectedUpgrade.risk,
      description: selectedUpgrade.description,
      startedAt:   currentDate,
      status:      "in_progress",
    });

    // Noticia según patrón
    const newsTitle = getRivalDevelopmentNews(team, profile, selectedUpgrade);
    addNews(
      "🔧 Paddock",
      newsTitle.title,
      newsTitle.body
    );
  });
}

function getRivalDevelopmentArea(team, profile) {
  const weak = getWeakestTechnicalArea(team);

  // Patrones que priorizan el área más débil
  if (profile.pattern === "consistent" || profile.pattern === "distributed") {
    return weak;
  }

  // Patrones que a veces priorizan aero para rendimiento inmediato
  if (profile.pattern === "late_bloomer" && currentRound >= profile.peakStart) {
    return Math.random() < 0.6 ? "aero" : weak;
  }

  if (profile.pattern === "punctual") {
    // Aston Martin alterna entre aero y chassis en cada paquete
    const packagesDelivered = rivalUpgrades
      .filter((u) => u.teamId === team.id).length;
    return packagesDelivered % 2 === 0 ? "aero" : "chassis";
  }

  return Math.random() < 0.5 ? weak : "aero";
}

function getRivalDevelopmentNews(team, profile, upgrade) {
  const patterns = {
    consistent: {
      title: `${team.shortName} lleva nuevas mejoras al próximo Gran Premio`,
      body:  `${team.name} mantiene su ritmo habitual de desarrollo y presentará actualizaciones en ${translateArea(upgrade.area)} en la próxima cita del calendario.`,
    },
    front_loaded: {
      title: `${team.shortName} apuesta fuerte en el desarrollo invernal`,
      body:  `${team.name} ha preparado un paquete de mejoras en ${translateArea(upgrade.area)}. El equipo quiere sacar ventaja en la primera parte del campeonato.`,
    },
    late_bloomer: {
      title: `${team.shortName} presenta su paquete de actualizaciones`,
      body:  `Como suele ocurrir, ${team.name} llega con novedades en ${translateArea(upgrade.area)} en la segunda mitad de temporada. El equipo confía en que estas mejoras los catapulten en el campeonato.`,
    },
    punctual: {
      title: `${team.shortName} trae uno de sus paquetes planificados`,
      body:  `${team.name} ha introducido su actualización de ${translateArea(upgrade.area)}, parte de su plan de desarrollo estructurado para esta temporada.`,
    },
    distributed: {
      title: `${team.shortName} introduce mejoras graduales`,
      body:  `${team.name} sigue su estrategia de desarrollo gradual con una actualización en ${translateArea(upgrade.area)}. El equipo prioriza la consistencia sobre los grandes saltos.`,
    },
    unknown: {
      title: `${team.shortName} trabaja en el desarrollo del coche`,
      body:  `${team.name} continúa su proceso de aprendizaje con una mejora en ${translateArea(upgrade.area)}. El equipo todavía está definiendo su identidad técnica.`,
    },
  };

  return patterns[profile.pattern] || patterns.unknown;
}

function getRivalDevelopmentChance(team) {
  const overall = team.performance.overall;

  if (overall >= 90) {
    return 0.08;
  }

  if (overall >= 82) {
    return 0.10;
  }

  if (overall >= 78) {
    return 0.12;
  }

  if (overall >= 74) {
    return 0.10;
  }

  return 0.07;
}

function getWeakestTechnicalArea(team) {
  const performance = team.performance;

  const areas = [
    { key: "aero", value: performance.aero },
    { key: "chassis", value: performance.chassis },
    { key: "reliability", value: performance.reliability },
    { key: "pitStop", value: performance.pitStop },
  ];

  areas.sort((a, b) => a.value - b.value);

  return areas[0].key;
}

function completeRivalUpgrade(upgrade) {
  const team = teams.find((t) => t.id === upgrade.teamId);

  if (!team) return;

  if (upgrade.area === "aero") {
    team.performance.aero = Math.min(
      100,
      team.performance.aero + upgrade.effect
    );
  }

  if (upgrade.area === "chassis") {
    team.performance.chassis = Math.min(
      100,
      team.performance.chassis + upgrade.effect
    );
  }

  if (upgrade.area === "reliability") {
    team.performance.reliability = Math.min(
      100,
      team.performance.reliability + upgrade.effect
    );
  }

  if (upgrade.area === "pitStop") {
    team.performance.pitStop = Math.min(
      100,
      team.performance.pitStop + upgrade.effect
    );
  }

  recalculateTeamOverallPerformance(team);
}

function recalculateTeamOverallPerformance(team) {
  const p = team.performance;

  const newOverall = Math.round(
    p.aero * 0.35 +
    p.chassis * 0.25 +
    p.reliability * 0.2 +
    p.pitStop * 0.2
  );

  p.overall = Math.min(100, newOverall);
}// ── Standings ──────────────────────────────────────────────

function initDriverStandings() {
  return drivers.map((driver) => ({
    driverId:   driver.id,
    driverName: driver.name,
    teamId:     driver.teamId,
    teamName:   (teams.find((t) => t.id === driver.teamId) || {}).shortName || "-",
    points:     0,
    wins:       0,
    podiums:    0,
    races:      0,
  }));
}

function initConstructorStandings() {
  return teams.map((team) => ({
    teamId:   team.id,
    teamName: team.shortName,
    points:   0,
    wins:     0,
    races:    0,
  }));
}

function updateStandings(raceResults) {
  const polePoints = regulations?.sporting?.pointsSystem?.pole || 0;
  const flPoints   = regulations?.sporting?.pointsSystem?.fastestLap || 0;

  // Piloto en pole position
  const poleDriver = qualifyingResults?.[0];

  // Piloto con vuelta rápida — el que tenga el menor fastestLap entre los que terminaron
  const flDriver = [...raceResults]
    .filter((r) => !r.dnf && r.fastestLap)
    .sort((a, b) => a.fastestLap - b.fastestLap)[0];

  raceResults.forEach((result) => {
    const ds = driverStandings.find((d) => d.driverId === result.driverId);
    if (ds) {
      ds.points += result.points;
      ds.races  += 1;
      if (result.position === 1) ds.wins++;
      if (result.position <= 3 && !result.dnf) ds.podiums++;

      // Bonus pole
      if (polePoints > 0 && poleDriver && result.driverId === poleDriver.driverId) {
        ds.points += polePoints;
        addNews(
          "🏆 Resultado",
          `${result.driverName} suma ${polePoints} punto${polePoints > 1 ? "s" : ""} extra por la pole`,
          `El reglamento actual otorga ${polePoints} punto${polePoints > 1 ? "s" : ""} por la pole position. ${result.driverName} se lleva el bonus en ${currentRaceData?.race?.name || "esta carrera"}.`
        );
      }

      // Bonus vuelta rápida
      if (flPoints > 0 && flDriver && result.driverId === flDriver.driverId) {
        ds.points += flPoints;
        addNews(
          "⚡ Vuelta Rápida",
          `${result.driverName} suma ${flPoints} punto${flPoints > 1 ? "s" : ""} por la vuelta rápida`,
          `${result.driverName} marcó la vuelta más rápida de la carrera (${formatLapTime(flDriver.fastestLap)}) y suma ${flPoints} punto${flPoints > 1 ? "s" : ""} extra según el reglamento vigente.`
        );
      }
    }

    const cs = constructorStandings.find((c) => c.teamId === result.teamId);
    if (cs) {
      cs.points += result.points;
      cs.races  += 1;
      if (result.position === 1) cs.wins++;

      // Bonus pole al constructor
      if (polePoints > 0 && poleDriver && result.driverId === poleDriver.driverId) {
        cs.points += polePoints;
      }

      // Bonus VR al constructor
      if (flPoints > 0 && flDriver && result.driverId === flDriver.driverId) {
        cs.points += flPoints;
      }
    }
  });

  driverStandings.sort((a, b) => b.points - a.points);
  constructorStandings.sort((a, b) => b.points - a.points);
}

function renderStandings() {
  const dBody = document.getElementById("driverStandingsBody");
  const cBody = document.getElementById("constructorStandingsBody");

  dBody.innerHTML = "";
  cBody.innerHTML = "";

  driverStandings.forEach((d, i) => {
    const row = document.createElement("tr");
    if (selectedTeam && d.teamId === selectedTeam.id) {
      row.classList.add("player-team-row");
    }
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${d.driverName}</td>
      <td>${d.teamName}</td>
      <td><strong>${d.points}</strong></td>
    `;
    dBody.appendChild(row);
  });

  constructorStandings.forEach((c, i) => {
    const row = document.createElement("tr");
    if (selectedTeam && c.teamId === selectedTeam.id) {
      row.classList.add("player-team-row");
    }
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${c.teamName}</td>
      <td><strong>${c.points}</strong></td>
    `;
    cBody.appendChild(row);
  });
}

// ── Fin de semana de carrera ───────────────────────────────

function openRaceWeekend() {
  let season = null;
  let circuits = [];

  try {
    season   = loadJson("season.json");
    circuits = loadJson("circuits.json");
  } catch (e) {
    alert("No se pudo cargar el calendario.\n\n" + e.message);
    return;
  }

  const nextRace = season.calendar.find((r) => r.round > currentRound);

  if (!nextRace) {
    alert("La temporada 2026 ha terminado.\n\nPróximamente: pantalla de fin de temporada.");
    return;
  }

  const circuit = circuits.find((c) => c.id === nextRace.circuitId);

  if (!circuit) {
    alert("No se encontró el circuito para esta carrera.");
    return;
  }

  currentRaceData   = { race: nextRace, circuit };
  qualifyingResults = null;
  raceWeather       = rollWeather();

  // Resetear paneles
  document.getElementById("preRacePanel").style.display     = "block";
  document.getElementById("qualifyingPanel").style.display  = "none";
  document.getElementById("racePanel").style.display        = "none";

  // Título
  document.getElementById("raceWeekendTitle").textContent    = nextRace.name;
  document.getElementById("raceWeekendSubtitle").textContent =
    `Ronda ${nextRace.round} — ${nextRace.date} — Clima: ${weatherLabel(raceWeather)}`;

  // Info circuito
  document.getElementById("rcCountry").textContent = circuit.country;
  document.getElementById("rcLaps").textContent    = circuit.laps;
  document.getElementById("rcLength").textContent  = circuit.length + " km";
  document.getElementById("rcDeg").textContent     = circuit.degradation;
  document.getElementById("rcOvt").textContent     = circuit.overtaking;
  document.getElementById("rcFormat").textContent  =
    nextRace.sprint ? "Sprint Weekend" : "Fin de semana tradicional";

  // Info equipo
  const p = selectedTeam.performance;
  document.getElementById("rcCarPerf").textContent = p.overall;
  document.getElementById("rcAero").textContent    = p.aero;
  document.getElementById("rcRel").textContent     = p.reliability;
  document.getElementById("rcPit").textContent     = p.pitStop;

  showScreen("raceWeekendScreen");
}

function startQualifying() {
  if (!currentRaceData) return;

  const { circuit } = currentRaceData;
  qualifyingResults = simulateQualifying(drivers, teams, circuit, raceWeather);

   // Penalizaciones de clasificación
  const qPenalties = simulateQualifyingPenalties(qualifyingResults);

  // Penalizaciones pre-carrera (cambios de motor)
  const prePenalties = simulatePreRacePenalties(qualifyingResults);

  if (qPenalties.length > 0 || prePenalties.length > 0) {
    generatePenaltyReport([], qPenalties, prePenalties);
    qualifyingResults.sort((a, b) => a.position - b.position);
  }

  const statusEl = document.getElementById("raceSessionStatus");
  if (statusEl) {
    statusEl.innerHTML = `
      Clasificación completada. Clima: <strong>${weatherLabel(raceWeather)}</strong>.<br><br>
      <button class="btn" id="btnIniciarCarrera">INICIAR CARRERA</button>
    `;

    setTimeout(() => {
    const btn = document.getElementById("btnIniciarCarrera");
    if (btn) btn.addEventListener("click", () => startRace());
  }, 100);

  }

  const tbody = document.getElementById("raceResultsBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  qualifyingResults.forEach((r) => {
    const row = document.createElement("tr");
    const isPlayer = selectedTeam && r.teamId === selectedTeam.id;
    if (isPlayer) row.classList.add("player-team-row");

    row.innerHTML = `
      <td><strong>${r.position}</strong></td>
      <td>${r.driverName}</td>
      <td style="color:${r.teamColor}">${r.teamName}</td>
      <td style="color:#aaa;">${r.position === 1 ? "-" : "+" + formatRaceGap(r.lapTime - qualifyingResults[0].lapTime)}</td>
      <td>${formatLapTime(r.lapTime)}</td>
      <td>-</td>
      <td style="color:${r.position === 1 ? '#ffcc00' : '#aaa'}">
        ${r.position === 1 ? 'Pole Position' : 'Q' + (r.position <= 10 ? '3' : r.position <= 15 ? '2' : '1')}
      </td>
    `;
    tbody.appendChild(row);
  });
}

function finishRaceWeekend() {
  if (!currentRaceData) {
    alert("Primero tenés que completar la carrera.");
    return;
  }

  const race    = currentRaceData.race;
  const results = document.getElementById("raceResultsBody").dataset.results
    ? JSON.parse(document.getElementById("raceResultsBody").dataset.results)
    : [];

  if (results.length > 0) {
    processRaceEconomics(race, results);
  }

  currentRound = race.round;
  currentDate  = race.date;
  advanceDateByOneDay();

  currentRaceData   = null;
  qualifyingResults = null;
  practiceData      = null;
  raceStrategy      = null;

  addNews(
    "Carrera",
    `Finalizó el ${race.name}`,
    `${race.name} ya forma parte del historial de la temporada. ` +
    `El paddock cambia el foco hacia la próxima ronda del calendario.`
  );

  saveCurrentGame();
  goToDashboard();
}

function generateRaceNews(raceResults, incidents, safetyCar) {
  const winner = raceResults.find((r) => r.position === 1);
  const { race, circuit } = currentRaceData;

  if (winner) {
    const isPlayerWin = winner.teamId === selectedTeam.id;
    const winnerHistory = driverResultsHistory[winner.driverId] || [];
    const recentWins = winnerHistory.slice(0, 3).filter((r) => r.position === 1).length;
    const winnerTeam = teams.find((t) => t.id === winner.teamId);
    const isSmallTeam = winnerTeam && winnerTeam.performance.overall < 82;
    const hasChaos = incidents.length >= 3 || safetyCar;
    const p2 = raceResults.find((r) => r.position === 2);
    const margin = p2 ? (p2.raceTime - winner.raceTime) : 999;

    let headline = "";
    let body = "";

    if (recentWins >= 2) {
      headline = `${winner.driverName} imparable, victoria consecutiva en ${race.name}`;
      body = `${winner.driverName} no da tregua. Con su triunfo en ${circuit.name} suma su segunda victoria consecutiva y consolida su dominio en el campeonato. Los rivales buscan respuestas.`;
    } else if (isSmallTeam) {
      headline = `Sorpresa en ${circuit.name}: ${winner.teamName} logra una victoria histórica`;
      body = `Nadie lo esperaba. ${winner.driverName} cruzó la línea primero en ${race.name} con ${winner.teamName}, un resultado que sacude la parrilla y reescribe las jerarquías del campeonato.`;
    } else if (hasChaos && incidents.length >= 3) {
      headline = `Caos en ${circuit.name}: ${winner.driverName} gana una carrera de locos`;
      body = `${race.name} quedará en la memoria. Con ${incidents.length} abandonos, Safety Car y drama hasta el final, ${winner.driverName} supo mantenerse fuera del caos para llevarse la victoria.`;
    } else if (margin < 1.0) {
      headline = `Por décimas: ${winner.driverName} gana un duelo épico en ${circuit.name}`;
      body = `Solo ${margin.toFixed(3)} segundos separaron a ${winner.driverName} de ${p2?.driverName || "su rival"}. ${race.name} ofreció uno de los finales más emocionantes de la temporada.`;
    } else {
      headline = `${winner.driverName} se impone en el ${race.name}`;
      body = isPlayerWin
        ? `¡Victoria histórica! ${winner.driverName} cruzó primero la línea de meta en ${circuit.name}, dándole a ${selectedTeam.name} un resultado que el paddock tardará en olvidar.`
        : `${winner.driverName} dominó el ${race.name} de principio a fin. El piloto de ${winner.teamName} no dejó dudas durante toda la carrera.`;
    }

    addNews("Resultado", headline, body);
  }

  // Resultado del equipo del jugador
  const playerResults = raceResults.filter((r) => r.teamId === selectedTeam.id);
  const totalPoints   = playerResults.reduce((sum, r) => sum + r.points, 0);

  if (totalPoints > 0) {
    addNews(
      "Tu equipo",
      `${selectedTeam.shortName} suma ${totalPoints} puntos`,
      `Tras el ${race.name}, ${selectedTeam.name} se lleva ${totalPoints} punto${totalPoints > 1 ? "s" : ""} del fin de semana. ` +
      playerResults.map((r) => `${r.driverName}: ${r.dnf ? "abandono" : "P" + r.position}`).join(", ") + "."
    );
  } else {
    const allDNF = playerResults.every((r) => r.dnf);
    if (allDNF) {
      addNews(
        "Tu equipo",
        `Fin de semana para olvidar para ${selectedTeam.shortName}`,
        `${selectedTeam.name} no pudo sumar ni un punto en ${race.name}. Ambos pilotos abandonaron y el equipo sale del circuito con más preguntas que respuestas.`
      );
    } else {
      addNews(
        "Tu equipo",
        `${selectedTeam.shortName} fuera de los puntos en ${race.name}`,
        `${selectedTeam.name} no logró colarse entre los diez primeros. ` +
        playerResults.map((r) => `${r.driverName}: ${r.dnf ? "abandono" : "P" + r.position}`).join(", ") + ". El equipo deberá analizar qué salió mal."
      );
    }
  }

  if (safetyCar) {
    addNews(
      "Incidente",
      "Safety Car en pista durante la carrera",
      `El Safety Car fue desplegado durante el ${race.name}, alterando las estrategias de varios equipos y redistribuyendo posiciones en la parrilla.`
    );
  }

  if (incidents.length > 0) {
    incidents.slice(0, 2).forEach((inc) => {
      addNews(
        "Incidente",
        `${inc.driver} abandona en ${race.name}`,
        `${inc.driver} (${inc.team}) no pudo completar la carrera. El piloto tuvo que retirarse en la vuelta ${inc.lap} debido a ${inc.reason}.`
      );
    });
  }
}

function checkMediaPressure() {
  if (!selectedTeam || currentRound < 3) return;

  const teamDrivers = getDriversByTeam(selectedTeam);
  const recentRaces = 3;

  // Presión sobre el equipo
  const constructorPos = constructorStandings.findIndex(
    (c) => c.teamId === selectedTeam.id
  ) + 1;

  const recentPoints = teamDrivers.reduce((total, driver) => {
    const history = driverResultsHistory[driver.id] || [];
    return total + history.slice(0, recentRaces)
      .reduce((sum, r) => sum + (r.points || 0), 0);
  }, 0);

  if (recentPoints === 0 && currentRound >= 4) {
    addNews(
      "⚠️ Presión",
      `La prensa aprieta a ${selectedTeam.shortName}`,
      `${selectedTeam.name} lleva ${recentRaces} carreras consecutivas sin sumar un solo punto. Los medios especializados empiezan a cuestionar la dirección técnica del equipo y se hablan de cambios internos si los resultados no mejoran.`
    );
    return;
  }

  if (constructorPos >= 8 && currentRound >= 6) {
    addNews(
      "📰 Paddock",
      `${selectedTeam.shortName} bajo la lupa del paddock`,
      `Con ${selectedTeam.name} en P${constructorPos} del campeonato de constructores, las voces críticas se multiplican. Algunos analistas sugieren que el coche necesita una dirección de desarrollo más clara para las próximas rondas.`
    );
  }

  // Presión individual sobre pilotos
  teamDrivers.forEach((driver) => {
    const history = driverResultsHistory[driver.id] || [];
    const recent  = history.slice(0, recentRaces);
    if (recent.length < recentRaces) return;

    const recentDriverPoints = recent.reduce((s, r) => s + (r.points || 0), 0);
    const recentDNFs = recent.filter((r) => r.dnf).length;

    if (recentDriverPoints === 0 && recentDNFs >= 2) {
      addNews(
        "⚠️ Presión",
        `El futuro de ${driver.name} en ${selectedTeam.shortName} en duda`,
        `Dos abandonos y ningún punto en las últimas ${recentRaces} carreras ponen a ${driver.name} bajo presión. Fuentes del paddock sugieren que ${selectedTeam.shortName} podría explorar opciones en el mercado si la racha no mejora pronto.`
      );
    } else if (recentDriverPoints === 0 && recent.every((r) => r.position > 12)) {
      addNews(
        "📰 Paddock",
        `${driver.name} necesita resultados urgentes`,
        `${driver.name} no ha podido acercarse a la zona de puntos en sus últimas ${recentRaces} apariciones. La paciencia en el equipo tiene límites y el piloto lo sabe.`
      );
    }
  });

  // Presión positiva — si el equipo va bien
  if (constructorPos <= 3 && recentPoints >= 20) {
    addNews(
      "🏆 Momentum",
      `${selectedTeam.shortName} en racha — el paddock habla`,
      `Los números respaldan a ${selectedTeam.name}. Con ${recentPoints} puntos en las últimas ${recentRaces} carreras y ubicados P${constructorPos} en el campeonato, el equipo genera admiración en el paddock y presiona a los de arriba.`
    );
  }
}
// ══════════════════════════════════════════════════════════
// TESTING DE PRETEMPORADA
// ══════════════════════════════════════════════════════════

const TESTING_PROGRAMS = [
  {
    id: "aero",
    name: "Programa Aerodinámico",
    description: "Evaluación de carga aerodinámica, eficiencia de alas y comportamiento en curva.",
    area: "aero",
    minGain: 1,
    maxGain: 3,
    failChance: 0.12,
    icon: "🔬"
  },
  {
    id: "chassis",
    name: "Ritmo de Carrera",
    description: "Simulación de stint largo, balance del chasis y rendimiento en degradación.",
    area: "chassis",
    minGain: 1,
    maxGain: 3,
    failChance: 0.10,
    icon: "🏎️"
  },
  {
    id: "reliability",
    name: "Prueba de Fiabilidad",
    description: "Test de componentes críticos, motor, electrónica y sistemas de enfriamiento.",
    area: "reliability",
    minGain: 1,
    maxGain: 2,
    failChance: 0.08,
    icon: "🔧"
  },
  {
    id: "pitStop",
    name: "Práctica de Pit Stop",
    description: "Optimización de tiempos en boxes, coordinación de mecánicos y procedimientos.",
    area: "pitStop",
    minGain: 1,
    maxGain: 2,
    failChance: 0.06,
    icon: "⏱️"
  },
  {
    id: "tires",
    name: "Gestión de Neumáticos",
    description: "Evaluación de compuestos, ventanas de temperatura y estrategia de degradación.",
    area: "chassis",
    minGain: 1,
    maxGain: 2,
    failChance: 0.09,
    icon: "🟡"
  },
];

const TESTING_DAYS    = 3;
const TESTING_SESSIONS = ["Mañana", "Tarde"];

function openTesting() {
  if (!selectedTeam) return;

  if (testingState && testingState.completed) {
    alert("El testing de pretemporada ya fue completado.\n\nEl próximo testing será al inicio de la siguiente temporada.");
    return;
  }

  document.getElementById("testingIntroPanel").style.display    = "block";
  document.getElementById("testingSessionsPanel").style.display = "none";
  document.getElementById("testingFinalPanel").style.display    = "none";

  document.getElementById("testingSubtitle").textContent =
    `Circuito Internacional de Bahrein — ${formatDateAR(currentDate)}`;

  renderTestingPreCarStats();
  renderTestingSuggestion();

  showScreen("testingScreen");
}

function renderTestingPreCarStats() {
  const container = document.getElementById("testingPreCarStats");
  if (!container) return;
  container.innerHTML = buildCarStatsHTML(selectedTeam.performance);
}

function renderTestingSuggestion() {
  const p    = selectedTeam.performance;
  const weak = getWeakestTechnicalArea(selectedTeam);

  const areaNames = {
    aero:        "Aerodinámica",
    chassis:     "Chasis / Ritmo",
    reliability: "Fiabilidad",
    pitStop:     "Pit Stop",
  };

  const areaPrograms = {
    aero:        "Programa Aerodinámico",
    chassis:     "Ritmo de Carrera",
    reliability: "Prueba de Fiabilidad",
    pitStop:     "Práctica de Pit Stop",
  };

  document.getElementById("testingSuggestion").innerHTML = `
    El área más débil del coche es <strong>${areaNames[weak]}</strong> 
    (${p[weak]} pts).<br><br>
    Se recomienda priorizar el <strong>${areaPrograms[weak]}</strong> 
    en las primeras sesiones para maximizar la ganancia antes del GP de Australia.<br><br>
    <span style="color:#666; font-size:12px;">
      Esta es una sugerencia. Podés elegir cualquier programa en cada sesión.
    </span>
  `;
}

function startTesting() {
  testingState = {
    currentDay:     1,
    currentSession: 0,
    totalSessions:  TESTING_DAYS * TESTING_SESSIONS.length,
    completedSessions: [],
    completed:      false,
  };

  testingGains = { aero: 0, chassis: 0, reliability: 0, pitStop: 0 };

  document.getElementById("testingIntroPanel").style.display    = "none";
  document.getElementById("testingSessionsPanel").style.display = "block";

  renderTestingSession();
}

function renderTestingSession() {
  const day     = testingState.currentDay;
  const session = TESTING_SESSIONS[testingState.currentSession % TESTING_SESSIONS.length];

  document.getElementById("testingDayTitle").textContent =
    `Día ${day} — Sesión de ${session}`;

  document.getElementById("testingSessionDesc").textContent =
    `Elegí el programa de trabajo para esta sesión. El juego sugiere enfocarse en el área más débil del coche.`;

  document.getElementById("testingSessionResult").style.display = "none";

  renderTestingPrograms();
  renderTestingProgress();
  renderTestingLiveCarStats();
}

function renderTestingPrograms() {
  const grid = document.getElementById("testingProgramGrid");
  if (!grid) return;

  const weak = getWeakestTechnicalArea(selectedTeam);

  grid.innerHTML = "";

  TESTING_PROGRAMS.forEach((program) => {
    const isSuggested = program.area === weak;

    const card = document.createElement("div");
    card.style.cssText = `
      background: linear-gradient(180deg, #181818, #0d0d0d);
      border: 1px solid ${isSuggested ? "#e10600" : "#2c2c2c"};
      border-left: 4px solid ${isSuggested ? "#e10600" : "#444"};
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: 0.2s;
    `;

    card.innerHTML = `
      <div style="font-size:22px; margin-bottom:8px;">${program.icon}</div>
      <div style="color:#fff; font-size:15px; font-weight:700; margin-bottom:6px;">
        ${program.name}
        ${isSuggested ? `<span style="background:#e10600; color:#fff; font-size:10px; 
          padding:3px 7px; border-radius:20px; margin-left:6px;">SUGERIDO</span>` : ""}
      </div>
      <div style="color:#aaa; font-size:12px; line-height:1.4; margin-bottom:10px;">
        ${program.description}
      </div>
      <div style="color:#666; font-size:11px;">
        Ganancia estimada: +${program.minGain} a +${program.maxGain} en ${translateArea(program.area)}
      </div>
    `;

    card.onmouseover = () => { card.style.transform = "translateY(-3px)"; };
    card.onmouseout  = () => { card.style.transform = "translateY(0)"; };
    card.onclick     = () => runTestingSession(program);

    grid.appendChild(card);
  });
}

function renderTestingProgress() {
  const container = document.getElementById("testingProgress");
  if (!container) return;

  const total     = testingState.totalSessions;
  const completed = testingState.completedSessions.length;

  let html = `
    <div style="color:#aaa; font-size:13px; margin-bottom:12px;">
      Sesiones completadas: <strong style="color:#fff;">${completed} / ${total}</strong>
    </div>
    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; margin-bottom:16px;">
  `;

  for (let day = 1; day <= TESTING_DAYS; day++) {
    for (let s = 0; s < TESTING_SESSIONS.length; s++) {
      const sessionIndex = (day - 1) * TESTING_SESSIONS.length + s;
      const isDone       = sessionIndex < completed;
      const isCurrent    = sessionIndex === completed;

      html += `
        <div style="
          background: ${isDone ? "#1a3a1a" : isCurrent ? "#2a1a00" : "#111"};
          border: 1px solid ${isDone ? "#2d5a2d" : isCurrent ? "#e10600" : "#222"};
          border-radius: 8px; padding: 8px; text-align:center; font-size:11px;
          color: ${isDone ? "#4caf50" : isCurrent ? "#ffcc00" : "#444"};
        ">
          D${day} ${TESTING_SESSIONS[s].substring(0,3)}<br>
          ${isDone ? "✓" : isCurrent ? "▶" : "—"}
        </div>
      `;
    }
  }

  html += "</div>";
  container.innerHTML = html;
}

function renderTestingLiveCarStats() {
  const container = document.getElementById("testingLiveCarStats");
  if (!container) return;
  container.innerHTML = buildCarStatsHTML(selectedTeam.performance);
}

function buildCarStatsHTML(performance) {
  return `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      ${["overall","aero","chassis","reliability","pitStop"].map((key) => `
        <div style="background:#080808; border:1px solid #242424;
          border-radius:10px; padding:12px;">
          <div style="color:#999; font-size:11px; margin-bottom:4px;">
            ${translateArea(key) === key ? "General" : translateArea(key)}
          </div>
          <div style="color:#fff; font-size:22px; font-weight:700;">
            ${performance[key]}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function runTestingSession(program) {
  if (!selectedTeam) return;

  const hasProblem = Math.random() < program.failChance;
  let gain         = 0;
  let resultText   = "";
  let resultColor  = "#4caf50";

  if (hasProblem) {
    resultColor = "#e10600";
    const problems = [
      "Se detectó una falla en el sistema hidráulico que interrumpió la sesión.",
      "Un problema de correlación entre el simulador y la pista limitó los datos.",
      "Fallo eléctrico en el MGU-K obligó a detener la sesión antes de tiempo.",
      "Sobrecalentamiento del motor redujo los vueltas útiles al mínimo.",
      "Un accidente menor en la salida de boxes dañó el alerón delantero.",
    ];
    resultText = problems[Math.floor(Math.random() * problems.length)];

    addNews(
      "Testing",
      `${selectedTeam.shortName} tuvo problemas en el testing`,
      `Durante la sesión de ${TESTING_SESSIONS[testingState.currentSession % 2].toLowerCase()} del día ${testingState.currentDay}, ${selectedTeam.name} sufrió contratiempos. ${resultText} El equipo trabaja para resolver el problema antes de la siguiente sesión.`
    );

  } else {
    gain = Math.floor(Math.random() * (program.maxGain - program.minGain + 1)) + program.minGain;

    if (program.area === "aero")        { selectedTeam.performance.aero        = Math.min(100, selectedTeam.performance.aero        + gain); testingGains.aero        += gain; }
    if (program.area === "chassis")     { selectedTeam.performance.chassis      = Math.min(100, selectedTeam.performance.chassis      + gain); testingGains.chassis     += gain; }
    if (program.area === "reliability") { selectedTeam.performance.reliability  = Math.min(100, selectedTeam.performance.reliability  + gain); testingGains.reliability += gain; }
    if (program.area === "pitStop")     { selectedTeam.performance.pitStop      = Math.min(100, selectedTeam.performance.pitStop      + gain); testingGains.pitStop     += gain; }

    recalculateOverallPerformance();
    syncSelectedTeamWithTeams();

    resultText  = `Sesión exitosa. El equipo completó el programa con datos valiosos. Ganancia: +${gain} en ${translateArea(program.area)}.`;
    resultColor = "#4caf50";

    addNews(
      "Testing",
      `${selectedTeam.shortName} completa sesión de ${program.name.toLowerCase()}`,
      `${selectedTeam.name} aprovechó la sesión de testing para trabajar en ${translateArea(program.area).toLowerCase()}. Los ingenieros recogieron datos útiles que podrían traducirse en mejoras para el inicio de la temporada.`
    );
  }

  testingState.completedSessions.push({
    day:     testingState.currentDay,
    session: TESTING_SESSIONS[testingState.currentSession % TESTING_SESSIONS.length],
    program: program.name,
    gain,
    problem: hasProblem,
  });

  // Mostrar resultado
  document.getElementById("testingSessionResult").style.display = "block";
  document.getElementById("testingSessionResultContent").innerHTML = `
    <div style="background:#0a0a0a; border:1px solid #333; border-left: 4px solid ${resultColor};
      border-radius:10px; padding:16px; color:#ccc; font-size:14px; line-height:1.6;">
      <strong style="color:${resultColor};">
        ${hasProblem ? "⚠️ Problema en sesión" : "✅ Sesión completada"}
      </strong><br><br>
      ${resultText}
      ${gain > 0 ? `<br><br><strong style="color:#4caf50;">+${gain} ${translateArea(program.area)}</strong>` : ""}
    </div>
    <div style="text-align:center; margin-top:20px;">
      <button class="btn" style="width:260px;" onclick="nextTestingSession()">
        ${isLastTestingSession() ? "VER RESUMEN FINAL" : "SIGUIENTE SESIÓN →"}
      </button>
    </div>
  `;

  renderTestingProgress();
  renderTestingLiveCarStats();
  saveCurrentGame();
}

function isLastTestingSession() {
  return testingState.completedSessions.length >= testingState.totalSessions;
}

function nextTestingSession() {
  if (isLastTestingSession()) {
    showTestingFinal();
    return;
  }

  testingState.currentSession++;

  if (testingState.currentSession % TESTING_SESSIONS.length === 0) {
    testingState.currentDay++;
  }

  renderTestingSession();
}

function showTestingFinal() {
  testingState.completed = true;

  document.getElementById("testingSessionsPanel").style.display = "none";
  document.getElementById("testingFinalPanel").style.display    = "block";

  // Stats finales
  document.getElementById("testingFinalCarStats").innerHTML =
    buildCarStatsHTML(selectedTeam.performance);

  // Resumen de ganancias
  const gainsContainer = document.getElementById("testingGainsSummary");
  const gainEntries = Object.entries(testingGains).filter(([, v]) => v > 0);

  if (gainEntries.length === 0) {
    gainsContainer.innerHTML = `
      <p style="color:#aaa; font-size:14px;">
        El testing fue difícil. No se obtuvieron mejoras netas. El equipo tendrá que 
        arrancar la temporada con el mismo nivel que llegó.
      </p>`;
  } else {
    gainsContainer.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px,1fr)); gap:12px;">
        ${gainEntries.map(([area, gain]) => `
          <div style="background:#0a1a0a; border:1px solid #2d5a2d; border-radius:10px; padding:14px;">
            <div style="color:#aaa; font-size:12px;">${translateArea(area)}</div>
            <div style="color:#4caf50; font-size:26px; font-weight:700;">+${gain}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  // Tiempos rivales (simulados)
  renderRivalTestingTimes();

  addNews(
    "Testing",
    `${selectedTeam.shortName} completa el testing de pretemporada`,
    `${selectedTeam.name} cerró los tres días de testing en Bahrein. El equipo regresa a fábrica con datos valiosos antes del arranque de la temporada en Australia. Las mejoras obtenidas serán clave para afrontar la primera carrera del año.`
  );

  saveCurrentGame();
}

function renderRivalTestingTimes() {
  const tbody = document.getElementById("rivalTestingBody");
  if (!tbody) return;

  const rivalTimes = teams
    .filter((t) => t.id !== selectedTeam.id)
    .map((team) => {
      const baseTime = 100 - (team.performance.overall / 100) * 20;
      const noise    = (Math.random() - 0.5) * 1.2;
      const time     = Math.round((baseTime + noise) * 1000) / 1000;

      let impression = "";
      if      (time < 88.5) impression = "🔴 Muy rápido — preocupante";
      else if (time < 90.0) impression = "🟡 Sólido — competitivo";
      else if (time < 92.0) impression = "🟢 Normal — dentro de lo esperado";
      else                  impression = "⚪ Lento — problemas visibles";

      return { team, time, impression };
    })
    .sort((a, b) => a.time - b.time);

  tbody.innerHTML = rivalTimes.map((r) => `
    <tr>
      <td style="color:${r.team.color}">${r.team.shortName}</td>
      <td>${formatLapTime(r.time)}</td>
      <td style="font-size:13px;">${r.impression}</td>
    </tr>
  `).join("");
}

function finishTesting() {
  currentDate = "2026-02-28";
  advanceDateByOneDay();
  saveCurrentGame();
  goToDashboard();
}// ══════════════════════════════════════════════════════════
// SISTEMA ECONÓMICO
// ══════════════════════════════════════════════════════════

const CONSTRUCTOR_PRIZE_MONEY = [
  180000000, 160000000, 140000000, 120000000,
  100000000,  85000000,  70000000,  58000000,
   48000000,  40000000,  32000000
];

const RACE_PRIZE_MONEY = [
  1200000, 800000, 600000, 400000,
   300000, 220000, 160000, 100000,
    60000,  30000
];

const ACCIDENT_COST = {
  minor:  150000,
  medium: 400000,
  major: 900000,
};

function initSeasonEconomics() {
  const costCap = regulations?.technical?.costCap || selectedTeam.costCap || 215000000;
  return {
    initialBudget:    selectedTeam.budget,
    totalIncome:      0,
    totalExpenses:    0,
    raceIncome:       0,
    sponsorIncome:    0,
    salaryExpenses:   0,
    developmentCosts: 0,
    accidentCosts:    0,
    penaltyCosts:     0,
    costCapUsed:      0,
    costCapLimit:     costCap,
    weeksPassed:      0,
  };
}

function processRaceEconomics(race, raceResults) {
  if (!selectedTeam || !seasonEconomics) return;

  const playerResults = raceResults.filter(
    (r) => r.teamId === selectedTeam.id
  );

  let totalRaceIncome = 0;
  let totalBonuses    = 0;
  let totalRepairs    = 0;

  playerResults.forEach((result) => {
    if (!result.dnf && result.position <= 10) {
      const prize = RACE_PRIZE_MONEY[result.position - 1] || 0;
      totalRaceIncome += prize;

      addTransaction({
        date:     currentDate,
        type:     "income",
        category: "race_prize",
        amount:   prize,
        description: `Premio GP ${race.name} — P${result.position} (${result.driverName})`,
      });
    }

    if (!result.dnf && result.position === 1) {
      const winBonus = 500000;
      totalBonuses += winBonus;
      addTransaction({
        date:     currentDate,
        type:     "income",
        category: "bonus",
        amount:   winBonus,
        description: `Bonus victoria — ${result.driverName} en ${race.name}`,
      });
    }

    if (!result.dnf && result.position <= 3) {
      const podiumBonus = 150000;
      totalBonuses += podiumBonus;
      addTransaction({
        date:     currentDate,
        type:     "income",
        category: "bonus",
        amount:   podiumBonus,
        description: `Bonus podio — ${result.driverName} en ${race.name}`,
      });
    }

    if (result.dnf) {
      const repairLevel = Math.random() < 0.4 ? "major" : "medium";
      const repairCost  = ACCIDENT_COST[repairLevel];
      totalRepairs += repairCost;

      addTransaction({
        date:     currentDate,
        type:     "expense",
        category: "accident",
        amount:   repairCost,
        description: `Reparación — ${result.driverName} DNF en ${race.name} (${result.dnfReason || "fallo mecánico"})`,
      });
    }
  });

  selectedTeam.budget += totalRaceIncome + totalBonuses;
  selectedTeam.budget -= totalRepairs;

  seasonEconomics.raceIncome    += totalRaceIncome + totalBonuses;
  seasonEconomics.accidentCosts += totalRepairs;
  seasonEconomics.totalIncome   += totalRaceIncome + totalBonuses;
  seasonEconomics.totalExpenses += totalRepairs;

  processRivalEconomics(raceResults);
  processWeeklyCosts();
  syncSelectedTeamWithTeams();

  const totalEarned = totalRaceIncome + totalBonuses;
  const netResult   = totalEarned - totalRepairs;

  addNews(
    "Finanzas",
    `Balance económico tras el ${race.name}`,
    `${selectedTeam.shortName} cerró el fin de semana con un resultado financiero ` +
    `${netResult >= 0 ? "positivo" : "negativo"}. ` +
    `Ingresos de carrera: ${formatMoney(totalEarned)}. ` +
    (totalRepairs > 0 ? `Costos de reparación: ${formatMoney(totalRepairs)}. ` : "") +
    `Presupuesto actual: ${formatMoney(selectedTeam.budget)}.`
  );

  processSponsorRaceBonuses(raceResults);
  evaluateSponsorRequirements();
  processRivalSponsorEvaluation();
  checkBudgetWarning();
}

function processWeeklyCosts() {
  if (!selectedTeam || !seasonEconomics) return;

  const team     = selectedTeam;
  const finances = team.finances;
  if (!finances) return;

  const weeklySalaries = Math.round(
    (finances.driverSalaries + finances.engineerSalaries) / 52
  );

  selectedTeam.budget          -= weeklySalaries;
  seasonEconomics.salaryExpenses += weeklySalaries;
  seasonEconomics.totalExpenses  += weeklySalaries;
  seasonEconomics.weeksPassed    += 1;
  seasonEconomics.costCapUsed    += weeklySalaries;

  addTransaction({
    date:     currentDate,
    type:     "expense",
    category: "salaries",
    amount:   weeklySalaries,
    description: `Salarios semanales — pilotos e ingenieros`,
  });
}

function processRivalEconomics(raceResults) {
  teams.forEach((team) => {
    if (team.id === selectedTeam.id) return;
    if (!team.finances) return;

    const teamResults = raceResults.filter((r) => r.teamId === team.id);

    teamResults.forEach((result) => {
      if (!result.dnf && result.position <= 10) {
        const prize = RACE_PRIZE_MONEY[result.position - 1] || 0;
        team.budget += prize;
      }

      if (result.dnf) {
        const repairCost = Math.random() < 0.4
          ? ACCIDENT_COST.major
          : ACCIDENT_COST.medium;
        team.budget -= repairCost;
      }
    });

    const weeklySalaries = Math.round(
      (team.finances.driverSalaries + team.finances.engineerSalaries) / 52
    );

    team.budget = Math.max(0, team.budget - weeklySalaries);
  });
}

function addTransaction(transaction) {
  transactions.unshift({
    id:   Date.now() + Math.random(),
    ...transaction,
  });

  if (transactions.length > 200) {
    transactions = transactions.slice(0, 200);
  }
}

function checkBudgetWarning() {
  if (!selectedTeam || !seasonEconomics) return;

  const budgetRatio = selectedTeam.budget / seasonEconomics.initialBudget;

  if (budgetRatio < 0.1) {
    addNews(
      "⚠️ Alerta financiera",
      `${selectedTeam.shortName} en situación crítica`,
      `El presupuesto de ${selectedTeam.name} ha caído por debajo del 10% del presupuesto inicial. ` +
      `Quedan ${formatMoney(selectedTeam.budget)} disponibles. ` +
      `Es urgente revisar los costos y priorizar el gasto restante de la temporada.`
    );
    return;
  }

  if (budgetRatio < 0.25) {
    addNews(
      "⚠️ Advertencia financiera",
      `Presupuesto bajo en ${selectedTeam.shortName}`,
      `El presupuesto disponible de ${selectedTeam.name} está por debajo del 25% del inicial. ` +
      `Quedan ${formatMoney(selectedTeam.budget)}. Se recomienda revisar el plan de desarrollo.`
    );
  }
}

// ── Pantalla de Finanzas ───────────────────────────────────

function renderFinancesModule() {
  if (!selectedTeam) return;

  document.getElementById("financesTeamName").textContent  = selectedTeam.name;
  document.getElementById("financesBudget").textContent    = formatMoney(selectedTeam.budget);
  document.getElementById("financesDate").textContent      = formatDateAR(currentDate);

  if (seasonEconomics) {
    document.getElementById("financesTotalIncome").textContent   = formatMoney(seasonEconomics.totalIncome);
    document.getElementById("financesTotalExpenses").textContent = formatMoney(seasonEconomics.totalExpenses);

    const balance = seasonEconomics.totalIncome - seasonEconomics.totalExpenses;
    const balanceEl = document.getElementById("financesBalance");
    balanceEl.textContent = formatMoney(balance);
    balanceEl.style.color = balance >= 0 ? "#4caf50" : "#e10600";

    document.getElementById("financesRaceIncome").textContent    = formatMoney(seasonEconomics.raceIncome);
    document.getElementById("financesSalaries").textContent      = formatMoney(seasonEconomics.salaryExpenses);
    document.getElementById("financesAccidents").textContent     = formatMoney(seasonEconomics.accidentCosts);
    document.getElementById("financesDevelopment").textContent   = formatMoney(seasonEconomics.developmentCosts);

    const costCapPct = Math.round(
      (seasonEconomics.costCapUsed / seasonEconomics.costCapLimit) * 100
    );
    document.getElementById("financesCostCap").textContent =
      `${formatMoney(seasonEconomics.costCapUsed)} / ${formatMoney(seasonEconomics.costCapLimit)} (${costCapPct}%)`;
    document.getElementById("financesCostCapBar").style.width =
      Math.min(100, costCapPct) + "%";
    document.getElementById("financesCostCapBar").style.background =
      costCapPct > 90 ? "#e10600" : costCapPct > 70 ? "#ffcc00" : "#4caf50";
  }

  renderTransactionsList();
  renderTeamBudgetRanking();
}

function renderTransactionsList() {
  const list = document.getElementById("transactionsList");
  if (!list) return;

  list.innerHTML = "";

  if (transactions.length === 0) {
    list.innerHTML = `
      <div style="color:#aaa; font-size:14px; padding:16px;">
        No hay transacciones registradas todavía. 
        Corré una carrera para ver el movimiento económico.
      </div>`;
    return;
  }

  transactions.slice(0, 30).forEach((t) => {
    const isIncome = t.type === "income";
    const div = document.createElement("div");
    div.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 0; border-bottom: 1px solid #1a1a1a; font-size: 13px;
    `;
    div.innerHTML = `
      <div>
        <div style="color:#fff; margin-bottom:3px;">${t.description}</div>
        <div style="color:#666; font-size:11px;">${formatDateAR(t.date)} — ${translateCategory(t.category)}</div>
      </div>
      <div style="font-weight:700; color:${isIncome ? "#4caf50" : "#e10600"}; white-space:nowrap; margin-left:16px;">
        ${isIncome ? "+" : "-"}${formatMoney(t.amount)}
      </div>
    `;
    list.appendChild(div);
  });
}

function renderTeamBudgetRanking() {
  const tbody = document.getElementById("budgetRankingBody");
  if (!tbody) return;

  const sorted = [...teams].sort((a, b) => b.budget - a.budget);
  tbody.innerHTML = "";

  sorted.forEach((team, i) => {
    const row = document.createElement("tr");
    if (team.id === selectedTeam.id) row.classList.add("player-team-row");
    row.innerHTML = `
      <td>${i + 1}</td>
      <td style="color:${team.color}">${team.shortName}</td>
      <td>${formatMoney(team.budget)}</td>
      <td>${formatMoney(team.finances ? team.finances.weeklyBurnRate * 52 : 0)}</td>
    `;
    tbody.appendChild(row);
  });
}

function translateCategory(cat) {
  const map = {
    race_prize:  "Premio de carrera",
    bonus:       "Bonificación",
    accident:    "Reparación",
    salaries:    "Salarios",
    development: "Desarrollo",
    penalty:     "Penalización",
    sponsor:     "Sponsor",
  };
  return map[cat] || cat;
}// ══════════════════════════════════════════════════════════
// MÓDULO DE PILOTOS
// ══════════════════════════════════════════════════════════

function renderDriversModule() {
  if (!selectedTeam) return;

  document.getElementById("driversSubtitle").textContent =
    `${selectedTeam.name} — Temporada 2026`;

  document.getElementById("driversOverviewPanel").style.display = "block";
  document.getElementById("driverDetailPanel").style.display    = "none";

  renderDriversOverview();
  renderDriversComparison();
}

function renderDriversOverview() {
  const grid        = document.getElementById("driversOverviewGrid");
  const teamDrivers = getDriversByTeam(selectedTeam);

  grid.innerHTML = "";

  teamDrivers.forEach((driver) => {
    const card = document.createElement("div");
    card.className = "dashboard-main-card";
    card.style.cursor = "pointer";
    card.style.transition = "0.2s";

    const moralColor = driver.moral >= 80 ? "#4caf50"
      : driver.moral >= 60 ? "#ffcc00" : "#e10600";

    const formColor = driver.form >= 85 ? "#4caf50"
      : driver.form >= 70 ? "#ffcc00" : "#e10600";

    const overallAttr = Math.round(
      (driver.attributes.pace * 0.25 +
       driver.attributes.qualifying * 0.20 +
       driver.attributes.racecraft * 0.25 +
       driver.attributes.consistency * 0.15 +
       driver.attributes.tireManagement * 0.15)
    );

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
        <div>
          <div style="font-size:24px; font-weight:800; color:#fff;">${driver.name}</div>
          <div style="color:#aaa; font-size:13px; margin-top:4px;">
            #${driver.number} · ${driver.nationality} · ${driver.age} años
          </div>
        </div>
        <div style="font-size:42px; font-weight:900; color:#e10600; opacity:0.8;">
          ${driver.number}
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:16px;">
        <div class="summary-item">
          <span>Rating general</span>
          <strong style="font-size:22px;">${overallAttr}</strong>
        </div>
        <div class="summary-item">
          <span>Moral</span>
          <strong style="color:${moralColor};">${driver.moral}/100</strong>
        </div>
        <div class="summary-item">
          <span>Forma</span>
          <strong style="color:${formColor};">${driver.form}/100</strong>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:16px;">
        ${renderMiniAttribute("Pace", driver.attributes.pace)}
        ${renderMiniAttribute("Clasificación", driver.attributes.qualifying)}
        ${renderMiniAttribute("Carrera", driver.attributes.racecraft)}
        ${renderMiniAttribute("Neumáticos", driver.attributes.tireManagement)}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center;
        background:#080808; border:1px solid #222; border-radius:10px; padding:12px;">
        <div style="color:#aaa; font-size:13px;">
          Contrato hasta ${driver.contract.until} · ${formatMoney(driver.contract.salary)}/año
        </div>
        <div style="color:#e10600; font-size:12px; font-weight:700;">
          VER PERFIL →
        </div>
      </div>
    `;

    card.onmouseover = () => { card.style.transform = "translateY(-3px)"; };
    card.onmouseout  = () => { card.style.transform = "translateY(0)"; };
    card.onclick     = () => openDriverDetail(driver.id);

    grid.appendChild(card);
  });
}

function renderMiniAttribute(label, value) {
  const color = value >= 90 ? "#4caf50" : value >= 80 ? "#ffcc00" : "#aaa";
  return `
    <div style="background:#080808; border:1px solid #222; border-radius:8px; padding:8px;">
      <div style="color:#666; font-size:11px; margin-bottom:3px;">${label}</div>
      <div style="color:${color}; font-weight:700; font-size:15px;">${value}</div>
    </div>
  `;
}

function renderDriversComparison() {
  const tbody = document.getElementById("driversComparisonBody");
  const table = document.getElementById("driversRankingTable");
  if (!tbody || !table) return;

  const currentSort = table.dataset.sortKey || "pace";
  const currentDir  = table.dataset.sortDir || "desc";

  const sorted = [...drivers].sort((a, b) => {
    const aVal = a.attributes[currentSort] ?? 0;
    const bVal = b.attributes[currentSort] ?? 0;
    return currentDir === "desc" ? bVal - aVal : aVal - bVal;
  });

  tbody.innerHTML = "";

  sorted.forEach((driver) => {
    const team     = teams.find((t) => t.id === driver.teamId);
    const isPlayer = selectedTeam && driver.teamId === selectedTeam.id;
    const row      = document.createElement("tr");

    if (isPlayer) row.classList.add("player-team-row");

    row.style.cursor = "pointer";
    row.onclick = () => openDriverDetail(driver.id);

    const attrs = ["pace", "qualifying", "racecraft", "tireManagement", "experience", "potential"];

    row.innerHTML = `
      <td>
        <strong>${driver.name}</strong>
        ${isPlayer
          ? `<span style="color:#e10600; font-size:11px; margin-left:6px;">TU EQUIPO</span>`
          : ""}
      </td>
      <td style="color:${team ? team.color : "#aaa"}">${team ? team.shortName : "-"}</td>
      ${attrs.map((attr) => `
        <td style="
          color:${
            driver.attributes[attr] >= 93 ? "#4caf50" :
            driver.attributes[attr] >= 85 ? "#ffcc00" : "#fff"
          };
          font-weight:${currentSort === attr ? "800" : "400"};">
          ${driver.attributes[attr]}
        </td>
      `).join("")}
    `;

    tbody.appendChild(row);
  });
}

function openDriverDetail(driverId) {
  const driver = drivers.find((d) => d.id === driverId);
  if (!driver) return;

  const team = teams.find((t) => t.id === driver.teamId);

  document.getElementById("driversOverviewPanel").style.display = "none";
  document.getElementById("driverDetailPanel").style.display    = "block";

  document.getElementById("detailDriverName").textContent   = driver.name;
  document.getElementById("detailDriverNumber").textContent = `#${driver.number}`;
  document.getElementById("detailDriverMeta").textContent   =
    `${team ? team.name : "-"} · ${driver.nationality} · ${driver.age} años`;

  document.getElementById("detailNationality").textContent =
    getFlagEmoji(driver.nationality) + " " + driver.nationality;
  document.getElementById("detailAge").textContent      = driver.age + " años";
  document.getElementById("detailContract").textContent = driver.contract.until;
  document.getElementById("detailSalary").textContent   = formatMoney(driver.contract.salary);

  const moralColor = driver.moral >= 80 ? "#4caf50"
    : driver.moral >= 60 ? "#ffcc00" : "#e10600";
  document.getElementById("detailMoral").innerHTML =
    `<span style="color:${moralColor}">${driver.moral}/100</span>`;
  document.getElementById("detailForm").textContent = driver.form + "/100";

  renderDetailAttributes(driver);
  renderDetailSeasonStats(driver);
  renderDetailProfile(driver);
  renderDetailResultsHistory(driver);
}

function renderDetailAttributes(driver) {
  const container = document.getElementById("detailAttributes");
  if (!container) return;

  const attrs = [
    { label: "Pace puro",         value: driver.attributes.pace },
    { label: "Clasificación",     value: driver.attributes.qualifying },
    { label: "Ritmo de carrera",  value: driver.attributes.racecraft },
    { label: "Gestión neumáticos",value: driver.attributes.tireManagement },
    { label: "Consistencia",      value: driver.attributes.consistency },
    { label: "Experiencia",       value: driver.attributes.experience },
    { label: "Agresividad",       value: driver.attributes.aggression },
    { label: "Defensa",           value: driver.attributes.defense },
    { label: "Adelantamiento",    value: driver.attributes.overtaking },
    { label: "Lluvia",            value: driver.attributes.wetWeather },
    { label: "Feedback técnico",  value: driver.attributes.technicalFeedback },
    { label: "Potencial",         value: driver.attributes.potential },
  ];

  container.innerHTML = attrs.map((attr) => {
    const color = attr.value >= 90 ? "#4caf50"
      : attr.value >= 80 ? "#e10600" : "#aaa";
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:#aaa; font-size:12px;">${attr.label}</span>
          <strong style="color:${color}; font-size:13px;">${attr.value}</strong>
        </div>
        <div style="background:#1a1a1a; border-radius:20px; height:6px; overflow:hidden;">
          <div style="width:${attr.value}%; height:100%; background:${color};
            border-radius:20px; transition:0.3s;"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderDetailSeasonStats(driver) {
  const container = document.getElementById("detailSeasonStats");
  if (!container) return;

  const history = driverResultsHistory[driver.id] || [];

  const races   = history.length;
  const points  = history.reduce((s, r) => s + (r.points || 0), 0);
  const wins    = history.filter((r) => r.position === 1).length;
  const podiums = history.filter((r) => r.position <= 3 && !r.dnf).length;
  const dnfs    = history.filter((r) => r.dnf).length;
  const bestPos = races > 0
    ? Math.min(...history.filter((r) => !r.dnf).map((r) => r.position || 99))
    : "-";

  const slPoints  = driver.superLicense?.points || 0;
  const slColor   = slPoints >= 9 ? "#e10600"
    : slPoints >= 6 ? "#ffcc00" : "#4caf50";
  const slPenalties = driver.superLicense?.penalties || [];

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;
      margin-bottom:16px;">
      <div class="summary-item"><span>Carreras</span>
        <strong>${races}</strong></div>
      <div class="summary-item"><span>Puntos</span>
        <strong>${points}</strong></div>
      <div class="summary-item"><span>Victorias</span>
        <strong>${wins}</strong></div>
      <div class="summary-item"><span>Podios</span>
        <strong>${podiums}</strong></div>
      <div class="summary-item"><span>Mejor resultado</span>
        <strong>${bestPos === "-" ? "-" : "P" + bestPos}</strong></div>
      <div class="summary-item"><span>Abandonos</span>
        <strong style="color:${dnfs > 0 ? "#e10600" : "#4caf50"}">${dnfs}</strong>
      </div>
    </div>

    <!-- Superlicencia -->
    <div style="background:#0a0a0a; border:1px solid #1a1a1a;
      border-radius:10px; padding:14px;">
      <div style="display:flex; justify-content:space-between;
        align-items:center; margin-bottom:10px;">
        <div style="color:#aaa; font-size:12px; font-weight:700;">
          SUPERLICENCIA
        </div>
        <div style="color:${slColor}; font-size:13px; font-weight:700;">
          ${slPoints} / ${SUPERLICENSE_LIMITS} puntos
          ${driver.suspended ? "🚨 SUSPENDIDO" : ""}
        </div>
      </div>
      <div style="background:#1a1a1a; border-radius:20px; height:8px;
        overflow:hidden; margin-bottom:10px;">
        <div style="width:${Math.min(100, (slPoints / SUPERLICENSE_LIMITS) * 100)}%;
          height:100%; background:${slColor}; border-radius:20px;
          transition:0.3s;"></div>
      </div>
      ${slPenalties.length > 0 ? `
        <div style="color:#aaa; font-size:12px; font-weight:700;
          margin-bottom:8px;">HISTORIAL DE INFRACCIONES</div>
        ${slPenalties.slice(0, 5).map((p) => `
          <div style="display:flex; justify-content:space-between;
            padding:6px 0; border-bottom:1px solid #1a1a1a; font-size:12px;">
            <span style="color:#aaa;">${p.reason}</span>
            <span style="color:#e10600;">+${p.points} pts · ${formatDateAR(p.date)}</span>
          </div>
        `).join("")}
      ` : `
        <div style="color:#666; font-size:12px;">
          Sin infracciones registradas.
        </div>
      `}
    </div>
  `;
}

function renderDetailProfile(driver) {
  const container = document.getElementById("detailProfile");
  if (!container) return;

  const age  = driver.age;
  const pot  = driver.attributes.potential;
  const exp  = driver.attributes.experience;
  const pace = driver.attributes.pace;

  let profile = "";

  if (age <= 22) {
    profile += `${driver.name} es uno de los pilotos más jóvenes de la parrilla. `;
    if (pot >= 95) profile += `Su potencial es excepcional y los expertos lo ven como una futura estrella del deporte. `;
    else profile += `Está en pleno proceso de aprendizaje y muestra destellos de talento. `;
  } else if (age <= 28) {
    profile += `${driver.name} está en la mejor etapa de su carrera. `;
    if (pace >= 93) profile += `Su velocidad pura lo ubica entre los mejores de la grilla. `;
  } else if (age <= 33) {
    profile += `${driver.name} combina experiencia y rendimiento en su momento más maduro. `;
    if (exp >= 90) profile += `Con años de F1 encima, su lectura de carrera es difícil de igualar. `;
  } else {
    profile += `${driver.name} es un veterano con décadas de conocimiento acumulado. `;
    if (exp >= 95) profile += `Su experiencia es un activo invaluable para cualquier equipo. `;
  }

  if (driver.attributes.wetWeather >= 92) {
    profile += `Es especialmente destacado en condiciones de lluvia. `;
  }

  if (driver.attributes.tireManagement >= 90) {
    profile += `Su gestión de neumáticos está entre las mejores de la parrilla. `;
  }

  if (driver.contract.option) {
    profile += `Su contrato incluye una opción de renovación. `;
  }

  if (driver.moral < 70) {
    profile += `Su moral actual es baja, lo que podría afectar su rendimiento en pista.`;
  } else if (driver.moral >= 88) {
    profile += `Está en un gran momento anímico, lo que se refleja en su nivel en pista.`;
  }

  container.textContent = profile;
}

function renderDetailResultsHistory(driver) {
  const container = document.getElementById("detailResultsHistory");
  if (!container) return;

  const history = driverResultsHistory[driver.id] || [];

  if (history.length === 0) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px;">
        Sin resultados todavía. Corré carreras para ver el historial acá.
      </div>`;
    return;
  }

  container.innerHTML = history.slice(0, 10).map((r) => `
    <div style="display:flex; justify-content:space-between; align-items:center;
      padding:8px 0; border-bottom:1px solid #1a1a1a; font-size:13px;">
      <div style="color:#aaa;">${r.raceName}</div>
      <div style="display:flex; gap:12px; align-items:center;">
        <span style="color:${r.dnf ? "#e10600" : "#fff"}; font-weight:700;">
          ${r.dnf ? "DNF" : "P" + r.position}
        </span>
        <span style="color:#4caf50;">${r.points > 0 ? "+" + r.points + " pts" : ""}</span>
      </div>
    </div>
  `).join("");
}

function closeDriverDetail() {
  document.getElementById("driversOverviewPanel").style.display = "block";
  document.getElementById("driverDetailPanel").style.display    = "none";
}

function calcDriverRating(driver) {
  return Math.round(
    driver.attributes.pace            * 0.25 +
    driver.attributes.qualifying      * 0.20 +
    driver.attributes.racecraft       * 0.25 +
    driver.attributes.consistency     * 0.15 +
    driver.attributes.tireManagement  * 0.15
  );
}

function getFlagEmoji(nationality) {
  const flags = {
    GBR: "🇬🇧", NLD: "🇳🇱", MON: "🇲🇨", ITA: "🇮🇹", ESP: "🇪🇸",
    FRA: "🇫🇷", GER: "🇩🇪", FIN: "🇫🇮", AUS: "🇦🇺", CAN: "🇨🇦",
    MEX: "🇲🇽", BRA: "🇧🇷", ARG: "🇦🇷", THA: "🇹🇭", NZL: "🇳🇿",
    DEU: "🇩🇪", CHN: "🇨🇳", JPN: "🇯🇵",
  };
  return flags[nationality] || "🏁";
}

// ── Guardar historial de resultados por piloto ─────────────

function recordDriverResults(raceResults, raceName) {
  raceResults.forEach((result) => {
    if (!driverResultsHistory[result.driverId]) {
      driverResultsHistory[result.driverId] = [];
    }

    driverResultsHistory[result.driverId].unshift({
      raceName,
      position: result.position,
      points:   result.points,
      dnf:      result.dnf,
      date:     currentDate,
    });
  });
}

// ── Progresión y moral de pilotos ──────────────────────────

function updateDriverMoralAfterRace(raceResults) {
  raceResults.forEach((result) => {
    const driver = drivers.find((d) => d.id === result.driverId);
    if (!driver) return;

    let moralChange = 0;
    let formChange  = 0;

    if (result.dnf) {
      moralChange = -8;
      formChange  = -5;
    } else if (result.position === 1) {
      moralChange = +12;
      formChange  = +6;
    } else if (result.position <= 3) {
      moralChange = +8;
      formChange  = +4;
    } else if (result.position <= 6) {
      moralChange = +4;
      formChange  = +2;
    } else if (result.position <= 10) {
      moralChange = +1;
      formChange  = 0;
    } else {
      moralChange = -3;
      formChange  = -2;
    }

    driver.moral = Math.min(100, Math.max(30, driver.moral + moralChange));
    driver.form  = Math.min(100, Math.max(30, driver.form  + formChange));
  });
}

function applyEndOfSeasonProgression() {
  drivers.forEach((driver) => {
    const age     = driver.age;
    const history = driverResultsHistory[driver.id] || [];
    const wins    = history.filter((r) => r.position === 1).length;
    const points  = history.reduce((s, r) => s + (r.points || 0), 0);

    driver.age += 1;

    if (age <= 23) {
      const boost = wins > 0 ? 2 : points > 50 ? 1 : 0;
      driver.attributes.pace           = Math.min(99, driver.attributes.pace           + boost);
      driver.attributes.racecraft      = Math.min(99, driver.attributes.racecraft      + boost);
      driver.attributes.consistency    = Math.min(99, driver.attributes.consistency    + 1);
      driver.attributes.experience     = Math.min(99, driver.attributes.experience     + 3);
    } else if (age <= 28) {
      if (wins > 2) {
        driver.attributes.pace      = Math.min(99, driver.attributes.pace      + 1);
        driver.attributes.racecraft = Math.min(99, driver.attributes.racecraft + 1);
      }
      driver.attributes.experience = Math.min(99, driver.attributes.experience + 2);
    } else if (age <= 32) {
      driver.attributes.experience = Math.min(99, driver.attributes.experience + 1);
    } else {
      driver.attributes.pace        = Math.max(70, driver.attributes.pace        - 1);
      driver.attributes.qualifying  = Math.max(70, driver.attributes.qualifying  - 1);
      driver.attributes.experience  = Math.min(99, driver.attributes.experience  + 1);
    }
  });

  addNews(
    "Fin de temporada",
    "Pilotos evolucionan tras la temporada 2026",
    "El paso de la temporada ha dejado su huella en la parrilla. Los pilotos jóvenes han ganado experiencia y los veteranos continúan adaptándose al paso del tiempo."
  );
}// ══════════════════════════════════════════════════════════
// MERCADO DE PILOTOS E INGENIEROS
// ══════════════════════════════════════════════════════════

async function openMarket() {
  if (!selectedTeam) return;

  if (engineers.length === 0) {
    try {
      engineers = loadJson("engineers.json");
    } catch (e) {
      alert("No se pudo cargar engineers.json\n\n" + e.message);
      return;
    }
  }

  document.getElementById("marketSubtitle").textContent =
    `${selectedTeam.name} — Temporada 2026 — Presupuesto: ${formatMoney(selectedTeam.budget)}`;

  document.getElementById("marketDriversTab").style.display   = "block";
  document.getElementById("marketEngineersTab").style.display = "none";
  document.getElementById("tabDriversBtn").className          = "btn";
  document.getElementById("tabEngineersBtn").className        = "btn btn-secondary";

  renderMarketDrivers();
  showScreen("marketScreen");
}

function switchMarketTab(tab) {
  document.getElementById("marketDriversTab").style.display   =
    tab === "drivers" ? "block" : "none";
  document.getElementById("marketEngineersTab").style.display =
    tab === "engineers" ? "block" : "none";

  document.getElementById("tabDriversBtn").className =
    tab === "drivers" ? "btn" : "btn btn-secondary";
  document.getElementById("tabEngineersBtn").className =
    tab === "engineers" ? "btn" : "btn btn-secondary";

  if (tab === "drivers")   renderMarketDrivers();
  if (tab === "engineers") {
    if (engineers.length === 0) {
      try {
        engineers = loadJson("engineers.json");
      } catch (e) {
        alert("No se pudo cargar engineers.json\n\n" + e.message);
        return;
      }
    }
    renderMarketEngineers();
  }
}

// ── PILOTOS ────────────────────────────────────────────────

function renderMarketDrivers() {
  renderCurrentDrivers();
  renderAvailableDrivers();
  renderAgreedDrivers();
}

function renderCurrentDrivers() {
  const container   = document.getElementById("currentDriversPanel");
  const teamDrivers = getDriversByTeam(selectedTeam);

  container.innerHTML = teamDrivers.map((driver) => {
    const contractYear = driver.contract.until;
    const isExpiring   = contractYear <= 2026;

    return `
      <div style="background:#0a0a0a; border:1px solid ${isExpiring ? "#e10600" : "#222"};
        border-radius:10px; padding:14px;">
        <div style="font-size:16px; font-weight:700; margin-bottom:4px;">${driver.name}</div>
        <div style="color:#aaa; font-size:12px; margin-bottom:10px;">
          #${driver.number} · ${driver.nationality}
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div class="summary-item"><span>Salario</span>
            <strong>${formatMoney(driver.contract.salary)}</strong></div>
          <div class="summary-item">
            <span>Contrato hasta</span>
            <strong style="color:${isExpiring ? "#e10600" : "#fff"}">
              ${contractYear}${isExpiring ? " ⚠️" : ""}
            </strong>
          </div>
        </div>
        ${isExpiring ? `
          <div style="margin-top:10px; color:#e10600; font-size:12px;">
            Contrato vence este año. Renovar o buscar reemplazo.
          </div>
          <button class="btn" style="width:100%; margin-top:10px; padding:10px;"
            onclick="openNegotiationModal('driver', ${driver.id}, true)">
            RENOVAR CONTRATO
          </button>
        ` : ""}
      </div>
    `;
  }).join("");
}

function renderAvailableDrivers() {
  const container = document.getElementById("availableDriversList");

  const available = drivers.filter((driver) => {
    if (driver.teamId === selectedTeam.id) return false;
    const isExpiring  = driver.contract.until <= 2026;
    const alreadySigned = agreedTransfers.some(
      (t) => t.personId === driver.id && t.type === "driver"
    );
    return isExpiring && !alreadySigned;
  });

  if (available.length === 0) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px; padding:12px;">
        No hay pilotos disponibles en este momento.
      </div>`;
    return;
  }

  container.innerHTML = "";

  available.forEach((driver) => {
    const currentTeam = teams.find((t) => t.id === driver.teamId);
    const rating      = calcDriverRating(driver);
    const card        = document.createElement("div");

    card.style.cssText = `
      background: linear-gradient(180deg,#161616,#0c0c0c);
      border: 1px solid #2a2a2a;
      border-left: 4px solid ${currentTeam ? currentTeam.color : "#666"};
      border-radius:12px; padding:16px; margin-bottom:12px;
    `;

    const rivalOffers = generateRivalOffers(driver);

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div>
          <div style="font-size:18px; font-weight:700;">${driver.name}</div>
          <div style="color:#aaa; font-size:12px; margin-top:3px;">
            ${currentTeam ? currentTeam.name : "Libre"} · ${driver.nationality} · ${driver.age} años
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:24px; font-weight:800; color:#e10600;">${rating}</div>
          <div style="color:#666; font-size:11px;">rating</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:12px;">
        ${renderMiniAttribute("Pace", driver.attributes.pace)}
        ${renderMiniAttribute("Classif.", driver.attributes.qualifying)}
        ${renderMiniAttribute("Carrera", driver.attributes.racecraft)}
        ${renderMiniAttribute("Neum.", driver.attributes.tireManagement)}
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a; border-radius:8px;
        padding:10px; margin-bottom:12px; font-size:12px; color:#aaa;">
        Salario actual: <strong style="color:#fff;">${formatMoney(driver.contract.salary)}</strong>
        &nbsp;·&nbsp;
        Expectativa: <strong style="color:#ffcc00;">
          ${formatMoney(getDriverSalaryExpectation(driver))}
        </strong>
        &nbsp;·&nbsp;
        Interés de ${rivalOffers.length} equipo${rivalOffers.length !== 1 ? "s" : ""} rival${rivalOffers.length !== 1 ? "es" : ""}
      </div>

      <button class="btn" style="width:100%; padding:11px;"
        onclick="openNegotiationModal('driver', ${driver.id}, false)">
        NEGOCIAR FICHAJE
      </button>
    `;

    container.appendChild(card);
  });
}

function renderAgreedDrivers() {
  const container = document.getElementById("agreedDriversList");
  const agreed    = agreedTransfers.filter((t) => t.type === "driver");

  if (agreed.length === 0) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px; padding:12px;">
        Sin fichajes acordados todavía.
      </div>`;
    return;
  }

  container.innerHTML = agreed.map((transfer) => {
    const driver = drivers.find((d) => d.id === transfer.personId);
    if (!driver) return "";

    return `
      <div style="background:#0a1a0a; border:1px solid #2d5a2d; border-radius:10px;
        padding:14px; margin-bottom:10px; display:flex;
        justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:15px; font-weight:700; color:#4caf50;">
            ✓ ${driver.name}
          </div>
          <div style="color:#aaa; font-size:12px; margin-top:3px;">
            Llega el 1 de enero ${transfer.startYear} · ${transfer.duration} año${transfer.duration > 1 ? "s" : ""}
            · ${formatMoney(transfer.salary)}/año
          </div>
        </div>
        <button onclick="cancelTransfer('driver', ${transfer.personId})"
          style="background:transparent; border:1px solid #e10600; color:#e10600;
          border-radius:8px; padding:8px 14px; cursor:pointer; font-size:12px;">
          CANCELAR
        </button>
      </div>
    `;
  }).join("");
}

// ── INGENIEROS ─────────────────────────────────────────────

function renderMarketEngineers() {
  renderCurrentEngineers();
  renderAvailableEngineers();
  renderGardeningEngineers();
}

function renderCurrentEngineers() {
  const container      = document.getElementById("currentEngineersPanel");
  const teamEngineers  = engineers.filter(
    (e) => e.teamId === selectedTeam.id && !e.gardening
  );

  if (teamEngineers.length === 0) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px; padding:12px;">
        No hay ingenieros activos en el equipo todavía.
      </div>`;
    return;
  }

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px;">
      ${teamEngineers.map((eng) => `
        <div style="background:#0a0a0a; border:1px solid #222; border-radius:10px; padding:14px;">
          <div style="font-size:15px; font-weight:700; margin-bottom:2px;">${eng.name}</div>
          <div style="color:#aaa; font-size:12px; margin-bottom:10px;">
            ${eng.role} · ${eng.nationality} · ${eng.age} años
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px;">
            <div class="summary-item"><span>Aero</span><strong>${eng.attributes.aero}</strong></div>
            <div class="summary-item"><span>Estrategia</span><strong>${eng.attributes.strategy}</strong></div>
            <div class="summary-item"><span>Salario</span>
              <strong>${formatMoney(eng.salary)}</strong></div>
            <div class="summary-item"><span>Contrato</span>
              <strong style="color:${eng.contractUntil <= 2026 ? "#e10600" : "#fff"}">
                ${eng.contractUntil}
              </strong>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAvailableEngineers() {
  const container = document.getElementById("availableEngineersList");

  const available = engineers.filter((eng) => {
    if (eng.teamId === selectedTeam.id) return false;
    if (eng.gardening) return false;
    const alreadySigned = agreedTransfers.some(
      (t) => t.personId === eng.id && t.type === "engineer"
    );
    return eng.contractUntil <= 2026 && !alreadySigned;
  });

  if (available.length === 0) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px; padding:12px;">
        No hay ingenieros disponibles en este momento.
      </div>`;
    return;
  }

  container.innerHTML = "";

  available.forEach((eng) => {
    const currentTeam = teams.find((t) => t.id === eng.teamId);
    const card        = document.createElement("div");

    card.style.cssText = `
      background:linear-gradient(180deg,#161616,#0c0c0c);
      border:1px solid #2a2a2a; border-radius:12px;
      padding:16px; margin-bottom:12px;
    `;

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
        <div>
          <div style="font-size:17px; font-weight:700;">${eng.name}</div>
          <div style="color:#aaa; font-size:12px; margin-top:3px;">
            ${eng.role} · ${currentTeam ? currentTeam.shortName : "Libre"} · ${eng.age} años
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:12px;">
        ${renderMiniAttribute("Aero", eng.attributes.aero)}
        ${renderMiniAttribute("Chasis", eng.attributes.chassis)}
        ${renderMiniAttribute("Estrategia", eng.attributes.strategy)}
        ${renderMiniAttribute("Experiencia", eng.attributes.experience)}
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a; border-radius:8px;
        padding:10px; margin-bottom:12px; font-size:12px; color:#aaa;">
        Salario actual: <strong style="color:#fff;">${formatMoney(eng.salary)}</strong>
        &nbsp;·&nbsp;
        <span style="color:#ffcc00;">⏳ 6 meses de gardening al fichar</span>
      </div>

      <button class="btn" style="width:100%; padding:11px;"
        onclick="openNegotiationModal('engineer', ${eng.id}, false)">
        NEGOCIAR FICHAJE
      </button>
    `;

    container.appendChild(card);
  });
}

function renderGardeningEngineers() {
  const container = document.getElementById("gardeningEngineersList");
  const gardening = engineers.filter(
    (e) => e.teamId === selectedTeam.id && e.gardening
  );

  if (gardening.length === 0) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px; padding:12px;">
        No hay ingenieros en gardening.
      </div>`;
    return;
  }

  container.innerHTML = gardening.map((eng) => {
    const endDate    = eng.gardeningUntil || "?";
    const daysLeft   = eng.gardeningUntil
      ? Math.max(0, Math.ceil(
          (new Date(eng.gardeningUntil) - new Date(currentDate)) / 86400000
        ))
      : "?";

    return `
      <div style="background:#1a1400; border:1px solid #ffcc00; border-radius:10px;
        padding:14px; margin-bottom:10px;">
        <div style="font-size:15px; font-weight:700; color:#ffcc00; margin-bottom:4px;">
          ⏳ ${eng.name}
        </div>
        <div style="color:#aaa; font-size:12px;">
          ${eng.role} · Gardening hasta: ${endDate} · ${daysLeft} días restantes
        </div>
        <div style="color:#aaa; font-size:12px; margin-top:4px;">
          Salario: ${formatMoney(eng.salary)}/año (se descuenta aunque no trabaje)
        </div>
      </div>
    `;
  }).join("");
}

// ── NEGOCIACIÓN ────────────────────────────────────────────

function openNegotiationModal(type, personId, isRenewal) {
  const person = type === "driver"
    ? drivers.find((d) => d.id === personId)
    : engineers.find((e) => e.id === personId);

  if (!person) return;

  currentNegotiation = { type, personId, isRenewal };

  const expectation = type === "driver"
    ? getDriverSalaryExpectation(person)
    : getEngineerSalaryExpectation(person);

  document.getElementById("modalTitle").textContent =
    isRenewal ? `Renovar contrato — ${person.name}` : `Negociar fichaje — ${person.name}`;

  document.getElementById("modalSubtitle").textContent =
    type === "driver"
      ? `${person.nationality} · ${person.age} años · Rating: ${calcDriverRating(person)}`
      : `${person.role} · ${person.age} años`;

  document.getElementById("modalSalaryInput").value = expectation;
  document.getElementById("modalSalaryHint").textContent =
    `Expectativa del candidato: ${formatMoney(expectation)}`;

  const statsContainer = document.getElementById("modalPersonStats");
  if (type === "driver") {
    statsContainer.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:4px;">
        ${renderMiniAttribute("Pace", person.attributes.pace)}
        ${renderMiniAttribute("Classif.", person.attributes.qualifying)}
        ${renderMiniAttribute("Carrera", person.attributes.racecraft)}
        ${renderMiniAttribute("Potencial", person.attributes.potential)}
      </div>
    `;
  } else {
    statsContainer.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:4px;">
        ${renderMiniAttribute("Aero", person.attributes.aero)}
        ${renderMiniAttribute("Chasis", person.attributes.chassis)}
        ${renderMiniAttribute("Estrategia", person.attributes.strategy)}
        ${renderMiniAttribute("Experiencia", person.attributes.experience)}
      </div>
    `;
  }

  if (type === "driver" && !isRenewal) {
    const rivalOffers = generateRivalOffers(person);
    if (rivalOffers.length > 0) {
      document.getElementById("rivalOffersPanel").style.display = "block";
      document.getElementById("rivalOffersList").innerHTML = rivalOffers.map((o) => `
        <div style="color:#aaa; font-size:12px; margin-bottom:4px;">
          ${o.teamName}: ${formatMoney(o.salary)} / ${o.duration} año${o.duration > 1 ? "s" : ""}
        </div>
      `).join("");
    } else {
      document.getElementById("rivalOffersPanel").style.display = "none";
    }
  } else {
    document.getElementById("rivalOffersPanel").style.display = "none";
  }

  document.getElementById("modalMessage").textContent = "";
  document.getElementById("negotiationModal").style.display = "flex";
}

function closeNegotiationModal() {
  document.getElementById("negotiationModal").style.display = "none";
  currentNegotiation = null;
}

function confirmNegotiation() {
  if (!currentNegotiation) return;

  const { type, personId, isRenewal } = currentNegotiation;
  const salary   = parseInt(document.getElementById("modalSalaryInput").value);
  const duration = parseInt(document.getElementById("modalDurationSelect").value);
  const message  = document.getElementById("modalMessage");

  if (!salary || salary <= 0) {
    message.textContent = "Ingresá un salario válido.";
    message.style.color = "#e10600";
    return;
  }

  const person = type === "driver"
    ? drivers.find((d) => d.id === personId)
    : engineers.find((e) => e.id === personId);

  if (!person) return;

  const expectation = type === "driver"
    ? getDriverSalaryExpectation(person)
    : getEngineerSalaryExpectation(person);

  const teamLevel    = selectedTeam.performance.overall;
  const acceptance   = evaluateOffer(salary, expectation, teamLevel, person);

  if (!acceptance.accepted) {
    message.textContent = acceptance.reason;
    message.style.color = "#e10600";
    return;
  }

  if (type === "driver") {
    if (isRenewal) {
      person.contract.salary = salary;
      person.contract.until  = 2026 + duration;

      addNews(
        "Mercado",
        `${selectedTeam.shortName} renueva con ${person.name}`,
        `${person.name} extiende su vinculación con ${selectedTeam.name} por ${duration} año${duration > 1 ? "s" : ""} más. El piloto seguirá siendo parte del proyecto con un salario de ${formatMoney(salary)} anuales.`
      );
    } else {
      agreedTransfers.push({
        type:      "driver",
        personId:  person.id,
        name:      person.name,
        salary,
        duration,
        startYear: 2027,
        agreedAt:  currentDate,
      });

      addNews(
        "Mercado",
        `${selectedTeam.shortName} acuerda el fichaje de ${person.name}`,
        `${person.name} se une a ${selectedTeam.name} a partir del 1 de enero de 2027, con un contrato de ${duration} año${duration > 1 ? "s" : ""} y un salario de ${formatMoney(salary)} anuales. El piloto llega procedente de ${(teams.find((t) => t.id === person.teamId) || {}).name || "otro equipo"}.`
      );
    }
  } else {
    const gardeningEnd = addMonthsToDate(currentDate, 6);
    person.teamId         = selectedTeam.id;
    person.salary         = salary;
    person.contractUntil  = 2026 + duration;
    person.gardening      = true;
    person.gardeningUntil = gardeningEnd;

    engineers = engineers.map((e) => e.id === person.id ? person : e);

    addNews(
      "Mercado",
      `${selectedTeam.shortName} ficha a ${person.name}`,
      `${person.name} se incorpora a ${selectedTeam.name}. El ingeniero entrará en un período de gardening de 6 meses hasta el ${formatDateAR(gardeningEnd)}, momento en el que podrá comenzar a trabajar en el coche.`
    );
  }

  saveCurrentGame();
  closeNegotiationModal();

  message.textContent = "✓ " + acceptance.message;
  message.style.color = "#4caf50";

  if (type === "driver") renderMarketDrivers();
  else renderMarketEngineers();
}

function cancelTransfer(type, personId) {
  const confirmed = confirm("¿Cancelar este acuerdo?");
  if (!confirmed) return;

  agreedTransfers = agreedTransfers.filter(
    (t) => !(t.type === type && t.personId === personId)
  );

  saveCurrentGame();
  renderMarketDrivers();
}

// ── Helpers económicos ─────────────────────────────────────

function getDriverSalaryExpectation(driver) {
  const rating = calcDriverRating(driver);
  if (rating >= 93) return 35000000;
  if (rating >= 88) return 18000000;
  if (rating >= 83) return 8000000;
  if (rating >= 78) return 4000000;
  return 2000000;
}

function getEngineerSalaryExpectation(engineer) {
  const avg = Math.round(
    (engineer.attributes.aero + engineer.attributes.chassis +
     engineer.attributes.strategy + engineer.attributes.experience) / 4
  );
  if (avg >= 93) return 10000000;
  if (avg >= 87) return 5000000;
  if (avg >= 82) return 3000000;
  return 1500000;
}

function evaluateOffer(salary, expectation, teamLevel, person) {
  const ratio = salary / expectation;

  if (ratio < 0.7) {
    return {
      accepted: false,
      reason:   `La oferta es demasiado baja. ${person.name} esperaba al menos ${formatMoney(expectation)}.`
    };
  }

  if (teamLevel < 75 && ratio < 1.3) {
    return {
      accepted: false,
      reason:   `${person.name} duda del proyecto deportivo. Un equipo de este nivel necesita ofrecer más para atraerlo.`
    };
  }

  return {
    accepted: true,
    message:  ratio >= 1.2
      ? `${person.name} aceptó encantado. La oferta superó sus expectativas.`
      : `${person.name} aceptó la oferta.`
  };
}

function generateRivalOffers(driver) {
  const offers = [];
  const rivalTeams = teams.filter(
    (t) => t.id !== selectedTeam.id && t.performance.overall >= 78
  );

  rivalTeams.forEach((team) => {
    if (Math.random() < 0.35) {
      const base     = getDriverSalaryExpectation(driver);
      const salary   = Math.round(base * (0.9 + Math.random() * 0.4) / 500000) * 500000;
      const duration = Math.floor(Math.random() * 2) + 1;
      offers.push({ teamName: team.shortName, salary, duration });
    }
  });

  return offers.slice(0, 3);
}

function addMonthsToDate(dateStr, months) {
  const date = new Date(dateStr + "T00:00:00");
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split("T")[0];
}

// ── Activar ingenieros al terminar gardening ───────────────

function checkGardeningCompletion() {
  engineers.forEach((eng) => {
    if (!eng.gardening || !eng.gardeningUntil) return;
    if (currentDate >= eng.gardeningUntil) {
      eng.gardening      = false;
      eng.gardeningUntil = null;

      if (eng.teamId === selectedTeam.id) {
        addNews(
          "Staff técnico",
          `${eng.name} ya puede trabajar en el coche`,
          `El período de gardening de ${eng.name} ha concluido. El ingeniero se incorpora oficialmente al trabajo técnico de ${selectedTeam.name} a partir de hoy.`
        );
      }
    }
  });
}

// ── Aplicar fichajes al inicio de nueva temporada ─────────

function applyAgreedTransfers() {
  agreedTransfers.forEach((transfer) => {
    if (transfer.type === "driver") {
      const driver = drivers.find((d) => d.id === transfer.personId);
      if (!driver) return;

      driver.teamId           = selectedTeam.id;
      driver.contract.salary  = transfer.salary;
      driver.contract.until   = 2026 + transfer.duration;
    }
  });

  agreedTransfers = [];

  addNews(
    "Mercado",
    "Fichajes confirmados para la nueva temporada",
    `Los acuerdos cerrados durante la temporada anterior entran en vigor. Los nuevos pilotos se incorporan oficialmente a sus equipos.`
  );
}
function renderEngineersModule() {
  if (!selectedTeam) return;

  if (engineers.length === 0) {
    try {
      engineers = loadJson("engineers.json");
    } catch (e) {
      alert("No se pudo cargar engineers.json\n\n" + e.message);
      return;
    }
  }

  document.getElementById("engineersSubtitle").textContent =
    `${selectedTeam.name} — Temporada 2026`;

  renderActiveEngineersList();
  renderEngineersGardening();
  renderEngineersRanking();
}

function renderActiveEngineersList() {
  const container = document.getElementById("activeEngineersList");
  if (!container) return;

  const active = engineers.filter(
    (e) => e.teamId === selectedTeam.id && !e.gardening
  );

  if (active.length === 0) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px; padding:12px;">
        No hay ingenieros activos. Podés fichar desde el módulo Mercado.
      </div>`;
    return;
  }

  const roles = [
    { key: "aero_director",  label: "Director de Aerodinámica", color: "#4caf50" },
    { key: "design_chief",   label: "Jefe de Diseño",           color: "#2196f3" },
    { key: "strategy_chief", label: "Jefe de Estrategia",       color: "#ff9800" },
    { key: "race_engineer",  label: "Ingenieros de Pista",      color: "#e10600" },
  ];

  container.innerHTML = roles.map((role) => {
    const group = active.filter((e) => e.role === role.key);
    if (group.length === 0) return `
      <div style="margin-bottom:20px;">
        <div style="color:${role.color}; font-size:13px; font-weight:700;
          letter-spacing:1px; margin-bottom:10px;">
          ${role.label.toUpperCase()}
        </div>
        <div style="color:#444; font-size:13px; padding:12px;
          background:#0a0a0a; border-radius:8px; border:1px solid #1a1a1a;">
          Sin cobertura — podés fichar uno desde el Mercado.
        </div>
      </div>
    `;

    return `
      <div style="margin-bottom:20px;">
        <div style="color:${role.color}; font-size:13px; font-weight:700;
          letter-spacing:1px; margin-bottom:10px;">
          ${role.label.toUpperCase()}
        </div>
        <div style="display:grid;
          grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px;">
          ${group.map((eng) => `
            <div style="background:#0a0a0a;
              border:1px solid #1e1e1e;
              border-left:4px solid ${role.color};
              border-radius:12px; padding:16px;">
              <div style="font-size:16px; font-weight:700; margin-bottom:3px;">
                ${eng.name}
              </div>
              <div style="color:#aaa; font-size:12px; margin-bottom:12px;">
                ${eng.nationality} · ${eng.age} años
                ${eng.driverNumber ? ` · Piloto #${eng.driverNumber}` : ""}
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr;
                gap:6px; margin-bottom:12px;">
                ${renderMiniAttribute("Aero",       eng.attributes.aero)}
                ${renderMiniAttribute("Chasis",     eng.attributes.chassis)}
                ${renderMiniAttribute("Estrategia", eng.attributes.strategy)}
                ${renderMiniAttribute("Pista",      eng.attributes.pitEngineering)}
              </div>
              <div style="background:#111; border:1px solid #1a1a1a;
                border-radius:8px; padding:8px; font-size:12px; color:#aaa;">
                ${formatMoney(eng.salary)}/año ·
                Contrato hasta
                <span style="color:${eng.contractUntil <= 2026 ? "#e10600" : "#fff"}">
                  ${eng.contractUntil}
                </span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function renderEngineersGardening() {
  const container = document.getElementById("engineersGardeningList");
  if (!container) return;

  const gardening = engineers.filter(
    (e) => e.teamId === selectedTeam.id && e.gardening
  );

  if (gardening.length === 0) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px; padding:12px;">
        No hay ingenieros en gardening.
      </div>`;
    return;
  }

  container.innerHTML = gardening.map((eng) => {
    const daysLeft = eng.gardeningUntil
      ? Math.max(0, Math.ceil(
          (new Date(eng.gardeningUntil) - new Date(currentDate)) / 86400000
        ))
      : "?";

    const progress = eng.gardeningUntil
      ? Math.min(100, Math.round(
          (1 - daysLeft / 182) * 100
        ))
      : 0;

    return `
      <div style="background:#1a1400; border:1px solid #ffcc00;
        border-radius:12px; padding:16px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div>
            <div style="font-size:16px; font-weight:700; color:#ffcc00;">⏳ ${eng.name}</div>
            <div style="color:#aaa; font-size:12px; margin-top:3px;">
              ${eng.role} · Disponible el ${formatDateAR(eng.gardeningUntil)}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:22px; font-weight:800; color:#ffcc00;">${daysLeft}</div>
            <div style="color:#666; font-size:11px;">días restantes</div>
          </div>
        </div>
        <div style="background:#2a2000; border-radius:20px; height:8px; overflow:hidden;">
          <div style="width:${progress}%; height:100%;
            background:#ffcc00; border-radius:20px; transition:0.3s;"></div>
        </div>
        <div style="color:#aaa; font-size:12px; margin-top:8px;">
          Salario: ${formatMoney(eng.salary)}/año (se descuenta durante el gardening)
        </div>
      </div>
    `;
  }).join("");
}

function renderEngineersRanking() {
  const tbody = document.getElementById("engineersRankingBody");
  const table = document.getElementById("engineersRankingTable");
  if (!tbody || !table) return;

  const currentSort = table.dataset.sortKey || "aero";
  const currentDir  = table.dataset.sortDir || "desc";

  const roles = [
    { key: "aero_director",  label: "Directores de Aerodinámica", color: "#4caf50" },
    { key: "design_chief",   label: "Jefes de Diseño",            color: "#2196f3" },
    { key: "strategy_chief", label: "Jefes de Estrategia",        color: "#ff9800" },
    { key: "race_engineer",  label: "Ingenieros de Pista",        color: "#e10600" },
  ];

  tbody.innerHTML = "";

  roles.forEach((role) => {
    const group = [...engineers]
      .filter((e) => e.role === role.key)
      .sort((a, b) => {
        const aVal = a.attributes[currentSort] ?? 0;
        const bVal = b.attributes[currentSort] ?? 0;
        return currentDir === "desc" ? bVal - aVal : aVal - bVal;
      });

    // Fila de separador de rol
    const separator = document.createElement("tr");
    separator.innerHTML = `
      <td colspan="8" style="
        background:#111; color:${role.color};
        font-size:12px; font-weight:700; letter-spacing:1px;
        padding:10px 12px; border-bottom:1px solid #222;
      ">
        ${role.label.toUpperCase()}
      </td>
    `;
    tbody.appendChild(separator);

    group.forEach((eng) => {
      const team     = teams.find((t) => t.id === eng.teamId);
      const isPlayer = selectedTeam && eng.teamId === selectedTeam.id;
      const row      = document.createElement("tr");

      if (isPlayer) row.classList.add("player-team-row");

      const attrs = ["aero", "chassis", "strategy", "pitEngineering", "experience"];

      row.innerHTML = `
        <td>
          <strong>${eng.name}</strong>
          ${eng.gardening
            ? `<span style="color:#ffcc00; font-size:11px; margin-left:6px;">GARDENING</span>`
            : ""}
          ${isPlayer
            ? `<span style="color:#e10600; font-size:11px; margin-left:6px;">TU EQUIPO</span>`
            : ""}
        </td>
        <td style="color:#aaa; font-size:12px;">${eng.roleLabel}</td>
        <td style="color:${team ? team.color : "#aaa"}">
          ${team ? team.shortName : "Libre"}
        </td>
        ${attrs.map((attr) => `
          <td style="color:${
            eng.attributes[attr] >= 90 ? "#4caf50" :
            eng.attributes[attr] >= 80 ? "#ffcc00" : "#fff"
          }; font-weight:${currentSort === attr ? "800" : "400"};">
            ${eng.attributes[attr]}
          </td>
        `).join("")}
        <td style="color:${eng.contractUntil <= 2026 ? "#e10600" : "#fff"}">
          ${eng.contractUntil}
        </td>
      `;

      tbody.appendChild(row);
    });
  });
}function sortEngineersRanking(key) {
  const table = document.getElementById("engineersRankingTable");
  if (!table) return;

  const currentKey = table.dataset.sortKey;
  const currentDir = table.dataset.sortDir;

  const newDir = currentKey === key && currentDir === "desc" ? "asc" : "desc";

  table.dataset.sortKey = key;
  table.dataset.sortDir = newDir;

  const keys = ["aero", "chassis", "strategy", "pitEngineering", "experience"];
  keys.forEach((k) => {
    const icon = document.getElementById("sortIcon_" + k);
    if (icon) icon.textContent = k === key ? (newDir === "desc" ? "↓" : "↑") : "↕";
  });

  renderEngineersRanking();
}function sortDriversRanking(key) {
  const table = document.getElementById("driversRankingTable");
  if (!table) return;

  const currentKey = table.dataset.sortKey;
  const currentDir = table.dataset.sortDir;

  const newDir = currentKey === key && currentDir === "desc" ? "asc" : "desc";

  table.dataset.sortKey = key;
  table.dataset.sortDir = newDir;

  const keys = ["pace", "qualifying", "racecraft", "tireManagement", "experience", "potential"];
  keys.forEach((k) => {
    const icon = document.getElementById("driverSortIcon_" + k);
    if (icon) icon.textContent = k === key ? (newDir === "desc" ? "↓" : "↑") : "↕";
  });

  renderDriversComparison();
}// ══════════════════════════════════════════════════════════
// FIN DE TEMPORADA
// ══════════════════════════════════════════════════════════

function openEndOfSeason() {
  if (!selectedTeam) return;

  let season = null;
  try { season = loadJson("season.json"); } catch (e) {}

  const totalRaces    = season ? season.calendar.length : 22;
  const racesPlayed   = currentRound;

  if (racesPlayed < totalRaces) {
    const confirmed = confirm(
      `Todavía quedan ${totalRaces - racesPlayed} carreras por disputar.\n\n` +
      `¿Seguro que querés cerrar la temporada 2026 ahora?`
    );
    if (!confirmed) return;
  }

  evaluateSponsorsEndOfSeason();
  renderEndOfSeason();
  showScreen("endOfSeasonScreen");
}

function renderEndOfSeason() {
  document.getElementById("eosTitle").textContent =
    `Fin de Temporada 2026 — ${selectedTeam.name}`;

  renderEosChampions();
  renderEosPlayerSummary();
  renderEosConstructorStandings();
  renderEosDriverStandings();
  renderEosHighlights();
  renderEosFinancialSummary();
  renderEosExpiredContracts();
  renderEosDriverProgression();
}

// ── Campeones ──────────────────────────────────────────────

function renderEosChampions() {
  const driverChamp      = driverStandings[0];
  const constructorChamp = constructorStandings[0];

  const dcContainer = document.getElementById("eosDriverChampion");
  const ccContainer = document.getElementById("eosConstructorChampion");

  if (driverChamp) {
    const team = teams.find((t) => t.id === driverChamp.teamId);
    dcContainer.innerHTML = `
      <div style="font-size:32px; font-weight:900; color:#ffcc00; margin-bottom:6px;">
        ${driverChamp.driverName}
      </div>
      <div style="color:#aaa; font-size:14px; margin-bottom:12px;">
        ${team ? team.name : "-"}
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
        <div class="summary-item"><span>Puntos</span>
          <strong>${driverChamp.points}</strong></div>
        <div class="summary-item"><span>Victorias</span>
          <strong>${driverChamp.wins}</strong></div>
        <div class="summary-item"><span>Podios</span>
          <strong>${driverChamp.podiums}</strong></div>
      </div>
    `;
  }

  if (constructorChamp) {
    const team = teams.find((t) => t.id === constructorChamp.teamId);
    ccContainer.innerHTML = `
      <div style="font-size:28px; font-weight:900;
        color:${team ? team.color : "#ffcc00"}; margin-bottom:6px;">
        ${constructorChamp.teamName}
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px;">
        <div class="summary-item"><span>Puntos</span>
          <strong>${constructorChamp.points}</strong></div>
        <div class="summary-item"><span>Victorias</span>
          <strong>${constructorChamp.wins}</strong></div>
      </div>
    `;
  }
}

// ── Tu temporada ───────────────────────────────────────────

function renderEosPlayerSummary() {
  const container  = document.getElementById("eosPlayerSummary");
  const teamDrivers = getDriversByTeam(selectedTeam);

  const driverPos = driverStandings
    .map((d, i) => ({ ...d, pos: i + 1 }))
    .filter((d) => teamDrivers.some((td) => td.id === d.driverId));

  const constructorPos = constructorStandings
    .findIndex((c) => c.teamId === selectedTeam.id) + 1;

  const totalPoints = constructorStandings
    .find((c) => c.teamId === selectedTeam.id)?.points || 0;

  const prize = CONSTRUCTOR_PRIZE_MONEY[constructorPos - 1] || 0;

  const isChampion     = constructorPos === 1;
  const resultColor    = constructorPos <= 3 ? "#4caf50"
    : constructorPos <= 6 ? "#ffcc00" : "#aaa";

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
      gap:14px; margin-bottom:20px;">
      <div class="summary-item">
        <span>Posición en constructores</span>
        <strong style="font-size:28px; color:${resultColor};">
          P${constructorPos}
        </strong>
      </div>
      <div class="summary-item">
        <span>Puntos totales</span>
        <strong style="font-size:24px;">${totalPoints}</strong>
      </div>
      <div class="summary-item">
        <span>Premio económico</span>
        <strong style="color:#4caf50;">${formatMoney(prize)}</strong>
      </div>
      <div class="summary-item">
        <span>Carreras disputadas</span>
        <strong>${currentRound}</strong>
      </div>
    </div>

    ${isChampion ? `
      <div style="background:#1a1400; border:1px solid #ffcc00; border-radius:10px;
        padding:14px; color:#ffcc00; font-size:14px; margin-bottom:16px;">
        🏆 ¡${selectedTeam.name} es Campeón de Constructores 2026!
      </div>
    ` : ""}

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      ${driverPos.map((d) => `
        <div style="background:#0a0a0a; border:1px solid #222;
          border-radius:10px; padding:14px;">
          <div style="font-size:16px; font-weight:700; margin-bottom:6px;">
            ${d.driverName}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
            <div class="summary-item"><span>Pos.</span>
              <strong>P${d.pos}</strong></div>
            <div class="summary-item"><span>Puntos</span>
              <strong>${d.points}</strong></div>
            <div class="summary-item"><span>Victorias</span>
              <strong>${d.wins}</strong></div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ── Standings completos ────────────────────────────────────

function renderEosConstructorStandings() {
  const tbody = document.getElementById("eosConstructorBody");
  tbody.innerHTML = "";

  constructorStandings.forEach((c, i) => {
    const team  = teams.find((t) => t.id === c.teamId);
    const prize = CONSTRUCTOR_PRIZE_MONEY[i] || 0;
    const row   = document.createElement("tr");

    if (c.teamId === selectedTeam.id) row.classList.add("player-team-row");

    row.innerHTML = `
      <td><strong>${i + 1}</strong></td>
      <td style="color:${team ? team.color : "#fff"}">${c.teamName}</td>
      <td><strong>${c.points}</strong></td>
      <td>${c.wins}</td>
      <td style="color:#4caf50;">${formatMoney(prize)}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderEosDriverStandings() {
  const tbody = document.getElementById("eosDriverBody");
  tbody.innerHTML = "";

  driverStandings.slice(0, 10).forEach((d, i) => {
    const team = teams.find((t) => t.id === d.teamId);
    const row  = document.createElement("tr");

    const isPlayer = selectedTeam &&
      getDriversByTeam(selectedTeam).some((td) => td.id === d.driverId);
    if (isPlayer) row.classList.add("player-team-row");

    row.innerHTML = `
      <td><strong>${i + 1}</strong></td>
      <td>${d.driverName}</td>
      <td style="color:${team ? team.color : "#aaa'"}">
        ${team ? team.shortName : "-"}
      </td>
      <td><strong>${d.points}</strong></td>
      <td>${d.wins}</td>
      <td>${d.podiums}</td>
    `;
    tbody.appendChild(row);
  });
}

// ── Highlights ─────────────────────────────────────────────

function renderEosHighlights() {
  const container = document.getElementById("eosHighlights");

  const mostWins    = [...driverStandings].sort((a, b) => b.wins - a.wins)[0];
  const mostPodiums = [...driverStandings].sort((a, b) => b.podiums - a.podiums)[0];
  const mostPoints  = driverStandings[0];

  const teamDrivers  = getDriversByTeam(selectedTeam);
  const playerPoints = driverStandings
    .filter((d) => teamDrivers.some((td) => td.id === d.driverId))
    .reduce((sum, d) => sum + d.points, 0);

  const playerWins = driverStandings
    .filter((d) => teamDrivers.some((td) => td.id === d.driverId))
    .reduce((sum, d) => sum + d.wins, 0);

  const highlights = [
    { label: "Máximo ganador",     value: `${mostWins?.driverName} (${mostWins?.wins} victorias)` },
    { label: "Más podios",         value: `${mostPodiums?.driverName} (${mostPodiums?.podiums} podios)` },
    { label: "Más puntos",         value: `${mostPoints?.driverName} (${mostPoints?.points} pts)` },
    { label: "Tu equipo anotó",    value: `${playerPoints} puntos` },
    { label: "Victorias del equipo", value: `${playerWins}` },
    { label: "Carreras disputadas",  value: `${currentRound} de 22` },
  ];

  container.innerHTML = highlights.map((h) => `
    <div style="display:flex; justify-content:space-between; align-items:center;
      padding:10px 0; border-bottom:1px solid #1a1a1a; font-size:14px;">
      <span style="color:#aaa;">${h.label}</span>
      <strong style="color:#fff;">${h.value}</strong>
    </div>
  `).join("");
}

// ── Finanzas ───────────────────────────────────────────────

function renderEosFinancialSummary() {
  const container = document.getElementById("eosFinancialSummary");
  if (!seasonEconomics) {
    container.innerHTML = `<p style="color:#666;">Sin datos económicos.</p>`;
    return;
  }

  const constructorPos = constructorStandings
    .findIndex((c) => c.teamId === selectedTeam.id) + 1;
  const prize = CONSTRUCTOR_PRIZE_MONEY[constructorPos - 1] || 0;
  const finalBudget = selectedTeam.budget + prize;

  const items = [
    { label: "Presupuesto inicial",    value: formatMoney(seasonEconomics.initialBudget),  color: "#fff" },
    { label: "Ingresos de carrera",    value: formatMoney(seasonEconomics.raceIncome),     color: "#4caf50" },
    { label: "Premio constructores",   value: formatMoney(prize),                          color: "#4caf50" },
    { label: "Salarios pagados",       value: formatMoney(seasonEconomics.salaryExpenses), color: "#e10600" },
    { label: "Costos de desarrollo",   value: formatMoney(seasonEconomics.developmentCosts), color: "#e10600" },
    { label: "Reparaciones",           value: formatMoney(seasonEconomics.accidentCosts),  color: "#e10600" },
    { label: "Presupuesto para 2027",  value: formatMoney(finalBudget),                    color: "#ffcc00" },
  ];

  container.innerHTML = items.map((item) => `
    <div style="display:flex; justify-content:space-between; align-items:center;
      padding:10px 0; border-bottom:1px solid #1a1a1a; font-size:14px;">
      <span style="color:#aaa;">${item.label}</span>
      <strong style="color:${item.color};">${item.value}</strong>
    </div>
  `).join("");
}

// ── Contratos vencidos ─────────────────────────────────────

function renderEosExpiredContracts() {
  const container = document.getElementById("eosExpiredContracts");

  const expiredDrivers = drivers.filter(
    (d) => d.teamId === selectedTeam.id && d.contract.until <= 2026
  );

  const expiredEngineers = engineers.filter(
    (e) => e.teamId === selectedTeam.id && e.contractUntil <= 2026
  );

  if (expiredDrivers.length === 0 && expiredEngineers.length === 0) {
    container.innerHTML = `
      <div style="color:#4caf50; font-size:14px; padding:12px;">
        ✓ Todos los contratos siguen vigentes para 2027.
      </div>`;
    return;
  }

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
      gap:12px;">
      ${expiredDrivers.map((d) => `
        <div style="background:#1a0a0a; border:1px solid #e10600;
          border-radius:10px; padding:14px;">
          <div style="color:#e10600; font-size:12px; font-weight:700;
            margin-bottom:6px;">PILOTO — CONTRATO VENCIDO</div>
          <div style="font-size:16px; font-weight:700;">${d.name}</div>
          <div style="color:#aaa; font-size:12px; margin-top:4px;">
            Salario actual: ${formatMoney(d.contract.salary)}
          </div>
          <button class="btn" style="width:100%; margin-top:10px; padding:9px; font-size:12px;"
            onclick="closeEndOfSeason(); openModule('Mercado')">
            IR AL MERCADO
          </button>
        </div>
      `).join("")}
      ${expiredEngineers.map((e) => `
        <div style="background:#1a0a0a; border:1px solid #e10600;
          border-radius:10px; padding:14px;">
          <div style="color:#e10600; font-size:12px; font-weight:700;
            margin-bottom:6px;">INGENIERO — CONTRATO VENCIDO</div>
          <div style="font-size:16px; font-weight:700;">${e.name}</div>
          <div style="color:#aaa; font-size:12px; margin-top:4px;">
            ${e.roleLabel} · ${formatMoney(e.salary)}/año
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ── Progresión de pilotos ──────────────────────────────────

function renderEosDriverProgression() {
  const container   = document.getElementById("eosDriverProgression");
  const teamDrivers = getDriversByTeam(selectedTeam);

  const allDrivers  = [...drivers].sort((a, b) => {
    const aIsPlayer = teamDrivers.some((td) => td.id === a.id);
    const bIsPlayer = teamDrivers.some((td) => td.id === b.id);
    if (aIsPlayer && !bIsPlayer) return -1;
    if (!aIsPlayer && bIsPlayer) return 1;
    return 0;
  });

  const changes = allDrivers.slice(0, 10).map((driver) => {
    const history  = driverResultsHistory[driver.id] || [];
    const wins     = history.filter((r) => r.position === 1).length;
    const points   = history.reduce((s, r) => s + (r.points || 0), 0);
    const isPlayer = teamDrivers.some((td) => td.id === driver.id);

    let paceChange = 0;
    let expChange  = 0;

    if (driver.age <= 23) {
      paceChange = wins > 0 ? 2 : points > 50 ? 1 : 0;
      expChange  = 3;
    } else if (driver.age <= 28) {
      paceChange = wins > 2 ? 1 : 0;
      expChange  = 2;
    } else if (driver.age <= 32) {
      expChange  = 1;
    } else {
      paceChange = -1;
      expChange  = 1;
    }

    return { driver, paceChange, expChange, isPlayer };
  });

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
      gap:12px;">
      ${changes.map(({ driver, paceChange, expChange, isPlayer }) => `
        <div style="background:${isPlayer ? "#0d1a0d" : "#0a0a0a"};
          border:1px solid ${isPlayer ? "#2d5a2d" : "#1a1a1a"};
          border-radius:10px; padding:14px;">
          <div style="font-size:15px; font-weight:700; margin-bottom:3px;">
            ${driver.name}
            ${isPlayer ? `<span style="color:#4caf50; font-size:11px; margin-left:6px;">
              TU EQUIPO</span>` : ""}
          </div>
          <div style="color:#aaa; font-size:12px; margin-bottom:10px;">
            ${driver.age} años → ${driver.age + 1} años
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            ${paceChange !== 0 ? `
              <div style="background:#111; border-radius:6px; padding:6px 10px;
                font-size:12px; color:${paceChange > 0 ? "#4caf50" : "#e10600"};">
                Pace ${paceChange > 0 ? "+" : ""}${paceChange}
              </div>
            ` : ""}
            ${expChange !== 0 ? `
              <div style="background:#111; border-radius:6px; padding:6px 10px;
                font-size:12px; color:#4caf50;">
                Experiencia +${expChange}
              </div>
            ` : ""}
            ${paceChange === 0 && expChange === 0 ? `
              <div style="color:#666; font-size:12px;">Sin cambios este año</div>
            ` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ── Iniciar nueva temporada ────────────────────────────────

function closeEndOfSeason() {
  showScreen("gameScreen");
}

function confirmStartNewSeason() {
  const confirmed = confirm(
    "¿Confirmar inicio de temporada 2027?\n\n" +
    "Esto aplicará todos los cambios:\n" +
    "- Fichajes acordados\n" +
    "- Contratos vencidos liberados\n" +
    "- Progresión de pilotos\n" +
    "- Premio de constructores cobrado\n" +
    "- Calendario resetado a 2027"
  );
  if (!confirmed) return;

  startNewSeason();
}

function startNewSeason() {
  const constructorPos = constructorStandings
    .findIndex((c) => c.teamId === selectedTeam.id) + 1;
  const prize = CONSTRUCTOR_PRIZE_MONEY[constructorPos - 1] || 0;

  selectedTeam.budget += prize;

  addTransaction({
    date:     currentDate,
    type:     "income",
    category: "race_prize",
    amount:   prize,
    description: `Premio campeonato constructores — P${constructorPos}`,
  });

  // Procesar mercado rival antes de resetear
  processRivalContractDecisions();
  applyAgreedTransfers();
  applyEndOfSeasonProgression();
  releaseExpiredContracts();

  // Evolucionar equipos rivales
  evolveTeamsForNewSeason();

  // Fichar pilotos libres para equipos con asientos vacíos
  processRivalTransfers();

  // Otorgar veto a equipos históricos elegibles
  checkConcordiaVetoEligibility();

  resetSeasonData();

  // Actualizar año en regulations
  if (regulations) {
    regulations.season = parseInt(currentDate.split("-")[0]);
  }

  addNews(
    "🏁 Nueva temporada",
    `Bienvenido a la temporada ${regulations?.season || 2027}`,
    `${selectedTeam.name} arranca una nueva temporada con un presupuesto de ` +
    `${formatMoney(selectedTeam.budget)}. Los cambios en la parrilla y la ` +
    `evolución de los coches marcarán el inicio de un nuevo ciclo.`
  );

  syncSelectedTeamWithTeams();
  saveCurrentGame();
  goToDashboard();
}

function releaseExpiredContracts() {
  drivers.forEach((driver) => {
    if (driver.contract.until <= 2026 &&
        driver.teamId === selectedTeam.id) {
      const hasAgreed = agreedTransfers.some(
        (t) => t.type === "driver" && t.personId === driver.id
      );
      if (!hasAgreed) {
        driver.teamId = null;
      }
    }
  });

  engineers.forEach((eng) => {
    if (eng.contractUntil <= 2026 &&
        eng.teamId === selectedTeam.id) {
      eng.teamId = null;
    }
  });
}

function resetSeasonData() {
  const newYear = 2027;

  currentRound        = 0;
  currentDate         = `${newYear}-01-01`;
  driverStandings     = initDriverStandings();
  constructorStandings = initConstructorStandings();
  driverResultsHistory = {};
  transactions        = [];
  seasonEconomics     = initSeasonEconomics();
  testingState        = null;
  testingGains        = { aero: 0, chassis: 0, reliability: 0, pitStop: 0 };
  activeUpgrades      = [];
  rivalUpgrades       = [];
  tyreInventories     = {};
  usedDevelopmentTokens = { aero: 0, chassis: 0, powerUnit: 0 };

  drivers.forEach((d) => { d.age += 1; });

  // Resetear vetos del Pacto de la Concordia
  teams.forEach((t) => {
    if (t.concordiaPact) t.concordiaPact.vetoUsedThisSeason = false;
  });

  try {
    const season = loadJson("season.json");
    season.year = newYear;
    season.calendar = season.calendar.map((race) => ({
      ...race,
      date: race.date.replace("2026", newYear.toString()),
    }));
  } catch (e) {
    console.error("No se pudo actualizar el calendario:", e);
  }
}

function evolveTeamsForNewSeason() {
  teams.forEach((team) => {
    if (team.id === selectedTeam.id) return;

    const constructorPos = constructorStandings.findIndex(
      (c) => c.teamId === team.id
    ) + 1 || 6;

    const totalPoints = constructorStandings.find(
      (c) => c.teamId === team.id
    )?.points || 0;

    const budgetRatio = team.budget / (team.finances?.weeklyBurnRate * 52 || 150000000);

    // Factor de crecimiento o decadencia
    let performanceChange = 0;

    // Equipos con buenos resultados y presupuesto crecen
    if (constructorPos <= 3 && budgetRatio >= 1.5) {
      performanceChange = Math.floor(Math.random() * 3) + 1; // +1 a +3
    } else if (constructorPos <= 6 && budgetRatio >= 1.2) {
      performanceChange = Math.floor(Math.random() * 2); // 0 a +2
    } else if (constructorPos >= 8 && budgetRatio < 0.8) {
      performanceChange = -(Math.floor(Math.random() * 3) + 1); // -1 a -3
    } else if (constructorPos >= 9 && totalPoints < 10) {
      performanceChange = -(Math.floor(Math.random() * 2)); // 0 a -2
    } else {
      performanceChange = Math.floor(Math.random() * 3) - 1; // -1 a +1
    }

    // Aplicar cambio con límites
    const p = team.performance;
    const change = performanceChange;

    p.aero        = Math.min(99, Math.max(50, p.aero        + change + Math.floor(Math.random() * 3) - 1));
    p.chassis     = Math.min(99, Math.max(50, p.chassis     + change + Math.floor(Math.random() * 3) - 1));
    p.reliability = Math.min(99, Math.max(50, p.reliability + change + Math.floor(Math.random() * 3) - 1));
    p.pitStop     = Math.min(99, Math.max(50, p.pitStop     + change + Math.floor(Math.random() * 3) - 1));

    recalculateTeamOverallPerformance(team);

    // Noticia si el cambio es significativo
    if (performanceChange >= 2) {
      addNews(
        "📈 Paddock",
        `${team.shortName} llega reforzado a la nueva temporada`,
        `${team.name} ha trabajado intensamente durante el invierno y llega a la temporada con un coche claramente mejorado. Sus rivales ya toman nota.`
      );
    } else if (performanceChange <= -2) {
      addNews(
        "📉 Paddock",
        `Preocupación en ${team.shortName} de cara a la nueva temporada`,
        `Los números de ${team.name} en el desarrollo invernal no son alentadores. El equipo llega a la temporada con menos competitividad que el año anterior y necesitará resultados rápidos para calmar las aguas.`
      );
    }
  });
}

function processRivalTransfers() {
  // Encontrar pilotos sin equipo
  const freeDrivers = drivers.filter((d) => !d.teamId || d.teamId === null);

  // Encontrar equipos con asientos vacíos
  teams.forEach((team) => {
    if (team.id === selectedTeam.id) return;

    const currentDrivers = drivers.filter((d) => d.teamId === team.id);
    const emptySeats = 2 - currentDrivers.length;

    if (emptySeats <= 0) return;

    for (let i = 0; i < emptySeats; i++) {
      if (freeDrivers.length === 0) break;

      // Elegir el mejor piloto disponible según presupuesto del equipo
      const affordable = freeDrivers.filter((d) => {
        const expectation = getDriverSalaryExpectation(d);
        return team.budget >= expectation * 1.2;
      });

      if (affordable.length === 0) continue;

      // Equipos top buscan los mejores, equipos chicos buscan los más baratos
      const isTopTeam = team.performance.overall >= 88;
      affordable.sort((a, b) => {
        const ratingA = calcDriverRating(a);
        const ratingB = calcDriverRating(b);
        return isTopTeam ? ratingB - ratingA : ratingA - ratingB;
      });

      const chosen = affordable[0];
      const salary = getDriverSalaryExpectation(chosen);

      chosen.teamId           = team.id;
      chosen.contract.salary  = salary;
      chosen.contract.until   = regulations.season + Math.floor(Math.random() * 2) + 1;

      team.budget -= salary;

      // Sacar de libres
      const idx = freeDrivers.indexOf(chosen);
      if (idx > -1) freeDrivers.splice(idx, 1);

      addNews(
        "🔄 Mercado",
        `${team.shortName} confirma a ${chosen.name} para la nueva temporada`,
        `${chosen.name} llega a ${team.name} para cubrir el asiento vacante. El piloto firma por ${chosen.contract.until - regulations.season + 1} año${chosen.contract.until - regulations.season + 1 > 1 ? "s" : ""} con el equipo.`
      );
    }
  });
}

function processRivalContractDecisions() {
  teams.forEach((team) => {
    if (team.id === selectedTeam.id) return;

    const teamDriversList = drivers.filter((d) => d.teamId === team.id);

    teamDriversList.forEach((driver) => {
      // Contrato vencido
      if (driver.contract.until <= regulations.season) {
        const history  = driverResultsHistory[driver.id] || [];
        const recent   = history.slice(0, 5);
        const points   = recent.reduce((s, r) => s + (r.points || 0), 0);
        const rating   = calcDriverRating(driver);

        // Decidir si renovar
        const shouldRenew = points >= 15 || rating >= 85;

        if (shouldRenew) {
          driver.contract.until = regulations.season + Math.floor(Math.random() * 2) + 1;
          addNews(
            "📋 Mercado",
            `${team.shortName} renueva con ${driver.name}`,
            `${driver.name} continuará con ${team.name} tras renovar su contrato. El equipo confía en el rendimiento del piloto para la próxima temporada.`
          );
        } else {
          // Liberar al piloto
          driver.teamId = null;
          addNews(
            "🔄 Mercado",
            `${driver.name} deja ${team.shortName}`,
            `${team.name} y ${driver.name} no han llegado a un acuerdo para continuar juntos. El piloto queda libre y buscará nuevas opciones en el mercado.`
          );
        }
      }
    });
  });
}

function checkConcordiaVetoEligibility() {
  teams.forEach((team) => {
    if (team.concordiaPact?.hasVeto) return;
    if (!team.concordiaPact) return;

    team.concordiaPact.yearsInF1 += 1;

    // Elegible si lleva 40+ años y tiene problemas económicos o amenaza con irse
    const isEligible  = team.concordiaPact.yearsInF1 >= 40;
    const hasProblems = team.budget < team.finances?.weeklyBurnRate * 26;
    const isHistoric  = ["McLaren","Williams","Ferrari"].includes(team.shortName);

    if (isEligible && (hasProblems || isHistoric) && Math.random() < 0.3) {
      team.concordiaPact.hasVeto = true;

      addNews(
        "⚖️ Pacto de la Concordia",
        `La FIA otorga veto especial a ${team.shortName}`,
        `Reconociendo la trayectoria histórica de ${team.name} en la Fórmula 1 y su contribución al deporte, la FIA ha decidido otorgarle derechos de veto especiales bajo el Pacto de la Concordia. ${team.shortName} se convierte en el segundo equipo con este privilegio histórico, junto a Ferrari.`
      );
    }
  });
}
// ══════════════════════════════════════════════════════════
// PRÁCTICAS LIBRES Y ESTRATEGIA
// ══════════════════════════════════════════════════════════

const FP_PROGRAMS = [
  {
    id: "aero",
    name: "Programa Aerodinámico",
    icon: "🔬",
    description: "Evaluación de carga aerodinámica y balance del coche.",
    dataType: "aero",
    degradationBonus: 0,
    paceBonus: 0.002,
    reliabilityRisk: 0.05,
  },
  {
    id: "tire_deg",
    name: "Simulación de Degradación",
    icon: "🟡",
    description: "Stint largo para medir degradación real de cada compuesto.",
    dataType: "degradation",
    degradationBonus: 0.15,
    paceBonus: 0,
    reliabilityRisk: 0.04,
  },
  {
    id: "race_sim",
    name: "Simulación de Carrera",
    icon: "🏎️",
    description: "Stint completo simulando condiciones de carrera.",
    dataType: "racePace",
    degradationBonus: 0.10,
    paceBonus: 0.003,
    reliabilityRisk: 0.08,
  },
  {
    id: "qualifying_prep",
    name: "Preparación Clasificación",
    icon: "⚡",
    description: "Setup orientado a vuelta rápida con blando nuevo.",
    dataType: "qualifying",
    degradationBonus: 0,
    paceBonus: 0.005,
    reliabilityRisk: 0.06,
  },
  {
    id: "setup",
    name: "Ajuste de Setup",
    icon: "🔧",
    description: "Refinamiento del balance mecánico del coche.",
    dataType: "setup",
    degradationBonus: 0.05,
    paceBonus: 0.002,
    reliabilityRisk: 0.03,
  },
];

function openPracticeWeekend() {
  if (!selectedTeam) return;

  if (compounds.length === 0) {
    try { compounds = loadJson("compounds.json"); } catch (e) {
      alert("No se pudo cargar compounds.json\n\n" + e.message);
      return;
    }
  }

  let season   = null;
  let circuits = [];
  try {
    season   = loadJson("season.json");
    circuits = loadJson("circuits.json");
  } catch (e) {
    alert("Error cargando datos del circuito.");
    return;
  }

  const nextRace = season.calendar.find((r) => r.round > currentRound);
  if (!nextRace) {
    alert("No hay más carreras en el calendario.");
    return;
  }

  const circuit = circuits.find((c) => c.id === nextRace.circuitId);
  if (!circuit) {
    alert("No se encontró el circuito.");
    return;
  }

  practiceData = {
    race:    nextRace,
    circuit,
    fp1:     { completed: false, programs: {}, results: {} },
    fp2:     { completed: false, programs: {}, results: {} },
    fp3:     { completed: false, programs: {}, results: {} },
    data: {
      degradationFactor: circuit.degradation === "high" ? 1.3
        : circuit.degradation === "medium" ? 1.0 : 0.7,
      paceFactor:        1.0,
      optimalStops:      circuit.strategy.recommended,
      compoundRatings:   {},
      setupBonus:        0,
      trackRubber:       0.0,
    },
  };

  raceStrategy = null;
  tyreInventories = {};

  document.getElementById("practiceTitle").textContent =
    nextRace.name;
  document.getElementById("practiceSubtitle").textContent =
    `${circuit.name} · ${circuit.country} · Ronda ${nextRace.round}`;

  switchPracticeTab("FP1");
  showScreen("practiceScreen");
}

function switchPracticeTab(tab) {
  ["FP1", "FP2", "FP3", "Strategy"].forEach((t) => {
    document.getElementById(`practice${t}Tab`).style.display =
      t === tab ? "block" : "none";
    document.getElementById(`tab${t}`).className =
      t === tab ? "btn" : "btn btn-secondary";
  });

  if (tab === "FP1")      renderFPSession("FP1");
  if (tab === "FP2")      renderFPSession("FP2");
  if (tab === "FP3")      renderFPSession("FP3");
  if (tab === "Strategy") renderStrategyPanel();
}

// ── Sesiones de práctica ───────────────────────────────────

function renderFPSession(session) {
  if (!practiceData) return;

  const fpKey   = session.toLowerCase();
  const fpData  = practiceData[fpKey];
  const circuit = practiceData.circuit;
  const race    = practiceData.race;
  const teamDrivers = getDriversByTeam(selectedTeam);

  const programsEl = document.getElementById(`${fpKey}Programs`);
  const actionsEl  = document.getElementById(`${fpKey}Actions`);
  const resultsEl  = document.getElementById(`${fpKey}Results`);
  const sideEl     = session === "FP1" ? document.getElementById("fp1CircuitInfo")
                   : session === "FP2" ? document.getElementById("fp2DataFromFP1")
                   : document.getElementById("fp3AccumulatedData");

  // ── Columna lateral ───────────────────────────────────
  if (session === "FP1") renderFP1CircuitInfo();
  if (session === "FP2") renderFP2DataFromFP1();
  if (session === "FP3") renderFP3AccumulatedData();

  // ── Sesión completada — mostrar resultados ────────────
  if (fpData.completed) {
    if (programsEl) programsEl.innerHTML = `
      <div style="color:#4caf50; font-size:13px; padding:10px 14px;
        background:#0a1a0a; border:1px solid #2d5a2d; border-radius:8px;
        margin-bottom:16px;">
        ✓ ${session} completada
      </div>`;

    if (resultsEl) {
      resultsEl.style.display = "block";
      renderFPResults(session, fpData.results);
    }
    if (actionsEl) actionsEl.innerHTML = "";
    return;
  }

  // ── Pre-sesión — resumen antes de entrar ──────────────
  const config    = SESSION_CONFIG?.[session];
  const rubber    = config?.trackRubber || 0;
  const rubberPct = Math.round(rubber * 1000);
  const rubberLabel = rubber === 0 ? "Pista verde" :
    rubber < 0.02 ? "Poco engomada" :
    rubber < 0.04 ? "Engomada" : "Muy engomada";

  const weatherIcon_  = weatherIcon(raceWeather || "dry");
  const weatherLabel_ = weatherLabel(raceWeather || "dry");

  if (programsEl) programsEl.innerHTML = `
    <div style="display:grid; gap:14px;">

      <!-- Estado de pilotos -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        ${teamDrivers.map((driver) => {
          const ds = practiceSessionState?.driverStates?.[driver.id];
          const score      = ds?.setupScore     || 0;
          const confidence = ds?.confidence     || 0;
          const scoreColor = score >= 70 ? "#4caf50" : score >= 40 ? "#ffcc00" : "#e10600";
          const confColor  = confidence >= 70 ? "#4caf50" : confidence >= 40 ? "#ffcc00" : "#e10600";

          return `
            <div style="background:#0a0a0a; border:1px solid #1a1a1a;
              border-radius:10px; padding:14px;">
              <div style="font-size:15px; font-weight:800; color:#fff;
                margin-bottom:10px;">
                #${driver.number} ${driver.name}
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <div>
                  <div style="color:#666; font-size:11px; margin-bottom:3px;">
                    Setup
                  </div>
                  <div style="font-size:20px; font-weight:800; color:${scoreColor};">
                    ${score}%
                  </div>
                </div>
                <div>
                  <div style="color:#666; font-size:11px; margin-bottom:3px;">
                    Confianza
                  </div>
                  <div style="font-size:20px; font-weight:800; color:${confColor};">
                    ${confidence}%
                  </div>
                </div>
              </div>
              ${score === 0 ? `
                <div style="color:#444; font-size:11px; margin-top:8px;">
                  Primera sesión — sin datos de reglajes todavía
                </div>
              ` : ""}
            </div>
          `;
        }).join("")}
      </div>

      <!-- Condiciones de pista -->
      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:11px; font-weight:700;
          letter-spacing:1px; margin-bottom:10px;">CONDICIONES DE PISTA</div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px;">
          <div>
            <div style="color:#666; font-size:11px; margin-bottom:3px;">Clima</div>
            <div style="font-size:14px; font-weight:700; color:#fff;">
              ${weatherIcon_} ${weatherLabel_}
            </div>
          </div>
          <div>
            <div style="color:#666; font-size:11px; margin-bottom:3px;">Engomado</div>
            <div style="font-size:14px; font-weight:700; color:#ffcc00;">
              ${rubberLabel}
            </div>
          </div>
          <div>
            <div style="color:#666; font-size:11px; margin-bottom:3px;">Temp. pista</div>
            <div style="font-size:14px; font-weight:700; color:#fff;">
              ${circuit.trackTemp?.min}–${circuit.trackTemp?.max}°C
            </div>
          </div>
        </div>
      </div>

      <!-- Info de sesión -->
      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:11px; font-weight:700;
          letter-spacing:1px; margin-bottom:10px;">SOBRE ESTA SESIÓN</div>
        <div style="color:#888; font-size:13px; line-height:1.6;">
          ${session === "FP1"
            ? "Primera sesión del fin de semana. Pista verde. Ideal para correlación aerodinámica, vuelta de instalación y primeros datos de neumáticos."
            : session === "FP2"
            ? "Sesión larga. La pista ya está más limpia. Foco en simulación de clasificación en la primera mitad, simulación de carrera al final."
            : "Última sesión antes de clasificación. Pista bien engomada. Foco en preparación de clasificación y ajuste fino del setup."}
        </div>
      </div>

    </div>
  `;

  // Botón iniciar
  if (actionsEl) actionsEl.innerHTML = `
    <button class="btn" style="width:260px; font-size:14px; padding:14px;"
      onclick="runFPSession('${session}')">
      INICIAR ${session} →
    </button>
  `;

  if (resultsEl) resultsEl.style.display = "none";
}

function selectFPProgram(fpKey, driverId, programId) {
  if (!practiceData) return;
  practiceData[fpKey].programs[driverId] = programId;

  const drivers = getDriversByTeam(selectedTeam);
  drivers.forEach((d) => {
    FP_PROGRAMS.forEach((prog) => {
      const el = document.getElementById(`${fpKey}Prog_${d.id}_${prog.id}`);
      if (!el) return;
      const isSelected = practiceData[fpKey].programs[d.id] === prog.id;
      el.style.border     = isSelected ? "1px solid #e10600" : "1px solid #2a2a2a";
      el.style.background = isSelected ? "#1a0a0a" : "#161616";
    });
  });

  const allSelected = drivers.every(
    (d) => practiceData[fpKey].programs[d.id]
  );
  const btn = document.getElementById(`${fpKey}RunBtn`);
  if (btn) btn.disabled = !allSelected;
}

function runFPSession(session) {
  if (!practiceData) return;

  const fpKey     = session.toLowerCase();
  const fpData    = practiceData[fpKey];

  if (fpData.completed) return;

  // Cargar compounds si no están
  if (compounds.length === 0) {
    try { compounds = loadJson("compounds.json"); } catch (e) {
      alert("No se pudo cargar compounds.json\n\n" + e.message);
      return;
    }
  }

  // Abrir pantalla de pre-sesión en lugar de correr directo
  openPreSession(session);
}

function finalizeFPSession(session, state) {
  const fpKey  = session.toLowerCase();
  const fpData = practiceData[fpKey];
  const circuit = practiceData.circuit;

  // Construir results en el formato que ya espera el resto del juego
  const results = {};
  state.drivers.forEach(driver => {
    const program = driver.program;

    // Actualizar compound ratings si el programa lo requiere
    const compoundData = {};
    if (program && (program.dataType === "degradation" || program.dataType === "racePace")) {
      const availableCompounds = circuit.compoundsAvailable || ["soft", "medium", "hard"];
      availableCompounds.forEach(cId => {
        const compound = compounds.find(c => c.id === cId);
        if (!compound) return;
        const degradation = compound.degradationRate
          * practiceData.data.degradationFactor
          * (1 + (Math.random() - 0.5) * 0.2);
        compoundData[cId] = {
          degradation: Math.round(degradation * 1000) / 1000,
          maxLaps:     Math.round(compound.maxLaps * (1 / practiceData.data.degradationFactor)),
          pace:        compound.pace * (1 + (program.paceBonus || 0)),
        };
        practiceData.data.compoundRatings[cId] = compoundData[cId];
      });
    }

    if (program && program.dataType === "setup") {
      practiceData.data.setupBonus = Math.min(
        0.02,
        (practiceData.data.setupBonus || 0) + 0.004 + Math.random() * 0.004
      );
    }

    if (program) {
      practiceData.data.degradationFactor = Math.max(
        0.5,
        practiceData.data.degradationFactor - program.degradationBonus * 0.1
      );
    }

    results[driver.id] = {
      driverName:    driver.name,
      programName:   program ? program.name : "Sin programa",
      paceResult:    driver.bestLap || 0,
      lapsCompleted: driver.lapsCompleted,
      hasProblem:    driver.hasProblem,
      compoundData,
      dataType:      program ? program.dataType : null,
      confidence:    driver.confidence,
      bestLap:       driver.bestLap ? _formatTime(driver.bestLap) : "--:--.---",
      gap:           driver.gap,
    };
  });

  // Track rubber acumulado
  const rainPenalty = raceWeather === "heavy_rain" ? 0.8
    : raceWeather === "light_rain" ? 0.4
    : raceWeather === "cloudy" ? 0.1 : 0;
  practiceData.data.trackRubber = Math.max(
    0,
    (practiceData.data.trackRubber + 0.006) - rainPenalty
  );

  fpData.completed = true;
  fpData.results   = results;

  addNews(
    "Fin de semana",
    `${selectedTeam.shortName} completa ${session} en ${practiceData.circuit.name}`,
    `El equipo completó la sesión de ${session}. Los pilotos acumularon confianza y los ingenieros analizan los datos.`
  );

  saveCurrentGame();

  // Volver a la pantalla de práctica con resultados
  hideLiveTimingScreen();
  renderFPSession(session);
}

function renderFPResults(session, results) {
  const fpKey     = session.toLowerCase();
  const resultsEl = document.getElementById(`${fpKey}Results`);
  if (!resultsEl) return;

  const allDriverResults = drivers.filter((d) => d.role !== "tester").map((driver) => {
    const team      = teams.find((t) => t.id === driver.teamId);
    const carScore  = team ? team.performance.overall : 70;
    const driverScore =
      driver.attributes.pace * 0.35 +
      driver.attributes.qualifying * 0.25 +
      driver.attributes.consistency * 0.2 +
      driver.attributes.experience * 0.1 +
      driver.form * 0.1;

    const baseTime        = 86.5;
    const puScore = team?.powerUnit?.overall || 80;
const combinedScore = (carScore * 0.45 + driverScore * 0.35 + puScore * 0.20);
const performanceFactor = combinedScore / 100;
const sessionNoise = session === "FP1" ? Math.random() * 1.8
  : session === "FP2" ? Math.random() * 1.2 : Math.random() * 0.8;
const rubberBonus = practiceData?.data?.trackRubber || 0;
const lapTime = baseTime - performanceFactor * 9.5 + sessionNoise - rubberBonus;

    return {
      driverId:   driver.id,
      driverName: driver.name,
      teamName:   team ? team.shortName : "-",
      teamColor:  team ? team.color : "#aaa",
      lapTime,
      isPlayer:   selectedTeam && driver.teamId === selectedTeam.id,
    };
  }).sort((a, b) => a.lapTime - b.lapTime);

  const leader = allDriverResults[0].lapTime;

  resultsEl.innerHTML = `
    <h3 style="margin-bottom:14px;">Tiempos de ${session}</h3>

    <table class="ranking-table">
      <thead>
        <tr>
          <th>Pos</th>
          <th>Piloto</th>
          <th>Equipo</th>
          <th>Tiempo</th>
          <th>Gap</th>
        </tr>
      </thead>
      <tbody>
        ${allDriverResults.map((r, i) => `
          <tr class="${r.isPlayer ? "player-team-row" : ""}">
            <td><strong>${i + 1}</strong></td>
            <td>${r.driverName}</td>
            <td style="color:${r.teamColor}">${r.teamName}</td>
            <td>${formatLapTime(r.lapTime)}</td>
            <td style="color:#aaa;">
              ${i === 0 ? "Líder" : "+" + formatRaceGap(r.lapTime - leader)}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    ${Object.keys(results).length > 0 ? `
      <div style="margin-top:20px;">
        <h3 style="margin-bottom:14px;">Programas de trabajo</h3>
        ${Object.values(results).map((r) => `
          <div style="background:#0a0a0a; border:1px solid #1a1a1a;
            border-radius:10px; padding:12px; margin-bottom:10px;
            display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:14px; font-weight:700; margin-bottom:3px;">
                ${r.driverName}
                ${r.hasProblem
                  ? `<span style="color:#e10600; font-size:12px; margin-left:8px;">
                      ⚠️ Problema</span>`
                  : ""}
              </div>
              <div style="color:#aaa; font-size:12px;">${r.programName}</div>
            </div>
            <div style="text-align:right;">
              <div style="color:#4caf50; font-size:13px;">${r.lapsCompleted} vueltas</div>
              <div style="color:#666; font-size:11px;">
                Índice: ${r.paceResult}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    ` : ""}
  `;
}

function renderFP1CircuitInfo() {
  if (!practiceData) return;
  const circuit  = practiceData.circuit;
  const container = document.getElementById("fp1CircuitInfo");
  if (!container) return;

  const availableCompounds = (circuit.compoundsAvailable || [])
    .map((cId) => compounds.find((c) => c.id === cId))
    .filter(Boolean);

  container.innerHTML = `
    <div style="display:grid; gap:8px;">
      <div class="summary-item"><span>País</span>
        <strong>${circuit.country}</strong></div>
      <div class="summary-item"><span>Vueltas</span>
        <strong>${circuit.laps}</strong></div>
      <div class="summary-item"><span>Longitud</span>
        <strong>${circuit.length} km</strong></div>
      <div class="summary-item"><span>Degradación</span>
        <strong>${circuit.degradation}</strong></div>
      <div class="summary-item"><span>Temp. pista</span>
        <strong>${circuit.trackTemp.min}–${circuit.trackTemp.max}°C</strong></div>
      <div class="summary-item"><span>Estrategia sugerida</span>
        <strong>${circuit.strategy.recommended} parada${circuit.strategy.recommended > 1 ? "s" : ""}</strong>
      </div>
    </div>
    <div style="margin-top:14px; background:#0a0a0a; border:1px solid #1a1a1a;
      border-radius:8px; padding:12px; color:#aaa; font-size:13px; line-height:1.5;">
      ${circuit.strategy.notes}
    </div>
  `;

  const compoundsEl = document.getElementById("fp1Compounds");
  if (compoundsEl) {
    compoundsEl.innerHTML = availableCompounds.map((c) => `
      <div style="background:#111; border:1px solid #222; border-radius:8px;
        padding:10px; margin-bottom:8px; display:flex;
        justify-content:space-between; align-items:center;">
        <div style="color:${c.color}; font-weight:700;">${c.name}</div>
        <div style="color:#aaa; font-size:12px;">
          Máx ~${c.maxLaps} vueltas · Deg ${c.degradationRate}/v
        </div>
      </div>
    `).join("");
  }
}

function renderFP2DataFromFP1() {
  const container = document.getElementById("fp2DataFromFP1");
  if (!container || !practiceData) return;

  if (!practiceData.fp1.completed) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px;">
        Completá FP1 primero para ver los datos aquí.
      </div>`;
    return;
  }

  const data = practiceData.data;
  container.innerHTML = `
    <div style="display:grid; gap:8px;">
      <div class="summary-item"><span>Factor de degradación</span>
        <strong>${Math.round(data.degradationFactor * 100)}%</strong></div>
      <div class="summary-item"><span>Bonus de setup</span>
        <strong>+${Math.round(data.setupBonus * 1000) / 10}%</strong></div>
      <div class="summary-item"><span>Paradas recomendadas</span>
        <strong>${data.optimalStops}</strong></div>
    </div>
    ${Object.keys(data.compoundRatings).length > 0 ? `
      <div style="margin-top:14px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:8px;">
          Datos de degradación de FP1:
        </div>
        ${Object.entries(data.compoundRatings).map(([cId, d]) => {
          const compound = compounds.find((c) => c.id === cId);
          return `
            <div style="background:#0a0a0a; border:1px solid #1a1a1a;
              border-radius:8px; padding:10px; margin-bottom:8px;">
              <span style="color:${compound ? compound.color : "#fff"}; font-weight:700;">
                ${compound ? compound.name : cId}
              </span>
              <span style="color:#aaa; font-size:12px; margin-left:10px;">
                ~${d.maxLaps} vueltas máx
              </span>
            </div>
          `;
        }).join("")}
      </div>
    ` : ""}
  `;
}

function renderFP3AccumulatedData() {
  const container = document.getElementById("fp3AccumulatedData");
  if (!container || !practiceData) return;

  const sessionsCompleted = [
    practiceData.fp1.completed ? "FP1" : null,
    practiceData.fp2.completed ? "FP2" : null,
  ].filter(Boolean);

  if (sessionsCompleted.length === 0) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px;">
        Completá FP1 y FP2 para ver los datos acumulados.
      </div>`;
    return;
  }

  const data = practiceData.data;
  container.innerHTML = `
    <div style="color:#4caf50; font-size:12px; margin-bottom:10px;">
      Sesiones completadas: ${sessionsCompleted.join(", ")}
    </div>
    <div style="display:grid; gap:8px;">
      <div class="summary-item"><span>Degradación calibrada</span>
        <strong>${Math.round(data.degradationFactor * 100)}%</strong></div>
      <div class="summary-item"><span>Bonus total de setup</span>
        <strong>+${Math.round(data.setupBonus * 1000) / 10}%</strong></div>
      <div class="summary-item"><span>Paradas óptimas</span>
        <strong>${data.optimalStops}</strong></div>
      <div class="summary-item"><span>Compuestos con datos</span>
        <strong>${Object.keys(data.compoundRatings).length}</strong></div>
    </div>
  `;
}

// ── Panel de estrategia ────────────────────────────────────

function renderStrategyPanel() {
  if (!practiceData) return;

  const circuit     = practiceData.circuit;
  const teamDrivers = getDriversByTeam(selectedTeam);
  const data        = practiceData.data;

  renderEngineerSuggestion(circuit, data);

  if (!raceStrategy) {
    raceStrategy = {
      drivers: {},
      ers:     "balanced",
      fuel:    "standard",
    };

    teamDrivers.forEach((driver) => {
      raceStrategy.drivers[driver.id] = buildDefaultStrategy(circuit, data, driver);
    });
  }

  teamDrivers.forEach((driver, index) => {
    renderDriverStrategy(driver, index + 1);
  });

  renderErsFuelConfig();

  // Forzar foco en Electron
setTimeout(() => {
  document.querySelectorAll(".strategy-select, .strategy-input").forEach((el) => {
    el.setAttribute("tabindex", "0");
    el.style.pointerEvents = "auto";
    el.style.webkitAppRegion = "no-drag";
  });
}, 100);
}

function buildDefaultStrategy(circuit, data, driver) {
  const stops     = data.optimalStops || circuit.strategy.recommended;
  const laps      = circuit.laps;
  const available = circuit.compoundsAvailable || ["soft", "medium", "hard"];

  const stints = [];

  if (stops === 1) {
    stints.push({ compound: "medium", laps: Math.round(laps * 0.45), startLap: 1 });
    stints.push({ compound: "hard",   laps: Math.round(laps * 0.55), startLap: Math.round(laps * 0.45) + 1 });
  } else if (stops === 2) {
    stints.push({ compound: "soft",   laps: Math.round(laps * 0.30), startLap: 1 });
    stints.push({ compound: "medium", laps: Math.round(laps * 0.35), startLap: Math.round(laps * 0.30) + 1 });
    stints.push({ compound: "hard",   laps: Math.round(laps * 0.35), startLap: Math.round(laps * 0.65) + 1 });
  } else {
    stints.push({ compound: "soft",   laps: Math.round(laps * 0.25), startLap: 1 });
    stints.push({ compound: "soft",   laps: Math.round(laps * 0.25), startLap: Math.round(laps * 0.25) + 1 });
    stints.push({ compound: "medium", laps: Math.round(laps * 0.25), startLap: Math.round(laps * 0.50) + 1 });
    stints.push({ compound: "hard",   laps: Math.round(laps * 0.25), startLap: Math.round(laps * 0.75) + 1 });
  }

  return { stints, pitStops: stops };
}

function renderDriverStrategy(driver, driverNumber) {
  const container = document.getElementById(`strategyDriver${driverNumber}`);
  if (!container || !raceStrategy) return;

  const strategy  = raceStrategy.drivers[driver.id];
  const circuit   = practiceData.circuit;
  const available = circuit.compoundsAvailable || ["soft", "medium", "hard"];

  container.innerHTML = `
    <div style="color:#aaa; font-size:13px; margin-bottom:14px;">
      #${driver.number} ${driver.name}
    </div>

    ${strategy.stints.map((stint, i) => {
      const compound = compounds.find((c) => c.id === stint.compound);
      return `
        <div style="background:#0a0a0a; border:1px solid #1a1a1a;
          border-radius:10px; padding:14px; margin-bottom:10px;">
          <div style="color:#aaa; font-size:12px; font-weight:700;
            margin-bottom:10px;">STINT ${i + 1}</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div>
             <div style="color:#666; font-size:11px; margin-bottom:6px;">Compuesto</div>
           <div id="sel_container_${driver.id}_${i}"></div>
          </div>
            <div>
              <div style="color:#666; font-size:11px; margin-bottom:6px;">
                Vueltas (~${stint.startLap}–${stint.startLap + stint.laps - 1})
              </div>
              <input
                id="inp_${driver.id}_${i}"
                type="number" min="5" max="${circuit.laps}"
                value="${stint.laps}"
                style="width:100%; background:#111; border:1px solid #333;
                border-radius:8px; padding:8px; color:#fff; font-size:13px;
                -webkit-app-region:no-drag; pointer-events:auto; cursor:text;" />
            </div>
          </div>
          ${compound ? `
            <div style="margin-top:8px; color:#666; font-size:11px;">
              Máx recomendado: ~${Math.round(
                compound.maxLaps / practiceData.data.degradationFactor
              )} vueltas
            </div>
          ` : ""}
        </div>
      `;
    }).join("")}

    <div style="display:flex; gap:10px; margin-top:10px;">
      <button onclick="addStint(${driver.id}, ${driverNumber})"
        style="flex:1; background:#1a1a1a; border:1px solid #333;
        color:#aaa; border-radius:8px; padding:8px; cursor:pointer;
        font-size:12px; -webkit-app-region:no-drag;">
        + Agregar stint
      </button>
      ${strategy.stints.length > 2 ? `
        <button onclick="removeLastStint(${driver.id}, ${driverNumber})"
          style="flex:1; background:#1a0a0a; border:1px solid #e10600;
          color:#e10600; border-radius:8px; padding:8px; cursor:pointer;
          font-size:12px; -webkit-app-region:no-drag;">
          − Quitar último
        </button>
      ` : ""}
    </div>
  `;

  // Asignar eventos DESPUÉS de renderizar
  strategy.stints.forEach((stint, i) => {
  const selContainer = document.getElementById(`sel_container_${driver.id}_${i}`);
  const inp          = document.getElementById(`inp_${driver.id}_${i}`);

  if (selContainer) {
    const compoundOptions = available.map((cId) => {
      const c = compounds.find((comp) => comp.id === cId);
      return {
        value: cId,
        label: c ? c.name : cId,
        color: c ? c.color : "#fff",
      };
    });

    const customSel = createCustomSelect(
      compoundOptions,
      stint.compound,
      (value) => updateStrategyCompound(driver.id, i, value)
    );

    selContainer.appendChild(customSel);
  }

  if (inp) {
    inp.addEventListener("change", (e) => {
      updateStrategyLaps(driver.id, i, e.target.value);
    });
    inp.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
  }
});
}

function updateStrategyCompound(driverId, stintIndex, compound) {
  if (!raceStrategy?.drivers[driverId]) return;
  raceStrategy.drivers[driverId].stints[stintIndex].compound = compound;
}

function updateStrategyLaps(driverId, stintIndex, laps) {
  if (!raceStrategy?.drivers[driverId]) return;
  raceStrategy.drivers[driverId].stints[stintIndex].laps = parseInt(laps);
}

function addStint(driverId, driverNumber) {
  if (!raceStrategy?.drivers[driverId]) return;
  const circuit = practiceData.circuit;
  raceStrategy.drivers[driverId].stints.push({
    compound: "medium",
    laps:     15,
    startLap: circuit.laps - 15,
  });
  const driver = drivers.find((d) => d.id === driverId);
  if (driver) renderDriverStrategy(driver, driverNumber);
}

function removeLastStint(driverId, driverNumber) {
  if (!raceStrategy?.drivers[driverId]) return;
  if (raceStrategy.drivers[driverId].stints.length <= 2) return;
  raceStrategy.drivers[driverId].stints.pop();
  const driver = drivers.find((d) => d.id === driverId);
  if (driver) renderDriverStrategy(driver, driverNumber);
}

function renderErsFuelConfig() {
  const container = document.getElementById("ersFuelConfig");
  if (!container || !raceStrategy) return;

  const ersOptions = [
    { id: "attack",   label: "Ataque",   desc: "+5% velocidad, se agota antes",    color: "#e10600" },
    { id: "balanced", label: "Balanceado", desc: "Uso óptimo durante toda la carrera", color: "#ffcc00" },
    { id: "harvest",  label: "Recarga",  desc: "Carga máxima, -3% velocidad",      color: "#4caf50" },
  ];

  const fuelOptions = [
    { id: "rich",     label: "Mezcla Rica",     desc: "+2% velocidad, mayor consumo",  color: "#e10600" },
    { id: "standard", label: "Estándar",         desc: "Consumo y velocidad balanceados", color: "#ffcc00" },
    { id: "lean",     label: "Mezcla Pobre",     desc: "-1% velocidad, menor consumo",  color: "#4caf50" },
  ];

  container.innerHTML = `
    <div>
      <div style="color:#aaa; font-size:13px; font-weight:700;
        margin-bottom:12px;">MODO ERS</div>
      ${ersOptions.map((opt) => `
        <div onclick="setErsMode('${opt.id}')"
          id="ers_${opt.id}"
          style="
            background:${raceStrategy.ers === opt.id ? "#1a0d0d" : "#0a0a0a"};
            border:1px solid ${raceStrategy.ers === opt.id ? opt.color : "#1a1a1a"};
            border-radius:10px; padding:12px; margin-bottom:8px;
            cursor:pointer; transition:0.2s;
          ">
          <div style="color:${opt.color}; font-weight:700; font-size:14px;">
            ${opt.label}
          </div>
          <div style="color:#666; font-size:12px; margin-top:3px;">${opt.desc}</div>
        </div>
      `).join("")}
    </div>

    <div>
      <div style="color:#aaa; font-size:13px; font-weight:700;
        margin-bottom:12px;">MODO COMBUSTIBLE</div>
      ${fuelOptions.map((opt) => `
        <div onclick="setFuelMode('${opt.id}')"
          id="fuel_${opt.id}"
          style="
            background:${raceStrategy.fuel === opt.id ? "#0a1a0a" : "#0a0a0a"};
            border:1px solid ${raceStrategy.fuel === opt.id ? opt.color : "#1a1a1a"};
            border-radius:10px; padding:12px; margin-bottom:8px;
            cursor:pointer; transition:0.2s;
          ">
          <div style="color:${opt.color}; font-weight:700; font-size:14px;">
            ${opt.label}
          </div>
          <div style="color:#666; font-size:12px; margin-top:3px;">${opt.desc}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function setErsMode(mode) {
  if (!raceStrategy) return;
  raceStrategy.ers = mode;
  renderErsFuelConfig();
}

function setFuelMode(mode) {
  if (!raceStrategy) return;
  raceStrategy.fuel = mode;
  renderErsFuelConfig();
}

function renderEngineerSuggestion(circuit, data) {
  const container = document.getElementById("engineerSuggestion");
  if (!container) return;

  const sessionsCompleted = [
    practiceData.fp1.completed,
    practiceData.fp2.completed,
    practiceData.fp3.completed,
  ].filter(Boolean).length;

  const confidence = sessionsCompleted === 0 ? "baja"
    : sessionsCompleted === 1 ? "media"
    : sessionsCompleted === 2 ? "buena"
    : "alta";

  const stops    = data.optimalStops;
  const degLevel = data.degradationFactor >= 1.2 ? "alta"
    : data.degradationFactor >= 0.9 ? "media" : "baja";

  const bestCompound = Object.entries(data.compoundRatings || {})
    .sort((a, b) => b[1].maxLaps - a[1].maxLaps)[0];

  const ersRec  = circuit.ersProfile === "high_demand" ? "Ataque" : "Balanceado";
  const fuelRec = circuit.fuelLoad >= 108 ? "Mezcla Rica" : "Estándar";

  container.innerHTML = `
    <div style="color:#4caf50; font-size:12px; font-weight:700;
      margin-bottom:8px;">CONFIANZA DEL ANÁLISIS: ${confidence.toUpperCase()}</div>

    <p>Basándome en los datos de ${sessionsCompleted > 0
      ? "las prácticas y " : ""}las características del circuito,
    recomiendo una estrategia de <strong>${stops} parada${stops > 1 ? "s" : ""}</strong>.</p>

    <p style="margin-top:8px;">La degradación en ${circuit.name} es
    <strong>${degLevel}</strong>.
    ${bestCompound
      ? `El ${compounds.find((c) => c.id === bestCompound[0])?.name || bestCompound[0]}
         parece ser el compuesto más rentable con ~${bestCompound[1].maxLaps} vueltas de duración.`
      : `Recomiendo usar el Medio como compuesto principal por su equilibrio.`}
    </p>

    <p style="margin-top:8px;">${circuit.strategy.notes}</p>

    <p style="margin-top:8px;">Para el ERS sugiero modo
    <strong>${ersRec}</strong> dado el perfil del circuito.
    Combustible en <strong>${fuelRec}</strong> para este nivel de exigencia.</p>

    ${sessionsCompleted < 3
      ? `<p style="margin-top:8px; color:#666; font-size:12px;">
          Completar más sesiones de práctica aumentará la precisión del análisis.
        </p>`
      : ""}
  `;
}

function confirmStrategyAndGoToQualifying() {
  if (!raceStrategy || !practiceData) {
    alert("Primero configurá la estrategia.");
    return;
  }

  openRaceWeekendWithStrategy();
}

function openRaceWeekendWithStrategy() {
  if (!practiceData) return;

  currentRaceData   = { race: practiceData.race, circuit: practiceData.circuit };
  qualifyingResults = null;
  raceWeather       = rollWeather();

  const titleEl    = document.getElementById("raceWeekendTitle");
  const subtitleEl = document.getElementById("raceWeekendSubtitle");
  const infoEl     = document.getElementById("raceWeekendInfo");

  if (titleEl)    titleEl.textContent    = practiceData.race.name;
  if (subtitleEl) subtitleEl.textContent =
    `Ronda ${practiceData.race.round} — ${practiceData.race.date} — Clima: ${weatherLabel(raceWeather)}`;

  if (infoEl) infoEl.innerHTML = `
    <strong>Circuito:</strong> ${practiceData.circuit.name}<br>
    <strong>País:</strong> ${practiceData.circuit.country}<br>
    <strong>Vueltas:</strong> ${practiceData.circuit.laps}<br>
    <strong>Clima:</strong> ${weatherLabel(raceWeather)}<br>
    <strong>Estrategia:</strong> ${raceStrategy ? raceStrategy.drivers[Object.keys(raceStrategy.drivers)[0]]?.stints?.length - 1 || 1 : 1} parada(s) planificada(s)
  `;

  const p = selectedTeam.performance;
  const fields = {
    rcCarPerf: p.overall,
    rcAero:    p.aero,
    rcChassis: p.chassis,
    rcRel:     p.reliability,
    rcPit:     p.pitStop,
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });

  const statusEl = document.getElementById("raceSessionStatus");
  if (statusEl) statusEl.innerHTML = `
    Estrategia confirmada. Clima: <strong>${weatherLabel(raceWeather)}</strong>.<br><br>
    <button class="btn" onclick="startQualifying()">INICIAR CLASIFICACIÓN</button>
  `;

  showScreen("raceWeekendScreen");
}

function calculateStrategyBonus() {
  if (!raceStrategy || !practiceData) return 0;

  let bonus = 0;

  if (practiceData.data.setupBonus) bonus += practiceData.data.setupBonus;

  const stops = raceStrategy.drivers[Object.keys(raceStrategy.drivers)[0]]?.stints?.length - 1 || 0;
  const recommended = practiceData.data.optimalStops;
  if (stops === recommended) bonus += 0.015;

  if (raceStrategy.ers === "attack")   bonus += 0.008;
  if (raceStrategy.fuel === "rich")    bonus += 0.005;
  if (raceStrategy.fuel === "lean")    bonus -= 0.003;

  return Math.min(0.05, bonus);
}

function startRaceWeekend() {
  alert(
    "Fin de semana iniciado.\n\n" +
    "Próximo paso: volver a conectar FP1, FP2, FP3, clasificación y carrera."
  );
}

function simulateSession(sessionType) {
  const results = drivers.map((driver) => {
    const team = teams.find((t) => t.id === driver.teamId);

    const carScore = team ? team.performance.overall : 70;
    const driverScore =
      driver.attributes.pace * 0.3 +
      driver.attributes.qualifying * 0.25 +
      driver.attributes.consistency * 0.2 +
      driver.attributes.experience * 0.1 +
      driver.form * 0.15;

    const randomness =
      sessionType === "FP1"
        ? Math.random() * 1.2
        : Math.random() * 0.8;

    const baseTime = 82.5;
    const performanceFactor = (carScore * 0.55 + driverScore * 0.45) / 100;
    const lapTime = baseTime - performanceFactor * 5 + randomness;

    return {
      driverId: driver.id,
      driverName: driver.name,
      teamId: team ? team.id : null,
      teamName: team ? team.shortName : "-",
      lapTime,
      status: "OK"
    };
  });

  results.sort((a, b) => a.lapTime - b.lapTime);

  return results.map((result, index) => ({
    ...result,
    position: index + 1,
    displayTime: formatLapTime(result.lapTime)
  }));
}

function renderRaceResultsTable(results, mode) {
  const tbody = document.getElementById("raceResultsBody");

  if (!tbody) {
    alert("No se encontró raceResultsBody.");
    return;
  }

  tbody.innerHTML = "";

  results.forEach((result) => {
    const row = document.createElement("tr");

    if (selectedTeam && result.teamId === selectedTeam.id) {
      row.classList.add("player-team-row");
    }

    const strategyText =
      mode === "gap" ? formatStrategy(result.strategy) : result.status;

    row.innerHTML = `
      <td>${result.position}</td>
      <td>${result.driverName}</td>
      <td>${result.teamName}</td>
      <td>${mode === "time" ? result.displayTime : result.gap}</td>
      <td>${strategyText}</td>
    `;

    tbody.appendChild(row);
  });
}

function getPointsForPosition(position, dnf) {
  if (dnf) return 0;
  const system = regulations?.sporting?.pointsSystem || {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
    6: 8, 7: 6, 8: 4, 9: 2, 10: 1
  };
  return system[position] || 0;
}

function formatLapTime(seconds) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "-";
  const minutes  = Math.floor(seconds / 60);
  const remaining = (seconds % 60).toFixed(3).padStart(6, "0");
  return `${minutes}:${remaining}`;
}

function formatRaceGap(seconds) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "-";
  return seconds.toFixed(3) + "s";
}
function simulateQualifyingStage(stageName, stageDrivers) {
  const results = stageDrivers.map((driver) => {
    const team = teams.find((t) => t.id === driver.teamId);

    const carScore = team ? team.performance.overall : 70;

    const driverScore =
      driver.attributes.pace * 0.35 +
      driver.attributes.qualifying * 0.35 +
      driver.attributes.consistency * 0.15 +
      driver.attributes.experience * 0.05 +
      driver.form * 0.10;

    const stageAggression =
      stageName === "Q1" ? 0.95 :
      stageName === "Q2" ? 1.00 :
      1.05;

    const randomFactor =
      stageName === "Q1" ? Math.random() * 0.9 :
      stageName === "Q2" ? Math.random() * 0.7 :
      Math.random() * 0.5;

    const baseTime = 82.5;

    const puScore = team?.powerUnit?.overall || 80;
const combinedScore = (carScore * 0.45 + driverScore * 0.35 + puScore * 0.20);
const performanceFactor = (combinedScore / 100) * stageAggression;

const rubberBonus = practiceData?.data?.trackRubber || 0;
const lapTime = baseTime - performanceFactor * 9.5 + randomFactor - rubberBonus;

    return {
      driverId: driver.id,
      driverName: driver.name,
      teamId: team ? team.id : null,
      teamName: team ? team.shortName : "-",
      lapTime,
      displayTime: formatLapTime(lapTime),
      stage: stageName,
      status: "Pasa",
    };
  });

  results.sort((a, b) => a.lapTime - b.lapTime);

  return results.map((result, index) => ({
    ...result,
    position: index + 1,
  }));
}

function renderQualifyingResultsTable(results) {
  const tbody = document.getElementById("raceResultsBody");

  if (!tbody) {
    alert("No se encontró raceResultsBody.");
    return;
  }

  tbody.innerHTML = "";

  results.forEach((result) => {
    const row = document.createElement("tr");

    if (selectedTeam && result.teamId === selectedTeam.id) {
      row.classList.add("player-team-row");
    }

    let statusColor = "#aaa";

    if (result.status === "Pole Position") {
      statusColor = "#ffcc00";
    }

    if (result.status.includes("Eliminado")) {
      statusColor = "#e10600";
    }

    row.innerHTML = `
      <td>${result.position}</td>
      <td>${result.driverName}</td>
      <td>${result.teamName}</td>
      <td>${result.displayTime}</td>
      <td style="color:${statusColor}; font-weight:700;">${result.status}</td>
    `;

    tbody.appendChild(row);
  });
};

function chooseRaceStrategy(driver, team, gridIndex, laps) {
  const tireManagement = driver.attributes.tireManagement;
  const teamPerformance = team ? team.performance.overall : 75;

  let startCompound = "medium";

  if (gridIndex <= 5) {
    startCompound = Math.random() < 0.65 ? "medium" : "soft";
  } else if (gridIndex <= 12) {
    startCompound = Math.random() < 0.55 ? "medium" : "hard";
  } else {
    startCompound = Math.random() < 0.55 ? "hard" : "medium";
  }

  if (tireManagement >= 90 && Math.random() < 0.25) {
    startCompound = "soft";
  }

  if (teamPerformance < 76 && Math.random() < 0.35) {
    startCompound = "hard";
  }

  const secondCompound = chooseSecondCompound(startCompound);

  const pitWindow = getPitWindow(startCompound, laps);
  const pitLap = randomBetween(pitWindow.min, pitWindow.max);

  return {
    type: `${TYRE_COMPOUNDS[startCompound].name} → ${TYRE_COMPOUNDS[secondCompound].name}`,
    pitStops: 1,
    pitLaps: [pitLap],
    stints: [
      {
        compound: startCompound,
        laps: pitLap,
      },
      {
        compound: secondCompound,
        laps: laps - pitLap,
      },
    ],
  };
}

function chooseSecondCompound(firstCompound) {
  if (firstCompound === "soft") {
    return Math.random() < 0.75 ? "medium" : "hard";
  }

  if (firstCompound === "medium") {
    return Math.random() < 0.6 ? "hard" : "soft";
  }

  return Math.random() < 0.75 ? "medium" : "soft";
}

function getPitWindow(compound, laps) {
  const tyre = TYRE_COMPOUNDS[compound];

  return {
    min: Math.max(8, Math.round(laps * tyre.minPitLapFactor)),
    max: Math.min(laps - 8, Math.round(laps * tyre.maxPitLapFactor)),
  };
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatStrategy(strategy) {
  if (!strategy) return "-";

  return `${strategy.type} | Vuelta ${strategy.pitLaps.join(", ")}`;
}

function renderLiveRaceTable() {
  const tbody = document.getElementById("raceResultsBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!qualifyingResults) return;

  qualifyingResults.forEach((r) => {
    const row = document.createElement("tr");
    const isPlayer = selectedTeam && r.teamId === selectedTeam.id;
    if (isPlayer) row.classList.add("player-team-row");

    row.innerHTML = `
      <td><strong>${r.position}</strong></td>
      <td>${r.driverName}</td>
      <td style="color:${r.teamColor}">${r.teamName}</td>
      <td>${r.gridPosition || r.position}</td>
      <td>${r.points || 0}</td>
      <td style="color:${r.dnf ? '#e10600' : '#4caf50'}">
        ${r.dnf ? "Abandono" : "Clasificado"}
      </td>
    `;

    tbody.appendChild(row);
  });
}

function createCustomSelect(options, selectedValue, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";

  const selected = document.createElement("div");
  selected.className = "custom-select-selected";
  selected.innerHTML = `
    <span>${options.find((o) => o.value === selectedValue)?.label || selectedValue}</span>
    <span style="color:#666;">▾</span>
  `;

  const optionsList = document.createElement("div");
  optionsList.className = "custom-select-options";

  options.forEach((opt) => {
    const item = document.createElement("div");
    item.className = "custom-select-option" + (opt.value === selectedValue ? " selected" : "");
    item.textContent = opt.label;
    item.style.color = opt.color || "#ccc";

    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      wrapper.querySelectorAll(".custom-select-option").forEach(
        (el) => el.classList.remove("selected")
      );
      item.classList.add("selected");

      selected.querySelector("span").textContent = opt.label;
      optionsList.classList.remove("open");

      onChange(opt.value);
    });

    optionsList.appendChild(item);
  });

  selected.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    document.querySelectorAll(".custom-select-options").forEach(
      (el) => el !== optionsList && el.classList.remove("open")
    );

    optionsList.classList.toggle("open");
  });

  document.addEventListener("mousedown", () => {
    optionsList.classList.remove("open");
  });

  wrapper.appendChild(selected);
  wrapper.appendChild(optionsList);

  return wrapper;
}

function goToPracticeWeekend() {
  if (practiceData) {
    showScreen("practiceScreen");
  } else {
    openPracticeWeekend();
  }
}

function startRace() {
  if (!currentRaceData || !qualifyingResults) {
    alert("Primero completá la clasificación.");
    return;
  }

  const { circuit } = currentRaceData;
  const laps        = circuit.laps;
  const stratBonus  = calculateStrategyBonus();

  // Generar timeline de clima
  const weatherTimeline = generateWeatherTimeline(laps);

  const raceResults = qualifyingResults.map((q, gridIndex) => {
    const driver     = drivers.find((d) => d.id === q.driverId);
    const team       = teams.find((t) => t.id === q.teamId);
    const carScore   = team ? team.performance.overall : 70;
    const reliability = team ? team.performance.reliability : 70;

    const puScore = team?.powerUnit?.overall || 80;

const raceScore =
  driver.attributes.racecraft      * 0.24 +
  driver.attributes.tireManagement * 0.20 +
  driver.attributes.consistency    * 0.16 +
  driver.attributes.overtaking     * 0.12 +
  carScore                          * 0.18 +
  puScore                        * 0.20;

    const isPlayerDriver = selectedTeam && q.teamId === selectedTeam.id;

    let strategy;
    if (isPlayerDriver && raceStrategy?.drivers[q.driverId]) {
      const playerStrat = raceStrategy.drivers[q.driverId];
      const pitLaps     = [];
      let lapCount      = 0;

      playerStrat.stints.forEach((stint, i) => {
        lapCount += stint.laps;
        if (i < playerStrat.stints.length - 1) pitLaps.push(lapCount);
      });

      strategy = {
        type: playerStrat.stints.map((s) => {
          const c = compounds.find((comp) => comp.id === s.compound);
          return c ? c.name : s.compound;
        }).join(" → "),
        pitStops:     playerStrat.stints.length - 1,
        pitLaps,
        stints:       playerStrat.stints,
        playerChosen: true,
      };
    } else {
      strategy = chooseRaceStrategy(driver, team, gridIndex, laps);
    }

const puReliability = team?.powerUnit?.reliability || 80;
const combinedReliability = (reliability * 0.6 + puReliability * 0.4);
const dnfChance = Math.max(0.015, (100 - combinedReliability) / 320);
    const dnf       = Math.random() < dnfChance;
    const dnfReason = dnf
      ? ["problema mecánico","accidente","fallo eléctrico","fallo de frenos"][Math.floor(Math.random() * 4)]
      : null;

    let totalRaceTime = 0;
    let currentStintIndex = 0;
    let stintLap = 0;
let fastestLap = Infinity;
    for (let lap = 1; lap <= laps; lap++) {
      const lapWeather  = weatherTimeline[lap - 1] || "dry";
      const weatherPen  = getWeatherTimePenalty(lapWeather);

      const currentStint   = strategy.stints[currentStintIndex] || strategy.stints[strategy.stints.length - 1];
      const compoundId = currentStint?.compound || "medium";
      const compound = TYRE_COMPOUNDS[compoundId] || { paceBonus: 0, degradation: 0.03, name: compoundId };
      const tyrePen        = getTyreWeatherPenalty(currentStint.compound, lapWeather);

      stintLap += 1;

      const baseLapTime       = 86.5;
      const carEffect         = (100 - carScore) * 0.12;
const driverEffect      = (100 - raceScore) * 0.10;
      const degradationEffect = compound.degradation * stintLap;
      const randomVariation   = Math.random() * 0.15;
      const strategyEffect    = isPlayerDriver ? -(stratBonus * 10) : 0;

      const lapTotal =
  baseLapTime + carEffect + driverEffect +
  (compound.paceBonus || 0) + degradationEffect +
  randomVariation + strategyEffect +
  weatherPen + tyrePen;

if (!isNaN(lapTotal)) {
  totalRaceTime += lapTotal;
  if (lapTotal < fastestLap) fastestLap = lapTotal;
}

      if (strategy.pitLaps?.includes(lap)) {
        totalRaceTime += PIT_STOP_LOSS;
        currentStintIndex = Math.min(currentStintIndex + 1, strategy.stints.length - 1);
        stintLap = 0;
      }
    }

    totalRaceTime += gridIndex * 0.3;
totalRaceTime += Math.random() * 4;

    if (isPlayerDriver && raceStrategy?.ers === "attack")  totalRaceTime -= 4;
    if (isPlayerDriver && raceStrategy?.ers === "harvest") totalRaceTime += 3;
    if (isPlayerDriver && raceStrategy?.fuel === "rich")   totalRaceTime -= 2;
    if (isPlayerDriver && raceStrategy?.fuel === "lean")   totalRaceTime += 1.5;

    // Penalización extra por tyre incorrecto en lluvia
    const finalWeather   = weatherTimeline[laps - 1] || "dry";
    const finalCompound  = strategy.stints[strategy.stints.length - 1].compound;
    const finalTyrePen   = getTyreWeatherPenalty(finalCompound, finalWeather);
    totalRaceTime += finalTyrePen * 3;

    return {
      driverId:   q.driverId,
      driverName: q.driverName,
      teamId:     q.teamId,
      teamName:   q.teamName,
      teamColor:  q.teamColor,
      raceTime:   totalRaceTime,
      fastestLap: (!dnf && isFinite(fastestLap) && fastestLap > 60) ? fastestLap : null,
      dnf,
      dnfReason,
      strategy,
      pitUnderSC: false,
    };
  });

  // Safety Car events
  const scEvents    = simulateSafetyCarEvents(laps, raceResults);
  const { totalScTime, hadRedFlag, lateRaceSC, scLog } =
    applySafetyCarEffect(raceResults, scEvents, laps);

  raceResults.forEach((r) => { r.raceTime += totalScTime; });

  raceResults.sort((a, b) => {
    if (a.dnf && !b.dnf) return 1;
    if (!a.dnf && b.dnf) return -1;
    return a.raceTime - b.raceTime;
  });

  const finishers  = raceResults.filter((r) => !r.dnf);
const leaderTime = finishers.length > 0 ? finishers[0].raceTime : raceResults[0].raceTime;

  const finalResults = raceResults.map((result, index) => {
  let gap;
  if (result.dnf) {
    gap = "DNF";
  } else if (index === 0) {
    gap = "Líder";
  } else {
    const diff = result.raceTime - leaderTime;
    const gapStr = formatRaceGap(diff);
gap = (!diff || isNaN(diff)) ? "-" : "+" + gapStr;
  }

  return {
    ...result,
    position: index + 1,
    gap,
    points: getPointsForPosition(index + 1, result.dnf),
  };
});

// Simular penalizaciones de carrera
  const racePenaltiesList = simulateRacePenalties(finalResults);

  // Reordenar resultados si hubo penalizaciones de tiempo
  if (racePenaltiesList.length > 0) {
    finalResults.sort((a, b) => {
      if (a.dnf && !b.dnf) return 1;
      if (!a.dnf && b.dnf) return -1;
      return a.raceTime - b.raceTime;
    });
    finalResults.forEach((r, i) => {
      r.position = i + 1;
      r.points   = getPointsForPosition(i + 1, r.dnf);
    });
  }

  generatePenaltyReport(racePenaltiesList, [], []);

  updateStandings(finalResults);
  updateDriverMoralAfterRace(finalResults);
  recordDriverResults(finalResults, currentRaceData.race.name);
  processSponsorRaceBonuses(finalResults);
  evaluateSponsorRequirements();
  processRivalSponsorEvaluation();

  document.getElementById("raceResultsBody").dataset.results =
    JSON.stringify(finalResults);

  const incidents = finalResults.filter((r) => r.dnf).map((r) => ({
    driver: r.driverName,
    team:   r.teamName,
    lap:    Math.floor(Math.random() * laps) + 1,
    reason: r.dnfReason,
  }));

  generateRaceNews(finalResults, incidents, scEvents.some((e) => e.type === "sc"));

  // Noticias de Safety Car
  if (scLog.length > 0) {
    addNews(
      "Carrera",
      `Múltiples incidentes en el ${currentRaceData.race.name}`,
      scLog.join(" / ")
    );
  }

  // Noticias de clima
  const weatherChanges = weatherTimeline.filter((w, i) =>
    i > 0 && w !== weatherTimeline[i - 1]
  );
  if (weatherChanges.length > 0) {
    const uniqueConditions = [...new Set(weatherTimeline)];
    addNews(
      "Carrera",
      `Clima cambiante en ${currentRaceData.circuit.name}`,
      `La carrera atravesó ${uniqueConditions.length} condiciones distintas: ${uniqueConditions.map(weatherLabel).join(", ")}. Las estrategias de neumáticos fueron clave.`
    );
  }

  const narrative = buildRaceNarrative(finalResults, scEvents, weatherTimeline, laps);

  let statusEl = document.getElementById("raceSessionStatus");
  if (statusEl) {
    const playerResults = finalResults.filter((r) => r.teamId === selectedTeam.id);
    const totalPoints   = playerResults.reduce((sum, r) => sum + r.points, 0);
    const bestResult    = playerResults.filter((r) => !r.dnf)
      .sort((a, b) => a.position - b.position)[0];

    const weatherSummary = [...new Set(weatherTimeline)].map(
      (w) => `${weatherIcon(w)} ${weatherLabel(w)}`
    ).join(" → ");

    statusEl.innerHTML = `
      <div style="margin-bottom:12px;">
        <strong>Clima:</strong> ${weatherSummary}
      </div>
      ${scLog.length > 0 ? `
        <div style="background:#1a1400; border:1px solid #ffcc00;
          border-radius:8px; padding:10px; margin-bottom:12px; font-size:13px;">
          ${scLog.map((s) => `<div>${s}</div>`).join("")}
        </div>
      ` : ""}
      ${narrative.length > 0 ? `
        <div style="color:#aaa; font-size:13px; margin-bottom:12px; line-height:1.6;">
          ${narrative.join(" ")}
        </div>
      ` : ""}
      Carrera finalizada.
      ${bestResult
        ? `Mejor resultado: <strong>P${bestResult.position}</strong> (${bestResult.driverName}).`
        : "Abandono en carrera."}
      Tu equipo sumó <strong>${totalPoints} puntos</strong>.<br><br>
      <button class="btn" id="btnFinishRace">TERMINAR FIN DE SEMANA</button>
    `;

    setTimeout(() => {
      const btn = document.getElementById("btnFinishRace");
      if (btn) btn.addEventListener("click", () => finishRaceWeekend());
    }, 100);
  }

  const tbody = document.getElementById("raceResultsBody");
  if (tbody) {
    tbody.innerHTML = "";
    finalResults.forEach((r) => {
      const row      = document.createElement("tr");
      const isPlayer = selectedTeam && r.teamId === selectedTeam.id;
      if (isPlayer) row.classList.add("player-team-row");

      const scBadge = r.pitUnderSC
        ? `<span style="color:#ffcc00; font-size:11px; margin-left:6px;">SC</span>`
        : "";

      const penaltyBadge = racePenaltiesList?.find((p) => p.driverId === r.driverId)
        ? `<span style="color:#e10600; font-size:11px; margin-left:6px;">PEN</span>`
        : "";

      row.innerHTML = `
        <td><strong>${r.dnf ? "DNF" : r.position}</strong></td>
        <td>${r.driverName}</td>
        <td style="color:${r.teamColor}">${r.teamName}</td>
        <td>${r.gap}</td>
        <td style="color:#aaa;">${formatLapTime(r.fastestLap)}</td>
        <td style="color:${r.strategy?.playerChosen ? '#ffcc00' : '#aaa'}">
          ${r.strategy?.type || "-"}${scBadge}${penaltyBadge}
        </td>
        <td style="color:${r.dnf ? '#e10600' : r.points > 0 ? '#4caf50' : '#aaa'}">
          ${r.dnf ? "DNF" : r.points > 0 ? "+" + r.points + " pts" : "Sin puntos"}
        </td>
      `;
      tbody.appendChild(row);
    });
  }
}

// ══════════════════════════════════════════════════════════
// SISTEMA DE SPONSORS
// ══════════════════════════════════════════════════════════

function loadSponsors() {
  try {
    sponsors = loadJson("sponsors.json");
  } catch (e) {
    console.error("No se pudo cargar sponsors.json:", e);
    sponsors = [];
  }
}

function getTeamSponsors(teamId) {
  return sponsors.filter((s) => s.teamId === teamId);
}

function getAvailableSponsors() {
  return sponsors.filter((s) => s.teamId === null);
}

function getSponsorTypeLabel(type) {
  const map = { primary: "Principal", secondary: "Secundario", technical: "Técnico" };
  return map[type] || type;
}

function getSponsorMarketLabel(market) {
  const map = {
    energy: "Energía", tech: "Tecnología", luxury: "Lujo",
    finance: "Finanzas", automotive: "Automotriz", telecom: "Telecomunicaciones",
    logistics: "Logística", global: "Global",
  };
  return map[market] || market;
}

// ── Ingresos mensuales de sponsors ────────────────────────

function processSponsorMonthlyIncome() {
  if (!selectedTeam || sponsors.length === 0) return;

  const teamSponsors = getTeamSponsors(selectedTeam.id);
  let totalIncome = 0;

  teamSponsors.forEach((sponsor) => {
    const monthly = Math.round(sponsor.value / 12);
    totalIncome += monthly;

    addTransaction({
      date:     currentDate,
      type:     "income",
      category: "sponsor",
      amount:   monthly,
      description: `Ingreso mensual — ${sponsor.name} (${getSponsorTypeLabel(sponsor.type)})`,
    });
  });

  if (totalIncome > 0) {
    selectedTeam.budget += totalIncome;
    if (seasonEconomics) {
      seasonEconomics.sponsorIncome = (seasonEconomics.sponsorIncome || 0) + totalIncome;
      seasonEconomics.totalIncome   += totalIncome;
    }
    syncSelectedTeamWithTeams();
  }
}

// ── Bonos por resultados de carrera ───────────────────────

function processSponsorRaceBonuses(raceResults) {
  if (!selectedTeam || sponsors.length === 0) return;

  const teamSponsors  = getTeamSponsors(selectedTeam.id);
  const playerResults = raceResults.filter((r) => r.teamId === selectedTeam.id);

  teamSponsors.forEach((sponsor) => {
    let bonusTotal = 0;
    const bonusDetails = [];

    playerResults.forEach((result) => {
      if (result.dnf) return;

      if (result.position === 1 && sponsor.bonus.win) {
        bonusTotal += sponsor.bonus.win;
        bonusDetails.push(`Victoria de ${result.driverName}: +${formatMoney(sponsor.bonus.win)}`);
      } else if (result.position <= 3 && sponsor.bonus.podium) {
        bonusTotal += sponsor.bonus.podium;
        bonusDetails.push(`Podio de ${result.driverName}: +${formatMoney(sponsor.bonus.podium)}`);
      } else if (result.position <= 10 && sponsor.bonus.point) {
        bonusTotal += sponsor.bonus.point;
        bonusDetails.push(`Punto de ${result.driverName}: +${formatMoney(sponsor.bonus.point)}`);
      }
    });

    if (bonusTotal > 0) {
      selectedTeam.budget += bonusTotal;
      if (seasonEconomics) {
        seasonEconomics.sponsorIncome = (seasonEconomics.sponsorIncome || 0) + bonusTotal;
        seasonEconomics.totalIncome   += bonusTotal;
      }

      addTransaction({
        date:     currentDate,
        type:     "income",
        category: "sponsor",
        amount:   bonusTotal,
        description: `Bonus ${sponsor.name} — ${bonusDetails.join(", ")}`,
      });

      addNews(
        "Sponsors",
        `${sponsor.name} activa bonos tras el resultado`,
        `El rendimiento del equipo activó cláusulas de bonificación en el contrato con ${sponsor.name}. El equipo recibe ${formatMoney(bonusTotal)} adicionales.`
      );
    }
  });

  syncSelectedTeamWithTeams();
}

// ── Evaluación post-carrera de requisitos ─────────────────

function evaluateSponsorRequirements() {
  if (!selectedTeam || sponsors.length === 0) return;

  const teamSponsors   = getTeamSponsors(selectedTeam.id);
  const constructorPos = constructorStandings.findIndex(
    (c) => c.teamId === selectedTeam.id
  ) + 1;
  const totalPoints = constructorStandings.find(
    (c) => c.teamId === selectedTeam.id
  )?.points || 0;

  teamSponsors.forEach((sponsor) => {
    const meetsPosition = constructorPos <= sponsor.requirements.minConstructorPos;
    const meetsPoints   = totalPoints >= sponsor.requirements.minPoints;
    const meetsBoth     = meetsPosition && meetsPoints;

    if (!meetsBoth && currentRound >= 5) {
      sponsor.warningCount = (sponsor.warningCount || 0) + 1;

      if (sponsor.warningCount === 1) {
        addNews(
          "⚠️ Sponsors",
          `${sponsor.name} expresa preocupación`,
          `Fuentes cercanas al acuerdo indican que ${sponsor.name} monitorea de cerca el rendimiento de ${selectedTeam.shortName}. El contrato exige estar entre los ${sponsor.requirements.minConstructorPos} primeros constructores con al menos ${sponsor.requirements.minPoints} puntos.`
        );
      } else if (sponsor.warningCount === 2) {
        // Mostrar modal de negociación en lugar de perder el sponsor
        showSponsorNegotiationModal(sponsor);
      }
      // Ya NO hay pérdida automática durante la temporada — solo en off season
    } else if (meetsBoth && sponsor.warningCount > 0) {
      sponsor.warningCount = Math.max(0, sponsor.warningCount - 1);
    }

    // Caso catastrófico — equipo a más de 2:30 del líder consistentemente
    checkCatastrophicResults(sponsor);
  });
}

function checkCatastrophicResults(sponsor) {
  const teamDrivers = getDriversByTeam(selectedTeam);
  if (currentRound < 3) return;

  let catastrophicRaces = 0;

  teamDrivers.forEach((driver) => {
    const history = driverResultsHistory[driver.id] || [];
    const recent  = history.slice(0, 3);
    recent.forEach((r) => {
      if (!r.dnf && r.position >= 18) catastrophicRaces++;
    });
  });

  if (catastrophicRaces >= 5) {
    sponsor.warningCount = (sponsor.warningCount || 0) + 2;
    addNews(
      "🚨 Sponsors",
      `${sponsor.name} considera romper el contrato`,
      `Los resultados de ${selectedTeam.shortName} han sido catastróficos en las últimas carreras. ${sponsor.name} evalúa seriamente activar las cláusulas de salida anticipada del contrato.`
    );
  }
}

function showSponsorNegotiationModal(sponsor) {
  const existing = document.getElementById("sponsorNegotiationModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "sponsorNegotiationModal";
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.90); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
  `;

  const reducedValue   = Math.round(sponsor.value * 0.75);
  const originalValue  = sponsor.value;

  modal.innerHTML = `
    <div style="background:#111; border:1px solid #333; border-radius:16px;
      padding:32px; max-width:540px; width:90%;">

      <div style="color:#e10600; font-size:12px; font-weight:700;
        letter-spacing:1px; margin-bottom:8px;">⚠️ CRISIS CON SPONSOR</div>
      <div style="font-size:20px; font-weight:800; color:#fff; margin-bottom:6px;">
        ${sponsor.name} amenaza con irse
      </div>
      <div style="color:#aaa; font-size:13px; margin-bottom:20px; line-height:1.6;">
        Los resultados de ${selectedTeam.shortName} no están cumpliendo los objetivos 
        contractuales. ${sponsor.name} ha pedido una reunión urgente y exige 
        soluciones antes de continuar.
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a; border-radius:10px;
        padding:14px; margin-bottom:20px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:8px;">
          REQUISITOS DEL CONTRATO
        </div>
        <div style="color:#fff; font-size:13px;">
          P${sponsor.requirements.minConstructorPos} en constructores 
          · ${sponsor.requirements.minPoints} puntos mínimos
        </div>
        <div style="color:#e10600; font-size:12px; margin-top:6px;">
          Advertencias acumuladas: ${sponsor.warningCount}/3
        </div>
      </div>

      <div style="color:#fff; font-size:14px; font-weight:700; margin-bottom:14px;">
        ¿Cómo querés manejar la situación?
      </div>

      <!-- Opción 1: Reducir fee -->
      <div style="background:#0a0a0a; border:1px solid #222; border-radius:10px;
        padding:14px; margin-bottom:10px; cursor:pointer;"
        onclick="resolveSponsorCrisis('reduce_fee', ${sponsor.id})"
        onmouseover="this.style.borderColor='#ffcc00'"
        onmouseout="this.style.borderColor='#222'">
        <div style="color:#ffcc00; font-weight:700; margin-bottom:4px;">
          💰 Ofrecer reducción de fee
        </div>
        <div style="color:#aaa; font-size:12px; line-height:1.5;">
          Aceptar reducir el contrato de ${formatMoney(originalValue)} 
          a ${formatMoney(reducedValue)} anuales. El sponsor se queda 
          pero con menor aporte. Sin compromisos adicionales.
        </div>
      </div>

      <!-- Opción 2: Compromiso de resultados -->
      <div style="background:#0a0a0a; border:1px solid #222; border-radius:10px;
        padding:14px; margin-bottom:10px; cursor:pointer;"
        onclick="resolveSponsorCrisis('promise_results', ${sponsor.id})"
        onmouseover="this.style.borderColor='#4caf50'"
        onmouseout="this.style.borderColor='#222'">
        <div style="color:#4caf50; font-weight:700; margin-bottom:4px;">
          🏆 Comprometer resultados futuros
        </div>
        <div style="color:#aaa; font-size:12px; line-height:1.5;">
          Prometer mejorar en las próximas 5 carreras. El contrato sigue igual 
          pero si no se cumplen los objetivos, el sponsor se irá sin 
          posibilidad de negociación.
        </div>
      </div>

      <!-- Opción 3: Dejar ir -->
      <div style="background:#0a0a0a; border:1px solid #222; border-radius:10px;
        padding:14px; margin-bottom:20px; cursor:pointer;"
        onclick="resolveSponsorCrisis('let_go', ${sponsor.id})"
        onmouseover="this.style.borderColor='#e10600'"
        onmouseout="this.style.borderColor='#222'">
        <div style="color:#e10600; font-weight:700; margin-bottom:4px;">
          👋 Dejar ir al sponsor
        </div>
        <div style="color:#aaa; font-size:12px; line-height:1.5;">
          Aceptar la salida amistosamente. Perdés el ingreso de 
          ${formatMoney(originalValue)} anuales pero mantenés buena 
          reputación en el mercado de sponsors.
        </div>
      </div>

    </div>
  `;

  document.body.appendChild(modal);
}

function resolveSponsorCrisis(action, sponsorId) {
  const sponsor = sponsors.find((s) => s.id === sponsorId);
  if (!sponsor) return;

  const modal = document.getElementById("sponsorNegotiationModal");
  if (modal) modal.remove();

  if (action === "reduce_fee") {
    const oldValue   = sponsor.value;
    sponsor.value    = Math.round(sponsor.value * 0.75);
    sponsor.warningCount = 0;

    addNews(
      "💰 Sponsors",
      `${selectedTeam.shortName} renegocia contrato con ${sponsor.name}`,
      `Tras una reunión de emergencia, ${selectedTeam.name} y ${sponsor.name} 
      han acordado una reducción del contrato. El sponsor continuará en el 
      proyecto con un aporte de ${formatMoney(sponsor.value)} anuales 
      (antes ${formatMoney(oldValue)}). El equipo tiene tiempo para revertir 
      los resultados.`
    );

  } else if (action === "promise_results") {
    sponsor.warningCount = 0;
    sponsor.resultPromise = {
      racesLeft:    5,
      startRound:   currentRound,
      originalValue: sponsor.value,
    };

    addNews(
      "🤝 Sponsors",
      `${selectedTeam.shortName} promete resultados a ${sponsor.name}`,
      `${selectedTeam.name} se ha comprometido ante ${sponsor.name} a mejorar 
      sus resultados en las próximas 5 carreras. El contrato se mantiene intacto 
      por ahora, pero el equipo sabe que no hay margen de error.`
    );

  } else if (action === "let_go") {
    sponsor.teamId        = null;
    sponsor.contractUntil = null;
    sponsor.warningCount  = 0;

    addNews(
      "👋 Sponsors",
      `${sponsor.name} y ${selectedTeam.shortName} se separan`,
      `${selectedTeam.name} y ${sponsor.name} han acordado poner fin a su 
      relación comercial. La separación fue amistosa y el equipo ya busca 
      nuevos patrocinadores para cubrir el espacio.`
    );
  }

  saveCurrentGame();
}

function loseSponsor(sponsor) {
  addNews(
    "💸 Sponsors",
    `${sponsor.name} abandona a ${selectedTeam.shortName}`,
    `Tras el incumplimiento reiterado de los objetivos contractuales, ${sponsor.name} ha decidido no continuar su vínculo con ${selectedTeam.shortName}. El equipo pierde ${formatMoney(sponsor.value)} anuales y deberá buscar un nuevo patrocinador para cubrir ese espacio.`
  );

  sponsor.teamId       = null;
  sponsor.contractUntil = null;
  sponsor.warningCount  = 0;
}

// ── IA rival de sponsors ──────────────────────────────────

function processRivalSponsorEvaluation() {
  teams.forEach((team) => {
    if (team.id === selectedTeam.id) return;

    const teamSponsors   = getTeamSponsors(team.id);
    const constructorPos = constructorStandings.findIndex(
      (c) => c.teamId === team.id
    ) + 1;
    const totalPoints    = constructorStandings.find(
      (c) => c.teamId === team.id
    )?.points || 0;

    teamSponsors.forEach((sponsor) => {
      const meetsPosition = constructorPos <= sponsor.requirements.minConstructorPos;
      const meetsPoints   = totalPoints >= sponsor.requirements.minPoints;

      if (!meetsPosition || !meetsPoints) {
        sponsor.warningCount = (sponsor.warningCount || 0) + 1;

        if (sponsor.warningCount >= 3) {
          addNews(
            "Paddock",
            `${sponsor.name} se desvincula de ${team.shortName}`,
            `${sponsor.name} no continuará como patrocinador de ${team.shortName} tras el incumplimiento de objetivos. El espacio quedará disponible en el mercado.`
          );
          sponsor.teamId        = null;
          sponsor.contractUntil = null;
          sponsor.warningCount  = 0;
        }
      } else {
        sponsor.warningCount = Math.max(0, (sponsor.warningCount || 0) - 1);
      }
    });

    // Rivales buscan sponsors disponibles si tienen espacio
    const primaryCount = teamSponsors.filter((s) => s.type === "primary").length;
    if (primaryCount === 0 && Math.random() < 0.4) {
      const available = getAvailableSponsors().filter((s) => s.type === "primary");
      if (available.length > 0) {
        const chosen = available[Math.floor(Math.random() * available.length)];
        chosen.teamId        = team.id;
        chosen.contractUntil = 2026 + chosen.duration;
        chosen.warningCount  = 0;
      }
    }
  });
}

// ── Negociar nuevo sponsor ────────────────────────────────

function openSponsorNegotiation(sponsorId) {
  const sponsor = sponsors.find((s) => s.id === sponsorId);
  if (!sponsor) return;

  const constructorPos = constructorStandings.findIndex(
    (c) => c.teamId === selectedTeam.id
  ) + 1 || 11;
  const totalPoints    = constructorStandings.find(
    (c) => c.teamId === selectedTeam.id
  )?.points || 0;

  const meetsPosition = constructorPos <= sponsor.requirements.minConstructorPos;
  const meetsPoints   = totalPoints >= sponsor.requirements.minPoints;

  if (!meetsPosition || !meetsPoints) {
    const missing = [];
    if (!meetsPosition) missing.push(`estar entre los ${sponsor.requirements.minConstructorPos} primeros constructores (estás ${constructorPos}°)`);
    if (!meetsPoints)   missing.push(`tener al menos ${sponsor.requirements.minPoints} puntos (tenés ${totalPoints})`);

    alert(
      `${sponsor.name} no está interesado en este momento.\n\n` +
      `Para atraer a este sponsor necesitás:\n` +
      missing.map((m) => `- ${m}`).join("\n")
    );
    return;
  }

  const confirmed = confirm(
    `¿Firmar contrato con ${sponsor.name}?\n\n` +
    `Tipo: ${getSponsorTypeLabel(sponsor.type)}\n` +
    `Valor anual: ${formatMoney(sponsor.value)}\n` +
    `Duración: ${sponsor.duration} año(s)\n` +
    `Mercado: ${getSponsorMarketLabel(sponsor.preferences.market)}\n\n` +
    `Requisitos: P${sponsor.requirements.minConstructorPos} constructores · ${sponsor.requirements.minPoints} puntos mínimos`
  );

  if (!confirmed) return;

  sponsor.teamId        = selectedTeam.id;
  sponsor.contractUntil = 2026 + sponsor.duration;
  sponsor.warningCount  = 0;

  addNews(
    "Sponsors",
    `${selectedTeam.shortName} firma con ${sponsor.name}`,
    `${selectedTeam.name} incorpora a ${sponsor.name} como nuevo patrocinador ${getSponsorTypeLabel(sponsor.type).toLowerCase()}. El acuerdo por ${sponsor.duration} año(s) suma ${formatMoney(sponsor.value)} anuales al presupuesto del equipo.`
  );

  saveCurrentGame();
  renderSponsorsModule();
}

// ── Pantalla de sponsors ──────────────────────────────────

function renderSponsorsModule() {
  if (!selectedTeam) return;

  if (sponsors.length === 0) loadSponsors();

  document.getElementById("sponsorsSubtitle").textContent =
    `${selectedTeam.name} — Temporada 2026`;

  renderActiveSponsors();
  renderSponsorFinancials();
  renderAvailableSponsors();
  renderSponsorRanking();
}

function renderActiveSponsors() {
  const container   = document.getElementById("activeSponsorsList");
  const teamSponsors = getTeamSponsors(selectedTeam.id);

  if (teamSponsors.length === 0) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px; padding:12px;">
        Sin sponsors activos. Negociá contratos en la sección de disponibles.
      </div>`;
    return;
  }

  const types = [
    { key: "primary",   label: "Sponsor Principal",   color: "#e10600" },
    { key: "secondary", label: "Sponsors Secundarios", color: "#ffcc00" },
    { key: "technical", label: "Sponsors Técnicos",    color: "#4caf50" },
  ];

  container.innerHTML = types.map((type) => {
    const group = teamSponsors.filter((s) => s.type === type.key);
    if (group.length === 0) return "";

    return `
      <div style="margin-bottom:24px;">
        <div style="color:${type.color}; font-size:12px; font-weight:700;
          letter-spacing:1px; margin-bottom:12px;">
          ${type.label.toUpperCase()}
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px;">
          ${group.map((sponsor) => {
            const warningColor = sponsor.warningCount === 0 ? "#4caf50"
              : sponsor.warningCount === 1 ? "#ffcc00" : "#e10600";
            const warningText  = sponsor.warningCount === 0 ? "✓ En regla"
              : sponsor.warningCount === 1 ? "⚠️ Advertencia"
              : "🚨 En riesgo";
            const annualIncome = formatMoney(sponsor.value);

            return `
              <div style="background:linear-gradient(180deg,#161616,#0c0c0c);
                border:1px solid #2a2a2a;
                border-left:4px solid ${type.color};
                border-radius:12px; padding:16px;">
                <div style="display:flex; justify-content:space-between;
                  align-items:flex-start; margin-bottom:12px;">
                  <div>
                    <div style="font-size:18px; font-weight:800; color:#fff;">
                      ${sponsor.name}
                    </div>
                    <div style="color:#aaa; font-size:12px; margin-top:3px;">
                      ${getSponsorMarketLabel(sponsor.preferences.market)}
                      ${sponsor.preferences.nationality
                        ? ` · ${sponsor.preferences.nationality}` : ""}
                    </div>
                  </div>
                  <div style="text-align:right;">
                    <div style="color:${warningColor}; font-size:12px; font-weight:700;">
                      ${warningText}
                    </div>
                    <div style="color:#666; font-size:11px; margin-top:2px;">
                      Hasta ${sponsor.contractUntil}
                    </div>
                  </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;
                  margin-bottom:12px;">
                  <div class="summary-item">
                    <span>Valor anual</span>
                    <strong style="color:#4caf50;">${annualIncome}</strong>
                  </div>
                  <div class="summary-item">
                    <span>Ingreso mensual</span>
                    <strong>${formatMoney(Math.round(sponsor.value / 12))}</strong>
                  </div>
                  <div class="summary-item">
                    <span>Bono victoria</span>
                    <strong>${formatMoney(sponsor.bonus.win)}</strong>
                  </div>
                  <div class="summary-item">
                    <span>Bono podio</span>
                    <strong>${formatMoney(sponsor.bonus.podium)}</strong>
                  </div>
                </div>

                <div style="background:#0a0a0a; border:1px solid #1a1a1a;
                  border-radius:8px; padding:10px; font-size:12px; color:#aaa;">
                  Requisito: P${sponsor.requirements.minConstructorPos} constructores
                  · ${sponsor.requirements.minPoints} pts mínimos
                  ${sponsor.warningCount > 0
                    ? `<br><span style="color:${warningColor};">
                        ${sponsor.warningCount} advertencia(s) acumulada(s)
                      </span>`
                    : ""}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function renderSponsorFinancials() {
  const container    = document.getElementById("sponsorFinancials");
  const teamSponsors = getTeamSponsors(selectedTeam.id);

  const totalAnual   = teamSponsors.reduce((s, sp) => s + sp.value, 0);
  const totalMensual = Math.round(totalAnual / 12);
  const primaryVal   = teamSponsors.filter((s) => s.type === "primary")
    .reduce((s, sp) => s + sp.value, 0);
  const bonusMaxWin  = teamSponsors.reduce((s, sp) => s + sp.bonus.win, 0);

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
      gap:14px;">
      <div class="summary-item">
        <span>Ingresos anuales por sponsors</span>
        <strong style="color:#4caf50; font-size:20px;">${formatMoney(totalAnual)}</strong>
      </div>
      <div class="summary-item">
        <span>Ingreso mensual</span>
        <strong>${formatMoney(totalMensual)}</strong>
      </div>
      <div class="summary-item">
        <span>Sponsors activos</span>
        <strong>${teamSponsors.length}</strong>
      </div>
      <div class="summary-item">
        <span>Potencial bono por victoria</span>
        <strong style="color:#ffcc00;">${formatMoney(bonusMaxWin)}</strong>
      </div>
    </div>
  `;
}

function renderAvailableSponsors() {
  const container = document.getElementById("availableSponsorsList");
  const available = getAvailableSponsors();

  const constructorPos = constructorStandings.findIndex(
    (c) => c.teamId === selectedTeam.id
  ) + 1 || 11;
  const totalPoints    = constructorStandings.find(
    (c) => c.teamId === selectedTeam.id
  )?.points || 0;

  if (available.length === 0) {
    container.innerHTML = `
      <div style="color:#666; font-size:13px; padding:12px;">
        No hay sponsors disponibles en este momento.
      </div>`;
    return;
  }

  container.innerHTML = "";

  available.forEach((sponsor) => {
    const meetsPos    = constructorPos <= sponsor.requirements.minConstructorPos;
    const meetsPts    = totalPoints >= sponsor.requirements.minPoints;
    const canSign     = meetsPos && meetsPts;

    const card = document.createElement("div");
    card.style.cssText = `
      background:linear-gradient(180deg,#161616,#0c0c0c);
      border:1px solid ${canSign ? "#2a4a2a" : "#2a2a2a"};
      border-left:4px solid ${canSign ? "#4caf50" : "#444"};
      border-radius:12px; padding:16px; margin-bottom:12px;
      opacity:${canSign ? "1" : "0.6"};
    `;

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between;
        align-items:flex-start; margin-bottom:12px;">
        <div>
          <div style="font-size:17px; font-weight:800; color:#fff;">
            ${sponsor.name}
          </div>
          <div style="color:#aaa; font-size:12px; margin-top:3px;">
            ${getSponsorTypeLabel(sponsor.type)} ·
            ${getSponsorMarketLabel(sponsor.preferences.market)}
            ${sponsor.preferences.nationality
              ? ` · Prefiere: ${sponsor.preferences.nationality}` : ""}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="color:#4caf50; font-size:16px; font-weight:800;">
            ${formatMoney(sponsor.value)}/año
          </div>
          <div style="color:#666; font-size:11px;">${sponsor.duration} año(s)</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(3,1fr);
        gap:8px; margin-bottom:12px;">
        <div class="summary-item">
          <span>Bono victoria</span>
          <strong>${formatMoney(sponsor.bonus.win)}</strong>
        </div>
        <div class="summary-item">
          <span>Bono podio</span>
          <strong>${formatMoney(sponsor.bonus.podium)}</strong>
        </div>
        <div class="summary-item">
          <span>Bono punto</span>
          <strong>${formatMoney(sponsor.bonus.point)}</strong>
        </div>
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:8px; padding:10px; margin-bottom:12px;
        font-size:12px; color:#aaa;">
        Requisito: P${sponsor.requirements.minConstructorPos} constructores
        · ${sponsor.requirements.minPoints} pts
        <span style="color:${canSign ? "#4caf50" : "#e10600"}; margin-left:8px;">
          ${canSign ? "✓ Cumplís los requisitos" : "✗ No cumplís los requisitos aún"}
        </span>
      </div>

      <button class="btn" style="width:100%; padding:11px;"
        ${canSign ? "" : "disabled"}
        onclick="openSponsorNegotiation(${sponsor.id})">
        ${canSign ? "NEGOCIAR CONTRATO" : "REQUISITOS NO CUMPLIDOS"}
      </button>
    `;

    container.appendChild(card);
  });
}

function renderSponsorRanking() {
  const tbody = document.getElementById("sponsorRankingBody");
  if (!tbody) return;

  const ranking = teams.map((team) => {
    const teamSponsors = getTeamSponsors(team.id);
    const totalValue   = teamSponsors.reduce((s, sp) => s + sp.value, 0);
    return { team, totalValue, count: teamSponsors.length };
  }).sort((a, b) => b.totalValue - a.totalValue);

  tbody.innerHTML = "";

  ranking.forEach((entry, i) => {
    const row = document.createElement("tr");
    if (entry.team.id === selectedTeam.id) row.classList.add("player-team-row");

    row.innerHTML = `
      <td>${i + 1}</td>
      <td style="color:${entry.team.color}">${entry.team.shortName}</td>
      <td>${entry.count}</td>
      <td style="color:#4caf50;">${formatMoney(entry.totalValue)}</td>
      <td>${formatMoney(Math.round(entry.totalValue / 12))}</td>
    `;
    tbody.appendChild(row);
  });
}
// ══════════════════════════════════════════════════════════
// SAFETY CAR Y CLIMA DINÁMICO
// ══════════════════════════════════════════════════════════

function rollWeather() {
  const circuit = currentRaceData?.circuit;
  if (!circuit) return "dry";

  const roll = Math.random();

  if (circuit.country === "GBR" || circuit.country === "BEL" ||
      circuit.country === "JPN" || circuit.country === "BRA") {
    if (roll < 0.40) return "dry";
    if (roll < 0.60) return "cloudy";
    if (roll < 0.80) return "light_rain";
    return "heavy_rain";
  }

  if (roll < 0.60) return "dry";
  if (roll < 0.80) return "cloudy";
  if (roll < 0.92) return "light_rain";
  return "heavy_rain";
}

function rollWeatherChange(currentWeather) {
  const roll = Math.random();

  if (currentWeather === "dry") {
    if (roll < 0.85) return "dry";
    if (roll < 0.93) return "cloudy";
    return "light_rain";
  }

  if (currentWeather === "cloudy") {
    if (roll < 0.40) return "dry";
    if (roll < 0.70) return "cloudy";
    if (roll < 0.88) return "light_rain";
    return "heavy_rain";
  }

  if (currentWeather === "light_rain") {
    if (roll < 0.20) return "dry";
    if (roll < 0.40) return "cloudy";
    if (roll < 0.75) return "light_rain";
    return "heavy_rain";
  }

  if (currentWeather === "heavy_rain") {
    if (roll < 0.15) return "light_rain";
    if (roll < 0.30) return "mixed";
    return "heavy_rain";
  }

  return currentWeather;
}

function weatherLabel(weather) {
  return WEATHER_STATES[weather]?.label || weather;
}

function weatherIcon(weather) {
  return WEATHER_STATES[weather]?.icon || "☀️";
}

function getWeatherTimePenalty(weather) {
  const map = {
    dry:        0,
    cloudy:     0.3,
    light_rain: 4.5,
    heavy_rain: 9.0,
    mixed:      2.5,
  };
  return map[weather] || 0;
}

function getTyreWeatherPenalty(compound, weather) {
  if (weather === "dry" || weather === "cloudy") {
    if (compound === "intermediate") return 8.0;
    if (compound === "wet")          return 15.0;
    return 0;
  }

  if (weather === "light_rain") {
    if (compound === "intermediate") return 0;
    if (compound === "wet")          return 3.0;
    if (compound === "soft")         return 6.0;
    if (compound === "medium")       return 5.0;
    return 4.5;
  }

  if (weather === "heavy_rain") {
    if (compound === "wet")          return 0;
    if (compound === "intermediate") return 2.5;
    return 18.0;
  }

  return 0;
}

function simulateSafetyCarEvents(laps, raceResults) {
  const events = [];
  const dnfDrivers = raceResults.filter((r) => r.dnf);

  dnfDrivers.forEach((driver) => {
    const incidentLap = Math.floor(Math.random() * laps) + 1;
    const roll        = Math.random();
    const type        = roll < 0.15 ? "red_flag"
      : roll < 0.50 ? "sc" : "vsc";

    events.push({
      lap:      incidentLap,
      type,
      driver:   driver.driverName,
      team:     driver.teamName,
      reason:   driver.dnfReason || "incidente",
    });
  });

  // SC adicional aleatorio independiente de DNFs
  if (Math.random() < 0.30) {
    const lap  = Math.floor(Math.random() * (laps - 10)) + 5;
    const roll = Math.random();
    events.push({
      lap,
      type:   roll < 0.20 ? "vsc" : "sc",
      driver: null,
      team:   null,
      reason: "detritos en pista",
    });
  }

  // SC al final de la carrera (últimas 5 vueltas)
  if (Math.random() < 0.15) {
    events.push({
      lap:    laps - Math.floor(Math.random() * 4) - 1,
      type:   "sc",
      driver: null,
      team:   null,
      reason: "incidente en recta final",
      lateRace: true,
    });
  }

  return events.sort((a, b) => a.lap - b.lap);
}

function applySafetyCarEffect(raceResults, scEvents, laps) {
  let totalScTime  = 0;
  let hadRedFlag   = false;
  let lateRaceSC   = false;
  const scLog      = [];

  scEvents.forEach((event) => {
    const scData = SC_TYPES[event.type];

    if (event.type === "red_flag") {
  hadRedFlag = true;
  const leader = raceResults.filter((r) => !r.dnf)
    .sort((a, b) => a.raceTime - b.raceTime)[0];
  if (leader) {
    raceResults.forEach((r) => {
      if (!r.dnf) {
        const gap = r.raceTime - leader.raceTime;
        r.raceTime -= gap * 0.85;
      }
    });
  }
      scLog.push(`🚩 Vuelta ${event.lap}: Bandera Roja${event.driver ? ` — ${event.driver}` : ""}`);
      return;
    }

    if (event.type === "vsc") {
      totalScTime += 8 * scData.duration;
      scLog.push(`🟡 Vuelta ${event.lap}: Virtual Safety Car${event.driver ? ` — ${event.driver}` : ` — ${event.reason}`}`);
    }

    if (event.type === "sc") {
      totalScTime += 15 * scData.duration;

      // Bajo SC los pilotos que hacen pit ganan tiempo
      raceResults.forEach((r) => {
        if (r.dnf) return;
        const pitUnderSC = Math.random() < 0.45;
        if (pitUnderSC) {
          r.raceTime -= 12 + Math.random() * 6;
          r.pitUnderSC = true;
        }
      });

      if (event.lateRace) {
        lateRaceSC = true;
        // SC tardío puede cambiar el podio completamente
        const leader = raceResults.filter((r) => !r.dnf)
          .sort((a, b) => a.raceTime - b.raceTime)[0];
        if (leader) {
          leader.raceTime += Math.random() * 5;
        }
        scLog.push(`🚨 Vuelta ${event.lap}: Safety Car TARDÍO — podio en juego`);
      } else {
        scLog.push(`🟠 Vuelta ${event.lap}: Safety Car${event.driver ? ` — ${event.driver}` : ` — ${event.reason}`}`);
      }
    }
  });

  return { totalScTime, hadRedFlag, lateRaceSC, scLog };
}

function generateWeatherTimeline(laps) {
  const timeline   = [];
  let current      = raceWeather;
  const changeAt   = [
    Math.floor(laps * 0.25),
    Math.floor(laps * 0.50),
    Math.floor(laps * 0.75),
  ];

  for (let lap = 1; lap <= laps; lap++) {
    if (changeAt.includes(lap)) {
      current = rollWeatherChange(current);
    }
    timeline.push(current);
  }

  return timeline;
}

function buildRaceNarrative(finalResults, scEvents, weatherTimeline, laps) {
  const narrative = [];
  const winner    = finalResults.find((r) => !r.dnf && r.position === 1);
  const playerRes = finalResults.filter((r) => r.teamId === selectedTeam.id);

  const weatherChanges = weatherTimeline.filter((w, i) =>
    i > 0 && w !== weatherTimeline[i - 1]
  );

  if (weatherChanges.length > 0) {
    narrative.push(`El clima fue protagonista con ${weatherChanges.length} cambio(s) de condiciones durante la carrera.`);
  }

  const scCount = scEvents.filter((e) => e.type === "sc").length;
  const vscCount = scEvents.filter((e) => e.type === "vsc").length;
  const rfCount  = scEvents.filter((e) => e.type === "red_flag").length;

  if (rfCount > 0)  narrative.push(`La carrera fue interrumpida por bandera roja.`);
  if (scCount > 0)  narrative.push(`El Safety Car salió ${scCount} vez/veces alterando las estrategias.`);
  if (vscCount > 0) narrative.push(`El Virtual Safety Car intervino ${vscCount} vez/veces.`);

  const pitUnderSC = finalResults.filter((r) => r.pitUnderSC);
  if (pitUnderSC.length > 0) {
    narrative.push(`${pitUnderSC.map((r) => r.driverName).join(", ")} aprovecharon el Safety Car para hacer pit.`);
  }

  playerRes.forEach((r) => {
    if (r.dnf) {
      narrative.push(`${r.driverName} abandonó por ${r.dnfReason}.`);
    } else if (r.position <= 3) {
      narrative.push(`${r.driverName} terminó en el podio (P${r.position}).`);
    }
  });

  return narrative;
}

// ══════════════════════════════════════════════════════════
// SISTEMA DE PENALIZACIONES
// ══════════════════════════════════════════════════════════

const SUPERLICENSE_LIMITS = 12;

const PENALTY_TYPES = {
  drive_through:    { label: "Drive Through",        timeLoss: 20,  superLicensePoints: 0 },
  stop_and_go:      { label: "Stop & Go (10s)",       timeLoss: 10,  superLicensePoints: 0 },
  time_5s:          { label: "+5 segundos",           timeLoss: 5,   superLicensePoints: 0 },
  time_10s:         { label: "+10 segundos",          timeLoss: 10,  superLicensePoints: 0 },
  time_20s:         { label: "+20 segundos",          timeLoss: 20,  superLicensePoints: 0 },
  grid_3:           { label: "3 lugares de grilla",   timeLoss: 0,   superLicensePoints: 0 },
  grid_5:           { label: "5 lugares de grilla",   timeLoss: 0,   superLicensePoints: 0 },
  grid_10:          { label: "10 lugares de grilla",  timeLoss: 0,   superLicensePoints: 0 },
  pitlane_start:    { label: "Salida desde pit lane", timeLoss: 0,   superLicensePoints: 0 },
  disqualification: { label: "Descalificación",       timeLoss: 0,   superLicensePoints: 3  },
  collision:        { label: "Colisión causada",       timeLoss: 10,  superLicensePoints: 3  },
  blue_flag:        { label: "Ignorar bandera azul",  timeLoss: 10,  superLicensePoints: 2  },
  pitlane_speeding: { label: "Exceso velocidad boxes",timeLoss: 20,  superLicensePoints: 1  },
  impeding:         { label: "Obstaculizar en Q",     timeLoss: 0,   superLicensePoints: 2  },
  engine_change:    { label: "Cambio de motor",       timeLoss: 0,   superLicensePoints: 0  },
};

const PENALTY_CAUSES = {
  collision:        { type: "collision",        chance: 0.08, timing: "race"      },
  blue_flag:        { type: "blue_flag",        chance: 0.04, timing: "race"      },
  pitlane_speeding: { type: "pitlane_speeding", chance: 0.03, timing: "race"      },
  impeding:         { type: "impeding",         chance: 0.05, timing: "qualifying"},
  engine_change:    { type: "engine_change",    chance: 0.06, timing: "pre_race"  },
};

function simulateRacePenalties(raceResults) {
  const penalties = [];

  raceResults.forEach((result) => {
    if (result.dnf) return;

    const driver = drivers.find((d) => d.id === result.driverId);
    const team   = teams.find((t) => t.id === result.teamId);
    if (!driver || !team) return;

    // Colisión
    if (Math.random() < PENALTY_CAUSES.collision.chance) {
      const penalty = {
        driverId:   driver.id,
        driverName: driver.name,
        teamName:   team.shortName,
        teamColor:  team.color,
        type:       "collision",
        label:      PENALTY_TYPES.collision.label,
        timeLoss:   PENALTY_TYPES.collision.timeLoss,
        slPoints:   PENALTY_TYPES.collision.superLicensePoints,
        lap:        Math.floor(Math.random() * raceResults[0].raceTime / 90) + 1,
      };
      penalties.push(penalty);
      applyTimePenalty(result, penalty.timeLoss);
      applySuperLicensePoints(driver, penalty.slPoints, penalty.label);
    }

    // Bandera azul
    if (result.position > 15 && Math.random() < PENALTY_CAUSES.blue_flag.chance) {
      const penalty = {
        driverId:   driver.id,
        driverName: driver.name,
        teamName:   team.shortName,
        teamColor:  team.color,
        type:       "blue_flag",
        label:      PENALTY_TYPES.blue_flag.label,
        timeLoss:   PENALTY_TYPES.blue_flag.timeLoss,
        slPoints:   PENALTY_TYPES.blue_flag.superLicensePoints,
        lap:        Math.floor(Math.random() * 20) + 1,
      };
      penalties.push(penalty);
      applyTimePenalty(result, penalty.timeLoss);
      applySuperLicensePoints(driver, penalty.slPoints, penalty.label);
    }

    // Exceso de velocidad en pit lane
    if (Math.random() < PENALTY_CAUSES.pitlane_speeding.chance) {
      const penalty = {
        driverId:   driver.id,
        driverName: driver.name,
        teamName:   team.shortName,
        teamColor:  team.color,
        type:       "pitlane_speeding",
        label:      PENALTY_TYPES.pitlane_speeding.label,
        timeLoss:   PENALTY_TYPES.pitlane_speeding.timeLoss,
        slPoints:   PENALTY_TYPES.pitlane_speeding.superLicensePoints,
        lap:        result.strategy?.pitLaps?.[0] || 1,
      };
      penalties.push(penalty);
      applyTimePenalty(result, penalty.timeLoss);
      applySuperLicensePoints(driver, penalty.slPoints, penalty.label);
    }
  });

  return penalties;
}

function simulateQualifyingPenalties(qualifyingResults) {
  const penalties = [];

  qualifyingResults.forEach((result) => {
    const driver = drivers.find((d) => d.id === result.driverId);
    const team   = teams.find((t) => t.id === result.teamId);
    if (!driver || !team) return;

    // Obstaculizar en clasificación
    if (Math.random() < PENALTY_CAUSES.impeding.chance) {
      const gridPenalty = 3;
      penalties.push({
        driverId:   driver.id,
        driverName: driver.name,
        teamName:   team.shortName,
        teamColor:  team.color,
        type:       "impeding",
        label:      PENALTY_TYPES.impeding.label,
        gridPenalty,
        slPoints:   PENALTY_TYPES.impeding.superLicensePoints,
      });
      applyGridPenalty(result, gridPenalty, qualifyingResults);
      applySuperLicensePoints(driver, 2, "Obstaculizar en clasificación");
    }
  });

  return penalties;
}

function simulatePreRacePenalties(qualifyingResults) {
  const penalties = [];

  qualifyingResults.forEach((result) => {
    const driver = drivers.find((d) => d.id === result.driverId);
    const team   = teams.find((t) => t.id === result.teamId);
    if (!driver || !team) return;

    // Cambio de motor/componentes
    if (Math.random() < PENALTY_CAUSES.engine_change.chance) {
      const roll = Math.random();
      let gridPenalty = 0;
      let label = "";
      let pitLaneStart = false;

      if (roll < 0.3) {
        gridPenalty  = 5;
        label        = "Cambio de componente — 5 lugares";
      } else if (roll < 0.6) {
        gridPenalty  = 10;
        label        = "Cambio de motor — 10 lugares";
      } else {
        pitLaneStart = true;
        label        = "Múltiples cambios — salida desde pit lane";
      }

      penalties.push({
        driverId:    driver.id,
        driverName:  driver.name,
        teamName:    team.shortName,
        teamColor:   team.color,
        type:        "engine_change",
        label,
        gridPenalty,
        pitLaneStart,
        slPoints:    0,
      });

      if (pitLaneStart) {
        result.position = qualifyingResults.length;
      } else {
        applyGridPenalty(result, gridPenalty, qualifyingResults);
      }
    }
  });

  return penalties;
}

function applyTimePenalty(result, seconds) {
  result.raceTime += seconds;
}

function applyGridPenalty(result, places, allResults) {
  const oldPos = result.position;
  const newPos = Math.min(oldPos + places, allResults.length);

  // Desplazar hacia arriba a todos los que estaban entre oldPos y newPos
  allResults.forEach((r) => {
    if (r.driverId === result.driverId) return;
    if (r.position > oldPos && r.position <= newPos) {
      r.position -= 1;
    }
  });

  result.position = newPos;
}

function applySuperLicensePoints(driver, points, reason) {
  if (!driver.superLicense) {
    driver.superLicense = { points: 0, penalties: [] };
  }

  driver.superLicense.points += points;
  driver.superLicense.penalties.push({
    date:   currentDate,
    reason,
    points,
  });

  // Verificar suspensión
  if (driver.superLicense.points >= SUPERLICENSE_LIMITS) {
    triggerSuspension(driver);
  }
}

function triggerSuspension(driver) {
  const team = teams.find((t) => t.id === driver.teamId);

  addNews(
    "🚨 Superlicencia",
    `${driver.name} suspendido por acumulación de puntos`,
    `${driver.name} ha acumulado ${driver.superLicense.points} puntos en su superlicencia, superando el límite de ${SUPERLICENSE_LIMITS}. El piloto deberá cumplir una carrera de suspensión. ${team?.shortName || "Su equipo"} deberá buscar un reemplazo para la próxima fecha.`
  );

  driver.suspended = true;
  driver.superLicense.points = 0;

  // Si es piloto del jugador, mostrar modal de reemplazo
  if (driver.teamId === selectedTeam?.id) {
    showReplacementModal(driver);
  } else {
    assignAIReplacement(driver, team);
  }
}

function showReplacementModal(suspendedDriver) {
  const existing = document.getElementById("replacementModal");
  if (existing) existing.remove();

  const teamTesters = drivers.filter(
    (d) => d.teamId === selectedTeam.id && d.role === "tester"
  );
  const freeTesters = drivers.filter(
    (d) => d.role === "tester" && (!d.teamId || d.teamId === null)
  );
  const available = [...teamTesters, ...freeTesters];

  const modal = document.createElement("div");
  modal.id = "replacementModal";
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.90); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
  `;

  modal.innerHTML = `
    <div style="background:#111; border:1px solid #333; border-radius:16px;
      padding:32px; max-width:540px; width:90%;">

      <div style="color:#e10600; font-size:12px; font-weight:700;
        letter-spacing:1px; margin-bottom:8px;">🚨 PILOTO SUSPENDIDO</div>
      <div style="font-size:20px; font-weight:800; color:#fff; margin-bottom:6px;">
        ${suspendedDriver.name} no puede correr
      </div>
      <div style="color:#aaa; font-size:13px; margin-bottom:20px;">
        Ha acumulado ${SUPERLICENSE_LIMITS} puntos en su superlicencia. 
        Necesitás designar un reemplazo para la próxima carrera.
      </div>

      ${available.length === 0 ? `
        <div style="background:#1a0a0a; border:1px solid #e10600;
          border-radius:10px; padding:14px; color:#e10600; font-size:13px;">
          ⚠️ No hay pilotos tester disponibles. 
          El equipo deberá buscar un piloto libre en el mercado.
        </div>
      ` : `
        <div style="color:#aaa; font-size:13px; font-weight:700;
          margin-bottom:12px;">SELECCIONÁ EL REEMPLAZO</div>
        ${available.map((driver) => `
          <div onclick="confirmReplacement(${suspendedDriver.id}, ${driver.id})"
            style="background:#0a0a0a; border:1px solid #222; border-radius:10px;
            padding:14px; margin-bottom:10px; cursor:pointer; transition:0.2s;"
            onmouseover="this.style.borderColor='#4caf50'"
            onmouseout="this.style.borderColor='#222'">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-size:15px; font-weight:700; color:#fff;">
                  ${driver.name}
                </div>
                <div style="color:#aaa; font-size:12px; margin-top:3px;">
                  ${driver.nationality} · ${driver.age} años ·
                  ${driver.teamId === selectedTeam.id ? "Tester del equipo" : "Tester disponible"}
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:22px; font-weight:800; color:#4caf50;">
                  ${calcDriverRating(driver)}
                </div>
                <div style="color:#666; font-size:11px;">rating</div>
              </div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(4,1fr);
              gap:6px; margin-top:10px;">
              ${renderMiniAttribute("Pace", driver.attributes.pace)}
              ${renderMiniAttribute("Carrera", driver.attributes.racecraft)}
              ${renderMiniAttribute("Neum.", driver.attributes.tireManagement)}
              ${renderMiniAttribute("Exp.", driver.attributes.experience)}
            </div>
          </div>
        `).join("")}
      `}
    </div>
  `;

  document.body.appendChild(modal);
}

function confirmReplacement(suspendedDriverId, replacementDriverId) {
  const suspended   = drivers.find((d) => d.id === suspendedDriverId);
  const replacement = drivers.find((d) => d.id === replacementDriverId);
  if (!suspended || !replacement) return;

  replacement.tempReplacing  = suspendedDriverId;
  replacement.teamId         = selectedTeam.id;

  const modal = document.getElementById("replacementModal");
  if (modal) modal.remove();

  addNews(
    "🔄 Equipo",
    `${replacement.name} reemplaza a ${suspended.name}`,
    `Ante la suspensión de ${suspended.name}, ${selectedTeam.shortName} 
    ha designado a ${replacement.name} como piloto para la próxima carrera. 
    ${suspended.name} regresará una vez cumplida la sanción.`
  );

  saveCurrentGame();
}

function assignAIReplacement(suspendedDriver, team) {
  if (!team) return;

  const tester = drivers.find(
    (d) => d.teamId === team.id && d.role === "tester"
  );

  if (tester) {
    tester.tempReplacing = suspendedDriver.id;
    addNews(
      "🔄 Paddock",
      `${tester.name} reemplaza a ${suspendedDriver.name} en ${team.shortName}`,
      `${team.name} ha confirmado a ${tester.name} como piloto sustituto 
      tras la suspensión de ${suspendedDriver.name} por acumulación de 
      puntos en la superlicencia.`
    );
  }
}

function generatePenaltyReport(racePenaltiesList, qualifyingPenaltiesList, preRacePenaltiesList) {
  const allPenalties = [
    ...preRacePenaltiesList,
    ...qualifyingPenaltiesList,
    ...racePenaltiesList,
  ];

  if (allPenalties.length === 0) return;

  const { race } = currentRaceData;

  allPenalties.forEach((penalty) => {
    const isPlayer = teams.find(
      (t) => t.shortName === penalty.teamName && t.id === selectedTeam.id
    );

    if (isPlayer) {
      addNews(
        "⚠️ Penalización",
        `${penalty.driverName} recibe sanción en ${race.name}`,
        `${penalty.driverName} (${penalty.teamName}) ha sido sancionado por 
        ${penalty.label.toLowerCase()}. 
        ${penalty.timeLoss > 0 ? `Penalización de tiempo: +${penalty.timeLoss}s. ` : ""}
        ${penalty.gridPenalty > 0 ? `Penalización de grilla: ${penalty.gridPenalty} lugares. ` : ""}
        ${penalty.slPoints > 0 ? `Puntos de superlicencia: +${penalty.slPoints}. ` : ""}`
      );
    } else {
      if (Math.random() < 0.4) {
        addNews(
          "📋 Paddock",
          `Sanción para ${penalty.driverName} en ${race.name}`,
          `Los comisarios han sancionado a ${penalty.driverName} 
          (${penalty.teamName}) por ${penalty.label.toLowerCase()}.`
        );
      }
    }
  });
}

function generateMarketRumors() {
  if (currentRound < 3) return;

  const recentRaces = 4;

  // Rumores sobre pilotos rivales con mal rendimiento
  drivers.forEach((driver) => {
    if (driver.teamId === selectedTeam.id) return;

    const history = driverResultsHistory[driver.id] || [];
    const recent  = history.slice(0, recentRaces);
    if (recent.length < recentRaces) return;

    const recentPoints = recent.reduce((s, r) => s + (r.points || 0), 0);
    const recentDNFs   = recent.filter((r) => r.dnf).length;
    const team         = teams.find((t) => t.id === driver.teamId);
    if (!team) return;

    // Piloto con mal rendimiento — rumor de reemplazo
    if (recentPoints <= 2 && recentDNFs >= 2 && Math.random() < 0.4) {
      addNews(
        "🔄 Mercado",
        `${team.shortName} estudiaría reemplazar a ${driver.name}`,
        `Fuentes cercanas a ${team.name} sugieren que la dirección evalúa opciones ante el flojo rendimiento de ${driver.name}. Con solo ${recentPoints} puntos y ${recentDNFs} abandonos en las últimas ${recentRaces} carreras, la presión sobre el piloto crece.`
      );
      return;
    }

    // Piloto con gran rendimiento — rumor de interés de otros equipos
    if (recentPoints >= 30 && Math.random() < 0.3) {
      const interestedTeam = teams
        .filter((t) => t.id !== driver.teamId && t.performance.overall >= 85)
        [Math.floor(Math.random() * 3)];
      if (interestedTeam) {
        addNews(
          "🔄 Mercado",
          `${driver.name} en la agenda de ${interestedTeam.shortName}`,
          `El gran momento de ${driver.name} no pasa desapercibido. Según versiones del paddock, ${interestedTeam.name} habría sondeado la disponibilidad del piloto de cara a la próxima temporada. ${team.shortName} confía en retenerlo.`
        );
      }
    }
  });

  // Rumores sobre equipos que mejoran o empeoran mucho
  teams.forEach((team) => {
    if (team.id === selectedTeam.id) return;

    const teamResults = driverResultsHistory;
    const teamDriversList = drivers.filter((d) => d.teamId === team.id);
    const recentTeamPoints = teamDriversList.reduce((total, driver) => {
      const history = driverResultsHistory[driver.id] || [];
      return total + history.slice(0, recentRaces)
        .reduce((sum, r) => sum + (r.points || 0), 0);
    }, 0);

    const constructorPos = constructorStandings.findIndex(
      (c) => c.teamId === team.id
    ) + 1;

    // Equipo sorpresa — está rindiendo mejor de lo esperado
    if (constructorPos <= 4 && team.performance.overall < 88 && Math.random() < 0.25) {
      addNews(
        "📊 Análisis",
        `La sorpresa del campeonato: ${team.shortName} desafía a los grandes`,
        `Nadie esperaba ver a ${team.name} tan arriba en el campeonato. Con P${constructorPos} en constructores, el equipo demuestra que la estrategia y la ejecución pueden compensar la diferencia de recursos frente a los equipos top.`
      );
    }

    // Equipo en crisis — está muy por debajo de lo esperado
    if (constructorPos >= 9 && team.performance.overall >= 85 && Math.random() < 0.25) {
      addNews(
        "📰 Paddock",
        `Crisis en ${team.shortName}: los números no cierran`,
        `${team.name} esperaba estar mucho más arriba en el campeonato. En P${constructorPos} con su nivel de recursos, algo no está funcionando. En el paddock se habla de problemas internos y de posibles cambios en la estructura técnica.`
      );
    }
  });
}

function checkRivalries() {
  if (currentRound < 3) return;

  const recentRaces = 5;
  const allDriversList = [...drivers];

  // Buscar pares de pilotos que terminaron muy cerca repetidamente
  for (let i = 0; i < allDriversList.length; i++) {
    for (let j = i + 1; j < allDriversList.length; j++) {
      const driverA = allDriversList[i];
      const driverB = allDriversList[j];

      if (driverA.teamId === driverB.teamId) continue;

      const historyA = driverResultsHistory[driverA.id] || [];
      const historyB = driverResultsHistory[driverB.id] || [];

      const recent = Math.min(recentRaces, historyA.length, historyB.length);
      if (recent < 3) continue;

      let closeFinishes = 0;
      let battles = 0;

      for (let r = 0; r < recent; r++) {
        const resultA = historyA[r];
        const resultB = historyB[r];
        if (!resultA || !resultB || resultA.dnf || resultB.dnf) continue;

        const posDiff = Math.abs(resultA.position - resultB.position);

        if (posDiff <= 2) closeFinishes++;
        if (posDiff <= 5) battles++;
      }

      // Rivalidad intensa — terminaron muy cerca 3+ veces
      if (closeFinishes >= 3 && Math.random() < 0.25) {
        const teamA = teams.find((t) => t.id === driverA.teamId);
        const teamB = teams.find((t) => t.id === driverB.teamId);

        addNews(
          "⚔️ Rivalidad",
          `${driverA.name} vs ${driverB.name}: la batalla del campeonato`,
          `Carrera tras carrera, ${driverA.name} y ${driverB.name} se encuentran en pista. En las últimas ${recent} carreras han terminado a menos de dos posiciones en ${closeFinishes} ocasiones. ${teamA?.shortName || ""} y ${teamB?.shortName || ""} tienen claro quién es el enemigo a batir.`
        );
        return;
      }

      // Compañeros de equipo en conflicto
      if (driverA.teamId === driverB.teamId) continue;

      // Piloto del jugador en rivalidad
      const playerDriverIds = getDriversByTeam(selectedTeam).map((d) => d.id);
      const involvesPlayer  = playerDriverIds.includes(driverA.id) ||
                              playerDriverIds.includes(driverB.id);

      if (involvesPlayer && battles >= 3 && Math.random() < 0.35) {
        const rival   = playerDriverIds.includes(driverA.id) ? driverB : driverA;
        const ourDriver = playerDriverIds.includes(driverA.id) ? driverA : driverB;
        const rivalTeam = teams.find((t) => t.id === rival.teamId);

        addNews(
          "⚔️ Rivalidad",
          `${ourDriver.name} tiene un nuevo rival: ${rival.name}`,
          `La batalla entre ${ourDriver.name} y ${rival.name} (${rivalTeam?.shortName || ""}) se repite fin de semana tras fin de semana. En el paddock ya hablan de una de las rivalidades más interesantes de la temporada. Cada décima cuenta.`
        );
      }
    }
  }

  // Compañeros de equipo rivales
  teams.forEach((team) => {
    const teamDriversList = drivers.filter((d) => d.teamId === team.id);
    if (teamDriversList.length < 2) return;

    const [d1, d2] = teamDriversList;
    const h1 = driverResultsHistory[d1.id] || [];
    const h2 = driverResultsHistory[d2.id] || [];

    const recent = Math.min(recentRaces, h1.length, h2.length);
    if (recent < 3) return;

    let d1Ahead = 0;
    let d2Ahead = 0;

    for (let r = 0; r < recent; r++) {
      const r1 = h1[r];
      const r2 = h2[r];
      if (!r1 || !r2 || r1.dnf || r2.dnf) continue;
      if (r1.position < r2.position) d1Ahead++;
      else d2Ahead++;
    }

    // Guerra interna — van muy parejos
    if (d1Ahead >= 2 && d2Ahead >= 2 && Math.random() < 0.2) {
      addNews(
        "🔥 Interna",
        `Guerra interna en ${team.shortName}: ${d1.name} vs ${d2.name}`,
        `El box de ${team.name} vive una tensión creciente. ${d1.name} y ${d2.name} están igualados en la batalla interna — ${d1Ahead} vs ${d2Ahead} en las últimas ${recent} carreras. El equipo pide calma pero la competencia es inevitable.`
      );
    }

    // Uno domina al otro claramente
    const dominant   = d1Ahead > d2Ahead ? d1 : d2;
    const dominated  = d1Ahead > d2Ahead ? d2 : d1;
    const dominance  = Math.max(d1Ahead, d2Ahead);

    if (dominance >= 4 && Math.min(d1Ahead, d2Ahead) <= 1 && Math.random() < 0.2) {
      addNews(
        "📊 Interna",
        `${dominant.name} aplasta a su compañero en ${team.shortName}`,
        `Los números no mienten. ${dominant.name} ha superado a ${dominated.name} en ${dominance} de las últimas ${recent} carreras. La jerarquía en ${team.name} parece cada vez más clara, aunque el equipo insiste en dar igualdad de condiciones.`
      );
    }
  });
}

function renderRegulationsModule() {
  if (!regulations) {
    try { regulations = loadJson("regulations.json"); } catch (e) {
      regulations = getDefaultRegulations();
    }
  }

  document.getElementById("regulationsSubtitle").textContent =
    `Temporada ${regulations.season} — Ciclo reglamentario iniciado en ${regulations.governance.currentCycleStart}`;

  renderTechnicalRegulations();
  renderSportingRegulations();
  renderADUOPanel();
  renderGovernancePanel();
}

function renderTechnicalRegulations() {
  const container = document.getElementById("technicalRegulations");
  if (!container) return;

  const t = regulations.technical;

  container.innerHTML = `
    <div style="display:grid; gap:14px;">

      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:8px;">
          TOKENS DE DESARROLLO
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
          ${["aero","chassis","powerUnit"].map((area) => `
            <div style="text-align:center; background:#111;
              border-radius:8px; padding:10px;">
              <div style="color:#666; font-size:11px; margin-bottom:4px;">
                ${translateArea(area)}
              </div>
              <div style="font-size:22px; font-weight:800; color:#2196f3;">
                ${t.developmentTokens[area]}
              </div>
              <div style="color:#666; font-size:11px;">tokens</div>
            </div>
          `).join("")}
        </div>
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:10px;">
          COST CAP
        </div>
        <div style="font-size:20px; font-weight:800; color:#fff;">
          ${formatMoney(t.costCap)}
        </div>
        <div style="color:#666; font-size:12px; margin-top:4px;">
          Límite de gasto anual por equipo
        </div>
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:10px;">
          PESO MÍNIMO
        </div>
        <div style="font-size:20px; font-weight:800; color:#fff;">
          ${t.minWeight} kg
        </div>
        <div style="color:#666; font-size:12px; margin-top:4px;">
          Peso mínimo del coche con piloto
        </div>
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:10px;">
          DRS / SISTEMAS DE ADELANTAMIENTO
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:16px; font-weight:700;
            color:${t.drs.active ? "#4caf50" : "#e10600"};">
            ${t.drs.active ? "✓ Activo" : "✗ Inactivo"}
          </div>
          <div style="color:#aaa; font-size:13px;">
            ${t.drs.active ? `${t.drs.zones} zona${t.drs.zones > 1 ? "s" : ""}` : "-"}
          </div>
        </div>
      </div>

    </div>
  `;
}

function renderSportingRegulations() {
  const container = document.getElementById("sportingRegulations");
  if (!container) return;

  const s = regulations?.sporting;
  if (!s) return;

  const pointsEntries = Object.entries(s.pointsSystem)
    .filter(([k]) => !isNaN(k))
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

  container.innerHTML = `
    <div style="display:grid; gap:14px;">

      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:10px;">
          SISTEMA DE PUNTOS
        </div>
        <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:6px;">
          ${pointsEntries.map(([pos, pts]) => `
            <div style="text-align:center; background:#111;
              border-radius:6px; padding:8px;">
              <div style="color:#666; font-size:10px;">P${pos}</div>
              <div style="font-size:16px; font-weight:800;
                color:${pts > 0 ? "#ffcc00" : "#444"};">
                ${pts}
              </div>
            </div>
          `).join("")}
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr;
          gap:8px; margin-top:10px;">
          <div style="background:#111; border-radius:8px; padding:10px;
            text-align:center;">
            <div style="color:#666; font-size:11px;">Pole Position</div>
            <div style="font-size:18px; font-weight:800;
              color:${s.pointsSystem.pole > 0 ? "#ffcc00" : "#444"};">
              ${s.pointsSystem.pole} pts
            </div>
          </div>
          <div style="background:#111; border-radius:8px; padding:10px;
            text-align:center;">
            <div style="color:#666; font-size:11px;">Vuelta Rápida</div>
            <div style="font-size:18px; font-weight:800;
              color:${s.pointsSystem.fastestLap > 0 ? "#ffcc00" : "#444"};">
              ${s.pointsSystem.fastestLap} pts
            </div>
          </div>
        </div>
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:10px;">
          FORMATO DE CLASIFICACIÓN
        </div>
        <div style="font-size:15px; font-weight:700; color:#fff;">
          ${s.qualifyingFormat === "q1q2q3"
            ? "Q1 / Q2 / Q3 — Formato actual"
            : "Eliminación directa — Formato 2003"}
        </div>
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:10px;">
          SPRINT WEEKENDS
        </div>
        <div style="font-size:15px; font-weight:700;
          color:${s.sprintWeekends ? "#4caf50" : "#e10600"};">
          ${s.sprintWeekends ? "✓ Activados" : "✗ Desactivados"}
        </div>
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:10px;">
          PRETEMPORADA
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div style="background:#111; border-radius:8px; padding:10px;
            text-align:center;">
            <div style="color:#666; font-size:11px;">Circuitos</div>
            <div style="font-size:22px; font-weight:800; color:#fff;">
              ${s.preseason?.circuits || 1}
            </div>
          </div>
          <div style="background:#111; border-radius:8px; padding:10px;
            text-align:center;">
            <div style="color:#666; font-size:11px;">Días totales</div>
            <div style="font-size:22px; font-weight:800; color:#fff;">
              ${s.preseason?.days || 3}
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
}

function renderADUOPanel() {
  const container = document.getElementById("aduoPanel");
  if (!container) return;

  const aduo = regulations.technical.aduo;

  if (!aduo.active) {
    container.innerHTML = `
      <div style="color:#666; font-size:14px; padding:12px;">
        El sistema ADUO está desactivado para esta temporada.
      </div>`;
    return;
  }

  if (!aduoData.measured) {
    const remaining = Math.max(0, aduo.measurementRaces - currentRound);
    container.innerHTML = `
      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:16px; margin-bottom:14px;">
        <div style="color:#aaa; font-size:13px; margin-bottom:8px;">
          Estado: <strong style="color:#ffcc00;">En período de medición</strong>
        </div>
        <div style="color:#666; font-size:13px;">
          Faltan <strong style="color:#fff;">${remaining}</strong> carrera${remaining !== 1 ? "s" : ""} 
          para completar la medición (${currentRound} / ${aduo.measurementRaces}).
        </div>
        <div style="background:#1a1a00; border:1px solid #ffcc00;
          border-radius:8px; padding:10px; margin-top:12px; font-size:12px; color:#aaa;">
          Tras la carrera ${aduo.measurementRaces}, la FIA medirá las diferencias 
          entre fabricantes. Los que superen el ${aduo.threshold1}% de diferencia 
          recibirán 1 mejora. Los que superen el ${aduo.threshold2}% recibirán 2 mejoras.
        </div>
      </div>
    `;
    return;
  }

  const playerManufacturer = selectedTeam?.powerUnit?.manufacturer;

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
      gap:12px; margin-bottom:16px;">
      ${Object.entries(aduoData.allowedUpgrades).map(([manufacturer, data]) => {
        const isPlayer = manufacturer === playerManufacturer;
        const color = data.upgradesAllowed === 0 ? "#4caf50"
          : data.upgradesAllowed === 1 ? "#ffcc00" : "#e10600";

        return `
          <div style="background:${isPlayer ? "#0d1a0d" : "#0a0a0a"};
            border:1px solid ${isPlayer ? "#2d5a2d" : "#1a1a1a"};
            border-radius:10px; padding:14px;">
            <div style="font-size:15px; font-weight:700; margin-bottom:4px;">
              ${manufacturer}
              ${isPlayer ? `<span style="color:#4caf50; font-size:11px;
                margin-left:6px;">TU MOTOR</span>` : ""}
            </div>
            <div style="color:#aaa; font-size:12px; margin-bottom:8px;">
              Score: ${data.combinedScore} · Dif: ${data.diffPct}%
            </div>
            <div style="color:${color}; font-size:13px; font-weight:700;
              margin-bottom:8px;">
              ${data.upgradesAllowed === 0
                ? "✓ Dentro del margen"
                : `${data.upgradesUsed}/${data.upgradesAllowed} mejoras usadas`}
            </div>
            ${isPlayer && data.upgradesAllowed > data.upgradesUsed ? `
              <div style="display:grid; gap:6px; margin-top:8px;">
                <button onclick="applyADUOUpgrade('${manufacturer}', 'power')"
                  style="background:#1a1a00; border:1px solid #ffcc00;
                  color:#ffcc00; border-radius:8px; padding:8px;
                  cursor:pointer; font-size:12px; font-weight:700;">
                  ⚡ MEJORAR POTENCIA
                </button>
                <button onclick="applyADUOUpgrade('${manufacturer}', 'reliability')"
                  style="background:#0a1a0a; border:1px solid #4caf50;
                  color:#4caf50; border-radius:8px; padding:8px;
                  cursor:pointer; font-size:12px; font-weight:700;">
                  🔧 MEJORAR FIABILIDAD
                </button>
              </div>
            ` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderGovernancePanel() {
  const container = document.getElementById("governancePanel");
  if (!container) return;

  const g = regulations.governance;
  const cycleEnd = g.currentCycleStart + g.regulationCycleYears - 1;
  const yearsLeft = cycleEnd - (regulations.season - 1);

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:8px;">
          CICLO REGLAMENTARIO
        </div>
        <div style="font-size:18px; font-weight:800; color:#fff;">
          ${g.currentCycleStart} — ${cycleEnd}
        </div>
        <div style="color:#666; font-size:12px; margin-top:4px;">
          ${yearsLeft} año${yearsLeft !== 1 ? "s" : ""} restante${yearsLeft !== 1 ? "s" : ""} 
          de este ciclo
        </div>
        <div style="background:#1a1a1a; border-radius:20px; height:6px;
          overflow:hidden; margin-top:10px;">
          <div style="width:${Math.round(
            ((regulations.season - g.currentCycleStart) / g.regulationCycleYears) * 100
          )}%; height:100%; background:#ff9800; border-radius:20px;"></div>
        </div>
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a;
        border-radius:10px; padding:14px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:8px;">
          VOTOS PENDIENTES
        </div>
        ${g.pendingVotes.length === 0 ? `
          <div style="color:#666; font-size:13px;">
            No hay propuestas de cambio pendientes.
          </div>
        ` : `
          <div style="color:#ffcc00; font-size:13px; font-weight:700;">
            ${g.pendingVotes.length} propuesta${g.pendingVotes.length > 1 ? "s" : ""} 
            pendiente${g.pendingVotes.length > 1 ? "s" : ""} de votación
          </div>
        `}
      </div>
    </div>
  `;
}

function generateRegulationProposal() {
  if (!regulations) return;
  if (currentRound < 2) return;

  // Chance de propuesta por semana — 15%
  if (Math.random() > 0.15) return;

  // No generar si ya hay una votación activa
  if (regulations.governance.pendingVotes.length > 0) return;

  const proposals = [
    {
      id: "points_fl",
      title: "Punto extra por vuelta rápida",
      description: "La FIA propone otorgar 1 punto adicional al piloto que marque la vuelta rápida de la carrera, siempre que termine entre los 10 primeros.",
      type: "sporting",
      complexity: "simple",
      effect: { path: "sporting.pointsSystem.fastestLap", value: 1 },
      timing: "inseason",
      favoredBy: "top",
    },
    {
      id: "points_pole",
      title: "Punto extra por pole position",
      description: "La FIA propone otorgar 1 punto adicional al piloto que consiga la pole position en clasificación.",
      type: "sporting",
      complexity: "simple",
      effect: { path: "sporting.pointsSystem.pole", value: 1 },
      timing: "inseason",
      favoredBy: "top",
    },
    {
      id: "costcap_reduce",
      title: "Reducción del cost cap a $200M",
      description: "La FIA propone reducir el límite de gasto de $215M a $200M para nivelar la competencia entre equipos grandes y pequeños.",
      type: "technical",
      complexity: "complex",
      effect: { path: "technical.costCap", value: 200000000 },
      timing: "nextseason",
      favoredBy: "small",
    },
    {
      id: "costcap_increase",
      title: "Aumento del cost cap a $230M",
      description: "La FIA propone aumentar el límite de gasto de $215M a $230M para permitir mayor inversión en desarrollo.",
      type: "technical",
      complexity: "complex",
      effect: { path: "technical.costCap", value: 230000000 },
      timing: "nextseason",
      favoredBy: "big",
    },
    {
      id: "tokens_aero_increase",
      title: "Más tokens de desarrollo aerodinámico",
      description: "La FIA propone aumentar de 5 a 7 los tokens de desarrollo aerodinámico disponibles por temporada.",
      type: "technical",
      complexity: "complex",
      effect: { path: "technical.developmentTokens.aero", value: 7 },
      timing: "nextseason",
      favoredBy: "small",
    },
    {
      id: "sprint_activate",
      title: "Activar fines de semana Sprint",
      description: "La FIA propone introducir 6 fines de semana Sprint en el calendario, con carrera corta el sábado y puntos reducidos.",
      type: "sporting",
      complexity: "complex",
      effect: { path: "sporting.sprintWeekends", value: true },
      timing: "nextseason",
      favoredBy: "neutral",
    },
    {
      id: "qualifying_elimination",
      title: "Clasificación por eliminación",
      description: "La FIA propone volver al formato de clasificación por eliminación, donde se elimina un piloto cada 90 segundos.",
      type: "sporting",
      complexity: "complex",
      effect: { path: "sporting.qualifyingFormat", value: "elimination" },
      timing: "nextseason",
      favoredBy: "neutral",
    },
    {
      id: "drs_disable",
      title: "Eliminar el DRS",
      description: "La FIA propone eliminar el DRS para la próxima temporada, confiando en las nuevas especificaciones aerodinámicas para generar adelantamientos.",
      type: "technical",
      complexity: "complex",
      effect: { path: "technical.drs.active", value: false },
      timing: "nextseason",
      favoredBy: "top",
    },
    {
      id: "tokens_chassis_increase",
      title: "Más tokens de desarrollo de chasis",
      description: "La FIA propone aumentar de 4 a 6 los tokens de desarrollo de chasis disponibles por temporada.",
      type: "technical",
      complexity: "complex",
      effect: { path: "technical.developmentTokens.chassis", value: 6 },
      timing: "nextseason",
      favoredBy: "small",
    },
  ];

  // Elegir propuesta aleatoria que no haya sido aprobada ya
  const available = proposals.filter((p) => {
    const current = getRegulationValue(p.effect.path);
    return current !== p.effect.value;
  });

  if (available.length === 0) return;

  const proposal = available[Math.floor(Math.random() * available.length)];

  // Simular votos de la IA
  const votes = simulateAIVotes(proposal);

  regulations.governance.pendingVotes.push({
    ...proposal,
    votes,
    playerVote: null,
    createdAt: currentDate,
  });

  saveCurrentGame();

  addNews(
    "🗳️ Reglamento",
    `La FIA propone: ${proposal.title}`,
    `${proposal.description} Los equipos tienen hasta el próximo Gran Premio para emitir su voto. Se necesitan 8 de 11 votos para aprobar la medida. ${proposal.timing === "inseason" ? "De aprobarse, entraría en vigor de inmediato." : "De aprobarse, se aplicará a partir de la próxima temporada."}`
  );

  // Mostrar modal de votación
  showVotingModal(regulations.governance.pendingVotes[
    regulations.governance.pendingVotes.length - 1
  ]);
}

function getRegulationValue(path) {
  const parts = path.split(".");
  let obj = regulations;
  for (const part of parts) {
    if (obj === undefined) return undefined;
    obj = obj[part];
  }
  return obj;
}

function setRegulationValue(path, value) {
  const parts = path.split(".");
  let obj = regulations;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
}

function simulateAIVotes(proposal) {
  const votes = {};

  teams.forEach((team) => {
    if (team.id === selectedTeam.id) return;

    const isTop    = team.performance.overall >= 90;
    const isSmall  = team.budget < 180000000;
    const hasWeakMotor = team.powerUnit?.overall < 85;

    let votesFor = false;

    switch (proposal.favoredBy) {
      case "top":
        votesFor = isTop ? Math.random() < 0.80 : Math.random() < 0.30;
        break;
      case "small":
        votesFor = isSmall ? Math.random() < 0.85 : Math.random() < 0.25;
        break;
      case "big":
        votesFor = !isSmall ? Math.random() < 0.75 : Math.random() < 0.20;
        break;
      case "neutral":
        votesFor = Math.random() < 0.50;
        break;
    }

    // Lógica específica por propuesta
    if (proposal.id === "costcap_reduce" && isSmall)  votesFor = Math.random() < 0.90;
    if (proposal.id === "costcap_increase" && isTop)  votesFor = Math.random() < 0.85;
    if (proposal.id === "tokens_aero_increase" && isSmall) votesFor = Math.random() < 0.90;
    if (proposal.id === "drs_disable" && isTop) votesFor = Math.random() < 0.70;

    votes[team.id] = votesFor ? "for" : "against";
  });

  return votes;
}

function showVotingModal(proposal) {
  const existing = document.getElementById("votingModal");
  if (existing) existing.remove();

  const ferrariTeam = teams.find((t) => t.concordiaPact?.hasVeto);
  const playerHasVeto = selectedTeam?.concordiaPact?.hasVeto;

  const votesFor     = Object.values(proposal.votes).filter((v) => v === "for").length;
  const votesAgainst = Object.values(proposal.votes).filter((v) => v === "against").length;

  const modal = document.createElement("div");
  modal.id = "votingModal";
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.90); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    overflow-y: auto;
  `;

  modal.innerHTML = `
    <div style="background:#111; border:1px solid #333; border-radius:16px;
      padding:32px; max-width:600px; width:90%; margin: 20px auto;">

      <div style="display:flex; justify-content:space-between; align-items:flex-start;
        margin-bottom:20px;">
        <div>
          <div style="color:#2196f3; font-size:12px; font-weight:700;
            letter-spacing:1px; margin-bottom:6px;">🗳️ PROPUESTA DE LA FIA</div>
          <div style="font-size:20px; font-weight:800; color:#fff;">
            ${proposal.title}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="color:${proposal.timing === "inseason" ? "#ffcc00" : "#aaa"};
            font-size:12px; font-weight:700;">
            ${proposal.timing === "inseason" ? "⚡ EFECTO INMEDIATO" : "📅 PRÓXIMA TEMPORADA"}
          </div>
        </div>
      </div>

      <div style="background:#0a0a0a; border:1px solid #1a1a1a; border-radius:10px;
        padding:14px; margin-bottom:20px; color:#aaa; font-size:13px; line-height:1.6;">
        ${proposal.description}
      </div>

      <!-- Votos de la IA -->
      <div style="margin-bottom:20px;">
        <div style="color:#aaa; font-size:12px; font-weight:700;
          letter-spacing:1px; margin-bottom:12px;">POSICIÓN DE LOS EQUIPOS</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr));
          gap:8px;">
          ${teams.filter((t) => t.id !== selectedTeam.id).map((team) => {
            const vote = proposal.votes[team.id];
            const hasVeto = team.concordiaPact?.hasVeto;
            return `
              <div style="background:#0a0a0a; border:1px solid #1a1a1a;
                border-radius:8px; padding:10px; display:flex;
                justify-content:space-between; align-items:center;">
                <div>
                  <div style="color:${team.color}; font-size:13px; font-weight:700;">
                    ${team.shortName}
                  </div>
                  ${hasVeto ? `<div style="color:#ffcc00; font-size:10px;">VETO</div>` : ""}
                </div>
                <div style="font-size:18px;">
                  ${vote === "for" ? "✅" : "❌"}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Marcador -->
      <div style="background:#0a0a0a; border:1px solid #222; border-radius:10px;
        padding:14px; margin-bottom:20px; text-align:center;">
        <div style="color:#aaa; font-size:12px; margin-bottom:8px;">
          VOTOS ACTUALES (sin tu voto)
        </div>
        <div style="display:flex; justify-content:center; gap:24px;">
          <div>
            <div style="font-size:28px; font-weight:900; color:#4caf50;">${votesFor}</div>
            <div style="color:#aaa; font-size:12px;">A favor</div>
          </div>
          <div style="color:#333; font-size:28px;">|</div>
          <div>
            <div style="font-size:28px; font-weight:900; color:#e10600;">${votesAgainst}</div>
            <div style="color:#aaa; font-size:12px;">En contra</div>
          </div>
        </div>
        <div style="color:#666; font-size:12px; margin-top:8px;">
          Se necesitan 8 de 11 votos para aprobar
        </div>
      </div>

      <!-- Tu voto -->
      <div style="margin-bottom:16px;">
        <div style="color:#fff; font-size:14px; font-weight:700; margin-bottom:12px;">
          Tu voto — ${selectedTeam.shortName}
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <button onclick="castPlayerVote('for')"
            style="background:#0a1a0a; border:2px solid #4caf50; color:#4caf50;
            border-radius:10px; padding:14px; cursor:pointer; font-size:14px;
            font-weight:700; transition:0.2s;"
            onmouseover="this.style.background='#1a3a1a'"
            onmouseout="this.style.background='#0a1a0a'">
            ✅ VOTAR A FAVOR
          </button>
          <button onclick="castPlayerVote('against')"
            style="background:#1a0a0a; border:2px solid #e10600; color:#e10600;
            border-radius:10px; padding:14px; cursor:pointer; font-size:14px;
            font-weight:700; transition:0.2s;"
            onmouseover="this.style.background='#3a1a1a'"
            onmouseout="this.style.background='#1a0a0a'">
            ❌ VOTAR EN CONTRA
          </button>
        </div>
      </div>

      <!-- Veto especial -->
      ${playerHasVeto && !selectedTeam.concordiaPact.vetoUsedThisSeason ? `
        <div style="background:#1a1400; border:1px solid #ffcc00;
          border-radius:10px; padding:14px; margin-bottom:16px;">
          <div style="color:#ffcc00; font-size:13px; font-weight:700; margin-bottom:6px;">
            ⚡ VETO ESPECIAL DISPONIBLE — Pacto de la Concordia
          </div>
          <div style="color:#aaa; font-size:12px; margin-bottom:10px;">
            Como equipo histórico con derechos especiales, podés vetar esta propuesta 
            unilateralmente. Esta acción cancela la votación inmediatamente. 
            Solo podés usarlo una vez por temporada.
          </div>
          <button onclick="useVeto()"
            style="background:#2a2000; border:1px solid #ffcc00; color:#ffcc00;
            border-radius:8px; padding:10px 20px; cursor:pointer;
            font-size:13px; font-weight:700;">
            🚫 USAR VETO ESPECIAL
          </button>
        </div>
      ` : ""}

      <button onclick="closeVotingModal()"
        style="width:100%; background:#1a1a1a; border:1px solid #333;
        color:#666; border-radius:10px; padding:12px; cursor:pointer;
        font-size:13px;">
        DECIDIR MÁS TARDE
      </button>
    </div>
  `;

  document.body.appendChild(modal);
}

function castPlayerVote(vote) {
  if (!regulations.governance.pendingVotes.length) return;

  const proposal = regulations.governance.pendingVotes[0];
  proposal.playerVote = vote;
  proposal.votes[selectedTeam.id] = vote;

  closeVotingModal();
  resolveVote(proposal);
}

function useVeto() {
  if (!selectedTeam.concordiaPact?.hasVeto) return;
  if (selectedTeam.concordiaPact.vetoUsedThisSeason) return;

  selectedTeam.concordiaPact.vetoUsedThisSeason = true;
  syncSelectedTeamWithTeams();

  const proposal = regulations.governance.pendingVotes[0];
  regulations.governance.pendingVotes = [];

  closeVotingModal();

  addNews(
    "🚫 Veto",
    `${selectedTeam.shortName} ejerce su veto especial`,
    `En uso de sus derechos históricos bajo el Pacto de la Concordia, ${selectedTeam.name} ha vetado la propuesta "${proposal.title}". La votación queda cancelada de forma inmediata. ${selectedTeam.shortName} no podrá usar este derecho nuevamente en lo que resta de la temporada.`
  );

  saveCurrentGame();
  alert(`Veto ejercido. La propuesta "${proposal.title}" ha sido cancelada.`);
}

function resolveVote(proposal) {
  const totalVotes   = Object.values(proposal.votes).length;
  const votesFor     = Object.values(proposal.votes).filter((v) => v === "for").length;
  const votesAgainst = Object.values(proposal.votes).filter((v) => v === "against").length;

  // Verificar veto de Ferrari (si no es el jugador)
  const ferrariTeam = teams.find(
    (t) => t.concordiaPact?.hasVeto && t.id !== selectedTeam.id
  );
  if (ferrariTeam && proposal.votes[ferrariTeam.id] === "against") {
    const useFerrariVeto = Math.random() < 0.3;
    if (useFerrariVeto && !ferrariTeam.concordiaPact.vetoUsedThisSeason) {
      ferrariTeam.concordiaPact.vetoUsedThisSeason = true;

      regulations.governance.pendingVotes = regulations.governance.pendingVotes
        .filter((p) => p.id !== proposal.id);

      addNews(
        "🚫 Veto",
        `Ferrari ejerce su veto especial`,
        `La Scuderia Ferrari ha ejercido su derecho de veto histórico bajo el Pacto de la Concordia, bloqueando la propuesta "${proposal.title}". La votación queda cancelada. Ferrari no podrá usar este derecho nuevamente esta temporada.`
      );

      saveCurrentGame();
      return;
    }
  }

  const approved = votesFor >= 8;

  regulations.governance.pendingVotes = regulations.governance.pendingVotes
    .filter((p) => p.id !== proposal.id);

  if (approved) {
    setRegulationValue(proposal.effect.path, proposal.effect.value);

    addNews(
      "✅ Reglamento",
      `Aprobado: ${proposal.title}`,
      `Con ${votesFor} votos a favor y ${votesAgainst} en contra, la propuesta "${proposal.title}" ha sido aprobada. ${proposal.timing === "inseason"
        ? "El cambio entra en vigor de inmediato."
        : "El cambio se aplicará a partir de la próxima temporada."}`
    );

    if (proposal.timing === "inseason") {
      applyRegulationChange(proposal);
    }
  } else {
    addNews(
      "❌ Reglamento",
      `Rechazado: ${proposal.title}`,
      `Con solo ${votesFor} votos a favor (se necesitaban 8), la propuesta "${proposal.title}" no alcanzó la mayoría necesaria y ha sido rechazada.`
    );
  }

  saveCurrentGame();
}

function applyRegulationChange(proposal) {
  // Los cambios ya se aplicaron con setRegulationValue
  // Aquí manejamos efectos secundarios especiales
  if (proposal.id === "costcap_reduce" || proposal.id === "costcap_increase") {
    if (seasonEconomics) {
      seasonEconomics.costCapLimit = proposal.effect.value;
    }
  }
}

function closeVotingModal() {
  const modal = document.getElementById("votingModal");
  if (modal) modal.remove();
}

function evaluateSponsorsEndOfSeason() {
  if (!selectedTeam || sponsors.length === 0) return;

  const teamSponsors   = getTeamSponsors(selectedTeam.id);
  const constructorPos = constructorStandings.findIndex(
    (c) => c.teamId === selectedTeam.id
  ) + 1;
  const totalPoints = constructorStandings.find(
    (c) => c.teamId === selectedTeam.id
  )?.points || 0;

  teamSponsors.forEach((sponsor) => {
    const meetsPosition = constructorPos <= sponsor.requirements.minConstructorPos;
    const meetsPoints   = totalPoints >= sponsor.requirements.minPoints;

    // Si tiene promesa de resultados pendiente — evaluar
    if (sponsor.resultPromise) {
      const racesPlayed = currentRound - sponsor.resultPromise.startRound;
      if (racesPlayed >= 5) {
        if (!meetsPosition || !meetsPoints) {
          loseSponsor(sponsor);
          return;
        } else {
          sponsor.resultPromise = null;
          sponsor.warningCount  = 0;
          addNews(
            "✅ Sponsors",
            `${selectedTeam.shortName} cumple su promesa a ${sponsor.name}`,
            `Los resultados avalan la promesa hecha a ${sponsor.name}. 
            El sponsor renueva su confianza en el proyecto y el contrato 
            continúa en los mismos términos.`
          );
        }
      }
    }

    // Evaluación final de temporada
    if (sponsor.warningCount >= 2 && (!meetsPosition || !meetsPoints)) {
      loseSponsor(sponsor);
    } else if (meetsPosition && meetsPoints) {
      sponsor.warningCount = 0;
      addNews(
        "✅ Sponsors",
        `${sponsor.name} renueva su confianza en ${selectedTeam.shortName}`,
        `Tras una temporada que cumplió los objetivos contractuales, 
        ${sponsor.name} confirma su continuidad con ${selectedTeam.name} 
        para la próxima temporada.`
      );
    }
  });
}

function debugLiveTiming() {
  window.playerTeamId = selectedTeam?.id || teams[0]?.id;
  let season   = null;
  let circuits = [];
  try {
    season   = loadJson("season.json");
    circuits = loadJson("circuits.json");
  } catch (e) {
    alert("Error cargando datos.");
    return;
  }

  if (compounds.length === 0) {
    try { compounds = loadJson("compounds.json"); } catch (e) {}
  }

  // Usar la primera carrera del calendario
  const race    = season.calendar[0];
  const circuit = circuits.find((c) => c.id === race.circuitId);

  currentRaceData = { race, circuit };
  raceWeather     = rollWeather();

  addNews("Debug", "Modo debug activado", "Saltando directamente al Live Timing.");

  openLiveTiming();
}

// ══════════════════════════════════════════════════════════
// LIVE TIMING — MOTOR DE SIMULACIÓN
// ══════════════════════════════════════════════════════════

let ltState = {
  session:      null,   // "qualifying" | "race"
  currentLap:   0,
  totalLaps:    0,
  running:      false,
  speed:        1,
  interval:     null,
  drivers:      [],
  lapData:      [],
  events:       [],
  scActive:     false,
  scLapsLeft:   0,
  weather:      "dry",
  weatherTimeline: [],
  bestSectors:  { s1: Infinity, s2: Infinity, s3: Infinity },
  finished:     false,
};

const LT_BASE_INTERVAL = 800; // ms por vuelta a x1

function initLiveTimingSession(sessionType) {
  if (!currentRaceData) return;

  const { circuit, race } = currentRaceData;

  if (compounds.length === 0) {
    try { compounds = loadJson("compounds.json"); } catch (e) {}
  }

  const weatherTL = generateWeatherTimeline(circuit.laps || 58);

  // Inicializar el motor
  LTE.init(
    sessionType,
    drivers,
    teams,
    circuit,
    race,
    raceWeather || "dry",
    weatherTL,
    compounds,
    practiceData
  );

  // Callbacks
  LTE.onTick = (state, ltDrivers) => {
    ltRenderTable(state, ltDrivers);
    ltUpdateInfoBar(state);
  };

  LTE.onEvent = (text) => {
    ltAddEvent(text);
  };

  LTE.onSCChange = (type) => {
    const el    = document.getElementById("ltSCStatus");
    if (!el) return;
    if (type === "sc") {
      el.textContent = "🟠 SC";
      el.style.color = "#ffcc00";
    } else if (type === "vsc") {
      el.textContent = "🟡 VSC";
      el.style.color = "#ffcc00";
    } else {
      el.textContent = "Clear";
      el.style.color = "#4caf50";
    }
  };

  LTE.onFinish = (state, ltDrivers) => {
    ltRenderTable(state, ltDrivers);
    ltUpdateInfoBar(state);
    ltShowFinishButton(sessionType);
  };

  // Mostrar botón pitwall siempre — se filtra dentro del modal
  const pitwall = document.getElementById("ltPlayerControls");
  if (pitwall) pitwall.style.display = "block";

  // UI
  document.getElementById("ltSessionName").textContent =
    sessionType === "qualifying"
      ? `Clasificación — ${race.name}`
      : `Carrera — ${race.name}`;

  document.getElementById("ltSessionInfo").textContent =
    `${circuit.name} · ${circuit.country} · ${circuit.laps} vueltas`;

  document.getElementById("ltCurrentLap").textContent = "0";
  const ltTotalLapsEl = document.getElementById("ltTotalLaps");
if (ltTotalLapsEl) ltTotalLapsEl.textContent =
    sessionType === "qualifying" ? "Q1/Q2/Q3" : circuit.laps;
  document.getElementById("ltWeather").textContent    = weatherLabel(raceWeather);
  document.getElementById("ltSCStatus").textContent   = "Clear";
  document.getElementById("ltSCStatus").style.color   = "#4caf50";
  document.getElementById("ltSessionType").textContent =
    sessionType === "qualifying" ? "CLASIFICACIÓN" : "CARRERA";

  document.getElementById("ltEventLog").innerHTML =
    `<div style="color:#666; font-size:12px;">
      Sesión lista. Presioná PLAY para comenzar.
    </div>`;

  // Render inicial
  ltRenderTable(LTE.state, LTE.drivers);

  // Botones
  document.getElementById("ltBtnPlay").disabled  = false;
  document.getElementById("ltBtnPause").disabled = true;
}

function ltUpdateInfoBar(state) {
  const lapEl = document.getElementById("ltCurrentLap");
  if (lapEl) {
    if (state.session === "qualifying") {
      let phaseStart = 0;
      let phaseDuration = 1080;
      if (state.phase === "Q2") { phaseStart = 1080; phaseDuration = 900; }
      if (state.phase === "Q3") { phaseStart = 1980; phaseDuration = 720; }
      const timeInPhase = state.currentTime - phaseStart;
      const timeLeft    = Math.max(0, phaseDuration - timeInPhase);
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      lapEl.textContent = `${state.phase} — ${mins}:${secs.toString().padStart(2,"0")}`;

    } else if (state.session === "practice") {
      // Mostrar tiempo restante de la sesión (60 min = 3600s)
      const SESSION_DURATION_SECS = 3600;
      const timeLeft = Math.max(0, SESSION_DURATION_SECS - state.currentTime);
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      lapEl.textContent = `${state.sessionKey || "FP"} — ${mins}:${secs.toString().padStart(2,"0")} restantes`;

    } else {
      const leader = LTE.drivers.find((d) => !d.dnf);
      lapEl.textContent = leader
        ? `Vuelta ${leader.currentLap} / ${state.totalLaps}`
        : "0";
    }
  }

  const weatherEl = document.getElementById("ltWeather");
  if (weatherEl) {
    weatherEl.textContent = weatherLabel(state.weather || "dry");
  }
}

function ltShowFinishButton(sessionType) {
  const log = document.getElementById("ltEventLog");
  if (!log) return;

  const label = sessionType === "qualifying"
    ? "CONTINUAR A LA CARRERA →"
    : "VER RESULTADOS →";

  log.innerHTML += `
    <div style="margin-top:12px; text-align:center;">
      <button class="btn" onclick="ltContinue('${sessionType}')"
        style="padding:12px 32px;">
        ${label}
      </button>
    </div>
  `;
}

function ltPlay() {
  LTE.play();
  document.getElementById("ltBtnPlay").disabled  = true;
  document.getElementById("ltBtnPause").disabled = false;
}

function ltPause() {
  LTE.pause();
  document.getElementById("ltBtnPlay").disabled  = false;
  document.getElementById("ltBtnPause").disabled = true;
}

function ltSetSpeed(speed) {
  LTE.setSpeed(speed);
  ["1","2","5","10","20"].forEach((s) => {
    const btn = document.getElementById(`ltSpeed${s}`);
    if (btn) btn.className = parseInt(s) === speed ? "btn" : "btn btn-secondary";
  });
}

function ltSkipToEnd() {
  ltPause();
  LTE.skipToEnd();
}

function ltExit() {
  LTE.stop();
  showScreen("gameScreen");
}

function ltTick() {
  if (ltState.finished) {
    ltPause();
    return;
  }

  ltState.currentLap++;

  if (ltState.session === "qualifying") {
    ltTickQualifying();
  } else {
    ltTickRace();
  }

  ltRenderTable();

  if (ltState.currentLap >= ltState.totalLaps) {
    ltFinish();
  }
}

function ltTickQualifying() {
  const lap = ltState.currentLap;

  ltState.drivers.forEach((d) => {
    if (d.dnf) return;

    const noise = (Math.random() - 0.5) * 0.8;
    const rubberBonus = ltState.currentLap * 0.003;

    // Calcular sectores
    const baseLap  = d.baseTime - (d.combinedScore / 100) * 9.5 - rubberBonus + noise;
    const s1 = baseLap * 0.28 + (Math.random() - 0.5) * 0.15;
    const s2 = baseLap * 0.38 + (Math.random() - 0.5) * 0.15;
    const s3 = baseLap * 0.34 + (Math.random() - 0.5) * 0.15;
    const lapTime = s1 + s2 + s3;

    d.lastS1 = s1;
    d.lastS2 = s2;
    d.lastS3 = s3;
    d.lastLap = lapTime;

    if (lapTime < d.bestLap) d.bestLap = lapTime;
    if (s1 < d.bestS1) d.bestS1 = s1;
    if (s2 < d.bestS2) d.bestS2 = s2;
    if (s3 < d.bestS3) d.bestS3 = s3;

    if (s1 < ltState.bestSectors.s1) ltState.bestSectors.s1 = s1;
    if (s2 < ltState.bestSectors.s2) ltState.bestSectors.s2 = s2;
    if (s3 < ltState.bestSectors.s3) ltState.bestSectors.s3 = s3;
  });

  // Ordenar por mejor vuelta
  ltState.drivers.sort((a, b) => {
    if (a.bestLap === Infinity) return 1;
    if (b.bestLap === Infinity) return -1;
    return a.bestLap - b.bestLap;
  });

  ltState.drivers.forEach((d, i) => {
    d.position = i + 1;
    d.gap      = i === 0 ? 0 : d.bestLap - ltState.drivers[0].bestLap;
    d.interval = i === 0 ? 0 : d.bestLap - ltState.drivers[i - 1].bestLap;
  });

  // Evento de vuelta rápida
  const leader = ltState.drivers[0];
  if (leader && isFinite(leader.bestLap)) {
    ltAddEvent(`🟣 Vuelta ${lap}: ${leader.driverName} mejora su mejor tiempo — ${formatLapTime(leader.bestLap)}`);
  }
}

function ltTickRace() {
  const lap     = ltState.currentLap;
  const weather = ltState.weatherTimeline[lap - 1] || "dry";

  // Cambio de clima
  if (lap > 1 && weather !== ltState.weatherTimeline[lap - 2]) {
    ltAddEvent(`🌦️ Vuelta ${lap}: Cambio de clima — ${weatherLabel(weather)}`);
    document.getElementById("ltWeather").textContent = weatherLabel(weather);
  }

  // Safety Car aleatorio
  if (!ltState.scActive && Math.random() < 0.04) {
    ltState.scActive   = true;
    ltState.scLapsLeft = 4;
    document.getElementById("ltSCStatus").textContent = "🟠 SC";
    document.getElementById("ltSCStatus").style.color = "#ffcc00";
    ltAddEvent(`🟠 Vuelta ${lap}: Safety Car desplegado`);
  }

  if (ltState.scActive) {
    ltState.scLapsLeft--;
    if (ltState.scLapsLeft <= 0) {
      ltState.scActive = false;
      document.getElementById("ltSCStatus").textContent = "Clear";
      document.getElementById("ltSCStatus").style.color = "#4caf50";
      ltAddEvent(`✅ Vuelta ${lap}: Safety Car retirado — pista despejada`);
    }
  }

  ltState.drivers.forEach((d) => {
    if (d.dnf) return;

    const weatherPen  = getWeatherTimePenalty(weather);
    const stint       = d.stints[d.currentStint] || d.stints[d.stints.length - 1];
    const compoundId  = stint?.compound || "medium";
    const compound    = TYRE_COMPOUNDS[compoundId] || { paceBonus: 0, degradation: 0.03 };
    const tyrePen     = getTyreWeatherPenalty(compoundId, weather);

    d.lapsOnTyre++;

    const carEffect   = (100 - (d.combinedScore * 0.6)) * 0.12;
    const degradation = compound.degradation * d.lapsOnTyre;
    const noise       = Math.random() * 0.15;
    const scBonus     = ltState.scActive ? 5 : 0;

    const lapTime = d.baseTime + carEffect + degradation + noise +
      (compound.paceBonus || 0) + weatherPen + tyrePen + scBonus;

    // Sectores proporcionales
    const s1 = lapTime * 0.28 + (Math.random() - 0.5) * 0.2;
    const s2 = lapTime * 0.38 + (Math.random() - 0.5) * 0.2;
    const s3 = lapTime * 0.34 + (Math.random() - 0.5) * 0.2;

    d.lastS1   = s1;
    d.lastS2   = s2;
    d.lastS3   = s3;
    d.lastLap  = lapTime;
    d.totalTime += lapTime;
    d.lapsCompleted++;
    d.compound = compoundId;

    if (lapTime < d.bestLap) d.bestLap = lapTime;
    if (s1 < d.bestS1) d.bestS1 = s1;
    if (s2 < d.bestS2) d.bestS2 = s2;
    if (s3 < d.bestS3) d.bestS3 = s3;
    if (s1 < ltState.bestSectors.s1) ltState.bestSectors.s1 = s1;
    if (s2 < ltState.bestSectors.s2) ltState.bestSectors.s2 = s2;
    if (s3 < ltState.bestSectors.s3) ltState.bestSectors.s3 = s3;

    // Pit stop
    if (d.pitLaps?.includes(lap)) {
      d.totalTime   += PIT_STOP_LOSS;
      d.pitStops++;
      d.lapsOnTyre   = 0;
      d.currentStint = Math.min(d.currentStint + 1, d.stints.length - 1);
      d.compound     = d.stints[d.currentStint]?.compound || "medium";
      d.inPit        = true;
      ltAddEvent(`🔧 Vuelta ${lap}: ${d.driverName} entra a boxes — ${TYRE_COMPOUNDS[d.compound]?.name || d.compound}`);
    } else {
      d.inPit = false;
    }

    // DNF
    const team = teams.find((t) => t.id === d.teamId);
    const reliability = team?.performance?.reliability || 80;
    const puRel       = team?.powerUnit?.reliability || 80;
    const combined    = reliability * 0.6 + puRel * 0.4;
    const dnfChance   = Math.max(0.001, (100 - combined) / 3200);

    if (Math.random() < dnfChance) {
      d.dnf = true;
      const reasons = ["problema mecánico","accidente","fallo eléctrico","fallo de frenos"];
      const reason  = reasons[Math.floor(Math.random() * reasons.length)];
      ltAddEvent(`🚨 Vuelta ${lap}: ${d.driverName} abandona — ${reason}`);
    }
  });

  // Ordenar por tiempo total
  ltState.drivers.sort((a, b) => {
    if (a.dnf && !b.dnf) return 1;
    if (!a.dnf && b.dnf) return -1;
    return a.totalTime - b.totalTime;
  });

  const leader = ltState.drivers.find((d) => !d.dnf);

  ltState.drivers.forEach((d, i) => {
    d.position = i + 1;
    d.gap      = (!d.dnf && leader) ? d.totalTime - leader.totalTime : null;
    d.interval = i === 0 || !leader ? 0
      : (!d.dnf && !ltState.drivers[i-1]?.dnf)
        ? d.totalTime - ltState.drivers[i-1].totalTime
        : null;
  });

  document.getElementById("ltCurrentLap").textContent = lap;
}

function ltAddEvent(text) {
  const log = document.getElementById("ltEventLog");
  if (!log) return;
  const div = document.createElement("div");
  div.style.cssText = "color:#aaa; font-size:12px; padding:3px 0; border-bottom:1px solid #111;";
  div.textContent   = text;
  log.insertBefore(div, log.firstChild);
}

function ltFinish() {
  ltState.finished = true;
  ltPause();

  document.getElementById("ltBtnPlay").disabled  = true;
  document.getElementById("ltBtnPause").disabled = true;

  ltAddEvent(`🏁 Sesión finalizada`);

  // Mostrar botón de continuar
  const log = document.getElementById("ltEventLog");
  if (log) {
    log.innerHTML += `
      <div style="margin-top:12px; text-align:center;">
        <button class="btn" onclick="ltContinue()"
          style="padding:12px 32px;">
          CONTINUAR →
        </button>
      </div>
    `;
  }
}

function ltContinue() {
  if (ltState.session === "qualifying") {
    // Guardar resultados de clasificación
    qualifyingResults = ltState.drivers.map((d) => ({
      driverId:   d.driverId,
      driverName: d.driverName,
      teamId:     d.teamId,
      teamName:   d.teamName,
      teamColor:  d.teamColor,
      lapTime:    d.bestLap,
      position:   d.position,
    }));

    ltAddEvent("Clasificación completada. Iniciando carrera...");

    setTimeout(() => {
      initLiveTimingSession("race");
      ltPlay();
    }, 1500);

  } else {
    // Guardar resultados de carrera
    const finalResults = ltState.drivers.map((d, i) => ({
      driverId:   d.driverId,
      driverName: d.driverName,
      teamId:     d.teamId,
      teamName:   d.teamName,
      teamColor:  d.teamColor,
      position:   d.position,
      raceTime:   d.totalTime,
      fastestLap: isFinite(d.bestLap) ? d.bestLap : null,
      gap:        d.gap,
      dnf:        d.dnf,
      points:     getPointsForPosition(d.position, d.dnf),
      strategy:   { type: d.stints.map((s) => TYRE_COMPOUNDS[s.compound]?.name || s.compound).join(" → ") },
      pitUnderSC: false,
    }));

    updateStandings(finalResults);
    updateDriverMoralAfterRace(finalResults);
    recordDriverResults(finalResults, currentRaceData.race.name);
    processSponsorRaceBonuses(finalResults);
    evaluateSponsorRequirements();
    processRivalSponsorEvaluation();
    checkMediaPressure();
    generateMarketRumors();
    checkRivalries();
    calculateADUO();
    generateRaceNews(finalResults, finalResults.filter((r) => r.dnf).map((r) => ({
      driver: r.driverName,
      team:   r.teamName,
      lap:    Math.floor(Math.random() * ltState.totalLaps) + 1,
      reason: "abandono",
    })), false);

    saveCurrentGame();
    currentRound = currentRaceData.race.round;
    goToDashboard();
  }
}

function ltOpenPitwall() {
  console.log("Total drivers:", LTE.drivers.length);
  console.log("selectedTeam:", window.selectedTeam?.id, selectedTeam?.id);
  LTE.drivers.forEach(d => console.log(d.driverName, "teamId:", d.teamId, "isPlayer:", d.isPlayer));
  LTE.pause();
  document.getElementById("ltBtnPlay").disabled  = false;
  document.getElementById("ltBtnPause").disabled = true;

  const playerTeam = selectedTeam || window.selectedTeam;
  const playerDrivers = LTE.drivers.filter((d) => d.teamId === playerTeam?.id);
  const circuit = LTE.state.circuit;
  const circuitCompounds = circuit?.compounds || ["C3","C4","C5"];
  const isRace = LTE.state.session === "race";

  const existing = document.getElementById("pitwallModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "pitwallModal";
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.92); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    overflow-y: auto;
  `;

  const softCompound   = circuitCompounds[0];
  const mediumCompound = circuitCompounds[1];
  const hardCompound   = circuitCompounds[2];

  const getCompoundLabel = (c) => {
    if (c === softCompound   || c === "soft")         return { label: "B", bg: "#e10600", color: "#fff" };
    if (c === mediumCompound || c === "medium")        return { label: "M", bg: "#ffcc00", color: "#000" };
    if (c === hardCompound   || c === "hard")          return { label: "D", bg: "#ffffff", color: "#000" };
    if (c === "intermediate")                          return { label: "I", bg: "#4caf50", color: "#000" };
    if (c === "wet")                                   return { label: "W", bg: "#2196f3", color: "#000" };
    return { label: c, bg: "#666", color: "#fff" };
  };

  const compoundLabels = {
    soft: "Blando", medium: "Medio", hard: "Duro",
    intermediate: "Intermedio", wet: "Lluvia",
    C1: "C1", C2: "C2", C3: "C3", C4: "C4", C5: "C5",
  };

  const compoundColors = {
    soft: "#e10600", medium: "#ffcc00", hard: "#ffffff",
    intermediate: "#4caf50", wet: "#2196f3",
    C1: "#ff4444", C2: "#ff4444", C3: "#e10600",
    C4: "#ffcc00", C5: "#ffffff",
  };

  modal.innerHTML = `
  <div style="background:#111; border:1px solid #333; border-radius:16px;
    padding:20px; width:95vw; max-width:1100px; max-height:90vh;
    overflow-y:auto; margin:auto;">

    <!-- Header -->
    <div style="display:flex; justify-content:space-between; align-items:center;
      margin-bottom:16px;">
      <div>
        <div style="color:#ffcc00; font-size:11px; font-weight:700;
          letter-spacing:1px;">🎙️ PITWALL</div>
        <div style="font-size:16px; font-weight:800; color:#fff; margin-top:2px;">
          ${LTE.state.race?.name || ""} — ${LTE.state.session?.toUpperCase() || ""}
        </div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        ${LTE.state.session === "practice" ? `
          <button onclick="ltClosePitwall(false); openSetupMenu();"
            style="background:#1a0800; border:1px solid ${getUnreadFeedbackCount() > 0 ? '#ffcc00' : '#333'};
            color:${getUnreadFeedbackCount() > 0 ? '#ffcc00' : '#666'};
            border-radius:8px; padding:8px 16px; cursor:pointer; font-size:12px;
            font-weight:700; position:relative;">
            🔧 REGLAJES
            ${getUnreadFeedbackCount() > 0 ? `
              <span style="position:absolute; top:-6px; right:-6px;
                background:#e10600; color:#fff; font-size:10px;
                font-weight:800; padding:2px 5px; border-radius:10px;">
                ${getUnreadFeedbackCount()}
              </span>` : ""}
          </button>
        ` : ""}
        <button onclick="ltClosePitwall(false)"
          style="background:#1a1a1a; border:1px solid #333; color:#aaa;
          border-radius:8px; padding:8px 16px; cursor:pointer; font-size:12px;">
          CANCELAR
        </button>
        <button onclick="ltClosePitwall(true)"
          style="background:#e10600; border:none; color:#fff;
          border-radius:8px; padding:8px 16px; cursor:pointer; font-size:13px;
          font-weight:700;">
          ✅ CONFIRMAR
        </button>
      </div>
    </div>

    ${LTE.state.session === "practice" ? `
    <!-- Tabla de neumáticos — ancho completo -->
    <div style="margin-bottom:16px; background:#0a0a0a; border:1px solid #1a1a1a;
      border-radius:10px; padding:10px;">
      <div style="color:#555; font-size:10px; font-weight:700; letter-spacing:1px;
        margin-bottom:8px;">ESTADO DE NEUMÁTICOS — TODA LA PARRILLA</div>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:11px;">
          <thead>
            <tr style="color:#444; border-bottom:1px solid #1a1a1a;">
              <th style="padding:3px 6px; text-align:left;">PILOTO</th>
              <th style="padding:3px 6px; text-align:left;">EQ.</th>
              <th style="padding:3px 6px; text-align:center;">COMP.</th>
              <th style="padding:3px 6px; text-align:center;">STINT</th>
              <th style="padding:3px 6px; text-align:center; color:#e10600;">B</th>
              <th style="padding:3px 6px; text-align:center; color:#ffcc00;">M</th>
              <th style="padding:3px 6px; text-align:center; color:#fff;">D</th>
              <th style="padding:3px 6px; text-align:center;">PITS</th>
            </tr>
          </thead>
          <tbody>
            ${[...LTE.drivers]
              .sort((a, b) => a.position - b.position)
              .map((d) => {
                const inv     = window.practicetyreInventory || {};
                const circuit = LTE.state.circuit;
                const avail   = circuit?.compoundsAvailable || ["soft","medium","hard"];
                const getSets = (cId) => typeof getAvailableTyreSets === "function"
                  ? getAvailableTyreSets(inv, d.driverId, cId)
                  : { new:[], used:[] };

                const sSets = getSets(avail[0]);
                const mSets = getSets(avail[1]);
                const hSets = getSets(avail[2]);

                const renderSets = (sets, color) => {
                  if (sets.new.length === 0 && sets.used.length === 0)
                    return `<span style="color:#2a2a2a;">—</span>`;
                  let html = "";
                  if (sets.new.length > 0)
                    html += `<span style="color:${color}; font-weight:700;">${sets.new.length}N</span>`;
                  if (sets.used.length > 0)
                    html += `<span style="color:#888; margin-left:3px;">${sets.used.length}U</span>`;
                  return html;
                };

                const c       = d.compound?.toLowerCase();
                const avail0  = avail[0]?.toLowerCase();
                const avail1  = avail[1]?.toLowerCase();
                const isSoft  = c === avail0 || c === "soft";
                const isMed   = c === avail1 || c === "medium";
                const baseCol = isSoft ? "#e10600" : isMed ? "#ffcc00" : "#fff";
                const lbl     = isSoft ? "B" : isMed ? "M" : "D";
                const isNew   = d._tyreIsNew !== false;
                const bg      = isNew ? baseCol : "#0a0a0a";
                const col     = isNew ? "#000" : baseCol;
                const brd     = isNew ? "none" : `1px solid ${baseCol}`;

                return `
                  <tr style="border-bottom:1px solid #0d0d0d;
                    background:${d.isPlayer ? "rgba(76,175,80,0.06)" : "transparent"}">
                    <td style="padding:3px 6px; color:${d.isPlayer ? "#4caf50" : "#ccc"};
                      font-weight:${d.isPlayer ? "700" : "400"};">
                      ${d.driverName.split(" ").pop()}
                      ${d.isPlayer ? "★" : ""}
                    </td>
                    <td style="padding:3px 6px; color:${d.teamColor}; font-size:10px;">
                      ${d.teamName}
                    </td>
                    <td style="padding:3px 6px; text-align:center;">
                      ${d.inPit ? `<span style="color:#ffcc00; font-size:9px;">BOX</span>` : `
                        <span style="background:${bg}; color:${col}; border:${brd};
                          font-size:9px; font-weight:800; padding:1px 4px; border-radius:2px;">
                          ${lbl}
                        </span>`}
                    </td>
                    <td style="padding:3px 6px; text-align:center; color:#666;">
                      ${d.inPit ? "-" : d.lapsOnTyre || 0}
                    </td>
                    <td style="padding:3px 6px; text-align:center;">
                      ${renderSets(sSets, "#e10600")}
                    </td>
                    <td style="padding:3px 6px; text-align:center;">
                      ${renderSets(mSets, "#ffcc00")}
                    </td>
                    <td style="padding:3px 6px; text-align:center;">
                      ${renderSets(hSets, "#fff")}
                    </td>
                    <td style="padding:3px 6px; text-align:center; color:#666;">
                      ${d.pitStops || 0}
                    </td>
                  </tr>
                `;
              }).join("")}
          </tbody>
        </table>
      </div>
    </div>
    ` : ""}

    <!-- Pilotos del jugador — horizontal -->
    <div style="display:grid; grid-template-columns:${playerDrivers.length > 1 ? "1fr 1fr" : "1fr"}; gap:14px;">
      ${playerDrivers.map((d) => {
        const dId      = d.driverId;
        const nextPlan = d._practicePrograms?.[d._practiceProgramIdx];
        const prog     = nextPlan ? WORK_PROGRAMS.find((p) => p.id === nextPlan.programId) : null;
        const total    = d._practicePrograms?.length || 0;
        const idx      = d._practiceProgramIdx || 0;
        const inv      = window.practicetyreInventory || {};
        const circuit  = LTE.state.circuit;
        const avail    = circuit?.compoundsAvailable || ["soft","medium","hard"];
        const isRace   = LTE.state.session === "race";

        return `
          <div style="background:#0a0a0a; border:1px solid #222; border-radius:12px; padding:14px;">

            <!-- Piloto header -->
            <div style="display:flex; justify-content:space-between; align-items:center;
              margin-bottom:12px;">
              <div>
                <div style="font-size:15px; font-weight:800; color:#4caf50;">
                  #${d.driverNumber} ${d.driverName}
                </div>
                <div style="color:#aaa; font-size:11px; margin-top:2px;">
                  P${d.position} · ${d.inPit ? "EN BOXES" : "EN PISTA"} · Vuelta ${d.currentLap}
                  ${isRace ? `· 🔋 ${Math.round(d.battery)}% · ⛽ ${Math.round(d.fuel)}%` : ""}
                </div>
              </div>
              <div style="text-align:right; font-size:11px; color:#aaa;">
                Compuesto actual<br>
                <strong style="color:#fff; font-size:13px;">
                  ${(compounds.find((c) => c.id === d.compound)?.name || d.compound)}
                  (${d.lapsOnTyre} vts.)
                </strong>
              </div>
            </div>

            <!-- Grid interno: programa | modos -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">

              <!-- Programa / Boxes -->
              <div style="background:#111; border-radius:8px; padding:10px;">
                <div style="color:#555; font-size:10px; font-weight:700;
                  margin-bottom:8px;">
                  ${LTE.state.session === "practice" ? "PROGRAMA" : "BOXES"}
                </div>

                ${LTE.state.session === "practice" ? (() => {
                  if (!prog) return `
                    <div style="color:#444; font-size:12px; margin-bottom:8px;">
                      Sin programas pendientes.
                    </div>
                    <button onclick="ltAddProgramFromPitwall(${dId})"
                      style="width:100%; background:#0a0a1a; border:1px solid #2196f3;
                      color:#2196f3; border-radius:6px; padding:8px; cursor:pointer;
                      font-size:11px; font-weight:700;">
                      + AGREGAR PROGRAMA
                    </button>
                  `;

                  return `
                    <div style="background:#0d0d0d; border:1px solid #1a1a1a;
                      border-radius:6px; padding:8px; margin-bottom:8px;">
                      <div style="color:#ffcc00; font-size:10px; margin-bottom:3px;">
                        ${idx + 1}/${total} — ${prog.icon} ${prog.name}
                      </div>
                      <div style="color:#aaa; font-size:11px;">
                        ${nextPlan.laps} vts
                      </div>
                      <div style="background:#1a1a1a; border-radius:10px; height:3px;
                        overflow:hidden; margin-top:6px;">
                        <div style="width:${Math.min(100,((d._practiceLapsDone||0)/nextPlan.laps)*100)}%;
                          height:100%; background:#e10600;"></div>
                      </div>
                      <div style="color:#555; font-size:10px; margin-top:3px;">
                        ${d._practiceLapsDone||0} / ${nextPlan.laps} vueltas
                      </div>
                    </div>

                    ${d.inPit ? `
                      <div style="color:#555; font-size:10px; font-weight:700;
                        margin-bottom:6px;">ELEGIR NEUMÁTICO</div>
                      ${avail.map((cId) => {
                        const c      = compounds.find((comp) => comp.id === cId);
                        const sets   = typeof getAvailableTyreSets === "function"
                          ? getAvailableTyreSets(inv, dId, cId)
                          : { new:[], used:[] };
                        if (sets.new.length === 0 && sets.used.length === 0) return "";
                        return `
                          <div style="display:flex; gap:4px; margin-bottom:4px; align-items:center;">
                            <span style="color:${c?.color||'#aaa'}; font-size:10px;
                              font-weight:700; min-width:42px;">${c?.name||cId}</span>
                            ${sets.new.length > 0 ? `
                              <button onclick="ltPitwallSendOut('${dId}','${cId}',true)"
                                style="background:#0a1a0a; border:1px solid #4caf50; color:#4caf50;
                                border-radius:4px; padding:2px 8px; cursor:pointer; font-size:10px;
                                font-weight:700;">NUEVO ×${sets.new.length}</button>
                            ` : ""}
                            ${sets.used.length > 0 ? `
                              <button onclick="ltPitwallSendOut('${dId}','${cId}',false)"
                                style="background:#1a1200; border:1px solid #ffcc00; color:#ffcc00;
                                border-radius:4px; padding:2px 8px; cursor:pointer; font-size:10px;
                                font-weight:700;">USADO ×${sets.used.length}</button>
                            ` : ""}
                          </div>
                        `;
                      }).join("")}
                    ` : `
                      <div style="color:#4caf50; font-size:11px; text-align:center; padding:6px;">
                        ✓ En pista
                      </div>
                    `}

                    ${(d._practicePrograms?.slice(idx+1, idx+3)||[]).map((p,i) => {
                      const pp = WORK_PROGRAMS.find((wp) => wp.id === p.programId);
                      return `<div style="color:#333; font-size:10px; margin-top:4px;">
                        ${idx+i+2}. ${pp?.icon||""} ${pp?.name||p.programId} (${p.laps} vts)
                      </div>`;
                    }).join("")}
                  `;
                })() : d.inPit ? `
                  <div style="display:grid; gap:4px;">
                    ${avail.map((c) => {
                      const cl = (() => {
                        const isSoft = c === avail[0] || c === "soft";
                        const isMed  = c === avail[1] || c === "medium";
                        const bg_    = isSoft ? "#e10600" : isMed ? "#ffcc00" : "#ffffff";
                        return { bg: bg_, color: "#000", label: isSoft ? "B" : isMed ? "M" : "D" };
                      })();
                      return `
                        <button onclick="ltPitwallAction('${dId}','send_out','${c}')"
                          style="background:#0a0a0a; border:1px solid #333; color:#fff;
                          border-radius:5px; padding:5px 8px; cursor:pointer; font-size:10px;
                          display:flex; align-items:center; gap:5px;">
                          <span style="background:${cl.bg}; color:${cl.color}; font-size:8px;
                            font-weight:800; padding:1px 4px; border-radius:2px;">
                            ${cl.label}
                          </span>
                          ${c}
                        </button>`;
                    }).join("")}
                  </div>
                ` : `
                  <button onclick="ltPitwallAction('${dId}','pit_in',null)"
                    style="width:100%; background:#1a0a0a; border:1px solid #e10600;
                    color:#e10600; border-radius:6px; padding:8px; cursor:pointer;
                    font-size:11px; font-weight:700;">
                    📞 LLAMAR A BOXES
                  </button>
                `}
              </div>

              <!-- Modos ERS / Combustible -->
              <div style="background:#111; border-radius:8px; padding:10px;">
                <div style="color:#555; font-size:10px; font-weight:700; margin-bottom:8px;">
                  MODOS
                </div>
                <div style="color:#444; font-size:10px; margin-bottom:4px;">ERS</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:3px; margin-bottom:8px;">
                  ${["recarga","neutral","boost","overtake","qualy"].map((mode) => `
                    <button onclick="ltPitwallAction('${dId}','ers','${mode}')"
                      style="background:${d.ersMode===mode?"#1a1a00":"#0a0a0a"};
                      border:1px solid ${d.ersMode===mode?"#ffcc00":"#222"};
                      color:${d.ersMode===mode?"#ffcc00":"#555"};
                      border-radius:4px; padding:4px; cursor:pointer; font-size:9px;
                      font-weight:700; text-transform:uppercase;">${mode}</button>
                  `).join("")}
                </div>
                ${isRace ? `
                  <div style="color:#444; font-size:10px; margin-bottom:4px;">COMBUSTIBLE</div>
                  <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:3px;">
                    ${["ahorro","neutral","push"].map((mode) => `
                      <button onclick="ltPitwallAction('${dId}','fuel','${mode}')"
                        style="background:${d.fuelMode===mode?"#1a1a00":"#0a0a0a"};
                        border:1px solid ${d.fuelMode===mode?"#ffcc00":"#222"};
                        color:${d.fuelMode===mode?"#ffcc00":"#555"};
                        border-radius:4px; padding:4px; cursor:pointer; font-size:9px;
                        font-weight:700; text-transform:uppercase;">${mode}</button>
                    `).join("")}
                  </div>
                ` : ""}
              </div>

            </div>
          </div>
        `;
      }).join("")}
    </div>

  </div>
`;
  document.body.appendChild(modal);
}

function ltPitwallAction(driverId, action, value) {
  const driver = LTE.drivers.find((d) => d.driverId === parseInt(driverId));
  if (!driver) return;

  if (action === "pit_in") {
    driver.pitCallPending = true;
    LTE._addEvent(`📞 ${driver.driverName} — orden de boxes recibida`);
  }

  if (action === "send_out") {
  const nextPlan = driver._practicePrograms?.[driver._practiceProgramIdx];

  driver.inPit           = false;
  driver.pitTimeLeft     = 0;
  driver.awaitingPitwall = false;
  driver.compound        = value || nextPlan?.compound || driver.compound;
  driver.lapsOnTyre      = 0;
  driver.lapPhase        = "outlap";
  driver.lapPhaseCount   = 0;
  driver.timeInSector    = 0;
  driver.timeInLap       = 0;
  driver.currentSector   = 1;
  driver.curS1           = null;
  driver.curS2           = null;

  if (LTE.state.session === "practice" && nextPlan) {
    const prog = WORK_PROGRAMS.find((p) => p.id === nextPlan.programId);
    if (prog) {
      LTE._addEvent(
        `🟢 ${driver.driverName} sale a pista — ${prog.icon} ${prog.name} ` +
        `(${nextPlan.laps} vts)`
      );
    }
  }
}

  if (action === "ers") {
    driver.ersMode = value;
  }

  if (action === "fuel") {
    driver.fuelMode = value;
  }

  // Refrescar el modal
  ltOpenPitwall();
}

function ltClosePitwall(resume) {
  const modal = document.getElementById("pitwallModal");
  if (modal) modal.remove();

  if (resume) {
    LTE.play();
    document.getElementById("ltBtnPlay").disabled  = true;
    document.getElementById("ltBtnPause").disabled = false;
  }
}

function ltRenderTable(state, ltDrivers) {
  const tbody = document.getElementById("ltTableBody");
  if (!tbody || !ltDrivers) return;

  const compoundColors = {
    soft:         "#e10600",
    medium:       "#ffcc00",
    hard:         "#ffffff",
    intermediate: "#4caf50",
    wet:          "#2196f3",
  };

  // Ordenar por posición
  const sorted = [...ltDrivers].sort((a, b) => a.position - b.position);

  tbody.innerHTML = sorted.map((d) => {
    const isPlayer = d.isPlayer;

    const s1Color = d.lastS1
      ? (d.lastS1 <= state.bestSectors.s1 + 0.001 ? "#b44cff"
        : d.lastS1 <= d.bestS1 + 0.001 ? "#4caf50" : "#ffcc00")
      : "#444";

    const s2Color = d.lastS2
      ? (d.lastS2 <= state.bestSectors.s2 + 0.001 ? "#b44cff"
        : d.lastS2 <= d.bestS2 + 0.001 ? "#4caf50" : "#ffcc00")
      : "#444";

    const s3Color = d.lastS3
      ? (d.lastS3 <= state.bestSectors.s3 + 0.001 ? "#b44cff"
        : d.lastS3 <= d.bestS3 + 0.001 ? "#4caf50" : "#ffcc00")
      : "#444";

    // Gap display
    let gapText = "-";
    if (state.session === "qualifying") {
      gapText = d.position === 1 ? "-"
        : d.qualifyingBestLap === Infinity ? "-"
        : "+" + LTE._fmt(d.gap);
    } else {
      if (d.dnf) gapText = "DNF";
      else if (d.position === 1) gapText = "Líder";
      else if (typeof d.gap === "string") gapText = d.gap;
      else if (d.gap !== null && d.gap !== undefined)
        gapText = "+" + LTE._fmt(d.gap);
    }

    // Intervalo
    const intText = d.position === 1 ? "-"
      : d.interval !== null && typeof d.interval === "number"
        ? "+" + LTE._fmt(d.interval) : "-";

    // Mejor vuelta display
    const bestLapDisplay = state.session === "qualifying"
      ? (isFinite(d.qualifyingBestLap) ? LTE._fmt(d.qualifyingBestLap) : "-")
      : (isFinite(d.bestLap) ? LTE._fmt(d.bestLap) : "-");

    const compColor = compoundColors[d.compound] || "#aaa";

    // Sector en curso — mostrar tiempo parcial
    const curS1Display = d.curS1 ? d.curS1.toFixed(3)
      : d.currentSector === 1 && d.timeInSector > 0
        ? `<span style="color:#888;">${d.timeInSector.toFixed(0)}…</span>`
        : "-";

    const curS2Display = d.curS2 ? d.curS2.toFixed(3)
      : d.currentSector === 2 && d.timeInSector > 0
        ? `<span style="color:#888;">${d.timeInSector.toFixed(0)}…</span>`
        : "-";

    const curS3Display = d.currentSector === 3 && d.timeInSector > 0
      ? `<span style="color:#888;">${d.timeInSector.toFixed(0)}…</span>`
      : (d.lastS3 ? d.lastS3.toFixed(3) : "-");

return `
      <tr style="
        background:${isPlayer ? "#0d1a0d" : d.inPit ? "#1a1400" : "transparent"};
        border-bottom:1px solid #0d0d0d;
        ${d.dnf || d.eliminated ? "opacity:0.4;" : ""}
      ">
        <td style="padding:6px 4px; font-weight:800; color:#fff; font-size:13px; width:32px;">
          ${d.eliminated ? "OUT" : d.dnf ? "DNF" : d.position}
        </td>
        <td style="padding:6px 4px; white-space:nowrap;">
          <span style="color:#555; font-size:10px; margin-right:3px;">#${d.driverNumber}</span>
          <strong style="color:${isPlayer ? "#4caf50" : "#fff"}; font-size:12px;">${d.driverName}</strong>
          ${d.inPit ? `<span style="background:#2a2000; color:#ffcc00; font-size:9px;
            margin-left:4px; padding:1px 4px; border-radius:3px;">
            ${d.lapPhase === "outlap" ? "OUT" : d.lapPhase === "inlap" ? "IN" : "PIT"}
          </span>` : ""}
        </td>
        <td style="padding:6px 4px; color:${d.teamColor}; font-size:11px; white-space:nowrap;">${d.teamName}</td>
        <td style="padding:6px 4px; text-align:right; color:#fff; font-size:12px; white-space:nowrap;">${intText}</td>
        <td style="padding:6px 4px; text-align:right; color:#aaa; font-size:11px; white-space:nowrap;">${gapText}</td>

        <td style="padding:6px 4px; text-align:center; min-width:52px;">
          <div style="color:${s1Color}; font-size:11px; font-weight:700;">
            ${d.curS1 ? d.curS1.toFixed(3)
              : d.currentSector === 1 && d.timeInSector > 0
                ? `<span style="color:#555;">${Math.floor(d.timeInSector)}…</span>`
                : d.prevS1 ? `<span style="color:#444;">${d.prevS1.toFixed(3)}</span>`
                : "-"}
          </div>
        </td>

        <td style="padding:6px 4px; text-align:center; min-width:52px;">
          <div style="color:${s2Color}; font-size:11px; font-weight:700;">
            ${d.curS2 ? d.curS2.toFixed(3)
              : d.currentSector === 2 && d.timeInSector > 0
                ? `<span style="color:#555;">${Math.floor(d.timeInSector)}…</span>`
                : d.prevS2 ? `<span style="color:#444;">${d.prevS2.toFixed(3)}</span>`
                : "-"}
          </div>
        </td>

        <td style="padding:6px 4px; text-align:center; min-width:52px;">
          <div style="color:${s3Color}; font-size:11px; font-weight:700;">
            ${d.currentSector === 3 && d.timeInSector > 0
              ? `<span style="color:#555;">${Math.floor(d.timeInSector)}…</span>`
              : d.lastS3 ? d.lastS3.toFixed(3)
              : d.prevS3 ? `<span style="color:#444;">${d.prevS3.toFixed(3)}</span>`
              : "-"}
          </div>
        </td>

        <td style="padding:6px 4px; text-align:right; color:#fff; font-size:12px; white-space:nowrap;">${bestLapDisplay}</td>
        <td style="padding:6px 4px; text-align:right; color:#aaa; font-size:11px; white-space:nowrap;">${d.lastLap ? LTE._fmt(d.lastLap) : "-"}</td>

        <td style="padding:6px 4px; text-align:center; min-width:52px;">
          <div style="color:${isFinite(d.bestS1) ? (d.bestS1 <= LTE.state.bestSectors.s1 + 0.001 ? "#b44cff" : "#4caf50") : "#444"}; font-size:11px; font-weight:700;">
            ${isFinite(d.bestS1) ? d.bestS1.toFixed(3) : "-"}
          </div>
        </td>

        <td style="padding:6px 4px; text-align:center; min-width:52px;">
          <div style="color:${isFinite(d.bestS2) ? (d.bestS2 <= LTE.state.bestSectors.s2 + 0.001 ? "#b44cff" : "#4caf50") : "#444"}; font-size:11px; font-weight:700;">
            ${isFinite(d.bestS2) ? d.bestS2.toFixed(3) : "-"}
          </div>
        </td>

        <td style="padding:6px 4px; text-align:center; min-width:52px;">
          <div style="color:${isFinite(d.bestS3) ? (d.bestS3 <= LTE.state.bestSectors.s3 + 0.001 ? "#b44cff" : "#4caf50") : "#444"}; font-size:11px; font-weight:700;">
            ${isFinite(d.bestS3) ? d.bestS3.toFixed(3) : "-"}
          </div>
        </td>

        <td style="padding:6px 4px; text-align:center;">
  ${(() => {
    const circuitCompounds = LTE.state.circuit?.compounds || ["C3","C4","C5"];
    const c      = d.compound?.toLowerCase();
    const softId   = circuitCompounds[0]?.toLowerCase();
    const mediumId = circuitCompounds[1]?.toLowerCase();
    const hardId   = circuitCompounds[2]?.toLowerCase();

    const isSoft   = c === softId   || c === "soft";
    const isMedium = c === mediumId || c === "medium";
    const isHard   = c === hardId   || c === "hard";
    const isInter  = c === "intermediate";
    const isWet    = c === "wet";

    const baseColor = isSoft ? "#e10600" : isMedium ? "#ffcc00" : isHard ? "#ffffff"
      : isInter ? "#4caf50" : isWet ? "#2196f3" : "#666";
    const label = isSoft ? "B" : isMedium ? "M" : isHard ? "D"
      : isInter ? "I" : isWet ? "W" : "?";

    // Nuevo: fondo color, letra negra. Usado: fondo negro, borde color, letra color
    const isNew   = d._tyreIsNew !== false; // default new
    const bg      = isNew ? baseColor : "#0a0a0a";
    const color   = isNew ? "#000" : baseColor;
    const border  = isNew ? "none" : `1px solid ${baseColor}`;

    return `<span style="
      background:${bg}; color:${color};
      border:${border};
      font-size:10px; font-weight:800;
      padding:2px 5px; border-radius:3px;
      display:inline-block; min-width:16px; text-align:center;">
      ${label}
    </span>`;
  })()}
</td>
        <td style="padding:6px 4px; text-align:center; color:#aaa; font-size:12px;">
  ${LTE.state.session === "practice"
    ? (d._totalPracticeLaps || 0)
    : (d.lapsOnTyre > 0 ? d.lapsOnTyre : "-")}
</td>
        <td style="padding:6px 4px; text-align:center; color:#aaa; font-size:12px;">${d.pitStops > 0 ? d.pitStops : "-"}</td>
      </tr>
    `;
  }).join("");
}

function openLiveTiming() {
  if (!currentRaceData) return;
  showScreen("liveTimingScreen");
  initLiveTimingSession("qualifying");
}

// ═══════════════════════════════════════════════════════════
//  LIVE TIMING — UI de prácticas
// ═══════════════════════════════════════════════════════════

function showLiveTimingScreen(session) {
  const title = document.getElementById("practiceTimingTitle");
  if (title) title.textContent = `${session} — Live Timing`;

  const subtitle = document.getElementById("practiceTimingSubtitle");
  if (subtitle && practiceData) {
    subtitle.textContent = `${practiceData.circuit.name} · ${practiceData.race.name}`;
  }

  const log = document.getElementById("practiceTimingLog");
  if (log) log.innerHTML = "";

  updateLapProgress(0, PRACTICE_CONFIG.LAPS_PER_SESSION);
  showScreen("practiceTimingScreen");
}

function hideLiveTimingScreen() {
  showScreen("practiceScreen");
}

function renderLiveTiming(state) {
  // Barra de progreso
  updateLapProgress(state.currentLap, state.totalLaps);

  // Tabla de tiempos
  renderTimingTable(state.drivers);

  // Log de eventos (últimas entradas)
  renderTimingLog(state.lapLog);
}

function updateLapProgress(current, total) {
  const bar   = document.getElementById("practiceProgressBar");
  const label = document.getElementById("practiceProgressLabel");
  if (bar)   bar.style.width = `${(current / total) * 100}%`;
  if (label) label.textContent = `Vuelta ${current} / ${total}`;
}

function renderTimingTable(drivers) {
  const tbody = document.getElementById("practiceTimingBody");
  if (!tbody) return;

  // Ordenar por mejor vuelta
  const sorted = [...drivers].sort((a, b) => {
    if (!a.bestLap) return 1;
    if (!b.bestLap) return -1;
    return a.bestLap - b.bestLap;
  });

  tbody.innerHTML = sorted.map((driver, idx) => {
    const pos        = idx + 1;
    const bestLap    = driver.bestLap ? _formatTime(driver.bestLap) : "--:--.---";
    const lastLap    = driver.lastLap ? _formatTime(driver.lastLap) : "--:--.---";
    const gap        = driver.gap != null ? (driver.gap === 0 ? "LIDER" : `+${driver.gap.toFixed(3)}`) : "---";
    const confidence = driver.confidence || 0;
    const tyre       = _tyreIcon(driver.currentTyre);
    const status     = driver.hasProblem ? "⚠️ BOX" : `${driver.lapsCompleted} vlts`;
    const program    = driver.program ? driver.program.icon : "—";
    const rowClass   = driver.hasProblem ? "lt-row lt-problem"
                     : pos === 1        ? "lt-row lt-leader"
                     : "lt-row";

    return `
      <tr class="${rowClass}">
        <td class="lt-pos">${pos}</td>
        <td class="lt-driver">${program} ${driver.name}</td>
        <td class="lt-best">${bestLap}</td>
        <td class="lt-last">${lastLap}</td>
        <td class="lt-gap">${gap}</td>
        <td class="lt-tyre">${tyre}</td>
        <td class="lt-conf">
          <div class="conf-bar-wrap">
            <div class="conf-bar" style="width:${confidence}%"></div>
            <span class="conf-label">${confidence}%</span>
          </div>
        </td>
        <td class="lt-status">${status}</td>
      </tr>`;
  }).join("");
}

function renderTimingLog(lapLog) {
  const log = document.getElementById("practiceTimingLog");
  if (!log) return;

  // Solo mostrar últimas 6 entradas
  const recent = lapLog.slice(-6).reverse();
  log.innerHTML = recent.map(entry => {
    const cls = entry.type === "problem" ? "log-entry log-problem"
              : entry.type === "best"    ? "log-entry log-best"
              : "log-entry";
    return `<div class="${cls}">${entry.message}</div>`;
  }).join("");
}

function _tyreIcon(tyre) {
  const icons = { soft: "🔴", medium: "🟡", hard: "⚪" };
  return icons[tyre] || "⚪";
}

// ═══════════════════════════════════════════════════════════
//  PRE-SESIÓN DE PRÁCTICA
// ═══════════════════════════════════════════════════════════

function openPreSession(sessionKey) {
  if (!practiceData || !selectedTeam) return;

  const config  = SESSION_CONFIG[sessionKey];
  const circuit = practiceData.circuit;
  const race    = practiceData.race;
  const weather = raceWeather || "dry";

  // Inicializar estado de práctica
  initPracticeSessionState(sessionKey, circuit, race, weather, drivers, teams);

  // Inicializar inventario de neumáticos
window.practicetyreInventory = initPracticetyreInventory(
  sessionKey,
  circuit,
  drivers
);

  // UI
  document.getElementById("preSessionTitle").textContent =
    `${sessionKey} — Planificación de programas`;
  document.getElementById("preSessionSubtitle").textContent =
    `${circuit.name} · ${race.name} · ${weatherLabel(weather)}`;

  const lapsRange = config.lapsAvailable;
  document.getElementById("preSessionLapsAvailable").textContent =
    `${lapsRange.min}–${lapsRange.max}`;

  renderPreSessionDriverGrid(sessionKey);
  renderPreSessionProgramsInfo(sessionKey, weather);
  showScreen("practicePreSession");
}

function renderPreSessionDriverGrid(sessionKey) {
  const grid        = document.getElementById("preSessionDriverGrid");
  const teamDrivers = getDriversByTeam(selectedTeam);
  const config      = SESSION_CONFIG[sessionKey];

  grid.innerHTML = teamDrivers.map((driver) => {
    const ds = practiceSessionState.driverStates[driver.id];
    if (!ds) return "";

    const totalLaps   = ds.programs.reduce((s, p) => s + p.laps, 0);
    const maxLaps     = config.lapsAvailable.max;
    const lapsColor   = totalLaps > maxLaps ? "laps-over" : totalLaps > 0 ? "laps-ok" : "";

    return `
      <div class="dashboard-main-card">
        <div style="display:flex; justify-content:space-between; align-items:center;
          margin-bottom:16px;">
          <div>
            <div style="font-size:18px; font-weight:800; color:#fff;">
              #${driver.number} ${driver.name}
            </div>
            <div style="color:#aaa; font-size:12px; margin-top:3px;">
              Setup actual: <strong style="color:#ffcc00;">${ds.setupScore}%</strong>
              · Confianza: <strong style="color:#4caf50;">${ds.confidence}%</strong>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px; color:#aaa;">Vueltas planificadas</div>
            <div style="font-size:22px; font-weight:800;" class="${lapsColor}">
              ${totalLaps} / ${maxLaps}
            </div>
          </div>
        </div>

        <!-- Lista de programas -->
        <div id="programList_${driver.id}" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
          ${renderDriverProgramSlots(driver.id, sessionKey)}
        </div>

        <!-- Botón agregar -->
        <button class="add-program-btn"
          onclick="openAddProgramModal(${driver.id}, '${sessionKey}')">
          + Agregar programa de trabajo
        </button>
      </div>
    `;
  }).join("");

  updateStartButton(sessionKey);
}

function renderDriverProgramSlots(driverId, sessionKey) {
  const ds = practiceSessionState.driverStates[driverId];
  if (!ds || ds.programs.length === 0) {
    return `<div style="color:#444; font-size:12px; text-align:center; padding:8px;">
      Sin programas asignados todavía
    </div>`;
  }

  return ds.programs.map((plan, idx) => {
    const prog = WORK_PROGRAMS.find((p) => p.id === plan.programId);
    if (!prog) return "";
    const compound = compounds.find((c) => c.id === plan.compound);

    return `
      <div class="program-slot">
        <div class="program-slot-icon">${prog.icon}</div>
        <div class="program-slot-info">
          <div class="program-slot-name">${prog.name}</div>
          <div class="program-slot-meta">
            ${plan.laps} vueltas ·
            <span style="color:${compound?.color || '#aaa'}">
              ${compound?.name || plan.compound}
            </span>
          </div>
        </div>
        <button class="program-slot-remove"
          onclick="removeProgramSlot(${driverId}, ${idx}, '${sessionKey}')">
          ✕
        </button>
      </div>
    `;
  }).join("");
}

function openAddProgramModal(driverId, sessionKey) {
  const driver    = drivers.find((d) => d.id === driverId);
  const ds        = practiceSessionState.driverStates[driverId];
  const config    = SESSION_CONFIG[sessionKey];
  const available = getAvailablePrograms(sessionKey, practiceSessionState.weather);
  const totalLaps = ds.programs.reduce((s, p) => s + p.laps, 0);
  const remaining = config.lapsAvailable.max - totalLaps;

  const existing = document.getElementById("addProgramModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "addProgramModal";
  modal.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.88); z-index:9999;
    display:flex; align-items:center; justify-content:center;
  `;

  modal.innerHTML = `
    <div style="background:#111; border:1px solid #333; border-radius:16px;
      padding:28px; max-width:560px; width:90%;">

      <div style="font-size:18px; font-weight:800; color:#fff; margin-bottom:4px;">
        Agregar programa — ${driver?.name}
      </div>
      <div style="color:#aaa; font-size:13px; margin-bottom:20px;">
        Vueltas restantes disponibles:
        <strong style="color:${remaining < 5 ? '#e10600' : '#fff'};">${remaining}</strong>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
        ${available.map((prog) => `
          <div onclick="selectProgramToAdd(${driverId}, '${prog.id}', '${sessionKey}')"
            id="progOption_${prog.id}"
            style="
              background:#0a0a0a; border:1px solid #222; border-radius:10px;
              padding:14px; cursor:pointer; transition:0.2s;
              display:flex; align-items:center; gap:12px;
            "
            onmouseover="this.style.borderColor='#e10600'"
            onmouseout="this.style.borderColor='#222'">
            <div style="font-size:22px;">${prog.icon}</div>
            <div style="flex:1;">
              <div style="color:#fff; font-weight:700; font-size:14px;">${prog.name}</div>
              <div style="color:#666; font-size:12px; margin-top:2px;">${prog.description}</div>
            </div>
            <div style="text-align:right; color:#aaa; font-size:12px;">
              ${prog.lapsMin}–${prog.lapsMax} vts<br>
              <span style="color:${compounds.find((c) => c.id === prog.tyreRecommended)?.color || '#aaa'}">
                ${compounds.find((c) => c.id === prog.tyreRecommended)?.name || prog.tyreRecommended}
              </span>
            </div>
          </div>
        `).join("")}
      </div>

      <!-- Configuración del programa seleccionado -->
      <div id="programConfig" style="display:none; background:#0a0a0a;
        border:1px solid #333; border-radius:10px; padding:16px; margin-bottom:16px;">
        <div style="color:#fff; font-weight:700; margin-bottom:12px;"
          id="programConfigTitle">Configurar programa</div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <div style="color:#aaa; font-size:12px; margin-bottom:6px;">Vueltas</div>
            <input id="programLapsInput" type="number" min="1" max="${config.lapsAvailable.max}"
              style="width:100%; background:#111; border:1px solid #333; border-radius:8px;
              padding:10px; color:#fff; font-size:14px;" />
            <div id="programLapsHint" style="color:#666; font-size:11px; margin-top:4px;"></div>
          </div>
          <div>
            <div style="color:#aaa; font-size:12px; margin-bottom:6px;">Neumático</div>
            <div id="programTyreSelect"></div>
          </div>
        </div>
      </div>

      <div style="display:flex; gap:10px;">
        <button id="btnConfirmProgram" class="btn" style="flex:1; display:none;"
          onclick="confirmAddProgram(${driverId}, '${sessionKey}')">
          AGREGAR AL PLAN
        </button>
        <button class="btn btn-secondary" style="flex:1;"
          onclick="document.getElementById('addProgramModal').remove()">
          CANCELAR
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal._selectedProgramId = null;
}

let _selectedProgramForModal = null;

function selectProgramToAdd(driverId, programId, sessionKey) {
  _selectedProgramForModal = programId;
  const prog    = WORK_PROGRAMS.find((p) => p.id === programId);
  if (!prog) return;

  // Resaltar selección
  document.querySelectorAll("[id^='progOption_']").forEach((el) => {
    el.style.borderColor = "#222";
    el.style.background  = "#0a0a0a";
  });
  const selected = document.getElementById(`progOption_${programId}`);
  if (selected) {
    selected.style.borderColor = "#e10600";
    selected.style.background  = "#1a0a0a";
  }

  // Mostrar configuración
  const config   = document.getElementById("programConfig");
  const title    = document.getElementById("programConfigTitle");
  const lapsInput = document.getElementById("programLapsInput");
  const lapsHint  = document.getElementById("programLapsHint");
  const tyreDiv   = document.getElementById("programTyreSelect");
  const confirmBtn = document.getElementById("btnConfirmProgram");

  if (config) config.style.display = "block";
  if (title) title.textContent = `Configurar: ${prog.name}`;
  if (lapsInput) {
    lapsInput.value = prog.lapsDefault;
    lapsInput.min   = prog.lapsMin;
    lapsInput.max   = prog.lapsMax + 10; // puede exceder, con consecuencias
  }
  if (lapsHint) lapsHint.textContent =
    `Recomendado: ${prog.lapsDefault} vueltas (${prog.lapsMin}–${prog.lapsMax})`;

  // Selector de neumático
  if (tyreDiv) {
    const availableCompounds = practiceData?.circuit?.compoundsAvailable || ["soft", "medium", "hard"];
    const options = availableCompounds.map((cId) => {
      const c = compounds.find((comp) => comp.id === cId);
      return {
        value: cId,
        label: c?.name || cId,
        color: c?.color || "#aaa",
      };
    });
    tyreDiv.innerHTML = "";
    tyreDiv.appendChild(createCustomSelect(options, prog.tyreRecommended, (val) => {
      tyreDiv.dataset.selected = val;
    }));
    tyreDiv.dataset.selected = prog.tyreRecommended;
  }

  if (confirmBtn) confirmBtn.style.display = "block";
}

function confirmAddProgram(driverId, sessionKey) {
  if (!_selectedProgramForModal) return;

  const lapsInput = document.getElementById("programLapsInput");
  const tyreDiv   = document.getElementById("programTyreSelect");
  const laps      = parseInt(lapsInput?.value) || WORK_PROGRAMS.find((p) => p.id === _selectedProgramForModal)?.lapsDefault;
  const compound  = tyreDiv?.dataset.selected || "medium";

  const ds = practiceSessionState.driverStates[driverId];
  if (ds) {
    ds.programs.push({
      programId: _selectedProgramForModal,
      laps,
      compound,
    });
  }

  document.getElementById("addProgramModal")?.remove();
  _selectedProgramForModal = null;

  // Re-renderizar slots
  const driver    = drivers.find((d) => d.id === driverId);
  const slotsDiv  = document.getElementById(`programList_${driverId}`);
  if (slotsDiv) slotsDiv.innerHTML = renderDriverProgramSlots(driverId, sessionKey);

  // Actualizar contador de vueltas
  renderPreSessionDriverGrid(sessionKey);
}

function removeProgramSlot(driverId, idx, sessionKey) {
  const ds = practiceSessionState.driverStates[driverId];
  if (ds) ds.programs.splice(idx, 1);
  renderPreSessionDriverGrid(sessionKey);
}

function renderPreSessionProgramsInfo(sessionKey, weather) {
  const container = document.getElementById("preSessionProgramsInfo");
  const available = getAvailablePrograms(sessionKey, weather);

  container.innerHTML = available.map((prog) => `
    <div style="background:#0a0a0a; border:1px solid #1a1a1a; border-radius:10px; padding:12px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <span style="font-size:18px;">${prog.icon}</span>
        <span style="color:#fff; font-weight:700; font-size:13px;">${prog.name}</span>
      </div>
      <div style="color:#666; font-size:12px; margin-bottom:6px;">${prog.description}</div>
      <div style="color:#555; font-size:11px;">
        ${prog.lapsMin}–${prog.lapsMax} vueltas ·
        Neumático recomendado:
        <span style="color:${compounds.find((c) => c.id === prog.tyreRecommended)?.color || '#aaa'}">
          ${compounds.find((c) => c.id === prog.tyreRecommended)?.name || prog.tyreRecommended}
        </span>
      </div>
    </div>
  `).join("");
}

function updateStartButton(sessionKey) {
  const btn         = document.getElementById("btnStartSession");
  if (!btn) return;
  const teamDrivers = getDriversByTeam(selectedTeam);
  const allHavePrograms = teamDrivers.every((d) => {
    const ds = practiceSessionState.driverStates[d.id];
    return ds && ds.programs.length > 0;
  });
  btn.disabled = !allHavePrograms;
}

function startPracticeSession() {
  const sessionKey = practiceSessionState.session;
  // Lanzar al live timing adaptado con LTE en modo practice
  openPracticeTimingWithLTE(sessionKey);
}

// ═══════════════════════════════════════════════════════════
//  MENÚ DE REGLAJES
// ═══════════════════════════════════════════════════════════

let _setupActiveDriverId = null;

function openSetupMenu(returnScreen) {
  const teamDrivers = getDriversByTeam(selectedTeam);
  _setupActiveDriverId = teamDrivers[0]?.id || null;

  document.getElementById("setupMenuSubtitle").textContent =
    `${practiceSessionState.session || ""} — ${practiceData?.circuit?.name || ""}`;

  // Tabs de pilotos
  const tabsDiv = document.getElementById("setupDriverTabs");
  tabsDiv.innerHTML = teamDrivers.map((driver, i) => {
    const ds            = practiceSessionState.driverStates[driver.id];
    const unread        = ds?.pendingFeedback?.filter((f) => !f.read).length || 0;
    const isActive      = i === 0;

    return `
      <button id="setupTab_${driver.id}"
        onclick="switchSetupDriver(${driver.id})"
        class="btn ${isActive ? '' : 'btn-secondary'}"
        style="position:relative; padding:10px 20px;">
        #${driver.number} ${driver.name}
        ${unread > 0 ? `
          <span style="
            position:absolute; top:-6px; right:-6px;
            background:#e10600; color:#fff; font-size:10px;
            font-weight:800; padding:2px 6px; border-radius:10px;
          ">${unread}</span>
        ` : ""}
      </button>
    `;
  }).join("");

  renderSetupPanel(_setupActiveDriverId);
  showScreen("setupMenuScreen");

  // Marcar feedbacks como leídos al abrir
  teamDrivers.forEach((driver) => {
    const ds = practiceSessionState.driverStates[driver.id];
    if (ds) ds.pendingFeedback.forEach((f) => { f.read = true; });
  });
}

function closeSetupMenu() {
  showScreen("liveTimingScreen");
  // Reanudar simulación si estaba corriendo
  if (LTE.state.session === "practice" && !LTE.state.finished) {
    LTE.play();
    document.getElementById("ltBtnPlay").disabled  = true;
    document.getElementById("ltBtnPause").disabled = false;
  }
}

function switchSetupDriver(driverId) {
  _setupActiveDriverId = driverId;

  // Actualizar tabs
  getDriversByTeam(selectedTeam).forEach((driver) => {
    const btn = document.getElementById(`setupTab_${driver.id}`);
    if (btn) {
      btn.className = driver.id === driverId ? "btn" : "btn btn-secondary";
      btn.style.position = "relative";
      btn.style.padding  = "10px 20px";
    }
  });

  renderSetupPanel(driverId);
}

function renderSetupPanel(driverId) {
  const panel = document.getElementById("setupActivePanel");
  if (!panel) return;

  const ds     = practiceSessionState.driverStates[driverId];
  const driver = drivers.find((d) => d.id === driverId);
  if (!ds || !driver) return;

  const score      = ds.setupScore || 0;
  const scoreColor = score >= 85 ? "#4caf50" : score >= 60 ? "#ffcc00" : "#e10600";

  panel.innerHTML = `
    <div style="display:grid; grid-template-columns:2fr 1fr; gap:18px;">

      <!-- Sliders -->
      <div class="dashboard-main-card">
        <div style="display:flex; justify-content:space-between; align-items:center;
          margin-bottom:20px;">
          <h3 style="margin:0;">Parámetros de reglaje</h3>
          <div>
            <span style="color:#aaa; font-size:13px;">Setup completado: </span>
            <strong style="color:${scoreColor}; font-size:18px;">${score}%</strong>
          </div>
        </div>

        <div id="setupSlidersContainer_${driverId}">
          ${SETUP_PARAMS.map((param) => renderSetupSlider(param, ds)).join("")}
        </div>
      </div>

      <!-- Feedback del ingeniero -->
      <div>
        <div class="dashboard-main-card" style="margin-bottom:16px;">
          <h3 style="margin-bottom:14px;">Radio del ingeniero</h3>
          ${ds.pendingFeedback.length === 0 ? `
            <div style="color:#444; font-size:13px;">
              Completá un programa para recibir feedback.
            </div>
          ` : `
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${[...ds.pendingFeedback].reverse().map((fb) => `
                <div class="feedback-card ${fb.read ? 'read' : ''}">
                  <div class="feedback-program">
                    ${fb.timestamp} — ${fb.programName}
                  </div>
                  <div class="feedback-text">${fb.text}</div>
                  <div class="feedback-score">
                    <div class="feedback-score-bar">
                      <div class="feedback-score-fill" style="
                        width:${fb.score}%;
                        background:${fb.score >= 85 ? '#4caf50' : fb.score >= 60 ? '#ffcc00' : '#e10600'};
                      "></div>
                    </div>
                    <span style="color:#aaa; font-size:11px; white-space:nowrap;">
                      ${fb.score}%
                      ${fb.delta > 0 ? `<span style="color:#4caf50;">+${fb.delta}</span>` : ""}
                    </span>
                  </div>
                </div>
              `).join("")}
            </div>
          `}
        </div>

        <!-- Setup score visual -->
        <div class="dashboard-main-card">
          <h3 style="margin-bottom:14px;">Confianza del piloto</h3>
          <div style="font-size:32px; font-weight:900; color:#4caf50;
            margin-bottom:8px;">${ds.confidence}%</div>
          <div style="background:#1a1a1a; border-radius:20px; height:8px; overflow:hidden;">
            <div style="width:${ds.confidence}%; height:100%;
              background:linear-gradient(90deg,#2ecc71,#27ae60);
              border-radius:20px; transition:0.5s;"></div>
          </div>
          <div style="color:#666; font-size:12px; margin-top:8px;">
            ${ds.confidence >= 80 ? "✓ Listo para clasificación" :
              ds.confidence >= 50 ? "⚡ En progreso" :
              "⚠️ Poca adaptación al circuito"}
          </div>
        </div>
      </div>

    </div>
  `;

  // Agregar listeners a los sliders
  setTimeout(() => attachSliderListeners(driverId), 50);
}

function renderSetupSlider(param, ds) {
  const current    = ds.setup[param.id] ?? Math.round((param.min + param.max) / 2);
  const optimal    = ds.optimalSetup[param.id];
  const diff       = optimal - current;
  const range      = param.max - param.min;
  const threshold  = range * 0.12;
  const lapsDone   = ds.lapsDone || 0;

  // Verificar desbloqueo
  const isUnlocked = lapsDone >= (param.unlockLaps || 0) &&
    (!param.requiresProgram || ds.programs?.some((p) =>
      p.programId === param.requiresProgram
    ));

  // Gradiente del slider
  const pct = ((current - param.min) / range) * 100;

  if (!isUnlocked) {
    // Bloqueado — mostrar candado
    return `
      <div class="setup-param-row" style="opacity:0.35;">
        <div>
          <div class="setup-param-label">${param.label}</div>
          <div class="setup-param-affects">${param.affects}</div>
        </div>
        <div style="color:#444; font-size:12px; text-align:center;">
          🔒 Desbloqueá en ${param.unlockLaps} vueltas
          ${param.requiresProgram ? `+ programa ${param.requiresProgram}` : ""}
        </div>
        <div class="setup-param-value" style="color:#333;">${current}${param.unit}</div>
        <div class="setup-direction-hint" style="background:#111; color:#333;">—</div>
      </div>
    `;
  }

  // Hint — solo SUBIR o BAJAR, nunca OK ni ÓPTIMO
  let hintClass = "";
  let hintText  = "";

  if (Math.abs(diff) <= range * 0.04) {
    // En el punto exacto — silencio total
    hintClass = "";
    hintText  = "";
  } else if (diff > threshold) {
    hintClass = "hint-up";
    hintText  = "▲ SUBIR";
  } else if (diff < -threshold) {
    hintClass = "hint-down";
    hintText  = "▼ BAJAR";
  }
  // Entre threshold y punto exacto — zona gris, sin hint

  return `
    <div class="setup-param-row">
      <div>
        <div class="setup-param-label">${param.label}</div>
        <div class="setup-param-affects">${param.affects}</div>
      </div>
      <div style="position:relative;">
        <input
          type="range"
          class="setup-slider"
          id="slider_${param.id}"
          min="${param.min}" max="${param.max}" step="${param.step}"
          value="${current}"
          style="background: linear-gradient(to right, #e10600 0%, #e10600 ${pct}%, #333 ${pct}%, #333 100%);"
          oninput="onSliderChange('${param.id}', this.value)"
        />
      </div>
      <div class="setup-param-value" id="sliderVal_${param.id}">
        ${current}${param.unit}
      </div>
      <div class="setup-direction-hint ${hintClass}" id="sliderHint_${param.id}"
        style="${!hintText ? 'visibility:hidden;' : ''}">
        ${hintText || "—"}
      </div>
    </div>
  `;
}

function attachSliderListeners(driverId) {
  // Ya están inline en el HTML, pero actualizamos el driverId activo
  _setupActiveDriverId = driverId;
}

function onSliderChange(paramId, value) {
  const driverId = _setupActiveDriverId;
  if (!driverId) return;

  const ds    = practiceSessionState.driverStates[driverId];
  const param = SETUP_PARAMS.find((p) => p.id === paramId);
  if (!ds || !param) return;

  const numVal = parseFloat(value);
  ds.setup[paramId] = numVal;

  // Actualizar display del valor
  const valEl = document.getElementById(`sliderVal_${paramId}`);
  if (valEl) valEl.textContent = `${numVal}${param.unit}`;

  // Actualizar hint
  const hintEl = document.getElementById(`sliderHint_${paramId}`);
  // Actualizar hint — solo SUBIR/BAJAR, nunca OK/ÓPTIMO
if (hintEl) {
  const optimal    = ds.optimalSetup[paramId];
  const diff       = optimal - numVal;
  const range      = param.max - param.min;
  const threshold  = range * 0.12;

  if (Math.abs(diff) <= range * 0.04) {
    hintEl.className   = "setup-direction-hint";
    hintEl.textContent = "—";
    hintEl.style.visibility = "hidden";
  } else if (diff > threshold) {
    hintEl.className   = "setup-direction-hint hint-up";
    hintEl.textContent = "▲ SUBIR";
    hintEl.style.visibility = "visible";
  } else if (diff < -threshold) {
    hintEl.className   = "setup-direction-hint hint-down";
    hintEl.textContent = "▼ BAJAR";
    hintEl.style.visibility = "visible";
  } else {
    hintEl.className   = "setup-direction-hint";
    hintEl.textContent = "—";
    hintEl.style.visibility = "hidden";
  }
}

  // Actualizar gradiente del slider
  const sliderEl = document.getElementById(`slider_${paramId}`);
  if (sliderEl) {
    const pct = ((numVal - param.min) / (param.max - param.min)) * 100;
    sliderEl.style.background =
      `linear-gradient(to right, #e10600 0%, #e10600 ${pct}%, #333 ${pct}%, #333 100%)`;
  }
}

function saveSetupChanges() {
  const driverId = _setupActiveDriverId;
  if (!driverId) return;

  const ds = practiceSessionState.driverStates[driverId];
  if (!ds) return;

  const prevScore = ds.setupScore;
  const newScore  = calculateSetupScore(ds.setup, ds.optimalSetup);
  const improved  = newScore > prevScore + 3;
  const optimal   = newScore >= 85;

  ds.setupScore     = newScore;
  ds.prevSetupScore = prevScore;

  if (improved) updateDriverConfidence(ds, 0, true, optimal);

  const driver = drivers.find((d) => d.id === driverId);
  if (improved) {
    ds.pendingFeedback.push({
      id:          Date.now(),
      programName: "Ajuste de reglajes",
      text:        `${driver?.name}: Setup mejoró de ${prevScore}% a ${newScore}%. ${optimal ? "¡Punto óptimo alcanzado!" : "Seguimos afinando."}`,
      score:       newScore,
      delta:       newScore - prevScore,
      read:        false,
      timestamp:   new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
    });
  }

  // Mostrar confirmación visual sin re-renderizar todo
  const scoreEl = document.querySelector(`#setupActivePanel strong`);
  if (scoreEl) {
    const color = newScore >= 85 ? "#4caf50" : newScore >= 60 ? "#ffcc00" : "#e10600";
    scoreEl.textContent = `${newScore}%`;
    scoreEl.style.color = color;
  }

  // Actualizar hints de los sliders sin re-renderizar
  SETUP_PARAMS.forEach((param) => {
    const hintEl = document.getElementById(`sliderHint_${param.id}`);
    if (!hintEl) return;
    const current   = ds.setup[param.id];
    const optimal_v = ds.optimalSetup[param.id];
    const diff      = optimal_v - current;
    const range     = param.max - param.min;
    const threshold = range * 0.12;

    if (Math.abs(diff) <= range * 0.05) {
      hintEl.className   = "setup-direction-hint hint-optimal";
      hintEl.textContent = "✓ ÓPTIMO";
    } else if (diff > threshold) {
      hintEl.className   = "setup-direction-hint hint-up";
      hintEl.textContent = "▲ SUBIR";
    } else if (diff < -threshold) {
      hintEl.className   = "setup-direction-hint hint-down";
      hintEl.textContent = "▼ BAJAR";
    } else {
      hintEl.className   = "setup-direction-hint hint-ok";
      hintEl.textContent = "OK";
    }
  });

  // Flash en el botón guardar
  const saveBtn = document.getElementById("btnSaveSetup");
  if (saveBtn) {
    saveBtn.textContent        = "✓ GUARDADO";
    saveBtn.style.background   = "#4caf50";
    saveBtn.style.borderColor  = "#4caf50";
    setTimeout(() => {
      saveBtn.textContent       = "GUARDAR REGLAJES ✓";
      saveBtn.style.background  = "";
      saveBtn.style.borderColor = "";
    }, 1500);
  }
}

// ═══════════════════════════════════════════════════════════
//  LIVE TIMING DE PRÁCTICAS — usando LTE
// ═══════════════════════════════════════════════════════════

function openPracticeTimingWithLTE(sessionKey) {
  if (!practiceData || !selectedTeam) return;
  window.selectedTeam  = selectedTeam;
window.playerTeamId  = selectedTeam?.id;

  const { circuit, race } = practiceData;
  const weather           = raceWeather || "dry";
  const weatherTL         = Array(circuit.laps).fill(weather);

  // Inicializar LTE en modo practice
  LTE.init(
    "practice",
    drivers,
    teams,
    circuit,
    race,
    weather,
    weatherTL,
    compounds,
    practiceData
  );

  // Inyectar datos de práctica en cada driver del LTE
  LTE.drivers.forEach((ltDriver) => {
    const ds = practiceSessionState.driverStates[ltDriver.driverId];
    if (!ds) return;

    ltDriver.confidence         = ds.confidence || 0;
ltDriver.tyreLaps           = 0;
ltDriver._totalPracticeLaps = 0;
ltDriver._practiceLapsDone  = 0;
    ltDriver.hasProblem    = false;
    ltDriver.problemLap    = null;
    ltDriver.currentLap    = 0;
    ltDriver.lapsOnTyre    = 0;
    ltDriver.inPit         = true;         // todos arrancan en boxes
    ltDriver.pitTimeLeft   = 99999;        // esperan orden manual
    ltDriver.awaitingPitwall = ltDriver.isPlayer; // jugador controla los suyos

    // IA sale sola con delay escalonado
    if (!ltDriver.isPlayer) {
      ltDriver.pitTimeLeft     = Math.floor(Math.random() * 60) + 10;
      ltDriver.awaitingPitwall = false;
    }

    // Programa actual para este driver
    ltDriver._practicePrograms   = ds.programs;
    ltDriver._practiceProgramIdx = 0;
    ltDriver._practiceLapsDone   = 0;
    ltDriver._practiceSessionKey = sessionKey;
  });

  // Configurar totalLaps según sesión
  const config = SESSION_CONFIG[sessionKey];
  const totalLaps = config.lapsAvailable.min +
    Math.floor(Math.random() * (config.lapsAvailable.max - config.lapsAvailable.min + 1));
  LTE.state.totalLaps    = totalLaps;
  LTE.state.session      = "practice";
  LTE.state.sessionKey   = sessionKey;
  LTE.state.trackRubber  = config.trackRubber;

  // Callbacks
  LTE.onTick = (state, ltDrivers) => {
    ltRenderTable(state, ltDrivers);
    ltUpdateInfoBar(state);
    _practiceTick(state, ltDrivers);
  };

  LTE.onEvent = (text) => { ltAddEvent(text); };

  LTE.onFinish = (state, ltDrivers) => {
    ltRenderTable(state, ltDrivers);
    _practiceSessionFinished(sessionKey, ltDrivers);
  };

  // UI
  document.getElementById("ltSessionName").textContent =
    `${sessionKey} — Live Timing`;
  document.getElementById("ltSessionInfo").textContent =
    `${circuit.name} · ${race.name} · ${weatherLabel(weather)}`;
  document.getElementById("ltSessionType").textContent = sessionKey;
  document.getElementById("ltCurrentLap").textContent  = "0";
  document.getElementById("ltWeather").textContent     = weatherLabel(weather);
  document.getElementById("ltSCStatus").textContent    = "Clear";
  document.getElementById("ltSCStatus").style.color    = "#4caf50";
  document.getElementById("ltPlayerControls").style.display = "block";
  document.getElementById("ltEventLog").innerHTML =
    `<div style="color:#666; font-size:12px;">
      Sesión lista. Tus pilotos esperan en boxes.
      Abrí el Pitwall para lanzarlos a pista.
    </div>`;

  document.getElementById("ltBtnPlay").disabled  = false;
  document.getElementById("ltBtnPause").disabled = true;

  ltRenderTable(LTE.state, LTE.drivers);
  showScreen("liveTimingScreen");
}

// ── Tick de práctica — gestión de programas ───────────────
function _practiceTick(state, ltDrivers) {
  ltDrivers.forEach((d) => {
    if (d.inPit || d.dnf || !d._practicePrograms) return;

    const plan = d._practicePrograms[d._practiceProgramIdx];
    if (!plan) return;

    // Completó las vueltas del programa actual
    if (d._practiceLapsDone > 0 && d._practiceLapsDone >= plan.laps) {
      _completePracticeProgramForDriver(d, plan, state.sessionKey);
    }
  });
}

function _completePracticeProgramForDriver(ltDriver, plan, sessionKey) {
  const ds      = practiceSessionState.driverStates[ltDriver.driverId];
  const program = WORK_PROGRAMS.find((p) => p.id === plan.programId);

  if (ds && program) {
    completePracticeProgram(ds);

    // Si es piloto del jugador — mostrar alerta
    if (ltDriver.isPlayer) {
      const unread = getUnreadFeedbackCount();
      LTE._addEvent(
        `🔧 ${ltDriver.driverName} completó "${program.name}" — ` +
        `${unread > 0 ? "⚠️ Feedback disponible en Reglajes" : "Vuelve a boxes"}`
      );
    } else {
      LTE._addEvent(
        `${ltDriver.driverName} (${ltDriver.teamName}) — completó ${program.name}`
      );
    }
  }

  // Enviar a boxes
  ltDriver.inPit           = true;
  ltDriver.pitTimeLeft     = ltDriver.isPlayer ? 99999 : Math.floor(Math.random() * 30) + 15;
  ltDriver.awaitingPitwall = ltDriver.isPlayer;
  ltDriver._practiceProgramIdx++;
  ltDriver._practiceLapsDone = 0;

  // Actualizar confianza en el LTE driver también
  if (ds) ltDriver.confidence = ds.confidence;

  // IA lanza siguiente programa automáticamente
  if (!ltDriver.isPlayer && ltDriver._practiceProgramIdx < ltDriver._practicePrograms.length) {
    const nextPlan = ltDriver._practicePrograms[ltDriver._practiceProgramIdx];
    if (nextPlan) ltDriver.compound = nextPlan.compound;
  }
}

// ── Sobreescribir completeSectorQual para contar vueltas de práctica
const _originalCompleteSectorQual = LTE._completeSectorQual?.bind(LTE);
// Patch: al completar una vuelta en modo practice, incrementar _practiceLapsDone
const _patchPracticelapCount = () => {
  const orig = LTE._completeSectorRace?.bind(LTE) || LTE._completeSectorQual?.bind(LTE);
};

// ── Al terminar la sesión ─────────────────────────────────
function _practiceSessionFinished(sessionKey, ltDrivers) {
  // Sincronizar confianza final al estado de práctica
  ltDrivers.forEach((d) => {
    const ds = practiceSessionState.driverStates[d.driverId];
    if (ds) {
      ds.confidence = d.confidence || ds.confidence;
      ds.lapsDone   = d.currentLap || 0;
    }
  });

  // Construir results para finalizeFPSession
  const state = {
    drivers: ltDrivers.map((d) => {
      const ds = practiceSessionState.driverStates[d.driverId];
      return {
        id:            d.driverId,
        name:          d.driverName,
        program:       WORK_PROGRAMS.find((p) =>
          p.id === (d._practicePrograms?.[Math.max(0, d._practiceProgramIdx - 1)]?.programId)
        ) || null,
        bestLap:       isFinite(d.bestLap) ? d.bestLap : null,
        lapsCompleted: d.currentLap || 0,
        hasProblem:    d.dnf || false,
        confidence:    ds?.confidence || 0,
        gap:           isFinite(d.gap) ? d.gap : null,
      };
    }),
  };

  finalizeFPSession(sessionKey, state);
}

function ltPitwallSendOut(driverId, compoundId, isNew) {
  const driver = LTE.drivers.find((d) => d.driverId === parseInt(driverId));
  if (!driver) return;

  // Marcar set como usado en inventario
  if (window.practicetyreInventory) {
    markTyreSetUsed(window.practicetyreInventory, parseInt(driverId), compoundId, isNew);
  }

  // Factor de neumático usado — afecta degradación
  driver._tyreIsNew    = isNew;
  driver._tyreAgeFactor = getTyreSetFactor(
    window.practicetyreInventory || {},
    parseInt(driverId),
    compoundId,
    isNew
  );

  // Lanzar a pista
  ltPitwallAction(driverId, "send_out", compoundId);
}

function ltAddProgramFromPitwall(driverId) {
  const sessionKey = LTE.state.sessionKey || "FP1";
  const driver     = LTE.drivers.find((d) => d.driverId === parseInt(driverId));
  if (!driver) return;

  ltClosePitwall(false);

  // Abrir modal de agregar programa
  openAddProgramModal(parseInt(driverId), sessionKey);

  // Al confirmar, sincronizar con el driver del LTE
  const origConfirm = window.confirmAddProgram;
  window.confirmAddProgram = function(dId, sKey) {
    origConfirm(dId, sKey);

    // Sincronizar programas al driver del LTE
    const ds = practiceSessionState.driverStates[parseInt(dId)];
    if (ds && driver) {
      driver._practicePrograms = ds.programs;
    }

    // Reabrir pitwall
    setTimeout(() => {
      LTE.pause();
      document.getElementById("ltBtnPlay").disabled  = false;
      document.getElementById("ltBtnPause").disabled = true;
      ltOpenPitwall();
    }, 100);

    window.confirmAddProgram = origConfirm;
  };
}

function ltSwitchLogTab(tab) {
  document.getElementById("ltEventLog").style.display  =
    tab === "eventos" ? "block" : "none";
  document.getElementById("ltRadioLog").style.display  =
    tab === "radio"   ? "block" : "none";
  document.getElementById("tabEventos").className =
    tab === "eventos" ? "btn" : "btn btn-secondary";
  document.getElementById("tabRadio").className =
    tab === "radio"   ? "btn" : "btn btn-secondary";
}

function ltAddRadioMessage(driverName, teamColor, message, type) {
  const log = document.getElementById("ltRadioLog");
  if (!log) return;

  // Limpiar mensaje inicial
  if (log.innerHTML.includes("Sin mensajes")) log.innerHTML = "";

  const typeColor = type === "engineer" ? "#4caf50"
    : type === "warning" ? "#ffcc00"
    : type === "complaint" ? "#e10600"
    : "#aaa";

  const typeLabel = type === "engineer" ? "ING"
    : type === "warning" ? "⚠️"
    : type === "complaint" ? "😤"
    : "📻";

  const div = document.createElement("div");
  div.style.cssText = `
    padding: 6px 8px; margin-bottom:4px;
    border-left: 3px solid ${teamColor || "#333"};
    font-size: 12px; color: #ccc;
    background: rgba(255,255,255,0.02);
    border-radius: 0 4px 4px 0;
  `;
  div.innerHTML = `
    <span style="color:${teamColor || '#aaa'}; font-weight:700;">${driverName}</span>
    <span style="color:${typeColor}; font-size:10px; margin-left:6px;">${typeLabel}</span>
    <span style="color:#666; font-size:10px; margin-left:4px;">${new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</span>
    <br>${message}
  `;
  log.insertBefore(div, log.firstChild);
}

// ══════════════════════════════════════════════════════════
// CONEXIÓN SEGURA DE BOTONES DEL MENÚ PRINCIPAL
// ══════════════════════════════════════════════════════════

window.nuevaPartida = nuevaPartida;
window.cargarPartida = cargarPartida;
window.showScreen = showScreen;
window.goToDashboard = goToDashboard;
window.openModule = openModule;
window.startRace = startRace;
window.startQualifying = startQualifying;
window.finishRaceWeekend = finishRaceWeekend;
window.goToPracticeWeekend = goToPracticeWeekend;

window.addEventListener("DOMContentLoaded", () => {
  const btnNuevaPartida = document.getElementById("btnNuevaPartida");
  const btnCargarPartida = document.getElementById("btnCargarPartida");

  if (btnNuevaPartida) {
    btnNuevaPartida.onclick = () => {
      console.log("Click en Nueva Partida detectado");
      nuevaPartida();
    };
  } else {
    console.warn("No se encontró btnNuevaPartida");
  }

  if (btnCargarPartida) {
    btnCargarPartida.onclick = () => {
      console.log("Click en Cargar Partida detectado");
      cargarPartida();
    };
  } else {
    console.warn("No se encontró btnCargarPartida");
  }
});