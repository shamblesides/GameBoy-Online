import 'regenerator-runtime/runtime';
import { LSFR15Table, LSFR7Table } from './whiteNoise.js';
import { t_end } from "./test";

/*
 JavaScript GameBoy Color Emulator
 Copyright (C) 2010-2016 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
const settings = {
	channelOn: [true, true, true, true],
	emulatorLoopInterval: 8,
	audioBufferMinSpanAmount: 10,
	audioBufferMaxSpanAmount: 20,
}

//Some CPU Emulation State Variables:
const memory = [];							//Main Core Memory
//Sound variables:
const dutyLookup = [								//Map the duty values given to ones we can work with.
	[false, false, false, false, false, false, false, true],
	[true, false, false, false, false, false, false, true],
	[true, false, false, false, false, true, true, true],
	[false, true, true, true, true, true, true, false]
];
let channel1FrequencyTracker = 0x2000;
let channel1DutyTracker = 0;
let channel1CachedDuty = dutyLookup[2];
let channel1totalLength = 0;
let channel1envelopeVolume = 0;
let channel1envelopeType = false;
let channel1envelopeSweeps = 0;
let channel1envelopeSweepsLast = 0;
let channel1consecutive = true;
let channel1frequency = 0;
let channel1SweepFault = false;
let channel1ShadowFrequency = 0;
let channel1timeSweep = 1;
let channel1lastTimeSweep = 0;
let channel1Swept = false;
let channel1frequencySweepDivider = 0;
let channel1decreaseSweep = false;
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
let channel1FrequencyCounter = 0x2000;
let channel2FrequencyCounter = 0x2000;
let channel3Counter = 0x800;
let channel3FrequencyPeriod = 0x800;
let channel3lastSampleLookup = 0;
let channel4lastSampleLookup = 0;
let VinLeftChannelMasterVolume = 8;
let VinRightChannelMasterVolume = 8;
let mixerOutputCache = 0;
let sequencerClocks = 0x2000;
let sequencePosition = 0;
let channel4FrequencyPeriod = 8;
let channel4Counter = 8;
let cachedChannel3Sample = 0;
let cachedChannel4Sample = 0;
let channel1Enabled = false;
let channel2Enabled = false;
let channel3Enabled = false;
let channel4Enabled = false;
let channel1canPlay = false;
let channel2canPlay = false;
let channel4canPlay = false;
let audioClocksUntilNextEvent = 1;
let audioClocksUntilNextEventCounter = 1;
channel1OutputLevelCache();
channel2OutputLevelCache();
channel3OutputLevelCache();
channel4OutputLevelCache();
let noiseSampleTable = LSFR15Table;
const channel3PCM = new Int8Array(0x20);
//Channel paths enabled:
let leftChannel1 = false;
let leftChannel2 = false;
let leftChannel3 = false;
let leftChannel4 = false;
let rightChannel1 = false;
let rightChannel2 = false;
let rightChannel3 = false;
let rightChannel4 = false;
//Channel output level caches:
let channel1currentSampleLeft = 0;
let channel1currentSampleRight = 0;
let channel2currentSampleLeft = 0;
let channel2currentSampleRight = 0;
let channel3currentSampleLeft = 0;
let channel3currentSampleRight = 0;
let channel4currentSampleLeft = 0;
let channel4currentSampleRight = 0;
let channel1currentSampleLeftSecondary = 0;
let channel1currentSampleRightSecondary = 0;
let channel2currentSampleLeftSecondary = 0;
let channel2currentSampleRightSecondary = 0;
let channel3currentSampleLeftSecondary = 0;
let channel3currentSampleRightSecondary = 0;
let channel4currentSampleLeftSecondary = 0;
let channel4currentSampleRightSecondary = 0;
let channel1currentSampleLeftTrimary = 0;
let channel1currentSampleRightTrimary = 0;
let channel2currentSampleLeftTrimary = 0;
let channel2currentSampleRightTrimary = 0;
//Pre-multipliers to cache some calculations:
const emulatorSpeed = 1;
const clocksPerSecond = emulatorSpeed * 0x400000;
const audioResamplerFirstPassFactor = Math.max(Math.min(Math.floor(clocksPerSecond / 44100), Math.floor(0xFFFF / 0x1E0)), 1);
const downSampleInputDivider = 1 / (audioResamplerFirstPassFactor * 0xF0);








let volumeMultiplier = 1;

/** @type {AudioContext} */
const ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'});

