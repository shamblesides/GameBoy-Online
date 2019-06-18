import { LSFR15Table, LSFR7Table } from './whiteNoise.js';

let FF21 = 0;

let channel4totalLength = 0;
let channel4envelopeVolume = 0;
let channel4currentVolume = 0;
let channel4envelopeType = false;
let channel4envelopeSweeps = 0;
let channel4envelopeSweepsLast = 0;
let channel4consecutive = true;
let channel4BitRange = 0x7FFF;
let channel4VolumeShifter = 15;
let channel4lastSampleLookup = 0;
let noiseSampleTable = LSFR15Table;

let channel4FrequencyPeriod = 8;
let channel4Counter = 8;
let cachedChannel4Sample = 0;
let channel4Enabled = false;
let channel4canPlay = false;

channel4OutputLevelCache();

let leftChannel4 = false;
let rightChannel4 = false;

let channel4currentSampleLeft = 0;
let channel4currentSampleRight = 0;

let channel4currentSampleLeftSecondary = 0;
let channel4currentSampleRightSecondary = 0;

export let output = 0;

export function clockAudioLength() {
	if (channel4totalLength > 1) {
		--channel4totalLength;
	}
	else if (channel4totalLength == 1) {
		channel4totalLength = 0;
		channel4EnableCheck();
	}
}

export function clockAudioEnvelope() {
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

export function audioClocksUntilNextEvent() {
    return channel4Counter;
}
export function computeAudioChannels(clockForward) {
	channel4Counter -= clockForward;
	if (channel4Counter == 0) {
		channel4lastSampleLookup = (channel4lastSampleLookup + 1) & channel4BitRange;
		channel4Counter = channel4FrequencyPeriod;
		channel4UpdateCache();
	}
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
	mixerOutputLevelCache();
}
function channel4UpdateCache() {
	cachedChannel4Sample = noiseSampleTable[channel4currentVolume | channel4lastSampleLookup];
	channel4OutputLevelCache();
}
function mixerOutputLevelCache() {
    output = (channel4currentSampleLeftSecondary << 16) | channel4currentSampleRightSecondary;
}

export function lr(l, r) {
    leftChannel4 = l;
    rightChannel4 = r;
    channel4OutputLevelCache();
}

export const setMem = {
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
};
