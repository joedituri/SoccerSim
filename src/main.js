// Main entry point - Pure Simulation
import { CONFIG } from './config.js';
import { Ball } from './entities/Ball.js';
import { BallPhysics } from './physics/ballPhysics.js';
import { Player, getBallPossessor } from './entities/Player.js';
import { PlayerPhysics } from './physics/playerPhysics.js';
import { CollisionSystem } from './physics/collision.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let ppm = 15;
let offsetX = 0;
let offsetY = 0;
let debugOffsetY = 0;

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

function updateCanvasSize() {
  const { pitch } = CONFIG;
  const maxWidth = Math.min(window.innerWidth - 20, 1000);
  const maxHeight = Math.min(window.innerHeight * 0.75, 650);

  const totalWidth = pitch.width + (pitch.goalDepth || 1) * 2;
  const totalHeight = pitch.height;

  ppm = Math.min(15, maxWidth / totalWidth, maxHeight / totalHeight);
  ppm = Math.max(5, ppm);

  const PITCH_HEIGHT = Math.ceil(totalHeight * ppm);
  const DEBUG_HEIGHT = 160; // pixels for the debug panel below the pitch

  canvas.width  = Math.ceil(totalWidth  * ppm);
  canvas.height = PITCH_HEIGHT + DEBUG_HEIGHT;

  offsetX = (pitch.goalDepth || 1) * ppm;
  debugOffsetY = PITCH_HEIGHT; // pitch renders at top, debug panel below

  const label = pitch.name || 'Pitch';
  const mode  = pitch.width > 60 ? '11v11+GK' : '5v5+GK';
  document.getElementById('fieldInfo').textContent =
    `${label} · ${pitch.width}×${pitch.height} m · ${mode}`;
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

      checkGoals();

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
  const mins = Math.floor(gameTime / 60);
  const secs = Math.floor(gameTime % 60);
  document.getElementById('timeDisplay').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  document.getElementById('scoreDisplay').textContent = `RED ${score.team1} - ${score.team2} BLUE`;
}

function render() {
  try {
    ctx.fillStyle = CONFIG.rendering.pitchColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    drawPitch();
    getActivePlayers().forEach(p => drawPlayer(p));
    drawPassIndicators();
    drawBall();
    ctx.restore();
    if (goalFlashTeam) drawGoalFlash();
    if (isPaused) drawPauseOverlay();
    drawDebugPanel();
  } catch(e) {
    console.error('Render error:', e.message);
    try { ctx.restore(); } catch(_) {}
  }
}

function drawGoalFlash() {
  const alpha = 0.22 + 0.08 * Math.sin(performance.now() / 200);
  ctx.fillStyle = `rgba(255, 220, 60, ${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const name = goalFlashTeam === 'team1' ? 'RED' : 'BLUE';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GOAL!', canvas.width / 2, canvas.height / 2 - 28);
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = goalFlashTeam === 'team1' ? '#ff6b6b' : '#74c0fc';
  ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 22);
}

function drawPassIndicators() {
  // Find the ball carrier
  const active = getActivePlayers();
  let carrier = null;
  let minDist = Infinity;
  for (const p of active) {
    if (p.isGoalkeeper) continue;
    const d = p.distanceTo(ball.position);
    if (d < p.influenceRadius + ball.radius && d < minDist) {
      minDist = d;
      carrier = p;
    }
  }
  if (!carrier || !carrier._passTargetOptions || carrier._passTargetOptions.length === 0) return;

  // Draw indicators for top 3 pass targets (filter out any stale/invalid entries)
  const options = carrier._passTargetOptions.filter(opt => opt && opt.player && opt.player.active);
  const colors = ['#00FF88', '#FFD700', '#FF8C00']; // gold, silver, bronze
  const labels = ['1st', '2nd', '3rd'];

  options.forEach((opt, i) => {
    const t = opt.player;
    if (!t || !t.position) return;
    const cx = t.position.x * ppm;
    const cy = t.position.y * ppm;
    const color = colors[i] || '#888888';

    // Pulsing ring around the target
    const pulse = 1 + 0.08 * Math.sin(performance.now() / 250 + i);
    const outerR = (t.radius + 0.6) * ppm * pulse;
    const innerR = (t.radius + 0.3) * ppm;

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Small label
    ctx.fillStyle = color;
    ctx.font = `bold 9px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(labels[i], cx, cy - outerR - 2);

    // Draw dotted pass line from carrier to target
    if (opt.leadPos) {
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(ball.position.x * ppm, ball.position.y * ppm);
      ctx.lineTo(opt.leadPos.x * ppm, opt.leadPos.y * ppm);
      ctx.strokeStyle = opt.laneClear ? 'rgba(0,255,136,0.4)' : 'rgba(255,80,80,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      // Lead position dot
      ctx.beginPath();
      ctx.arc(opt.leadPos.x * ppm, opt.leadPos.y * ppm, 3, 0, Math.PI * 2);
      ctx.fillStyle = opt.laneClear ? 'rgba(0,255,136,0.5)' : 'rgba(255,80,80,0.5)';
      ctx.fill();
    }
  });

  // Label carrier
  const ccx = carrier.position.x * ppm;
  const ccy = carrier.position.y * ppm;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('⚡ CARRYING', ccx, ccy - (carrier.radius + 0.7) * ppm);
}

