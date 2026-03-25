// Player physics simulation
import { CONFIG } from '../config.js';

export class PlayerPhysics {
  update(player, dt) {
    this.processMovement(player, dt);
    this.updateStamina(player, dt);
    this.applyFriction(player, dt);

    player.position.x += player.velocity.x * dt;
    player.position.y += player.velocity.y * dt;

    if (player.isMoving()) {
      player.angle = Math.atan2(player.velocity.y, player.velocity.x);
    }

    this.handleBoundaries(player);
  }

  processMovement(player, dt) {
    // AI players set velocity directly in their AI, but apply friction
    if (player.isAI) {
      // Apply friction to AI velocity
      const friction = 3; // m/s²
      const speed = player.getSpeed();
      if (speed > 0.1) {
        const decel = friction * dt;
        const newSpeed = Math.max(0, speed - decel);
        if (newSpeed > 0) {
          const scale = newSpeed / speed;
          player.velocity.x *= scale;
          player.velocity.y *= scale;
        } else {
          player.velocity.x = 0;
          player.velocity.y = 0;
        }
      }
      return;
    }
    
    // Manual player movement (not currently used)
    const { inputDirection, isSprinting, speedMultiplier } = player;

    if (inputDirection.x === 0 && inputDirection.y === 0) {
      return;
    }

    // Apply speed multiplier
    let maxSpeed = player.maxSpeed * speedMultiplier;
    
    if (isSprinting && player.stamina > 0) {
      maxSpeed *= 1.3;
    } else if (player.stamina < 30) {
      maxSpeed *= 0.7 + (player.stamina / 30) * 0.3;
    }

    const accel = player.maxAccel;
    player.velocity.x += inputDirection.x * accel * dt;
    player.velocity.y += inputDirection.y * accel * dt;

    const speed = player.getSpeed();
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      player.velocity.x *= scale;
      player.velocity.y *= scale;
    }

    player.state = 'moving';
  }

  updateStamina(player, dt) {
    const aiSprinting =
      player.isAI &&
      !player.isGoalkeeper &&
      player.getSpeed() > player.maxSpeed * 0.85;
    const sprinting = (player.isSprinting || aiSprinting) && player.isMoving();

    if (sprinting) {
      player.stamina = Math.max(0, player.stamina - player.staminaSprintCost * dt * 10);
    } else if (!player.isMoving()) {
      player.stamina = Math.min(player.staminaMax, player.stamina + player.staminaRecoveryRate * dt);
    } else {
      player.stamina = Math.min(player.staminaMax, player.stamina + player.staminaRecoveryRate * dt * 0.3);
    }
  }

  applyFriction(player, dt) {
    if (player.isAI) {
      return;
    }

    const friction = 5;
    const speed = player.getSpeed();

    if (speed > 0.1) {
      const decel = friction * dt;
      const newSpeed = Math.max(0, speed - decel);
      const scale = newSpeed / speed;
      player.velocity.x *= scale;
      player.velocity.y *= scale;
    } else if (speed > 0) {
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.state = 'idle';
    }
  }

  handleBoundaries(player) {
    const { pitch } = CONFIG;
    const r = player.radius;

    if (player.position.x - r < 0) {
      player.position.x = r;
      player.velocity.x = 0;
    } else if (player.position.x + r > pitch.width) {
      player.position.x = pitch.width - r;
      player.velocity.x = 0;
    }

    if (player.position.y - r < 0) {
      player.position.y = r;
      player.velocity.y = 0;
    } else if (player.position.y + r > pitch.height) {
      player.position.y = pitch.height - r;
      player.velocity.y = 0;
    }
  }
}
