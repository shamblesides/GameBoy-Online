/*
 APU
 Copyright (C) 2019 Nigel Nelson

 MIT License

 Many parts of this are taken from Grant Galitz's GameBoy Color Emulator, which is also under the MIT
 license. This is included below.

 JavaScript GameBoy Color Emulator
 Copyright (C) 2010-2016 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const dutyLookup = [
	0b00000001,
	0b10000001,
	0b10000111,
	0b01111110,
];

const LSFR15Table = new Int8Array(0x80000);
const LSFR7Table = new Int8Array(0x800);

//Noise Sample Tables:
var lsfrRandomFactor = 1;

//15-bit LSFR Cache Generation:
var LSFR = 0x7FFF;	//Seed value has all its bits set.
var LSFRShifted = 0x3FFF;
for (var index = 0; index < 0x8000; ++index) {
    //Normalize the last LSFR value for usage:
    lsfrRandomFactor = 1 - (LSFR & 1);	//Docs say it's the inverse.
    //Cache the different volume level results:
    for (let j = 0x1; j <= 0xF; ++j) {
        LSFR15Table[j*0x8000 | index] = lsfrRandomFactor * j;
    }
    //Recompute the LSFR algorithm:
    LSFRShifted = LSFR >> 1;
    LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 14);
}
//7-bit LSFR Cache Generation:
LSFR = 0x7F;	//Seed value has all its bits set.
for (index = 0; index < 0x80; ++index) {
    //Normalize the last LSFR value for usage:
    lsfrRandomFactor = 1 - (LSFR & 1);	//Docs say it's the inverse.
    //Cache the different volume level results:
    for (let j = 0x1; j <= 0xF; ++j) {
        LSFR7Table[j*0x80 | index] = lsfrRandomFactor * j;
    }
    //Recompute the LSFR algorithm:
    LSFRShifted = LSFR >> 1;
    LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 6);
}

function pulse(ch1) {
	let volumeEnvelopeRegister = 0;

	let FrequencyTracker = 0x2000;
	let DutyTracker = 0;
	let CachedDuty = dutyLookup[2];
	let totalLength = 0;
	let envelopeVolume = 0;
	let envelopeType = false;
	let envelopeSweeps = 0;
	let envelopeSweepsLast = 0;
	let consecutive = true;
	let frequency = 0;
	let SweepFault = false;
	let ShadowFrequency = 0;
	let timeSweep = 1;
	let lastTimeSweep = 0;
	let Swept = false;
	let frequencySweepDivider = 0;
	let decreaseSweep = false;

	let FrequencyCounter = 0x2000;
	let Enabled = false;
	let canPlay = false;

	OutputLevelCache();

	let leftChannel = false;
	let rightChannel = false;

	let currentSampleLeft = 0;
	let currentSampleRight = 0;

	let currentSampleLeftSecondary = 0;
	let currentSampleRightSecondary = 0;

	let currentSampleLeftTrimary = 0;
	let currentSampleRightTrimary = 0;

	let output = 0;

	function audioComputeSequencer(sequencePosition) {
		switch (sequencePosition % 8) {
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
				break;
		}
	}

	function clockAudioLength() {
		if (totalLength > 1) {
			--totalLength;
		}
		else if (totalLength == 1) {
			totalLength = 0;
			EnableCheck();
		}
	}

	function clockAudioSweep() {
		//Channel 1:
		if (!SweepFault && timeSweep > 0) {
			if (--timeSweep == 0) {
				runAudioSweep();
			}
		}
	}
	function runAudioSweep() {
		//Channel 1:
		if (lastTimeSweep > 0) {
			if (frequencySweepDivider > 0) {
				Swept = true;
				if (decreaseSweep) {
					ShadowFrequency -= ShadowFrequency >> frequencySweepDivider;
					frequency = ShadowFrequency & 0x7FF;
					FrequencyTracker = (0x800 - frequency) << 2;
				}
				else {
					ShadowFrequency += ShadowFrequency >> frequencySweepDivider;
					frequency = ShadowFrequency;
					if (ShadowFrequency <= 0x7FF) {
						FrequencyTracker = (0x800 - frequency) << 2;
						//Run overflow check twice:
						if ((ShadowFrequency + (ShadowFrequency >> frequencySweepDivider)) > 0x7FF) {
							SweepFault = true;
							EnableCheck();
						}
					}
					else {
						frequency &= 0x7FF;
						SweepFault = true;
						EnableCheck();
					}
				}
				timeSweep = lastTimeSweep;
			}
			else {
				//Channel has sweep disabled and timer becomes a length counter:
				SweepFault = true;
				EnableCheck();
			}
		}
	}
	function audioSweepPerformDummy() {
		//Channel 1:
		if (frequencySweepDivider > 0) {
			if (!decreaseSweep) {
				var ShadowFrequency = ShadowFrequency + (ShadowFrequency >> frequencySweepDivider);
				if (ShadowFrequency <= 0x7FF) {
					//Run overflow check twice:
					if ((ShadowFrequency + (ShadowFrequency >> frequencySweepDivider)) > 0x7FF) {
						SweepFault = true;
						EnableCheck();
					}
				}
				else {
					SweepFault = true;
					EnableCheck();
				}
			}
		}
	}
	function clockAudioEnvelope() {
		if (envelopeSweepsLast > -1) {
			if (envelopeSweeps > 0) {
				--envelopeSweeps;
			}
			else {
				if (!envelopeType) {
					if (envelopeVolume > 0) {
						--envelopeVolume;
						envelopeSweeps = envelopeSweepsLast;
						OutputLevelCache();
					}
					else {
						envelopeSweepsLast = -1;
					}
				}
				else if (envelopeVolume < 0xF) {
					++envelopeVolume;
					envelopeSweeps = envelopeSweepsLast;
					OutputLevelCache();
				}
				else {
					envelopeSweepsLast = -1;
				}
			}
		}
	}
	function audioClocksUntilNextEvent() {
		return FrequencyCounter;
	}
	function computeAudioChannels(clockForward) {
		FrequencyCounter -= clockForward;
		if (FrequencyCounter == 0) {
			FrequencyCounter = FrequencyTracker;
			DutyTracker = (DutyTracker + 1) & 0x7;
			OutputLevelTrimaryCache();
		}
	}
	function EnableCheck() {
		Enabled = ((consecutive || totalLength > 0) && !SweepFault && canPlay);
		OutputLevelSecondaryCache();
	}
	function VolumeEnableCheck() {
		canPlay = (volumeEnvelopeRegister > 7);
		EnableCheck();
		OutputLevelSecondaryCache();
	}
	function OutputLevelCache() {
		currentSampleLeft = (leftChannel) ? envelopeVolume : 0;
		currentSampleRight = (rightChannel) ? envelopeVolume : 0;
		OutputLevelSecondaryCache();
	}
	function OutputLevelSecondaryCache() {
		if (Enabled) {
			currentSampleLeftSecondary = currentSampleLeft;
			currentSampleRightSecondary = currentSampleRight;
		}
		else {
			currentSampleLeftSecondary = 0;
			currentSampleRightSecondary = 0;
		}
		OutputLevelTrimaryCache();
	}
	function OutputLevelTrimaryCache() {
		if (CachedDuty & (1 << DutyTracker)) {
			currentSampleLeftTrimary = currentSampleLeftSecondary;
			currentSampleRightTrimary = currentSampleRightSecondary;
		}
		else {
			currentSampleLeftTrimary = 0;
			currentSampleRightTrimary = 0;
		}
		mixerOutputLevelCache();
	}
	function mixerOutputLevelCache() {
		output = (currentSampleLeftTrimary << 16) | currentSampleRightTrimary;
	}

	const setMem = {
		//NRx0:
		[ch1?0x10:0x15](data) {
			if (decreaseSweep && (data & 0x08) == 0) {
				if (Swept) {
					SweepFault = true;
				}
			}
			lastTimeSweep = (data & 0x70) >> 4;
			frequencySweepDivider = data & 0x07;
			decreaseSweep = ((data & 0x08) == 0x08);
			EnableCheck();
		},
		//NRx1:
		[ch1?0x11:0x16](data) {
			CachedDuty = dutyLookup[data >> 6];
			totalLength = 0x40 - (data & 0x3F);
			EnableCheck();
		},
		//NRx2:
		[ch1?0x12:0x17](data) {
			envelopeType = ((data & 0x08) == 0x08);
			volumeEnvelopeRegister = data;
			VolumeEnableCheck();
		},
		//NRx3:
		[ch1?0x13:0x18](data) {
			frequency = (frequency & 0x700) | data;
			FrequencyTracker = (0x800 - frequency) << 2;
		},
		//NRx4:
		[ch1?0x14:0x19](data) {
			consecutive = ((data & 0x40) == 0x0);
			frequency = ((data & 0x7) << 8) | (frequency & 0xFF);
			FrequencyTracker = (0x800 - frequency) << 2;
			if (data > 0x7F) {
				//Reload 0xFF10:
				timeSweep = lastTimeSweep;
				Swept = false;
				//Reload 0xFF12:
				envelopeVolume = volumeEnvelopeRegister >> 4;
				OutputLevelCache();
				envelopeSweepsLast = (volumeEnvelopeRegister  & 0x7) - 1;
				if (totalLength == 0) {
					totalLength = 0x40;
				}
				ShadowFrequency = frequency;
				//Reset frequency overflow check + frequency sweep type check:
				SweepFault = false;
				//Supposed to run immediately:
				audioSweepPerformDummy();
			}
			EnableCheck();
		},
		//NR51
		0x25(data) {
			if (ch1) {
				leftChannel = !!(data & 0x10);
				rightChannel = !!(data & 0x01);
			} else {
				leftChannel = !!(data & 0x20);
				rightChannel = !!(data & 0x02);
			}
			OutputLevelCache();
		},
	}

	return {
		get output() { return output; },
		audioComputeSequencer,
		audioClocksUntilNextEvent,
		computeAudioChannels,
		setMem,
	}
}

function wav() {
	let canPlay = false;
	let totalLength = 0;
	let patternType = 4;
	let frequency = 0;
	let consecutive = true;

	let Counter = 0x800;
	let FrequencyPeriod = 0x800;
	let lastSampleLookup = 0;

	let cachedSample = 0;

	let Enabled = false;

	OutputLevelCache();

	const PCM = new Int8Array(0x20);

	let leftChannel = false;
	let rightChannel = false;

	let currentSampleLeft = 0;
	let currentSampleRight = 0;

	let currentSampleLeftSecondary = 0;
	let currentSampleRightSecondary = 0;

	let output = 0;

	function audioComputeSequencer(sequencePosition) {
		switch (sequencePosition % 8) {
			case 0:
				clockAudioLength();
				break;
			case 2:
				clockAudioLength();
				break;
			case 4:
				clockAudioLength();
				break;
			case 6:
				clockAudioLength();
				break;
		}
	}

	function clockAudioLength() {
		if (totalLength > 1) {
			--totalLength;
		}
		else if (totalLength == 1) {
			totalLength = 0;
			EnableCheck();
		}
	}

	function audioClocksUntilNextEvent() {
		return Counter;
	}
	function computeAudioChannels(clockForward) {
		Counter -= clockForward;
		if (Counter == 0) {
			if (canPlay) {
				lastSampleLookup = (lastSampleLookup + 1) & 0x1F;
			}
			Counter = FrequencyPeriod;
			UpdateCache();
		}
	}
	function EnableCheck() {
		Enabled = (/*canPlay && */(consecutive || totalLength > 0));
		OutputLevelSecondaryCache();
	}
	function OutputLevelCache() {
		currentSampleLeft = (leftChannel) ? cachedSample : 0;
		currentSampleRight = (rightChannel) ? cachedSample : 0;
		OutputLevelSecondaryCache();
	}
	function OutputLevelSecondaryCache() {
		if (Enabled) {
			currentSampleLeftSecondary = currentSampleLeft;
			currentSampleRightSecondary = currentSampleRight;
		}
		else {
			currentSampleLeftSecondary = 0;
			currentSampleRightSecondary = 0;
		}
		mixerOutputLevelCache();
	}
	function UpdateCache() {
		cachedSample = PCM[lastSampleLookup] >> patternType;
		OutputLevelCache();
	}
	function mixerOutputLevelCache() {
		output = (currentSampleLeftSecondary << 16) | currentSampleRightSecondary;
	}

	const setMem = {
		//NR30:
		0x1A(data) {
			if (!canPlay && data >= 0x80) {
				lastSampleLookup = 0;
				UpdateCache();
			}
			canPlay = (data > 0x7F);
			//EnableCheck();
		},
		//NR31:
		0x1B(data) {
			totalLength = 0x100 - data;
			EnableCheck();
		},
		//NR32:
		0x1C(data) {
			data &= 0x60;
			patternType = (data == 0) ? 4 : ((data >> 5) - 1);
		},
		//NR33:
		0x1D(data) {
			frequency = (frequency & 0x700) | data;
			FrequencyPeriod = (0x800 - frequency) << 1;
		},
		//NR34:
		0x1E(data) {
			if (data > 0x7F) {
				if (totalLength == 0) {
					totalLength = 0x100;
				}
				lastSampleLookup = 0;
			}
			consecutive = ((data & 0x40) == 0x0);
			frequency = ((data & 0x7) << 8) | (frequency & 0xFF);
			FrequencyPeriod = (0x800 - frequency) << 1;
			EnableCheck();
		},
		//NR51
		0x25(data) {
			leftChannel = !!(data & 0x40);
			rightChannel = !!(data & 0x04);
			OutputLevelCache();
		},
		//Wavetable
		0x30: setWaveTableByte.bind(null, 0x00),
		0x31: setWaveTableByte.bind(null, 0x01),
		0x32: setWaveTableByte.bind(null, 0x02),
		0x33: setWaveTableByte.bind(null, 0x03),
		0x34: setWaveTableByte.bind(null, 0x04),
		0x35: setWaveTableByte.bind(null, 0x05),
		0x36: setWaveTableByte.bind(null, 0x06),
		0x37: setWaveTableByte.bind(null, 0x07),
		0x38: setWaveTableByte.bind(null, 0x08),
		0x39: setWaveTableByte.bind(null, 0x09),
		0x3A: setWaveTableByte.bind(null, 0x0A),
		0x3B: setWaveTableByte.bind(null, 0x0B),
		0x3C: setWaveTableByte.bind(null, 0x0C),
		0x3D: setWaveTableByte.bind(null, 0x0D),
		0x3E: setWaveTableByte.bind(null, 0x0E),
		0x3F: setWaveTableByte.bind(null, 0x0F),
	}

	function setWaveTableByte(addr, value) {
		PCM[addr*2] = value >> 4;
		PCM[addr*2+1] = value & 0xF
	}
	return {
		get output() { return output; },
		audioComputeSequencer,
		audioClocksUntilNextEvent,
		computeAudioChannels,
		setMem,
	}
}

