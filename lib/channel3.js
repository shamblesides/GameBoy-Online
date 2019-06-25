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
	const PCM = new Int8Array(0x20);
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
		play({ freq, trigger=true, length=Infinity, downshift=0, left=true, right=true }) {
			const frequency = freq || frequency;
			frequencyPeriod = (0x800 - frequency) << 1;

			timeLeft = length;

			pcmDownshift = downshift;

			leftChannel = left;
			rightChannel = right;

			if (trigger) {
				lastSampleLookup = 0;
			}
			updateOutput();
		},
		setWaveTable(bytes) {
			if (bytes.length !== 16 || !bytes.every(n => n >= 0 && n <= 0xFF)) {
				throw new Error('Expected 32 samples with values 0-255')
			}
			bytes.forEach((byte, i) => {
				PCM[i * 2] = byte >> 4;
				PCM[i * 2 + 1] = byte & 0xF;
			});
		}
	};
}
