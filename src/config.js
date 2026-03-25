// SoccerSim Configuration
// All tunable constants for physics, AI, rendering
// Units: METERS (m, m/s, kg, etc.)

export const CONFIG = {
  // Pitch presets
  pitches: {
    '5v5': {
      name: 'Small pitch',
      width: 40,
      height: 25,
      centerSpotRadius: 0.5,
      goalAreaWidth: 8,
      goalAreaHeight: 4,
      penaltyAreaWidth: 12,
      penaltyAreaHeight: 8,
      penaltySpotDistance: 9,
      goalWidth: 3,
      goalDepth: 0.5,
    },
    '11v11': {
      name: 'Full pitch',
      width: 105,       // FIFA standard
      height: 68,       // FIFA standard
      centerSpotRadius: 0.915,  // 3ft in meters
      goalAreaWidth: 18.32,     // 6-yard box (6 yards = 5.5m each side)
      goalAreaHeight: 5.5,
      penaltyAreaWidth: 40.32,  // 18-yard box (18 yards = 16.5m each side)
      penaltyAreaHeight: 16.5,
      penaltySpotDistance: 11,  // 12 yards = 11m
      goalWidth: 7.32,  // 8 yards
      goalDepth: 2,
    },
  },

  // Current pitch (switchable)
  pitch: null,  // Set at runtime

  // Physics constants
  physics: {
    ball: {
      radius: 0.11,           // 11cm (standard size 5 ball)
      mass: 0.43,             // kg
      restitution: 0.75,      // bounce coefficient
      
      // Real air drag physics: F_D = 0.5 * C_d * ρ * A * v²
      dragCoeff: 0.25,        // C_d: soccer ball (~0.2-0.25)
      airDensity: 1.225,      // ρ: kg/m³ at sea level, 15°C
      area: 0.038,            // A: π * r² = π * 0.11² ≈ 0.038 m²
      
      friction: 0.15,         // μ: rolling friction on grass
      spinDecay: 0.995,       // spin reduction per frame
      maxSpin: 30,            // rad/s
    },
  },

  // AI tuning (meters, m/s where relevant)
  ai: {
    pressureRadius: 3.2,
    passPowerMin: 12,
    passPowerMax: 22,
    shootRangeBase: 17,
    dribbleSpeed: 4.2,
    supportAhead: 10,
    defendGoalBlend: 0.55,
    formationBallShift: 0.3,  // how much the team's line shifts with ball X (0=none, 1=full)
    markingGoalSide: 0.4,     // how far goal-side to position when marking (0=on opp, 1=goal line)
    markingBlend: 0.5,        // blend between marking target and goal-protection formula
  },

  // Rendering
  rendering: {
    ballColor: '#FFFFFF',
    pitchColor: '#2d5016',
    lineColor: '#FFFFFF',
    fpsCap: 60,
  },
};

// Initialize with 5v5
CONFIG.pitch = CONFIG.pitches['5v5'];