function drawPauseOverlay() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⏸  PAUSED  —  Press SPACE to resume', canvas.width / 2, canvas.height / 2);
}

function drawDebugPanel() {
  const active = getActivePlayers();
  const startY = debugOffsetY + 8;
  const rowH = 13;
  const team1Players = active.filter(p => p.team === 'team1').sort((a,b) => a.id - b.id);
  const team2Players = active.filter(p => p.team === 'team2').sort((a,b) => a.id - b.id);

  ctx.save();

  // Background
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, debugOffsetY, canvas.width, 160);

  // Header
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = '#8b949e';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('T', 6, startY);
  ctx.fillText('ID', 26, startY);
  ctx.fillText('ROLE', 46, startY);
  ctx.fillText('DIST', 80, startY);
  ctx.fillText('SPD', 112, startY);
  ctx.fillText('STATE', 140, startY);
  ctx.fillText('BALL', 230, startY);

  // Divider
  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, startY + 14);
  ctx.lineTo(canvas.width, startY + 14);
  ctx.stroke();

  function drawPlayerRow(p, y, color) {
    const dist = p.distanceTo(ball.position);
    const spd = p.getSpeed();
    const state = getPlayerStateLabel(p, ball);

    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = color;
    ctx.fillText(p.team === 'team1' ? 'T1' : 'T2', 6, y);
    ctx.fillText(`#${p.id}`, 26, y);
    ctx.fillText((p.role || '?').slice(0, 10), 46, y);
    ctx.fillStyle = dist < 2 ? '#ff6b6b' : dist < 8 ? '#ffd93d' : '#8b949e';
    ctx.fillText(dist.toFixed(1), 80, y);
    ctx.fillStyle = spd > p.maxSpeed * 0.8 ? '#ff6b6b' : '#8b949e';
    ctx.fillText(spd.toFixed(1), 112, y);
    ctx.fillStyle = '#c9d1d9';
    ctx.fillText(state, 140, y);
    ctx.fillStyle = '#8b949e';
    ctx.fillText(ball.isAirborne ? 'AIR' : ball.heldBy ? 'HELD' : 'RUN', 230, y);
  }

  // Team 1
  team1Players.forEach((p, i) => drawPlayerRow(p, startY + 18 + i * rowH, '#ff6b6b'));

  // Separator
  const sepY = startY + 18 + team1Players.length * rowH + 4;
  ctx.strokeStyle = '#30363d';
  ctx.beginPath();
  ctx.moveTo(0, sepY);
  ctx.lineTo(canvas.width, sepY);
  ctx.stroke();

  // Team 2
  team2Players.forEach((p, i) => drawPlayerRow(p, sepY + 8 + i * rowH, '#74c0fc'));

  // Hint
  ctx.fillStyle = '#484f58';
  ctx.font = '8px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('SPACE = pause/resume', canvas.width - 6, debugOffsetY + 156);

  ctx.restore();
}

function getPlayerStateLabel(p, ball) {
  if (p.isGoalkeeper) {
    if (p.isDiving) return 'DIVING';
    if (p.holdingBall) return 'HOLDING';
    return 'GK';
  }
  if (p._oneTwoActive) return '1-2 RUN';
  if (p._isRunningBehind) return 'RUN-BEHIND';
  if (p._ballCarrierTime > 3) return 'CARRYING';
  if (p.kickCooldown > 0) return 'KICK-CD';
  const dist = p.distanceTo(ball.position);
  if (dist < p.influenceRadius + ball.radius) return 'NEAR BALL';
  const possessor = getBallPossessor(ball, getActivePlayers());
  if (possessor && possessor.team === p.team && possessor !== p) return 'SUPPORT';
  if (possessor && possessor.team !== p.team) return 'CHASING';
  return 'IDLE';
}

