// ═══════════════════════════════════════════════════════════
//  PRACTICE ENGINE v2.0 — Sistema completo de prácticas
// ═══════════════════════════════════════════════════════════

// ── Parámetros de reglaje ─────────────────────────────────
const SETUP_PARAMS = [
  { id: "frontWing",     label: "Alerón delantero",       min: 1,  max: 50,  step: 1, unit: "",  affects: "Grip delantero · subviraje",        unlockLaps: 0  },
  { id: "rearWing",      label: "Alerón trasero",          min: 1,  max: 50,  step: 1, unit: "",  affects: "Grip trasero · velocidad punta",     unlockLaps: 0  },
  { id: "diffAccel",     label: "Diferencial aceleración", min: 50, max: 100, step: 1, unit: "%", affects: "Tracción · subviraje salida curva",  unlockLaps: 3  },
  { id: "brakePressure", label: "Presión de frenos",       min: 50, max: 100, step: 1, unit: "%", affects: "Distancia frenado",                 unlockLaps: 3  },
  { id: "brakeBias",     label: "Balance de frenos",       min: 50, max: 70,  step: 1, unit: "%", affects: "Estabilidad bajo frenada",          unlockLaps: 3  },
  { id: "suspFront",     label: "Suspensión delantera",    min: 1,  max: 11,  step: 1, unit: "",  affects: "Rigidez · respuesta",               unlockLaps: 6  },
  { id: "suspRear",      label: "Suspensión trasera",      min: 1,  max: 11,  step: 1, unit: "",  affects: "Tracción · estabilidad",            unlockLaps: 6  },
  { id: "diffBrake",     label: "Diferencial frenada",     min: 50, max: 100, step: 1, unit: "%", affects: "Estabilidad · sobreviraje entrada", unlockLaps: 10 },
  { id: "arbFront",      label: "ARB delantero",           min: 1,  max: 11,  step: 1, unit: "",  affects: "Balance aerodinámico",              unlockLaps: 10 },
  { id: "arbRear",       label: "ARB trasero",             min: 1,  max: 11,  step: 1, unit: "",  affects: "Estabilidad en curva",              unlockLaps: 10 },
  { id: "rideHeight",    label: "Altura del coche",        min: 1,  max: 11,  step: 1, unit: "",  affects: "Downforce · riesgo DSQ",            unlockLaps: 15, requiresProgram: "setup_balance" },
];

