// import * as gameboy from './lib/index.js';
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

function baseChannel() {
	const gainNode = ctx.createGain();
	gainNode.gain.setValueAtTime(0, ctx.currentTime);

	const panNode = ctx.createStereoPanner();

	gainNode.connect(panNode);
	panNode.connect(ctx.destination);

	/** @type{AudioScheduledSourceNode} */
	let lastSourceNode = null;
	let t = ctx.currentTime;
	return {
		play({ sourceNode, trigger=true, length=Infinity, volume=15, fade=0, left=true, right=true }) {
			if (!left && !right) {
				volume = 0;
				fade = 0;
			}
			// time 
			if (t < ctx.currentTime) t = ctx.currentTime;
			// disconnect old source
			if (lastSourceNode != null) {
				lastSourceNode.stop(t);
			}
			// connect new source
			sourceNode.connect(gainNode);
			sourceNode.start(t);
			lastSourceNode = sourceNode;
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

function oscillatorChannel() {
	const ch = baseChannel();

	return {
		play({ wave, freq=notes.C3, trigger, length, volume, fade, left, right }) {
			const sourceNode = ctx.createOscillator();
			sourceNode.setPeriodicWave(wave);
			sourceNode.frequency.setValueAtTime(0x20000 / (2048-freq), ctx.currentTime);
			ch.play({ sourceNode, trigger, length, volume, fade, left, right });
		},
		wait: ch.wait,
	}
}

const pulseWaves = [1/8, 1/4, 1/2]
	.map(duty => Array(200).fill().map((_,n)=> n === 0 ? 0 : 1/n*Math.sin(Math.PI*n*duty)))
	.map(f => ctx.createPeriodicWave(f, Array(f.length).fill(0)))

function pulse() {
	const ch = oscillatorChannel();

	return {
		play({ duty=2, freq, trigger, length, volume, fade, left, right }) {
			ch.play({ wave: pulseWaves[duty], freq, trigger, length, volume, fade, left, right });
		},
		wait: ch.wait,
	}
}

const defaultPCM = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0];

function wav() {
	function samplesToBuffer(samples) {
		const upsample = 4;
		const buf = ctx.createBuffer(1, 32*upsample, 32*256*upsample);
		const chan = buf.getChannelData(0);
		for (let i = 0; i < chan.length; ++i) {
			chan[i] = samples[(i/upsample|0)%samples.length]/15*2-1;
		}
		return buf;
	}

	const ch = baseChannel();

	let lastSamples, cachedBuffer;
	return {
		play({ samples=defaultPCM, freq, trigger, length, left, right }) {
			const buf = (lastSamples && samples.join() === lastSamples) ?
				cachedBuffer :
				samplesToBuffer(samples);

			lastSamples = samples.join();
			cachedBuffer = buf;

			const sourceNode = ctx.createBufferSource();
			sourceNode.buffer = buf;
			freq = 0x20000 / (2048-freq) / 256;
			sourceNode.playbackRate.setValueAtTime(freq, ctx.currentTime)
			sourceNode.loop = true;

			ch.play({ sourceNode, trigger, length, left, right });
		},
		wait: ch.wait,
	}
}

const noiseTables = [[],[]];

for (let i = 0, lsfr=0x7FFF; i < 0x8000; ++i) {
	noiseTables[0][i] = (lsfr & 1) ? -1 : 1;
    lsfr = (lsfr>>1) | ((((lsfr>>1) ^ lsfr) & 0x1) << 14);
}

for (let i = 0, lsfr=0x7F; i < 0x80; ++i) {
	noiseTables[1][i] = (lsfr & 1) ? -1 : 1;
    lsfr = (lsfr>>1) | ((((lsfr>>1) ^ lsfr) & 0x1) << 6);
}

const noiseWaves = noiseTables.map(table => {
	const buf = ctx.createBuffer(1, 0x10000, 0x10000);
	const chan = buf.getChannelData(0);
	for (let i = 0; i < chan.length; ++i) {
		chan[i] = table[(i/2|0)%table.length]
	}
	return buf;
});

function noise() {
	const ch = baseChannel();

	return {
		play({ buzzy=false, trigger, length, volume, fade, left, right }) {
			const buf = noiseWaves[+buzzy];
			const sourceNode = ctx.createBufferSource();
			sourceNode.buffer = buf;
			sourceNode.playbackRate.setValueAtTime(.3333, ctx.currentTime)
			ch.play({ sourceNode, trigger, length, volume, fade, left, right })
		},
		wait: ch.wait,
	}
}

const p1 = pulse();
const p2 = pulse();
const wv = wav();
const ns = noise();


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

// ns.play({ volume: 7, fade: 1, buzzy: true });
// ns.wait(3/16);
// ns.play({ volume: 7, fade: 1, buzzy: true });
// ns.wait(2/16);
// ns.play({ volume: 7, fade: 1, buzzy: true });
// ns.wait(3/16);
// ns.play({ volume: 7, fade: 1, buzzy: true });
// ns.wait(2/16);
// ns.play({ volume: 7, fade: 1, buzzy: true });
// ns.wait(3/16);
// ns.play({ volume: 7, fade: 1, buzzy: true });

// setTimeout(() => {
// 	gameboy.play(0, [{ freq: notes.A4, volume: 7, fade: 1, duty: 2 }, 0x400000, { freq: notes.A5, volume: 7, fade: 1, duty: 2 }])
// }, 200)