import * as gameboy from './lib/index.js';
import { pallet } from './testsongs/pallet.js';
import { success } from './testsongs/success.js';

// gameboy.changeUserVolume(0.5);

gameboy.play(pallet)

function mousedown() {
	gameboy.resume();
	gameboy.pulse1({ freq: gameboy.C4, sweepFactor: -2, fade: 1, duty: 2 })
}
window.addEventListener('mousedown', mousedown);
window.addEventListener('touchstart', mousedown);
