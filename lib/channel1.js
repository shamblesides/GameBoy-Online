const dutyLookup = [
	0b00000001,
	0b10000001,
	0b10000111,
	0b01111110,
];

export function pulse() {
	let FrequencyTracker = 0x2000;
	let DutyTracker = 0;
	let CachedDuty = dutyLookup[2];
	let timeLeft = Infinity;
	let envelopeVolume = 0;
	let increaseVolume = false;
	let envelopeSweeps = 0;
	let envelopeSweepsLast = 0;
	let frequency = 0;
	let SweepFault = false;
	let ShadowFrequency = 0;
	let timeSweep = 1;
	let lastTimeSweep = 0;
	let frequencySweepDivider = 0;
	let decreaseSweep = false;

	let FrequencyCounter = 0x2000;

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
				clockAudioSweep();
				break;
			case 4:
				clockAudioLength();
				break;
			case 6:
				clockAudioLength();
				clockAudioSweep();
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

	function clockAudioSweep() {
		if (SweepFault || timeSweep === 0) return;
		if (--timeSweep > 0) return;

		if (lastTimeSweep === 0) return;

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
					updateOutput();
				}
			}
			else {
				frequency &= 0x7FF;
				SweepFault = true;
				updateOutput();
			}
		}
		timeSweep = lastTimeSweep;
	}
	function clockAudioEnvelope() {
		// if period is 0, volume doesn't change
		if (envelopeSweepsLast === 0) return;

		// countdown to next audio change
		--envelopeSweeps;
		if (envelopeSweeps > 0) return;

		// adjust envelope
		envelopeVolume += (increaseVolume) ? 1 : -1;
		envelopeSweeps = envelopeSweepsLast;
		updateOutput();

		// if we hit the end, stop
		if (envelopeVolume === 15 && increaseVolume) envelopeSweepsLast = 0;
		else if (envelopeVolume === 0 && !increaseVolume) envelopeSweepsLast = 0;
	}
	function audioClocksUntilNextEvent() {
		return FrequencyCounter;
	}
	function computeAudioChannels(clockForward) {
		FrequencyCounter -= clockForward;
		if (FrequencyCounter == 0) {
			FrequencyCounter = FrequencyTracker;
			DutyTracker = (DutyTracker + 1) & 0x7;
			updateOutput();
		}
	}
	function updateOutput() {
		if (
			timeLeft === 0 ||
			SweepFault ||
			(CachedDuty & (1 << DutyTracker)) === 0
		) {
			output = 0;
			return;
		}

		const currentSampleLeft = (leftChannel) ? envelopeVolume : 0;
		const currentSampleRight = (rightChannel) ? envelopeVolume : 0;

		output = (currentSampleLeft << 16) | currentSampleRight;
	}

	return {
		get output() { return output; },
		audioComputeSequencer,
		audioClocksUntilNextEvent,
		computeAudioChannels,
		play({ freq, trigger=true, length=Infinity, duty=2, volume=15, fade=0, sweepFactor=0, sweepPeriod=7, left=true, right=true }) {
			frequency = freq;
			FrequencyTracker = (0x800 - frequency) << 2;

			timeLeft = length;

			CachedDuty = dutyLookup[duty];

			leftChannel = left;
			rightChannel = right;

			lastTimeSweep = sweepFactor ? sweepPeriod : 0;
			frequencySweepDivider = Math.abs(sweepFactor);
			decreaseSweep = sweepFactor < 0;

			if (trigger) {
				envelopeVolume = volume;
				increaseVolume = (fade < 0);
				envelopeSweepsLast = ((volume === 0 && !increaseVolume) || (volume === 15 && increaseVolume)) ? 0 : Math.abs(fade);

				timeSweep = lastTimeSweep;

				ShadowFrequency = frequency;
				//Reset frequency overflow check + frequency sweep type check:
				SweepFault = false;
			}
			updateOutput();
		}
	}
}