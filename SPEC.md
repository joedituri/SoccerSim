# SoccerSim — Technical Specification

## 1. Overview

A browser-based 3v3 (+GK) soccer simulation rendered on an HTML5 Canvas using vanilla JavaScript with ES modules. The focus is on realistic ball physics and autonomous player AI. The architecture is designed to scale to 11v11 without structural changes.

---

## 2. Module Structure

```
SoccerSim/
├── index.html          # Entry point; canvas + controls UI
├── README.md
├── SPEC.md
└── src/
    ├── constants.js    # All numeric/config constants (single source of truth)
    ├── ball.js         # Ball class: state + physics update
    ├── player.js       # Player class: state + movement physics
    ├── physics.js      # Collision detection & resolution functions
    ├── ai.js           # AIController: per-player decision-making
    ├── rendering.js    # Renderer class: all canvas draw calls
    ├── gameState.js    # GameState class: match lifecycle, score, phases
    └── main.js         # Entry: game loop, UI bindings, orchestration
```

All modules use ES module syntax (`import`/`export`). `main.js` is the root.

---

## 3. Constants (`constants.js`)

Single file holds all tunable values to avoid magic numbers scattered through the codebase.

### Canvas & Pitch
| Constant | Value | Notes |
|---|---|---|
| `CANVAS.width` | 900 | px |
| `CANVAS.height` | 620 | px |
| `PITCH.x` | 50 | Left edge (leaves room for goal depth) |
| `PITCH.y` | 70 | Top edge (leaves room for HUD) |
| `PITCH.width` | 800 | px |
| `PITCH.height` | 480 | px |

### Goal
| Constant | Value | Notes |
|---|---|---|
| `GOAL.height` | 110 | Goal opening (y-span) |
| `GOAL.depth` | 25 | Net depth behind goal line |

### Ball Physics
| Constant | Value | Notes |
|---|---|---|
| `BALL.radius` | 7 | px |
| `BALL.drag` | 0.990 | Air resistance multiplier per frame |
| `BALL.groundFriction` | 0.980 | Rolling friction per frame |
| `BALL.bounceDamping` | 0.60 | Energy retained on boundary bounce |
| `BALL.spinDecay` | 0.93 | Spin dissipation per frame |
| `BALL.spinInfluence` | 0.06 | How much spin deflects trajectory |

### Player Physics
| Constant | Value | Notes |
|---|---|---|
| `PLAYER.radius` | 10 | px, used for collision and rendering |
| `PLAYER.maxSpeedBase` | 4.5 | px/frame; modified by role |
| `PLAYER.acceleration` | 0.38 | px/frame² |
| `PLAYER.friction` | 0.80 | Velocity decay when not at target |
| `PLAYER.kickRadius` | 22 | Distance from ball center to trigger kick |
| `PLAYER.controlRadius` | 28 | Wider radius for possession tracking |
| `PLAYER.staminaDrain` | 0.0007 | Per frame at full speed |
| `PLAYER.staminaRecovery` | 0.0004 | Per frame when slow/idle |
| `PLAYER.lowStaminaThreshold` | 0.30 | Below this: speed reduced |

### Kick Powers (px/frame)
| Type | Power |
|---|---|
| Dribble touch | 3.5 |
| Short pass | 6.5 |
| Long pass | 9.0 |
| Shot | 13.5 |
| GK clearance | 10.0 |

### Match
| Constant | Value |
|---|---|
| `MATCH.duration` | 180s (3 minutes for v1 demo) |
| `MATCH.kickoffDelay` | 120 frames after goal |

### Teams
```js
TEAMS.A = { id:'A', color:'#e63946', secondaryColor:'#fff', direction:+1, name:'Red' }
TEAMS.B = { id:'B', color:'#1d3557', secondaryColor:'#a8dadc', direction:-1, name:'Blue' }
```
`direction: +1` = attacks right (toward `PITCH.x + PITCH.width`).

---

## 4. Physics Model

### 4.1 Ball Physics (`ball.js`)

State per frame:
- `x, y` — position
- `vx, vy` — velocity (px/frame)
- `spin` — scalar magnitude of topspin/sidespin
- `spinAxis` — unit vector perpendicular to kick direction (curl direction)
- `rotation` — cumulative visual rotation (for rendering)
- `lastKickedBy` — reference to Player who last kicked

