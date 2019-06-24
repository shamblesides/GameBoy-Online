import { pulse } from './channel1.js';
import { wav } from './channel3.js';
import { noise } from './channel4.js';

const [ch1, ch2, ch3, ch4] = [pulse(), pulse(), wav(), noise()]
const channels = [ch1, ch2, ch3, ch4];

/** @type {AudioContext} */
const ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'});

//Sound variables:
let sequencerClocks = 0x2000;
let sequencePosition = 0;
let audioClocksUntilNextEvent = 1;
let audioClocksUntilNextEventCounter = 1;
let lastVolume = 1;
//Pre-multipliers to cache some calculations:
const clocksPerSecond = 0x400000;
const audioResamplerFirstPassFactor = Math.round(clocksPerSecond / ctx.sampleRate);
const downSampleInputDivider = 1 / (audioResamplerFirstPassFactor * 30);

// AudioContext nodes
const scriptProcessor = ctx.createScriptProcessor(2048, 0, 2);
scriptProcessor.onaudioprocess = function (event) {
	const out1 = event.outputBuffer.getChannelData(0);
	const out2 = event.outputBuffer.getChannelData(1);

	for (let i = 0; i < scriptProcessor.bufferSize; ++i) {
		const sample = generateAudio();
		// TODO because only positive numbers are output, we have two options:
		// 1. subtract all samples by 1 (volume is right, but silence is -1 instead of 0, causing popping)
		// 2. divide all samples by 2 (volume is cut in half, but at least silence is 0 so no popping)
		// ... the second one seems better for now, but maybe we can somehow circumvent this problem entirely
		out1[i] = (sample >>> 16) * downSampleInputDivider /2
		out2[i] = (sample & 0xFFFF) * downSampleInputDivider /2
	}
};

const gainNode = ctx.createGain();
gainNode.gain.setValueAtTime(1, ctx.currentTime)

scriptProcessor.connect(gainNode);
gainNode.connect(ctx.destination);

export function resume() {
	ctx.resume();
}

let song = [];
export function play(newSong) {
	song = newSong;
}

//Below are the audio generation functions timed against the CPU:
let clockUpTo = 0;
function generateAudio() {
	let audioIndex = 0;
	let downsampleInput = 0;
	while (audioIndex < audioResamplerFirstPassFactor) {
		if (clockUpTo === 0) {
			if (sequencerClocks == 0) {
				sequencePosition++;
				for (const channel of channels) channel.audioComputeSequencer(sequencePosition);
				sequencerClocks = 0x2000;
			}
			if (audioClocksUntilNextEventCounter == 0) {
				//Clock down the four audio channels to the next closest audio event:
				for (const channel of channels) channel.computeAudioChannels(audioClocksUntilNextEvent);
				//Find the number of clocks to next closest counter event:
				audioClocksUntilNextEvent = Math.min.apply(null, channels.map(ch => ch.audioClocksUntilNextEvent()));
				audioClocksUntilNextEventCounter = audioClocksUntilNextEvent;
			}
			while (song.length > 0 && !(song[0] > 0)) {
				if (typeof song[0] === 'function') {
					song[0]();
					song.push(song.shift());
				} else {
					song.shift();
				}
			}
			clockUpTo = Math.min(audioClocksUntilNextEventCounter, sequencerClocks);
			audioClocksUntilNextEventCounter -= clockUpTo;
			sequencerClocks -= clockUpTo;
		}

		const multiplier = Math.min(
			clockUpTo,
			audioResamplerFirstPassFactor - audioIndex,
			(song.length > 0) ? song[0] : Infinity,
		);
		clockUpTo -= multiplier;
		audioIndex += multiplier;
		if (song.length > 0) {
			song[0] -= multiplier;
			if (typeof song[song.length-1] === 'number') song[song.length-1] += multiplier;
			else song.push(multiplier);
		}

		const output = channels.reduce((output, ch) => output + ch.output, 0);
		downsampleInput += output * multiplier;
	}
	return downsampleInput;
}

export const pulse1 = ch1.play;
export const pulse2 = ch2.play;
export const wave1 = ch3.play;
export const noise1 = ch4.play;
export const setWaveTable = ch3.setWaveTable;

export function changeUserVolume(newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		gainNode.gain.setValueAtTime(lastVolume, ctx.currentTime)
		gainNode.gain.linearRampToValueAtTime(newVolume, ctx.currentTime + 0.05)
		lastVolume = newVolume;
	}
}
