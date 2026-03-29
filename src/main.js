// Main entry point - Pure Simulation
import { CONFIG } from './config.js';
import { Ball } from './entities/Ball.js';
import { BallPhysics } from './physics/ballPhysics.js';
import { Player } from './entities/Player.js';
import { PlayerPhysics } from './physics/playerPhysics.js';
import { CollisionSystem } from './physics/collision.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let ppm = 15;
let offsetX = 0;
let offsetY = 0;

// Pre-rendered grass pattern canvas (cached)
let grassPatternCanvas = null;
let grassPatternPpm = 0;

const ballPhysics = new BallPhysics();
const playerPhysics = new PlayerPhysics();
const collisionSystem = new CollisionSystem();

const ball = new Ball(CONFIG.pitch.width / 2, CONFIG.pitch.height / 2);

// 22 players — 11 per team, 4-3-3 formation
// Team 1 (Red): ids 0-10   Team 2 (Blue): ids 11-21
const players = [
  // Team 1 (Red)
  new Player(0,  'team1', 'goalkeeper'),
  new Player(1,  'team1', 'defender'),   // LB
  new Player(2,  'team1', 'defender'),   // CB-L
  new Player(3,  'team1', 'defender'),   // CB-R
  new Player(4,  'team1', 'defender'),   // RB
  new Player(5,  'team1', 'midfielder'), // DM
  new Player(6,  'team1', 'midfielder'), // CM-L
  new Player(7,  'team1', 'midfielder'), // CM-R
  new Player(8,  'team1', 'attacker'),   // LW
  new Player(9,  'team1', 'attacker'),   // ST
  new Player(10, 'team1', 'attacker'),   // RW
  // Team 2 (Blue)
  new Player(11, 'team2', 'goalkeeper'),
  new Player(12, 'team2', 'defender'),   // LB
  new Player(13, 'team2', 'defender'),   // CB-L
  new Player(14, 'team2', 'defender'),   // CB-R
  new Player(15, 'team2', 'defender'),   // RB
  new Player(16, 'team2', 'midfielder'), // DM
  new Player(17, 'team2', 'midfielder'), // CM-L
  new Player(18, 'team2', 'midfielder'), // CM-R
  new Player(19, 'team2', 'attacker'),   // LW
  new Player(20, 'team2', 'attacker'),   // ST
  new Player(21, 'team2', 'attacker'),   // RW
];

// Formation slots (formationDepth: 0=own goal, 1=opponent goal; formationY: 0=top, 1=bottom)
// 4-3-3: 4 DEF · 3 MID · 3 ATT
function applyFormationSlots() {
  // Team 1 (Red)
  players[1].formationDepth  = 0.18; players[1].formationY  = 0.15; // LB
  players[2].formationDepth  = 0.20; players[2].formationY  = 0.36; // CB-L
  players[3].formationDepth  = 0.20; players[3].formationY  = 0.64; // CB-R
  players[4].formationDepth  = 0.18; players[4].formationY  = 0.85; // RB
  players[5].formationDepth  = 0.38; players[5].formationY  = 0.50; // DM
  players[6].formationDepth  = 0.48; players[6].formationY  = 0.30; // CM-L
  players[7].formationDepth  = 0.48; players[7].formationY  = 0.70; // CM-R
  players[8].formationDepth  = 0.72; players[8].formationY  = 0.12; // LW
  players[9].formationDepth  = 0.78; players[9].formationY  = 0.50; // ST
  players[10].formationDepth = 0.72; players[10].formationY = 0.88; // RW

  // Team 2 (Blue) — Y positions mirrored so teams fill different channels
  players[12].formationDepth = 0.18; players[12].formationY = 0.85; // LB
  players[13].formationDepth = 0.20; players[13].formationY = 0.64; // CB-L
  players[14].formationDepth = 0.20; players[14].formationY = 0.36; // CB-R
  players[15].formationDepth = 0.18; players[15].formationY = 0.15; // RB
  players[16].formationDepth = 0.38; players[16].formationY = 0.50; // DM
  players[17].formationDepth = 0.48; players[17].formationY = 0.70; // CM-L
  players[18].formationDepth = 0.48; players[18].formationY = 0.30; // CM-R
  players[19].formationDepth = 0.72; players[19].formationY = 0.88; // LW
  players[20].formationDepth = 0.78; players[20].formationY = 0.50; // ST
  players[21].formationDepth = 0.72; players[21].formationY = 0.12; // RW
}

