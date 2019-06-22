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
	let timeLeft = 0;
	let envelopeVolume = 0;
	let currentVolume = 0;
	let increaseVolume = false;
	let envelopeSweeps = 0;
	let envelopeSweepsLast = 0;
	let BitRange = 0x7FFF;
	let VolumeShifter = 15;
	let lastSampleLookup = 0;
	let noiseSampleTable = LSFR15Table;

	let FrequencyPeriod = 8;
	let Counter = 8;

	updateOutput();

	let leftChannel = true;
	let rightChannel = true;

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
		if (timeLeft > 1) {
			--timeLeft;
		}
		else if (timeLeft == 1) {
			timeLeft = 0;
			updateOutput();
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
		updateOutput();

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
			updateOutput();
		}
	}

	function updateOutput() {
		if (
			timeLeft === 0
		) {
			output = 0;
			return;
		}
		const cachedSample = noiseSampleTable[currentVolume | lastSampleLookup];
		const currentSampleLeft = (leftChannel) ? cachedSample : 0;
		const currentSampleRight = (rightChannel) ? cachedSample : 0;
		output = (currentSampleLeft << 16) | currentSampleRight;
	}

	return {
		get output() { return output; },
		audioComputeSequencer,
		audioClocksUntilNextEvent,
		computeAudioChannels,
		play({ freq=3<<7, trigger=true, length=Infinity, volume=15, fade=0, buzzy=false, left=true, right=true }) {
			FrequencyPeriod = freq;

			timeLeft = length;

			leftChannel = left;
			rightChannel = right;

			const nextTable = buzzy ? LSFR7Table : LSFR15Table;
			if (nextTable !== noiseSampleTable) {
				noiseSampleTable = nextTable;
				lastSampleLookup = 0;
				BitRange = (nextTable === LSFR7Table) ? 0x7F : 0x7FFF;
				VolumeShifter = (nextTable === LSFR7Table) ? 7 : 15;
				currentVolume = envelopeVolume << VolumeShifter;
			}

			if (trigger) {
				envelopeVolume = volume;
				currentVolume = envelopeVolume << VolumeShifter;
				increaseVolume = (fade < 0);
				envelopeSweepsLast = ((volume === 0 && !increaseVolume) || (volume === 15 && increaseVolume)) ? 0 : Math.abs(fade);
			}
			updateOutput();
		}
	}
}