function noise() {
	let volumeEnvelopeRegister = 0;

	let totalLength = 0;
	let envelopeVolume = 0;
	let currentVolume = 0;
	let envelopeType = false;
	let envelopeSweeps = 0;
	let envelopeSweepsLast = 0;
	let consecutive = true;
	let BitRange = 0x7FFF;
	let VolumeShifter = 15;
	let lastSampleLookup = 0;
	let noiseSampleTable = LSFR15Table;

	let FrequencyPeriod = 8;
	let Counter = 8;
	let cachedSample = 0;
	let Enabled = false;
	let canPlay = false;

	OutputLevelCache();

	let leftChannel = false;
	let rightChannel = false;

	let currentSampleLeft = 0;
	let currentSampleRight = 0;

	let currentSampleLeftSecondary = 0;
	let currentSampleRightSecondary = 0;

	let output = 0;

	function audioComputeSequencer(sequencePosition) {
		switch (sequencePosition % 8) {
			case 0:
				clockAudioLength();
				break;
			case 2:
				clockAudioLength();
				break;
			case 4:
				clockAudioLength();
				break;
			case 6:
				clockAudioLength();
				break;
			case 7:
				clockAudioEnvelope();
				break;
		}
	}

	function clockAudioLength() {
		if (totalLength > 1) {
			--totalLength;
		}
		else if (totalLength == 1) {
			totalLength = 0;
			EnableCheck();
		}
	}

	function clockAudioEnvelope() {
		if (envelopeSweepsLast > -1) {
			if (envelopeSweeps > 0) {
				--envelopeSweeps;
			}
			else {
				if (!envelopeType) {
					if (envelopeVolume > 0) {
						currentVolume = --envelopeVolume << VolumeShifter;
						envelopeSweeps = envelopeSweepsLast;
						UpdateCache();
					}
					else {
						envelopeSweepsLast = -1;
					}
				}
				else if (envelopeVolume < 0xF) {
					currentVolume = ++envelopeVolume << VolumeShifter;
					envelopeSweeps = envelopeSweepsLast;
					UpdateCache();
				}
				else {
					envelopeSweepsLast = -1;
				}
			}
		}
	}

	function audioClocksUntilNextEvent() {
		return Counter;
	}
	function computeAudioChannels(clockForward) {
		Counter -= clockForward;
		if (Counter == 0) {
			lastSampleLookup = (lastSampleLookup + 1) & BitRange;
			Counter = FrequencyPeriod;
			UpdateCache();
		}
	}

	function EnableCheck() {
		Enabled = ((consecutive || totalLength > 0) && canPlay);
		OutputLevelSecondaryCache();
	}
	function VolumeEnableCheck() {
		canPlay = (volumeEnvelopeRegister > 7);
		EnableCheck();
		OutputLevelSecondaryCache();
	}
	function OutputLevelCache() {
		currentSampleLeft = (leftChannel) ? cachedSample : 0;
		currentSampleRight = (rightChannel) ? cachedSample : 0;
		OutputLevelSecondaryCache();
	}
	function OutputLevelSecondaryCache() {
		if (Enabled) {
			currentSampleLeftSecondary = currentSampleLeft;
			currentSampleRightSecondary = currentSampleRight;
		}
		else {
			currentSampleLeftSecondary = 0;
			currentSampleRightSecondary = 0;
		}
		mixerOutputLevelCache();
	}
	function UpdateCache() {
		cachedSample = noiseSampleTable[currentVolume | lastSampleLookup];
		OutputLevelCache();
	}
	function mixerOutputLevelCache() {
		output = (currentSampleLeftSecondary << 16) | currentSampleRightSecondary;
	}

	const setMem = {
		//NR41:
		0x20(data) {
			totalLength = 0x40 - (data & 0x3F);
			EnableCheck();
		},
		//NR42:
		0x21(data) {
			envelopeType = ((data & 0x08) == 0x08);
			volumeEnvelopeRegister = data;
			UpdateCache();
			VolumeEnableCheck();
		},
		//NR43:
		0x22(data) {
			FrequencyPeriod = Math.max((data & 0x7) << 4, 8) << (data >> 4);
			var bitWidth = (data & 0x8);
			if ((bitWidth == 0x8 && BitRange == 0x7FFF) || (bitWidth == 0 && BitRange == 0x7F)) {
				lastSampleLookup = 0;
				BitRange = (bitWidth == 0x8) ? 0x7F : 0x7FFF;
				VolumeShifter = (bitWidth == 0x8) ? 7 : 15;
				currentVolume = envelopeVolume << VolumeShifter;
				noiseSampleTable = (bitWidth == 0x8) ? LSFR7Table : LSFR15Table;
			}
			UpdateCache();
		},
		//NR44:
		0x23(data) {
			consecutive = ((data & 0x40) == 0x0);
			if (data > 0x7F) {
				volumeEnvelopeRegister;
				envelopeVolume = volumeEnvelopeRegister >> 4;
				currentVolume = envelopeVolume << VolumeShifter;
				envelopeSweepsLast = (volumeEnvelopeRegister  & 0x7) - 1;
				if (totalLength == 0) {
					totalLength = 0x40;
				}
			}
			EnableCheck();
		},
		//NR51
		0x25(data) {
			leftChannel = data > 0x7F;
			rightChannel = !!(data & 0x08);
			OutputLevelCache();
		},
	};

	return {
		get output() { return output; },
		audioComputeSequencer,
		audioClocksUntilNextEvent,
		computeAudioChannels,
		setMem,
	}
}