applyFormationSlots();

let score = { team1: 0, team2: 0 };

/** Wall-clock goal celebration (ms); sim pauses while active */
let goalFlashUntil = 0;
let goalFlashTeam = null;

// Which player ids are active for each field mode
const ACTIVE_IDS = {
  '11v11': new Set([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]),
  '5v5':   new Set([0,2,5,7,9, 11,13,16,18,20]), // GK + 1 CB + DM + CM + ST per team
};

function setInitialPositions() {
  const { pitch } = CONFIG;
  const cx = pitch.width / 2;
  const cy = pitch.height / 2;
  const is11 = pitch.width > 60;

  // Activate / deactivate players based on field mode
  const activeSet = is11 ? ACTIVE_IDS['11v11'] : ACTIVE_IDS['5v5'];
  players.forEach(p => {
    p.active = activeSet.has(p.id);
    if (!p.active) {
      p.position = { x: -999, y: -999 };
      p.velocity = { x: 0, y: 0 };
    }
  });

  if (is11) {
    // ── Team 1 Red (right half, attacks left) ──────────────────────────────
    players[0].position  = { x: pitch.width - 1, y: cy };        // GK
    players[1].position  = { x: cx + 26, y: cy - 24 };           // LB
    players[2].position  = { x: cx + 28, y: cy - 9  };           // CB-L
    players[3].position  = { x: cx + 28, y: cy + 9  };           // CB-R
    players[4].position  = { x: cx + 26, y: cy + 24 };           // RB
    players[5].position  = { x: cx + 17, y: cy      };           // DM
    players[6].position  = { x: cx + 12, y: cy - 12 };           // CM-L
    players[7].position  = { x: cx + 12, y: cy + 12 };           // CM-R
    players[8].position  = { x: cx +  4, y: cy - 22 };           // LW
    players[9].position  = { x: cx +  3, y: cy      };           // ST
    players[10].position = { x: cx +  4, y: cy + 22 };           // RW

    // ── Team 2 Blue (left half, attacks right) ────────────────────────────
    players[11].position = { x: 1,        y: cy      };           // GK
    players[12].position = { x: cx - 26,  y: cy + 24 };          // LB
    players[13].position = { x: cx - 28,  y: cy + 9  };          // CB-L
    players[14].position = { x: cx - 28,  y: cy - 9  };          // CB-R
    players[15].position = { x: cx - 26,  y: cy - 24 };          // RB
    players[16].position = { x: cx - 17,  y: cy      };          // DM
    players[17].position = { x: cx - 12,  y: cy + 12 };          // CM-L
    players[18].position = { x: cx - 12,  y: cy - 12 };          // CM-R
    players[19].position = { x: cx -  4,  y: cy + 22 };          // LW
    players[20].position = { x: cx -  3,  y: cy      };          // ST
    players[21].position = { x: cx -  4,  y: cy - 22 };          // RW
  } else {
    // ── 5v5 on small pitch (40×25) ────────────────────────────────────────
    // Team 1 Red (right half): GK + CB-L + DM + CM-R + ST
    players[0].position  = { x: pitch.width - 1, y: cy     };    // GK
    players[2].position  = { x: cx + 8,          y: cy - 3 };    // CB
    players[5].position  = { x: cx + 3,          y: cy - 4 };    // DM
    players[7].position  = { x: cx + 3,          y: cy + 4 };    // CM
    players[9].position  = { x: cx - 4,          y: cy + 3 };    // ST

    // Team 2 Blue (left half): GK + CB-L + DM + CM-R + ST
    players[11].position = { x: 1,               y: cy     };    // GK
    players[13].position = { x: cx - 8,          y: cy + 3 };    // CB
    players[16].position = { x: cx - 3,          y: cy + 4 };    // DM
    players[18].position = { x: cx - 3,          y: cy - 4 };    // CM
    players[20].position = { x: cx + 4,          y: cy - 3 };    // ST
  }
}

