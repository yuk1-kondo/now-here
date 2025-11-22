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
    BELL_SHOTS_TO_CHANGE: 5
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
    constructor(x, y) {
        super(x, y, 30, 30);
        this.speed = CONFIG.PLAYER_SPEED;
        this.speedLevel = 0;
        this.lives = 3;
        this.invulnerable = false;
        this.invulnerableTimer = 0;
        this.hasTwinCannon = false;
        this.hasBarrier = false;
        this.barrierStrength = 0;
    }

    update(input, canvasWidth, canvasHeight) {
        // Movement
        if (input.left && this.x > 0) this.x -= this.speed;
        if (input.right && this.x < canvasWidth - this.width) this.x += this.speed;
        if (input.up && this.y > 0) this.y -= this.speed;
        if (input.down && this.y < canvasHeight - this.height) this.y += this.speed;

        // Invulnerability timer
        if (this.invulnerable) {
            this.invulnerableTimer--;
            if (this.invulnerableTimer <= 0) {
                this.invulnerable = false;
            }
        }
    }

    draw(ctx) {
        // Draw with blinking effect if invulnerable
        if (this.invulnerable && Math.floor(this.invulnerableTimer / 5) % 2 === 0) {
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

        // Draw player (simple representation)
        ctx.fillStyle = '#FF6B6B';
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Wings
        ctx.fillStyle = '#4ECDC4';
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
    }

    update() {
        this.y -= this.speed;
        if (this.y < -this.height) {
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
            bombPressed: false
        };

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

        // Start button
        document.getElementById('start-button').addEventListener('click', () => {
            this.startGame();
        });

        // Restart button
        document.getElementById('restart-button').addEventListener('click', () => {
            this.startGame();
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
        }
    }

    showTitleScreen() {
        document.getElementById('title-screen').style.display = 'block';
        document.getElementById('game-screen').style.display = 'none';
        document.getElementById('game-over-screen').style.display = 'none';
    }

    showGameScreen() {
        document.getElementById('title-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'block';
        document.getElementById('game-over-screen').style.display = 'none';
    }

    showGameOverScreen() {
        document.getElementById('title-screen').style.display = 'none';
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
        this.player = new Player(185, 500);
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
        if (this.player.hasTwinCannon) {
            this.bullets.push(new Bullet(this.player.x + 5, this.player.y));
            this.bullets.push(new Bullet(this.player.x + this.player.width - 9, this.player.y));
        } else {
            this.bullets.push(new Bullet(this.player.x + this.player.width / 2 - 2, this.player.y));
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

    checkCollisions() {
        // Bullets vs Enemies
        this.bullets.forEach(bullet => {
            this.enemies.forEach(enemy => {
                if (bullet.active && enemy.active && checkCollision(bullet, enemy)) {
                    bullet.active = false;
                    if (enemy.takeDamage()) {
                        enemy.active = false;
                        this.score += enemy.points;
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