const channels = [
	pulse(true),
	pulse(false),
	wav(),
	noise(),
];

//Sound variables:
const gameboyClockHertz = 0x400000;
let VinLeftChannelMasterVolume = 8;
let VinRightChannelMasterVolume = 8;
let sequencerClocks = 0x2000;
let sequencePosition = 0;
let audioClocksUntilNextEvent = 1;
let audioClocksUntilNextEventCounter = 1;
let gameboySamplePerOutputSample;
let downSampleInputDivider;

class GameboyProcessor extends AudioWorkletProcessor {
  constructor (...args) {
    super(...args)
    this.port.onmessage = ({ data: e }) => {
			if (e.type === 'play') {
				const arr = new Uint8Array(e.data);
				play(arr, e.loop)
			}
      this.port.postMessage('pong')
    }
  }
  process (inputs, outputs, parameters) {
		if (!sampleRate) throw new Error('No sample rate')

		gameboySamplePerOutputSample = Math.round(gameboyClockHertz / sampleRate);

		// not sure why 30, but /8 is the max VinXChannelMasterVolume
		// and the /2 is because originally the gb soundchip expects samples in a range of (0,1)
		// which we can turn into (-.5,.5) BUT this causes audio pop whenever we start the emulator
		// so we settle for (0,.5) instead.
		downSampleInputDivider = 1 / (gameboySamplePerOutputSample * 30) / 8 / 2;

		const out1 = outputs[0][0];
		const out2 = outputs[0][1];

		for (let i = 0; i < out1.length; ++i) {
			const sample = generateAudio();
			out1[i] = (sample >>> 16) * VinLeftChannelMasterVolume * downSampleInputDivider
			out2[i] = (sample & 0xFFFF) * VinRightChannelMasterVolume * downSampleInputDivider
			// if (i%256 === 0) console.log(`${i.toString(16).padStart(4,0)} sample === ${sample.toString(2).padStart(32,0)}`)
		}
		return true
  }
}