setInitialPositions();
players.forEach(p => p.isAI = true);

ball.kick(12, 8, 15);

const deltaTimeMs = 16.67;
let timeAccumulator = 0;
let lastFrameTime = performance.now();
let gameTime = 0;
let isPaused = false;

function getActivePlayers() {
  return players.filter(p => p.active);
}

/** Build a cached grass-stripe canvas (mowing pattern) for the pitch area */
function buildGrassPattern(pitch, ppm) {
  const w = Math.ceil(pitch.width * ppm);
  const h = Math.ceil(pitch.height * ppm);
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const gctx = offscreen.getContext('2d');

  // Base green
  gctx.fillStyle = '#3a8c2a';
  gctx.fillRect(0, 0, w, h);

  // Alternating vertical stripes (mowing lines) — ~5.25m wide (1/20 of pitch)
  const stripeWidthM = pitch.width / 20;
  const stripeWidthPx = stripeWidthM * ppm;
  for (let i = 0; i < 20; i++) {
    if (i % 2 === 0) {
      gctx.fillStyle = 'rgba(255,255,255,0.04)';
    } else {
      gctx.fillStyle = 'rgba(0,0,0,0.04)';
    }
    gctx.fillRect(i * stripeWidthPx, 0, stripeWidthPx, h);
  }

  return offscreen;
}

function updateCanvasSize() {
  const { pitch } = CONFIG;
  // Margin around pitch for surrounding area (meters, scaled)
  const marginM = 4; // meters of surround visible
  const totalWidth = pitch.width + (pitch.goalDepth || 1) * 2 + marginM * 2;
  const totalHeight = pitch.height + marginM * 2;

  const maxWidth = Math.min(window.innerWidth - 20, 1400);
  const maxHeight = Math.min(window.innerHeight - 80, 900);

  ppm = Math.min(15, maxWidth / totalWidth, maxHeight / totalHeight);
  ppm = Math.max(5, ppm);

  canvas.width  = Math.ceil(totalWidth  * ppm);
  canvas.height = Math.ceil(totalHeight * ppm);

  offsetX = ((pitch.goalDepth || 1) + marginM) * ppm;
  offsetY = marginM * ppm;

  // Rebuild grass pattern cache when ppm changes
  if (Math.abs(grassPatternPpm - ppm) > 0.01) {
    grassPatternCanvas = buildGrassPattern(pitch, ppm);
    grassPatternPpm = ppm;
  }
}

function loop() {
  try {
    const now = performance.now();

    if (goalFlashTeam) {
      if (now >= goalFlashUntil) {
        resetAfterGoal();
        goalFlashTeam = null;
        goalFlashUntil = 0;
      } else {
        render();
        updateStats();
        requestAnimationFrame(loop);
        return;
      }
    }

    let frameTime = now - lastFrameTime;
    lastFrameTime = now;

    if (frameTime > 50) frameTime = 50;
    // Hard cap: never process more than 10 steps per frame (prevents spiral-of-death)
    timeAccumulator = Math.min(timeAccumulator + frameTime, deltaTimeMs * 10);

    // When paused, keep rendering but freeze physics
    if (isPaused) {
      render();
      updateStats();
      requestAnimationFrame(loop);
      return;
    }

    while (timeAccumulator >= deltaTimeMs) {
      const dt = deltaTimeMs / 1000;
      gameTime += dt;

      const active = getActivePlayers();
      active.forEach(p => {
        try { p.updateAI(ball, CONFIG.pitch, gameTime, dt, active); } catch(e) { console.error('AI error:', e.message); }
      });
      active.forEach(p => playerPhysics.update(p, dt));
      ballPhysics.update(ball, dt);
      collisionSystem.update(ball, active, dt);

      // Check goals after position integration but note: boundary handler
      // already lets balls through the goal opening, so this ordering is safe.
      checkGoals();

      // Clamp ball velocity as a safety net against NaN / runaway values
      const bSpeed = ball.getSpeed();
      if (!isFinite(bSpeed) || bSpeed > 35) {
        const cap = 25;
        if (!isFinite(bSpeed)) {
          ball.velocity.x = 0;
          ball.velocity.y = 0;
          ball.spin = 0;
        } else {
          const s = cap / bSpeed;
          ball.velocity.x *= s;
          ball.velocity.y *= s;
        }
      }

      timeAccumulator -= deltaTimeMs;
    }

    render();
    updateStats();
    requestAnimationFrame(loop);
  } catch (e) {
    console.error('Loop error:', e);
  }
}

