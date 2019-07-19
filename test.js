// import * as gameboy from './lib/index.js';
// import { pkmn } from './testsongs/pkmn.js';
// import { success } from './testsongs/success.js';
import * as notes from './lib/notes.js';
import { pulse, wave, noise } from './lib/channels.js';

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
// window.addEventListener('mousedown', mousedown);
// window.addEventListener('touchstart', mousedown);

const p1 = pulse();
const p2 = pulse();
const wv = wave();
const ns = noise();

// const freqs = [3,5,8].map(o => notes['C'+o]);
// const instr4 = { volume: 7, fade: 2, length: 64 };
// for (const freq of freqs) {
//     wv.play({ freq, ...instr4 });
//     wv.wait(16/16);
// }

// gameboy.play(2, [
//     0x200000,
//     ...freqs.map(freq => [{ freq, ...instr4 }, 0x400000]).reduce((arr,x)=>arr.concat(x))
// ]);


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

p1.play({ freq: notes.C5, fade: 1, duty: 2 });
p1.wait(3/16);
p1.play({ freq: notes.E5, fade: 1, duty: 2 });
p1.wait(2/16);
p1.play({ freq: notes.G5, fade: 1, duty: 2 });
p1.wait(3/16);
p1.play({ freq: notes.C5, fade: 1, duty: 2 });
p1.wait(2/16);
p1.play({ freq: notes.E5, fade: 1, duty: 2 });
p1.wait(3/16);
p1.play({ freq: notes.G5, fade: 1, duty: 2 });

p2.play({ freq: notes.C5+10, fade: 1, duty: 1, volume: 9 });
p2.wait(3/16);
p2.play({ freq: notes.E5+10, fade: 1, duty: 1, volume: 9 });
p2.wait(2/16);
p2.play({ freq: notes.G5+10, fade: 1, duty: 1, volume: 9 });
p2.wait(3/16);
p2.play({ freq: notes.C5+10, fade: 1, duty: 1, volume: 9 });
p2.wait(2/16);
p2.play({ freq: notes.E5+10, fade: 1, duty: 1, volume: 9 });
p2.wait(3/16);
p2.play({ freq: notes.G5+10, fade: 1, duty: 1, volume: 9 });

const samples = '02468ACEFFFEEDDCCBA9876544332211'.split('').map(d => parseInt(d, 16));
wv.play({ freq: notes.C5, length: 32, samples });
wv.wait(3/16);
wv.play({ freq: notes.E5, length: 32, samples });
wv.wait(2/16);
wv.play({ freq: notes.G5, length: 32, samples });
wv.wait(3/16);
wv.play({ freq: notes.C5, length: 32, samples });
wv.wait(2/16);
wv.play({ freq: notes.E5, length: 32, samples });
wv.wait(3/16);
wv.play({ freq: notes.G5, length: 32, samples });

const instr4 = { volume: 7, fade: 1, buzzy: true };
ns.play({ ...instr4 });
ns.wait(3/16);
ns.play({ ...instr4 });
ns.wait(2/16);
ns.play({ ...instr4 });
ns.wait(3/16);
ns.play({ ...instr4 });
ns.wait(2/16);
ns.play({ ...instr4 });
ns.wait(3/16);
ns.play({ ...instr4 });

// setTimeout(() => {
// 	gameboy.play(0, [{ freq: notes.A4, volume: 7, fade: 1, duty: 2 }, 0x400000, { freq: notes.A5, volume: 7, fade: 1, duty: 2 }])
// }, 200)