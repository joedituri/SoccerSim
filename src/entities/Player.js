// Player entity (metric units) - Passing, support, defense
import { CONFIG } from '../config.js';

function attackDir(team) {
  return team === 'team1' ? -1 : 1;
}

/** Nearest outfield player to ball with influence (exclusive possessor). */
function getBallPossessor(ball, allPlayers) {
  if (ball.heldBy) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of allPlayers) {
    if (p.isGoalkeeper && p.holdingBall) continue;
    if (!p.isInfluencingBall(ball)) continue;
    const d = p.distanceTo(ball.position);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function nearestOpponentDistance(player, allPlayers) {
  let dMin = Infinity;
  for (const p of allPlayers) {
    if (p.team === player.team) continue;
    const d = p.distanceTo(player.position);
    if (d < dMin) dMin = d;
  }
  return dMin;
}

export class Player {
  constructor(id, team, role = 'midfielder') {
    this.id = id;
    this.team = team;
    this.role = role;

    this.position = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.angle = 0;

    this.radius = 0.3;
    this.maxSpeed = 8;
    this.maxAccel = 15;
    
    this.influenceRadius = 0.7;
    this.kickCooldown = 0;
    
    this.isGoalkeeper = (role === 'goalkeeper');
    if (this.isGoalkeeper) {
      this.influenceRadius = 1.2;
      this.holdingBall = false;
      this.holdTime = 0;
      this.goalLine = null;
    }
    
    this.isAI = true;
    this.shootRange = 16; // meters
    this.targetGoal = null;

    this.staminaMax = 100;
    this.stamina = 100;
    this.staminaRecoveryRate = 12;
    this.staminaSprintCost = 3;
    this.isSprinting = false;

    this.inputDirection = { x: 0, y: 0 };
    this.speedMultiplier = 1;

    this._ballCarrierTime = 0;
  }

  /** Unit vector for movement direction; safe when velocity is near zero. */
  facingDirection() {
    const s = this.getSpeed();
    if (s > 0.05) {
      return { x: this.velocity.x / s, y: this.velocity.y / s };
    }
    return { x: Math.cos(this.angle), y: Math.sin(this.angle) };
  }

  distanceTo(point) {
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  getSpeed() {
    return Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
  }

  isMoving() {
    return this.getSpeed() > 0.1;
  }

  isInfluencingBall(ball) {
    return this.distanceTo(ball.position) < this.influenceRadius + ball.radius;
  }
  
  updateAI(ball, pitch, gameTime, dt, allPlayers) {
    if (!this.isAI) return;

    if (this.kickCooldown > 0) this.kickCooldown -= dt;

    if (this.isGoalkeeper) {
      this.goalkeeperAI(ball, pitch, dt);
      return;
    }

    if (!this.targetGoal) {
      this.targetGoal = this.team === 'team1'
        ? { x: 0, y: pitch.height / 2 }
        : { x: pitch.width, y: pitch.height / 2 };
    }

    const gkWithBall = allPlayers.find(p => p.isGoalkeeper && p.holdingBall);
    if (gkWithBall) {
      if (gkWithBall.team !== this.team) {
        this.applyOutfieldPositioning(ball, pitch, allPlayers);
        return;
      }
      if (!this.isGoalkeeper) {
        this.applyOutfieldPositioning(ball, pitch, allPlayers);
        return;
      }
    }

    if (this.isInfluencingBall(ball)) {
      this.handleBallCarrier(ball, pitch, dt, allPlayers);
      return;
    }

    this._ballCarrierTime = 0;
    this.applyOutfieldPositioning(ball, pitch, allPlayers);
  }

  applyOutfieldPositioning(ball, pitch, allPlayers) {
    const centerX = pitch.width / 2;
    const centerY = pitch.height / 2;
    const AI = CONFIG.ai;
    const possessor = getBallPossessor(ball, allPlayers);
    const myGoalX = this.team === 'team1' ? 0 : pitch.width;

    let team1Chaser = null;
    let team2Chaser = null;
    let minDist1 = Infinity;
    let minDist2 = Infinity;

    allPlayers.forEach(p => {
      if (p.isGoalkeeper) return;
      const d = p.distanceTo(ball.position);
      if (p.team === 'team1' && d < minDist1) {
        minDist1 = d;
        team1Chaser = p;
      }
      if (p.team === 'team2' && d < minDist2) {
        minDist2 = d;
        team2Chaser = p;
      }
    });

    const gkHoldingBall = allPlayers.find(p => p.isGoalkeeper && p.holdingBall);
    const isChaser = this === team1Chaser || this === team2Chaser;

    const mateHasBall =
      possessor && possessor.team === this.team && possessor !== this;
    const oppHasBall =
      possessor && possessor.team !== this.team;
    const chaseBall =
      isChaser && (possessor === null || oppHasBall);

    let spacingX = 0;
    let spacingY = 0;
    allPlayers.forEach(other => {
      if (other === this || other.isGoalkeeper) return;
      if (other.team !== this.team) return;
      const dx = this.position.x - other.position.x;
      const dy = this.position.y - other.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 4 && dist > 0.1) {
        spacingX += (dx / dist) * (4 - dist);
        spacingY += (dy / dist) * (4 - dist);
      }
    });

    let gkRetreatX = 0;
    let gkRetreatY = 0;
    if (gkHoldingBall && gkHoldingBall.team !== this.team) {
      const dx = this.position.x - gkHoldingBall.position.x;
      const dy = this.position.y - gkHoldingBall.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 6 && dist > 0.1) {
        gkRetreatX = (dx / dist) * (6 - dist) * 1.5;
        gkRetreatY = (dy / dist) * (6 - dist) * 1.5;
      }
    }

    let targetX;
    let targetY;
    let speed;

    if (gkHoldingBall && gkHoldingBall.team !== this.team) {
      if (this.team === 'team1') {
        targetX = Math.min(centerX - 2, this.position.x - 2);
      } else {
        targetX = Math.max(centerX + 2, this.position.x + 2);
      }
      targetY = centerY;
      speed = 3;
    } else if (gkHoldingBall && gkHoldingBall.team === this.team) {
      if (this.role === 'defender') {
        targetX = this.team === 'team1' ? centerX - 8 : centerX + 8;
      } else {
        targetX = this.team === 'team1' ? centerX - 3 : centerX + 3;
      }
      targetY = centerY;
      speed = 2;
    } else if (mateHasBall) {
      const ad = attackDir(this.team);
      const ahead = this.role === 'attacker' ? 1.15 : this.role === 'defender' ? 0.55 : 0.85;
      const wide =
        this.role === 'attacker' ? 5 : this.role === 'defender' ? 2.5 : 3.5;
      const lane = (this.id % 3) - 1;
      targetX =
        ball.position.x +
        ad * AI.supportAhead * ahead;
      targetY = ball.position.y + lane * wide;
      targetY = Math.max(1.2, Math.min(pitch.height - 1.2, targetY));
      targetX = Math.max(1.2, Math.min(pitch.width - 1.2, targetX));
      speed = 5.2;
    } else if (oppHasBall && !isChaser) {
      const b = AI.defendGoalBlend;
      targetX = ball.position.x * (1 - b) + myGoalX * b;
      targetY = ball.position.y * 0.62 + centerY * 0.38;
      targetY = Math.max(1, Math.min(pitch.height - 1, targetY));
      speed = 3.8;
    } else if (chaseBall) {
      targetX = ball.position.x;
      targetY = ball.position.y;
      speed = oppHasBall ? 5.6 : 5;
    } else {
      if (this.role === 'defender') {
        targetX = this.team === 'team1' ? centerX - 8 : centerX + 8;
      } else {
        targetX = this.team === 'team1' ? centerX - 3 : centerX + 3;
      }
      targetY = centerY;
      speed = 2;
    }

    targetX += spacingX + gkRetreatX;
    targetY += spacingY + gkRetreatY;

    const dx = targetX - this.position.x;
    const dy = targetY - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.3) {
      this.velocity.x = (dx / dist) * speed;
      this.velocity.y = (dy / dist) * speed;
    } else {
      this.velocity.x = 0;
      this.velocity.y = 0;
    }
  }
  
  _openSideBias(allPlayers) {
    let best = null;
    let bestD = Infinity;
    for (const p of allPlayers) {
      if (p.team === this.team) continue;
      const d = p.distanceTo(this.position);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return (Math.random() - 0.5) * 0.4;
    return Math.sign(this.position.y - best.position.y) || (Math.random() - 0.5);
  }

  pickBestPassTarget(ball, pitch, allPlayers) {
    const ad = attackDir(this.team);
    let best = null;
    let bestScore = -Infinity;

    for (const t of allPlayers) {
      if (t === this || t.team !== this.team || t.isGoalkeeper) continue;

      const dx = t.position.x - ball.position.x;
      const dy = t.position.y - ball.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 2.2 || dist > 38) continue;

      const forward = ad * (t.position.x - ball.position.x);
      let open = Infinity;
      for (const o of allPlayers) {
        if (o.team === this.team) continue;
        const od = o.distanceTo(t.position);
        if (od < open) open = od;
      }

      const score =
        forward * 0.22 +
        open * 0.5 -
        dist * 0.07 +
        (this.role === 'attacker' && t.role === 'attacker' ? 0.4 : 0) +
        Math.random() * 0.35;

      if (score > bestScore) {
        bestScore = score;
        best = { player: t, dist, score: bestScore };
      }
    }

    return best;
  }

  passTo(ball, teammate, power) {
    if (this.kickCooldown > 0) return;

    const dx = teammate.position.x - ball.position.x;
    const dy = teammate.position.y - ball.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.12) return;

    let vx = (dx / dist) * power + teammate.velocity.x * 0.28;
    let vy = (dy / dist) * power + teammate.velocity.y * 0.28;
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag < 0.01) return;

    ball.velocity.x = vx;
    ball.velocity.y = vy;
    ball.spin = (Math.random() - 0.5) * 5;
    this.kickCooldown = 0.4;
  }

  handleBallCarrier(ball, pitch, dt, allPlayers) {
    const AI = CONFIG.ai;
    this._ballCarrierTime += dt;

    const pressure = nearestOpponentDistance(this, allPlayers);
    const passInfo = this.pickBestPassTarget(ball, pitch, allPlayers);

    const urgentPass =
      pressure < AI.pressureRadius * 0.85 && passInfo && passInfo.score > -0.15;
    const goodPass = passInfo && passInfo.score > 1.0;
    const longHold = this._ballCarrierTime > 2.4;

    if (
      this.kickCooldown <= 0 &&
      passInfo &&
      (goodPass || longHold || (urgentPass && passInfo.score > 0.2))
    ) {
      const pwr = Math.min(
        AI.passPowerMax,
        Math.max(AI.passPowerMin, passInfo.dist * 0.62 + 4),
      );
      this.passTo(ball, passInfo.player, pwr);
      this._ballCarrierTime = 0;
      return;
    }

    const goalX = this.targetGoal.x;
    const goalY = this.targetGoal.y;
    const dx = goalX - this.position.x;
    const dy = goalY - this.position.y;
    const distToGoal = Math.sqrt(dx * dx + dy * dy);
    const shootRange = Math.min(this.shootRange, AI.shootRangeBase + 2);

    if (distToGoal < shootRange && this.kickCooldown <= 0) {
      const oppGk = allPlayers.find(p => p.isGoalkeeper && p.team !== this.team);
      const underPressure = pressure < 2.1;
      this.shoot(ball, oppGk, underPressure);
      this._ballCarrierTime = 0;
      return;
    }

    if (distToGoal > 0.8) {
      const gdx = dx / distToGoal;
      const gdy = dy / distToGoal;
      const px = -gdy;
      const py = gdx;
      const bias = this._openSideBias(allPlayers);
      let tx = gdx + px * bias * 0.38;
      let ty = gdy + py * bias * 0.38;
      const tlen = Math.sqrt(tx * tx + ty * ty);
      tx /= tlen;
      ty /= tlen;
      this.velocity.x = tx * AI.dribbleSpeed;
      this.velocity.y = ty * AI.dribbleSpeed;
    }
  }

  shoot(ball, opponentGk = null, underPressure = false) {
    if (this.kickCooldown > 0) return;

    let aimY = this.targetGoal.y;
    if (opponentGk) {
      aimY += (opponentGk.position.y - aimY) * 0.42;
    }
    aimY += (Math.random() - 0.5) * (underPressure ? 2.8 : 1.6);

    const goalX = this.targetGoal.x;
    const dx = goalX - ball.position.x;
    const dy = aimY - ball.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) return;

    let power = 17 + Math.random() * 9;
    if (underPressure) {
      power *= 0.88;
    }

    ball.velocity.x = (dx / dist) * power;
    ball.velocity.y = (dy / dist) * power;
    ball.spin = (Math.random() - 0.5) * (underPressure ? 14 : 8);

    if (power > 22) {
      ball.isAirborne = true;
      ball.airborneTime = 0.5;
      ball.height = 0.5;
    }

    this.kickCooldown = 0.5;
  }
  
  goalkeeperAI(ball, pitch, dt) {
    const goalX = this.team === 'team1' ? 0 : pitch.width;
    const goalY = pitch.height / 2;
    const goalWidth = pitch.goalWidth || 3;
    
    // If holding ball, throw after delay
    if (this.holdingBall) {
      this.holdTime += dt;
      if (this.holdTime > 1.5) {
        this.throwBall(ball, pitch);
      }
      return;
    }
    
    // Track ball on goal line
    const targetX = goalX + (this.team === 'team1' ? 0.5 : -0.5);
    const targetY = Math.max(goalY - goalWidth/2 + 0.5, Math.min(goalY + goalWidth/2 - 0.5, ball.position.y));
    
    const dx = targetX - this.position.x;
    const dy = targetY - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 0.2) {
      const speed = 3;
      this.velocity.x = (dx / dist) * speed;
      this.velocity.y = (dy / dist) * speed;
    } else {
      this.velocity.x = 0;
      this.velocity.y = 0;
    }
    
    // Try to catch if ball close
    const ballDist = this.distanceTo(ball.position);
    if (ballDist < 1.0 && ball.getSpeed() > 5 && ball.position.y > goalY - goalWidth && ball.position.y < goalY + goalWidth) {
      this.catchBall(ball);
    }
  }
  
  catchBall(ball) {
    this.holdingBall = true;
    this.holdTime = 0;
    ball.velocity = { x: 0, y: 0 };
    ball.spin = 0;
    ball.isAirborne = false;
    ball.height = 0;
    ball.heldBy = this;
  }
  
  throwBall(ball, pitch) {
    const targetX = this.team === 'team1' ? pitch.width * 0.6 : pitch.width * 0.4;
    const targetY = pitch.height * (0.3 + Math.random() * 0.4);
    
    const dx = targetX - this.position.x;
    const dy = targetY - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    const power = 15 + Math.random() * 8;
    
    ball.velocity.x = (dx / dist) * power;
    ball.velocity.y = (dy / dist) * power;
    ball.heldBy = null;
    
    this.holdingBall = false;
    this.holdTime = 0;
    this.kickCooldown = 0.3;
  }
}