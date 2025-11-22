// ===============================
// Constants and Configuration
// ===============================
const CONFIG = {
    CANVAS_WIDTH: 400,
    CANVAS_HEIGHT: 600,
    PLAYER_SPEED: 3,
    BULLET_SPEED: 8,
    BOMB_SPEED: 5,
    ENEMY_SPAWN_RATE: 60,
    CLOUD_SPAWN_RATE: 120,
    BELL_COLORS: ['yellow', 'white', 'blue', 'red'],
    BELL_SHOTS_TO_CHANGE: 5,
    SUPER_GAUGE_MAX: 100,
    SUPER_GAUGE_GAIN_PER_KILL: 10,
    DASH_SPEED: 8,
    DASH_DURATION: 15,
    DASH_COOLDOWN: 60
};

// ===============================
// Utility Functions
// ===============================
function checkCollision(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ===============================
// Base GameObject Class
// ===============================
class GameObject {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.active = true;
    }

    update() {}

    draw(ctx) {}

    isOffScreen(canvasHeight) {
        return this.y > canvasHeight + 50 || this.y < -50;
    }
}

// ===============================
// Player Class (TwinBee)
// ===============================
class Player extends GameObject {
    constructor(x, y, shipType = 'twinbee') {
        super(x, y, 30, 30);
        this.shipType = shipType;
        this.speed = CONFIG.PLAYER_SPEED;
        this.speedLevel = 0;
        this.lives = 3;
        this.invulnerable = false;
        this.invulnerableTimer = 0;
        this.hasTwinCannon = false;
        this.hasBarrier = false;
        this.barrierStrength = 0;

        // Super Attack System
        this.superGauge = 0;

        // Dash System
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashCooldownTimer = 0;
        this.dashDirection = { x: 0, y: 0 };

        // Ship-specific stats
        this.applyShipStats();
    }

    applyShipStats() {
        switch(this.shipType) {
            case 'twinbee':
                // Balanced
                this.speed = CONFIG.PLAYER_SPEED;
                this.damageMultiplier = 1;
                break;
            case 'winbee':
                // Fast, lower damage
                this.speed = CONFIG.PLAYER_SPEED + 1;
                this.damageMultiplier = 0.8;
                break;
            case 'gwinbee':
                // Slow, higher damage
                this.speed = CONFIG.PLAYER_SPEED - 0.5;
                this.damageMultiplier = 1.5;
                break;
            case 'starbee':
                // Special weapons
                this.speed = CONFIG.PLAYER_SPEED;
                this.damageMultiplier = 1.2;
                this.hasLaser = true;
                break;
        }
    }

    update(input, canvasWidth, canvasHeight) {
        // Dash cooldown
        if (this.dashCooldownTimer > 0) {
            this.dashCooldownTimer--;
        }

        // Dash movement
        if (this.isDashing) {
            this.dashTimer--;
            this.x += this.dashDirection.x * CONFIG.DASH_SPEED;
            this.y += this.dashDirection.y * CONFIG.DASH_SPEED;

            // Clamp to canvas
            this.x = Math.max(0, Math.min(this.x, canvasWidth - this.width));
            this.y = Math.max(0, Math.min(this.y, canvasHeight - this.height));

            if (this.dashTimer <= 0) {
                this.isDashing = false;
            }
        } else {
            // Normal movement
            const currentSpeed = this.speed;
            if (input.left && this.x > 0) this.x -= currentSpeed;
            if (input.right && this.x < canvasWidth - this.width) this.x += currentSpeed;
            if (input.up && this.y > 0) this.y -= currentSpeed;
            if (input.down && this.y < canvasHeight - this.height) this.y += currentSpeed;
        }

        // Invulnerability timer
        if (this.invulnerable) {
            this.invulnerableTimer--;
            if (this.invulnerableTimer <= 0) {
                this.invulnerable = false;
            }
        }
    }

    dash(dirX, dirY) {
        if (this.dashCooldownTimer > 0 || this.isDashing) return false;

        const length = Math.sqrt(dirX * dirX + dirY * dirY);
        if (length === 0) return false;

        this.dashDirection.x = dirX / length;
        this.dashDirection.y = dirY / length;
        this.isDashing = true;
        this.dashTimer = CONFIG.DASH_DURATION;
        this.dashCooldownTimer = CONFIG.DASH_COOLDOWN;
        this.invulnerable = true;
        this.invulnerableTimer = CONFIG.DASH_DURATION;
        return true;
    }

