import * as gameboy from './lib/index.js';
import { pkmn } from './testsongs/pkmn.js';
import { success } from './testsongs/success.js';

// gameboy.changeUserVolume(0.5);

/**
 * ```
 * core.js0519 0519
 * core.js:40 059f 059f
 * 2core.js:40 02b8 02b8
 * core.js:40 015c 015c
 * core.js:40 04ae 04ae
 * core.js:40 04aa 04aa
 * core.js:40 02b8 02b8
 * core.js:40 04c2 04c2
 * core.js:40 06b4 06b4
 * core.js:40 0334 0334
 * core.js:40 0000 0000
 * core.js:40 0fa2 0fa2
 * core.js:40 087f 087f
 * core.js:40 07c9 07c9
 * core.js:40 08d6 08d6
 * core.js:40 06cc 06cc
 * core.js:40 03e4 03e4
 * core.js:40 020a 020a
 * core.js:40 015c 015c
 * core.js:40 092d 092d
 * core.js:40 0828 0828
 * core.js:40 0105 0105
 * core.js:40 0000 0000
 * core.js:40 00ae 00ae
 * core.js:40 0000 0000
 * ```
 */
success();
// pkmn();

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
