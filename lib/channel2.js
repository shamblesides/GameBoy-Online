const dutyLookup = [
	0b00000001,
	0b10000001,
	0b10000111,
	0b01111110,
];

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
export function audioClocksUntilNextEvent() {
    return FrequencyCounter;
}
export function computeAudioChannels(clockForward) {
	FrequencyCounter -= clockForward;
	if (FrequencyCounter == 0) {
		FrequencyCounter = FrequencyTracker;
		DutyTracker = (DutyTracker + 1) & 0x7;
		OutputLevelTrimaryCache();
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

export function lr(l, r) {
    leftChannel = l;
    rightChannel = r;
    OutputLevelCache();
}

export const setMem = {
	//NR21:
	0x16(data) {
		CachedDuty = dutyLookup[data >> 6];
		totalLength = 0x40 - (data & 0x3F);
		EnableCheck();
	},
	//NR22:
	0x17(data) {
		envelopeType = ((data & 0x08) == 0x08);
		volumeEnvelopeRegister = data;
		VolumeEnableCheck();
	},
	//NR23:
	0x18(data) {
		frequency = (frequency & 0x700) | data;
		FrequencyTracker = (0x800 - frequency) << 2;
	},
	//NR24:
	0x19(data) {
		if (data > 0x7F) {
			//Reload 0xFF17:
			envelopeVolume = volumeEnvelopeRegister >> 4;
			OutputLevelCache();
			envelopeSweepsLast = (volumeEnvelopeRegister  & 0x7) - 1;
			if (totalLength == 0) {
				totalLength = 0x40;
			}
		}
		consecutive = ((data & 0x40) == 0x0);
		frequency = ((data & 0x7) << 8) | (frequency & 0xFF);
		FrequencyTracker = (0x800 - frequency) << 2;
		EnableCheck();
    },
};
