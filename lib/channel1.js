const dutyLookup = [
	0b00000001,
	0b10000001,
	0b10000111,
	0b01111110,
];

let FF12 = 0;

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

let channel1FrequencyCounter = 0x2000;
let channel1Enabled = false;
let channel1canPlay = false;

channel1OutputLevelCache();

let leftChannel1 = false;
let rightChannel1 = false;

let channel1currentSampleLeft = 0;
let channel1currentSampleRight = 0;

let channel1currentSampleLeftSecondary = 0;
let channel1currentSampleRightSecondary = 0;

let channel1currentSampleLeftTrimary = 0;
let channel1currentSampleRightTrimary = 0;

export let output = 0;

export function clockAudioLength() {
	if (channel1totalLength > 1) {
		--channel1totalLength;
	}
	else if (channel1totalLength == 1) {
		channel1totalLength = 0;
		channel1EnableCheck();
	}
}

export function clockAudioSweep() {
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
					}
				}
				else {
					channel1frequency &= 0x7FF;
					channel1SweepFault = true;
					channel1EnableCheck();
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
function audioSweepPerformDummy() {
	//Channel 1:
	if (channel1frequencySweepDivider > 0) {
		if (!channel1decreaseSweep) {
			var channel1ShadowFrequency = channel1ShadowFrequency + (channel1ShadowFrequency >> channel1frequencySweepDivider);
			if (channel1ShadowFrequency <= 0x7FF) {
				//Run overflow check twice:
				if ((channel1ShadowFrequency + (channel1ShadowFrequency >> channel1frequencySweepDivider)) > 0x7FF) {
					channel1SweepFault = true;
					channel1EnableCheck();
				}
			}
			else {
				channel1SweepFault = true;
				channel1EnableCheck();
			}
		}
	}
}
export function clockAudioEnvelope() {
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
}
export function audioClocksUntilNextEvent() {
    return channel1FrequencyCounter;
}
export function computeAudioChannels(clockForward) {
	channel1FrequencyCounter -= clockForward;
	if (channel1FrequencyCounter == 0) {
		channel1FrequencyCounter = channel1FrequencyTracker;
		channel1DutyTracker = (channel1DutyTracker + 1) & 0x7;
		channel1OutputLevelTrimaryCache();
	}
}
function channel1EnableCheck() {
	channel1Enabled = ((channel1consecutive || channel1totalLength > 0) && !channel1SweepFault && channel1canPlay);
	channel1OutputLevelSecondaryCache();
}
function channel1VolumeEnableCheck() {
	channel1canPlay = (FF12 > 7);
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
	if (channel1CachedDuty & (1 << channel1DutyTracker)) {
		channel1currentSampleLeftTrimary = channel1currentSampleLeftSecondary;
		channel1currentSampleRightTrimary = channel1currentSampleRightSecondary;
	}
	else {
		channel1currentSampleLeftTrimary = 0;
		channel1currentSampleRightTrimary = 0;
	}
	mixerOutputLevelCache();
}
function mixerOutputLevelCache() {
    output = (channel1currentSampleLeftTrimary << 16) | channel1currentSampleRightTrimary;
}

export function lr(l, r) {
    leftChannel1 = l;
    rightChannel1 = r;
    channel1OutputLevelCache();
}

export const setMem = {
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
		channel1EnableCheck();
	},
	//NR11:
	0x11(data) {
		channel1CachedDuty = dutyLookup[data >> 6];
		channel1totalLength = 0x40 - (data & 0x3F);
		channel1EnableCheck();
	},
	//NR12:
	0x12(data) {
		channel1envelopeType = ((data & 0x08) == 0x08);
		FF12 = data;
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
			var nr12 = FF12;
			channel1envelopeVolume = nr12 >> 4;
			channel1OutputLevelCache();
			channel1envelopeSweepsLast = (nr12 & 0x7) - 1;
			if (channel1totalLength == 0) {
				channel1totalLength = 0x40;
			}
			channel1ShadowFrequency = channel1frequency;
			//Reset frequency overflow check + frequency sweep type check:
			channel1SweepFault = false;
			//Supposed to run immediately:
			audioSweepPerformDummy();
		}
		channel1EnableCheck();
	},
}