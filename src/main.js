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

  canvas.width  = Math.ceil(totalWidth  * ppm);
  canvas.height = Math.ceil(totalHeight * ppm);

  offsetX = (pitch.goalDepth || 1) * ppm;

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
    timeAccumulator += frameTime;

    while (timeAccumulator >= deltaTimeMs) {
      const dt = deltaTimeMs / 1000;
      gameTime += dt;

      const active = getActivePlayers();
      active.forEach(p => p.updateAI(ball, CONFIG.pitch, gameTime, dt, active));
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
  }, 500);
}

function updateStats() {
  const mins = Math.floor(gameTime / 60);
  const secs = Math.floor(gameTime % 60);
  document.getElementById('timeDisplay').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  document.getElementById('scoreDisplay').textContent = `RED ${score.team1} - ${score.team2} BLUE`;
}

function render() {
  ctx.fillStyle = CONFIG.rendering.pitchColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(offsetX, offsetY);

  drawPitch();
  getActivePlayers().forEach(p => drawPlayer(p));
  drawBall();

  ctx.restore();

  if (goalFlashTeam) {
    ctx.save();
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
    ctx.restore();
  }
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
    if (p.isGoalkeeper) {
      p.holdingBall = false;
      p.holdTime    = 0;
      p.isDiving    = false;
    }
  });

  applyFormationSlots();
  setInitialPositions();

  setTimeout(() => ball.kick((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 10), 300);
}

updateCanvasSize();
loop();
