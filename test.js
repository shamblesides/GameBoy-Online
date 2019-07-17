import * as gameboy from './lib/index.js';
// import { pkmn } from './testsongs/pkmn.js';
// import { success } from './testsongs/success.js';
import * as notes from './lib/notes.js';

// gameboy.changeUserVolume(0.5);

// success();
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
	const oscillator = ctx.createOscillator();
	const gainNode = ctx.createGain();
	oscillator.connect(gainNode);
	gainNode.connect(ctx.destination);

	const duty = [1/8, 1/4, 1/2]
		.map(duty => {
			return ctx.createPeriodicWave(
				Array(200).fill().map((_,n)=> n === 0 ? 0 : 1/n*Math.sin(Math.PI*n*duty)),
				Array(200).fill(0)
			)
		});
	oscillator.setPeriodicWave(duty[2]);
	oscillator.start();
	gainNode.gain.setValueAtTime(0, ctx.currentTime);

	let t = ctx.currentTime;
	return {
		play({ freq=notes.C3, volume=7, fade=1 }) {
			// time 
			if (t < ctx.currentTime) t = ctx.currentTime;
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
		},
		wait(n) {
			t += n;
		},
	};
}

const p1 = pulse();

p1.play({ freq: notes.A4 });
p1.wait(1);
p1.play({ freq: notes.A5 });

setTimeout(() => {
	gameboy.play(0, [{ freq: notes.A4, volume: 7, fade: 1, duty: 2 }, 0x400000, { freq: notes.A5, volume: 7, fade: 1, duty: 2 }])
}, 200)