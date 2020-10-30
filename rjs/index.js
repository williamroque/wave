const ioHook = require('iohook');
const robot = require('robotjs');
const { app } = require('electron').remote;
const { ipcRenderer } = require('electron');

const path = require('path');
const spawn = require("child_process").spawn;
const fs = require('fs');

const settingsPath = path.join(app.getPath('home'), 'combinations.json');
const scriptPath = path.join(app.getPath('home'), 'active.scpt');
const settingsCombination = 'RIGHT+DOWN+LEFT+DOWN';

const gestureCanvas = document.querySelector('#gesture-canvas');
const ctx = gestureCanvas.getContext('2d');

const borderPerc = .1;

gestureCanvas.width = window.innerWidth - borderPerc * window.innerHeight * 2;
gestureCanvas.height = window.innerHeight;

ctx.fillStyle = '#BCCCDC';
ctx.strokeStyle = '#486581';
ctx.lineCap = 'round';

const equalityThreshold = .6;
const diffThreshold = .15;
const diacriticThreshold = .5;
const moveCycle = 5;
const maxGestureRadius = 2;
const scrollSpeedFactor = 1/5;
const maxScroll = 300;

const UPPER = 1;
const RIGHT = 2;
const LOWER = 4;
const LEFT = 8;
const UPWARD = 16;
const DOWNWARD = 32;

const glyphMap = new Map();
glyphMap.set(LEFT, 'a');
glyphMap.set(UPPER, 'b');
glyphMap.set(RIGHT, 'c');
glyphMap.set(LOWER, 'd');
glyphMap.set(LEFT | UPPER, 'e');
glyphMap.set(LEFT | UPPER | RIGHT, 'f');
glyphMap.set(LEFT | UPPER | RIGHT | LOWER, 'g');
glyphMap.set(LEFT | UPWARD, 'h');
glyphMap.set(LEFT | DOWNWARD, 'i');
glyphMap.set(UPPER | UPWARD, 'j');
glyphMap.set(LOWER | DOWNWARD, 'k');
glyphMap.set(LEFT | UPPER | DOWNWARD, 'l');
glyphMap.set(LEFT | LOWER | UPWARD, 'm');
glyphMap.set(UPPER | RIGHT, 'n');
glyphMap.set(LOWER | RIGHT, 'o');
glyphMap.set(LOWER | LEFT, 'p');
glyphMap.set(LEFT | LOWER | RIGHT | UPWARD, 'q');
glyphMap.set(UPPER | RIGHT | UPWARD, 'r');
glyphMap.set(UPPER | RIGHT | LOWER | LEFT | UPWARD, 's');
glyphMap.set(UPPER | RIGHT | LOWER | LEFT | DOWNWARD, 't');
glyphMap.set(LEFT | LOWER | DOWNWARD, 'u');
glyphMap.set(LEFT | UPPER | UPWARD, 'v');
glyphMap.set(UPPER | RIGHT | DOWNWARD, 'w');
glyphMap.set(LOWER | LEFT | DOWNWARD | UPWARD, 'x');
glyphMap.set(LEFT | LOWER | UPPER | DOWNWARD, 'y');
glyphMap.set(LEFT | LOWER | RIGHT | DOWNWARD, 'z');

let windowShowing = false, showsWindow = true;
function hideWindow() {
    if (windowShowing) {
        ipcRenderer.send('hide-window');
        app.hide();
        windowShowing = false;
    }
}

function showWindow(overridesOption) {
    if (!windowShowing && (overridesOption || showsWindow)) {
        ipcRenderer.send('show-window');
        windowShowing = true;
    }
}

class Gesture {
    constructor(onlyOrthogonal) {
        this.onlyOrthogonal = onlyOrthogonal;

        this.movements = [];
        this.moveCount = 0;
    }

