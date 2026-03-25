// Player-ball collision and influence system
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
        this.applyInfluence(ball, player, dist, dt);
      }
      
      if (dist < minDist) {
        this.resolveCollision(ball, player, dist, minDist);
      }
    });
  }
  
  applyInfluence(ball, player, dist, dt) {
    const dx = player.position.x - ball.position.x;
    const dy = player.position.y - ball.position.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    if (len < 0.01) return;
    
    const nx = dx / len;
    const ny = dy / len;
    
    const influenceRange = player.influenceRadius;
    const proximity = 1 - (dist / (influenceRange + ball.radius));
    let strength = proximity * 2.5;
    
    if (ball.isAirborne) {
      strength *= 0.2;
    }
    
    ball.velocity.x += nx * strength * dt;
    ball.velocity.y += ny * strength * dt;
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
    ball.spin = Math.sin(angleDiff) * 15 * (player.getSpeed() / player.maxSpeed);
    
    player.kickCooldown = 0.3;
    
    return true;
  }
}
