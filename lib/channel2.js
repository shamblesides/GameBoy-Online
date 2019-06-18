const dutyLookup = [
	0b00000001,
	0b10000001,
	0b10000111,
	0b01111110,
];

let FF17 = 0;

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

let channel2FrequencyCounter = 0x2000;
let channel2Enabled = false;
let channel2canPlay = false;

channel2OutputLevelCache();

let leftChannel2 = false;
let rightChannel2 = false;

let channel2currentSampleLeft = 0;
let channel2currentSampleRight = 0;

let channel2currentSampleLeftSecondary = 0;
let channel2currentSampleRightSecondary = 0;

let channel2currentSampleLeftTrimary = 0;
let channel2currentSampleRightTrimary = 0;

export let output = 0;

export function clockAudioLength() {
	if (channel2totalLength > 1) {
		--channel2totalLength;
	}
	else if (channel2totalLength == 1) {
		channel2totalLength = 0;
		channel2EnableCheck();
	}
}

export function clockAudioEnvelope() {
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
}
export function audioClocksUntilNextEvent() {
    return channel2FrequencyCounter;
}
export function computeAudioChannels(clockForward) {
	channel2FrequencyCounter -= clockForward;
	if (channel2FrequencyCounter == 0) {
		channel2FrequencyCounter = channel2FrequencyTracker;
		channel2DutyTracker = (channel2DutyTracker + 1) & 0x7;
		channel2OutputLevelTrimaryCache();
	}
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
	mixerOutputLevelCache();
}
function mixerOutputLevelCache() {
    output = (channel2currentSampleLeftTrimary << 16) | channel2currentSampleRightTrimary;
}

export function lr(l, r) {
    leftChannel2 = l;
    rightChannel2 = r;
    channel2OutputLevelCache();
}

export const setMem = {
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
};
