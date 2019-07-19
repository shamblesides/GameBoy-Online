import * as gameboy from './lib/index.js';
// import { pkmn } from './testsongs/pkmn.js';
// import { success } from './testsongs/success.js';
import * as notes from './lib/notes.js';
import { pulse, wave, noise, now, allow } from './lib/channels.js';
import { tracks } from './testsongs/pkmn.js';

// gameboy.changeUserVolume(0.5);

// setTimeout(() => success(), 1500);
// pkmn();

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

const chords = [-3, -6, 3, 6, 0].map(n => ({ sweepFactor: n }));
const instr4 = { freq: notes.C5, volume: 7, fade: 3, length: 64, sweepPeriod: 3, duty: 1 };
let time = now();
for (const chord of chords) {
    p1({ ...chord, ...instr4, time });
    time += 1
}

gameboy.play(0, [
    0x280000,
    ...chords.map(chord => [{ ...chord, ...instr4 }, 0x400000]).reduce((arr,x)=>arr.concat(x))
]);


// p1.play({ freq: notes.G5 })
// p1.wait(6/8);
// p1.play({ freq: notes.E5 })
// p1.wait(6/8);
// p1.play({ freq: notes.Fs5 })
// p1.wait(4/8);
// p1.play({ freq: notes.G5 })
// p1.wait(6/8);
// p1.play({ freq: notes.A5 })
// p1.wait(6/8);

// p1.play({ freq: notes.C5, fade: 1, duty: 2 });
// p1.wait(3/16);
// p1.play({ freq: notes.E5, fade: 1, duty: 2 });
// p1.wait(2/16);
// p1.play({ freq: notes.G5, fade: 1, duty: 2 });
// p1.wait(3/16);
// p1.play({ freq: notes.C5, fade: 1, duty: 2 });
// p1.wait(2/16);
// p1.play({ freq: notes.E5, fade: 1, duty: 2 });
// p1.wait(3/16);
// p1.play({ freq: notes.G5, fade: 1, duty: 2 });

// p2.play({ freq: notes.C5+10, fade: 1, duty: 1, volume: 9 });
// p2.wait(3/16);
// p2.play({ freq: notes.E5+10, fade: 1, duty: 1, volume: 9 });
// p2.wait(2/16);
// p2.play({ freq: notes.G5+10, fade: 1, duty: 1, volume: 9 });
// p2.wait(3/16);
// p2.play({ freq: notes.C5+10, fade: 1, duty: 1, volume: 9 });
// p2.wait(2/16);
// p2.play({ freq: notes.E5+10, fade: 1, duty: 1, volume: 9 });
// p2.wait(3/16);
// p2.play({ freq: notes.G5+10, fade: 1, duty: 1, volume: 9 });

// const samples = '02468ACEFFFEEDDCCBA9876544332211'.split('').map(d => parseInt(d, 16));
// wv.play({ freq: notes.C5, length: 32, samples });
// wv.wait(3/16);
// wv.play({ freq: notes.E5, length: 32, samples });
// wv.wait(2/16);
// wv.play({ freq: notes.G5, length: 32, samples });
// wv.wait(3/16);
// wv.play({ freq: notes.C5, length: 32, samples });
// wv.wait(2/16);
// wv.play({ freq: notes.E5, length: 32, samples });
// wv.wait(3/16);
// wv.play({ freq: notes.G5, length: 32, samples });

// const instr4 = { volume: 7, fade: 1, buzzy: true };
// ns.play({ ...instr4 });
// ns.wait(3/16);
// ns.play({ ...instr4 });
// ns.wait(2/16);
// ns.play({ ...instr4 });
// ns.wait(3/16);
// ns.play({ ...instr4 });
// ns.wait(2/16);
// ns.play({ ...instr4 });
// ns.wait(3/16);
// ns.play({ ...instr4 });

// const t0 = now();
// ;[p1, p2, wv].forEach((ch, n) => {
//     let t = t0;
//     for (const x of tracks[n]) {
//         if (typeof x === 'number') {
//             t += x/0x3C8000;
//         } else {
//             ch({ ...x, time:t });
//         }
//     }
// });

// setTimeout(() => {
// 	gameboy.play(0, [{ freq: notes.A4, volume: 7, fade: 1, duty: 2 }, 0x400000, { freq: notes.A5, volume: 7, fade: 1, duty: 2 }])
// }, 200)