function drawPitch() {
  const { pitch } = CONFIG;
  ctx.strokeStyle = CONFIG.rendering.lineColor;
  ctx.lineWidth = 2;

  ctx.strokeRect(0, 0, pitch.width * ppm, pitch.height * ppm);

  ctx.beginPath();
  ctx.moveTo((pitch.width / 2) * ppm, 0);
  ctx.lineTo((pitch.width / 2) * ppm, pitch.height * ppm);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc((pitch.width / 2) * ppm, (pitch.height / 2) * ppm, pitch.centerSpotRadius * ppm, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc((pitch.width / 2) * ppm, (pitch.height / 2) * ppm, 3, 0, Math.PI * 2);
  ctx.fillStyle = CONFIG.rendering.lineColor;
  ctx.fill();

  const penaltyY = (pitch.height - pitch.penaltyAreaHeight) / 2;
  ctx.strokeRect(0, penaltyY * ppm, pitch.penaltyAreaWidth * ppm, pitch.penaltyAreaHeight * ppm);
  ctx.strokeRect((pitch.width - pitch.penaltyAreaWidth) * ppm, penaltyY * ppm, pitch.penaltyAreaWidth * ppm, pitch.penaltyAreaHeight * ppm);

  const goalAreaY = (pitch.height - pitch.goalAreaHeight) / 2;
  ctx.strokeRect(0, goalAreaY * ppm, pitch.goalAreaWidth * ppm, pitch.goalAreaHeight * ppm);
  ctx.strokeRect((pitch.width - pitch.goalAreaWidth) * ppm, goalAreaY * ppm, pitch.goalAreaWidth * ppm, pitch.goalAreaHeight * ppm);

  drawGoals();
}

function drawGoals() {
  const { pitch } = CONFIG;
  const goalWidth = pitch.goalWidth || 3;
  const goalDepth = pitch.goalDepth || 0.5;
  const goalY = (pitch.height - goalWidth) / 2;

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(0, goalY * ppm);
  ctx.lineTo(-goalDepth * ppm, goalY * ppm);
  ctx.lineTo(-goalDepth * ppm, (goalY + goalWidth) * ppm);
  ctx.lineTo(0, (goalY + goalWidth) * ppm);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(pitch.width * ppm, goalY * ppm);
  ctx.lineTo((pitch.width + goalDepth) * ppm, goalY * ppm);
  ctx.lineTo((pitch.width + goalDepth) * ppm, (goalY + goalWidth) * ppm);
  ctx.lineTo(pitch.width * ppm, (goalY + goalWidth) * ppm);
  ctx.stroke();
}

function drawBall() {
  const ballX = ball.position.x * ppm;
  const ballY = (ball.position.y - ball.height) * ppm;
  const ballRadius = Math.max(3, ball.radius * ppm);

  if (ball.height > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(ball.position.x * ppm, ball.position.y * ppm + ball.height * ppm * 2,
      ballRadius * (1 + ball.height * 0.5), ballRadius * 0.5 * (1 + ball.height * 0.5), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(ballX, ballY);
  ctx.rotate(ball.rotation);

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
    const px = Math.cos(angle) * ballRadius * 0.35;
    const py = Math.sin(angle) * ballRadius * 0.35;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawPlayer(p) {
  const color = p.team === 'team1' ? '#FF4444' : '#4444FF';
  const drawRadius = Math.max(5, p.radius * ppm);
  ctx.beginPath();
  ctx.arc(p.position.x * ppm, p.position.y * ppm, drawRadius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (p.isGoalkeeper) {
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GK', p.position.x * ppm, p.position.y * ppm - drawRadius - 4);

    if (p.holdingBall) {
      ctx.fillStyle = '#FF6600';
      ctx.beginPath();
      ctx.arc((p.position.x + 0.4) * ppm, p.position.y * ppm, 0.15 * ppm, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc((p.position.x - 0.4) * ppm, p.position.y * ppm, 0.15 * ppm, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.position.x * ppm, p.position.y * ppm);
  ctx.lineTo(p.position.x * ppm + Math.cos(p.angle) * drawRadius * 1.2,
             p.position.y * ppm + Math.sin(p.angle) * drawRadius * 1.2);
  ctx.stroke();

  if (p.isSprinting) {
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.position.x * ppm, p.position.y * ppm, drawRadius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Field selector
document.getElementById('btn5v5').addEventListener('click', () => setField('5v5'));
document.getElementById('btn11v11').addEventListener('click', () => setField('11v11'));

function setField(type) {
  CONFIG.pitch = CONFIG.pitches[type];
  document.getElementById('btn5v5').classList.toggle('active', type === '5v5');
  document.getElementById('btn11v11').classList.toggle('active', type === '11v11');
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

  // Space to pause/resume
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      isPaused = !isPaused;
    }
  });
}

updateCanvasSize();
loop();

// Capture uncaught errors
window.addEventListener('error', e => {
  console.error('UNCAUGHT:', e.message, '|', e.filename, 'line', e.lineno);
});
window.addEventListener('unhandledrejection', e => {
  console.error('UNHANDLED:', e.reason?.message || e.reason);
});