registerProcessor('gameboy-processor', GameboyProcessor)

let song = null;
let songIdx = -1;
let songTimer = 0;
let songLoopPoint = -1;
function play(newSong, loopPoint) {
	song = newSong;
	songIdx = 0;
	songTimer = 0;
	songLoopPoint = loopPoint;
}
/**
 * Rougly 0x400000/44100 (clock speed / audio sampling speed)
 * You may be wondering: isn't that the same as gameboySamplePerOutputSample?
 * Answer: no. This is just used for determining the timing of the delay commands.
 * Those commands come from the .vgm format, which always assumes 44100 sample rate.
 */
const atomicDelayUnit = 0x60;
function songDoDelay(t) {
	songTimer += t * atomicDelayUnit;
}

//Below are the audio generation functions timed against the CPU:
function generateAudio() {
	let realSample = 0;
	for (let downsampledFramesLeft = gameboySamplePerOutputSample; downsampledFramesLeft > 0;) {
		while (songTimer === 0 && songIdx >= 0) {
			if (songIdx >= song.length) {
				songIdx = songLoopPoint;
				if (songIdx === -1) break;
			}
			const op = song[songIdx++];
			if (op === 0xB3) { // gameboy apu register write
				const reg = song[songIdx++] + 0x10;
				const val = song[songIdx++];
				registerWrite(reg, val, [1,1,1,1]);
			} else if (op === 0x61) {
				const t = (song[songIdx++]) + (song[songIdx++] << 8); 
				songDoDelay(t)
			} else if (op === 0x62) {
				songDoDelay(735); // exactly 44100/60
			} else if ((op&0xF0) === 0x70) {
				songDoDelay(1+(op&0xf))
			} else if (op === 0x66) {
				songIdx = songLoopPoint;
			} else {
				throw new Error('What is op ' + op.toString(16))
			}
		}
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

		const multiplier = Math.min(
			audioClocksUntilNextEventCounter,
			sequencerClocks,
			downsampledFramesLeft,
			(songIdx >= 0) ? songTimer : Infinity,
		);
		if (!(multiplier > 0)) {
			throw new Error('multipler should greater than 0')
		}
		audioClocksUntilNextEventCounter -= multiplier;
		sequencerClocks -= multiplier;
		downsampledFramesLeft -= multiplier;
		songTimer -= multiplier;

		const output = channels.reduce((output, ch) => output + ch.output, 0);
		realSample += output * multiplier;
	}
	return realSample;
}

function registerWrite(address, data, channelMask) {
	if (miscRegisterFuncs[address]) {
		miscRegisterFuncs[address](data)
	} else {
		let didSet = 0;
		for (let i = 0; i < 4; ++i) {
			if (channelMask[i] && channels[i].setMem[address]) {
				channels[i].setMem[address](data);
				++didSet;
			}
		}
		if (!didSet) {
			throw new Error(`Unsupported register write: FF${address.toString(16).padStart(2,0)}`)
		}
	}
	// console.log(`FF${address.toString(16).padStart(2)} <= ${data}`)
}
// const memoryHash = {
const miscRegisterFuncs = {
	//NR50:
	0x24(data) {
		VinLeftChannelMasterVolume = ((data >> 4) & 0x07) + 1;
		VinRightChannelMasterVolume = (data & 0x07) + 1;
		// mixerOutputLevelCache();
	},
	//NR52:
	0x26() {
		// allowed, but ignored
	},
}