    registerMovement(x, y) {
        if (typeof this.position !== 'undefined') {
            if (this.moveCount > moveCycle) {
                const dx = x - this.position[0];
                const dy = y - this.position[1];
                const adx = Math.abs(dx);
                const ady = Math.abs(dy);
                const minDiff = Math.min(adx, ady);
                const maxDiff = Math.max(adx, ady);

                let movement;
                if (minDiff / maxDiff >= equalityThreshold && !this.onlyOrthogonal) {
                    if (dx > 0 && dy > 0) {
                        movement = ['RIGHT-DOWN', maxDiff];
                    } else if (dx < 0 && dy > 0) {
                        movement = ['LEFT-DOWN', maxDiff];
                    } else if (dx < 0 && dy < 0) {
                        movement = ['LEFT-UP', maxDiff];
                    } else if (dx > 0 && dy < 0) {
                        movement = ['RIGHT-UP', maxDiff];
                    }
                } else {
                    if (adx === maxDiff) {
                        if (dx < 0) {
                            movement = ['LEFT', dx];
                        } else {
                            movement = ['RIGHT', dx];
                        }
                    } else {
                        if (dy < 0) {
                            movement = ['UP', dy];
                        } else {
                            movement = ['DOWN', dy];
                        }
                    }
                }

                this.movements.push(movement);
                this.moveCount = 0;
                this.position = [x, y];
            }
        } else {
            this.position = [x, y];
        }
        this.moveCount++;
    }

    addDuplicates(movements=this.movements) {
        for (let i = 1; i < movements.length; i++) {
            if (movements[i - 1][0] === movements[i][0]) {
                movements.splice(i - 1, 2, [
                    movements[i][0],
                    movements[i - 1][1] + movements[i][1]
                ]);
                return this.addDuplicates(movements);
            }
        }
        return movements;
    }

    cleanMovements(movements=this.movements) {
        this.maxDiff = Math.max(...movements.map(m => Math.abs(m[1])));
        const filteredMovements = movements.filter(m => Math.abs(m[1]) / this.maxDiff > diffThreshold);

        if (JSON.stringify(filteredMovements) !== JSON.stringify(movements)) {
            movements = filteredMovements;

            this.addDuplicates(movements);
            return this.cleanMovements(movements);
        }

        return movements;
    }

    getCombination(markDiacritics, movements=this.movements) {
        let combination = [];
        movements.forEach(movement => {
            if (Math.abs(movement[1]) / this.maxDiff < diacriticThreshold && markDiacritics) {
                movement[0] += 'd';
            }
            combination.push(movement[0]);
        });
        return combination;
    }

    getGlyph() {
        const combination = this.getCombination(true);

        let shape = 0;

        let x = 0;
        let y = 0;

        for (const [i, movement] of combination.entries()) {
            if (movement === 'UP' || movement === 'DOWN') {
                const bias = movement === 'UP' ? -1 : 1;
                if (Math.abs(y + bias) > 1) break;

                if (x > 0 || combination[i + 1] && combination[i + 1].includes('LEFT') || combination[i + 1] === 'RIGHTd') {
                    shape |= RIGHT;
                } else {
                    shape |= LEFT;
                }

                y = bias;
            } else if (movement === 'LEFT' || movement === 'RIGHT') {
                const bias = movement === 'LEFT' ? -1 : 1;
                if (Math.abs(x + bias) > 1) break;

                if (y > 0 || combination[i + 1] && combination[i + 1].includes('UP') || combination[i + 1] === 'DOWNd') {
                    shape |= LOWER;
                } else {
                    shape |= UPPER;
                }

                x = bias;
            } else if (movement === 'LEFT-UP' || movement === 'LEFT-DOWN') {
                const bias = movement === 'LEFT-UP' ? -1 : 1;
                if (Math.abs(y + bias) > 1 || x < 0) break;

                if (bias === -1) {
                    shape |= DOWNWARD;
                } else {
                    shape |= UPWARD;
                }

                x = -1;
                y = bias;
            } else if (movement === 'RIGHT-UP' || movement === 'RIGHT-DOWN') {
                const bias = movement === 'RIGHT-UP' ? -1 : 1;
                if (Math.abs(y + bias) > 1 || x > 0) break;

                if (bias === -1) {
                    shape |= UPWARD;
                } else {
                    shape |= DOWNWARD;
                }

                x = 1;
                y = bias;
            }
        }

        return shape;
    }

    static getMovementDirection(movement) {
        switch(movement) {
            case 'UP':
                return [0, -1];
            case 'DOWN':
                return [0, 1];
            case 'LEFT':
                return [-1, 0];
            case 'RIGHT':
                return [1, 0];
            case 'LEFT-UP':
                return [-1, -1];
            case 'RIGHT-UP':
                return [1, -1];
            case 'RIGHT-DOWN':
                return [1, 1];
            case 'LEFT-DOWN':
                return [-1, 1]
        }
    }

