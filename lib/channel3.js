export function wav() {
	let totalLength = 0;
	let pcmDownshift = 0;
	let frequency = 0;

	let Counter = 0x800;
	let FrequencyPeriod = 0x800;
	let lastSampleLookup = 0;

	let cachedSample = 0;

	let Enabled = false;

	OutputLevelCache();

	const PCM = new Int8Array(0x20);

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

	function audioClocksUntilNextEvent() {
		return Counter;
	}
	function computeAudioChannels(clockForward) {
		Counter -= clockForward;
		if (Counter == 0) {
			lastSampleLookup = (lastSampleLookup + 1) & 0x1F;
			Counter = FrequencyPeriod;
			UpdateCache();
		}
	}
	function EnableCheck() {
		Enabled = (/*canPlay && */ totalLength > 0);
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
		cachedSample = PCM[lastSampleLookup] >> pcmDownshift;
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
		sampleDownshift(shift) {
			pcmDownshift = shift;
		},
		play(freq, trigger=true, length=Infinity) {
			frequency = freq;
			FrequencyPeriod = (0x800 - frequency) << 1;
			totalLength = length;
			if (trigger) {
				// totalLength = totalLength || 0x100;
				lastSampleLookup = 0;
			}
			EnableCheck();
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
