// ============================================================
// F1 Manager 2026 — Motor de simulación de carrera
// ============================================================

function getCircuitModifiers(circuit) {
  const degradationMap = { low: 0.7, medium: 1.0, high: 1.3 };
  const overtakingMap  = { very_low: 0.4, low: 0.6, medium: 1.0, high: 1.4 };

  return {
    degradation: degradationMap[circuit.degradation] || 1.0,
    overtaking:  overtakingMap[circuit.overtaking]   || 1.0,
  };
}

function getDriverTeam(driver, teams) {
  return teams.find((t) => t.id === driver.teamId) || null;
}

// ── Clasificación ──────────────────────────────────────────
function simulateQualifying(drivers, teams, circuit, weather) {
  const modifiers = getCircuitModifiers(circuit);
  const isWet = weather === "wet";

  const results = drivers.filter((d) => d.role !== "tester").map((driver) => {
    const team = getDriverTeam(driver, teams);
    if (!team) return null;

    const carBase    = team.performance.overall;
    const driverSkill = isWet
      ? (driver.attributes.qualifying * 0.5 + driver.attributes.wetWeather * 0.5)
      : driver.attributes.qualifying;

    const baseScore  = carBase * 0.55 + driverSkill * 0.45;
    const noise      = (Math.random() - 0.5) * 12;
    const wetPenalty = isWet ? (Math.random() - 0.5) * 8 : 0;
    const score      = baseScore + noise + wetPenalty;

    // Tiempo base ficticio entre 80 y 100 segundos
    const lapTime = 100 - (score / 100) * 20 + (Math.random() - 0.5) * 0.8;

    return {
      driverId:   driver.id,
      driverName: driver.name,
      teamId:     team.id,
      teamName:   team.shortName,
      teamColor:  team.color,
      score:      Math.round(score * 100) / 100,
      lapTime:    Math.round(lapTime * 1000) / 1000,
    };
  }).filter(Boolean);

  results.sort((a, b) => a.lapTime - b.lapTime);

  return results.map((r, i) => ({ ...r, position: i + 1 }));
}

// ── Carrera ────────────────────────────────────────────────
function simulateRace(qualifyingResults, drivers, teams, circuit, weather, strategyBonus = 0) {
  const modifiers  = getCircuitModifiers(circuit);
  const isWet      = weather === "wet";
  const safetyCar  = Math.random() < 0.35;
  const incidents  = [];

  const entries = qualifyingResults.map((q) => {
    const driver = drivers.find((d) => d.id === q.driverId);
    const team   = getDriverTeam(driver, teams);

    const tireSkill  = driver.attributes.tireManagement / 100;
    const consistency = driver.attributes.consistency / 100;
    const reliability = team.performance.reliability / 100;

    // DNF: más probable con baja fiabilidad
    const dnfChance = (1 - reliability) * 0.35 + 0.03;
    const dnf       = Math.random() < dnfChance;

    if (dnf) {
      const lap = Math.floor(Math.random() * circuit.laps) + 1;
      incidents.push({
        type:   "DNF",
        driver: driver.name,
        team:   team.shortName,
        lap,
        reason: getDNFReason(team.performance.reliability),
      });
    }

    // Rendimiento de carrera
    const carPace    = team.performance.overall;
    const driverPace = isWet
      ? (driver.attributes.racecraft * 0.4 + driver.attributes.wetWeather * 0.6)
      : (driver.attributes.racecraft * 0.7 + driver.attributes.tireManagement * 0.3);

    const isPlayerTeam = strategyBonus > 0 && teams.find(
  (t) => t.id === q.teamId
)?.id === qualifyingResults[0]?.teamId;
const baseScore = carPace * 0.55 + driverPace * 0.45 +
  (isPlayerTeam ? strategyBonus * 100 : 0);

    // La posición de clasificación influye (ventaja de salida)
    const gridBonus = (qualifyingResults.length - q.position + 1) * 0.4;

    // Safety car mezcla las posiciones levemente
    const scEffect  = safetyCar ? (Math.random() - 0.5) * 6 : 0;

    const noise     = (Math.random() - 0.5) * 10;
    const score     = dnf ? -999 : baseScore + gridBonus + scEffect + noise;

    return {
      driverId:   driver.id,
      driverName: driver.name,
      teamId:     team.id,
      teamName:   team.shortName,
      teamColor:  team.color,
      gridPosition: q.position,
      score,
      dnf,
      dnfReason: dnf ? getDNFReason(team.performance.reliability) : null,
    };
  });

  entries.sort((a, b) => b.score - a.score);

  const finalResults = entries.map((e, i) => ({
    ...e,
    position: e.dnf ? null : i + 1,
    points:   e.dnf ? 0 : getPoints(i + 1),
  }));

  // Reordenar: DNF al final
  const classified = finalResults.filter((e) => !e.dnf);
  const dnfEntries  = finalResults.filter((e) =>  e.dnf)
    .map((e, i) => ({ ...e, position: classified.length + i + 1 }));

  const raceResults = [...classified, ...dnfEntries];

  return { raceResults, incidents, safetyCar };
}

// ── Puntos ─────────────────────────────────────────────────
function getPoints(position) {
  const table = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  return table[position - 1] || 0;
}

// ── DNF reason ─────────────────────────────────────────────
function getDNFReason(reliability) {
  if (reliability >= 90) {
    const reasons = ["fallo de frenos", "accidente", "toque con otro piloto"];
    return reasons[Math.floor(Math.random() * reasons.length)];
  }
  if (reliability >= 80) {
    const reasons = ["problema de motor", "fallo hidráulico", "problema de caja", "accidente"];
    return reasons[Math.floor(Math.random() * reasons.length)];
  }
  const reasons = ["fallo de motor", "problema eléctrico", "sobrecalentamiento", "fallo de turbo"];
  return reasons[Math.floor(Math.random() * reasons.length)];
}

// ── Tiempo de vuelta como string ───────────────────────────
function formatLapTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3).padStart(6, "0");
  return `${mins}:${secs}`;
}

// ── Clima aleatorio ────────────────────────────────────────
function rollWeather() {
  const r = Math.random();
  if (r < 0.70) return "dry";
  if (r < 0.88) return "cloudy";
  return "wet";
}

function weatherLabel(w) {
  return { dry: "Seco", cloudy: "Nublado", wet: "Lluvia" }[w] || w;
}