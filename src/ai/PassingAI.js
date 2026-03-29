// Smart passing AI for SoccerSim
// Replaces and extends the basic pickBestPassTarget / passTo in Player.js

/**
 * Check if the passing lane from A to B is blocked by any opponent.
 * Returns true if lane is CLEAR (pass can proceed).
 * Returns false if lane is blocked (opponent within interception range).
 */
export function isLaneClear(fromX, fromY, toX, toY, allPlayers, team, interceptionRadius = 0.8) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.01) return true;

  const len = Math.sqrt(len2);
  const nx = dx / len;
  const ny = dy / len;

  for (const p of allPlayers) {
    if (p.team === team || p.isGoalkeeper) continue;

    const px = p.position.x - fromX;
    const py = p.position.y - fromY;
    const t = px * nx + py * ny;

    if (t < 0 || t > len) continue;

    const perpX = px - t * nx;
    const perpY = py - t * ny;
    const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);

    if (perpDist < interceptionRadius) return false;
  }
  return true;
}

/**
 * Predict where a moving player will be when the ball arrives.
 * ball travel time = dist / avgPassSpeed
 * We predict a bit further (1.3x) to lead the receiver.
 */
export function predictReceivingPosition(player, ballFromX, ballFromY, passPower, pitch) {
  const dx = player.position.x - ballFromX;
  const dy = player.position.y - ballFromY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 3) {
    return { x: player.position.x, y: player.position.y };
  }

  const avgSpeed = passPower * 0.75;
  const travelTime = dist / avgSpeed;

  const horizon = Math.min(travelTime * 1.2, 1.5);
  const vx = player.velocity.x;
  const vy = player.velocity.y;

  let predX = player.position.x + vx * horizon;
  let predY = player.position.y + vy * horizon;

  predX = Math.max(0.5, Math.min(pitch.width - 0.5, predX));
  predY = Math.max(0.5, Math.min(pitch.height - 0.5, predY));

  return {
    x: player.position.x * 0.4 + predX * 0.6,
    y: player.position.y * 0.4 + predY * 0.6,
  };
}

/**
 * Find the best passing targets for a player with the ball.
 * Returns an array of { player, score, laneClear, leadPos } sorted by score.
 */
