const defaultPCM = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0];

export function wav() {
	// cached current output sample
	let output = 0;

	// l/r
	let leftChannel = true;
	let rightChannel = true;

	// timer
	let timeLeft = 0;

	// frequency
	// let frequency = 1798;
	let frequencyPeriod = 0x800;
	let FrequencyCounter = 0x800;

	// pcm downshift
	let pcmDownshift = 0;

	// pcm cycle
	let PCM = defaultPCM;
	let lastSampleLookup = 0;

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

	function audioClocksUntilNextEvent() {
		return FrequencyCounter;
	}
	function computeAudioChannels(clockForward) {
		FrequencyCounter -= clockForward;
		if (FrequencyCounter == 0) {
			FrequencyCounter = frequencyPeriod;
			lastSampleLookup = (lastSampleLookup + 1) & 0x1F;
			// cachedSample = PCM[lastSampleLookup] >> pcmDownshift;
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
		const cachedSample = PCM[lastSampleLookup] >> pcmDownshift;
		const currentSampleLeft = (leftChannel) ? cachedSample : 0;
		const currentSampleRight = (rightChannel) ? cachedSample : 0;
		output = (currentSampleLeft << 16) | currentSampleRight;
	}

	return {
		get output() { return output; },
		audioComputeSequencer,
		audioClocksUntilNextEvent,
		computeAudioChannels,
		play({ freq=1798, trigger=true, length=Infinity, samples=defaultPCM, downshift=0, left=true, right=true }) {
			frequencyPeriod = (0x800 - freq) << 1;

			timeLeft = length;

			if (samples !== PCM) {
				if (samples.length !== 32 || !samples.every(n => (n & 15) === n)) {
					throw new Error('Expected 32 samples with values 0-15')
				}
				PCM = samples;
				pcmDownshift = downshift;
			}

			leftChannel = left;
			rightChannel = right;

			if (trigger) {
				lastSampleLookup = 0;
			}
			updateOutput();
		},
	};
}
