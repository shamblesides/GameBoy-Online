window.AudioContext = window.AudioContext || window.webkitAudioContext;
window.OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;

// https://tc39.github.io/ecma262/#sec-%typedarray%.prototype.fill
if (!Float32Array.prototype.fill) {
  Float32Array.prototype.fill = Array.prototype.fill;
}

const ctx = new AudioContext();
export const audioContext = ctx;

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
globalVolumeNode.connect(ctx.destination);

export const audioNode = globalVolumeNode;

function baseChannel(/**@type{AudioContext}*/ctx, dest=ctx.destination) {
	const gainNode = ctx.createGain();
	gainNode.gain.setValueAtTime(0, ctx.currentTime);

	const leftGain = ctx.createGain();
	const rightGain = ctx.createGain();
	gainNode.connect(leftGain, 0);
	gainNode.connect(rightGain, 0);

	const merger = ctx.createChannelMerger(2);
	leftGain.connect(merger, 0, 0);
	rightGain.connect(merger, 0, 1);

	merger.connect(dest);

	/**
	 * Previous hz changes are tracked and applied retroactively
	 * to all future buffers played later on. This is to keep the
	 * waveforms in sync to prevent popping when a new note is
	 * played, making vibrato possible
	 */
	let prevHertzChanges = [];

	/** @type{AudioBufferSourceNode} */
	let currentSourceNode = null;

	/**
	 * TODO!!!
	 * two wrongs do make a right!
	 * the value passed in to "hertz" is not actually the hertz of the waveform!
	 * however, this function also calculates things wrong, in exactly the right way
	 * so it all still works...
	 * 
	 * when refactoring it to use the real hertz value (maybe?),
	 * make sure to test with vibrato to ensure that there's no popping
	 */
	return function play({ buffer, hertz, hertzChanges=[], trigger=true, length=Infinity, volume=15, fade=0, left=true, right=true, time=0 }) {
		// calculate playback rate(s)
		prevHertzChanges = prevHertzChanges.filter(x => x.time < time);
		prevHertzChanges.push({ time, hertz });
		// no left/right = no sound
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
		for (const x of prevHertzChanges) {
			const rate = buffer.sampleRate/buffer.length/x.hertz;
			sourceNode.playbackRate.setValueAtTime(rate, x.time);
		}
		sourceNode.loop = true;
		const prevWiggles = prevHertzChanges.reduce((sum, x, i, src) => {
			if (i === 0) return 0;
			return (sum + (x.time-src[i-1].time) * buffer.sampleRate/buffer.length/src[i-1].hertz);
			// TODO "real hertz" calculations
			// const realhertz = 1/(src[i-1].hertz * buffer.duration**2);
			// console.log('realh',realhertz)
			// return (sum + (x.time-src[i-1].time) * realhertz);
		}, 0);
		const offset = prevWiggles % buffer.duration
		// console.log(buffer.duration, offset);
		sourceNode.connect(gainNode);
		sourceNode.start(time, offset);
		currentSourceNode = sourceNode;
		// volume + envelope + length
		if (trigger) {
			const cutoff = time + (1/256)*length;
			gainNode.gain.cancelScheduledValues(time);
			let t1 = time;
			while (volume >= 0 && volume <= 15 && t1 < cutoff) {
				gainNode.gain.setValueAtTime(volume/90, t1);
				if (fade === 0) break;
				t1 += (1/64)*Math.abs(fade);
				volume -= Math.sign(fade);
			} 
			if (cutoff < Infinity) {
				gainNode.gain.setValueAtTime(0, cutoff);
			}
		}
		// rate changes
		hertzChanges.forEach(({ hertz, time }) => {
			if (hertz == null) {
				gainNode.gain.cancelScheduledValues(time);
				gainNode.gain.setValueAtTime(0, time);
			}
			else {
				const rate = buffer.sampleRate/buffer.length/hertz;
				sourceNode.playbackRate.setValueAtTime(rate, time)
			}
		});
		// pan
		leftGain.gain.setValueAtTime(left?1:0, time);
		rightGain.gain.setValueAtTime(right?1:0, time);
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
	const buf = ctx.createBuffer(1,samples.length*upsample, 0x1000*upsample, length);
	const chan = buf.getChannelData(0);
	for (let i = 0; i < chan.length; ++i) {
		chan[i] = samples[i/upsample|0];
	}
	return buf;
});