function checkGoals() {
  if (goalFlashTeam) return;

  const goalWidth = CONFIG.pitch.goalWidth || 3;
  const goalY = (CONFIG.pitch.height - goalWidth) / 2;

  if (ball.position.x < 0 && ball.position.y > goalY && ball.position.y < goalY + goalWidth) {
    score.team1++;
    goalFlashTeam = 'team1';
    goalFlashUntil = performance.now() + 1200;
    return;
  }

  if (ball.position.x > CONFIG.pitch.width && ball.position.y > goalY && ball.position.y < goalY + goalWidth) {
    score.team2++;
    goalFlashTeam = 'team2';
    goalFlashUntil = performance.now() + 1200;
  }
}

/**
 * Update each outfield player's mentalityShift based on current scoreline.
 * Losing team pushes formation higher; winning team sits deeper.
 */
function updateMentality() {
  players.forEach(p => {
    if (p.isGoalkeeper || p.formationDepth === undefined) return;
    const diff = p.team === 'team1'
      ? score.team1 - score.team2
      : score.team2 - score.team1;
    // Losing by N goals → shift up to +0.12 (push forward); winning → up to -0.12 (sit deep)
    p.mentalityShift = Math.max(-0.12, Math.min(0.12, -diff * 0.06));
  });
}

