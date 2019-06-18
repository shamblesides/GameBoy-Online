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

export function clockAudioSweep() {
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

export function lr(l, r) {
    leftChannel = l;
    rightChannel = r;
    OutputLevelCache();
}

export const setMem = {
	//NR10:
	0x10(data) {
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
	//NR11:
	0x11(data) {
		CachedDuty = dutyLookup[data >> 6];
		totalLength = 0x40 - (data & 0x3F);
		EnableCheck();
	},
	//NR12:
	0x12(data) {
		envelopeType = ((data & 0x08) == 0x08);
		volumeEnvelopeRegister = data;
		VolumeEnableCheck();
	},
	//NR13:
	0x13(data) {
		frequency = (frequency & 0x700) | data;
		FrequencyTracker = (0x800 - frequency) << 2;
	},
	//NR14:
	0x14(data) {
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
}