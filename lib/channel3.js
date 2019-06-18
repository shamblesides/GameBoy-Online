let channel3canPlay = false;
let channel3totalLength = 0;
let channel3patternType = 4;
let channel3frequency = 0;
let channel3consecutive = true;

let channel3Counter = 0x800;
let channel3FrequencyPeriod = 0x800;
let channel3lastSampleLookup = 0;

let cachedChannel3Sample = 0;

let channel3Enabled = false;

channel3OutputLevelCache();

const channel3PCM = new Int8Array(0x20);

let leftChannel3 = false;
let rightChannel3 = false;

let channel3currentSampleLeft = 0;
let channel3currentSampleRight = 0;

let channel3currentSampleLeftSecondary = 0;
let channel3currentSampleRightSecondary = 0;

export let output = 0;

export function clockAudioLength() {
	if (channel3totalLength > 1) {
		--channel3totalLength;
	}
	else if (channel3totalLength == 1) {
		channel3totalLength = 0;
		channel3EnableCheck();
	}
}

export function audioClocksUntilNextEvent() {
    return channel3Counter;
}
export function computeAudioChannels(clockForward) {
	channel3Counter -= clockForward;
	if (channel3Counter == 0) {
		if (channel3canPlay) {
			channel3lastSampleLookup = (channel3lastSampleLookup + 1) & 0x1F;
		}
		channel3Counter = channel3FrequencyPeriod;
		channel3UpdateCache();
	}
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
	mixerOutputLevelCache();
}
function channel3UpdateCache() {
	cachedChannel3Sample = channel3PCM[channel3lastSampleLookup] >> channel3patternType;
	channel3OutputLevelCache();
}
function mixerOutputLevelCache() {
    output = (channel3currentSampleLeftSecondary << 16) | channel3currentSampleRightSecondary;
}

export function lr(l, r) {
    leftChannel3 = l;
    rightChannel3 = r;
    channel3OutputLevelCache();
}

export const setMem = {
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