function resetAfterGoal() {
  ball.position = { x: CONFIG.pitch.width / 2, y: CONFIG.pitch.height / 2 };
  ball.velocity = { x: 0, y: 0 };
  ball.spin = 0;
  ball.isAirborne = false;
  ball.height = 0;
  ball.heldBy = null;

  updateMentality();
  setInitialPositions();

  setTimeout(() => {
    ball.kick((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 10);
  }, 100);
}

function updateStats() {
  // Score/time now rendered on canvas via drawScoreboard(); keep DOM in sync for accessibility
  const mins = Math.floor(gameTime / 60);
  const secs = Math.floor(gameTime % 60);
  const el = document.getElementById('timeDisplay');
  if (el) el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  const se = document.getElementById('scoreDisplay');
  if (se) se.textContent = `RED ${score.team1} - ${score.team2} BLUE`;
}

function render() {
  try {
    // Dark surround area
    ctx.fillStyle = '#2a5a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Draw grass pattern
    if (grassPatternCanvas) {
      ctx.drawImage(grassPatternCanvas, 0, 0);
    } else {
      ctx.fillStyle = '#3a8c2a';
      ctx.fillRect(0, 0, CONFIG.pitch.width * ppm, CONFIG.pitch.height * ppm);
    }

    drawPitch();

    // Draw player shadows first (underneath all players)
    const active = getActivePlayers();
    active.forEach(p => drawPlayerShadow(p));

    // Draw players sorted by y-position for pseudo-depth
    const sorted = [...active].sort((a, b) => a.position.y - b.position.y);
    sorted.forEach(p => drawPlayer(p));

    drawBall();
    ctx.restore();

    // Overlays
    drawScoreboard();
    if (goalFlashTeam) drawGoalFlash();
    if (isPaused) drawPauseOverlay();
  } catch(e) {
    console.error('Render error:', e.message);
    try { ctx.restore(); } catch(_) {}
  }
}

function drawGoalFlash() {
  const elapsed = performance.now() - (goalFlashUntil - 1200);
  const progress = Math.min(1, elapsed / 1200);

  // Darkened overlay
  ctx.fillStyle = `rgba(0,0,0,${0.3 + 0.1 * Math.sin(elapsed / 150)})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Banner background
  const bannerH = 70;
  const bannerY = canvas.height / 2 - bannerH / 2;
  const teamColor = goalFlashTeam === 'team1' ? 'rgba(230,57,70,0.9)' : 'rgba(69,123,157,0.9)';
  ctx.fillStyle = teamColor;
  ctx.fillRect(0, bannerY, canvas.width, bannerH);

  // White accent lines
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, bannerY); ctx.lineTo(canvas.width, bannerY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, bannerY + bannerH); ctx.lineTo(canvas.width, bannerY + bannerH); ctx.stroke();

  // GOAL text
  const name = goalFlashTeam === 'team1' ? 'RED' : 'BLUE';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${Math.min(48, canvas.width * 0.06)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GOAL!', canvas.width / 2, canvas.height / 2 - 6);
  ctx.font = `${Math.min(20, canvas.width * 0.025)}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(`${name}  ${score.team1} - ${score.team2}`, canvas.width / 2, canvas.height / 2 + 22);
}

/** Broadcast-style scoreboard overlay at top center of canvas */
function drawScoreboard() {
  const w = Math.min(280, canvas.width * 0.4);
  const h = 36;
  const x = (canvas.width - w) / 2;
  const y = 8;
  const r = 4; // border radius

  // Background
  ctx.fillStyle = 'rgba(15,15,15,0.82)';
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const mid = x + w / 2;
  const fontSize = Math.min(15, h * 0.42);
  const smallFont = Math.min(10, h * 0.28);

  // Team color badges
  const badgeW = 4;
  ctx.fillStyle = '#e63946';
  ctx.fillRect(x + 1, y + 1, badgeW, h - 2);
  ctx.fillStyle = '#457b9d';
  ctx.fillRect(x + w - badgeW - 1, y + 1, badgeW, h - 2);

  // Team names
  ctx.fillStyle = '#e63946';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('RED', mid - 30, y + h / 2);

  ctx.fillStyle = '#457b9d';
  ctx.textAlign = 'left';
  ctx.fillText('BLUE', mid + 30, y + h / 2);

  // Score
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${fontSize + 2}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${score.team1} - ${score.team2}`, mid, y + h / 2);

  // Time (bottom-right of scoreboard)
  const mins = Math.floor(gameTime / 60);
  const secs = Math.floor(gameTime % 60);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `${smallFont}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, mid, y + h + smallFont + 2);
}

