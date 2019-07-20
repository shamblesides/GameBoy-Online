// import { tracks } from './testsongs/success.js';
import { tracks } from './testsongs/pkmn.js';
import { pulse, wave, noise, now, allow, changeUserVolume } from './lib/channels.js';

changeUserVolume(1);

// let stopHandle = null;
// function mousedown() {
// 	gameboy.resume();
// 	if (stopHandle) {
// 		stopHandle();
// 		stopHandle = null;
// 	} else {
// 		stopHandle = gameboy.play(0, [gameboy.loopStart, { freq: gameboy.C4, sweepFactor: -2, fade: 1, duty: 2 }, 0x140000])
// 	}
// }

window.addEventListener('mousedown', allow);
window.addEventListener('touchstart', allow);

const p1 = pulse();
const p2 = pulse();
const wv = wave();
const ns = noise();

// const chords = [-3, -6, 3, 6, 0].map(n => ({ sweepFactor: n }));
// const instr4 = { freq: notes.C5, volume: 7, fade: 3, length: 64, sweepPeriod: 3, duty: 1 };
// let time = now();
// for (const chord of chords) {
//     p1({ ...chord, ...instr4, time });
//     time += 1
// }

const t0 = now();
void [p1, p2, wv, ns].forEach((ch, n) => play(ch, tracks[n], t0));

function play(ch, track, t0) {
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
        if (ch === p1) console.log(wait);
        setTimeout(() => play(ch, loopTrack, t), wait);
    }
}