function pulse(ctx, dest) {
	const ch = baseChannel(ctx, dest);

	return function ({ duty=2, sweepFactor=0, sweepPeriod=7, freq=1798, trigger, length, volume, fade, left, right, time }) {
		const buffer = pulseWaves[duty];
		const hertz = 2 * (2048-freq);
		// TODO "real hertz" calculations
		// console.log(buffer.sampleRate/buffer.length, buffer.duration)
		// const realhertz = 1/((2 * (2048 - freq)) * buffer.duration**2);

		// console.log(realhertz, realhertz*buffer.duration);

		const hertzChanges = [];
		if (sweepFactor !== 0) {
			let shadowFreq = freq;
			let t1 = time;
			while (true) {
				t1 += (sweepPeriod/128);

				const lastShadowFreq = shadowFreq;
				const dFreq = Math.sign(sweepFactor) * shadowFreq >> Math.abs(sweepFactor);
				shadowFreq += dFreq;

				if (shadowFreq === lastShadowFreq) break;

				if (shadowFreq + dFreq >= 2048) {
					hertzChanges.push({ time: t1, hertz: null });
					break;
				}

				const hertz = 2 * (2048-shadowFreq);
				hertzChanges.push({ time: t1, hertz });
			}
		}

		ch({ buffer, hertz, hertzChanges, trigger, length, volume, fade, left, right, time });
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

function wave(ctx, dest) {
	const ch = baseChannel(ctx, dest);

	let lastSamples, cachedBuffer;
	return function ({ samples=defaultPCM, freq=1798, trigger, length, left, right, time }) {
		/** @type{AudioBuffer} */
		const buffer = (lastSamples && samples.join() === lastSamples) ?
			cachedBuffer :
			samplesToBuffer(samples);
		const hertz = (2048-freq);

		lastSamples = samples.join();
		cachedBuffer = buffer;

		ch({ buffer, hertz, trigger, length, left, right, time });
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

// The following section is the perf bottleneck!
// Modify with caution!
const upsampleAmounts = [1/8, 1/2, 2, 8, 32, 128];
const resampledNoiseWaves = upsampleAmounts.map(upsample => {
	// let t0 = performance.now();
	const noiseWaves = noiseTables.map(samples => {
		const buf = ctx.createBuffer(1, samples.length*upsample, 0x10000);
		const chan = buf.getChannelData(0);
		if (upsample < 1) {
			for (let i = 0; i < chan.length; ++i) {
				const start = i/upsample | 0;
				const end = start+1/upsample;
				for (let j = start; j < end; ++j) {
					chan[i] += samples[j]*upsample;
				}
			}
		} else {
			for (let i = 0, j = 0; i < samples.length; ++i) {
				chan.fill(samples[i], j, ((j+=upsample)));
			}
		}
		return buf;
	});
	// console.log(performance.now()-t0);
	return noiseWaves;
});

function noise(ctx, dest) {
	const ch = baseChannel(ctx, dest);

	const cats = upsampleAmounts.map(n=>256*n);
	cats[cats.length-1]=Infinity;

	return function ({ buzzy=false, freq=3<<7, trigger, length, volume, fade, left, right, time }) {
		const resampleCategory = cats.findIndex(c => freq < c);
		const buffer = resampledNoiseWaves[resampleCategory][+buzzy];
		const hertz = (buffer.sampleRate/buffer.length) * freq / upsampleAmounts[resampleCategory] / 0x40;
		ch({ buffer, hertz, trigger, length, volume, fade, left, right, time })
	};
}


const channels = [pulse, pulse, wave, noise];

function render(n, track, cb) {
	const dur = track.filter(el => typeof el === 'number').reduce((a,b)=>a+b, 0);
	if (dur === 0) return cb(null);

	const offlineCtx = new OfflineAudioContext(2, dur*0x10000, 0x10000)
	const ch = channels[n](offlineCtx);
	let t = 0;
	let loopStart = null;
	const notes = [];
	for (const x of track) {
		if (x === 'LOOPSTART') {
			loopStart = t;
		} else if (typeof x === 'number') {
			t += x;
		} else {
			notes.push({ ...x, time:t });
		}
	}
	notes.forEach(ch);
	function nextNoteAfter(t) {
		if (t > notes[notes.length-1].time && loopStart == null) return Infinity;
		const t1 = (t - loopStart) % (dur - loopStart) + loopStart;
		const note = notes.find(note => note.time >= t1) || notes.find(note => note.time >= loopStart);
		if (note.time >= t1) {
			const res = note.time + t - t1;
			return res;
		} else {
			const res = note.time + t - t1 + dur;
			return res;
		}
	}
	offlineCtx.oncomplete = (evt) => {
		const node = ctx.createBufferSource();
		node.buffer = evt.renderedBuffer;
		if (loopStart != null) {
			node.loop = true;
			node.loopStart = loopStart;
			node.loopEnd = node.buffer.duration;
		}
		cb({ node, n, nextNoteAfter });
	};
	offlineCtx.startRendering();
}

const playings = channels.map(() => []);

function playRendered({ node, n, nextNoteAfter }, t0) {
	const toggle = ctx.createGain();
	node.connect(toggle);
	toggle.connect(globalVolumeNode);
	node.start(t0, 0);

	const playing = playings[n];
	if (node.loop) {
		for (const x of playing) {
			x.node.stop(t0);
			setTimeout(() => {
				x.toggle.disconnect();
				const idx = playing.indexOf(x);
				if (idx > -1) playing.splice(idx, 1);
			}, 1000*(t0-ctx.currentTime)+1000);
		}
		playing.splice(0, Infinity);
	} else {
		for (const x of playing) {
			x.toggle.gain.cancelScheduledValues(t0);
			x.toggle.gain.setValueAtTime(0, t0);
			x.resumeAt = Math.max(x.t0 + x.nextNoteAfter(t0-x.t0 + node.buffer.duration), x.resumeAt);
			if (x.resumeAt < Infinity) {
				x.toggle.gain.setValueAtTime(1, x.resumeAt);
			} else {
				x.node.stop(t0);
				setTimeout(() => {
					x.toggle.disconnect();
					const idx = playing.indexOf(x);
					if (idx > -1) playing.splice(idx, 1);
				}, 1000*(t0-ctx.currentTime)+1000);
			}
		}
	}
	playing.push({ node, toggle, nextNoteAfter, t0, resumeAt: 0 });
}

export function play(n, track) {
	render(n, track, stuff => playRendered(stuff, ctx.currentTime));
}

export function playAll(tracks) {
	Promise.all(tracks.map((track, n) => new Promise(done => render(n, track, done)))).then(nodes => {
		const t0 = ctx.currentTime+0.02;
		nodes.filter(x => x).forEach(stuff => playRendered(stuff, t0));
	});
}