export function findPassTargets(carrier, ball, pitch, allPlayers, AI) {
  const results = [];
  const carrierX = ball.position.x;
  const carrierY = ball.position.y;
  const ad = carrier.team === 'team1' ? -1 : 1;
  const oppGoalX = carrier.team === 'team1' ? 0 : pitch.width;

  for (const t of allPlayers) {
    if (t === carrier || t.team !== carrier.team || t.isGoalkeeper) continue;

    const dx = t.position.x - carrierX;
    const dy = t.position.y - carrierY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 3 || dist > 45) continue;

    const powers = [AI.passPowerMin, (AI.passPowerMin + AI.passPowerMax) / 2, AI.passPowerMax];
    let bestForTarget = null;
    let bestScoreForTarget = -Infinity;

    for (const power of powers) {
      const leadPos = predictReceivingPosition(t, carrierX, carrierY, power, pitch);
      const leadDx = leadPos.x - carrierX;
      const leadDy = leadPos.y - carrierY;
      const leadDist = Math.sqrt(leadDx * leadDx + leadDy * leadDy);

      const laneClear = isLaneClear(carrierX, carrierY, leadPos.x, leadPos.y, allPlayers, carrier.team);

      let minOppDist = Infinity;
      for (const o of allPlayers) {
        if (o.team === carrier.team) continue;
        const od = o.distanceTo(leadPos);
        if (od < minOppDist) minOppDist = od;
      }

      const forward = ad * (leadPos.x - carrierX);
      const toGoal = Math.abs(leadPos.x - oppGoalX);
      const interceptRisk = minOppDist < 1.5 ? -2 : 0;
      const laneBonus = laneClear ? 1.8 : -0.5;
      const canShoot = leadDist < AI.shootRangeBase && toGoal < AI.shootRangeBase;
      const shootBonus = canShoot ? 1.2 : 0;

      const score =
        forward * 0.25 +
        minOppDist * 0.45 +
        laneBonus +
        shootBonus +
        interceptRisk -
        leadDist * 0.05 +
        Math.random() * 0.3;

      if (score > bestScoreForTarget) {
        bestScoreForTarget = score;
        bestForTarget = {
          player: t,
          score,
          laneClear,
          leadPos,
          power,
          leadDist,
          canShoot,
        };
      }
    }

    if (bestForTarget) results.push(bestForTarget);
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Predictive interception — the core algorithm.
 *
 * Simulates the ball's future trajectory over small time steps using
 * realistic physics (friction matching the game's CONFIG values).
 * For each step t, computes:
 *   - where the ball will be at time t (accounting for friction and wall bounces)
 *   - how long it would take the player to reach that point
 *
 * The FIRST step where player_travel_time <= t is the earliest
 * reachable interception point. If no such step exists within 3s,
 * falls back to the ball's position at that horizon.
 *
 * Recalculate every frame so players continuously adjust.
 */
export function findInterceptionPoint(player, ballState, pitch, playerSpeed) {
  // Physics constants matching CONFIG.physics.ball
  const mu = 0.15;           // rolling friction on grass
  const g = 9.81;
  const restitution = 0.65; // wall bounce energy retention
  const dt = 0.05;          // simulation time step (50ms = 20fps)
  const maxTime = 3.0;       // simulate 3 seconds ahead
  const goalWidth = pitch.goalWidth || 3;
  const goalY = (pitch.height - goalWidth) / 2;
  const radius = 0.22;

  // Per-frame friction: mu * g * dt = 0.15 * 9.81 * 0.05 ≈ 0.0736
  const fric = mu * g * dt;

  let vx = ballState.velocity.x;
  let vy = ballState.velocity.y;
  let px = ballState.position.x;
  let py = ballState.position.y;

  let bestStep = -1;
  let bestX = px;
  let bestY = py;

  const steps = Math.ceil(maxTime / dt);

  for (let step = 1; step <= steps; step++) {
    const t = step * dt;

    // Advance ball with realistic friction
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > 0.01) {
      const factor = Math.max(0, 1 - fric / speed);
      vx *= factor;
      vy *= factor;
    }
    px += vx * dt;
    py += vy * dt;

    // Handle wall bounces
    const inGoalY = py >= goalY && py <= goalY + goalWidth;
    if (!inGoalY) {
      if (px - radius < 0)      { px = radius;              vx = Math.abs(vx) * restitution; }
      if (px + radius > pitch.width) { px = pitch.width - radius; vx = -Math.abs(vx) * restitution; }
    }
    if (py - radius < 0)     { py = radius;              vy = Math.abs(vy) * restitution; }
    if (py + radius > pitch.height) { py = pitch.height - radius; vy = -Math.abs(vy) * restitution; }

    // Distance from player to this ball position
    const dx = px - player.position.x;
    const dy = py - player.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Player travel time: accelerate from 0 to maxSpeed over ~0.3s, then cruise
    const rampTime = 0.3;
    const rampDist = playerSpeed * 0.65 * rampTime;
    const cruiseDist = Math.max(0, dist - rampDist);
    const travelTime = rampTime + cruiseDist / playerSpeed;

    if (travelTime <= t) {
      bestStep = step;
      bestX = px;
      bestY = py;
      break;
    }
  }

  return { x: bestX, y: bestY, stepsAhead: bestStep * dt };
}

/**
 * One-two check: after passing, does the carrier have a clear return path?
 * Returns true if the passer should make an immediate supporting run.
 */
export function oneTwoViable(carrier, ball, passTarget, allPlayers) {
  const dx = passTarget.player.position.x - carrier.position.x;
  const dy = passTarget.player.position.y - carrier.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist > 8; // Only one-two on medium/long passes where there's space
}