function drawPauseOverlay() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Rounded pill
  const pw = Math.min(260, canvas.width * 0.3);
  const ph = 40;
  const px = (canvas.width - pw) / 2;
  const py = (canvas.height - ph) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.moveTo(px + ph / 2, py);
  ctx.lineTo(px + pw - ph / 2, py);
  ctx.arc(px + pw - ph / 2, py + ph / 2, ph / 2, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(px + ph / 2, py + ph);
  ctx.arc(px + ph / 2, py + ph / 2, ph / 2, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.min(16, ph * 0.4)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED  \u2014  SPACE to resume', canvas.width / 2, canvas.height / 2);
}


function drawPitch() {
  const { pitch } = CONFIG;
  const lw = Math.max(1.5, ppm * 0.12); // line width scales with zoom
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const W = pitch.width * ppm;
  const H = pitch.height * ppm;
  const cx = W / 2;
  const cy = H / 2;

  // Outer boundary
  ctx.strokeRect(0, 0, W, H);

  // Halfway line
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, H);
  ctx.stroke();

  // Center circle (9.15m radius for 11v11)
  const ccr = (pitch.width > 60 ? 9.15 : pitch.centerSpotRadius) * ppm;
  ctx.beginPath();
  ctx.arc(cx, cy, ccr, 0, Math.PI * 2);
  ctx.stroke();

  // Center spot
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, ppm * 0.1), 0, Math.PI * 2);
  ctx.fill();

  // Penalty areas
  const penaltyY = (pitch.height - pitch.penaltyAreaHeight) / 2;
  ctx.strokeRect(0, penaltyY * ppm, pitch.penaltyAreaWidth * ppm, pitch.penaltyAreaHeight * ppm);
  ctx.strokeRect((pitch.width - pitch.penaltyAreaWidth) * ppm, penaltyY * ppm, pitch.penaltyAreaWidth * ppm, pitch.penaltyAreaHeight * ppm);

  // Goal areas (6-yard box)
  const goalAreaY = (pitch.height - pitch.goalAreaHeight) / 2;
  ctx.strokeRect(0, goalAreaY * ppm, pitch.goalAreaWidth * ppm, pitch.goalAreaHeight * ppm);
  ctx.strokeRect((pitch.width - pitch.goalAreaWidth) * ppm, goalAreaY * ppm, pitch.goalAreaWidth * ppm, pitch.goalAreaHeight * ppm);

  // Penalty spots
  const penSpotR = Math.max(1.5, ppm * 0.08);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(pitch.penaltySpotDistance * ppm, cy, penSpotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc((pitch.width - pitch.penaltySpotDistance) * ppm, cy, penSpotR, 0, Math.PI * 2);
  ctx.fill();

  // Penalty arcs (the "D" outside the penalty area)
  if (pitch.width > 60) {
    const penArcR = 9.15 * ppm; // same as center circle
    const penBoxEdge = pitch.penaltyAreaWidth * ppm;
    // Left penalty arc
    const leftPenX = pitch.penaltySpotDistance * ppm;
    const halfAngle = Math.acos((penBoxEdge - leftPenX) / penArcR);
    ctx.beginPath();
    ctx.arc(leftPenX, cy, penArcR, -halfAngle, halfAngle);
    ctx.stroke();
    // Right penalty arc
    const rightPenX = (pitch.width - pitch.penaltySpotDistance) * ppm;
    const rightBoxEdge = (pitch.width - pitch.penaltyAreaWidth) * ppm;
    const halfAngleR = Math.acos((rightPenX - rightBoxEdge) / penArcR);
    ctx.beginPath();
    ctx.arc(rightPenX, cy, penArcR, Math.PI - halfAngleR, Math.PI + halfAngleR);
    ctx.stroke();
  }

  // Corner arcs
  const cornerR = (pitch.width > 60 ? 1.0 : 0.5) * ppm;
  // Top-left
  ctx.beginPath(); ctx.arc(0, 0, cornerR, 0, Math.PI / 2); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.arc(W, 0, cornerR, Math.PI / 2, Math.PI); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.arc(0, H, cornerR, -Math.PI / 2, 0); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.arc(W, H, cornerR, Math.PI, Math.PI * 1.5); ctx.stroke();

  drawGoals();
}