    addSuperGauge(amount) {
        this.superGauge = Math.min(this.superGauge + amount, CONFIG.SUPER_GAUGE_MAX);
    }

    canUseSuperAttack() {
        return this.superGauge >= CONFIG.SUPER_GAUGE_MAX;
    }

    useSuperAttack() {
        if (!this.canUseSuperAttack()) return false;
        this.superGauge = 0;
        return true;
    }

    draw(ctx) {
        // Draw dash trail
        if (this.isDashing) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            for (let i = 1; i <= 3; i++) {
                ctx.fillRect(
                    this.x - this.dashDirection.x * i * 8,
                    this.y - this.dashDirection.y * i * 8,
                    this.width,
                    this.height
                );
            }
        }

        // Draw with blinking effect if invulnerable (but not dashing)
        if (this.invulnerable && !this.isDashing && Math.floor(this.invulnerableTimer / 5) % 2 === 0) {
            return;
        }

        // Draw barrier
        if (this.hasBarrier) {
            const barrierSize = 15 + this.barrierStrength * 2;
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2, barrierSize, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Ship color based on type
        let bodyColor = '#FF6B6B';
        let wingColor = '#4ECDC4';
        switch(this.shipType) {
            case 'twinbee':
                bodyColor = '#FF6B6B';
                wingColor = '#4ECDC4';
                break;
            case 'winbee':
                bodyColor = '#6B9BFF';
                wingColor = '#4ECDC4';
                break;
            case 'gwinbee':
                bodyColor = '#9B59B6';
                wingColor = '#E74C3C';
                break;
            case 'starbee':
                bodyColor = '#FFD700';
                wingColor = '#FF6B6B';
                break;
        }

        // Draw player body
        ctx.fillStyle = bodyColor;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Wings
        ctx.fillStyle = wingColor;
        ctx.fillRect(this.x - 5, this.y + 10, 5, 10);
        ctx.fillRect(this.x + this.width, this.y + 10, 5, 10);

        // Cockpit
        ctx.fillStyle = '#FFE66D';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + 10, 6, 0, Math.PI * 2);
        ctx.fill();

        // Arms for bombs
        ctx.fillStyle = '#95E1D3';
        ctx.fillRect(this.x - 3, this.y + this.height - 5, 3, 8);
        ctx.fillRect(this.x + this.width, this.y + this.height - 5, 3, 8);

        // Dash glow effect
        if (this.isDashing) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
        }
    }

    takeDamage() {
        if (this.invulnerable) return false;

        if (this.hasBarrier) {
            this.barrierStrength -= 1;
            if (this.barrierStrength <= 0) {
                this.hasBarrier = false;
            }
            return false;
        }

        this.lives--;
        this.invulnerable = true;
        this.invulnerableTimer = 120;
        this.speedLevel = 0;
        this.speed = CONFIG.PLAYER_SPEED;
        this.hasTwinCannon = false;
        return true;
    }

    powerUp(color) {
        switch(color) {
            case 'white':
                this.hasTwinCannon = true;
                break;
            case 'blue':
                this.speedLevel = Math.min(this.speedLevel + 1, 8);
                this.speed = CONFIG.PLAYER_SPEED + this.speedLevel * 0.5;
                break;
            case 'red':
                if (!this.hasBarrier) {
                    this.hasBarrier = true;
                    this.barrierStrength = 10;
                }
                break;
        }

        // Check for combo effects
        this.checkCombos();
    }

    checkCombos() {
        // Twin Cannon + Speed = Faster bullets
        if (this.hasTwinCannon && this.speedLevel > 0) {
            this.hasFastBullets = true;
        }

        // Twin Cannon + Barrier = Barrier shoots bullets
        if (this.hasTwinCannon && this.hasBarrier) {
            this.hasBarrierShots = true;
        }

        // Speed + Barrier = Extended invulnerability
        if (this.speedLevel > 0 && this.hasBarrier) {
            this.hasExtendedInvuln = true;
        }

        // All three = Rainbow mode (all effects active)
        if (this.hasTwinCannon && this.speedLevel > 0 && this.hasBarrier) {
            this.hasRainbowMode = true;
        }
    }

    getActiveCombos() {
        const combos = [];
        if (this.hasFastBullets) combos.push('高速弾');
        if (this.hasBarrierShots) combos.push('バリア弾');
        if (this.hasExtendedInvuln) combos.push('延長無敵');
        if (this.hasRainbowMode) combos.push('🌈 RAINBOW');
        return combos;
    }
}