const scriptProcessor = ctx.createScriptProcessor(1024, 0, 2);
const audioGenerator = generateAudio();
scriptProcessor.onaudioprocess = function (event) {
	const out1 = event.outputBuffer.getChannelData(0);
	const out2 = event.outputBuffer.getChannelData(1);

	for (let i = 0; i < scriptProcessor.bufferSize; ++i) {
		const sample = audioGenerator.next().value;
		out1[i] = (sample >>> 16) * downSampleInputDivider * volumeMultiplier;
		out2[i] = (sample & 0xFFFF) * downSampleInputDivider * volumeMultiplier;
	}
};
scriptProcessor.connect(ctx.destination);





//Below are the audio generation functions timed against the CPU:
function * generateAudio() {
	let audioIndex = 0;
	let downsampleInput = 0;
	while (true) {
		let clockUpTo = Math.min(audioClocksUntilNextEventCounter, sequencerClocks);
		audioClocksUntilNextEventCounter -= clockUpTo;
		sequencerClocks -= clockUpTo;
		while (clockUpTo > 0) {
			const multiplier = Math.min(clockUpTo, audioResamplerFirstPassFactor - audioIndex);
			clockUpTo -= multiplier;
			audioIndex += multiplier;
			downsampleInput += mixerOutputCache * multiplier;
			if (audioIndex == audioResamplerFirstPassFactor) {
				audioIndex = 0;
				yield downsampleInput;
				downsampleInput = 0;
			}
		}
		if (sequencerClocks == 0) {
			audioComputeSequencer();
			sequencerClocks = 0x2000;
		}
		if (audioClocksUntilNextEventCounter == 0) {
			computeAudioChannels();
		}
	}
}
function audioComputeSequencer() {
	switch (sequencePosition++) {
		case 0:
			clockAudioLength();
			break;
		case 2:
			clockAudioLength();
			clockAudioSweep();
			break;
		case 4:
			clockAudioLength();
			break;
		case 6:
			clockAudioLength();
			clockAudioSweep();
			break;
		case 7:
			clockAudioEnvelope();
			sequencePosition = 0;
	}
}
function clockAudioLength() {
	//Channel 1:
	if (channel1totalLength > 1) {
		--channel1totalLength;
	}
	else if (channel1totalLength == 1) {
		channel1totalLength = 0;
		channel1EnableCheck();
		memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
	}
	//Channel 2:
	if (channel2totalLength > 1) {
		--channel2totalLength;
	}
	else if (channel2totalLength == 1) {
		channel2totalLength = 0;
		channel2EnableCheck();
		memory[0xFF26] &= 0xFD;	//Channel #2 On Flag Off
	}
	//Channel 3:
	if (channel3totalLength > 1) {
		--channel3totalLength;
	}
	else if (channel3totalLength == 1) {
		channel3totalLength = 0;
		channel3EnableCheck();
		memory[0xFF26] &= 0xFB;	//Channel #3 On Flag Off
	}
	//Channel 4:
	if (channel4totalLength > 1) {
		--channel4totalLength;
	}
	else if (channel4totalLength == 1) {
		channel4totalLength = 0;
		channel4EnableCheck();
		memory[0xFF26] &= 0xF7;	//Channel #4 On Flag Off
	}
}
function clockAudioSweep() {
	//Channel 1:
	if (!channel1SweepFault && channel1timeSweep > 0) {
		if (--channel1timeSweep == 0) {
			runAudioSweep();
		}
	}
}
function runAudioSweep() {
	//Channel 1:
	if (channel1lastTimeSweep > 0) {
		if (channel1frequencySweepDivider > 0) {
			channel1Swept = true;
			if (channel1decreaseSweep) {
				channel1ShadowFrequency -= channel1ShadowFrequency >> channel1frequencySweepDivider;
				channel1frequency = channel1ShadowFrequency & 0x7FF;
				channel1FrequencyTracker = (0x800 - channel1frequency) << 2;
			}
			else {
				channel1ShadowFrequency += channel1ShadowFrequency >> channel1frequencySweepDivider;
				channel1frequency = channel1ShadowFrequency;
				if (channel1ShadowFrequency <= 0x7FF) {
					channel1FrequencyTracker = (0x800 - channel1frequency) << 2;
					//Run overflow check twice:
					if ((channel1ShadowFrequency + (channel1ShadowFrequency >> channel1frequencySweepDivider)) > 0x7FF) {
						channel1SweepFault = true;
						channel1EnableCheck();
						memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
					}
				}
				else {
					channel1frequency &= 0x7FF;
					channel1SweepFault = true;
					channel1EnableCheck();
					memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
				}
			}
			channel1timeSweep = channel1lastTimeSweep;
		}
		else {
			//Channel has sweep disabled and timer becomes a length counter:
			channel1SweepFault = true;
			channel1EnableCheck();
		}
	}
}
function channel1AudioSweepPerformDummy() {
	//Channel 1:
	if (channel1frequencySweepDivider > 0) {
		if (!channel1decreaseSweep) {
			var channel1ShadowFrequency = channel1ShadowFrequency + (channel1ShadowFrequency >> channel1frequencySweepDivider);
			if (channel1ShadowFrequency <= 0x7FF) {
				//Run overflow check twice:
				if ((channel1ShadowFrequency + (channel1ShadowFrequency >> channel1frequencySweepDivider)) > 0x7FF) {
					channel1SweepFault = true;
					channel1EnableCheck();
					memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
				}
			}
			else {
				channel1SweepFault = true;
				channel1EnableCheck();
				memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
			}
		}
	}
}
function clockAudioEnvelope() {
	//Channel 1:
	if (channel1envelopeSweepsLast > -1) {
		if (channel1envelopeSweeps > 0) {
			--channel1envelopeSweeps;
		}
		else {
			if (!channel1envelopeType) {
				if (channel1envelopeVolume > 0) {
					--channel1envelopeVolume;
					channel1envelopeSweeps = channel1envelopeSweepsLast;
					channel1OutputLevelCache();
				}
				else {
					channel1envelopeSweepsLast = -1;
				}
			}
			else if (channel1envelopeVolume < 0xF) {
				++channel1envelopeVolume;
				channel1envelopeSweeps = channel1envelopeSweepsLast;
				channel1OutputLevelCache();
			}
			else {
				channel1envelopeSweepsLast = -1;
			}
		}
	}
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
	channel1FrequencyCounter -= audioClocksUntilNextEvent;
	channel2FrequencyCounter -= audioClocksUntilNextEvent;
	channel3Counter -= audioClocksUntilNextEvent;
	channel4Counter -= audioClocksUntilNextEvent;
	//Channel 1 counter:
	if (channel1FrequencyCounter == 0) {
		channel1FrequencyCounter = channel1FrequencyTracker;
		channel1DutyTracker = (channel1DutyTracker + 1) & 0x7;
		channel1OutputLevelTrimaryCache();
	}
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
	audioClocksUntilNextEventCounter = audioClocksUntilNextEvent = Math.min(channel1FrequencyCounter, channel2FrequencyCounter, channel3Counter, channel4Counter);
}
function channel1EnableCheck() {
	channel1Enabled = ((channel1consecutive || channel1totalLength > 0) && !channel1SweepFault && channel1canPlay);
	channel1OutputLevelSecondaryCache();
}
function channel1VolumeEnableCheck() {
	channel1canPlay = (memory[0xFF12] > 7);
	channel1EnableCheck();
	channel1OutputLevelSecondaryCache();
}
function channel1OutputLevelCache() {
	channel1currentSampleLeft = (leftChannel1) ? channel1envelopeVolume : 0;
	channel1currentSampleRight = (rightChannel1) ? channel1envelopeVolume : 0;
	channel1OutputLevelSecondaryCache();
}
function channel1OutputLevelSecondaryCache() {
	if (channel1Enabled) {
		channel1currentSampleLeftSecondary = channel1currentSampleLeft;
		channel1currentSampleRightSecondary = channel1currentSampleRight;
	}
	else {
		channel1currentSampleLeftSecondary = 0;
		channel1currentSampleRightSecondary = 0;
	}
	channel1OutputLevelTrimaryCache();
}
function channel1OutputLevelTrimaryCache() {
	if (channel1CachedDuty[channel1DutyTracker] && settings.channelOn[0]) {
		channel1currentSampleLeftTrimary = channel1currentSampleLeftSecondary;
		channel1currentSampleRightTrimary = channel1currentSampleRightSecondary;
	}
	else {
		channel1currentSampleLeftTrimary = 0;
		channel1currentSampleRightTrimary = 0;
	}
	mixerOutputLevelCache();
}
function channel2EnableCheck() {
	channel2Enabled = ((channel2consecutive || channel2totalLength > 0) && channel2canPlay);
	channel2OutputLevelSecondaryCache();
}
function channel2VolumeEnableCheck() {
	channel2canPlay = (memory[0xFF17] > 7);
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
	if (channel2CachedDuty[channel2DutyTracker] && settings.channelOn[1]) {
		channel2currentSampleLeftTrimary = channel2currentSampleLeftSecondary;
		channel2currentSampleRightTrimary = channel2currentSampleRightSecondary;
	}
	else {
		channel2currentSampleLeftTrimary = 0;
		channel2currentSampleRightTrimary = 0;
	}
	mixerOutputLevelCache();
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
	if (channel3Enabled && settings.channelOn[2]) {
		channel3currentSampleLeftSecondary = channel3currentSampleLeft;
		channel3currentSampleRightSecondary = channel3currentSampleRight;
	}
	else {
		channel3currentSampleLeftSecondary = 0;
		channel3currentSampleRightSecondary = 0;
	}
	mixerOutputLevelCache();
}
function channel4EnableCheck() {
	channel4Enabled = ((channel4consecutive || channel4totalLength > 0) && channel4canPlay);
	channel4OutputLevelSecondaryCache();
}
function channel4VolumeEnableCheck() {
	channel4canPlay = (memory[0xFF21] > 7);
	channel4EnableCheck();
	channel4OutputLevelSecondaryCache();
}
function channel4OutputLevelCache() {
	channel4currentSampleLeft = (leftChannel4) ? cachedChannel4Sample : 0;
	channel4currentSampleRight = (rightChannel4) ? cachedChannel4Sample : 0;
	channel4OutputLevelSecondaryCache();
}
function channel4OutputLevelSecondaryCache() {
	if (channel4Enabled && settings.channelOn[3]) {
		channel4currentSampleLeftSecondary = channel4currentSampleLeft;
		channel4currentSampleRightSecondary = channel4currentSampleRight;
	}
	else {
		channel4currentSampleLeftSecondary = 0;
		channel4currentSampleRightSecondary = 0;
	}
	mixerOutputLevelCache();
}
function mixerOutputLevelCache() {
	mixerOutputCache = ((((channel1currentSampleLeftTrimary + channel2currentSampleLeftTrimary + channel3currentSampleLeftSecondary + channel4currentSampleLeftSecondary) * VinLeftChannelMasterVolume) << 16) |
		((channel1currentSampleRightTrimary + channel2currentSampleRightTrimary + channel3currentSampleRightSecondary + channel4currentSampleRightSecondary) * VinRightChannelMasterVolume));
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
	//NR10:
	0x10(data) {
		if (channel1decreaseSweep && (data & 0x08) == 0) {
			if (channel1Swept) {
				channel1SweepFault = true;
			}
		}
		channel1lastTimeSweep = (data & 0x70) >> 4;
		channel1frequencySweepDivider = data & 0x07;
		channel1decreaseSweep = ((data & 0x08) == 0x08);
		memory[0xFF10] = data;
		channel1EnableCheck();
	},
	//NR11:
	0x11(data) {
		channel1CachedDuty = dutyLookup[data >> 6];
		channel1totalLength = 0x40 - (data & 0x3F);
		memory[0xFF11] = data;
		channel1EnableCheck();
	},
	//NR12:
	0x12(data) {
		if (channel1Enabled && channel1envelopeSweeps == 0) {
			//Zombie Volume PAPU Bug:
			if (((memory[0xFF12] ^ data) & 0x8) == 0x8) {
				if ((memory[0xFF12] & 0x8) == 0) {
					if ((memory[0xFF12] & 0x7) == 0x7) {
						channel1envelopeVolume += 2;
					}
					else {
						++channel1envelopeVolume;
					}
				}
				channel1envelopeVolume = (16 - channel1envelopeVolume) & 0xF;
			}
			else if ((memory[0xFF12] & 0xF) == 0x8) {
				channel1envelopeVolume = (1 + channel1envelopeVolume) & 0xF;
			}
			channel1OutputLevelCache();
		}
		channel1envelopeType = ((data & 0x08) == 0x08);
		memory[0xFF12] = data;
		channel1VolumeEnableCheck();
	},
	//NR13:
	0x13(data) {
		channel1frequency = (channel1frequency & 0x700) | data;
		channel1FrequencyTracker = (0x800 - channel1frequency) << 2;
	},
	//NR14:
	0x14(data) {
		channel1consecutive = ((data & 0x40) == 0x0);
		channel1frequency = ((data & 0x7) << 8) | (channel1frequency & 0xFF);
		channel1FrequencyTracker = (0x800 - channel1frequency) << 2;
		if (data > 0x7F) {
			//Reload 0xFF10:
			channel1timeSweep = channel1lastTimeSweep;
			channel1Swept = false;
			//Reload 0xFF12:
			var nr12 = memory[0xFF12];
			channel1envelopeVolume = nr12 >> 4;
			channel1OutputLevelCache();
			channel1envelopeSweepsLast = (nr12 & 0x7) - 1;
			if (channel1totalLength == 0) {
				channel1totalLength = 0x40;
			}
			if (channel1lastTimeSweep > 0 || channel1frequencySweepDivider > 0) {
				memory[0xFF26] |= 0x1;
			}
			else {
				memory[0xFF26] &= 0xFE;
			}
			if ((data & 0x40) == 0x40) {
				memory[0xFF26] |= 0x1;
			}
			channel1ShadowFrequency = channel1frequency;
			//Reset frequency overflow check + frequency sweep type check:
			channel1SweepFault = false;
			//Supposed to run immediately:
			channel1AudioSweepPerformDummy();
		}
		channel1EnableCheck();
		memory[0xFF14] = data;
	},
	//NR21:
	0x16(data) {
		channel2CachedDuty = dutyLookup[data >> 6];
		channel2totalLength = 0x40 - (data & 0x3F);
		memory[0xFF16] = data;
		channel2EnableCheck();
	},
	//NR22:
	0x17(data) {
		if (channel2Enabled && channel2envelopeSweeps == 0) {
			//Zombie Volume PAPU Bug:
			if (((memory[0xFF17] ^ data) & 0x8) == 0x8) {
				if ((memory[0xFF17] & 0x8) == 0) {
					if ((memory[0xFF17] & 0x7) == 0x7) {
						channel2envelopeVolume += 2;
					}
					else {
						++channel2envelopeVolume;
					}
				}
				channel2envelopeVolume = (16 - channel2envelopeVolume) & 0xF;
			}
			else if ((memory[0xFF17] & 0xF) == 0x8) {
				channel2envelopeVolume = (1 + channel2envelopeVolume) & 0xF;
			}
			channel2OutputLevelCache();
		}
		channel2envelopeType = ((data & 0x08) == 0x08);
		memory[0xFF17] = data;
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
			var nr22 = memory[0xFF17];
			channel2envelopeVolume = nr22 >> 4;
			channel2OutputLevelCache();
			channel2envelopeSweepsLast = (nr22 & 0x7) - 1;
			if (channel2totalLength == 0) {
				channel2totalLength = 0x40;
			}
			if ((data & 0x40) == 0x40) {
				memory[0xFF26] |= 0x2;
			}
		}
		channel2consecutive = ((data & 0x40) == 0x0);
		channel2frequency = ((data & 0x7) << 8) | (channel2frequency & 0xFF);
		channel2FrequencyTracker = (0x800 - channel2frequency) << 2;
		memory[0xFF19] = data;
		channel2EnableCheck();
	},
	//NR30:
	0x1A(data) {
		if (!channel3canPlay && data >= 0x80) {
			channel3lastSampleLookup = 0;
			channel3UpdateCache();
		}
		channel3canPlay = (data > 0x7F);
		if (channel3canPlay && memory[0xFF1A] > 0x7F && !channel3consecutive) {
			memory[0xFF26] |= 0x4;
		}
		memory[0xFF1A] = data;
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
		memory[0xFF1C] = data;
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
			if ((data & 0x40) == 0x40) {
				memory[0xFF26] |= 0x4;
			}
		}
		channel3consecutive = ((data & 0x40) == 0x0);
		channel3frequency = ((data & 0x7) << 8) | (channel3frequency & 0xFF);
		channel3FrequencyPeriod = (0x800 - channel3frequency) << 1;
		memory[0xFF1E] = data;
		channel3EnableCheck();
	},
	//NR41:
	0x20(data) {
		channel4totalLength = 0x40 - (data & 0x3F);
		channel4EnableCheck();
	},
	//NR42:
	0x21(data) {
		if (channel4Enabled && channel4envelopeSweeps == 0) {
			//Zombie Volume PAPU Bug:
			if (((memory[0xFF21] ^ data) & 0x8) == 0x8) {
				if ((memory[0xFF21] & 0x8) == 0) {
					if ((memory[0xFF21] & 0x7) == 0x7) {
						channel4envelopeVolume += 2;
					}
					else {
						++channel4envelopeVolume;
					}
				}
				channel4envelopeVolume = (16 - channel4envelopeVolume) & 0xF;
			}
			else if ((memory[0xFF21] & 0xF) == 0x8) {
				channel4envelopeVolume = (1 + channel4envelopeVolume) & 0xF;
			}
			channel4currentVolume = channel4envelopeVolume << channel4VolumeShifter;
		}
		channel4envelopeType = ((data & 0x08) == 0x08);
		memory[0xFF21] = data;
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
		memory[0xFF22] = data;
		channel4UpdateCache();
	},
	//NR44:
	0x23(data) {
		memory[0xFF23] = data;
		channel4consecutive = ((data & 0x40) == 0x0);
		if (data > 0x7F) {
			var nr42 = memory[0xFF21];
			channel4envelopeVolume = nr42 >> 4;
			channel4currentVolume = channel4envelopeVolume << channel4VolumeShifter;
			channel4envelopeSweepsLast = (nr42 & 0x7) - 1;
			if (channel4totalLength == 0) {
				channel4totalLength = 0x40;
			}
			if ((data & 0x40) == 0x40) {
				memory[0xFF26] |= 0x8;
			}
		}
		channel4EnableCheck();
	},
	//NR50:
	0x24(data) {
		if (memory[0xFF24] != data) {
			memory[0xFF24] = data;
			VinLeftChannelMasterVolume = ((data >> 4) & 0x07) + 1;
			VinRightChannelMasterVolume = (data & 0x07) + 1;
			mixerOutputLevelCache();
		}
	},
	//NR51:
	0x25(data) {
		if (memory[0xFF25] != data) {
			memory[0xFF25] = data;
			rightChannel1 = ((data & 0x01) == 0x01);
			rightChannel2 = ((data & 0x02) == 0x02);
			rightChannel3 = ((data & 0x04) == 0x04);
			rightChannel4 = ((data & 0x08) == 0x08);
			leftChannel1 = ((data & 0x10) == 0x10);
			leftChannel2 = ((data & 0x20) == 0x20);
			leftChannel3 = ((data & 0x40) == 0x40);
			leftChannel4 = (data > 0x7F);
			channel1OutputLevelCache();
			channel2OutputLevelCache();
			channel3OutputLevelCache();
			channel4OutputLevelCache();
		}
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
