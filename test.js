import * as gameboy from './lib/index.js';
import { pkmn } from './testsongs/pkmn.js';
import { success } from './testsongs/success.js';

// gameboy.changeUserVolume(0.5);

// success();
pkmn();

let stopHandle = null;
function mousedown() {
	gameboy.resume();
	if (stopHandle) {
		stopHandle();
		stopHandle = null;
	} else {
		stopHandle = gameboy.play(0, [gameboy.loopStart, { freq: gameboy.C4, sweepFactor: -2, fade: 1, duty: 2 }, 0x140000])
	}
}
window.addEventListener('mousedown', mousedown);
window.addEventListener('touchstart', mousedown);