**Update pipeline (each frame):**
1. Apply spin curl: `vx += spinAxis.x * spin * spinInfluence; vy += spinAxis.y * ...`
2. Decay spin: `spin *= spinDecay`
3. Apply air drag: `vx *= drag; vy *= drag`
4. Apply ground friction (if `speed > 0.05`): `vx *= groundFriction; vy *= groundFriction`
5. Integrate: `x += vx; y += vy`
6. Accumulate visual rotation
7. Boundary handling (see below)

**Boundary handling:**
- **Top/Bottom walls:** reflect `vy` with `bounceDamping`, clamp position
- **Left/Right walls:**
  - If `y` is within goal opening: ball passes through; apply net resistance (`vx *= 0.65, vy *= 0.90`); clamp at back of net
  - Otherwise: reflect `vx` with `bounceDamping`, clamp position

**Kick API:**
```js
ball.kick(vx, vy, spin)
```
Sets velocity directly. Spin axis is computed from kick direction.

### 4.2 Player Physics (`player.js`)

State:
- `x, y` — position
- `vx, vy` — velocity
- `targetX, targetY` — desired position (set by AI each frame)
- `stamina` — [0,1], affects max speed
- `kickCooldown` — frames until next kick allowed
- `role` — GOALKEEPER | DEFENDER | MIDFIELDER | ATTACKER

**Update pipeline:**
1. Compute delta to target
2. If `dist > 2`: accelerate toward target, clamp to `effectiveMaxSpeed`; drain stamina proportional to speed
3. Else: apply friction deceleration; recover stamina
4. Integrate position
5. Clamp to pitch bounds (role-specific X limits for GK)
6. Decrement `kickCooldown`

**Effective max speed:**
```
effectiveMaxSpeed = maxSpeed * roleModifier * staminaModifier
staminaModifier = 1.0 if stamina > threshold, else 0.6 + 0.4*(stamina/threshold)
```

Role speed modifiers: GK×0.85, DEF×0.95, MID×1.00, ATT×1.10

### 4.3 Collision Detection & Resolution (`physics.js`)

**Player–Ball:**
- Check: `dist(player, ball) < PLAYER.radius + BALL.radius`
- Resolve: separate along normal; apply restitution impulse transferring player momentum to ball
- Restitution coefficient: 0.5

**Player–Player:**
- Check: `dist(p1, p2) < PLAYER.radius * 2`
- Resolve: push apart equally; exchange velocity components along collision normal (damping 0.7)
- Applied to all pairs each frame O(n²) — acceptable for 8 players

**Goal Detection (in `gameState.js`):**
- Left goal scored (Team B scores): `ball.x < PITCH.x && inGoalY`
- Right goal scored (Team A scores): `ball.x > PITCH.x + PITCH.width && inGoalY`

---

## 5. Player AI System (`ai.js`)

### 5.1 Possession Model

Each frame, `AIController.update()` computes the **ball controller**: the player nearest the ball who is within `PLAYER.controlRadius`. If the last kicker's `kickCooldown > 0` and they're within 2× controlRadius, they retain "control" (prevents flickering).

```
controller = null              → ball is LOOSE
controller.team === myTeam     → MY TEAM HAS BALL
controller === me              → I HAVE BALL
controller.team !== myTeam     → OPPONENT HAS BALL
```

### 5.2 Per-Player Decision Tree

Called every frame for each player:

```
if controller === me:
    handleBallCarrier()
elif myTeam has ball:
    handleSupport()
elif opponents have ball:
    handleDefense()
else (loose ball):
    handleLooseBall()
```

### 5.3 Ball Carrier Behavior (`handleBallCarrier`)

Evaluate in priority order:

1. **Shoot** — if `isInShotZone && distToGoal < shootRange && canKick`
   - `isInShotZone`: attacker in opponent half; midfielder in final third; GK never
   - Shot power + small random spread (±10° max); random spin for curl
2. **Pass** — if `underPressure || heldTooLong (>90 frames)`
   - Find best pass target via scoring function (see below)
   - Lead pass: add fraction of target's velocity to kick vector
