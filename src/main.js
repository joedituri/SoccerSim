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

// Create players - 3v3 (GK + 2 outfield per team)
const players = [
  new Player(0, 'team1', 'goalkeeper'),
  new Player(1, 'team1', 'defender'),
  new Player(2, 'team1', 'attacker'),
  new Player(3, 'team2', 'goalkeeper'),
  new Player(4, 'team2', 'defender'),
  new Player(5, 'team2', 'attacker'),
];

let score = { team1: 0, team2: 0 };

/** Wall-clock goal celebration (ms); sim pauses while active */
let goalFlashUntil = 0;
let goalFlashTeam = null;

// Set initial positions
function setInitialPositions() {
  const cx = CONFIG.pitch.width / 2;
  const cy = CONFIG.pitch.height / 2;
  // Team 1 (left side)
  players[0].position = { x: 1, y: cy };
  players[1].position = { x: cx - 8, y: cy };
  players[2].position = { x: cx + 3, y: cy };

  // Team 2 (right side)
  players[3].position = { x: CONFIG.pitch.width - 1, y: cy };
  players[3].goalLine = CONFIG.pitch.width;
  players[4].position = { x: cx + 8, y: cy };
  players[5].position = { x: cx - 3, y: cy };
}

setInitialPositions();
players.forEach(p => p.isAI = true);

ball.kick(12, 8, 15);

const deltaTimeMs = 16.67;
let timeAccumulator = 0;
let lastFrameTime = performance.now();
let gameTime = 0;

function updateCanvasSize() {
  const { pitch } = CONFIG;
  const maxWidth = Math.min(window.innerWidth - 20, 700);
  const maxHeight = Math.min(window.innerHeight * 0.6, 450);
  
  const totalWidth = pitch.width + (pitch.goalDepth || 1) * 2;
  const totalHeight = pitch.height;
  
  ppm = Math.min(15, maxWidth / totalWidth, maxHeight / totalHeight);
  ppm = Math.max(5, ppm);
  
  canvas.width = Math.ceil(totalWidth * ppm);
  canvas.height = Math.ceil(totalHeight * ppm);
  
  offsetX = (pitch.goalDepth || 1) * ppm;
  
  const label = pitch.name || 'Pitch';
  document.getElementById('fieldInfo').textContent =
    `${label} · ${pitch.width}×${pitch.height} m · 3v3+GK`;
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

      players.forEach(p => {
        p.updateAI(ball, CONFIG.pitch, gameTime, dt, players);
      });

      players.forEach(p => playerPhysics.update(p, dt));
      ballPhysics.update(ball, dt);
      collisionSystem.update(ball, players, dt);

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
    score.team2++;
    goalFlashTeam = 'team2';
    goalFlashUntil = performance.now() + 1200;
    return;
  }

  if (ball.position.x > CONFIG.pitch.width && ball.position.y > goalY && ball.position.y < goalY + goalWidth) {
    score.team1++;
    goalFlashTeam = 'team1';
    goalFlashUntil = performance.now() + 1200;
  }
}

function resetAfterGoal() {
  ball.position = { x: CONFIG.pitch.width / 2, y: CONFIG.pitch.height / 2 };
  ball.velocity = { x: 0, y: 0 };
  ball.spin = 0;
  ball.isAirborne = false;
  ball.height = 0;
  ball.heldBy = null;
  
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
  players.forEach(p => drawPlayer(p));
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

  // Left goal
  ctx.beginPath();
  ctx.moveTo(0, goalY * ppm);
  ctx.lineTo(-goalDepth * ppm, goalY * ppm);
  ctx.lineTo(-goalDepth * ppm, (goalY + goalWidth) * ppm);
  ctx.lineTo(0, (goalY + goalWidth) * ppm);
  ctx.stroke();

  // Right goal
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
    ctx.ellipse(ball.position.x * ppm, ball.position.y * ppm + ball.height * ppm * 2, ballRadius * (1 + ball.height * 0.5), ballRadius * 0.5 * (1 + ball.height * 0.5), 0, 0, Math.PI * 2);
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
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.position.x * ppm, p.position.y * ppm, p.radius * ppm, 0, Math.PI * 2);
  ctx.fill();
  
  if (p.isGoalkeeper) {
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GK', p.position.x * ppm, (p.position.y - p.radius - 0.6) * ppm);
    
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
  ctx.lineTo((p.position.x + Math.cos(p.angle) * p.radius * 1.2) * ppm, (p.position.y + Math.sin(p.angle) * p.radius * 1.2) * ppm);
  ctx.stroke();

  if (!p.isGoalkeeper) {
    const barWidth = p.radius * 2 * ppm;
    const barX = (p.position.x - p.radius) * ppm;
    const barY = (p.position.y - p.radius - 0.4) * ppm;
    
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(barX, barY, barWidth, 4);
    
    ctx.fillStyle = p.stamina > 30 ? '#00FF00' : '#FF0000';
    ctx.fillRect(barX, barY, barWidth * (p.stamina / p.staminaMax), 4);
  }

  if (p.isSprinting) {
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.position.x * ppm, p.position.y * ppm, p.radius * ppm + 4, 0, Math.PI * 2);
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
  
  setInitialPositions();
  
  players.forEach(p => {
    p.velocity = { x: 0, y: 0 };
    p.stamina = p.staminaMax;
    p.targetGoal = null;
    if (p.isGoalkeeper) {
      p.holdingBall = false;
      p.holdTime = 0;
    }
  });
  
  players[4].goalLine = CONFIG.pitch.width;
  
  setTimeout(() => ball.kick((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 10), 300);
}

updateCanvasSize();
loop();
