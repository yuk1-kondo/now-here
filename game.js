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
    DASH_COOLDOWN: 60,
    COMBO_TIMEOUT: 120, // Frames before combo resets (2 seconds at 60fps)
    BARRIER_SHOT_INTERVAL: 10,
    INVULNERABILITY_DURATION: 120,
    BARRIER_INITIAL_STRENGTH: 10,
    PARTICLE_COUNT: 10,
    PARTICLE_LIFETIME: 30,
    PARTICLE_MAX_VELOCITY: 4,
    // Bell physics
    BELL_GRAVITY: 0.15,
    BELL_HORIZONTAL_SPEED: 2,
    BELL_VERTICAL_SPEED: -3,
    // Spawn margins
    ENEMY_SPAWN_MARGIN_X: 20,
    CLOUD_SPAWN_MARGIN_X: 20,
    GROUND_ENEMY_Y_OFFSET: 50,
    // FPS limiting
    TARGET_FPS: 60,
    FRAME_TIME: 1000 / 60,  // ~16.67ms per frame
    // 1UP system
    ONEUP_SCORE_INTERVAL: 20000,  // Extra life every 20,000 points
    // Spatial hash grid
    GRID_CELL_SIZE: 50
};

// ===============================
// Utility Functions
// ===============================

// LocalStorage helper with unified error handling
const StorageHelper = {
    load(key, defaultValue = null, notifyUser = false) {
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                return JSON.parse(saved);
            }
            return defaultValue;
        } catch (error) {
            console.warn(`Failed to load "${key}" from LocalStorage:`, error);
            if (notifyUser && error.name === 'QuotaExceededError') {
                alert('ストレージ容量が不足しています。ブラウザのキャッシュをクリアしてください。');
            }
            return defaultValue;
        }
    },

    save(key, value, notifyUser = false) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn(`Failed to save "${key}" to LocalStorage:`, error);
            if (notifyUser && error.name === 'QuotaExceededError') {
                alert('ストレージ容量が不足しています。一部のデータが保存されませんでした。');
            }
            return false;
        }
    }
};

// Input validation helpers
const Validator = {
    isValidShipType(ship) {
        return ['twinbee', 'winbee', 'gwinbee', 'starbee'].includes(ship);
    },

    isValidDifficulty(difficulty) {
        return ['easy', 'normal', 'hard'].includes(difficulty);
    },

    isValidEnemyType(type) {
        return ['basic', 'strong', 'fast'].includes(type);
    },

    isValidBellColor(colorIndex) {
        return Number.isInteger(colorIndex) && colorIndex >= 0 && colorIndex < CONFIG.BELL_COLORS.length;
    },

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
};

// Spatial Hash Grid for efficient collision detection
class SpatialHashGrid {
    constructor(cellSize = CONFIG.GRID_CELL_SIZE) {
        this.cellSize = cellSize;
        this.grid = new Map();
    }

    clear() {
        this.grid.clear();
    }

    getCellKey(x, y) {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        return `${cellX},${cellY}`;
    }

    insert(obj) {
        if (!obj || !obj.active) return;

        // Calculate the cells this object occupies
        const minX = Math.floor(obj.x / this.cellSize);
        const minY = Math.floor(obj.y / this.cellSize);
        const maxX = Math.floor((obj.x + (obj.width || 0)) / this.cellSize);
        const maxY = Math.floor((obj.y + (obj.height || 0)) / this.cellSize);

        // Insert object into all cells it occupies
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const key = `${x},${y}`;
                if (!this.grid.has(key)) {
                    this.grid.set(key, []);
                }
                this.grid.get(key).push(obj);
            }
        }
    }

    getNearbyObjects(obj) {
        if (!obj) return [];

        const nearby = new Set();
        const minX = Math.floor(obj.x / this.cellSize);
        const minY = Math.floor(obj.y / this.cellSize);
        const maxX = Math.floor((obj.x + (obj.width || 0)) / this.cellSize);
        const maxY = Math.floor((obj.y + (obj.height || 0)) / this.cellSize);

        // Get objects from nearby cells
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const key = `${x},${y}`;
                const objects = this.grid.get(key);
                if (objects) {
                    objects.forEach(o => nearby.add(o));
                }
            }
        }

        return Array.from(nearby);
    }
}

// Gradient cache to reduce object creation
class GradientCache {
    constructor(ctx) {
        this.ctx = ctx;
        this.cache = new Map();
    }

    getLinearGradient(key, x0, y0, x1, y1, colorStops) {
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const gradient = this.ctx.createLinearGradient(x0, y0, x1, y1);
        colorStops.forEach(([offset, color]) => {
            gradient.addColorStop(offset, color);
        });

        this.cache.set(key, gradient);
        return gradient;
    }

    clear() {
        this.cache.clear();
    }
}