// ── Programas de trabajo ──────────────────────────────────
const WORK_PROGRAMS = [
  {
    id: "install",
    name: "Vuelta de instalación",
    icon: "🔌",
    lapsMin: 3, lapsMax: 5, lapsDefault: 4,
    tyreRecommended: "medium",
    description: "Checks de sistemas, sensores, correlación con fábrica.",
    sessions: ["FP1", "FP2", "FP3"],
    focusSetupParam: null,
    reliabilityRisk: 0.02,
    feedbackType: "install",
  },
  {
    id: "aero_corr",
    name: "Correlación aerodinámica",
    icon: "🔬",
    lapsMin: 5, lapsMax: 8, lapsDefault: 6,
    tyreRecommended: "medium",
    description: "Comparar downforce real vs simulador. Pintura de flujo.",
    sessions: ["FP1", "FP2"],
    focusSetupParam: ["frontWing", "rearWing"],
    reliabilityRisk: 0.03,
    feedbackType: "aero",
  },
  {
    id: "setup_balance",
    name: "Balance de setup",
    icon: "⚖️",
    lapsMin: 6, lapsMax: 10, lapsDefault: 8,
    tyreRecommended: "medium",
    description: "Ajuste de subviraje/sobreviraje. Feedback directo del piloto.",
    sessions: ["FP1", "FP2", "FP3"],
    focusSetupParam: ["frontWing", "rearWing", "diffBrake", "suspFront", "suspRear"],
    reliabilityRisk: 0.03,
    feedbackType: "balance",
  },
  {
    id: "tyre_deg",
    name: "Simulación de degradación",
    icon: "🟡",
    lapsMin: 10, lapsMax: 15, lapsDefault: 12,
    tyreRecommended: "hard",
    description: "Stint largo para medir vida real del neumático.",
    sessions: ["FP1", "FP2"],
    focusSetupParam: ["suspRear", "arbRear"],
    reliabilityRisk: 0.04,
    feedbackType: "tyres",
  },
  {
    id: "race_sim",
    name: "Simulación de carrera",
    icon: "🏎️",
    lapsMin: 12, lapsMax: 18, lapsDefault: 15,
    tyreRecommended: "medium",
    description: "Carga de combustible alta. Ritmo de carrera real.",
    sessions: ["FP2"],
    focusSetupParam: ["diffAccel", "brakePressure", "rideHeight"],
    reliabilityRisk: 0.06,
    feedbackType: "race",
  },
  {
    id: "quali_prep",
    name: "Preparación clasificación",
    icon: "⚡",
    lapsMin: 4, lapsMax: 6, lapsDefault: 5,
    tyreRecommended: "soft",
    description: "Vuelta rápida con blando nuevo. Modo ERS Qualy.",
    sessions: ["FP1", "FP2", "FP3"],
    focusSetupParam: ["frontWing", "rearWing", "brakeBias"],
    reliabilityRisk: 0.05,
    feedbackType: "quali",
  },
  {
    id: "cooling",
    name: "Chequeo de refrigeración",
    icon: "🌡️",
    lapsMin: 4, lapsMax: 6, lapsDefault: 5,
    tyreRecommended: "hard",
    description: "Temperatura de componentes. Importante en circuitos calurosos.",
    sessions: ["FP1", "FP2"],
    focusSetupParam: ["rideHeight"],
    reliabilityRisk: 0.02,
    feedbackType: "cooling",
  },
  {
    id: "parts_eval",
    name: "Evaluación de nuevas piezas",
    icon: "🔩",
    lapsMin: 6, lapsMax: 8, lapsDefault: 7,
    tyreRecommended: "medium",
    description: "Comparación A/B de upgrades traídos al circuito.",
    sessions: ["FP1", "FP2"],
    focusSetupParam: ["frontWing", "rearWing", "arbFront", "arbRear"],
    reliabilityRisk: 0.08,
    feedbackType: "parts",
  },
  {
    id: "wet_test",
    name: "Test condiciones húmedas",
    icon: "🌧️",
    lapsMin: 4, lapsMax: 8, lapsDefault: 6,
    tyreRecommended: "intermediate",
    description: "Configuración para lluvia. Solo disponible con clima húmedo.",
    sessions: ["FP1", "FP2", "FP3"],
    focusSetupParam: ["frontWing", "rearWing", "brakePressure"],
    reliabilityRisk: 0.07,
    feedbackType: "wet",
    weatherRequired: true,
  },
];

// ── Límites por sesión ────────────────────────────────────
const SESSION_CONFIG = {
  FP1: {
  lapsAvailable: { min: 22, max: 32 },
    trackRubber:      0.0,   // pista verde
    suggestedPrograms: ["install", "aero_corr", "setup_balance"],
    allowedPrograms:  ["install", "aero_corr", "setup_balance", "tyre_deg", "quali_prep", "cooling", "parts_eval", "wet_test"],
  },
  FP2: {
  lapsAvailable: { min: 22, max: 32 },
    trackRubber:      0.015, // algo más engomada
    suggestedPrograms: ["quali_prep", "race_sim"],
    allowedPrograms:  ["install", "aero_corr", "setup_balance", "tyre_deg", "race_sim", "quali_prep", "cooling", "parts_eval", "wet_test"],
    structure: {
      firstHalf:  ["quali_prep"],   // primeros ~20 min
      secondHalf: ["race_sim"],     // últimos ~25 min
    },
  },
  FP3: {
    lapsAvailable:    { min: 18, max: 22 },
    trackRubber:      0.035, // bastante engomada
    suggestedPrograms: ["quali_prep", "setup_balance"],
    allowedPrograms:  ["install", "setup_balance", "quali_prep", "wet_test"],
  },
};

