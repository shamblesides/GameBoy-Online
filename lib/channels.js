import { C3 } from "./notes";

const ctx = new AudioContext();

export function allow() {
	return ctx.resume();
}

// user volume control
const globalVolumeNode = ctx.createGain();
let lastVolume = 1;
globalVolumeNode.gain.setValueAtTime(lastVolume, ctx.currentTime)
export function changeUserVolume(newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		globalVolumeNode.gain.setValueAtTime(lastVolume, ctx.currentTime)
		globalVolumeNode.gain.linearRampToValueAtTime(newVolume, ctx.currentTime + 0.001)
		lastVolume = newVolume;
	}
}

// filters to make it sound nicer?
const less = ctx.createGain();
less.gain.setValueAtTime(.5, ctx.currentTime);
const biquadFilter = ctx.createBiquadFilter();
biquadFilter.type = "lowshelf";
biquadFilter.frequency.setValueAtTime(3000, ctx.currentTime);
biquadFilter.gain.setValueAtTime(12, ctx.currentTime);

// connect it all together
globalVolumeNode.connect(less);
less.connect(biquadFilter);
biquadFilter.connect(ctx.destination);

function baseChannel(ctx) {
	const gainNode = ctx.createGain();
	gainNode.gain.setValueAtTime(0, ctx.currentTime);

	const panNode = ctx.createStereoPanner();

	gainNode.connect(panNode);
	panNode.connect(ctx.destination);

	/** @type{AudioBufferSourceNode} */
	let currentSourceNode = null;
	return function play({ buffer, rate, rateChanges=[], trigger=true, length=Infinity, volume=15, fade=0, left=true, right=true, time=0 }) {
		if (!left && !right) {
			volume = 0;
			fade = 0;
		}
		// disconnect old source
		if (currentSourceNode != null) {
			currentSourceNode.stop(time);
		}
		// connect new source
		const sourceNode = ctx.createBufferSource();
		sourceNode.buffer = buffer;
		sourceNode.playbackRate.setValueAtTime(rate, ctx.currentTime)
		sourceNode.loop = true;
		sourceNode.connect(gainNode);
		sourceNode.start(time);
		currentSourceNode = sourceNode;
		// volume + envelope + length
		if (trigger) {
			const cutoff = time + (1/256)*length;
			gainNode.gain.cancelScheduledValues(time);
			let t1 = time;
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
		// rate changes
		rateChanges.forEach(({ rate, time }) => {
			if (rate == null) {
				gainNode.gain.cancelScheduledValues(time);
				gainNode.gain.setValueAtTime(0, time);
			}
			else sourceNode.playbackRate.setValueAtTime(rate, time)
		});
		// pan
		panNode.pan.setValueAtTime((left?-1:0)+(right?1:0), time);
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

function pulse(ctx) {
	const ch = baseChannel(ctx);

	return function ({ duty=2, sweepFactor=0, sweepPeriod=7, freq=C3, trigger, length, volume, fade, left, right, time }) {
		const buffer = pulseWaves[duty];
		const rate = 256 / (2048-freq);

		const rateChanges = [];
		if (sweepFactor !== 0) {
			let shadowFreq = freq;
			let t1 = time;
			while (true) {
				t1 += (sweepPeriod/128);

				if (sweepFactor < 0) {
					const lastShadowFreq = shadowFreq;
					shadowFreq -= shadowFreq >> Math.abs(sweepFactor);
					if (shadowFreq === lastShadowFreq) break;
				} else {
					shadowFreq += shadowFreq >> Math.abs(sweepFactor);
					if (shadowFreq + (shadowFreq>>Math.abs(sweepFactor)) >= 2048) {
						rateChanges.push({ time: t1, rate: null });
						break;
					}
				}

				const rate = 256 / (2048-shadowFreq);
				rateChanges.push({ time: t1, rate });
			}
		}

		ch({ buffer, rate, rateChanges, trigger, length, volume, fade, left, right, time });
	};
}

const defaultPCM = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0];

function samplesToBuffer(samples) {
	const upsample = 4;
	const buf = ctx.createBuffer(1, samples.length*upsample, 0x2000*upsample);
	const chan = buf.getChannelData(0);
	for (let i = 0; i < chan.length; ++i) {
		chan[i] = samples[i/upsample|0]/15*2-1;
	}
	return buf;
}

function wave(ctx) {
	const ch = baseChannel(ctx);

	let lastSamples, cachedBuffer;
	return function ({ samples=defaultPCM, freq=C3, trigger, length, left, right, time }) {
		const buffer = (lastSamples && samples.join() === lastSamples) ?
			cachedBuffer :
			samplesToBuffer(samples);
		const rate = 256 / (2048-freq);

		lastSamples = samples.join();
		cachedBuffer = buffer;

		ch({ buffer, rate, trigger, length, left, right, time });
	};
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

function noise(ctx) {
	const ch = baseChannel(ctx);

	return function ({ buzzy=false, freq=3<<7, trigger, length, volume, fade, left, right, time }) {
		const cats = upsampleAmounts.map(n=>256*n);
		cats[cats.length-1]=Infinity;
		const resampleCategory = cats.findIndex(c => freq < c);
		const buffer = resampledNoiseWaves[resampleCategory][+buzzy];
		const rate = 0x40 / freq * upsampleAmounts[resampleCategory];
		ch({ buffer, rate, trigger, length, volume, fade, left, right, time })
	};
}

const render = [
	pulse, pulse, wave, noise
].map(channel => {
	return function render(track) {
		const dur = track.filter(el => typeof el === 'number').reduce((a,b)=>a+b, 0);
		if (dur === 0) return Promise.resolve(null);

		const offlineCtx = new OfflineAudioContext(2, dur*0x10000, 0x10000)
		const ch = channel(offlineCtx);
		let t = 0;
		let loopStart = null;
		for (const x of track) {
			if (x === 'LOOPSTART') {
				loopStart = t;
			} else if (typeof x === 'number') {
				t += x;
			} else {
				ch({ ...x, time:t });
			}
		}
		return offlineCtx.startRendering().then(buffer => {
			const node = ctx.createBufferSource();
			node.buffer = buffer;
			if (loopStart != null) {
				node.loop = true;
				node.loopStart = loopStart;
			}
			return node;
		});
	}
});

export function play(n, track, t0=ctx.currentTime) {
	render[n](track).then(node => {
		node.connect(globalVolumeNode);
		node.start(t0);
	});
}

export function playAll(tracks, t0=ctx.currentTime) {
	Promise.all(render.map((ch, n) => ch(tracks[n]))).then(nodes => {
		nodes.forEach(node => {
			if (node == null) return;
			node.connect(globalVolumeNode);
			node.start(t0);
		})
	});
}
