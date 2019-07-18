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

export function pulse() {
	const ch = oscillatorChannel();

	return {
		play({ duty=2, freq, trigger, length, volume, fade, left, right }) {
			ch.play({ wave: pulseWaves[duty], freq, trigger, length, volume, fade, left, right });
		},
		wait: ch.wait,
	}
}

const defaultPCM = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0];

export function wave() {
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
			freq = 256 / (2048-freq);
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

export function noise() {
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
