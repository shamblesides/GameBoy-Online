// import { tracks } from './testsongs/success.js';
import { tracks } from './testsongs/pkmn.js';
import { pulse, wave, noise, now, allow, changeUserVolume } from './lib/channels.js';
import { C4 } from './lib/notes.js';

const channels = [
    pulse(), pulse(), wave(), noise()
].map(ch => {
    return function play(track, t0=now()) {
        let t = t0;
        let loopTrack = null;
        for (const x of track) {
            if (x === 'LOOPSTART') {
                loopTrack = track.slice(track.indexOf('LOOPSTART'));
            } else if (typeof x === 'number') {
                t += x/0x3C8000;
            } else {
                ch({ ...x, time:t });
            }
        }
        if (loopTrack) {
            const wait = (t - now()) * 1000 * 0.95;
            setTimeout(() => play(loopTrack, t), wait);
        }
    }
});

function playAll(tracks, t0=now()) {
    channels.forEach((ch, n) => ch(tracks[n], t0));
}

changeUserVolume(1);

playAll(tracks);

const bumpTrack = [{ freq: C4, sweepFactor: -2, fade: 1, duty: 2 }, 0x200000];
let stopHandle = null;
function mousedown() {
	allow();
	if (stopHandle) {
        clearInterval(stopHandle);
		stopHandle = null;
	} else {
        stopHandle = setInterval(() => channels[0](bumpTrack), 333);
	}
}

window.addEventListener('mousedown', mousedown);
window.addEventListener('touchstart', mousedown);