function drawGoals() {
  const { pitch } = CONFIG;
  const goalWidth = pitch.goalWidth || 3;
  const goalDepth = pitch.goalDepth || 0.5;
  const goalY = (pitch.height - goalWidth) / 2;
  const postW = Math.max(2, ppm * 0.15);

  // Net fill (semi-transparent white)
  ctx.fillStyle = 'rgba(255,255,255,0.12)';

  // Left goal net fill
  ctx.fillRect(-goalDepth * ppm, goalY * ppm, goalDepth * ppm, goalWidth * ppm);
  // Right goal net fill
  ctx.fillRect(pitch.width * ppm, goalY * ppm, goalDepth * ppm, goalWidth * ppm);

  // Net mesh pattern
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 0.5;
  const meshSpacing = Math.max(3, ppm * 0.3);
  // Left goal mesh
  for (let y = goalY * ppm; y <= (goalY + goalWidth) * ppm; y += meshSpacing) {
    ctx.beginPath(); ctx.moveTo(-goalDepth * ppm, y); ctx.lineTo(0, y); ctx.stroke();
  }
  for (let x = -goalDepth * ppm; x <= 0; x += meshSpacing) {
    ctx.beginPath(); ctx.moveTo(x, goalY * ppm); ctx.lineTo(x, (goalY + goalWidth) * ppm); ctx.stroke();
  }
  // Right goal mesh
  for (let y = goalY * ppm; y <= (goalY + goalWidth) * ppm; y += meshSpacing) {
    ctx.beginPath(); ctx.moveTo(pitch.width * ppm, y); ctx.lineTo((pitch.width + goalDepth) * ppm, y); ctx.stroke();
  }
  for (let x = pitch.width * ppm; x <= (pitch.width + goalDepth) * ppm; x += meshSpacing) {
    ctx.beginPath(); ctx.moveTo(x, goalY * ppm); ctx.lineTo(x, (goalY + goalWidth) * ppm); ctx.stroke();
  }

  // Goal posts (thick white)
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = postW;
  // Left goal frame
  ctx.beginPath();
  ctx.moveTo(0, goalY * ppm);
  ctx.lineTo(-goalDepth * ppm, goalY * ppm);
  ctx.lineTo(-goalDepth * ppm, (goalY + goalWidth) * ppm);
  ctx.lineTo(0, (goalY + goalWidth) * ppm);
  ctx.stroke();
  // Right goal frame
  ctx.beginPath();
  ctx.moveTo(pitch.width * ppm, goalY * ppm);
  ctx.lineTo((pitch.width + goalDepth) * ppm, goalY * ppm);
  ctx.lineTo((pitch.width + goalDepth) * ppm, (goalY + goalWidth) * ppm);
  ctx.lineTo(pitch.width * ppm, (goalY + goalWidth) * ppm);
  ctx.stroke();
}