// ── Mensajes de feedback por tipo ────────────────────────
const FEEDBACK_MESSAGES = {
  install: {
    ok:      (d) => `${d}: Instalación completada. Todos los sistemas operativos. Correlación dentro de márgenes.`,
    problem: (d) => `${d}: Problema detectado en sensor de presión hidráulica. Revisión necesaria antes del siguiente stint.`,
  },
  aero: {
    understeer: (d, param) => `${d}: El piloto reporta subviraje notable en curva media. Sugerimos subir ${param} 3–4 puntos.`,
    oversteer:  (d, param) => `${d}: Sobreviraje al límite en curvas rápidas. Considerá bajar el alerón trasero 2 puntos.`,
    optimal:    (d) => `${d}: Balance aerodinámico en rango óptimo. El piloto está cómodo con la carga actual.`,
    improved:   (d) => `${d}: Mejora confirmada respecto al stint anterior. Seguimos en la dirección correcta.`,
  },
  balance: {
    understeer: (d) => `${d}: Subviraje pronunciado en chicanes y curvas lentas. Sugerimos más diferencial de frenada o subir alerón delantero.`,
    oversteer:  (d) => `${d}: El piloto siente el tren trasero suelto en entrada de curva. Bajar ARB trasero o subir suspensión trasera.`,
    optimal:    (d) => `${d}: Balance de setup en punto óptimo. El piloto se siente cómodo para clasificación y carrera.`,
    improved:   (d) => `${d}: El cambio de reglajes mejoró el balance. El piloto lo confirma por radio.`,
  },
  tyres: {
    high_deg:   (d) => `${d}: Degradación alta. El compuesto se deteriora más rápido que el modelo predijo. Revisá pressión y altura.`,
    normal_deg: (d) => `${d}: Degradación dentro del rango esperado. La estrategia de paradas prevista es viable.`,
    low_deg:    (d) => `${d}: Baja degradación. El compuesto aguanta bien. Podríamos extender los stints en carrera.`,
  },
  race: {
    fuel_heavy: (d) => `${d}: Con carga completa el coche tiene subviraje adicional. Sugerimos ajustar balance de frenos o diferencial.`,
    pace_good:  (d) => `${d}: Ritmo de carrera sólido. El coche mantiene pace competitivo sin degradar el neumático en exceso.`,
    pace_poor:  (d) => `${d}: Ritmo de carrera por debajo de lo esperado. Revisá altura del coche y suspensión trasera.`,
  },
  quali: {
    sector1:    (d) => `${d}: Sector 1 fuerte. Sector 2 con margen. Sugerimos más carga delantera para ganar en curvas medias.`,
    sector2:    (d) => `${d}: Sector 2 y 3 óptimos. Podríamos sacrificar algo de alerón trasero para ganar décimas en las rectas.`,
    optimal:    (d) => `${d}: Setup de clasificación en punto óptimo. El piloto confía en el coche para el intento rápido.`,
  },
  cooling: {
    overheating: (d) => `${d}: Temperatura de motor elevada en sector 2. Considerar abrir más ductos o bajar modo ERS.`,
    normal:      (d) => `${d}: Temperaturas dentro de rango. El coche está bien refrigerado para las condiciones actuales.`,
  },
  parts: {
    positive:   (d) => `${d}: La nueva pieza muestra mejora medible respecto al spec anterior. Confirmamos su uso este fin de semana.`,
    neutral:    (d) => `${d}: La nueva pieza no muestra ventaja clara en estas condiciones. Necesitamos más datos.`,
    negative:   (d) => `${d}: La nueva pieza genera más resistencia de lo esperado. Volvemos al spec anterior por precaución.`,
  },
  wet: {
    good:       (d) => `${d}: El coche se comporta bien en mojado. Setup de lluvia confirmado para condiciones cambiantes.`,
    poor:       (d) => `${d}: El piloto reporta inestabilidad en lluvia intensa. Sugerimos subir ambos alerones y bajar altura.`,
  },
};

// ═══════════════════════════════════════════════════════════
//  MOTOR DE SETUP — Genera y evalúa reglajes por piloto
// ═══════════════════════════════════════════════════════════

