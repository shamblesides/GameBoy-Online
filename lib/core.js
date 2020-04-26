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

export function resume() {
	ctx.resume();
}

export const loopStart = {};

const channels = [pulse, pulse, wav, noise]

export function render(chanNum, instructions) {
	const { buffer, loopPoint } = _render(ctx, chanNum, instructions);
	return function play(t0=ctx.currentTime) {
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
}
function _render(/** @type{AudioContext} */ctx, chanNum, instructions) {
	const perfStart = performance.now();

	const channel = channels[chanNum]();
	const dur = instructions.filter(el => typeof el === 'number').reduce((a,b)=>a+b, 0);
	const buf = ctx.createBuffer(2, dur*ctx.sampleRate/gameboyClockHertz, ctx.sampleRate);
	const lchan = buf.getChannelData(0);
	const rchan = buf.getChannelData(1);
	let loopPoint = null;

	let sequencerClocks = 0x2000;
	let sequencePosition = 0;
	let audioClocksUntilNextEvent = 1;
	let audioClocksUntilNextEventCounter = 1;
	let clockUpTo = 0;
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
				// process things that happen on tracks Right Now
				while (instructions.length > 0 && !(instructions[0] > 0)) {
					if (instructions[0] === loopStart) {
						loopPoint = i;
						instructions.shift();
					} else if (typeof instructions[0] === 'object') {
						channel.play(instructions[0]);
						instructions.shift();
					} else if (instructions[0] === 0) {
						instructions.shift();
					} else {
						throw new Error("Unknown token in song: " + instructions[0])
					}
				}
				clockUpTo = Math.min(audioClocksUntilNextEventCounter, sequencerClocks);
				if (!(clockUpTo > 0)) {
					throw new Error(`gameboy-audio: core.js: bad state (clockUpTo = ${clockUpTo})`);
				}
				audioClocksUntilNextEventCounter -= clockUpTo;
				sequencerClocks -= clockUpTo;
			}

			// calculate how many clock cycles to advance
			const multiplier = Math.min(
				clockUpTo,
				gameboySamplesLeft,
				instructions[0],
			);

			// advance counters
			clockUpTo -= multiplier;
			gameboySamplesLeft -= multiplier;
			instructions[0] -= multiplier;
			if (instructions[0] === 0) instructions.shift();

			realSample += channel.output * multiplier;
		}
		lchan[i] = (realSample >>> 16) * downSampleInputDivider 
		rchan[i] = (realSample & 0xFFFF) * downSampleInputDivider
	}
	console.log(`rendered audio on chan ${chanNum} in ${performance.now() - perfStart}ms`);
	return { buffer: buf, loopPoint };
}