    static renderCombination(combination, x1, y1, x2, y2, ctx) {
        if (combination.join('+') === this._lastRendered) return;

        ctx.lineWidth = 6;
        ctx.clearRect(0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight);

        const xCenter = (x1 + x2) / 2;
        const yCenter = (y1 + y2) / 2;

        const xs = [0];
        const ys = [0];

        let x = 0;
        let y = 0;

        combination.forEach(movement => {
            const movementDirection = Gesture.getMovementDirection(movement);
            x += movementDirection[0];
            y += movementDirection[1];
            
            xs.push(x);
            ys.push(y);
        });

        const xMax = Math.max(...xs);
        const xMin = Math.min(...xs);
        const xMed = (xMax + xMin) / 2;

        const yMax = Math.max(...ys);
        const yMin = Math.min(...ys);
        const yMed = (yMax + yMin) / 2;

        const lineLength = Math.min(x2 - x1, y2 - y1) / Math.max(
            xMax - xMin,
            yMax - yMin
        );

        ctx.beginPath();
        for (let i = 0; i < xs.length; i++) {
            xs[i] = (xs[i] - xMed) * lineLength + xCenter;
            ys[i] = (ys[i] - yMed) * lineLength + yCenter;

            ctx.lineTo(xs[i], ys[i]);
        }
        ctx.stroke();

        ctx.fillRect(xs[xs.length - 1] - 6, ys[ys.length - 1] - 6, 12, 12);

        this._lastRendered = combination.join('+');
    }

    static renderGlyphs(glyphSet, ctx) {
        ctx.lineWidth = 7;

        const width = ctx.canvas.clientWidth;
        const height = ctx.canvas.clientHeight;

        ctx.clearRect(0, 0, width, height);

        let glyphSize = height;
        glyphSize += Math.min((width - glyphSize * glyphSet.length) / glyphSet.length, 0);

        const border = glyphSize * .1;
        const glyphCenter = (glyphSize - border * 2) / 2;

        ctx.lineWidth = Math.ceil(ctx.lineWidth * glyphSize / Math.min(width, height));

        glyphSet.forEach((glyph, i) => {
            if (glyph & UPPER) {
                ctx.beginPath();
                ctx.moveTo(glyphSize * i + border, height / 2 - glyphCenter);
                ctx.lineTo(glyphSize * (i + 1) - border, height / 2 - glyphCenter);
                ctx.stroke();
            }

            if (glyph & LEFT) {
                ctx.beginPath();
                ctx.moveTo(glyphSize * i + border, height / 2 - glyphCenter);
                ctx.lineTo(glyphSize * i + border, height / 2 + glyphCenter);
                ctx.stroke();
            }

            if (glyph & LOWER) {
                ctx.beginPath();
                ctx.moveTo(glyphSize * i + border, height / 2 + glyphCenter);
                ctx.lineTo(glyphSize * (i + 1) - border, height / 2 + glyphCenter);
                ctx.stroke();
            }

            if (glyph & RIGHT) {
                ctx.beginPath();
                ctx.moveTo(glyphSize * (i + 1) - border, height / 2 - glyphCenter);
                ctx.lineTo(glyphSize * (i + 1) - border, height / 2 + glyphCenter);
                ctx.stroke();
            }

            if (glyph & UPWARD) {
                ctx.beginPath();
                ctx.moveTo(glyphSize * i + border, height / 2 + glyphCenter);
                ctx.lineTo(glyphSize * (i + 1) - border, height / 2 - glyphCenter);
                ctx.stroke();
            }

            if (glyph & DOWNWARD) {
                ctx.beginPath();
                ctx.moveTo(glyphSize * i + border, height / 2 - glyphCenter);
                ctx.lineTo(glyphSize * (i + 1) - border, height / 2 + glyphCenter);
                ctx.stroke();
            }
        });
    }
}

let shiftWindow = false, requiresControl = false, isScrollMovement = false;
let gesture, shiftWindowTimeout, glyphSet, scrollInterval;
let scrollSpeed = 1;