function generateDriverOptimalSetup(driver, circuit) {
  const pace        = driver.attributes?.pace        || 80;
  const aggression  = driver.attributes?.aggression  || 75;
  const tyre        = driver.attributes?.tireManagement || 80;
  const techFB      = driver.attributes?.technicalFeedback || 80;

  const isDeg       = circuit?.degradation === "high";
  const isStreet    = circuit?.type === "street";
  const isHighSpeed = circuit?.tyreStress > 0.8;

  // Ruido mayor — cada piloto tiene preferencias únicas más extremas
  const noise = () => (Math.random() - 0.5) * 0.35;

  const opt = (min, max, factor) => {
    const base = min + (max - min) * Math.max(0, Math.min(1, factor + noise()));
    return Math.round(base);
  };

  return {
    frontWing:     opt(1,  50,  isStreet ? 0.72 + noise() : isDeg ? 0.58 + noise() : 0.48 + noise()),
    rearWing:      opt(1,  50,  isStreet ? 0.68 + noise() : isHighSpeed ? 0.28 + noise() : 0.48 + noise()),
    diffAccel:     opt(50, 100, 0.28 + (aggression - 70) / 90 + noise()),
    diffBrake:     opt(50, 100, 0.38 + (tyre - 70) / 180 + noise()),
    suspFront:     opt(1,  11,  isStreet ? 0.28 + noise() : 0.48 + noise()),
    suspRear:      opt(1,  11,  isDeg ? 0.58 + noise() : 0.48 + noise()),
    arbFront:      opt(1,  11,  isHighSpeed ? 0.58 + noise() : 0.43 + noise()),
    arbRear:       opt(1,  11,  isDeg ? 0.53 + noise() : 0.48 + noise()),
    brakePressure: opt(50, 100, 0.48 + (aggression - 70) / 90 + noise()),
    brakeBias:     opt(50, 70,  0.48 + (techFB - 70) / 180 + noise()),
    rideHeight:    opt(1,  11,  isStreet ? 0.58 + noise() : isDeg ? 0.38 + noise() : 0.32 + noise()),
  };
}

function generateDefaultSetup(circuit) {
  // Setup neutro de partida
  const isStreet    = circuit?.type === "street";
  const isDeg       = circuit?.degradation === "high";
  const isHighSpeed = circuit?.tyreStress > 0.8;

  return {
    frontWing:     isStreet ? 38 : isHighSpeed ? 20 : 28,
    rearWing:      isStreet ? 35 : isHighSpeed ? 15 : 25,
    diffAccel:     65,
    diffBrake:     55,
    suspFront:     5,
    suspRear:      5,
    arbFront:      5,
    arbRear:       5,
    brakePressure: 75,
    brakeBias:     57,
    rideHeight:    isStreet ? 6 : 4,
  };
}

function calculateSetupScore(currentSetup, optimalSetup) {
  let totalScore = 0;
  let count      = 0;

  SETUP_PARAMS.forEach((param) => {
    const current = currentSetup[param.id];
    const optimal = optimalSetup[param.id];
    const range   = param.max - param.min;
    if (range === 0) return;

    const distance = Math.abs(current - optimal) / range;
    // Más estricto: necesitás estar dentro del 8% del rango para score alto
    const score = Math.max(0, 1 - (distance * 3.5));
    totalScore += score;
    count++;
  });

  return count > 0 ? Math.round((totalScore / count) * 100) : 0;
}

function getSetupFeedback(driverName, program, currentSetup, optimalSetup, prevScore) {
  // Genera el mensaje de feedback del ingeniero tras completar un programa
  const type    = program.feedbackType;
  const msgs    = FEEDBACK_MESSAGES[type];
  if (!msgs) return `${driverName}: Programa completado. Datos registrados.`;

  const score = calculateSetupScore(currentSetup, optimalSetup);
  const delta = score - prevScore;

  // Detectar qué parámetros necesitan ajuste
  const suggestions = [];
  if (program.focusSetupParam) {
    program.focusSetupParam.forEach((paramId) => {
      const param   = SETUP_PARAMS.find((p) => p.id === paramId);
      if (!param) return;
      const current = currentSetup[paramId];
      const optimal = optimalSetup[paramId];
      const diff    = optimal - current;
      if (Math.abs(diff) > (param.max - param.min) * 0.15) {
        suggestions.push({
          paramId,
          label:     param.label,
          direction: diff > 0 ? "subir" : "bajar",
          amount:    Math.abs(Math.round(diff * 0.5)),
        });
      }
    });
  }

  // Elegir mensaje según contexto
  if (score >= 85) {
    return msgs.optimal?.(driverName)
      || `${driverName}: Setup en punto óptimo para este programa. `;
  }

  if (delta > 8) {
    return msgs.improved?.(driverName)
      || `${driverName}: Mejora confirmada (+${delta} puntos de setup). `;
  }

  if (suggestions.length > 0) {
    const s = suggestions[0];
    const base = msgs.understeer?.(driverName, s.label)
      || msgs.high_deg?.(driverName)
      || msgs.fuel_heavy?.(driverName)
      || `${driverName}: Sugerimos ${s.direction} el ${s.label} ${s.amount} puntos.`;

    const extra = suggestions.length > 1
      ? ` También revisar ${suggestions[1].label}.`
      : "";

    return base + extra;
  }

  // DSQ warning si altura muy baja
  if (currentSetup.rideHeight <= 2) {
    return `${driverName}: ⚠️ ATENCIÓN — Altura del coche muy baja. Riesgo real de desgaste en el plano inferior. La FIA podría descalificar si se confirma en la báscula post-carrera.`;
  }

  return msgs.pace_good?.(driverName)
    || msgs.normal?.(driverName)
    || `${driverName}: Programa completado. Datos dentro de los márgenes esperados.`;
}

