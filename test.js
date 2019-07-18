// import * as gameboy from './lib/index.js';
// import { pkmn } from './testsongs/pkmn.js';
import { success } from './testsongs/success.js';
import * as notes from './lib/notes.js';
import ft from 'fourier-transform';

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

function baseChannel() {
	const gainNode = ctx.createGain();
	gainNode.gain.setValueAtTime(0, ctx.currentTime);

	const panNode = ctx.createStereoPanner();

	gainNode.connect(panNode);
	panNode.connect(ctx.destination);

	/** @type{OscillatorNode} */
	let oscillator = null;
	let t = ctx.currentTime;
	return {
		play({ wave, freq=notes.C3, trigger=true, length=Infinity, volume=15, fade=0, left=true, right=true }) {
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
			oscillator.setPeriodicWave(wave);
			oscillator.start(t);
			// freq
			oscillator.frequency.setValueAtTime(0x20000 / (2048-freq), t);
			// volume + envelope + length
			if (trigger) {
				const cutoff = t + (1/256)*length;
				gainNode.gain.cancelAndHoldAtTime(t);
				let t1 = t;
				while (volume >= 0 && volume <= 15 && t1 < cutoff) {
					gainNode.gain.setValueAtTime(volume/90, t1);
					if (fade === 0) break;
					t1 += (1/64)*fade;
					volume -= Math.sign(fade);
				} 
				if (cutoff < Infinity) {
					gainNode.gain.setValueAtTime(0, cutoff);
				}
			}
			// pan
			panNode.pan.setValueAtTime((left?-1:0)+(right?1:0), t);
		},
		wait(n) {
			t += n;
		},
	};
}

const pulseWaves = [1/8, 1/4, 1/2]
	.map(duty => Array(200).fill().map((_,n)=> n === 0 ? 0 : 1/n*Math.sin(Math.PI*n*duty)))
	.map(f => ctx.createPeriodicWave(f, Array(f.length).fill(0)))

function pulse() {
	const ch = baseChannel();

	return {
		play({ duty=2, freq, trigger, length, volume, fade, left, right }) {
			ch.play({ wave: pulseWaves[duty], freq, trigger, length, volume, fade, left, right });
		},
		wait: ch.wait,
	}
}

const defaultPCM = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0];

function wav() {
	function samplesToPeriodicWave(samples) {
		const spectrum = ft(
			samples
				.map(n => Array(8).fill(n))
				.reduce((arr, x)=> arr.concat(x))
		);
		return ctx.createPeriodicWave(spectrum, Array(spectrum.length).fill(0));
	}

	const ch = baseChannel();

	let lastSamples, cachedWave;
	return {
		play({ samples=defaultPCM, freq, trigger, length, left, right }) {
			const wave = (lastSamples && samples.join() === lastSamples) ?
				cachedWave :
				samplesToPeriodicWave(samples);

			lastSamples = samples.join();
			cachedWave = wave;

			ch.play({ wave, freq, trigger, length, left, right });
		},
		wait: ch.wait,
	}
}

const p1 = pulse();
const p2 = pulse();
const wv = wav();


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

p1.play({ freq: notes.C5, fade: 1, duty: 2, left: false });
p1.wait(3/16);
p1.play({ freq: notes.E5, fade: 1, duty: 2 });
p1.wait(2/16);
p1.play({ freq: notes.G5, fade: 1, duty: 2, right: false });
p1.wait(3/16);
p1.play({ freq: notes.C5, fade: 1, duty: 2 });
p1.wait(2/16);
p1.play({ freq: notes.E5, fade: 1, duty: 2, left: false });
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
wv.play({ freq: notes.C4, length: 32, samples });
wv.wait(3/16);
wv.play({ freq: notes.E4, length: 32, samples });
wv.wait(2/16);
wv.play({ freq: notes.G4, length: 32, samples });
wv.wait(3/16);
wv.play({ freq: notes.C4, length: 32, samples });
wv.wait(2/16);
wv.play({ freq: notes.E4, length: 32, samples });
wv.wait(3/16);
wv.play({ freq: notes.G4, length: 32, samples });

// setTimeout(() => {
// 	gameboy.play(0, [{ freq: notes.A4, volume: 7, fade: 1, duty: 2 }, 0x400000, { freq: notes.A5, volume: 7, fade: 1, duty: 2 }])
// }, 200)