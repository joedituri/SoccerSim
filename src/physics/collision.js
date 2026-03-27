// Player-ball collision and micro-kick dribbling system
import { CONFIG } from '../config.js';

export class CollisionSystem {
  update(ball, players, dt) {
    // Ball is secured in the GK's hands — no player–ball physics until released
    if (ball.heldBy) {
      return;
    }

    players.forEach(player => {
      const dist = player.distanceTo(ball.position);
      const minDist = player.radius + ball.radius;
      const influenceDist = player.influenceRadius + ball.radius;

      if (dist < influenceDist) {
        this.handleBallControl(ball, player, dist, dt);
      }

      if (dist < minDist) {
        this.resolveCollision(ball, player, dist, minDist);
      }
    });
  }

  handleBallControl(ball, player, dist, dt) {
    // Skip if GK already holding or ball is airborne (let it land)
    if (ball.heldBy || ball.isAirborne) return;

    const influenceRange = player.influenceRadius + ball.radius;
    const inControl = dist < influenceRange;

    if (!inControl) return;

    // Direction from player to ball
    const toBallX = ball.position.x - player.position.x;
    const toBallY = ball.position.y - player.position.y;
    const toBallLen = Math.sqrt(toBallX * toBallX + toBallY * toBallY);
    if (toBallLen < 0.01) return;

    // Player's facing/movement direction
    const moveDir = player.facingDirection();
    const playerSpeed = player.getSpeed();

    // Is player facing the ball? (dot product)
    const facingBall = (moveDir.x * toBallX + moveDir.y * toBallY) / toBallLen;
    const ballMovingTowardPlayer = this.ballMovingTowardPlayer(ball, player);

    // 1. TRAP: Ball coming in fast + player facing it = trap/cushion
    const ballSpeed = ball.getSpeed();
    if (ballSpeed > 3 && ballMovingTowardPlayer && facingBall > -0.3) {
      // Dampen ball velocity significantly (first touch)
      const trapFactor = 0.4; // Kill 60% of speed
      ball.velocity.x *= trapFactor;
      ball.velocity.y *= trapFactor;
      ball.spin *= 0.3;

      // Add a tiny push in player's movement direction
      if (playerSpeed > 0.5) {
        ball.velocity.x += moveDir.x * 2;
        ball.velocity.y += moveDir.y * 2;
      }
      return;
    }

    // 2. DRIBBLE: Player moving + ball close = micro-kicks
    if (playerSpeed > 0.5 && dist < influenceRange * 0.8) {
      // Check if ball is ahead of player in movement direction
      const ballAhead = moveDir.x * toBallX + moveDir.y * toBallY;

      // Ball is behind or to the side - needs a touch
      if (ballAhead < player.radius * 2) {
        // Micro-kick: tiny impulse in movement direction
        const kickPower = playerSpeed * 0.8; // Proportional to running speed

        // Kick cooldown to prevent every-frame kicks
        if (player.kickCooldown <= 0) {
          ball.velocity.x = moveDir.x * kickPower + player.velocity.x * 0.3;
          ball.velocity.y = moveDir.y * kickPower + player.velocity.y * 0.3;
          player.kickCooldown = 0.15; // Short cooldown for dribbling
        }
      }
    }
  }

  ballMovingTowardPlayer(ball, player) {
    const dx = player.position.x - ball.position.x;
    const dy = player.position.y - ball.position.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return false;

    // Dot product: ball velocity · direction to player
    const dot = (ball.velocity.x * dx + ball.velocity.y * dy) / len;
    return dot > 0; // Positive = moving toward player
  }

  resolveCollision(ball, player, dist, minDist) {
    const overlap = minDist - dist;

    const dx = ball.position.x - player.position.x;
    const dy = ball.position.y - player.position.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < 0.01) {
      const facing = player.facingDirection();
      ball.position.x += facing.x * overlap;
      ball.position.y += facing.y * overlap;
      return;
    }

    const nx = dx / len;
    const ny = dy / len;

    ball.position.x += nx * overlap;
    ball.position.y += ny * overlap;

    const relVx = ball.velocity.x - player.velocity.x;
    const relVy = ball.velocity.y - player.velocity.y;
    const relVn = relVx * nx + relVy * ny;

    if (relVn > 0) return;

    const restitution = CONFIG.physics.ball.restitution * 0.5;
    const impulse = -(1 + restitution) * relVn;

    ball.velocity.x += impulse * nx;
    ball.velocity.y += impulse * ny;

    ball.velocity.x += player.velocity.x * 0.2;
    ball.velocity.y += player.velocity.y * 0.2;

    ball.spin *= 0.5;
  }

  kick(ball, player, targetX, targetY, power) {
    const dx = targetX - ball.position.x;
    const dy = targetY - ball.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) return false;
    if (!player.isInfluencingBall(ball)) return false;
    if (player.kickCooldown > 0) return false;

    const nx = dx / dist;
    const ny = dy / dist;

    ball.velocity.x = nx * power;
    ball.velocity.y = ny * power;

    const moveAngle = Math.atan2(player.velocity.y, player.velocity.x);
    const kickAngle = Math.atan2(ny, nx);
    const angleDiff = moveAngle - kickAngle;
    const maxSpin = CONFIG.physics.ball.maxSpin;
    ball.spin = Math.max(-maxSpin, Math.min(maxSpin,
      Math.sin(angleDiff) * 15 * (player.getSpeed() / player.maxSpeed)));

    player.kickCooldown = 0.3;

    return true;
  }
}