3. **Dribble** — default
   - Move toward a point 30px ahead of ball in direction of goal
   - When `canKick`: small kick (power 3.5) in goal direction
   - Cooldown 12 frames between dribble touches

**Pass scoring function** (for each teammate):
```
score = forwardProgress * 0.5       // prefer forward passes
      + nearestOpponentDist * 0.25  // prefer open players
      - distToGoal * 0.08           // prefer dangerous positions
      - passLength * 0.05           // slight penalty for long passes
```

**"Under pressure"** = nearest opponent within 55px.

### 5.4 Support Movement (`handleSupport`)

Players without ball position to receive passes and maintain shape.

Role-based ideal X:
- ATT: `ball.x + direction * 120` (push ahead)
- MID: `pitchCenter + direction * 60` (central)
- DEF: `pitchCenter - direction * 120` (behind ball)

Ideal Y: spread out from ball Y using player index offset (±130px), clamped to pitch.

Additionally, attackers and midfielders make diagonal runs when ball is in final third — move toward a "dangerous" position near far post.

### 5.5 Defensive Behavior (`handleDefense`)

- **ATT**: If within 160px of ball carrier, press. Else drop to midfield line.
- **MID**: If within 110px, press. Else position between ball and own goal.
- **DEF**: Find an unmarked opponent to mark (mark = stay within 60px); else hold defensive shape.
- **GK** (separate logic): Track ball Y along goal line; advance slightly based on ball distance; kick when ball enters penalty area.

### 5.6 Loose Ball Behavior

- Player closest to ball on team → chase ball (move to ball position)
- Others → run support positions (same as `handleSupport`)

### 5.7 Goalkeeper AI

Handled in `AIController.updateGK()`:
1. Target Y = clamp(ball.y, goalCenter - goalHalfHeight + 15, goalCenter + goalHalfHeight - 15)
2. Target X = goalLineX ± advance (advance = min(60, ballDistToGoal * 0.08))
3. When ball within penalty area AND GK can kick: clearance kick toward nearest teammate or up-field

GK X constraints (Team A GK): `[PITCH.x + 5, PITCH.x + 90]`
GK X constraints (Team B GK): `[PITCH.x + PITCH.width - 90, PITCH.x + PITCH.width - 5]`

### 5.8 Kickoff Logic

In `KICKOFF` phase:
- Designated kicker (center midfielder) moves to ball
- All other players hold start positions
- After `kickoffDelayFrames` with kicker at ball: auto-trigger a small forward kick + random Y nudge

---

## 6. Game State (`gameState.js`)

### 6.1 Match Phases

```
KICKOFF  → PLAYING → (goal scored) → GOAL → KICKOFF → ...
                   → (time expires) → FULLTIME
```

### 6.2 State Data

```js
{
  phase: 'KICKOFF' | 'PLAYING' | 'GOAL' | 'FULLTIME',
  time: 0,              // elapsed seconds
  score: { A: 0, B: 0 },
  ball: Ball,
  players: Player[],    // all 8 (4 per team)
  goalCooldown: 0,      // frames remaining in GOAL phase
  kickoffTeam: 'A'|'B', // who kicks off next
  lastGoalEvent: null,
  events: [],           // log of { type, team, time }
}
```

### 6.3 Lifecycle Methods

- `update(dt)` — advance time, check goals, manage phase transitions
- `resetForKickoff()` — reset ball to center, reset player start positions
- `checkGoal()` — detect ball crossing goal lines

---

## 7. Rendering (`rendering.js`)

All drawing goes through a `Renderer` class wrapping `CanvasRenderingContext2D`.

### 7.1 Draw Order (back to front)

1. Pitch background (green stripes)
2. Pitch markings (lines, center circle, penalty areas, penalty spots)
3. Goals (semi-transparent fill + outline)
4. Players (shadow → body → direction dot → number → stamina bar if low)
5. Ball (shadow → white sphere → panel pattern → outline)
6. HUD overlay (scoreboard, clock, goal flash, fulltime screen)

### 7.2 Pitch Markings

