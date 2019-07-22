// import { tracks } from './testsongs/success.js';
import { tracks } from './testsongs/pkmn.js';
import { play, playAll, allow, changeUserVolume } from './lib/channels.js';
import { C4 } from './lib/notes.js';

changeUserVolume(1);

playAll(tracks);

const bumpTrack = [{ freq: C4, sweepFactor: -2, fade: 1, duty: 2 }, 0.5];
let stopHandle = null;
function mousedown() {
	allow();
	if (stopHandle) {
        clearInterval(stopHandle);
		stopHandle = null;
	} else {
        stopHandle = setInterval(() => play(0, bumpTrack), 350);
	}
}

window.addEventListener('mousedown', mousedown);
window.addEventListener('touchstart', mousedown);
