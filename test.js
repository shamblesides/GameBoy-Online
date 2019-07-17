import * as gameboy from './lib/index.js';
// import { pkmn } from './testsongs/pkmn.js';
import { success } from './testsongs/success.js';
import * as notes from './lib/notes.js';

// gameboy.changeUserVolume(0.5);

setTimeout(() => success(), 1500);
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

const ctx = new AudioContext();

function pulse() {
	const gainNode = ctx.createGain();
	gainNode.gain.setValueAtTime(0, ctx.currentTime);

	const panNode = ctx.createStereoPanner();

	gainNode.connect(panNode);
	panNode.connect(ctx.destination);

	const waves = [1/8, 1/4, 1/2]
		.map(duty => {
			return ctx.createPeriodicWave(
				Array(200).fill().map((_,n)=> n === 0 ? 0 : 1/n*Math.sin(Math.PI*n*duty)),
				Array(200).fill(0)
			)
		})

	/** @type{OscillatorNode} */
	let oscillator = null;
	let t = ctx.currentTime;
	return {
		play({ freq=notes.C3, volume=15, fade=1, duty=2, left=true, right=true }) {
			if (!left && !right) {
				volume = 0;
				fade = 0;
			}
			// time 
			if (t < ctx.currentTime) t = ctx.currentTime;
			// duty
			if (oscillator != null) {
				oscillator.stop(t);
			}
			oscillator = ctx.createOscillator();
			oscillator.connect(gainNode);
			oscillator.setPeriodicWave(waves[duty]);
			oscillator.start(t);
			// freq
			oscillator.frequency.setValueAtTime(0x20000 / (2048-freq), t);
			// volume + envelope
			gainNode.gain.cancelAndHoldAtTime(t);
			let t1 = t;
			do {
				gainNode.gain.setValueAtTime(volume/128, t1);
				t1 += (1/64)*fade;
				volume -= Math.sign(fade);
			} while (volume >= 0 && volume <= 15 && fade !== 0)
			// pan
			panNode.pan.setValueAtTime((left?-1:0)+(right?1:0), t);
		},
		wait(n) {
			t += n;
		},
	};
}

const p1 = pulse();
const p2 = pulse();

p1.play({ freq: notes.C5, duty: 2, left: false });
p1.wait(3/16);
p1.play({ freq: notes.E5, duty: 2 });
p1.wait(2/16);
p1.play({ freq: notes.G5, duty: 2, right: false });
p1.wait(3/16);
p1.play({ freq: notes.C5, duty: 2 });
p1.wait(2/16);
p1.play({ freq: notes.E5, duty: 2, left: false });
p1.wait(3/16);
p1.play({ freq: notes.G5, duty: 2 });

p2.play({ freq: notes.C5+10, duty: 1, volume: 9 });
p2.wait(3/16);
p2.play({ freq: notes.E5+10, duty: 1, volume: 9 });
p2.wait(2/16);
p2.play({ freq: notes.G5+10, duty: 1, volume: 9 });
p2.wait(3/16);
p2.play({ freq: notes.C5+10, duty: 1, volume: 9 });
p2.wait(2/16);
p2.play({ freq: notes.E5+10, duty: 1, volume: 9 });
p2.wait(3/16);
p2.play({ freq: notes.G5+10, duty: 1, volume: 9 });

// setTimeout(() => {
// 	gameboy.play(0, [{ freq: notes.A4, volume: 7, fade: 1, duty: 2 }, 0x400000, { freq: notes.A5, volume: 7, fade: 1, duty: 2 }])
// }, 200)