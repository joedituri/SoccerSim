// Ball physics simulation
import { CONFIG } from '../config.js';

export class BallPhysics {
  update(ball, dt) {
    if (ball.heldBy) {
      const h = ball.heldBy;
      const carry = h.team === 'team1' ? 0.35 : -0.35;
      ball.position.x = h.position.x + carry;
      ball.position.y = h.position.y;
      ball.velocity.x = 0;
      ball.velocity.y = 0;
      ball.spin = 0;
      return;
    }

    ball.updateAirborneState(dt);

    if (ball.isAirborne) {
      this.applyAirDrag(ball, dt);
    } else {
      this.applyAirDrag(ball, dt);
      this.applyFriction(ball, dt);
    }

    this.decaySpin(ball, dt);
    this.integratePosition(ball, dt);

    if (!ball.isAirborne) {
      this.handlePitchBoundaries(ball);
    } else {
      this.handleSoftBoundaries(ball);
    }
  }

  applyAirDrag(ball, dt) {
    const speed = ball.getSpeed();
    if (speed < 0.01) return;

    const { dragCoeff, airDensity, area, mass } = CONFIG.physics.ball;
    
    const dragForce = 0.5 * dragCoeff * airDensity * area * speed * speed;
    const dragAccel = dragForce / mass;
    
    const decelFactor = Math.max(0, 1 - (dragAccel * dt / speed));
    ball.velocity.x *= decelFactor;
    ball.velocity.y *= decelFactor;
  }

  applyFriction(ball, dt) {
    const mu = CONFIG.physics.ball.friction;
    const g = 9.81;
    const frictionDecel = mu * g * dt;
    const speed = ball.getSpeed();

    if (speed > 0.05) {
      const decelFactor = Math.max(0, 1 - frictionDecel / speed);
      ball.velocity.x *= decelFactor;
      ball.velocity.y *= decelFactor;
    }

    if (ball.getSpeed() < 0.05) {
      ball.velocity.x = 0;
      ball.velocity.y = 0;
    }
  }

  decaySpin(ball, dt) {
    const baseDecay = CONFIG.physics.ball.spinDecay;
    const decayRate = ball.isAirborne ? baseDecay : baseDecay * 0.95;
    ball.spin *= Math.pow(decayRate, dt * 60);

    if (Math.abs(ball.spin) < 0.1) {
      ball.spin = 0;
    }
  }

  integratePosition(ball, dt) {
    ball.position.x += ball.velocity.x * dt;
    ball.position.y += ball.velocity.y * dt;
    
    const speed = ball.getSpeed();
    if (speed > 0.05 && !ball.isAirborne) {
      ball.rotationSpeed = speed / ball.radius;
      ball.rotation -= ball.rotationSpeed * dt;
    } else {
      ball.rotationSpeed *= 0.95;
    }
  }

  handlePitchBoundaries(ball) {
    const { width, height } = CONFIG.pitch;
    const goalWidth = CONFIG.pitch.goalWidth || 3;
    const radius = ball.radius;
    const restitution = CONFIG.physics.ball.restitution;
    const goalY = (height - goalWidth) / 2;

    // Left/right boundaries with goal opening
    if (ball.position.x - radius < 0) {
      // Check if ball is in goal area
      if (ball.position.y < goalY || ball.position.y > goalY + goalWidth) {
        ball.position.x = radius;
        ball.velocity.x *= -restitution;
        ball.spin *= 0.5;
      }
      // else: ball is in goal opening, let it through for goal check
    } else if (ball.position.x + radius > width) {
      // Check if ball is in goal area
      if (ball.position.y < goalY || ball.position.y > goalY + goalWidth) {
        ball.position.x = width - radius;
        ball.velocity.x *= -restitution;
        ball.spin *= 0.5;
      }
      // else: ball is in goal opening, let it through for goal check
    }

    // Top/bottom boundaries (no openings)
    if (ball.position.y - radius < 0) {
      ball.position.y = radius;
      ball.velocity.y *= -restitution;
      ball.spin *= 0.5;
    } else if (ball.position.y + radius > height) {
      ball.position.y = height - radius;
      ball.velocity.y *= -restitution;
      ball.spin *= 0.5;
    }
  }

  handleSoftBoundaries(ball) {
    const { width, height } = CONFIG.pitch;
    const goalWidth = CONFIG.pitch.goalWidth || 3;
    const radius = ball.radius;
    const goalY = (height - goalWidth) / 2;

    if (ball.position.x - radius < 0) {
      if (ball.position.y < goalY || ball.position.y > goalY + goalWidth) {
        ball.position.x = radius;
        ball.velocity.x *= -0.5;
      }
    } else if (ball.position.x + radius > width) {
      if (ball.position.y < goalY || ball.position.y > goalY + goalWidth) {
        ball.position.x = width - radius;
        ball.velocity.x *= -0.5;
      }
    }

    if (ball.position.y - radius < 0) {
      ball.position.y = radius;
      ball.velocity.y *= -0.5;
    } else if (ball.position.y + radius > height) {
      ball.position.y = height - radius;
      ball.velocity.y *= -0.5;
    }
  }
}
