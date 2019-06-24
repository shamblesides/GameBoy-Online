export function wav() {
	let timeLeft = 0;
	let pcmDownshift = 0;
	let frequency = 1798;

	let counter = 0x800;
	let frequencyPeriod = 0x800;
	let lastSampleLookup = 0;

	let cachedSample = 0;

	const PCM = new Int8Array(0x20);

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
		return counter;
	}
	function computeAudioChannels(clockForward) {
		counter -= clockForward;
		if (counter == 0) {
			lastSampleLookup = (lastSampleLookup + 1) & 0x1F;
			counter = frequencyPeriod;
			cachedSample = PCM[lastSampleLookup] >> pcmDownshift;
			updateOutput();
		}
	}
	function updateOutput() {
		if (timeLeft === 0) {
			output = 0;
			return;
		}
		const currentSampleLeft = (leftChannel) ? cachedSample : 0;
		const currentSampleRight = (rightChannel) ? cachedSample : 0;

		output = (currentSampleLeft << 16) | currentSampleRight;
	}

	return {
		get output() { return output; },
		audioComputeSequencer,
		audioClocksUntilNextEvent,
		computeAudioChannels,
		play({ freq, trigger=true, length=Infinity, left=true, right=true, downshift=0 }) {
			frequency = freq || frequency;
			frequencyPeriod = (0x800 - frequency) << 1;
			timeLeft = length;
			leftChannel = left;
			rightChannel = right;
			pcmDownshift = downshift;
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
