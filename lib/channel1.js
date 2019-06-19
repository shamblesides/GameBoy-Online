const dutyLookup = [
	0b00000001,
	0b10000001,
	0b10000111,
	0b01111110,
];

export function pulse() {
	let volumeEnvelopeRegister = 0;

	let FrequencyTracker = 0x2000;
	let DutyTracker = 0;
	let CachedDuty = dutyLookup[2];
	let totalLength = Infinity;
	let envelopeVolume = 0;
	let envelopeType = false;
	let envelopeSweeps = 0;
	let envelopeSweepsLast = 0;
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
	function clockAudioEnvelope() {
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
		canPlay = (volumeEnvelopeRegister > 7);
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

	const setMem = {
		//NR10:
		0x0(data) {
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
		//NR12:
		0x2(data) {
			envelopeType = ((data & 0x08) == 0x08);
			volumeEnvelopeRegister = data;
			VolumeEnableCheck();
		},
	}

	return {
		get output() { return output; },
		audioComputeSequencer,
		audioClocksUntilNextEvent,
		computeAudioChannels,
		lr,
		setMem,
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
				Swept = false;

				envelopeVolume = volumeEnvelopeRegister >> 4;
				OutputLevelCache();
				envelopeSweepsLast = (volumeEnvelopeRegister & 0x7) - 1;

				ShadowFrequency = frequency;
				//Reset frequency overflow check + frequency sweep type check:
				SweepFault = false;
				//Supposed to run immediately:
				audioSweepPerformDummy();
			}
			EnableCheck();
		}
	}
}