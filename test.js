import * as gameboy from './lib/index.js';
import { pallet } from './testsongs/pallet.js';
import { success } from './testsongs/success.js';

// gameboy.changeUserVolume(0.5);

gameboy.play(success)

function mousedown() {
	gameboy.resume();
	gameboy.play((sq1, sq2, wav, noise, wait) => [
		sq1({ freq: gameboy.C4, sweepFactor: -2, fade: 1, duty: 2 }),
		wait(0.3),
	])
	gameboy.pulse1
}
window.addEventListener('mousedown', mousedown);
window.addEventListener('touchstart', mousedown);
