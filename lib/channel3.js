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

let leftChannel3 = false;
let rightChannel3 = false;

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

export function audioClocksUntilNextEvent() {
    return Counter;
}
export function computeAudioChannels(clockForward) {
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
	currentSampleLeft = (leftChannel3) ? cachedSample : 0;
	currentSampleRight = (rightChannel3) ? cachedSample : 0;
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

export function lr(l, r) {
    leftChannel3 = l;
    rightChannel3 = r;
    OutputLevelCache();
}

export const setMem = {
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
}

export function setWaveTable(bytes) {
	if (bytes.length !== 16 || !bytes.every(n => n >= 0 && n <= 0xFF)) {
		throw new Error('Expected 32 samples with values 0-255')
	}
	bytes.forEach((byte, i) => {
		PCM[i * 2] = byte >> 4;
		PCM[i * 2 + 1] = byte & 0xF;
	});
}
