//Noise Sample Tables:
const LSFR15Table = new Int8Array(0x80000);
for (let i = 0, randomFactor = 1, LSFR=0x7FFF; i < 0x8000; ++i) {
    //Normalize the last LSFR value for usage:
    randomFactor = 1 - (LSFR & 1);	//Docs say it's the inverse.
    //Cache the different volume level results:
    for (let j = 0x1; j <= 0xF; ++j) {
        LSFR15Table[j*0x8000 | i] = randomFactor * j;
    }
    //Recompute the LSFR algorithm:
    const LSFRShifted = LSFR >> 1;
    LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 14);
}

const LSFR7Table = new Int8Array(0x800);
for (let i = 0, randomFactor = 1, LSFR=0x7F; i < 0x80; ++i) {
    //Normalize the last LSFR value for usage:
    randomFactor = 1 - (LSFR & 1);	//Docs say it's the inverse.
    //Cache the different volume level results:
    for (let j = 0x1; j <= 0xF; ++j) {
        LSFR7Table[j*0x80 | i] = randomFactor * j;
    }
    //Recompute the LSFR algorithm:
    const LSFRShifted = LSFR >> 1;
    LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 6);
}

export function noise() {
	let volumeEnvelopeRegister = 0;

	let totalLength = 0;
	let envelopeVolume = 0;
	let currentVolume = 0;
	let envelopeType = false;
	let envelopeSweeps = 0;
	let envelopeSweepsLast = 0;
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
		Enabled = (totalLength > 0 && canPlay);
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

	function lr(l, r) {
		leftChannel = l;
		rightChannel = r;
		OutputLevelCache();
	}

	const setMem = {
		//NR42:
		0x2(data) {
			envelopeType = ((data & 0x08) == 0x08);
			volumeEnvelopeRegister = data;
			UpdateCache();
			VolumeEnableCheck();
		},
		//NR43:
		0x3(data) {
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
	};

	return {
		get output() { return output; },
		audioComputeSequencer,
		audioClocksUntilNextEvent,
		computeAudioChannels,
		lr,
		setMem,
		play(trigger=true, length=Infinity) {
			totalLength = length;
			if (trigger) {
				envelopeVolume = volumeEnvelopeRegister >> 4;
				currentVolume = envelopeVolume << VolumeShifter;
				envelopeSweepsLast = (volumeEnvelopeRegister  & 0x7) - 1;
			}
			EnableCheck();
		}
	}
}
