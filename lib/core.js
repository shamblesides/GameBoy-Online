import { pulse } from './channel1.js';
import { wav } from './channel3.js';
import { noise } from './channel4.js';

/** @type {AudioContext} */
const ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'});

//Pre-multipliers to cache some calculations:
const gameboyClockHertz = 0x400000;
const gameboySamplesPerActualSample = Math.round(gameboyClockHertz / ctx.sampleRate);
const downSampleInputDivider = 1 / (gameboySamplesPerActualSample * 30) /2;

const userVolumeNode = ctx.createGain();
userVolumeNode.gain.setValueAtTime(1, ctx.currentTime)
let lastVolume = 1;
export function changeUserVolume(newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		userVolumeNode.gain.setValueAtTime(lastVolume, ctx.currentTime)
		userVolumeNode.gain.linearRampToValueAtTime(newVolume, ctx.currentTime + 0.05)
		lastVolume = newVolume;
	}
}

userVolumeNode.connect(ctx.destination);

export function allow() {
	ctx.resume();
}

export const loopStart = 'LOOPSTART'

const channels = [pulse, pulse, wav, noise]

export function render(chanNum, instructions) {
	const { buffer, loopPoint } = _render(ctx, chanNum, instructions);
	if (buffer == null) return { ready: Promise.resolve(true), play: () => {} }
	function play(t0=ctx.currentTime) {
		const node = ctx.createBufferSource();
		node.buffer = buffer;
		if (loopPoint != null) {
			node.loop = true;
			node.loopStart = loopPoint;
			node.loopEnd = node.buffer.duration;
		}
		node.start(t0);
		node.connect(userVolumeNode);
	}
	return {
		ready: Promise.resolve(true),
		play
	};
}
export function renderAll(tracks) {
	const allThings = tracks.map((track,n) => render(n,track));
	const ready = Promise.all(allThings.map(thing => thing.ready));
	return {
		ready,
		play: () => ready.then(() => {
			const t0=ctx.currentTime+0.02;
			allThings.forEach(track => {
				track && track.play(t0)
			})
		})
	}
}

function _render(/** @type{AudioContext} */ctx, chanNum, instructions) {
	const perfStart = performance.now();

	const channel = channels[chanNum]();
	const dur = instructions.filter(el => typeof el === 'number').reduce((a,b)=>a+b, 0);
	if (dur === 0) return { buffer: null };
	const buf = ctx.createBuffer(2, dur*ctx.sampleRate, ctx.sampleRate);
	const lchan = buf.getChannelData(0);
	const rchan = buf.getChannelData(1);
	let loopPoint = null;

	let sequencerClocks = 0x2000;
	let sequencePosition = 0;
	let audioClocksUntilNextEvent = 1;
	let audioClocksUntilNextEventCounter = 1;
	let clockUpTo = 0;
	let clocksToNextInstruction = 0;
	for (let i = 0; i < buf.length; ++i) {
		let gameboySamplesLeft = gameboySamplesPerActualSample;
		let realSample = 0;
		while (gameboySamplesLeft > 0) {
			if (clockUpTo === 0) {
				if (sequencerClocks === 0) {
					sequencePosition++;
					channel.audioComputeSequencer(sequencePosition);
					sequencerClocks = 0x2000;
				}
				if (audioClocksUntilNextEventCounter === 0) {
					//Clock down the four audio channels to the next closest audio event:
					channel.computeAudioChannels(audioClocksUntilNextEvent);
					//Find the number of clocks to next closest counter event:
					audioClocksUntilNextEvent = channel.audioClocksUntilNextEvent();
					audioClocksUntilNextEventCounter = audioClocksUntilNextEvent;
				}
				clockUpTo = Math.min(audioClocksUntilNextEventCounter, sequencerClocks);
				if (!(clockUpTo > 0)) {
					throw new Error(`gameboy-audio: core.js: bad state (clockUpTo = ${clockUpTo})`);
				}
				audioClocksUntilNextEventCounter -= clockUpTo;
				sequencerClocks -= clockUpTo;
				// process things that happen on tracks Right Now
				for (let instr; instructions.length > 0 && clocksToNextInstruction <= 0;) {
					instr = instructions.shift();
					if (instr === loopStart) {
						loopPoint = i / ctx.sampleRate;
					} else if (typeof instr === 'number') {
						clocksToNextInstruction += gameboyClockHertz * instr;
					} else if (typeof instr === 'object') {
						channel.play(instr);
					} else {
						throw new Error("Unknown token in song: " + instr)
					}
				}
			}

			// calculate how many clock cycles to advance
			const gbFrames = Math.min(
				clockUpTo,
				gameboySamplesLeft,
			);
			if (gbFrames === 0) {
				throw new Error('should not be 0')
			}

			// advance counters
			clockUpTo -= gbFrames;
			gameboySamplesLeft -= gbFrames;
			clocksToNextInstruction -= gbFrames;

			realSample += channel.output * gbFrames;
		}
		lchan[i] = (realSample >>> 16) * downSampleInputDivider 
		rchan[i] = (realSample & 0xFFFF) * downSampleInputDivider
	}
	console.log(`rendered audio on chan ${chanNum} in ${performance.now() - perfStart}ms`);
	return { buffer: buf, loopPoint };
}
