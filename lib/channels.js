import { C3 } from "./notes";

const ctx = new AudioContext();

function baseChannel() {
	const gainNode = ctx.createGain();
	gainNode.gain.setValueAtTime(0, ctx.currentTime);

	const panNode = ctx.createStereoPanner();

	gainNode.connect(panNode);
	panNode.connect(ctx.destination);

	/** @type{AudioBufferSourceNode} */
	let currentSourceNode = null;
	let t = Math.ceil(ctx.currentTime*100)/100;
	return {
		play({ buffer, rate, trigger=true, length=Infinity, volume=15, fade=0, left=true, right=true }) {
			if (!left && !right) {
				volume = 0;
				fade = 0;
			}
			// time 
			if (t < ctx.currentTime) t = Math.ceil(ctx.currentTime*100)/100;
			// disconnect old source
			if (currentSourceNode != null) {
				currentSourceNode.stop(t);
			}
			// connect new source
			const sourceNode = ctx.createBufferSource();
			sourceNode.buffer = buffer;
			sourceNode.playbackRate.setValueAtTime(rate, ctx.currentTime)
			sourceNode.loop = true;
			sourceNode.connect(gainNode);
			sourceNode.start(t);
			currentSourceNode = sourceNode;
			// volume + envelope + length
			if (trigger) {
				const cutoff = t + (1/256)*length;
				gainNode.gain.cancelScheduledValues(t);
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

const pulseWaves = [
	'00000001',
	'10000001',
	'10000111',
	'01111110',
].map(str => {
	const samples = str.split('').map(n => +n ? 1:-1);
	const upsample = 16;
	const buf = ctx.createBuffer(1, samples.length*upsample, 0x1000*upsample);
	const chan = buf.getChannelData(0);
	for (let i = 0; i < chan.length; ++i) {
		chan[i] = samples[i/upsample|0];
	}
	return buf;
});

export function pulse() {
	const ch = baseChannel();

	return {
		play({ duty=2, freq=C3, trigger, length, volume, fade, left, right }) {
			const buffer = pulseWaves[duty];
			const rate = 256 / (2048-freq);

			ch.play({ buffer, rate, trigger, length, volume, fade, left, right });
		},
		wait: ch.wait,
	}
}

const defaultPCM = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0];

export function wave() {
	function samplesToBuffer(samples) {
		const upsample = 4;
		const buf = ctx.createBuffer(1, samples.length*upsample, 0x2000*upsample);
		const chan = buf.getChannelData(0);
		for (let i = 0; i < chan.length; ++i) {
			chan[i] = samples[i/upsample|0]/15*2-1;
		}
		return buf;
	}

	const ch = baseChannel();

	let lastSamples, cachedBuffer;
	return {
		play({ samples=defaultPCM, freq=C3, trigger, length, left, right }) {
			const buffer = (lastSamples && samples.join() === lastSamples) ?
				cachedBuffer :
				samplesToBuffer(samples);
			const rate = 256 / (2048-freq);

			lastSamples = samples.join();
			cachedBuffer = buffer;

			ch.play({ buffer, rate, trigger, length, left, right });
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

const upsampleAmounts = [1/8, 1/2, 2, 8, 32, 128];
const resampledNoiseWaves = upsampleAmounts.map(upsample => {
	const noiseWaves = noiseTables.map(samples => {
		const buf = ctx.createBuffer(1, samples.length*upsample, 0x10000);
		const chan = buf.getChannelData(0);
		for (let i = 0; i < chan.length; ++i) {
			const start = Math.floor(i/upsample);
			const end = Math.ceil((i+1)/upsample);
			const m = 1/(end-start);
			samples.slice(start, end).forEach(n => chan[i] += n*m);
		}
		return buf;
	});
	return noiseWaves;
});

export function noise() {
	const ch = baseChannel();

	return {
		play({ buzzy=false, freq=3<<7, trigger, length, volume, fade, left, right }) {
			const cats = upsampleAmounts.map(n=>256*n);
			cats[cats.length-1]=Infinity;
			const resampleCategory = cats.findIndex(c => freq < c);
			const buffer = resampledNoiseWaves[resampleCategory][+buzzy];
			const rate = 0x40 / freq * upsampleAmounts[resampleCategory];
			ch.play({ buffer, rate, trigger, length, volume, fade, left, right })
		},
		wait: ch.wait,
	}
}
