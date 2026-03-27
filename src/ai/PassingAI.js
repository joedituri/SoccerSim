// PassingAI — Smart passing logic for SoccerSim
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
  if (len2 < 0.01) return true; // same position, trivially clear

  const len = Math.sqrt(len2);
  const nx = dx / len;
  const ny = dy / len;

  for (const p of allPlayers) {
    if (p.team === team || p.isGoalkeeper) continue;

    // Perpendicular distance from opponent to the pass line
    // t = projection of (p - from) onto the line direction
    const px = p.position.x - fromX;
    const py = p.position.y - fromY;
    const t = px * nx + py * ny;

    // Only care about opponents between the passer and target (t in [0, len])
    if (t < 0 || t > len) continue;

    // Perpendicular distance
    const perpX = px - t * nx;
    const perpY = py - t * ny;
    const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);

    if (perpDist < interceptionRadius) {
      return false; // lane is blocked
    }
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
    // Short pass — player unlikely to move far, just use current pos
    return { x: player.position.x, y: player.position.y };
  }

  // Estimate ball travel time (seconds)
  const avgSpeed = passPower * 0.75; // ball slows down
  const travelTime = dist / avgSpeed;

  // Predict position with current velocity
  // Use shorter horizon for short passes, longer for long balls
  const horizon = Math.min(travelTime * 1.2, 1.5);
  const vx = player.velocity.x;
  const vy = player.velocity.y;

  let predX = player.position.x + vx * horizon;
  let predY = player.position.y + vy * horizon;

  // Clamp to pitch
  predX = Math.max(0.5, Math.min(pitch.width - 0.5, predX));
  predY = Math.max(0.5, Math.min(pitch.height - 0.5, predY));

  // Blend: 60% predicted, 40% current (don't over-lead)
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

  // Goal side (for through balls)
  const oppGoalX = carrier.team === 'team1' ? 0 : pitch.width;

  for (const t of allPlayers) {
    if (t === carrier || t.team !== carrier.team || t.isGoalkeeper) continue;

    const dx = t.position.x - carrierX;
    const dy = t.position.y - carrierY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Skip too close or absurdly far
    if (dist < 3 || dist > 45) continue;

    // ── Try different pass powers ────────────────────────────────────────
    const powers = [AI.passPowerMin, (AI.passPowerMin + AI.passPowerMax) / 2, AI.passPowerMax];
    let bestForTarget = null;
    let bestScoreForTarget = -Infinity;

    for (const power of powers) {
      const leadPos = predictReceivingPosition(t, carrierX, carrierY, power, pitch);
      const leadDx = leadPos.x - carrierX;
      const leadDy = leadPos.y - carrierY;
      const leadDist = Math.sqrt(leadDx * leadDx + leadDy * leadDy);

      // Lane clearance check (using LEAD position, not current position)
      const laneClear = isLaneClear(carrierX, carrierY, leadPos.x, leadPos.y, allPlayers, carrier.team);

      // Openness: nearest opponent distance to lead position
      let minOppDist = Infinity;
      for (const o of allPlayers) {
        if (o.team === carrier.team) continue;
        const od = o.distanceTo(leadPos);
        if (od < minOppDist) minOppDist = od;
      }

      // Forward progress
      const forward = ad * (leadPos.x - carrierX);

      // Danger: how close is the lead position to the opponent's goal?
      const toGoal = Math.abs(leadPos.x - oppGoalX);

      // Interception risk: opponent near the lead position
      const interceptRisk = minOppDist < 1.5 ? -2 : 0;

      // Passing lane bonus: clear lane gets significant boost
      const laneBonus = laneClear ? 1.8 : -0.5;

      // Shot potential: if lead pos is in shooting range, bonus
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

    if (bestForTarget) {
      results.push(bestForTarget);
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Attempt a chip / lob pass over a blocking opponent.
 * Returns a { targetX, targetY, power } or null if no chip opportunity.
 */
export function findChipOpportunity(carrier, ball, pitch, allPlayers, AI) {
  const carrierX = ball.position.x;
  const carrierY = ball.position.y;
  const ad = carrier.team === 'team1' ? -1 : 1;

  // Find best chip target (teammate on the other side of a blocking opponent)
  let bestChip = null;
  let bestChipScore = -Infinity;

  for (const t of allPlayers) {
    if (t === carrier || t.team !== carrier.team || t.isGoalkeeper) continue;
    const dx = t.position.x - carrierX;
    const dy = t.position.y - carrierY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4 || dist > 40) continue;

    // Check if direct lane is blocked
    if (isLaneClear(carrierX, carrierY, t.position.x, t.position.y, allPlayers, carrier.team)) {
      continue; // no need to chip, lane is open
    }

    // Find which opponent is blocking
    let blocker = null;
    let blockerDist = Infinity;
    for (const o of allPlayers) {
      if (o.team === carrier.team) continue;
      const od = o.distanceTo({ x: (carrierX + t.position.x) / 2, y: (carrierY + t.position.y) / 2 });
      if (od < blockerDist) {
        blockerDist = od;
        blocker = o;
      }
    }

    if (!blocker) continue;

    // Lead the receiver (they'll be running toward the chip)
    const leadPos = predictReceivingPosition(t, carrierX, carrierY, 18, pitch);

    // Only worth chipping if receiver will be clear after the chip
    let minOppAfterChip = Infinity;
    for (const o of allPlayers) {
      if (o.team === carrier.team) continue;
      const od = o.distanceTo(leadPos);
      if (od < minOppAfterChip) minOppAfterChip = od;
    }

    const chipScore = minOppDistBonus(minOppAfterChip) + ad * (leadPos.x - carrierX) * 0.15;

    if (chipScore > bestChipScore) {
      bestChipScore = chipScore;
      bestChip = {
        player: t,
        leadPos,
        power: Math.min(AI.passPowerMax, dist * 0.7 + 5),
      };
    }
  }

  function minOppDistBonus(d) {
    if (d > 5) return 2.5;
    if (d > 3) return 1.5;
    if (d > 2) return 0.5;
    return -1;
  }

  return bestChipScore > 1 ? bestChip : null;
}

/**
 * One-two check: after passing, does the carrier have a clear return path?
 * Returns true if the passer should make an immediate supporting run.
 */
export function oneTwoViable(carrier, ball, passTarget, allPlayers) {
  // Check if carrier can get back to the ball after passing
  // (Ball carrier will move toward goal, so we check if there's space to receive again)
  const dx = passTarget.player.position.x - carrier.position.x;
  const dy = passTarget.player.position.y - carrier.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist > 8; // Only one-two on medium/long passes where there's space
}
