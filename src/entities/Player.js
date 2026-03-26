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
    // Role-based top speeds (m/s): attackers fastest, GK slowest
    const maxSpeedByRole = { goalkeeper: 7.0, defender: 8.2, midfielder: 8.6, attacker: 9.2 };
    this.maxSpeed = maxSpeedByRole[role] ?? 8.0;
    this.maxAccel = 15;
    
    this.influenceRadius = 0.7;
    this.kickCooldown = 0;
    
    this.isGoalkeeper = (role === 'goalkeeper');
    if (this.isGoalkeeper) {
      this.influenceRadius = 0.3;
      this.holdingBall = false;
      this.holdTime = 0;
      this.goalLine = null;
      this.isDiving = false;
      this.diveTime = 0;
      this.diveDirection = 0;
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
    this._isRunningBehind = false;
    this.mentalityShift = 0; // positive = push up, negative = sit deeper (set by game-state logic)

    // Reaction time - perceived ball lags behind real ball
    this.reactionTime = 0.1; // seconds
    this.perceivedBall = {
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      initialized: false
    };
  }

  /**
   * Compute this player's dynamic home position based on formation slot and ball location.
   * The whole team's line shifts forward/backward with the ball by formationBallShift.
   */
  getHomePosition(ball, pitch) {
    if (this.formationDepth === undefined) {
      return { x: pitch.width / 2, y: pitch.height / 2 };
    }
    const myGoalX = this.team === 'team1' ? pitch.width : 0;
    const oppGoalX = this.team === 'team1' ? 0 : pitch.width;
    const centerX = pitch.width / 2;
    // dirSign=1 works for both teams: ball deviation naturally aligns with attack direction
    const dirSign = 1;

    const depth = Math.max(0.05, Math.min(0.95, this.formationDepth + (this.mentalityShift ?? 0)));
    const baseX = myGoalX + (oppGoalX - myGoalX) * depth;
    const shift = (ball.position.x - centerX) * CONFIG.ai.formationBallShift * dirSign;
    const homeX = Math.max(1.2, Math.min(pitch.width - 1.2, baseX + shift));
    const homeY = Math.max(1.2, Math.min(pitch.height - 1.2,
      (this.formationY ?? 0.5) * pitch.height));

    return { x: homeX, y: homeY };
  }

  /**
   * Zone-based marking: find the opponent nearest to this player's HOME position
   * (not current position), so each player is responsible for opponents in their zone.
   * Returns the opponent's position to mark goal-side of.
   */
  _findMarkTarget(allPlayers, home) {
    let closest = null;
    let closestDist = Infinity;
    for (const p of allPlayers) {
      if (p.team === this.team || p.isGoalkeeper) continue;
      const dx = home.x - p.position.x;
      const dy = home.y - p.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) {
        closestDist = d;
        closest = p;
      }
    }
    return closest ? closest.position : home;
  }

  /** Update perceived ball position with reaction delay */
  updatePerceivedBall(ball, dt) {
    if (!this.perceivedBall.initialized) {
      // First frame: sync to real ball
      this.perceivedBall.position.x = ball.position.x;
      this.perceivedBall.position.y = ball.position.y;
      this.perceivedBall.velocity.x = ball.velocity.x;
      this.perceivedBall.velocity.y = ball.velocity.y;
      this.perceivedBall.initialized = true;
      return;
    }

    // Exponential decay toward real ball position
    // Higher reactionTime = slower catch-up = more delay
    const catchUpRate = dt / (dt + this.reactionTime);

    this.perceivedBall.position.x += (ball.position.x - this.perceivedBall.position.x) * catchUpRate;
    this.perceivedBall.position.y += (ball.position.y - this.perceivedBall.position.y) * catchUpRate;
    this.perceivedBall.velocity.x += (ball.velocity.x - this.perceivedBall.velocity.x) * catchUpRate;
    this.perceivedBall.velocity.y += (ball.velocity.y - this.perceivedBall.velocity.y) * catchUpRate;
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

    // Update perceived ball with reaction delay
    this.updatePerceivedBall(ball, dt);

    // Create perceived ball view for AI decisions
    const perceivedBall = {
      position: this.perceivedBall.position,
      velocity: this.perceivedBall.velocity,
      spin: ball.spin,
      isAirborne: ball.isAirborne,
      height: ball.height,
      heldBy: ball.heldBy,
      radius: ball.radius,
      getSpeed: () => Math.sqrt(this.perceivedBall.velocity.x ** 2 + this.perceivedBall.velocity.y ** 2)
    };

    if (this.isGoalkeeper) {
      this.goalkeeperAI(ball, pitch, dt, allPlayers); // GK uses perceived for tracking, real for catching
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
        this.applyOutfieldPositioning(perceivedBall, pitch, allPlayers, ball);
        return;
      }
      if (!this.isGoalkeeper) {
        this.applyOutfieldPositioning(perceivedBall, pitch, allPlayers, ball);
        return;
      }
    }

    // Use real ball for influence check (actual touching)
    if (this.isInfluencingBall(ball)) {
      this.handleBallCarrier(ball, pitch, dt, allPlayers); // Real ball for kicking
      return;
    }

    this._ballCarrierTime = 0;
    this.applyOutfieldPositioning(perceivedBall, pitch, allPlayers, ball);
  }

  applyOutfieldPositioning(perceivedBall, pitch, allPlayers, realBall) {
    this._isRunningBehind = false; // reset each frame; set true only in run-behind branch
    const centerX = pitch.width / 2;
    const centerY = pitch.height / 2;
    const AI = CONFIG.ai;
    // Use real ball for possession check (who actually has it)
    const possessor = getBallPossessor(realBall || perceivedBall, allPlayers);
    const myGoalX = this.team === 'team1' ? pitch.width : 0;

    // Chaser determination uses perceived ball (who should chase)
    let team1Chaser = null;
    let team2Chaser = null;
    let minDist1 = Infinity;
    let minDist2 = Infinity;

    allPlayers.forEach(p => {
      if (p.isGoalkeeper) return;
      const d = p.distanceTo(perceivedBall.position);
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
      // Retreat into own half (team1 is on right, team2 on left)
      if (this.team === 'team1') {
        targetX = Math.max(centerX + 2, this.position.x + 2);
      } else {
        targetX = Math.min(centerX - 2, this.position.x - 2);
      }
      targetY = centerY;
      speed = 3;
    } else if (gkHoldingBall && gkHoldingBall.team === this.team) {
      if (this.role === 'defender') {
        targetX = this.team === 'team1' ? centerX + 8 : centerX - 8;
      } else {
        targetX = this.team === 'team1' ? centerX + 3 : centerX - 3;
      }
      // Spread across full pitch height to find open space
      targetY = this._bestOpenY(targetX, centerY, centerY - 1.2, pitch, allPlayers);
      speed = 2;
    } else if (mateHasBall) {
      const home = this.getHomePosition(perceivedBall, pitch);
      const ad = attackDir(this.team);
      // Attackers make runs in behind the defensive line when ball is past midfield
      if (this.role === 'attacker' && ad * (perceivedBall.position.x - pitch.width / 2) > 5) {
        // Find the shallowest opposition defender (closest to our attack target)
        let defLineX = ad === -1 ? 0 : pitch.width;
        for (const p of allPlayers) {
          if (p.team === this.team || p.isGoalkeeper) continue;
          if (ad === -1 && p.position.x > defLineX) defLineX = p.position.x;
          if (ad ===  1 && p.position.x < defLineX) defLineX = p.position.x;
        }
        // Target 6m beyond the defensive line in the attack direction
        const runX = Math.max(2, Math.min(pitch.width - 2, defLineX + ad * 6));
        if (ad * (runX - perceivedBall.position.x) > 3) {
          targetX = runX;
          targetY = this._bestOpenY(runX, home.y, centerY - 1.2, pitch, allPlayers);
          speed = this.maxSpeed * 0.95;
          this._isRunningBehind = true;
        } else {
          targetX = home.x;
          targetY = this._bestOpenY(home.x, home.y, centerY - 1.2, pitch, allPlayers);
          speed = 5.2;
        }
      } else {
        targetX = home.x;
        targetY = this._bestOpenY(home.x, home.y, centerY - 1.2, pitch, allPlayers);
        speed = 5.2;
      }
    } else if (oppHasBall && !isChaser) {
      // Light marking: zone-based assignment, position goal-side of marked opponent
      const home = this.getHomePosition(perceivedBall, pitch);
      const markPos = this._findMarkTarget(allPlayers, home);
      const markX = markPos.x + (myGoalX - markPos.x) * AI.markingGoalSide;
      const markY = Math.max(1, Math.min(pitch.height - 1, markPos.y));
      // Blend marking with goal-protection formula for defensive shape
      const b = AI.defendGoalBlend;
      const defendX = perceivedBall.position.x * (1 - b) + myGoalX * b;
      const defendY = Math.max(1, Math.min(pitch.height - 1,
        perceivedBall.position.y * 0.62 + centerY * 0.38));
      const bm = AI.markingBlend;
      targetX = markX * bm + defendX * (1 - bm);
      targetY = markY * bm + defendY * (1 - bm);
      // Coordinated defensive line: all defenders share the same X to avoid gaps
      if (this.role === 'defender') {
        targetX = this._defensiveLineX(perceivedBall, pitch, allPlayers);
      }
      speed = 3.8;
    } else if (chaseBall) {
      targetX = perceivedBall.position.x;
      targetY = perceivedBall.position.y;
      speed = oppHasBall ? 5.6 : 5;
    } else {
      // Idle / loose ball non-chaser: return to formation home position
      const home = this.getHomePosition(perceivedBall, pitch);
      targetX = home.x;
      targetY = home.y;
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
  
  /**
   * Find the Y position most open from opponents within a spread range around centerY.
   * Samples candidate positions and scores each by distance to nearest opponent
   * (favoring open space) and distance to nearest teammate (favoring spread).
   */
  _bestOpenY(atX, centerY, spread, pitch, allPlayers) {
    const steps = 8;
    let bestY = centerY;
    let bestScore = -Infinity;

    for (let i = 0; i <= steps; i++) {
      const cy = Math.max(1.2, Math.min(pitch.height - 1.2,
        centerY - spread + i * (spread * 2 / steps)));

      // Distance to nearest opponent at this candidate position
      let minOppDist = Infinity;
      for (const p of allPlayers) {
        if (p.team === this.team) continue;
        const dx = atX - p.position.x;
        const dy = cy - p.position.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minOppDist) minOppDist = d;
      }

      // Distance to nearest teammate (prefer spreading out)
      let minTeamDist = Infinity;
      for (const p of allPlayers) {
        if (p === this || p.team !== this.team || p.isGoalkeeper) continue;
        const dx = atX - p.position.x;
        const dy = cy - p.position.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minTeamDist) minTeamDist = d;
      }

      // Score: weight open space from opponents heavily, teammate spread lightly
      const score = minOppDist * 0.65 + Math.min(minTeamDist, 8) * 0.35;
      if (score > bestScore) {
        bestScore = score;
        bestY = cy;
      }
    }

    return bestY;
  }

  /** Average home-position X of all same-team defenders — keeps the line coordinated. */
  _defensiveLineX(ball, pitch, allPlayers) {
    let sumX = 0, count = 0;
    for (const p of allPlayers) {
      if (p.team !== this.team || p.role !== 'defender' || p.isGoalkeeper) continue;
      sumX += p.getHomePosition(ball, pitch).x;
      count++;
    }
    return count > 0 ? sumX / count : this.getHomePosition(ball, pitch).x;
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
      pressure < AI.pressureRadius * 0.85 && passInfo && passInfo.score > 1.5;
    const goodPass = passInfo && passInfo.score > 3.5;
    const longHold = this._ballCarrierTime > 4.0;

    if (
      this.kickCooldown <= 0 &&
      passInfo &&
      (goodPass || longHold || (urgentPass && passInfo.score > 1.5))
    ) {
      const pwr = Math.min(
        AI.passPowerMax,
        Math.max(AI.passPowerMin, passInfo.dist * 0.62 + 4),
      );
      this.passTo(ball, passInfo.player, pwr);
      this._ballCarrierTime = 0;
      return;
    }

    // Through ball to an attacker making a run in behind the defense
    if (this.kickCooldown <= 0) {
      const runner = allPlayers.find(p =>
        p !== this && p.team === this.team && p._isRunningBehind && !p.isGoalkeeper
      );
      if (runner) {
        const lx = runner.position.x - ball.position.x;
        const ly = runner.position.y - ball.position.y;
        const llen2 = lx * lx + ly * ly;
        let laneBlocked = false;
        if (llen2 > 4) {
          for (const opp of allPlayers) {
            if (opp.team === this.team) continue;
            const t = Math.max(0, Math.min(1,
              ((opp.position.x - ball.position.x) * lx + (opp.position.y - ball.position.y) * ly) / llen2
            ));
            const nearX = ball.position.x + t * lx;
            const nearY = ball.position.y + t * ly;
            if ((opp.position.x - nearX) ** 2 + (opp.position.y - nearY) ** 2 < 6.25) {
              laneBlocked = true; break;
            }
          }
        }
        if (!laneBlocked) {
          const leadTime = Math.sqrt(llen2) / 18;
          const leadX = Math.max(1, Math.min(pitch.width - 1, runner.position.x + runner.velocity.x * leadTime));
          const leadY = Math.max(1, Math.min(pitch.height - 1, runner.position.y + runner.velocity.y * leadTime));
          const tdx = leadX - ball.position.x;
          const tdy = leadY - ball.position.y;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
          if (tdist > 2) {
            const power = Math.min(AI.passPowerMax, Math.max(AI.passPowerMin, tdist * 0.65));
            ball.velocity.x = (tdx / tdist) * power;
            ball.velocity.y = (tdy / tdist) * power;
            ball.spin = (Math.random() - 0.5) * 4;
            this.kickCooldown = 0.4;
            this._ballCarrierTime = 0;
            return;
          }
        }
      }
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
  
  goalkeeperAI(ball, pitch, dt, allPlayers = []) {
    const goalX = this.team === 'team1' ? pitch.width : 0;
    const goalY = pitch.height / 2;
    const goalWidth = pitch.goalWidth || 3;

    // If holding ball, throw after delay
    if (this.holdingBall) {
      this.holdTime += dt;
      if (this.holdTime > 1.0) {
        this.throwBall(ball, pitch, allPlayers);
      }
      return;
    }

    // Handle dive animation - can't move while diving
    if (this.isDiving) {
      this.diveTime -= dt;
      if (this.diveTime <= 0) {
        this.isDiving = false;
        this.diveDirection = 0;
      }
      return; // Frozen during dive
    }

    // Track perceived ball position on goal line (reaction delay)
    const targetX = goalX + (this.team === 'team1' ? -0.5 : 0.5);
    const targetY = Math.max(goalY - goalWidth/2 + 0.5, Math.min(goalY + goalWidth/2 - 0.5, this.perceivedBall.position.y));

    const dx = targetX - this.position.x;
    const dy = targetY - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.2) {
      const speed = 1; // Nerfed from 4
      this.velocity.x = (dx / dist) * speed;
      this.velocity.y = (dy / dist) * speed;
    } else {
      this.velocity.x = 0;
      this.velocity.y = 0;
    }

    // Use REAL ball for catching/clearing (actual physics)
    const ballDist = this.distanceTo(ball.position);
    const inGoalWidth = ball.position.y > goalY - goalWidth && ball.position.y < goalY + goalWidth;

    // Catch attempt with success probability
    if (ballDist < this.influenceRadius + ball.radius && ball.getSpeed() > 3 && inGoalWidth && this.kickCooldown <= 0) {
      // Catch success probability based on ball speed and direction
      const catchChance = this.calculateCatchChance(ball, goalY, goalWidth);
      if (Math.random() < catchChance) {
        this.catchBall(ball);
        return;
      } else {
        // Failed catch - dive and miss, longer cooldown
        this.isDiving = true;
        this.diveTime = 0.5;
        this.diveDirection = ball.position.y > goalY ? 1 : -1;
        this.kickCooldown = 1.0;
        return;
      }
    }

    // Kick the ball away if close (even if slow) - clearance!
    if (ballDist < this.influenceRadius && this.kickCooldown <= 0 && !ball.heldBy) {
      this.clearBall(ball, pitch);
    }
  }

  calculateCatchChance(ball, goalY, goalWidth) {
    // Base catch chance
    let chance = 0.7;

    // Harder to catch fast balls
    const speed = ball.getSpeed();
    if (speed > 15) chance -= 0.3;
    else if (speed > 10) chance -= 0.15;

    // Harder to catch balls at edges of goal
    const ballYOffset = Math.abs(ball.position.y - goalY);
    const edgeFactor = ballYOffset / (goalWidth / 2);
    chance -= edgeFactor * 0.2;

    // Harder to catch airborne balls
    if (ball.isAirborne) chance -= 0.15;

    return Math.max(0.2, Math.min(0.95, chance));
  }

  clearBall(ball, pitch) {
    // Kick the ball away from goal
    const kickDir = this.team === 'team1' ? -1 : 1; // Kick towards opponent's goal
    const power = 12 + Math.random() * 6;

    // Aim towards the side with more space
    const centerY = pitch.height / 2;
    const sideBias = ball.position.y > centerY ? 0.4 : -0.4;

    ball.velocity.x = kickDir * power;
    ball.velocity.y = sideBias * power * 0.6;
    ball.spin = (Math.random() - 0.5) * 6;

    this.kickCooldown = 1.2; // Increased from 0.4
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
  
  throwBall(ball, pitch, allPlayers = []) {
    const ad = attackDir(this.team);
    // Smart distribution: score each teammate by openness + forward progress
    let bestTarget = null;
    let bestScore = -Infinity;
    for (const p of allPlayers) {
      if (p.team !== this.team || p.isGoalkeeper) continue;
      const dist = this.distanceTo(p.position);
      if (dist < 2 || dist > 55) continue;
      // How much pressure is on this teammate?
      let minOppDist = Infinity;
      for (const opp of allPlayers) {
        if (opp.team === this.team) continue;
        const d = opp.distanceTo(p.position);
        if (d < minOppDist) minOppDist = d;
      }
      const forward = ad * (p.position.x - this.position.x);
      // Prefer open teammates; a little weight on forward progress; slight discount for distance
      const score = minOppDist * 1.2 + forward * 0.4 - dist * 0.05 + Math.random() * 0.5;
      if (score > bestScore) { bestScore = score; bestTarget = p; }
    }

    let targetX, targetY;
    if (bestTarget && bestScore > 2) {
      targetX = bestTarget.position.x;
      targetY = bestTarget.position.y;
    } else {
      // Fallback: kick into open space in the opponent's half
      targetX = this.team === 'team1' ? pitch.width * 0.4 : pitch.width * 0.6;
      targetY = pitch.height * (0.3 + Math.random() * 0.4);
    }

    const dx = targetX - this.position.x;
    const dy = targetY - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const power = Math.min(22, Math.max(10, dist * 0.55 + 5));

    ball.velocity.x = (dx / dist) * power;
    ball.velocity.y = (dy / dist) * power;
    ball.heldBy = null;
    this.holdingBall = false;
    this.holdTime = 0;
    this.kickCooldown = 0.3;
  }
}