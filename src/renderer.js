// Canvas renderer (metric display)
import { CONFIG } from './config.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ppm = CONFIG.rendering.pixelsPerMeter;
  }

  render(ball, shotData = null) {
    const ppm = this.ppm;

    // Clear
    this.ctx.fillStyle = CONFIG.rendering.pitchColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw pitch
    this.drawPitch();

    // Draw aim line if targeting
    if (shotData && shotData.target) {
      this.drawAimLine(ball, shotData);
    }

    // Draw ball
    this.drawBall(ball);

    // Draw debug info
    this.drawDebug(ball, shotData);
  }

  drawPitch() {
    const { pitch } = CONFIG;
    const ppm = this.ppm;

    this.ctx.strokeStyle = CONFIG.rendering.lineColor;
    this.ctx.lineWidth = 2;

    // Outer boundary
    this.ctx.strokeRect(0, 0, pitch.width * ppm, pitch.height * ppm);

    // Center line
    this.ctx.beginPath();
    this.ctx.moveTo((pitch.width / 2) * ppm, 0);
    this.ctx.lineTo((pitch.width / 2) * ppm, pitch.height * ppm);
    this.ctx.stroke();

    // Center circle
    this.ctx.beginPath();
    this.ctx.arc(
      (pitch.width / 2) * ppm,
      (pitch.height / 2) * ppm,
      pitch.centerSpotRadius * ppm,
      0,
      Math.PI * 2
    );
    this.ctx.stroke();
  }

  drawBall(ball) {
    const ppm = this.ppm;

    // Ball circle
    this.ctx.fillStyle = CONFIG.rendering.ballColor;
    this.ctx.beginPath();
    this.ctx.arc(
      ball.position.x * ppm,
      ball.position.y * ppm,
      Math.max(3, ball.radius * ppm),
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Spin indicator
    if (Math.abs(ball.spin) > 0.5) {
      this.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      this.ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + (ball.spin * 0.02);
        this.ctx.beginPath();
        this.ctx.moveTo(
          (ball.position.x + Math.cos(angle) * ball.radius * 0.4) * ppm,
          (ball.position.y + Math.sin(angle) * ball.radius * 0.4) * ppm
        );
        this.ctx.lineTo(
          (ball.position.x + Math.cos(angle) * ball.radius) * ppm,
          (ball.position.y + Math.sin(angle) * ball.radius) * ppm
        );
        this.ctx.stroke();
      }
    }

    // Velocity vector
    if (ball.isMoving()) {
      this.ctx.strokeStyle = 'rgba(255,255,0,0.6)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(
        ball.position.x * ppm,
        ball.position.y * ppm
      );
      this.ctx.lineTo(
        (ball.position.x + ball.velocity.x * 0.2) * ppm,
        (ball.position.y + ball.velocity.y * 0.2) * ppm
      );
      this.ctx.stroke();
    }
  }

  drawAimLine(ball, shotData) {
    const ppm = this.ppm;
    const { target, power } = shotData;

    // Aim line
    this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(ball.position.x * ppm, ball.position.y * ppm);
    this.ctx.lineTo(target.x * ppm, target.y * ppm);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Target marker
    this.ctx.strokeStyle = '#FFD700';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(target.x * ppm, target.y * ppm, 8, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo((target.x * ppm) - 12, target.y * ppm);
    this.ctx.lineTo((target.x * ppm) + 12, target.y * ppm);
    this.ctx.moveTo(target.x * ppm, (target.y * ppm) - 12);
    this.ctx.lineTo(target.x * ppm, (target.y * ppm) + 12);
    this.ctx.stroke();
  }

  drawDebug(ball, shotData) {
    const ppm = this.ppm;
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'left';

    const speed = ball.getSpeed().toFixed(2);
    const spin = ball.spin.toFixed(2);
    const pos = `(${ball.position.x.toFixed(2)}m, ${ball.position.y.toFixed(2)}m)`;

    this.ctx.fillText(`Speed: ${speed} m/s`, 10, 20);
    this.ctx.fillText(`Spin: ${spin} rad/s`, 10, 35);
    this.ctx.fillText(`Pos: ${pos}`, 10, 50);
    this.ctx.fillText(`Field: ${CONFIG.pitch.width}m x ${CONFIG.pitch.height}m (5v5)`, 10, 65);
    
    if (shotData) {
      const kickSpeed = (5 + shotData.power * 27).toFixed(1);
      this.ctx.fillText(`Shot Power: ${kickSpeed} m/s`, 10, 80);
    }
  }
}