// ═══════════════════════════════════════════════════════════
//  ESTADO DE LA SESIÓN DE PRÁCTICA
// ═══════════════════════════════════════════════════════════

let practiceSessionState = {
  session:       null,   // "FP1" | "FP2" | "FP3"
  circuit:       null,
  race:          null,
  trackRubber:   0,
  weather:       "dry",

  // Por piloto
  driverStates:  {},
  // { driverId: {
  //   programs: [],          // lista de programas planificados
  //   currentProgramIdx: 0,
  //   lapsInCurrentProgram: 0,
  //   onTrack: false,
  //   compound: "medium",
  //   setup: {},             // setup actual
  //   optimalSetup: {},      // óptimo secreto
  //   setupScore: 0,
  //   confidence: 0,
  //   pendingFeedback: [],   // feedbacks sin leer
  // }}
};

function initPracticeSessionState(sessionKey, circuit, race, weather, allDrivers, teams) {
  const config     = SESSION_CONFIG[sessionKey];
  const trackRubber = config.trackRubber;

  practiceSessionState = {
    session:     sessionKey,
    circuit,
    race,
    trackRubber,
    weather:     weather || "dry",
    driverStates: {},
  };

  // Inicializar estado de cada piloto
  allDrivers.filter((d) => d.role !== "tester").forEach((driver) => {
    const team          = teams.find((t) => t.id === driver.teamId);
    const optimalSetup  = generateDriverOptimalSetup(driver, circuit);
    const defaultSetup  = generateDefaultSetup(circuit);
    const isPlayer      = window.selectedTeam && driver.teamId === window.selectedTeam.id;

    // IA genera su propio plan de programas
    let aiPrograms = [];
    if (!isPlayer) {
      aiPrograms = generateAIProgramPlan(sessionKey, driver, team, weather, circuit);
    }

    practiceSessionState.driverStates[driver.id] = {
      driverId:            driver.id,
      driverName:          driver.name,
      teamId:              driver.teamId,
      teamName:            team?.shortName || "-",
      teamColor:           team?.color || "#aaa",
      isPlayer,
      programs:            isPlayer ? [] : aiPrograms,
      currentProgramIdx:   0,
      lapsInCurrentProgram: 0,
      onTrack:             false,
      compound:            "medium",
      setup:               { ...defaultSetup },
      optimalSetup,
      setupScore:          calculateSetupScore(defaultSetup, optimalSetup),
      prevSetupScore:      0,
      confidence:          0,
      pendingFeedback:     [],
      lapsDone:            0,
      hasProblem:          false,
    };
  });

  return practiceSessionState;
}

