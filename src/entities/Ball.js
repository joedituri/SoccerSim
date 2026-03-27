// Ball entity (metric units) with airborne state
import { CONFIG } from '../config.js';

export class Ball {
  constructor(x = 0, y = 0) {
    this.position = { x, y };       // meters
    this.velocity = { x: 0, y: 0 }; // m/s
    this.spin = 0;                  // rad/s ( Magnus effect )
    this.radius = CONFIG.physics.ball.radius;

    // Airborne state
    this.isAirborne = false;
    this.airborneTime = 0;          // seconds remaining in air
    this.height = 0;                // visual height (for future rendering)
    
    // Visual rotation (radians)
    this.rotation = 0;              // current rotation angle
    this.rotationSpeed = 0;         // visual rotation rate (rad/s)
    
    // Possession
    this.heldBy = null;             // GK holding the ball
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
    return this.getSpeed() > 0.05;
  }

  // Apply impulse (kick) - speeds in m/s
  // Higher speed = more likely to become airborne
  kick(vx, vy, spin = 0) {
    // Clamp velocity to prevent numerical instability
    const maxSpeed = 30; // m/s – hard upper bound
    const rawSpeed = Math.sqrt(vx * vx + vy * vy);
    if (rawSpeed > maxSpeed) {
      const scale = maxSpeed / rawSpeed;
      vx *= scale;
      vy *= scale;
    }

    this.velocity.x = vx;
    this.velocity.y = vy;

    // Clamp spin to configured maximum
    const maxSpin = CONFIG.physics.ball.maxSpin;
    this.spin = Math.max(-maxSpin, Math.min(maxSpin, spin));

    // Determine if airborne based on kick speed
    const speed = this.getSpeed();
    
    // Thresholds:
    // < 10 m/s: stays on ground
    // 10-20 m/s: short flight (0.3-0.8s)
    // > 20 m/s: longer flight (0.8-1.5s)
    if (speed > 10) {
      this.isAirborne = true;
      // Flight time scales with speed
      const baseTime = 0.2;
      const speedFactor = (speed - 10) / 22; // 0-1 based on 10-32 m/s range
      this.airborneTime = baseTime + speedFactor * 1.3; // 0.2s to 1.5s
      this.height = 0.3 + speedFactor * 0.7; // visual height 0.3-1.0m
    } else {
      this.isAirborne = false;
      this.airborneTime = 0;
      this.height = 0;
    }
  }

  // Called each physics tick
  updateAirborneState(dt) {
    if (this.isAirborne) {
      this.airborneTime -= dt;
      
      // Parabolic height decay (simulates landing)
      const remaining = Math.max(0, this.airborneTime);
      const maxTime = 1.5;
      const progress = remaining / maxTime;
      this.height = progress * progress * 0.3; // quadratic decay

      if (this.airborneTime <= 0) {
        this.isAirborne = false;
        this.height = 0;
        this.airborneTime = 0;
      }
    }
  }
}