// ===============================
// Sound Manager (Web Audio API)
// ===============================
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
        this.sfxVolume = 0.3;
        this.bgmVolume = 0.2;
        this.currentBGM = null;
        this.initAudioContext();
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
            this.enabled = false;
        }
    }

    // Resume audio context (required for mobile browsers)
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    // Play shooting sound
    playShoot() {
        if (!this.enabled) return;
        this.resume();

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.05);

        gain.gain.setValueAtTime(this.sfxVolume, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.start();
        osc.stop(this.audioContext.currentTime + 0.05);
    }

    // Play explosion sound
    playExplosion() {
        if (!this.enabled) return;
        this.resume();

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.2);

        gain.gain.setValueAtTime(this.sfxVolume * 0.8, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.start();
        osc.stop(this.audioContext.currentTime + 0.2);
    }

    // Play bell sound
    playBell(colorIndex) {
        if (!this.enabled) return;
        this.resume();

        const frequencies = [523, 659, 784, 1047]; // C5, E5, G5, C6
        const freq = frequencies[colorIndex % 4];

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);

        gain.gain.setValueAtTime(this.sfxVolume * 0.5, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.start();
        osc.stop(this.audioContext.currentTime + 0.3);
    }

    // Play power-up sound
    playPowerUp() {
        if (!this.enabled) return;
        this.resume();

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.1);
        osc.frequency.exponentialRampToValueAtTime(1200, this.audioContext.currentTime + 0.2);

        gain.gain.setValueAtTime(this.sfxVolume * 0.6, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.start();
        osc.stop(this.audioContext.currentTime + 0.2);
    }

    // Play damage sound
    playDamage() {
        if (!this.enabled) return;
        this.resume();

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.3);

        gain.gain.setValueAtTime(this.sfxVolume, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.start();
        osc.stop(this.audioContext.currentTime + 0.3);
    }

    // Play boss warning sound
    playBossWarning() {
        if (!this.enabled) return;
        this.resume();

        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();

                osc.type = 'square';
                osc.frequency.setValueAtTime(440, this.audioContext.currentTime);

                gain.gain.setValueAtTime(this.sfxVolume * 0.7, this.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

                osc.connect(gain);
                gain.connect(this.audioContext.destination);

                osc.start();
                osc.stop(this.audioContext.currentTime + 0.15);
            }, i * 200);
        }
    }

    // Start normal BGM
    startNormalBGM() {
        if (!this.enabled || this.currentBGM === 'normal') return;
        this.stopBGM();
        this.currentBGM = 'normal';
        this.resume();
        this.playBGMLoop([523, 587, 659, 523], 0.4); // C-D-E-C pattern
    }

    // Start boss BGM
    startBossBGM() {
        if (!this.enabled || this.currentBGM === 'boss') return;
        this.stopBGM();
        this.currentBGM = 'boss';
        this.resume();
        this.playBGMLoop([392, 440, 494, 440], 0.3); // G-A-B-A pattern (faster)
    }

    // Helper to create simple BGM loop
    playBGMLoop(notes, duration) {
        if (!this.enabled) return;

        let noteIndex = 0;
        const playNote = () => {
            if (!this.enabled || !this.currentBGM) return;

            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(notes[noteIndex], this.audioContext.currentTime);

            gain.gain.setValueAtTime(this.bgmVolume, this.audioContext.currentTime);
            gain.gain.setValueAtTime(this.bgmVolume * 0.8, this.audioContext.currentTime + duration * 0.9);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.audioContext.destination);

            osc.start();
            osc.stop(this.audioContext.currentTime + duration);

            noteIndex = (noteIndex + 1) % notes.length;

            setTimeout(playNote, duration * 1000);
        };

        playNote();
    }

    // Stop BGM
    stopBGM() {
        this.currentBGM = null;
    }

    // Set volumes
    setSFXVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
    }

    setBGMVolume(volume) {
        this.bgmVolume = Math.max(0, Math.min(1, volume));
    }

    // Toggle sound on/off
    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.stopBGM();
        }
    }
}

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

        // Rainbow mode visual effect - colorful aura
        if (this.hasRainbowMode) {
            const time = Date.now() / 100;
            const colors = ['#FF6B6B', '#FFD700', '#4ECDC4', '#9B59B6'];
            const colorIndex = Math.floor(time) % colors.length;
            ctx.strokeStyle = colors[colorIndex];
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.6;
            ctx.strokeRect(this.x - 4, this.y - 4, this.width + 8, this.height + 8);
            ctx.globalAlpha = 1;
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
        // Extended invulnerability combo effect
        const invulnDuration = this.hasExtendedInvuln
            ? CONFIG.INVULNERABILITY_DURATION * 1.5
            : CONFIG.INVULNERABILITY_DURATION;
        this.invulnerableTimer = invulnDuration;
        this.resetPowerUps();
        return true;
    }

    resetPowerUps() {
        this.speedLevel = 0;
        this.speed = CONFIG.PLAYER_SPEED;
        this.applyShipStats(); // Reapply ship-specific speed
        this.hasTwinCannon = false;
        this.hasBarrier = false;
        this.barrierStrength = 0;

        // Reset combo flags
        this.hasFastBullets = false;
        this.hasBarrierShots = false;
        this.hasExtendedInvuln = false;
        this.hasRainbowMode = false;
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
                    this.barrierStrength = CONFIG.BARRIER_INITIAL_STRENGTH;
                }
                break;
        }

        // Check for combo effects
        this.checkCombos();
    }

    checkCombos() {
        // Power-up combo system: combining different power-ups creates special effects

        // Twin Cannon + Speed = Faster bullets (1.5x bullet speed)
        if (this.hasTwinCannon && this.speedLevel > 0) {
            this.hasFastBullets = true;
        }

        // Twin Cannon + Barrier = Barrier shoots bullets (4-directional auto-fire)
        if (this.hasTwinCannon && this.hasBarrier) {
            this.hasBarrierShots = true;
        }

        // Speed + Barrier = Extended invulnerability (1.5x invuln duration when hit)
        if (this.speedLevel > 0 && this.hasBarrier) {
            this.hasExtendedInvuln = true;
        }

        // All three = Rainbow mode (ultimate power - all combo effects active)
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
    constructor(x, y, isTwin = false, damage = 1) {
        super(x, y, 4, 12);
        this.speed = CONFIG.BULLET_SPEED;
        this.isTwin = isTwin;
        this.damage = damage;
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
// Enemy Bullet Class
// ===============================
class EnemyBullet extends GameObject {
    constructor(x, y) {
        super(x, y, 6, 6);
        this.speed = 3;
        this.vy = this.speed;
    }

    update() {
        this.y += this.vy;
        if (this.y > 650) {
            this.active = false;
        }
    }

    draw(ctx) {
        // Draw enemy bullet (red)
        ctx.fillStyle = '#FF4444';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
        ctx.fill();

        // Inner glow
        ctx.fillStyle = '#FFAA00';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 3, 0, Math.PI * 2);
        ctx.fill();
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

        // Validate enemy type
        if (!Validator.isValidEnemyType(type)) {
            console.warn(`Invalid enemy type "${type}", defaulting to "basic"`);
            type = 'basic';
        }

        this.type = type;
        this.speed = 2;
        this.health = 1;
        this.points = 100;
        this.movePattern = 0;
        this.moveTimer = 0;
        this.shootTimer = Math.random() * 120 + 60;  // Random shoot interval
        this.shootCooldown = 180;  // 3 seconds between shots

        if (type === 'strong') {
            this.health = 2;
            this.points = 200;
            this.shootCooldown = 120;  // Strong enemies shoot more frequently
        } else if (type === 'fast') {
            this.speed = 3;
            this.points = 150;
            this.shootCooldown = 150;
        }
    }

    update() {
        this.moveTimer++;
        this.shootTimer--;

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

    shouldShoot() {
        if (this.shootTimer <= 0 && this.y > 50 && this.y < 500) {
            this.shootTimer = this.shootCooldown;
            return true;
        }
        return false;
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

    takeDamage(damage = 1) {
        this.health -= damage;
        return this.health <= 0;
    }
}

// ===============================
// Boss Class
// ===============================
class Boss extends Enemy {
    constructor(x, y, stage) {
        super(x, y, 'boss');
        this.width = 60;
        this.height = 60;
        this.health = 20 + stage * 10;  // Increases with stage
        this.maxHealth = this.health;
        this.points = 5000;
        this.speed = 1;
        this.shootCooldown = 60;  // Shoots every second
        this.movePattern = 3;  // Boss-specific movement
        this.moveDirection = 1;
    }

    update() {
        this.moveTimer++;
        this.shootTimer--;

        // Boss movement pattern - horizontal sweep
        this.x += this.speed * this.moveDirection;
        if (this.x <= 20 || this.x >= 320) {
            this.moveDirection *= -1;
        }

        // Keep boss at top of screen
        if (this.y < 50) {
            this.y += 0.5;
        }
    }

    draw(ctx) {
        // Boss body (larger)
        ctx.fillStyle = '#8B008B';  // Dark magenta
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Boss details
        ctx.fillStyle = '#9370DB';  // Medium purple
        ctx.fillRect(this.x + 10, this.y + 10, this.width - 20, this.height - 20);

        // Boss eyes (menacing)
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(this.x + 15, this.y + 20, 10, 10);
        ctx.fillRect(this.x + 35, this.y + 20, 10, 10);

        // Health bar
        const healthBarWidth = this.width;
        const healthBarHeight = 4;
        const healthPercentage = this.health / this.maxHealth;

        ctx.fillStyle = '#000';
        ctx.fillRect(this.x, this.y - 10, healthBarWidth, healthBarHeight);

        ctx.fillStyle = healthPercentage > 0.5 ? '#00FF00' : healthPercentage > 0.25 ? '#FFFF00' : '#FF0000';
        ctx.fillRect(this.x, this.y - 10, healthBarWidth * healthPercentage, healthBarHeight);
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

    takeDamage(damage = 1) {
        this.health -= damage;
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
        this.vx = CONFIG.BELL_HORIZONTAL_SPEED;
        this.vy = CONFIG.BELL_VERTICAL_SPEED;
        this.gravity = CONFIG.BELL_GRAVITY;
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
        this.vx = (Math.random() - 0.5) * CONFIG.PARTICLE_MAX_VELOCITY;
        this.vy = (Math.random() - 0.5) * CONFIG.PARTICLE_MAX_VELOCITY;
        this.color = color;
        // Pre-compute transparent color for performance
        this.transparentColor = this.convertToTransparent(color);
        this.life = CONFIG.PARTICLE_LIFETIME;
        this.maxLife = CONFIG.PARTICLE_LIFETIME;

        // Enhanced particle properties
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.3;
        this.size = Math.random() * 4 + 2; // Random size 2-6
        this.shape = Math.random() < 0.5 ? 'circle' : 'square'; // Random shape
        this.gravity = 0.1;
    }

    convertToTransparent(color) {
        // Convert rgb(r,g,b) or hex to rgba(r,g,b,0) format
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r},${g},${b},0)`;
        } else if (color.startsWith('rgb')) {
            return color.replace(')', ', 0)').replace('rgb', 'rgba');
        }
        return 'rgba(255,255,255,0)';
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity; // Add gravity effect
        this.rotation += this.rotationSpeed;
        this.life--;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;

        ctx.save();
        ctx.translate(this.x + this.size / 2, this.y + this.size / 2);
        ctx.rotate(this.rotation);

        if (this.shape === 'circle') {
            // Draw glowing circle with pre-computed gradient
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);
            gradient.addColorStop(0, this.color);
            gradient.addColorStop(1, this.transparentColor);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Draw rotating square
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        }

        ctx.restore();
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

        // Error handling for canvas initialization
        if (!this.ctx) {
            console.error('Failed to get 2D context from canvas');
            alert('このブラウザではゲームを実行できません。Canvas 2Dをサポートするブラウザをご利用ください。');
            throw new Error('Canvas 2D context initialization failed');
        }

        this.setupCanvas();

        // Initialize Sound Manager
        this.soundManager = new SoundManager();

        // Initialize Spatial Hash Grid for collision detection
        this.spatialGrid = new SpatialHashGrid();

        // Initialize Gradient Cache
        this.gradientCache = new GradientCache(this.ctx);

        this.player = null;
        this.bullets = [];
        this.enemyBullets = [];
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
        this.isPaused = false;
        this.frameCount = 0;
        this.scrollOffset = 0;
        this.lastFrameTime = 0;
        this.nextOneUpScore = CONFIG.ONEUP_SCORE_INTERVAL;
        this.bossActive = false;
        this.bossWarningShown = false;

        // Screen effects
        this.screenShake = 0;
        this.screenShakeIntensity = 0;
        this.slowMotion = false;
        this.slowMotionTimer = 0;

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
        this.selectedDifficulty = 'normal'; // easy, normal, hard
        this.superAttackEffects = [];

        // Event listener storage for cleanup
        this.eventListeners = [];

        // Achievement system
        this.achievements = this.loadAchievements();

        // Shop system
        this.shopItems = {
            maxLives: { name: '最大ライフ+1', cost: 50000, purchased: false },
            startSpeed: { name: '初期スピード', cost: 30000, purchased: false },
            startTwin: { name: '初期ツイン砲', cost: 40000, purchased: false },
            superGaugeBoost: { name: '必殺ゲージ+', cost: 35000, purchased: false },
            dashCooldown: { name: 'ダッシュ強化', cost: 25000, purchased: false },
            scoreMultiplier: { name: 'スコア倍率', cost: 60000, purchased: false }
        };
        this.loadShopItems();
        this.totalScore = this.loadTotalScore();

        // Stage select system
        this.clearedStages = this.loadClearedStages();
        this.startStage = 1;
        this.gameMode = 'normal'; // 'normal', 'stage-select', 'daily-challenge'
        this.dailyRandomSeed = 0; // Seeded random for daily challenge

        this.gameStats = {
            enemiesKilled: 0,
            bellsCollected: 0,
            superAttacksUsed: 0,
            dashesUsed: 0,
            maxCombo: 0,
            currentCombo: 0,
            comboTimer: 0
        };

        this.setupEventListeners();
        this.detectMobileDevice();
        this.showTitleScreen();
    }

    detectMobileDevice() {
        // Check if device is mobile/touch-enabled
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                        ('ontouchstart' in window) ||
                        (navigator.maxTouchPoints > 0);

        if (isMobile) {
            document.getElementById('mobile-controls').style.display = 'block';
        }
    }

    loadAchievements() {
        const defaultAchievements = {
            highScore: 0,
            firstKill: false,
            combo10: false,
            combo50: false,
            bellMaster: false,
            superUser: false,
            dashMaster: false,
            rainbowWarrior: false
        };
        return StorageHelper.load('twinbee_achievements', defaultAchievements);
    }

    saveAchievements() {
        StorageHelper.save('twinbee_achievements', this.achievements, true);
    }

    loadShopItems() {
        const saved = StorageHelper.load('twinbee_shop', null);
        if (saved) {
            Object.keys(saved).forEach(key => {
                if (this.shopItems[key]) {
                    this.shopItems[key].purchased = saved[key].purchased;
                }
            });
        }
    }

    saveShopItems() {
        StorageHelper.save('twinbee_shop', this.shopItems, true);
    }

    loadTotalScore() {
        const saved = StorageHelper.load('twinbee_totalScore', 0);
        return typeof saved === 'number' ? saved : 0;
    }

    saveTotalScore() {
        StorageHelper.save('twinbee_totalScore', this.totalScore, true);
    }

    loadClearedStages() {
        return StorageHelper.load('twinbee_clearedStages', [1]); // Stage 1 always available
    }

    saveClearedStages() {
        StorageHelper.save('twinbee_clearedStages', this.clearedStages, true);
    }

    checkAchievements() {
        let newAchievement = false;

        if (this.gameStats.enemiesKilled >= 1 && !this.achievements.firstKill) {
            this.achievements.firstKill = true;
            this.showAchievementNotification('初撃破！', '初めて敵を倒した！');
            newAchievement = true;
        }

        if (this.gameStats.maxCombo >= 10 && !this.achievements.combo10) {
            this.achievements.combo10 = true;
            this.showAchievementNotification('コンボマスター', '10コンボ達成！');
            newAchievement = true;
        }

        if (this.gameStats.maxCombo >= 50 && !this.achievements.combo50) {
            this.achievements.combo50 = true;
            this.showAchievementNotification('コンボキング！', '50コンボ達成！');
            newAchievement = true;
        }

        if (this.gameStats.bellsCollected >= 20 && !this.achievements.bellMaster) {
            this.achievements.bellMaster = true;
            this.showAchievementNotification('ベルマスター', 'ベルを20個集めた！');
            newAchievement = true;
        }

        if (this.gameStats.superAttacksUsed >= 5 && !this.achievements.superUser) {
            this.achievements.superUser = true;
            this.showAchievementNotification('必殺技使い', '必殺技を5回使用！');
            newAchievement = true;
        }

        if (this.gameStats.dashesUsed >= 10 && !this.achievements.dashMaster) {
            this.achievements.dashMaster = true;
            this.showAchievementNotification('ダッシュマスター', 'ダッシュを10回使用！');
            newAchievement = true;
        }

        if (this.player && this.player.hasRainbowMode && !this.achievements.rainbowWarrior) {
            this.achievements.rainbowWarrior = true;
            this.showAchievementNotification('🌈 Rainbow Warrior', 'レインボーモード達成！');
            newAchievement = true;
        }

        if (newAchievement) {
            this.saveAchievements();
        }
    }

    check1UP() {
        // Check if player has reached next 1UP threshold
        if (this.score >= this.nextOneUpScore) {
            this.player.lives++;
            this.nextOneUpScore += CONFIG.ONEUP_SCORE_INTERVAL;
            this.updateUI();
            this.showAchievementNotification('1UP!', `残機が増えた！次は${this.nextOneUpScore}点で1UP`);
        }
    }

    showAchievementNotification(title, description) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'achievement-notification';
        notification.innerHTML = `
            <div class="achievement-icon">🏆</div>
            <div class="achievement-text">
                <div class="achievement-title">${title}</div>
                <div class="achievement-desc">${description}</div>
            </div>
        `;
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => notification.classList.add('show'), 100);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
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

        // Difficulty selection
        const difficultyButtons = document.querySelectorAll('.difficulty-btn');
        difficultyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove previous selection
                difficultyButtons.forEach(b => b.classList.remove('selected'));
                // Select this difficulty
                btn.classList.add('selected');
                this.selectedDifficulty = btn.dataset.difficulty;
            });
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

        // Shop button
        document.getElementById('shop-button').addEventListener('click', () => {
            this.showShopScreen();
        });

        // Shop back button
        document.getElementById('shop-back-button').addEventListener('click', () => {
            this.showGameOverScreen();
        });

        // Shop purchase buttons
        document.querySelectorAll('.buy-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                const shopItem = btn.closest('.shop-item');
                const itemKey = shopItem.dataset.item;
                this.purchaseItem(itemKey);
            });
        });

        // Start mode buttons
        const startModeButtons = document.querySelectorAll('.start-option-btn');
        startModeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                startModeButtons.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        // Normal start
        document.getElementById('normal-start-btn').addEventListener('click', () => {
            this.gameMode = 'normal';
            this.startStage = 1;
        });

        // Stage select button
        document.getElementById('stage-select-btn').addEventListener('click', () => {
            this.showStageSelectModal();
        });

        // Daily challenge button
        document.getElementById('daily-challenge-btn').addEventListener('click', () => {
            this.gameMode = 'daily-challenge';
            this.startStage = 1;
            this.showAchievementNotification('🌟 デイリーチャレンジ!', '今日の特別ステージに挑戦！');
        });

        // Stage modal close
        document.getElementById('stage-modal-close').addEventListener('click', () => {
            this.hideStageSelectModal();
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
            case 'Escape':
            case 'p':
            case 'P':
                if (this.gameRunning) {
                    this.togglePause();
                }
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
        document.getElementById('shop-screen').style.display = 'none';
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('high-score').textContent = this.achievements.highScore;
    }

    showShopScreen() {
        document.getElementById('title-screen').style.display = 'none';
        document.getElementById('ship-select-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'none';
        document.getElementById('game-over-screen').style.display = 'none';
        document.getElementById('shop-screen').style.display = 'block';

        // Update shop display
        document.getElementById('shop-score').textContent = this.totalScore.toLocaleString();
        this.updateShopUI();
    }

    updateShopUI() {
        document.querySelectorAll('.shop-item').forEach(item => {
            const itemKey = item.dataset.item;
            const shopItem = this.shopItems[itemKey];
            const buyBtn = item.querySelector('.buy-btn');

            if (shopItem.purchased) {
                item.classList.add('purchased');
                buyBtn.disabled = true;
                buyBtn.textContent = '購入済み';
            } else if (this.totalScore < shopItem.cost) {
                buyBtn.disabled = true;
            } else {
                buyBtn.disabled = false;
                item.classList.remove('purchased');
                buyBtn.textContent = '購入';
            }
        });
    }

    purchaseItem(itemKey) {
        const item = this.shopItems[itemKey];
        if (!item || item.purchased || this.totalScore < item.cost) {
            return;
        }

        // Deduct cost
        this.totalScore -= item.cost;
        item.purchased = true;

        // Save changes
        this.saveShopItems();
        this.saveTotalScore();

        // Update UI
        document.getElementById('shop-score').textContent = this.totalScore.toLocaleString();
        this.updateShopUI();

        // Show notification
        this.showAchievementNotification('🛒 購入完了!', `${item.name} を購入しました！`);
        this.vibrate(50);
    }

    showStageSelectModal() {
        const modal = document.getElementById('stage-select-modal');
        const stageGrid = document.getElementById('stage-grid');

        // Clear previous grid
        stageGrid.innerHTML = '';

        // Create stage buttons (up to 20 stages)
        for (let i = 1; i <= 20; i++) {
            const btn = document.createElement('button');
            btn.className = 'stage-btn';
            btn.textContent = `Stage ${i}`;

            const isCleared = this.clearedStages.includes(i);
            const isAvailable = i === 1 || this.clearedStages.includes(i - 1);

            if (isCleared) {
                btn.classList.add('cleared');
            }

            if (!isAvailable) {
                btn.disabled = true;
            } else {
                btn.addEventListener('click', () => {
                    this.gameMode = 'stage-select';
                    this.startStage = i;
                    this.hideStageSelectModal();
                    this.showAchievementNotification(`ステージ${i}選択`, 'がんばって！');
                });
            }

            stageGrid.appendChild(btn);
        }

        modal.style.display = 'flex';
    }

    hideStageSelectModal() {
        document.getElementById('stage-select-modal').style.display = 'none';
    }

    startGame() {
        this.showGameScreen();
        this.resetGame();
        this.gameRunning = true;
        this.isPaused = false;
        this.lastFrameTime = performance.now();

        // Start normal BGM
        this.soundManager.startNormalBGM();

        this.gameLoop();
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        if (!this.isPaused) {
            // Reset frame time when unpausing to prevent frame skip
            this.lastFrameTime = performance.now();
        }
    }

    resetGame() {
        // Validate ship type
        if (!Validator.isValidShipType(this.selectedShip)) {
            console.warn(`Invalid ship type "${this.selectedShip}", defaulting to "twinbee"`);
            this.selectedShip = 'twinbee';
        }

        // Validate difficulty
        if (!Validator.isValidDifficulty(this.selectedDifficulty)) {
            console.warn(`Invalid difficulty "${this.selectedDifficulty}", defaulting to "normal"`);
            this.selectedDifficulty = 'normal';
        }

        // Center player horizontally, near bottom
        const playerX = (CONFIG.CANVAS_WIDTH - 30) / 2;
        const playerY = CONFIG.CANVAS_HEIGHT - 100;
        this.player = new Player(playerX, playerY, this.selectedShip);

        // Apply difficulty settings
        const difficulty = this.getDifficultyMultipliers();
        this.player.lives = difficulty.playerLives;

        // Apply shop upgrades
        if (this.shopItems.maxLives.purchased) {
            this.player.lives += 1;
        }
        if (this.shopItems.startSpeed.purchased) {
            this.player.speedLevel = 1;
            this.player.speed = CONFIG.PLAYER_SPEED + 1;
        }
        if (this.shopItems.startTwin.purchased) {
            this.player.hasTwinCannon = true;
        }

        this.bullets = [];
        this.enemyBullets = [];
        this.bombs = [];
        this.enemies = [];
        this.groundEnemies = [];
        this.clouds = [];
        this.bells = [];
        this.items = [];
        this.particles = [];
        this.superAttackEffects = [];
        this.score = 0;
        this.stage = this.startStage; // Use selected start stage
        this.frameCount = 0;

        // Apply daily challenge modifiers
        if (this.gameMode === 'daily-challenge') {
            const dailySeed = this.getDailySeed();
            this.dailyRandomSeed = dailySeed; // Initialize seeded random for consistent daily challenge
            // Daily challenge: harder difficulty, but 2x score
            this.player.lives = Math.max(1, this.player.lives - 1);
            this.showAchievementNotification('🌟 デイリーモード', 'スコア2倍！難易度UP！');
        }
        this.scrollOffset = 0;
        this.isPaused = false;  // Reset pause state
        this.nextOneUpScore = CONFIG.ONEUP_SCORE_INTERVAL;  // Reset 1UP threshold
        this.bossActive = false;  // Reset boss state
        this.bossWarningShown = false;

        // Reset game stats for new session
        this.gameStats.enemiesKilled = 0;
        this.gameStats.bellsCollected = 0;
        this.gameStats.superAttacksUsed = 0;
        this.gameStats.dashesUsed = 0;
        this.gameStats.maxCombo = 0;
        this.gameStats.currentCombo = 0;
        this.gameStats.comboTimer = 0;

        this.updateUI();
    }

    updateUI() {
        document.querySelector('#score span').textContent = this.score;
        document.querySelector('#lives span').textContent = this.player.lives;
        document.querySelector('#stage span').textContent = this.stage;
    }

    gameLoop(currentTime = performance.now()) {
        if (!this.gameRunning) return;

        // FPS limiting - only update if enough time has passed
        const deltaTime = currentTime - this.lastFrameTime;
        if (deltaTime < CONFIG.FRAME_TIME) {
            requestAnimationFrame((time) => this.gameLoop(time));
            return;
        }

        this.lastFrameTime = currentTime - (deltaTime % CONFIG.FRAME_TIME);

        // Handle pause
        if (!this.isPaused) {
            this.update();
            this.frameCount++;
        }

        // Always draw (to show pause screen)
        this.draw();

        requestAnimationFrame((time) => this.gameLoop(time));
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

        // Handle dash - requires directional input
        if (this.input.dash && !this.input.dashPressed) {
            this.input.dashPressed = true;
            const dirX = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
            const dirY = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);
            // Only dash if a direction is actually pressed
            if (dirX !== 0 || dirY !== 0) {
                if (this.player.dash(dirX, dirY)) {
                    this.gameStats.dashesUsed++;
                    this.checkAchievements();
                }
            }
        }

        // Update super attack effects
        this.superAttackEffects = this.superAttackEffects.filter(effect => {
            effect.update();
            return effect.active;
        });

        // Update combo timer - resets combo if no kills within timeout period
        // Encourages continuous aggressive play to maintain combo chains
        if (this.gameStats.comboTimer > 0) {
            this.gameStats.comboTimer--;
            if (this.gameStats.comboTimer === 0) {
                this.gameStats.currentCombo = 0;
            }
        }

        // Stage progression based on score
        const newStage = Math.floor(this.score / 5000) + 1;
        if (newStage > this.stage) {
            // Save the previous stage as cleared
            const previousStage = this.stage;
            if (!this.clearedStages.includes(previousStage)) {
                this.clearedStages.push(previousStage);
                this.saveClearedStages();
            }

            this.stage = newStage;
            this.bossWarningShown = false;  // Reset for new stage
            this.updateUI();

            // Boss stages (every 5 stages)
            if (this.stage % 5 === 0 && !this.bossActive) {
                this.showBossWarning();
            }
        }

        // Spawn boss if it's a boss stage and no boss is active
        if (this.stage % 5 === 0 && !this.bossActive && this.bossWarningShown && this.enemies.length === 0) {
            this.spawnBoss();
        }

        // Spawn enemies with increasing frequency based on stage (but not during boss battle)
        if (!this.bossActive) {
            const difficulty = this.getDifficultyMultipliers();
            const baseSpawnRate = Math.max(30, CONFIG.ENEMY_SPAWN_RATE - (this.stage - 1) * 5);
            const enemySpawnRate = Math.floor(baseSpawnRate * difficulty.enemySpawnRate);
            if (this.frameCount % enemySpawnRate === 0) {
                this.spawnEnemy();
            }
        }

        // Spawn ground enemies
        const difficulty = this.getDifficultyMultipliers();
        const baseGroundRate = Math.max(90, CONFIG.ENEMY_SPAWN_RATE * 3 - (this.stage - 1) * 15);
        const groundSpawnRate = Math.floor(baseGroundRate * difficulty.enemySpawnRate);
        if (this.frameCount % groundSpawnRate === 0) {
            this.spawnGroundEnemy();
        }

        // Spawn clouds
        if (this.frameCount % CONFIG.CLOUD_SPAWN_RATE === 0) {
            this.spawnCloud();
        }

        // Update all game objects
        this.updateObjects(this.bullets);
        this.updateObjects(this.enemyBullets);
        this.updateObjects(this.bombs);
        this.updateObjects(this.enemies);
        this.updateObjects(this.groundEnemies);
        this.updateObjects(this.clouds);
        this.updateObjects(this.bells);
        this.updateObjects(this.items);
        this.updateObjects(this.particles);

        // Check if enemies should shoot
        this.enemies.forEach(enemy => {
            if (enemy.active && enemy.shouldShoot()) {
                this.enemyBullets.push(new EnemyBullet(
                    enemy.x + enemy.width / 2 - 3,
                    enemy.y + enemy.height
                ));
            }
        });

        // Check collisions
        this.checkCollisions();

        // Check if boss is defeated
        this.checkBossDefeat();

        // Remove inactive objects
        this.cleanupObjects();

        // Check game over
        if (this.player.lives <= 0) {
            this.gameOver();
        }

        // Update screen effects
        if (this.screenShake > 0) {
            this.screenShake--;
        }
        if (this.slowMotionTimer > 0) {
            this.slowMotionTimer--;
            if (this.slowMotionTimer === 0) {
                this.slowMotion = false;
            }
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
        this.enemyBullets = this.enemyBullets.filter(b => b.active);
        this.bombs = this.bombs.filter(b => b.active);
        this.enemies = this.enemies.filter(e => e.active);
        this.groundEnemies = this.groundEnemies.filter(e => e.active);
        this.clouds = this.clouds.filter(c => c.active);
        this.bells = this.bells.filter(b => b.active);
        this.items = this.items.filter(i => i.active);
        this.particles = this.particles.filter(p => p.active);
    }

    shoot() {
        // Play shooting sound
        this.soundManager.playShoot();

        // Vibrate on shoot (very short)
        this.vibrate(10);

        const bulletSpeed = this.player.hasFastBullets ? CONFIG.BULLET_SPEED * 1.5 : CONFIG.BULLET_SPEED;
        const damage = this.player.damageMultiplier;

        if (this.player.hasTwinCannon) {
            const b1 = new Bullet(this.player.x + 5, this.player.y, true, damage);
            const b2 = new Bullet(this.player.x + this.player.width - 9, this.player.y, true, damage);
            b1.speed = bulletSpeed;
            b2.speed = bulletSpeed;
            this.bullets.push(b1, b2);
        } else {
            const b = new Bullet(this.player.x + this.player.width / 2 - 2, this.player.y, false, damage);
            b.speed = bulletSpeed;
            this.bullets.push(b);
        }

        // Barrier shots - Twin Cannon + Barrier combo effect
        // Fires 4-directional bullets from barrier edges (only when actively shooting)
        // Throttled to prevent excessive bullet spam
        if (this.player.hasBarrierShots && this.frameCount % CONFIG.BARRIER_SHOT_INTERVAL === 0) {
            const barrierSize = 15 + this.player.barrierStrength * 2;
            const centerX = this.player.x + this.player.width / 2;
            const centerY = this.player.y + this.player.height / 2;

            // Create bullets at 90-degree intervals (0°, 90°, 180°, 270°)
            for (let i = 0; i < 4; i++) {
                const angle = (Math.PI / 2) * i;
                const bx = centerX + Math.cos(angle) * barrierSize - 2;
                const by = centerY + Math.sin(angle) * barrierSize - 6;
                const bullet = new Bullet(bx, by, false, damage);
                bullet.speed = CONFIG.BULLET_SPEED * 0.8;
                bullet.vx = Math.cos(angle) * 3;
                bullet.vy = Math.sin(angle) * 3 - 5; // Bias toward upward movement
                this.bullets.push(bullet);
            }
        }
    }

    dropBomb() {
        this.bombs.push(new Bomb(this.player.x + this.player.width / 2 - 4, this.player.y + this.player.height));
    }

    spawnEnemy() {
        const x = getRandomInt(
            CONFIG.ENEMY_SPAWN_MARGIN_X,
            this.canvas.width - CONFIG.ENEMY_SPAWN_MARGIN_X - 25
        );

        // Enemy type distribution changes with stage
        // Higher stages have more strong/fast enemies
        // Use seeded random for daily challenge to ensure consistent patterns
        const rand = this.gameMode === 'daily-challenge' ? this.seededRandom() : Math.random();
        let type;
        if (this.stage >= 5) {
            // Stage 5+: 30% basic, 40% strong, 30% fast
            type = rand < 0.3 ? 'basic' : rand < 0.7 ? 'strong' : 'fast';
        } else if (this.stage >= 3) {
            // Stage 3-4: 40% basic, 30% strong, 30% fast
            type = rand < 0.4 ? 'basic' : rand < 0.7 ? 'strong' : 'fast';
        } else {
            // Stage 1-2: 60% basic, 20% strong, 20% fast
            type = rand < 0.6 ? 'basic' : rand < 0.8 ? 'strong' : 'fast';
        }

        const enemy = new Enemy(x, -30, type);

        // Also use seeded random for move pattern in daily challenge
        const patternRand = this.gameMode === 'daily-challenge' ? this.seededRandom() : Math.random();
        enemy.movePattern = Math.floor(patternRand * 3);

        // Apply difficulty multipliers
        const difficulty = this.getDifficultyMultipliers();
        enemy.speed *= difficulty.enemySpeed;
        enemy.health = Math.ceil(enemy.health * difficulty.enemyHealth);
        // Apply difficulty to shoot cooldown (inverse - higher difficulty = faster shooting)
        enemy.shootCooldown = Math.floor(enemy.shootCooldown / difficulty.bulletSpeed);

        this.enemies.push(enemy);
    }

    spawnGroundEnemy() {
        const x = getRandomInt(
            CONFIG.ENEMY_SPAWN_MARGIN_X,
            this.canvas.width - CONFIG.ENEMY_SPAWN_MARGIN_X - 30
        );
        const y = this.canvas.height - CONFIG.GROUND_ENEMY_Y_OFFSET;
        this.groundEnemies.push(new GroundEnemy(x, y));
    }

    spawnCloud() {
        const x = getRandomInt(
            CONFIG.CLOUD_SPAWN_MARGIN_X,
            this.canvas.width - CONFIG.CLOUD_SPAWN_MARGIN_X - 40
        );
        this.clouds.push(new Cloud(x, -30));
    }

    showBossWarning() {
        this.bossWarningShown = true;
        this.soundManager.playBossWarning();
        this.showAchievementNotification('⚠️ BOSS WARNING!', `ステージ${this.stage}のボスが出現します！`);
    }

    spawnBoss() {
        this.bossActive = true;
        // Switch to boss BGM
        this.soundManager.startBossBGM();
        const boss = new Boss(170, -80, this.stage);
        this.enemies.push(boss);
    }

    checkBossDefeat() {
        // Check if boss is defeated
        if (this.bossActive) {
            const bossExists = this.enemies.some(e => e instanceof Boss && e.active);
            if (!bossExists) {
                this.bossActive = false;

                // Epic defeat effects: screen shake + slow motion + vibration
                this.triggerScreenShake(10);
                this.triggerSlowMotion(60); // 1 second of slow motion
                this.vibrate([100, 50, 100, 50, 200]); // Victory vibration pattern

                // Return to normal BGM
                this.soundManager.startNormalBGM();
                this.showAchievementNotification('🎉 BOSS DEFEATED!', 'ボスを撃破した！ボーナス！');

                // Bonus points for defeating boss
                this.addScore(10000);
                this.updateUI();
                this.check1UP();
            }
        }
    }

    useSuperAttack() {
        if (!this.player.useSuperAttack()) return;

        this.gameStats.superAttacksUsed++;

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
                this.addScore(enemy.points * 2); // Double points for super attack
                this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#FFD700');
                enemiesDestroyed++;
            }
        });

        this.groundEnemies.forEach(enemy => {
            if (enemy.active) {
                enemy.active = false;
                this.addScore(enemy.points * 2);
                this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#FFD700');
                enemiesDestroyed++;
            }
        });

        this.updateUI();
        this.check1UP();
        this.checkAchievements();
    }

    checkCollisions() {
        // Clear and rebuild spatial grid
        this.spatialGrid.clear();

        // Insert all collidable objects into grid
        this.enemies.forEach(e => e.active && this.spatialGrid.insert(e));
        this.clouds.forEach(c => c.active && this.spatialGrid.insert(c));
        this.bells.forEach(b => b.active && this.spatialGrid.insert(b));
        this.groundEnemies.forEach(g => g.active && this.spatialGrid.insert(g));
        this.items.forEach(i => i.active && this.spatialGrid.insert(i));
        this.enemyBullets.forEach(b => b.active && this.spatialGrid.insert(b));

        // Bullets vs Nearby Objects (Enemies, Clouds, Bells)
        this.bullets.forEach(bullet => {
            if (!bullet.active) return;

            const nearbyObjects = this.spatialGrid.getNearbyObjects(bullet);

            for (const obj of nearbyObjects) {
                if (!bullet.active) break;

                // Check collision with enemies
                if (obj instanceof Enemy && checkCollision(bullet, obj)) {
                    bullet.active = false;
                    if (obj.takeDamage(bullet.damage)) {
                        obj.active = false;
                        this.addScore(obj.points);
                        const gaugeGain = this.shopItems.superGaugeBoost.purchased
                            ? CONFIG.SUPER_GAUGE_GAIN_PER_KILL * 1.5
                            : CONFIG.SUPER_GAUGE_GAIN_PER_KILL;
                        this.player.addSuperGauge(gaugeGain);
                        this.gameStats.enemiesKilled++;
                        this.gameStats.currentCombo++;
                        this.gameStats.comboTimer = CONFIG.COMBO_TIMEOUT;
                        if (this.gameStats.currentCombo > this.gameStats.maxCombo) {
                            this.gameStats.maxCombo = this.gameStats.currentCombo;
                        }
                        this.createExplosion(obj.x + obj.width / 2, obj.y + obj.height / 2, '#E74C3C');
                        this.updateUI();
                        this.check1UP();
                        this.checkAchievements();
                    }
                }
                // Check collision with clouds
                else if (obj instanceof Cloud && !obj.hit && checkCollision(bullet, obj)) {
                    bullet.active = false;
                    obj.hit = true;
                    if (obj.hasBell) {
                        this.bells.push(new Bell(obj.x + 10, obj.y + 10));
                    }
                }
                // Check collision with bells
                else if (obj instanceof Bell && checkCollision(bullet, obj)) {
                    bullet.active = false;
                    obj.hit();
                }
            }
        });

        // Bombs vs Ground Enemies
        this.bombs.forEach(bomb => {
            if (!bomb.active) return;

            const nearbyObjects = this.spatialGrid.getNearbyObjects(bomb);

            for (const obj of nearbyObjects) {
                if (!bomb.active) break;

                if (obj instanceof GroundEnemy && checkCollision(bomb, obj)) {
                    bomb.active = false;
                    if (obj.takeDamage()) {
                        obj.active = false;
                        this.addScore(obj.points);
                        const gaugeGain = this.shopItems.superGaugeBoost.purchased
                            ? CONFIG.SUPER_GAUGE_GAIN_PER_KILL * 1.5
                            : CONFIG.SUPER_GAUGE_GAIN_PER_KILL;
                        this.player.addSuperGauge(gaugeGain);

                        // Drop items
                        if (Math.random() < 0.3) {
                            const itemType = Math.random() < 0.8 ? 'fruit' : 'star';
                            this.items.push(new Item(obj.x, obj.y, itemType));
                        }

                        this.createExplosion(obj.x + obj.width / 2, obj.y + obj.height / 2, '#8B4513');
                        this.updateUI();
                        this.check1UP();
                    }
                }
            }
        });

        // Player vs Nearby Objects
        if (this.player && this.player.active) {
            const nearbyObjects = this.spatialGrid.getNearbyObjects(this.player);

            for (const obj of nearbyObjects) {
                // Enemy bullets vs Player
                if (obj instanceof EnemyBullet && checkCollision(this.player, obj)) {
                    obj.active = false;
                    if (this.player.takeDamage()) {
                        this.soundManager.playDamage();
                        this.vibrate(100);
                        this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#FF6B6B');
                    }
                    this.updateUI();
                }
                // Enemies vs Player
                else if (obj instanceof Enemy && !(obj instanceof Boss) && checkCollision(this.player, obj)) {
                    obj.active = false;
                    if (this.player.takeDamage()) {
                        this.soundManager.playDamage();
                        this.vibrate(100);
                        this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#FF6B6B');
                    }
                    this.updateUI();
                }
                // Boss vs Player (different handling)
                else if (obj instanceof Boss && checkCollision(this.player, obj)) {
                    // Boss doesn't get destroyed on collision
                    if (this.player.takeDamage()) {
                        this.soundManager.playDamage();
                        this.vibrate(100);
                        this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#FF6B6B');
                    }
                    this.updateUI();
                }
                // Bells vs Player
                else if (obj instanceof Bell && checkCollision(this.player, obj)) {
                    obj.active = false;
                    const colorName = obj.getColorName();
                    this.gameStats.bellsCollected++;

                    this.soundManager.playBell(obj.colorIndex);

                    if (colorName === 'yellow') {
                        this.addScore(500);
                    } else {
                        this.player.powerUp(colorName);
                        this.soundManager.playPowerUp();
                    }

                    this.updateUI();
                    this.check1UP();
                    this.checkAchievements();
                }
                // Items vs Player
                else if (obj instanceof Item && checkCollision(this.player, obj)) {
                    obj.active = false;
                    this.addScore(obj.points);

                    if (obj.type === 'star') {
                        // Clear all enemies on screen
                        this.enemies.forEach(e => {
                            e.active = false;
                            this.addScore(e.points);
                        });
                    }

                    this.updateUI();
                    this.check1UP();
                }
            }
        }
    }

    createExplosion(x, y, color) {
        // Play explosion sound
        this.soundManager.playExplosion();

        // Trigger screen shake for explosions
        this.triggerScreenShake(3);

        for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    triggerScreenShake(intensity) {
        this.screenShake = 10; // Duration in frames
        this.screenShakeIntensity = intensity;
    }

    triggerSlowMotion(duration) {
        this.slowMotion = true;
        this.slowMotionTimer = duration;
    }

    vibrate(pattern) {
        // Vibration API for mobile devices
        // Normalize pattern to array format
        if ('vibrate' in navigator) {
            const normalizedPattern = Array.isArray(pattern) ? pattern : [pattern];
            navigator.vibrate(normalizedPattern);
        }
    }

    // Cleanup method for removing event listeners (memory leak prevention)
    cleanup() {
        // This method can be called if the game instance needs to be destroyed
        // For now, we store event listeners for potential future cleanup
        this.gameRunning = false;
        this.soundManager.stopBGM();
    }

    addScore(points) {
        // Apply score multiplier if purchased
        let multiplier = this.shopItems.scoreMultiplier.purchased ? 1.2 : 1.0;

        // Daily challenge gives 2x score
        if (this.gameMode === 'daily-challenge') {
            multiplier *= 2;
        }

        this.score += Math.floor(points * multiplier);
    }

    getDailySeed() {
        // Generate a seed based on current date
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const day = today.getDate();
        return year * 10000 + month * 100 + day; // e.g., 20250322
    }

    seededRandom() {
        // Linear Congruential Generator for seeded random
        // Only used for daily challenge to ensure consistent randomness for each day
        this.dailyRandomSeed = (this.dailyRandomSeed * 1664525 + 1013904223) % 4294967296;
        return this.dailyRandomSeed / 4294967296;
    }

    getDifficultyMultipliers() {
        // Returns multipliers based on selected difficulty
        const multipliers = {
            easy: {
                enemySpeed: 0.7,
                enemyHealth: 0.7,
                enemySpawnRate: 1.5,  // Higher = slower spawn
                bulletSpeed: 0.8,
                playerLives: 5
            },
            normal: {
                enemySpeed: 1.0,
                enemyHealth: 1.0,
                enemySpawnRate: 1.0,
                bulletSpeed: 1.0,
                playerLives: 3
            },
            hard: {
                enemySpeed: 1.3,
                enemyHealth: 1.5,
                enemySpawnRate: 0.7,  // Lower = faster spawn
                bulletSpeed: 1.2,
                playerLives: 2
            }
        };
        return multipliers[this.selectedDifficulty] || multipliers.normal;
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply screen shake effect
        this.ctx.save();
        if (this.screenShake > 0) {
            const shakeX = (Math.random() - 0.5) * this.screenShakeIntensity;
            const shakeY = (Math.random() - 0.5) * this.screenShakeIntensity;
            this.ctx.translate(shakeX, shakeY);
        }

        // Draw background
        this.drawBackground();

        // Draw all game objects
        this.groundEnemies.forEach(e => e.active && e.draw(this.ctx));
        this.clouds.forEach(c => c.active && c.draw(this.ctx));
        this.items.forEach(i => i.active && i.draw(this.ctx));
        this.bells.forEach(b => b.active && b.draw(this.ctx));
        this.enemies.forEach(e => e.active && e.draw(this.ctx));
        this.bullets.forEach(b => b.active && b.draw(this.ctx));
        this.enemyBullets.forEach(b => b.active && b.draw(this.ctx));
        this.bombs.forEach(b => b.active && b.draw(this.ctx));
        this.particles.forEach(p => p.active && p.draw(this.ctx));
        this.player.draw(this.ctx);

        this.ctx.restore();

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

        // Draw combo counter
        if (this.gameStats.currentCombo > 1) {
            this.drawComboCounter();
        }

        // Draw pause screen
        if (this.isPaused) {
            this.drawPauseScreen();
        }
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

        // Ready indicator with pulsing effect
        if (this.player.canUseSuperAttack()) {
            const pulseScale = 1 + Math.sin(Date.now() / 150) * 0.2;
            this.ctx.save();
            this.ctx.translate(barX + barWidth / 2, barY + barHeight + 12);
            this.ctx.scale(pulseScale, pulseScale);
            this.ctx.fillStyle = '#FFD700';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('READY!', 0, 0);
            this.ctx.restore();
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

    drawComboCounter() {
        const x = this.canvas.width / 2;
        const y = 50;

        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(x - 50, y - 20, 100, 30);

        // Combo text with scaling effect
        const scale = 1 + Math.min(this.gameStats.currentCombo / 50, 0.5);
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.scale(scale, scale);

        // Gradient color based on combo count
        const gradient = this.ctx.createLinearGradient(-40, 0, 40, 0);
        if (this.gameStats.currentCombo >= 50) {
            gradient.addColorStop(0, '#FF6B6B');
            gradient.addColorStop(0.5, '#FFD700');
            gradient.addColorStop(1, '#FF6B6B');
        } else if (this.gameStats.currentCombo >= 10) {
            gradient.addColorStop(0, '#FFD700');
            gradient.addColorStop(1, '#FF8C00');
        } else {
            gradient.addColorStop(0, '#FFF');
            gradient.addColorStop(1, '#CCC');
        }

        this.ctx.fillStyle = gradient;
        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${this.gameStats.currentCombo} COMBO!`, 0, 0);

        this.ctx.restore();
    }

    drawPauseScreen() {
        // Semi-transparent overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Pause text
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = 'bold 40px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('PAUSE', this.canvas.width / 2, this.canvas.height / 2 - 30);

        // Instructions
        this.ctx.font = '16px Arial';
        this.ctx.fillText('Press P or ESC to resume', this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    drawBackground() {
        // Stage-based background variations
        const backgrounds = [
            { top: '#87CEEB', bottom: '#98D8E8', cloudColor: 'rgba(255, 255, 255, 0.3)' }, // Sky blue (stages 1-2)
            { top: '#FFB6C1', bottom: '#FFC0CB', cloudColor: 'rgba(255, 200, 200, 0.3)' }, // Pink sunset (stages 3-4)
            { top: '#4B0082', bottom: '#8B008B', cloudColor: 'rgba(150, 100, 200, 0.3)' }, // Purple twilight (stages 5-6)
            { top: '#FF4500', bottom: '#FF6347', cloudColor: 'rgba(255, 150, 100, 0.3)' }, // Orange dusk (stages 7-8)
            { top: '#191970', bottom: '#000080', cloudColor: 'rgba(100, 100, 200, 0.3)' }, // Night sky (stages 9-10)
            { top: '#006400', bottom: '#228B22', cloudColor: 'rgba(150, 255, 150, 0.3)' }  // Green forest (stages 11+)
        ];

        // Select background based on stage (cycle every 2 stages)
        const bgIndex = Math.min(Math.floor((this.stage - 1) / 2), backgrounds.length - 1);
        const bg = backgrounds[bgIndex];

        // Draw gradient background
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, bg.top);
        gradient.addColorStop(1, bg.bottom);
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw scrolling clouds with stage-based color
        this.ctx.fillStyle = bg.cloudColor;
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

        // Stop BGM
        this.soundManager.stopBGM();

        // Update high score
        if (this.score > this.achievements.highScore) {
            this.achievements.highScore = this.score;
            this.saveAchievements();
        }

        // Add score to total (for shop purchases)
        this.totalScore += this.score;
        this.saveTotalScore();

        // Reset combo
        this.gameStats.currentCombo = 0;

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
