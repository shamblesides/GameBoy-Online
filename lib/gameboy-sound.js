window.AudioContext = window.AudioContext || window.webkitAudioContext;
window.OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;


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
less.gain.setValueAtTime(.18, ctx.currentTime);
const biquadFilter = ctx.createBiquadFilter();
biquadFilter.type = "lowshelf";
biquadFilter.frequency.setValueAtTime(500, ctx.currentTime);
biquadFilter.gain.setValueAtTime(25, ctx.currentTime);

// connect it all together
globalVolumeNode.connect(less);
less.connect(biquadFilter);
biquadFilter.connect(ctx.destination);

function baseChannel(ctx, dest=ctx.destination) {
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
		sourceNode.playbackRate.setValueAtTime(rate, time)
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
				t1 += (1/64)*Math.abs(fade);
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
		const rate = 256 / (2048-freq);

		const rateChanges = [];
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
					rateChanges.push({ time: t1, rate: null });
					break;
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

function wave(ctx, dest) {
	const ch = baseChannel(ctx, dest);

	let lastSamples, cachedBuffer;
	return function ({ samples=defaultPCM, freq=1798, trigger, length, left, right, time }) {
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

function noise(ctx, dest) {
	const ch = baseChannel(ctx, dest);

	return function ({ buzzy=false, freq=3<<7, trigger, length, volume, fade, left, right, time }) {
		const cats = upsampleAmounts.map(n=>256*n);
		cats[cats.length-1]=Infinity;
		const resampleCategory = cats.findIndex(c => freq < c);
		const buffer = resampledNoiseWaves[resampleCategory][+buzzy];
		const rate = 0x40 / freq * upsampleAmounts[resampleCategory];
		ch({ buffer, rate, trigger, length, volume, fade, left, right, time })
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