function drawBall() {
  const groundX = ball.position.x * ppm;
  const groundY = ball.position.y * ppm;
  const heightPx = ball.height * ppm * 3; // exaggerate height for visibility
  const ballX = groundX;
  const ballY = groundY - heightPx;
  const ballRadius = Math.max(2.5, ball.radius * ppm);

  // Drop shadow (separates from ball when airborne)
  const shadowAlpha = Math.max(0.08, 0.22 - ball.height * 0.15);
  const shadowScale = 1 + ball.height * 0.8;
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(groundX + 1, groundY + 1, ballRadius * shadowScale, ballRadius * 0.4 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball
  ctx.save();
  ctx.translate(ballX, ballY);
  ctx.rotate(ball.rotation);

  // White body
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
  ctx.fill();

  // Pentagon pattern
  ctx.fillStyle = '#222';
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI / 5) - Math.PI / 2;
    const cx = Math.cos(a) * ballRadius * 0.42;
    const cy = Math.sin(a) * ballRadius * 0.42;
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const pa = (j * 2 * Math.PI / 5) - Math.PI / 2 + a;
      const ppx = cx + Math.cos(pa) * ballRadius * 0.18;
      const ppy = cy + Math.sin(pa) * ballRadius * 0.18;
      if (j === 0) ctx.moveTo(ppx, ppy); else ctx.lineTo(ppx, ppy);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Outline
  ctx.strokeStyle = '#444';
  ctx.lineWidth = Math.max(0.5, ppm * 0.04);
  ctx.beginPath();
  ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawPlayerShadow(p) {
  const px = p.position.x * ppm;
  const py = p.position.y * ppm;
  const r = Math.max(4, p.radius * ppm);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(px + r * 0.3, py + r * 0.4, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(p) {
  const px = p.position.x * ppm;
  const py = p.position.y * ppm;
  const r = Math.max(4, p.radius * ppm);

  // Team colors — home red vs away blue; GK gets distinct color
  let jerseyColor, shortsColor, outlineColor;
  if (p.isGoalkeeper) {
    jerseyColor = p.team === 'team1' ? '#f5c542' : '#42f5a4';
    shortsColor = p.team === 'team1' ? '#b8941f' : '#1fb87a';
    outlineColor = p.team === 'team1' ? '#d4a017' : '#17a06a';
  } else {
    jerseyColor = p.team === 'team1' ? '#e63946' : '#457b9d';
    shortsColor = p.team === 'team1' ? '#c1121f' : '#1d3557';
    outlineColor = p.team === 'team1' ? '#a4161a' : '#14213d';
  }

  // "Shorts" — small lower ellipse
  ctx.fillStyle = shortsColor;
  ctx.beginPath();
  ctx.ellipse(px, py + r * 0.25, r * 0.6, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // "Jersey" — main body circle
  ctx.fillStyle = jerseyColor;
  ctx.beginPath();
  ctx.arc(px, py - r * 0.1, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = Math.max(1, ppm * 0.06);
  ctx.stroke();

  // Jersey number
  const num = getPlayerNumber(p);
  const fontSize = Math.max(6, r * 0.95);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, px, py - r * 0.08);

  // Facing direction indicator (subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = Math.max(1, ppm * 0.05);
  ctx.beginPath();
  ctx.moveTo(px, py - r * 0.1);
  ctx.lineTo(px + Math.cos(p.angle) * r * 1.3, py - r * 0.1 + Math.sin(p.angle) * r * 1.3);
  ctx.stroke();
}

/** Map player id to realistic jersey number */
function getPlayerNumber(p) {
  // Standard numbering: GK=1, defenders 2-5, midfield 6-8, attack 9-11
  const teamOffset = p.team === 'team1' ? 0 : 11;
  const localId = p.id - teamOffset;
  const numberMap = [1, 2, 3, 4, 5, 6, 7, 8, 11, 9, 10]; // GK, LB, CB-L, CB-R, RB, DM, CM-L, CM-R, LW, ST, RW
  return numberMap[localId] !== undefined ? numberMap[localId] : localId + 1;
}

// Field selector
document.getElementById('btn5v5').addEventListener('click', () => setField('5v5'));
document.getElementById('btn11v11').addEventListener('click', () => setField('11v11'));

function setField(type) {
  CONFIG.pitch = CONFIG.pitches[type];
  document.getElementById('btn5v5').classList.toggle('active', type === '5v5');
  document.getElementById('btn11v11').classList.toggle('active', type === '11v11');
  // Force grass pattern rebuild for new pitch dimensions
  grassPatternPpm = 0;
  updateCanvasSize();

  ball.position = { x: CONFIG.pitch.width / 2, y: CONFIG.pitch.height / 2 };
  ball.velocity = { x: 0, y: 0 };
  ball.spin = 0;
  ball.isAirborne = false;
  ball.height = 0;
  ball.heldBy = null;

  players.forEach(p => {
    p.velocity    = { x: 0, y: 0 };
    p.stamina     = p.staminaMax;
    p.targetGoal  = null;
    p._ballCarrierTime = 0;
    p._oneTwoActive    = false;
    p._oneTwoTarget    = null;
    p._passTargetOptions = [];
    if (p.isGoalkeeper) {
      p.holdingBall = false;
      p.holdTime    = 0;
      p.isDiving    = false;
    }
  });

  applyFormationSlots();
  setInitialPositions();

  ball.kick((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 10);

}

// Space to pause/resume (register once)
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    isPaused = !isPaused;
  }
});

// Resize on window change
window.addEventListener('resize', () => {
  updateCanvasSize();
});

updateCanvasSize();
loop();

// Capture uncaught errors
window.addEventListener('error', e => {
  console.error('UNCAUGHT:', e.message, '|', e.filename, 'line', e.lineno);
});
window.addEventListener('unhandledrejection', e => {
  console.error('UNHANDLED:', e.reason?.message || e.reason);
});