- Alternating stripe bands (50px wide), two greens
- Boundary rectangle
- Halfway line
- Center circle (radius 60px)
- Center spot
- Penalty areas (proportional to GOAL.height)
- Small boxes (goal area)
- Penalty spots

### 7.3 Ball Rendering

- Drop shadow (ellipse, slightly offset + scaled)
- White filled circle, rotated by `ball.rotation`
- Dark pentagon-like inner mark (rotates with ball, shows spin visually)
- Light stroke outline

### 7.4 Player Rendering

- Drop shadow
- Team-colored filled circle
- Directional indicator dot (secondary color, offset toward `targetX/Y`)
- Player number in secondary color (8px bold)
- Stamina bar: only shown when `stamina < 0.70`; yellow above 30%, red below

### 7.5 HUD

- **Scoreboard**: centered, rounded rect background, team names + scores + elapsed time
- **Clock**: displays `MM:SS` of elapsed time (counts up toward 3:00)
- **Goal flash**: fullscreen yellow overlay fading over 60 frames; large "GOAL!" text + team name
- **Full time**: dark overlay; "FULL TIME" + winner announcement + "Press Restart" hint

---

## 8. Game Loop (`main.js`)

Fixed-timestep simulation with variable rendering:

```
accumulator += displayDt * speedMultiplier
while accumulator >= FIXED_STEP (1/60):
    update()         // AI + physics + game state
    accumulator -= FIXED_STEP
render()
```

Cap `accumulator` at `FIXED_STEP * 5` to prevent spiral of death.

**Update order per step:**
1. AI decisions (set player targets, execute kicks)
2. Player movement updates
3. Player–player collision resolution
4. Player–ball collision resolution
5. Ball physics update (including boundary/goal check)
6. GameState update (time, phase transitions)

### UI Controls

- **Play/Pause** button — toggles `running`
- **Restart** button — rebuilds `GameState`, resets AI
- **Speed** slider — range [0.5, 4.0], step 0.5; controls `speedMultiplier`

---

## 9. Formation Setup (3v3 + GK)

### Starting Positions

```
Team A (attacks RIGHT →)
  GK:  (PITCH.x + 20, cy)
  DEF: (cx - 200, cy)
  MID: (cx - 90,  cy - 80)
  ATT: (cx - 20,  cy + 70)

Team B (attacks LEFT ←)
  GK:  (PITCH.x + PITCH.width - 20, cy)
  DEF: (cx + 200, cy)
  MID: (cx + 90,  cy + 80)
  ATT: (cx + 20,  cy - 70)
```

`cx = PITCH.x + PITCH.width/2`, `cy = PITCH.y + PITCH.height/2`

### Kickoff: Team A kicks off first; second half (if added) Team B.

---

## 10. Scalability Notes (toward 11v11)

- `Player` class is role-agnostic; adding new roles is additive
- `AIController.update()` iterates all players; no hardcoded team sizes
- Formation positions can be driven by a config object rather than hardcoded coordinates
- Collision resolution is already O(n²) but acceptable; for 22 players, spatial hashing can be added to `physics.js`
- Pitch dimensions in `constants.js` can be changed; all logic uses relative coordinates

---

## 11. v1 Feature Checklist

- [x] Kickoff → playing → goal → kickoff → fulltime flow
- [x] Realistic ball physics: momentum, friction, drag, spin/curl, bounce
- [x] Player physics: acceleration curves, max speed by role, stamina
- [x] Collision: player-ball, player-player, ball-boundary, ball-goal
- [x] AI: shoot/pass/dribble decisions, support runs, defensive shape, GK
- [x] Scoreboard + match clock
- [x] Pitch markings (top-down 2D)
- [x] Player + ball rendering with team colors
- [x] Goal flash animation
- [x] Play/Pause + Speed control + Restart
- [x] ES modules, clean separation of concerns
- [x] README with run instructions
- [x] Git repository initialized

---

## 12. Known Simplifications for v1

- No offside rule
- No fouls / free kicks
- No corners / throw-ins (ball bounces off all boundaries)
- No halftime — single 3-minute period
- Stamina affects speed only (no injury simulation)
- GK distribution is always a clearance kick (no targeted throws)
- Pass leading is approximate (linear velocity extrapolation)
