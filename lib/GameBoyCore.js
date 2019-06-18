import { pulse } from './channel1.js';
import { wav } from './channel3.js';
import { noise } from './channel4.js';

const channels = [
	pulse(),
	pulse(),
	wav(),
	noise(),
];

/*
 JavaScript GameBoy Color Emulator
 Copyright (C) 2010-2016 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

//Sound variables:
let VinLeftChannelMasterVolume = 8;
let VinRightChannelMasterVolume = 8;
let sequencerClocks = 0x2000;
let sequencePosition = 0;
let audioClocksUntilNextEvent = 1;
let audioClocksUntilNextEventCounter = 1;
//Pre-multipliers to cache some calculations:
const clocksPerSecond = 0x400000;
const audioResamplerFirstPassFactor = Math.round(clocksPerSecond / 44100);
const downSampleInputDivider = 1 / (audioResamplerFirstPassFactor * 240);


let volumeMultiplier = 1;

/** @type {AudioContext} */
const ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'});

const scriptProcessor = ctx.createScriptProcessor(1024, 0, 2);
scriptProcessor.onaudioprocess = function (event) {
	const out1 = event.outputBuffer.getChannelData(0);
	const out2 = event.outputBuffer.getChannelData(1);

	for (let i = 0; i < scriptProcessor.bufferSize; ++i) {
		const sample = generateAudio();
		// TODO because only positive numbers are output, we have two options:
		// 1. subtract all samples by 1 (volume is right, but silence is -1 instead of 0, causing popping)
		// 2. divide all samples by 2 (volume is cut in half, but at least silence is 0 so no popping)
		// ... the second one seems better for now, but maybe we can somehow circumvent this problem entirely
		out1[i] = (sample >>> 16) * VinLeftChannelMasterVolume * downSampleInputDivider * volumeMultiplier /2
		out2[i] = (sample & 0xFFFF) * VinRightChannelMasterVolume * downSampleInputDivider * volumeMultiplier /2
	}
};
scriptProcessor.connect(ctx.destination);

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
				}
				song.shift();
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
		if (song.length > 0) song[0] -= multiplier;

		const output = channels.reduce((output, ch) => output + ch.output, 0);
		downsampleInput += output * multiplier;
	}
	return downsampleInput;
}

export function memoryHighWrite(address, data) {
	//Act as a wrapper for writing by compiled jumps to specific memory writing functions.
	memoryHighWriter[address&0xFF](data);
}
const memoryHighWriter = {
	0x10: channels[0].setMem[0x0],
	0x11: channels[0].setMem[0x1],
	0x12: channels[0].setMem[0x2],
	0x13: channels[0].setMem[0x3],
	0x14: channels[0].setMem[0x4],

	0x16: channels[1].setMem[0x1],
	0x17: channels[1].setMem[0x2],
	0x18: channels[1].setMem[0x3],
	0x19: channels[1].setMem[0x4],

	0x1A: channels[2].setMem[0x0],
	0x1B: channels[2].setMem[0x1],
	0x1C: channels[2].setMem[0x2],
	0x1D: channels[2].setMem[0x3],
	0x1E: channels[2].setMem[0x4],

	0x20: channels[3].setMem[0x1],
	0x21: channels[3].setMem[0x2],
	0x22: channels[3].setMem[0x3],
	0x23: channels[3].setMem[0x4],

	//NR50:
	0x24(data) {
		VinLeftChannelMasterVolume = ((data >> 4) & 0x07) + 1;
		VinRightChannelMasterVolume = (data & 0x07) + 1;
		// mixerOutputLevelCache();
	},
	//NR51:
	0x25(data) {
		channels[0].lr(!!(data & 0x10), !!(data & 0x01));
		channels[1].lr(!!(data & 0x20), !!(data & 0x02));
		channels[2].lr(!!(data & 0x40), !!(data & 0x04));
		channels[3].lr(data > 0x7F, !!(data & 0x08));
	},
}

export function setWaveTable(bytes) {
	channels[2].setWaveTable(bytes);
}

export function changeVolume(newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		volumeMultiplier = newVolume;
	}
}
