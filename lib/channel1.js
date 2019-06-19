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
	let totalLength = Infinity;
	let envelopeVolume = 0;
	let envelopeStartingVolume = 0;
	let increaseVolume = false;
	let envelopeSweepsInitial = 0;
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
		if (totalLength > 1) {
			--totalLength;
		}
		else if (totalLength == 1) {
			totalLength = 0;
			EnableCheck();
		}
	}

	function clockAudioSweep() {
		if (SweepFault || timeSweep === 0) return;
		if (--timeSweep > 0) return;

		if (lastTimeSweep === 0) return;

		if (frequencySweepDivider === 0) {
			//Channel has sweep disabled and timer becomes a length counter:
			SweepFault = true;
			EnableCheck();
			return;
		}

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
	function clockAudioEnvelope() {
		// if period is 0, volume doesn't change
		if (envelopeSweepsLast === 0) return;

		// countdown to next audio change
		--envelopeSweeps;
		if (envelopeSweeps > 0) return;

		// adjust envelope
		envelopeVolume += (increaseVolume) ? 1 : -1;
		envelopeSweeps = envelopeSweepsLast;
		OutputLevelCache();

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
			OutputLevelTrimaryCache();
		}
	}
	function VolumeEnableCheck() {
		canPlay = (envelopeStartingVolume > 0 || increaseVolume);
		EnableCheck();
	}
	function EnableCheck() {
		Enabled = (totalLength > 0 && !SweepFault && canPlay);
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
		sweep(factor=7, period=7, increase=false) {
			lastTimeSweep = period;
			frequencySweepDivider = factor;
			decreaseSweep = !increase;
			EnableCheck();
		},
		envelope(startingVolume=15, period=0, increase=false) {
			if (startingVolume === 0 && !increase) period = 0;
			if (startingVolume === 15 && increase) period = 0;

			envelopeStartingVolume = startingVolume;
			increaseVolume = increase;
			envelopeSweepsInitial = period;
			VolumeEnableCheck();
		},
		duty(value) {
			CachedDuty = dutyLookup[value];
			EnableCheck();
		},
		play(freq, trigger=true, length=Infinity) {
			frequency = freq;
			FrequencyTracker = (0x800 - frequency) << 2;
			totalLength = length;
			if (trigger) {
				timeSweep = lastTimeSweep;

				envelopeVolume = envelopeStartingVolume;
				OutputLevelCache();
				envelopeSweepsLast = envelopeSweepsInitial;

				ShadowFrequency = frequency;
				//Reset frequency overflow check + frequency sweep type check:
				SweepFault = false;
			}
			EnableCheck();
		}
	}
}