import { LSFR15Table, LSFR7Table } from './whiteNoise.js';

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

export let output = 0;

export function clockAudioLength() {
	if (totalLength > 1) {
		--totalLength;
	}
	else if (totalLength == 1) {
		totalLength = 0;
		EnableCheck();
	}
}

export function clockAudioEnvelope() {
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

export function audioClocksUntilNextEvent() {
    return Counter;
}
export function computeAudioChannels(clockForward) {
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

export function lr(l, r) {
    leftChannel = l;
    rightChannel = r;
    OutputLevelCache();
}

export const setMem = {
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
};