function generateAIProgramPlan(sessionKey, driver, team, weather, circuit) {
  const config    = SESSION_CONFIG[sessionKey];
  // Mínimo realista: 20 vueltas en seco, 15 en lluvia
const wetSession  = weather === "light_rain" || weather === "heavy_rain";
const minRealLaps = wetSession ? 15 : 20;
const maxLaps     = Math.max(
  minRealLaps,
  config.lapsAvailable.min + Math.floor(Math.random() * (config.lapsAvailable.max - config.lapsAvailable.min + 1))
);
  const suggested = config.suggestedPrograms;
  const allowed   = config.allowedPrograms;
  const hasWet    = weather === "light_rain" || weather === "heavy_rain";

  let totalLaps = 0;
  const plan = [];

  // Siempre empezar con instalación en FP1
  if (sessionKey === "FP1" && Math.random() < 0.7) {
    const prog = WORK_PROGRAMS.find((p) => p.id === "install");
    const laps = prog.lapsMin + Math.floor(Math.random() * (prog.lapsMax - prog.lapsMin + 1));
    plan.push({ programId: "install", laps, compound: _selectAICompound("install", circuit) });
    totalLaps += laps;
  }

  // Añadir programas sugeridos
  const shuffled = [...suggested].sort(() => Math.random() - 0.5);
  for (const progId of shuffled) {
    if (totalLaps >= maxLaps - 3) break;
    const prog = WORK_PROGRAMS.find((p) => p.id === progId);
    if (!prog) continue;
    if (prog.weatherRequired && !hasWet) continue;
    const laps = prog.lapsMin + Math.floor(Math.random() * (prog.lapsMax - prog.lapsMin + 1));
    if (totalLaps + laps > maxLaps) continue;
    // IA elige compuesto según programa y disponibilidad
const aiCompound = _selectAICompound(progId, circuit);
plan.push({
  programId: progId,
  laps,
  compound: aiCompound,
});
    totalLaps += laps;
  }

  // Rellenar con programas permitidos si hay vueltas disponibles
  const extras = allowed.filter((id) => !suggested.includes(id) && id !== "install");
  for (const progId of extras.sort(() => Math.random() - 0.5)) {
    if (totalLaps >= maxLaps - 3) break;
    const prog = WORK_PROGRAMS.find((p) => p.id === progId);
    if (!prog) continue;
    if (prog.weatherRequired && !hasWet) continue;
    if (Math.random() < 0.4) continue; // no todos hacen todos los programas
    const laps = prog.lapsMin + Math.floor(Math.random() * (prog.lapsMax - prog.lapsMin + 1));
    if (totalLaps + laps > maxLaps) continue;
    plan.push({ programId: progId, laps, compound: _selectAICompound(progId, circuit) });
    totalLaps += laps;
  }

  return plan;
}

// ═══════════════════════════════════════════════════════════
//  ACTUALIZAR CONFIANZA
// ═══════════════════════════════════════════════════════════

function updateDriverConfidence(driverState, lapsCompleted, setupImproved, setupOptimal) {
  let delta = 0;
  delta += lapsCompleted * 2;           // +2% por vuelta
  if (setupImproved) delta += 5;        // +5% si el ajuste fue en buena dirección
  if (setupOptimal)  delta += 10;       // +10% si llegó al punto óptimo

  driverState.confidence = Math.min(100, (driverState.confidence || 0) + delta);
}

