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
	let totalLength = 0;
	let envelopeVolume = 0;
	let envelopeStartingVolume = 0;
	let currentVolume = 0;
	let increaseVolume = false;
	let envelopeSweepsInitial = 0;
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
		// if period is 0, volume doesn't change
		if (envelopeSweepsLast === 0) return;

		// countdown to next audio change
		--envelopeSweeps;
		if (envelopeSweeps > 0) return;

		// adjust envelope
		envelopeVolume += (increaseVolume) ? 1 : -1;
		currentVolume = envelopeVolume << VolumeShifter;
		envelopeSweeps = envelopeSweepsLast;
		UpdateCache();

		// if we hit the end, stop
		if (envelopeVolume === 15 && increaseVolume) envelopeSweepsLast = 0;
		else if (envelopeVolume === 0 && !increaseVolume) envelopeSweepsLast = 0;
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
		canPlay = (envelopeStartingVolume > 0);
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

	return {
		get output() { return output; },
		audioComputeSequencer,
		audioClocksUntilNextEvent,
		computeAudioChannels,
		lr,
		envelope(startingVolume=15, period=0, increase=false) {
			if (startingVolume === 0 && !increase) period = 0;
			if (startingVolume === 15 && increase) period = 0;

			envelopeStartingVolume = startingVolume;
			increaseVolume = increase;
			envelopeSweepsInitial = period;
			UpdateCache();
			VolumeEnableCheck();
		},
		effect(useShortTable=false, _clockShift=15, _divCode=7) {
			const clockShift = (_clockShift & 15);
			const divisorCode = (_divCode & 7);
			const nextTable = useShortTable ? LSFR7Table : LSFR15Table;
			FrequencyPeriod = Math.max(divisorCode << 4, 8) << clockShift;
			if (nextTable !== noiseSampleTable) {
				lastSampleLookup = 0;
				BitRange = (nextTable === LSFR7Table) ? 0x7F : 0x7FFF;
				VolumeShifter = (nextTable === LSFR7Table) ? 7 : 15;
				currentVolume = envelopeVolume << VolumeShifter;
				noiseSampleTable = nextTable;
			}
			UpdateCache();
		},
		play(trigger=true, length=Infinity) {
			totalLength = length;
			if (trigger) {
				envelopeVolume = envelopeStartingVolume;
				currentVolume = envelopeVolume << VolumeShifter;
				envelopeSweepsLast = envelopeSweepsInitial;
			}
			EnableCheck();
		}
	}
}
