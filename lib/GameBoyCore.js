import { LSFR15Table, LSFR7Table } from './whiteNoise.js';
import * as channel1 from './channel1.js';

/*
 JavaScript GameBoy Color Emulator
 Copyright (C) 2010-2016 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

//Some CPU Emulation State Variables:
let FF17 = 0;
let FF21 = 0;
//Sound variables:
const dutyLookup = [
	0b00000001,
	0b10000001,
	0b10000111,
	0b01111110,
];
let channel2FrequencyTracker = 0x2000;
let channel2DutyTracker = 0;
let channel2CachedDuty = dutyLookup[2];
let channel2totalLength = 0;
let channel2envelopeVolume = 0;
let channel2envelopeType = false;
let channel2envelopeSweeps = 0;
let channel2envelopeSweepsLast = 0;
let channel2consecutive = true;
let channel2frequency = 0;
let channel3canPlay = false;
let channel3totalLength = 0;
let channel3patternType = 4;
let channel3frequency = 0;
let channel3consecutive = true;
let channel4totalLength = 0;
let channel4envelopeVolume = 0;
let channel4currentVolume = 0;
let channel4envelopeType = false;
let channel4envelopeSweeps = 0;
let channel4envelopeSweepsLast = 0;
let channel4consecutive = true;
let channel4BitRange = 0x7FFF;
let channel4VolumeShifter = 15;
let channel2FrequencyCounter = 0x2000;
let channel3Counter = 0x800;
let channel3FrequencyPeriod = 0x800;
let channel3lastSampleLookup = 0;
let channel4lastSampleLookup = 0;
let VinLeftChannelMasterVolume = 8;
let VinRightChannelMasterVolume = 8;
let sequencerClocks = 0x2000;
let sequencePosition = 0;
let channel4FrequencyPeriod = 8;
let channel4Counter = 8;
let cachedChannel3Sample = 0;
let cachedChannel4Sample = 0;
let channel2Enabled = false;
let channel3Enabled = false;
let channel4Enabled = false;
let channel2canPlay = false;
let channel4canPlay = false;
let audioClocksUntilNextEvent = 1;
let audioClocksUntilNextEventCounter = 1;
channel2OutputLevelCache();
channel3OutputLevelCache();
channel4OutputLevelCache();
let noiseSampleTable = LSFR15Table;
const channel3PCM = new Int8Array(0x20);
//Channel paths enabled:
let leftChannel2 = false;
let leftChannel3 = false;
let leftChannel4 = false;
let rightChannel2 = false;
let rightChannel3 = false;
let rightChannel4 = false;
//Channel output level caches:
let channel2currentSampleLeft = 0;
let channel2currentSampleRight = 0;
let channel3currentSampleLeft = 0;
let channel3currentSampleRight = 0;
let channel4currentSampleLeft = 0;
let channel4currentSampleRight = 0;
let channel2currentSampleLeftSecondary = 0;
let channel2currentSampleRightSecondary = 0;
let channel3currentSampleLeftSecondary = 0;
let channel3currentSampleRightSecondary = 0;
let channel4currentSampleLeftSecondary = 0;
let channel4currentSampleRightSecondary = 0;
let channel2currentSampleLeftTrimary = 0;
let channel2currentSampleRightTrimary = 0;
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
				audioComputeSequencer();
				sequencerClocks = 0x2000;
			}
			if (audioClocksUntilNextEventCounter == 0) {
				computeAudioChannels();
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
		downsampleInput += mixerOutput() * multiplier;
	}
	return downsampleInput;
}
function audioComputeSequencer() {
	switch (sequencePosition++) {
		case 0:
			clockAudioLength();
			break;
		case 2:
			clockAudioLength();
			channel1.clockAudioSweep();
			break;
		case 4:
			clockAudioLength();
			break;
		case 6:
			clockAudioLength();
			channel1.clockAudioSweep();
			break;
		case 7:
			clockAudioEnvelope();
			sequencePosition = 0;
	}
}
function clockAudioLength() {
	//Channel 1:
	channel1.clockAudioLength();
	//Channel 2:
	if (channel2totalLength > 1) {
		--channel2totalLength;
	}
	else if (channel2totalLength == 1) {
		channel2totalLength = 0;
		channel2EnableCheck();
	}
	//Channel 3:
	if (channel3totalLength > 1) {
		--channel3totalLength;
	}
	else if (channel3totalLength == 1) {
		channel3totalLength = 0;
		channel3EnableCheck();
	}
	//Channel 4:
	if (channel4totalLength > 1) {
		--channel4totalLength;
	}
	else if (channel4totalLength == 1) {
		channel4totalLength = 0;
		channel4EnableCheck();
	}
}
function clockAudioEnvelope() {
	//Channel 1:
	channel1.clockAudioEnvelope();
	//Channel 2:
	if (channel2envelopeSweepsLast > -1) {
		if (channel2envelopeSweeps > 0) {
			--channel2envelopeSweeps;
		}
		else {
			if (!channel2envelopeType) {
				if (channel2envelopeVolume > 0) {
					--channel2envelopeVolume;
					channel2envelopeSweeps = channel2envelopeSweepsLast;
					channel2OutputLevelCache();
				}
				else {
					channel2envelopeSweepsLast = -1;
				}
			}
			else if (channel2envelopeVolume < 0xF) {
				++channel2envelopeVolume;
				channel2envelopeSweeps = channel2envelopeSweepsLast;
				channel2OutputLevelCache();
			}
			else {
				channel2envelopeSweepsLast = -1;
			}
		}
	}
	//Channel 4:
	if (channel4envelopeSweepsLast > -1) {
		if (channel4envelopeSweeps > 0) {
			--channel4envelopeSweeps;
		}
		else {
			if (!channel4envelopeType) {
				if (channel4envelopeVolume > 0) {
					channel4currentVolume = --channel4envelopeVolume << channel4VolumeShifter;
					channel4envelopeSweeps = channel4envelopeSweepsLast;
					channel4UpdateCache();
				}
				else {
					channel4envelopeSweepsLast = -1;
				}
			}
			else if (channel4envelopeVolume < 0xF) {
				channel4currentVolume = ++channel4envelopeVolume << channel4VolumeShifter;
				channel4envelopeSweeps = channel4envelopeSweepsLast;
				channel4UpdateCache();
			}
			else {
				channel4envelopeSweepsLast = -1;
			}
		}
	}
}
function computeAudioChannels() {
	//Clock down the four audio channels to the next closest audio event:
	channel1.computeAudioChannels(audioClocksUntilNextEvent);
	channel2FrequencyCounter -= audioClocksUntilNextEvent;
	channel3Counter -= audioClocksUntilNextEvent;
	channel4Counter -= audioClocksUntilNextEvent;
	//Channel 2 counter:
	if (channel2FrequencyCounter == 0) {
		channel2FrequencyCounter = channel2FrequencyTracker;
		channel2DutyTracker = (channel2DutyTracker + 1) & 0x7;
		channel2OutputLevelTrimaryCache();
	}
	//Channel 3 counter:
	if (channel3Counter == 0) {
		if (channel3canPlay) {
			channel3lastSampleLookup = (channel3lastSampleLookup + 1) & 0x1F;
		}
		channel3Counter = channel3FrequencyPeriod;
		channel3UpdateCache();
	}
	//Channel 4 counter:
	if (channel4Counter == 0) {
		channel4lastSampleLookup = (channel4lastSampleLookup + 1) & channel4BitRange;
		channel4Counter = channel4FrequencyPeriod;
		channel4UpdateCache();
	}
	//Find the number of clocks to next closest counter event:
	audioClocksUntilNextEvent = Math.min(channel1.audioClocksUntilNextEvent(), channel2FrequencyCounter, channel3Counter, channel4Counter);
}
function channel2EnableCheck() {
	channel2Enabled = ((channel2consecutive || channel2totalLength > 0) && channel2canPlay);
	channel2OutputLevelSecondaryCache();
}
function channel2VolumeEnableCheck() {
	channel2canPlay = (FF17 > 7);
	channel2EnableCheck();
	channel2OutputLevelSecondaryCache();
}
function channel2OutputLevelCache() {
	channel2currentSampleLeft = (leftChannel2) ? channel2envelopeVolume : 0;
	channel2currentSampleRight = (rightChannel2) ? channel2envelopeVolume : 0;
	channel2OutputLevelSecondaryCache();
}
function channel2OutputLevelSecondaryCache() {
	if (channel2Enabled) {
		channel2currentSampleLeftSecondary = channel2currentSampleLeft;
		channel2currentSampleRightSecondary = channel2currentSampleRight;
	}
	else {
		channel2currentSampleLeftSecondary = 0;
		channel2currentSampleRightSecondary = 0;
	}
	channel2OutputLevelTrimaryCache();
}
function channel2OutputLevelTrimaryCache() {
	if (channel2CachedDuty & (1 << channel2DutyTracker)) {
		channel2currentSampleLeftTrimary = channel2currentSampleLeftSecondary;
		channel2currentSampleRightTrimary = channel2currentSampleRightSecondary;
	}
	else {
		channel2currentSampleLeftTrimary = 0;
		channel2currentSampleRightTrimary = 0;
	}
	// mixerOutputLevelCache();
}
function channel3EnableCheck() {
	channel3Enabled = (/*channel3canPlay && */(channel3consecutive || channel3totalLength > 0));
	channel3OutputLevelSecondaryCache();
}
function channel3OutputLevelCache() {
	channel3currentSampleLeft = (leftChannel3) ? cachedChannel3Sample : 0;
	channel3currentSampleRight = (rightChannel3) ? cachedChannel3Sample : 0;
	channel3OutputLevelSecondaryCache();
}
function channel3OutputLevelSecondaryCache() {
	if (channel3Enabled) {
		channel3currentSampleLeftSecondary = channel3currentSampleLeft;
		channel3currentSampleRightSecondary = channel3currentSampleRight;
	}
	else {
		channel3currentSampleLeftSecondary = 0;
		channel3currentSampleRightSecondary = 0;
	}
	// mixerOutputLevelCache();
}
function channel4EnableCheck() {
	channel4Enabled = ((channel4consecutive || channel4totalLength > 0) && channel4canPlay);
	channel4OutputLevelSecondaryCache();
}
function channel4VolumeEnableCheck() {
	channel4canPlay = (FF21 > 7);
	channel4EnableCheck();
	channel4OutputLevelSecondaryCache();
}
function channel4OutputLevelCache() {
	channel4currentSampleLeft = (leftChannel4) ? cachedChannel4Sample : 0;
	channel4currentSampleRight = (rightChannel4) ? cachedChannel4Sample : 0;
	channel4OutputLevelSecondaryCache();
}
function channel4OutputLevelSecondaryCache() {
	if (channel4Enabled) {
		channel4currentSampleLeftSecondary = channel4currentSampleLeft;
		channel4currentSampleRightSecondary = channel4currentSampleRight;
	}
	else {
		channel4currentSampleLeftSecondary = 0;
		channel4currentSampleRightSecondary = 0;
	}
	// mixerOutputLevelCache();
}
function mixerOutput() {
	return channel1.output + (
		((channel2currentSampleLeftTrimary + channel3currentSampleLeftSecondary + channel4currentSampleLeftSecondary) << 16) |
		(channel2currentSampleRightTrimary + channel3currentSampleRightSecondary + channel4currentSampleRightSecondary)
	);
}
function channel3UpdateCache() {
	cachedChannel3Sample = channel3PCM[channel3lastSampleLookup] >> channel3patternType;
	channel3OutputLevelCache();
}
function channel4UpdateCache() {
	cachedChannel4Sample = noiseSampleTable[channel4currentVolume | channel4lastSampleLookup];
	channel4OutputLevelCache();
}
export function memoryHighWrite(address, data) {
	//Act as a wrapper for writing by compiled jumps to specific memory writing functions.
	memoryHighWriter[address&0xFF](data);
}
const memoryHighWriter = {
	0x10: channel1.setMem[0x10],
	0x11: channel1.setMem[0x11],
	0x12: channel1.setMem[0x12],
	0x13: channel1.setMem[0x13],
	0x14: channel1.setMem[0x14],
	//NR21:
	0x16(data) {
		channel2CachedDuty = dutyLookup[data >> 6];
		channel2totalLength = 0x40 - (data & 0x3F);
		channel2EnableCheck();
	},
	//NR22:
	0x17(data) {
		channel2envelopeType = ((data & 0x08) == 0x08);
		FF17 = data;
		channel2VolumeEnableCheck();
	},
	//NR23:
	0x18(data) {
		channel2frequency = (channel2frequency & 0x700) | data;
		channel2FrequencyTracker = (0x800 - channel2frequency) << 2;
	},
	//NR24:
	0x19(data) {
		if (data > 0x7F) {
			//Reload 0xFF17:
			var nr22 = FF17;
			channel2envelopeVolume = nr22 >> 4;
			channel2OutputLevelCache();
			channel2envelopeSweepsLast = (nr22 & 0x7) - 1;
			if (channel2totalLength == 0) {
				channel2totalLength = 0x40;
			}
		}
		channel2consecutive = ((data & 0x40) == 0x0);
		channel2frequency = ((data & 0x7) << 8) | (channel2frequency & 0xFF);
		channel2FrequencyTracker = (0x800 - channel2frequency) << 2;
		channel2EnableCheck();
	},
	//NR30:
	0x1A(data) {
		if (!channel3canPlay && data >= 0x80) {
			channel3lastSampleLookup = 0;
			channel3UpdateCache();
		}
		channel3canPlay = (data > 0x7F);
		//channel3EnableCheck();
	},
	//NR31:
	0x1B(data) {
		channel3totalLength = 0x100 - data;
		channel3EnableCheck();
	},
	//NR32:
	0x1C(data) {
		data &= 0x60;
		channel3patternType = (data == 0) ? 4 : ((data >> 5) - 1);
	},
	//NR33:
	0x1D(data) {
		channel3frequency = (channel3frequency & 0x700) | data;
		channel3FrequencyPeriod = (0x800 - channel3frequency) << 1;
	},
	//NR34:
	0x1E(data) {
		if (data > 0x7F) {
			if (channel3totalLength == 0) {
				channel3totalLength = 0x100;
			}
			channel3lastSampleLookup = 0;
		}
		channel3consecutive = ((data & 0x40) == 0x0);
		channel3frequency = ((data & 0x7) << 8) | (channel3frequency & 0xFF);
		channel3FrequencyPeriod = (0x800 - channel3frequency) << 1;
		channel3EnableCheck();
	},
	//NR41:
	0x20(data) {
		channel4totalLength = 0x40 - (data & 0x3F);
		channel4EnableCheck();
	},
	//NR42:
	0x21(data) {
		channel4envelopeType = ((data & 0x08) == 0x08);
		FF21 = data;
		channel4UpdateCache();
		channel4VolumeEnableCheck();
	},
	//NR43:
	0x22(data) {
		channel4FrequencyPeriod = Math.max((data & 0x7) << 4, 8) << (data >> 4);
		var bitWidth = (data & 0x8);
		if ((bitWidth == 0x8 && channel4BitRange == 0x7FFF) || (bitWidth == 0 && channel4BitRange == 0x7F)) {
			channel4lastSampleLookup = 0;
			channel4BitRange = (bitWidth == 0x8) ? 0x7F : 0x7FFF;
			channel4VolumeShifter = (bitWidth == 0x8) ? 7 : 15;
			channel4currentVolume = channel4envelopeVolume << channel4VolumeShifter;
			noiseSampleTable = (bitWidth == 0x8) ? LSFR7Table : LSFR15Table;
		}
		channel4UpdateCache();
	},
	//NR44:
	0x23(data) {
		channel4consecutive = ((data & 0x40) == 0x0);
		if (data > 0x7F) {
			var nr42 = FF21;
			channel4envelopeVolume = nr42 >> 4;
			channel4currentVolume = channel4envelopeVolume << channel4VolumeShifter;
			channel4envelopeSweepsLast = (nr42 & 0x7) - 1;
			if (channel4totalLength == 0) {
				channel4totalLength = 0x40;
			}
		}
		channel4EnableCheck();
	},
	//NR50:
	0x24(data) {
		VinLeftChannelMasterVolume = ((data >> 4) & 0x07) + 1;
		VinRightChannelMasterVolume = (data & 0x07) + 1;
		// mixerOutputLevelCache();
	},
	//NR51:
	0x25(data) {
		channel1.lr(!!(data & 0x10), !!(data & 0x01));
		rightChannel2 = ((data & 0x02) == 0x02);
		rightChannel3 = ((data & 0x04) == 0x04);
		rightChannel4 = ((data & 0x08) == 0x08);
		leftChannel2 = ((data & 0x20) == 0x20);
		leftChannel3 = ((data & 0x40) == 0x40);
		leftChannel4 = (data > 0x7F);
		channel2OutputLevelCache();
		channel3OutputLevelCache();
		channel4OutputLevelCache();
	},
}

export function setWaveTable(bytes) {
	if (bytes.length !== 16 || !bytes.every(n => n >= 0 && n <= 0xFF)) {
		throw new Error('Expected 32 samples with values 0-255')
	}
	bytes.forEach((byte, i) => {
		channel3PCM[i * 2] = byte >> 4;
		channel3PCM[i * 2 + 1] = byte & 0xF;
	});
}

export function changeVolume(newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		volumeMultiplier = newVolume;
	}
}