ioHook.on('mousemove', e => {
    if (typeof gesture !== 'undefined') {
        gesture.registerMovement(e.x, e.y);

        if (isScrollMovement) {
            let movements = JSON.parse(JSON.stringify(gesture.movements));
            movements = gesture.addDuplicates(movements);
            movements = gesture.cleanMovements(movements);
            movements = movements.filter(m => m[0] !== 'LEFT' && m[0] !== 'RIGHT');

            if (movements.length < 1) return;

            let totalMovement = movements.reduce((a, b) => a + (b === 'UP' ? 1 : -1) * b[1], 0);
            totalMovement = Math.min(Math.abs(totalMovement), maxScroll) * Math.sign(totalMovement);

            scrollVelocity = totalMovement * scrollSpeedFactor;

            if (!scrollInterval) {
                scrollInterval = setInterval(() => {
                    robot.scrollMouse(0, scrollVelocity);
                }, 10);
            }
        } else if (!glyphSet) {
            showWindow(false);

            let movements = JSON.parse(JSON.stringify(gesture.movements));
            movements = gesture.addDuplicates(movements);
            movements = gesture.cleanMovements(movements);

            const border = gestureCanvas.height * borderPerc;
            Gesture.renderCombination(
                gesture.getCombination(false, movements),
                gestureCanvas.width / 2 - gestureCanvas.height / 2 + border,
                border,
                gestureCanvas.width / 2 + gestureCanvas.height / 2 - border,
                gestureCanvas.height - border,
                ctx
            );
        }
    }
});

ioHook.on('keydown', e => {
    if (e.keycode === 56 && (!requiresControl || e.ctrlKey) || e.keycode === 3640) {
        gesture = new Gesture(!glyphSet);
    } else if (e.keycode === 14) {
        if (glyphSet && glyphSet.length > 0) {
            glyphSet.pop();
            Gesture.renderGlyphs(glyphSet, ctx);
        }
    } else if (e.ctrlKey) {
        gesture = new Gesture(true);
        isScrollMovement = true;
    }
});

ioHook.on('keyup', e => {
    if ((e.keycode === 56 || e.keycode === 3640) && gesture) {
        if (glyphSet) {
            gesture.addDuplicates();
            gesture.cleanMovements();

            const glyph = gesture.getGlyph();
            if (glyphMap.has(glyph)) {
                glyphSet.push(glyph);

                Gesture.renderGlyphs(glyphSet, ctx);
            }
        } else {
            gesture.addDuplicates();
            gesture.cleanMovements();

            const combination = gesture.getCombination(false).join('+');

            if (combination === settingsCombination) {
                spawn('open', ['-a', 'Sublime Text', settingsPath]);
            } else {
                const nameScript = spawn('osascript', [scriptPath]);
                nameScript.stdout.on('data', applicationName => {
                    const combinations = JSON.parse(fs.readFileSync(settingsPath));

                    applicationName = applicationName.toString().trim();

                    let sequence = combinations['general'][combination];
                    if (applicationName in combinations) {
                        if (combination in combinations[applicationName]) {
                            sequence = combinations[applicationName][combination];
                        }
                    }

                    if (sequence) {
                        const modifiers = sequence.slice(0, sequence.length - 1);
                        const key = sequence[sequence.length - 1];

                        robot.keyTap(key, modifiers);
                        modifiers.forEach(m => robot.keyToggle(m, 'up'));
                    }
                });
            }

            hideWindow();
            ctx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
        }

        gesture = undefined;
    } else if ((e.keycode === 42 || e.keycode === 54) && e.altKey) {
        if (shiftWindow) {
            shiftWindow = false;
            clearTimeout(shiftWindowTimeout);

            if (glyphSet) {
                glyphSet = undefined;

                hideWindow();
                ctx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
            } else {
                glyphSet = [];

                showWindow(true);
            }
        } else {
            shiftWindow = true;
            shiftWindowTimeout = setTimeout(() => {
                shiftWindow = false;
            }, 500);
        }
    } else if (e.keycode === 28 && glyphSet) {
        const command = glyphSet.map(g => glyphMap.get(g)).join('');

        if (command === 'settings') {
            spawn('open', ['-a', 'Sublime Text', settingsPath]);
        } else if (command === 'quit') {
            app.quit();
        } else if (command === 'toggle') {
            requiresControl = !requiresControl;
        } else if (command === 'window') {
            showsWindow = !showsWindow;
        }

        hideWindow();
        ctx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);

        glyphSet = undefined;
    } else if (e.ctrlKey) {
        isScrollMovement = false;

        clearInterval(scrollInterval);
        scrollInterval = null;
        gesture = undefined;
    }
});
ioHook.start();