// ===============================
// Bullet Class
// ===============================
class Bullet extends GameObject {
    constructor(x, y, isTwin = false) {
        super(x, y, 4, 12);
        this.speed = CONFIG.BULLET_SPEED;
        this.isTwin = isTwin;
        this.vx = 0;
        this.vy = -this.speed;
    }

    update() {
        if (this.vx !== 0 || this.vy !== -this.speed) {
            // Custom velocity (barrier shots)
            this.x += this.vx;
            this.y += this.vy;
        } else {
            // Normal upward movement
            this.y -= this.speed;
        }

        if (this.y < -this.height || this.x < -10 || this.x > 410) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.fillStyle = '#FFE66D';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = '#FF6B6B';
        ctx.fillRect(this.x + 1, this.y, this.width - 2, this.height - 4);
    }
}

// ===============================
// Bomb Class
// ===============================
class Bomb extends GameObject {
    constructor(x, y) {
        super(x, y, 8, 8);
        this.speed = CONFIG.BOMB_SPEED;
        this.vx = 0;
        this.vy = CONFIG.BOMB_SPEED;
    }

    update() {
        this.y += this.vy;
        this.x += this.vx;
        if (this.y > 600) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.fillStyle = '#2C3E50';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#E74C3C';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + 2, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ===============================
// Enemy Class
// ===============================
class Enemy extends GameObject {
    constructor(x, y, type = 'basic') {
        super(x, y, 25, 25);
        this.type = type;
        this.speed = 2;
        this.health = 1;
        this.points = 100;
        this.movePattern = 0;
        this.moveTimer = 0;

        if (type === 'strong') {
            this.health = 2;
            this.points = 200;
        } else if (type === 'fast') {
            this.speed = 3;
            this.points = 150;
        }
    }

    update() {
        this.moveTimer++;

        switch(this.movePattern) {
            case 0: // Straight down
                this.y += this.speed;
                break;
            case 1: // Zigzag
                this.y += this.speed;
                this.x += Math.sin(this.moveTimer * 0.1) * 2;
                break;
            case 2: // Curved
                this.y += this.speed;
                this.x += Math.cos(this.moveTimer * 0.05) * 1.5;
                break;
        }

        if (this.y > 650) {
            this.active = false;
        }
    }

    draw(ctx) {
        // Enemy color based on type
        let color = '#E74C3C';
        if (this.type === 'strong') color = '#9B59B6';
        if (this.type === 'fast') color = '#3498DB';

        ctx.fillStyle = color;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Details
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(this.x + 5, this.y + 5, 15, 15);

        // Eyes
        ctx.fillStyle = '#FFF';
        ctx.fillRect(this.x + 6, this.y + 8, 5, 5);
        ctx.fillRect(this.x + 14, this.y + 8, 5, 5);
    }

    takeDamage() {
        this.health--;
        return this.health <= 0;
    }
}

// ===============================
// Ground Enemy Class
// ===============================
class GroundEnemy extends GameObject {
    constructor(x, y) {
        super(x, y, 30, 30);
        this.health = 1;
        this.points = 50;
        this.isGround = true;
    }

    update() {
        // Ground enemies don't move
    }

    draw(ctx) {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.x, this.y, this.width, this.height);

        ctx.fillStyle = '#A0522D';
        ctx.fillRect(this.x + 5, this.y + 5, 20, 20);

        // Turret
        ctx.fillStyle = '#654321';
        ctx.fillRect(this.x + 12, this.y - 5, 6, 10);
    }

    takeDamage() {
        this.health--;
        return this.health <= 0;
    }
}

// ===============================
// Cloud Class
// ===============================
class Cloud extends GameObject {
    constructor(x, y) {
        super(x, y, 40, 25);
        this.hasBell = Math.random() < 0.3;
        this.hit = false;
    }