function completePracticeProgram(driverState) {
  // Llamar al finalizar un programa
  const programPlan = driverState.programs[driverState.currentProgramIdx];
  if (!programPlan) return;

  const program     = WORK_PROGRAMS.find((p) => p.id === programPlan.programId);
  if (!program) return;

  const prevScore   = driverState.prevSetupScore || 0;
  const newScore    = calculateSetupScore(driverState.setup, driverState.optimalSetup);
  const improved    = newScore > prevScore + 3;
  const optimal     = newScore >= 85;

  // Actualizar confianza
  updateDriverConfidence(driverState, programPlan.laps, improved, optimal);

  // Generar feedback
  const feedback = getSetupFeedback(
    driverState.driverName,
    program,
    driverState.setup,
    driverState.optimalSetup,
    prevScore
  );

  driverState.pendingFeedback.push({
    id:          Date.now() + Math.random(),
    programName: program.name,
    text:        feedback,
    score:       newScore,
    delta:       newScore - prevScore,
    read:        false,
    timestamp:   new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
  });

  driverState.prevSetupScore = newScore;
  driverState.setupScore     = newScore;
  driverState.lapsInCurrentProgram = 0;
  driverState.onTrack = false;
  driverState.currentProgramIdx++;
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════

function getAvailablePrograms(sessionKey, weather) {
  const config  = SESSION_CONFIG[sessionKey];
  const hasWet  = weather === "light_rain" || weather === "heavy_rain";
  return WORK_PROGRAMS.filter((p) => {
    if (!config.allowedPrograms.includes(p.id)) return false;
    if (p.weatherRequired && !hasWet) return false;
    return true;
  });
}

function getPracticeDriverState(driverId) {
  return practiceSessionState.driverStates[driverId] || null;
}

function getUnreadFeedbackCount() {
  let count = 0;
  const playerTeam = window.selectedTeam;
  if (!playerTeam) return 0;
  Object.values(practiceSessionState.driverStates).forEach((ds) => {
    if (ds.teamId === playerTeam.id) {
      count += ds.pendingFeedback.filter((f) => !f.read).length;
    }
  });
  return count;
}

// ═══════════════════════════════════════════════════════════
//  INVENTARIO DE NEUMÁTICOS POR SESIÓN
// ═══════════════════════════════════════════════════════════

const TYRE_SETS_PER_SESSION = {
  FP1: { soft: 3, medium: 2, hard: 1 },
  FP2: { soft: 2, medium: 2, hard: 2 },
  FP3: { soft: 3, medium: 1, hard: 1 },
};

function initPracticetyreInventory(sessionKey, circuit, allDrivers) {
  const sets      = TYRE_SETS_PER_SESSION[sessionKey] || { soft: 2, medium: 2, hard: 1 };
  const compounds = circuit?.compoundsAvailable || ["soft", "medium", "hard"];

  const inventory = {};

  allDrivers.filter((d) => d.role !== "tester").forEach((driver) => {
    inventory[driver.id] = {};
    compounds.forEach((cId, idx) => {
      const key        = idx === 0 ? "soft" : idx === 1 ? "medium" : "hard";
      const totalSets  = sets[key] || 1;
      inventory[driver.id][cId] = {
        total:  totalSets,
        sets:   Array.from({ length: totalSets }, (_, i) => ({
          index:    i,
          laps:     0,
          isNew:    true,
        })),
      };
    });
  });

  return inventory;
}

function getAvailableTyreSets(inventory, driverId, compoundId) {
  const driverInv = inventory[driverId];
  if (!driverInv || !driverInv[compoundId]) return { new: [], used: [] };

  const newSets  = driverInv[compoundId].sets.filter((s) => s.laps === 0);
  const usedSets = driverInv[compoundId].sets.filter((s) => s.laps > 0);

  return { new: newSets, used: usedSets };
}

function markTyreSetUsed(inventory, driverId, compoundId, isNew) {
  const driverInv = inventory[driverId];
  if (!driverInv || !driverInv[compoundId]) return;

  const sets = driverInv[compoundId].sets;
  if (isNew) {
    const freshSet = sets.find((s) => s.laps === 0);
    if (freshSet) freshSet.laps = 1;
  }
}

function getTyreSetFactor(inventory, driverId, compoundId, isNew) {
  // Sets usados arrancan con degradación acumulada
  if (isNew) return 1.0;

  const driverInv = inventory[driverId];
  if (!driverInv || !driverInv[compoundId]) return 1.02;

  const usedSets = driverInv[compoundId].sets.filter((s) => s.laps > 0);
  if (usedSets.length === 0) return 1.0;

  // El más gastado tiene mayor penalización
  const maxLaps = Math.max(...usedSets.map((s) => s.laps));
  return 1.0 + (maxLaps * 0.003); // 3ms por vuelta previa de desgaste
}

function _selectAICompound(programId, circuit) {
  const available = circuit?.compoundsAvailable || ["soft", "medium", "hard"];
  const soft      = available[0] || "soft";
  const medium    = available[1] || "medium";
  const hard      = available[2] || "hard";

  const r = Math.random();

  const map = {
    install:       medium,
    aero_corr:     r < 0.3 ? soft : medium,
    setup_balance: r < 0.2 ? hard : medium,
    tyre_deg:      r < 0.5 ? hard : (r < 0.8 ? medium : soft),
    race_sim:      r < 0.6 ? hard : medium,
    quali_prep:    r < 0.8 ? soft : medium,
    cooling:       r < 0.7 ? hard : medium,
    parts_eval:    r < 0.4 ? soft : (r < 0.7 ? medium : hard),
    wet_test:      "intermediate",
  };

  return map[programId] || medium;
}