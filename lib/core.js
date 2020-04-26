import { pulse } from './channel1.js';
import { wav } from './channel3.js';
import { noise } from './channel4.js';

const channels = [pulse(), pulse(), wav(), noise()]

/** @type {AudioContext} */
const ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'});

//Pre-multipliers to cache some calculations:
const clocksPerSecond = 0x400000;
const audioResamplerFirstPassFactor = Math.round(clocksPerSecond / ctx.sampleRate);
const downSampleInputDivider = 1 / (audioResamplerFirstPassFactor * 30) /2;

// AudioContext nodes
const scriptProcessor = ctx.createScriptProcessor(2048, 0, 2);
scriptProcessor.onaudioprocess = function (event) {
	const out1 = event.outputBuffer.getChannelData(0);
	const out2 = event.outputBuffer.getChannelData(1);

	for (let i = 0; i < scriptProcessor.bufferSize; ++i) {
		const sample = generateAudio();
		if (i === 0) (s => console.log(s.slice(0,s.length/2),s.slice(s.length/2)))(sample.toString(16).padStart(8,0))
		// TODO because only positive numbers are output, we have two options:
		// 1. subtract all samples by 1 (volume is right, but silence is -1 instead of 0, causing popping)
		// 2. divide all samples by 2 (volume is cut in half, but at least silence is 0 so no popping)
		// ... the second one seems better for now, but maybe we can somehow circumvent this problem entirely
		// (the /2) is moved up into downSampleInputDivider
		out1[i] = (sample >>> 16) * downSampleInputDivider 
		out2[i] = (sample & 0xFFFF) * downSampleInputDivider
	}
};

const gainNode = ctx.createGain();
gainNode.gain.setValueAtTime(1, ctx.currentTime)
let lastVolume = 1;
export function changeUserVolume(newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		gainNode.gain.setValueAtTime(lastVolume, ctx.currentTime)
		gainNode.gain.linearRampToValueAtTime(newVolume, ctx.currentTime + 0.05)
		lastVolume = newVolume;
	}
}

scriptProcessor.connect(gainNode);
gainNode.connect(ctx.destination);

export function resume() {
	ctx.resume();
}

export const loopStart = {};

function generateAudio() {
	return generators
	.map(g => g.generateAudio())
	.reduce((a,b)=>a+b);
}
export function play(chanNum, instructions) {
	generators[chanNum].play(instructions);
}
const generators = channels.map((channel) => {
	let sequencerClocks = 0x2000;
	let sequencePosition = 0;
	let audioClocksUntilNextEvent = 1;
	let audioClocksUntilNextEventCounter = 1;
	let clockUpTo = 0;
	let tracks = [];
	function play(instructions) {
		const track = {
			looping: false,
			instructions,
		};
		tracks.unshift(track);
		return () => track.instructions = [];
	}
	function generateAudio() {
		let audioIndex = 0;
		let downsampleInput = 0;
		while (audioIndex < audioResamplerFirstPassFactor) {
			if (clockUpTo === 0) {
				if (sequencerClocks == 0) {
					sequencePosition++;
					channel.audioComputeSequencer(sequencePosition);
					sequencerClocks = 0x2000;
				}
				if (audioClocksUntilNextEventCounter == 0) {
					//Clock down the four audio channels to the next closest audio event:
					channel.computeAudioChannels(audioClocksUntilNextEvent);
					//Find the number of clocks to next closest counter event:
					audioClocksUntilNextEvent = channel.audioClocksUntilNextEvent();
					audioClocksUntilNextEventCounter = audioClocksUntilNextEvent;
				}
				// process things that happen on tracks Right Now
				tracks.forEach((t,i) => {
					while (t.instructions.length > 0 && !(t.instructions[0] > 0)) {
						if (t.instructions[0] === loopStart) {
							t.looping = true;
							t.instructions.shift();
						} else if (typeof t.instructions[0] === 'object') {
							if (i === 0) channel.play(t.instructions[0]);

							if (t.looping) t.instructions.push(t.instructions.shift());
							else t.instructions.shift();
						} else if (t.instructions[0] === 0) {
							t.instructions.shift();
						} else {
							throw new Error("Unknown token in song: " + t.instructions[0])
						}
					}
				});
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
				audioResamplerFirstPassFactor - audioIndex,
				Math.min.apply(null, tracks.filter(t=>t.instructions[0] > 0).map(t => t.instructions[0])),
			);

			// advance counters
			clockUpTo -= multiplier;
			audioIndex += multiplier;

			// advance all tracks
			for (const track of tracks) {
				if (track.instructions[0] >= multiplier) {
					track.instructions[0] -= multiplier;
					if (track.instructions[0] === 0) track.instructions.shift();
					if (track.looping) {
						if (typeof track.instructions[track.instructions.length-1] === 'number') {
							track.instructions[track.instructions.length-1] += multiplier;
						} else {
							track.instructions.push(multiplier);
						}
					}
				}
			}

			// remove dead tracks (move to while loop up there)
			if (tracks.some(t => t.instructions.length === 0)) {
				tracks = tracks.filter(t => t.instructions.length > 0);
			}

			downsampleInput += channel.output * multiplier;
		}
		return downsampleInput;
	}
	return { generateAudio, play }
})