    update() {
        this.y += 1;
        if (this.y > 650) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (this.hit) return;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(this.x + 10, this.y + 12, 10, 0, Math.PI * 2);
        ctx.arc(this.x + 20, this.y + 8, 12, 0, Math.PI * 2);
        ctx.arc(this.x + 30, this.y + 12, 10, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ===============================
// Bell Class (Power-up)
// ===============================
class Bell extends GameObject {
    constructor(x, y) {
        super(x, y, 20, 20);
        this.colorIndex = 0;
        this.shotsReceived = 0;
        this.vx = 2;
        this.vy = -3;
        this.gravity = 0.15;
    }

    update() {
        this.x += this.vx;
        this.vy += this.gravity;
        this.y += this.vy;

        // Bounce off sides
        if (this.x <= 0 || this.x >= 380) {
            this.vx = -this.vx;
        }

        // Remove if falls off screen
        if (this.y > 650) {
            this.active = false;
        }
    }

    draw(ctx) {
        const color = CONFIG.BELL_COLORS[this.colorIndex];

        // Bell shape
        ctx.fillStyle = this.getColor(color);
        ctx.beginPath();
        ctx.arc(this.x + 10, this.y + 10, 10, 0, Math.PI * 2);
        ctx.fill();

        // Bell bottom
        ctx.fillStyle = this.getColor(color);
        ctx.fillRect(this.x + 5, this.y + 15, 10, 5);

        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(this.x + 7, this.y + 7, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    getColor(colorName) {
        const colors = {
            yellow: '#FFD700',
            white: '#FFFFFF',
            blue: '#4169E1',
            red: '#DC143C'
        };
        return colors[colorName] || '#FFD700';
    }

    hit() {
        this.shotsReceived++;
        if (this.shotsReceived >= CONFIG.BELL_SHOTS_TO_CHANGE) {
            this.shotsReceived = 0;
            this.colorIndex = (this.colorIndex + 1) % CONFIG.BELL_COLORS.length;
        }
    }

    getColorName() {
        return CONFIG.BELL_COLORS[this.colorIndex];
    }
}

// ===============================
// Item Class (Fruits, Stars)
// ===============================
class Item extends GameObject {
    constructor(x, y, type = 'fruit') {
        super(x, y, 15, 15);
        this.type = type;
        this.points = type === 'fruit' ? 100 : 500;
        this.vy = 1;
    }

    update() {
        this.y += this.vy;
        if (this.y > 650) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (this.type === 'fruit') {
            ctx.fillStyle = '#FF6B6B';
            ctx.beginPath();
            ctx.arc(this.x + 7.5, this.y + 7.5, 7, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#4ECDC4';
            ctx.fillRect(this.x + 6, this.y - 2, 3, 5);
        } else if (this.type === 'star') {
            ctx.fillStyle = '#FFD700';
            this.drawStar(ctx, this.x + 7.5, this.y + 7.5, 5, 7, 3);
        }
    }

    drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
        let rot = Math.PI / 2 * 3;
        let x = cx;
        let y = cy;
        const step = Math.PI / spikes;

        ctx.beginPath();
        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
        ctx.fill();
    }
}

// ===============================
// Particle Effect Class
// ===============================
class Particle extends GameObject {
    constructor(x, y, color) {
        super(x, y, 3, 3);
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
        this.color = color;
        this.life = 30;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life / 30;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.globalAlpha = 1;
    }
}

// ===============================
// Super Attack Effect Class
// ===============================
class SuperAttackEffect {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = 500;
        this.speed = 20;
        this.active = true;
        this.alpha = 1;
    }

    update() {
        this.radius += this.speed;
        this.alpha = 1 - (this.radius / this.maxRadius);

        if (this.radius >= this.maxRadius) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;

        // Outer ring
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner glow
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        gradient.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// ===============================
// Game Manager Class
// ===============================
class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();

        this.player = null;
        this.bullets = [];
        this.bombs = [];
        this.enemies = [];
        this.groundEnemies = [];
        this.clouds = [];
        this.bells = [];
        this.items = [];
        this.particles = [];

        this.score = 0;
        this.stage = 1;
        this.gameRunning = false;
        this.frameCount = 0;
        this.scrollOffset = 0;

        this.input = {
            left: false,
            right: false,
            up: false,
            down: false,
            shoot: false,
            bomb: false,
            shootPressed: false,
            bombPressed: false,
            super: false,
            superPressed: false,
            dash: false,
            dashPressed: false
        };

        this.selectedShip = 'twinbee';
        this.superAttackEffects = [];

        this.setupEventListeners();
        this.showTitleScreen();
    }

    setupCanvas() {
        this.canvas.width = CONFIG.CANVAS_WIDTH;
        this.canvas.height = CONFIG.CANVAS_HEIGHT;
    }

    setupEventListeners() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });

        document.addEventListener('keyup', (e) => {
            this.handleKeyUp(e);
        });

        // Mobile controls
        const dpadButtons = document.querySelectorAll('.dpad-btn');
        dpadButtons.forEach(btn => {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const direction = btn.dataset.direction;
                this.input[direction] = true;
            });

            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                const direction = btn.dataset.direction;
                this.input[direction] = false;
            });
        });

        const shotButton = document.getElementById('shot-button');
        shotButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.input.shoot = true;
        });
        shotButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.input.shoot = false;
        });

        const bombButton = document.getElementById('bomb-button');
        bombButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.input.bomb = true;
        });
        bombButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.input.bomb = false;
        });

        const dashButton = document.getElementById('dash-button');
        dashButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.input.dash = true;
        });
        dashButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.input.dash = false;
        });

        const superButton = document.getElementById('super-button');
        superButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.input.super = true;
        });
        superButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.input.super = false;
        });

        // Start button - show ship selection
        document.getElementById('start-button').addEventListener('click', () => {
            this.showShipSelectScreen();
        });

        // Ship selection
        const shipCards = document.querySelectorAll('.ship-card');
        shipCards.forEach(card => {
            card.addEventListener('click', () => {
                // Remove previous selection
                shipCards.forEach(c => c.classList.remove('selected'));
                // Select this ship
                card.classList.add('selected');
                this.selectedShip = card.dataset.ship;

                // Start game after a short delay
                setTimeout(() => {
                    this.startGame();
                }, 300);
            });
        });

        // Back button
        document.getElementById('back-button').addEventListener('click', () => {
            this.showTitleScreen();
        });

        // Restart button
        document.getElementById('restart-button').addEventListener('click', () => {
            this.showShipSelectScreen();
        });
    }

    handleKeyDown(e) {
        switch(e.key) {
            case 'ArrowLeft':
                this.input.left = true;
                e.preventDefault();
                break;
            case 'ArrowRight':
                this.input.right = true;
                e.preventDefault();
                break;
            case 'ArrowUp':
                this.input.up = true;
                e.preventDefault();
                break;
            case 'ArrowDown':
                this.input.down = true;
                e.preventDefault();
                break;
            case 'z':
            case 'Z':
                this.input.shoot = true;
                break;
            case 'x':
            case 'X':
                this.input.bomb = true;
                break;
            case ' ':
                this.input.super = true;
                e.preventDefault();
                break;
            case 'Shift':
                this.input.dash = true;
                e.preventDefault();
                break;
        }
    }

    handleKeyUp(e) {
        switch(e.key) {
            case 'ArrowLeft':
                this.input.left = false;
                break;
            case 'ArrowRight':
                this.input.right = false;
                break;
            case 'ArrowUp':
                this.input.up = false;
                break;
            case 'ArrowDown':
                this.input.down = false;
                break;
            case 'z':
            case 'Z':
                this.input.shoot = false;
                this.input.shootPressed = false;
                break;
            case 'x':
            case 'X':
                this.input.bomb = false;
                this.input.bombPressed = false;
                break;
            case ' ':
                this.input.super = false;
                this.input.superPressed = false;
                break;
            case 'Shift':
                this.input.dash = false;
                this.input.dashPressed = false;
                break;
        }
    }

    showTitleScreen() {
        document.getElementById('title-screen').style.display = 'block';
        document.getElementById('ship-select-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'none';
        document.getElementById('game-over-screen').style.display = 'none';
    }

    showShipSelectScreen() {
        document.getElementById('title-screen').style.display = 'none';
        document.getElementById('ship-select-screen').style.display = 'block';
        document.getElementById('game-screen').style.display = 'none';
        document.getElementById('game-over-screen').style.display = 'none';
    }

    showGameScreen() {
        document.getElementById('title-screen').style.display = 'none';
        document.getElementById('ship-select-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'block';
        document.getElementById('game-over-screen').style.display = 'none';
    }

    showGameOverScreen() {
        document.getElementById('title-screen').style.display = 'none';
        document.getElementById('ship-select-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'none';
        document.getElementById('game-over-screen').style.display = 'block';
        document.getElementById('final-score').textContent = this.score;
    }

    startGame() {
        this.showGameScreen();
        this.resetGame();
        this.gameRunning = true;
        this.gameLoop();
    }

    resetGame() {
        this.player = new Player(185, 500, this.selectedShip);
        this.bullets = [];
        this.bombs = [];
        this.enemies = [];
        this.groundEnemies = [];
        this.clouds = [];
        this.bells = [];
        this.items = [];
        this.particles = [];
        this.superAttackEffects = [];
        this.score = 0;
        this.stage = 1;
        this.frameCount = 0;
        this.scrollOffset = 0;
        this.updateUI();
    }

    updateUI() {
        document.querySelector('#score span').textContent = this.score;
        document.querySelector('#lives span').textContent = this.player.lives;
        document.querySelector('#stage span').textContent = this.stage;
    }

    gameLoop() {
        if (!this.gameRunning) return;

        this.update();
        this.draw();
        this.frameCount++;

        requestAnimationFrame(() => this.gameLoop());
    }

    update() {
        // Update player
        this.player.update(this.input, this.canvas.width, this.canvas.height);

        // Handle shooting
        if (this.input.shoot && !this.input.shootPressed) {
            this.input.shootPressed = true;
            this.shoot();
        }

        // Handle bombing
        if (this.input.bomb && !this.input.bombPressed) {
            this.input.bombPressed = true;
            this.dropBomb();
        }

        // Handle super attack
        if (this.input.super && !this.input.superPressed) {
            this.input.superPressed = true;
            this.useSuperAttack();
        }

        // Handle dash
        if (this.input.dash && !this.input.dashPressed) {
            this.input.dashPressed = true;
            const dirX = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
            const dirY = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);
            this.player.dash(dirX || 0, dirY || 1); // Default to down if no direction
        }

        // Update super attack effects
        this.superAttackEffects = this.superAttackEffects.filter(effect => {
            effect.update();
            return effect.active;
        });

        // Spawn enemies
        if (this.frameCount % CONFIG.ENEMY_SPAWN_RATE === 0) {
            this.spawnEnemy();
        }

        // Spawn ground enemies
        if (this.frameCount % (CONFIG.ENEMY_SPAWN_RATE * 3) === 0) {
            this.spawnGroundEnemy();
        }

        // Spawn clouds
        if (this.frameCount % CONFIG.CLOUD_SPAWN_RATE === 0) {
            this.spawnCloud();
        }

        // Update all game objects
        this.updateObjects(this.bullets);
        this.updateObjects(this.bombs);
        this.updateObjects(this.enemies);
        this.updateObjects(this.groundEnemies);
        this.updateObjects(this.clouds);
        this.updateObjects(this.bells);
        this.updateObjects(this.items);
        this.updateObjects(this.particles);

        // Check collisions
        this.checkCollisions();

        // Remove inactive objects
        this.cleanupObjects();

        // Check game over
        if (this.player.lives <= 0) {
            this.gameOver();
        }

        // Update scroll offset
        this.scrollOffset += 1;
    }

    updateObjects(array) {
        array.forEach(obj => {
            if (obj.active) {
                obj.update();
            }
        });
    }

    cleanupObjects() {
        this.bullets = this.bullets.filter(b => b.active);
        this.bombs = this.bombs.filter(b => b.active);
        this.enemies = this.enemies.filter(e => e.active);
        this.groundEnemies = this.groundEnemies.filter(e => e.active);
        this.clouds = this.clouds.filter(c => c.active);
        this.bells = this.bells.filter(b => b.active);
        this.items = this.items.filter(i => i.active);
        this.particles = this.particles.filter(p => p.active);
    }

    shoot() {
        const bulletSpeed = this.player.hasFastBullets ? CONFIG.BULLET_SPEED * 1.5 : CONFIG.BULLET_SPEED;

        if (this.player.hasTwinCannon) {
            const b1 = new Bullet(this.player.x + 5, this.player.y);
            const b2 = new Bullet(this.player.x + this.player.width - 9, this.player.y);
            b1.speed = bulletSpeed;
            b2.speed = bulletSpeed;
            this.bullets.push(b1, b2);
        } else {
            const b = new Bullet(this.player.x + this.player.width / 2 - 2, this.player.y);
            b.speed = bulletSpeed;
            this.bullets.push(b);
        }

        // Barrier shots - shoot from barrier edges
        if (this.player.hasBarrierShots && this.frameCount % 10 === 0) {
            const barrierSize = 15 + this.player.barrierStrength * 2;
            const centerX = this.player.x + this.player.width / 2;
            const centerY = this.player.y + this.player.height / 2;

            // Shoot in 4 directions from barrier
            for (let i = 0; i < 4; i++) {
                const angle = (Math.PI / 2) * i;
                const bx = centerX + Math.cos(angle) * barrierSize - 2;
                const by = centerY + Math.sin(angle) * barrierSize - 6;
                const bullet = new Bullet(bx, by);
                bullet.speed = CONFIG.BULLET_SPEED * 0.8;
                bullet.vx = Math.cos(angle) * 3;
                bullet.vy = Math.sin(angle) * 3 - 5; // Always go mostly up
                this.bullets.push(bullet);
            }
        }
    }

    dropBomb() {
        this.bombs.push(new Bomb(this.player.x + this.player.width / 2 - 4, this.player.y + this.player.height));
    }

    spawnEnemy() {
        const x = getRandomInt(20, this.canvas.width - 40);
        const types = ['basic', 'strong', 'fast'];
        const type = types[getRandomInt(0, types.length - 1)];
        const enemy = new Enemy(x, -30, type);
        enemy.movePattern = getRandomInt(0, 2);
        this.enemies.push(enemy);
    }

    spawnGroundEnemy() {
        const x = getRandomInt(20, this.canvas.width - 50);
        const y = this.canvas.height - 50;
        this.groundEnemies.push(new GroundEnemy(x, y));
    }

    spawnCloud() {
        const x = getRandomInt(20, this.canvas.width - 60);
        this.clouds.push(new Cloud(x, -30));
    }

    useSuperAttack() {
        if (!this.player.useSuperAttack()) return;

        // Create visual effect
        this.superAttackEffects.push(new SuperAttackEffect(
            this.player.x + this.player.width / 2,
            this.player.y + this.player.height / 2
        ));

        // Destroy all enemies
        let enemiesDestroyed = 0;
        this.enemies.forEach(enemy => {
            if (enemy.active) {
                enemy.active = false;
                this.score += enemy.points * 2; // Double points for super attack
                this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#FFD700');
                enemiesDestroyed++;
            }
        });

        this.groundEnemies.forEach(enemy => {
            if (enemy.active) {
                enemy.active = false;
                this.score += enemy.points * 2;
                this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#FFD700');
                enemiesDestroyed++;
            }
        });

        this.updateUI();
    }

    checkCollisions() {
        // Bullets vs Enemies
        this.bullets.forEach(bullet => {
            this.enemies.forEach(enemy => {
                if (bullet.active && enemy.active && checkCollision(bullet, enemy)) {
                    bullet.active = false;
                    if (enemy.takeDamage()) {
                        enemy.active = false;
                        this.score += enemy.points;
                        this.player.addSuperGauge(CONFIG.SUPER_GAUGE_GAIN_PER_KILL);
                        this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#E74C3C');
                        this.updateUI();
                    }
                }
            });

            // Bullets vs Clouds
            this.clouds.forEach(cloud => {
                if (bullet.active && cloud.active && !cloud.hit && checkCollision(bullet, cloud)) {
                    bullet.active = false;
                    cloud.hit = true;
                    if (cloud.hasBell) {
                        this.bells.push(new Bell(cloud.x + 10, cloud.y + 10));
                    }
                }
            });

            // Bullets vs Bells
            this.bells.forEach(bell => {
                if (bullet.active && bell.active && checkCollision(bullet, bell)) {
                    bullet.active = false;
                    bell.hit();
                }
            });
        });

        // Bombs vs Ground Enemies
        this.bombs.forEach(bomb => {
            this.groundEnemies.forEach(groundEnemy => {
                if (bomb.active && groundEnemy.active && checkCollision(bomb, groundEnemy)) {
                    bomb.active = false;
                    if (groundEnemy.takeDamage()) {
                        groundEnemy.active = false;
                        this.score += groundEnemy.points;
                        this.player.addSuperGauge(CONFIG.SUPER_GAUGE_GAIN_PER_KILL);

                        // Drop items
                        if (Math.random() < 0.3) {
                            const itemType = Math.random() < 0.8 ? 'fruit' : 'star';
                            this.items.push(new Item(groundEnemy.x, groundEnemy.y, itemType));
                        }

                        this.createExplosion(groundEnemy.x + groundEnemy.width / 2, groundEnemy.y + groundEnemy.height / 2, '#8B4513');
                        this.updateUI();
                    }
                }
            });
        });

        // Player vs Enemies
        this.enemies.forEach(enemy => {
            if (enemy.active && checkCollision(this.player, enemy)) {
                enemy.active = false;
                if (this.player.takeDamage()) {
                    this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#FF6B6B');
                }
                this.updateUI();
            }
        });

        // Player vs Bells
        this.bells.forEach(bell => {
            if (bell.active && checkCollision(this.player, bell)) {
                bell.active = false;
                const colorName = bell.getColorName();

                if (colorName === 'yellow') {
                    this.score += 500;
                } else {
                    this.player.powerUp(colorName);
                }

                this.updateUI();
            }
        });

        // Player vs Items
        this.items.forEach(item => {
            if (item.active && checkCollision(this.player, item)) {
                item.active = false;
                this.score += item.points;

                if (item.type === 'star') {
                    // Clear all enemies on screen
                    this.enemies.forEach(e => {
                        e.active = false;
                        this.score += e.points;
                    });
                }

                this.updateUI();
            }
        });
    }

    createExplosion(x, y, color) {
        for (let i = 0; i < 10; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background
        this.drawBackground();

        // Draw all game objects
        this.groundEnemies.forEach(e => e.active && e.draw(this.ctx));
        this.clouds.forEach(c => c.active && c.draw(this.ctx));
        this.items.forEach(i => i.active && i.draw(this.ctx));
        this.bells.forEach(b => b.active && b.draw(this.ctx));
        this.enemies.forEach(e => e.active && e.draw(this.ctx));
        this.bullets.forEach(b => b.active && b.draw(this.ctx));
        this.bombs.forEach(b => b.active && b.draw(this.ctx));
        this.particles.forEach(p => p.active && p.draw(this.ctx));
        this.player.draw(this.ctx);

        // Draw super attack effects
        this.superAttackEffects.forEach(effect => effect.active && effect.draw(this.ctx));

        // Draw super gauge
        this.drawSuperGauge();

        // Draw dash cooldown indicator
        if (this.player.dashCooldownTimer > 0) {
            this.drawDashCooldown();
        }

        // Draw combo effects
        this.drawCombos();
    }

    drawCombos() {
        const combos = this.player.getActiveCombos();
        if (combos.length === 0) return;

        const startY = 20;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(5, startY, 120, combos.length * 20 + 10);

        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'left';

        combos.forEach((combo, i) => {
            const gradient = this.ctx.createLinearGradient(10, startY + 15 + i * 20, 100, startY + 15 + i * 20);
            if (combo.includes('RAINBOW')) {
                gradient.addColorStop(0, '#FF6B6B');
                gradient.addColorStop(0.33, '#FFD700');
                gradient.addColorStop(0.66, '#4ECDC4');
                gradient.addColorStop(1, '#9B59B6');
            } else {
                gradient.addColorStop(0, '#FFD700');
                gradient.addColorStop(1, '#FF6B6B');
            }
            this.ctx.fillStyle = gradient;
            this.ctx.fillText(combo, 10, startY + 15 + i * 20);
        });
    }

    drawSuperGauge() {
        const barWidth = 200;
        const barHeight = 15;
        const barX = (this.canvas.width - barWidth) / 2;
        const barY = this.canvas.height - 30;

        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);

        // Gauge fill
        const fillWidth = (this.player.superGauge / CONFIG.SUPER_GAUGE_MAX) * barWidth;
        const gradient = this.ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
        gradient.addColorStop(0, '#FFD700');
        gradient.addColorStop(1, '#FF6B6B');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(barX, barY, fillWidth, barHeight);

        // Border
        this.ctx.strokeStyle = this.player.canUseSuperAttack() ? '#FFD700' : '#FFFFFF';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);

        // Label
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SUPER ATTACK', barX + barWidth / 2, barY - 5);

        // Ready indicator
        if (this.player.canUseSuperAttack()) {
            this.ctx.fillStyle = '#FFD700';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('READY!', barX + barWidth / 2, barY + barHeight + 12);
        }
    }

    drawDashCooldown() {
        const radius = 15;
        const x = this.canvas.width - 30;
        const y = this.canvas.height - 60;

        // Background circle
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Cooldown arc
        const progress = 1 - (this.player.dashCooldownTimer / CONFIG.DASH_COOLDOWN);
        this.ctx.strokeStyle = progress >= 1 ? '#4ECDC4' : '#666';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius - 2, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress));
        this.ctx.stroke();

        // Icon
        this.ctx.fillStyle = progress >= 1 ? '#4ECDC4' : '#999';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('⚡', x, y);
    }

    drawBackground() {
        // Scrolling background effect
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#87CEEB');
        gradient.addColorStop(1, '#98D8E8');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Simple clouds in background
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        const cloudY = (this.scrollOffset % 200) - 100;
        for (let i = 0; i < 5; i++) {
            const y = cloudY + i * 150;
            this.ctx.beginPath();
            this.ctx.arc(50 + i * 80, y, 20, 0, Math.PI * 2);
            this.ctx.arc(70 + i * 80, y - 5, 25, 0, Math.PI * 2);
            this.ctx.arc(90 + i * 80, y, 20, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    gameOver() {
        this.gameRunning = false;
        this.showGameOverScreen();
    }
}

// ===============================
// Initialize Game
// ===============================
let game;
window.addEventListener('load', () => {
    game = new Game();
});
