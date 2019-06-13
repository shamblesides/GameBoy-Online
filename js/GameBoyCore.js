var cout = console.log.bind(console);
import { XAudioServer } from './other/XAudioServer.js';
 /*
  JavaScript GameBoy Color Emulator
  Copyright (C) 2010-2016 Grant Galitz

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
const settings = {
	soundOn: true,
	channelOn: [true, true, true, true],
	volumeLevel: 1,
	emulatorLoopInterval: 8,
	audioBufferMinSpanAmount: 10,
	audioBufferMaxSpanAmount: 20,
}

let audioResamplerFirstPassFactor;
let downSampleInputDivider;
let audioBuffer;

	//CPU Registers and Flags:
	let registerA = 0x01; 						//Register A (Accumulator)
	let FZero = true; 							//Register F  - Result was zero
	let FSubtract = false;						//Register F  - Subtraction was executed
	let FHalfCarry = true;						//Register F  - Half carry or half borrow
	let FCarry = true;							//Register F  - Carry or borrow
	let registerB = 0x00;						//Register B
	let registerC = 0x13;						//Register C
	let registerD = 0x00;						//Register D
	let registerE = 0xD8;						//Register E
	let registersHL = 0x014D;					//Registers H and L combined
	let stackPointer = 0xFFFE;					//Stack Pointer
	let programCounter = 0x0100;				//Program Counter
	//Some CPU Emulation State Variables:
	let CPUCyclesTotal = 0;					//Relative CPU clocking to speed set, rounded appropriately.
	let CPUCyclesTotalBase = 0;				//Relative CPU clocking to speed set base.
	let CPUCyclesTotalCurrent = 0;				//Relative CPU clocking to speed set, the directly used value.
	let CPUCyclesTotalRoundoff = 0;			//Clocking per iteration rounding catch.
	let baseCPUCyclesPerIteration	= 0;		//CPU clocks per iteration at 1x speed.
	let remainingClocks = 0;					//HALT clocking overrun carry over.
	// let inBootstrap = true;					//Whether we're in the GBC boot ROM.
	let usedBootROM = false;					//Updated upon ROM loading...
	let usedGBCBootROM = false;				//Did we boot to the GBC boot ROM?
	let halt = false;							//Has the CPU been suspended until the next interrupt?
	let skipPCIncrement = false;				//Did we trip the DMG Halt bug?
	// stopEmulator = 3;						//Has the emulation been paused or a frame has ended?
	let IME = true;							//Are interrupts enabled?
	let IRQLineMatched = 0;					//CPU IRQ assertion.
	let interruptsRequested = 0;				//IF Register
	let interruptsEnabled = 0;					//IE Register
	let hdmaRunning = false;					//HDMA Transfer Flag - GBC only
	let CPUTicks = 0;							//The number of clock cycles emulated.
	let doubleSpeedShifter = 0;				//GBC double speed clocking shifter.
	let JoyPad = 0xFF;							//Joypad State (two four-bit states actually)
	let CPUStopped = false;					//CPU STOP status.
	//Main RAM, MBC RAM, GBC Main RAM, VRAM, etc.
	let memoryReader = [];						//Array of functions mapped to read back memory
	let memoryWriter = [];						//Array of functions mapped to write to memory
	let memoryHighReader = [];					//Array of functions mapped to read back 0xFFXX memory
	let memoryHighWriter = [];					//Array of functions mapped to write to 0xFFXX memory
	let ROM = [];								//The full ROM file dumped to an array.
	let memory = [];							//Main Core Memory
	let MBCRam = [];							//Switchable RAM (Used by games for more RAM) for the main memory range 0xA000 - 0xC000.
	let VRAM = [];								//Extra VRAM bank for GBC.
	let GBCMemory = [];						//GBC main RAM Banks
	let MBC1Mode = false;						//MBC1 Type (4/32, 16/8)
	let MBCRAMBanksEnabled = false;			//MBC RAM Access Control.
	let currMBCRAMBank = 0;					//MBC Currently Indexed RAM Bank
	let currMBCRAMBankPosition = -0xA000;		//MBC Position Adder;
	let cGBC = false;							//GameBoy Color detection.
	let gbcRamBank = 1;						//Currently Switched GameBoy Color ram bank
	let gbcRamBankPosition = -0xD000;			//GBC RAM offset from address start.
	let gbcRamBankPositionECHO = -0xF000;		//GBC RAM (ECHO mirroring) offset from address start.
	let RAMBanks = [0, 1, 2, 4, 16];			//Used to map the RAM banks to maximum size the MBC used can do.
	let ROMBank1offs = 0;						//Offset of the ROM bank switching.
	let currentROMBank = 0;					//The parsed current ROM bank selection.
	let cartridgeType = 0;						//Cartridge Type
	let name = "";								//Name of the game
	let gameCode = "";							//Game code (Suffix for older games)
	let fromSaveState = false;					//A boolean to see if let was loaded in as a save state.
	let savedStateFileName = "";				//When loaded in as a save state, let will not be empty.
	let STATTracker = 0;						//Tracker for STAT triggering.
	let modeSTAT = 0;							//The scan line mode (for lines 1-144 it's 2-3-0, for 145-154 it's 1)
	let spriteCount = 252;						//Mode 3 extra clocking counter (Depends on how many sprites are on the current line.).
	let LYCMatchTriggerSTAT = false;			//Should we trigger an interrupt if LY==LYC?
	let mode2TriggerSTAT = false;				//Should we trigger an interrupt if in mode 2?
	let mode1TriggerSTAT = false;				//Should we trigger an interrupt if in mode 1?
	let mode0TriggerSTAT = false;				//Should we trigger an interrupt if in mode 0?
	let LCDisOn = false;						//Is the emulated LCD controller on?
	let LINECONTROL = [];						//Array of functions to handle each scan line we do (onscreen + offscreen)
	let DISPLAYOFFCONTROL = [function (parentObj) {
		//Array of line 0 function to handle the LCD controller when it's off (Do nothing!).
	}];
	let LCDCONTROL = null;						//Pointer to either LINECONTROL or DISPLAYOFFCONTROL.
	// initializeLCDController();				//Compile the LCD controller functions.
	//RTC (Real Time Clock for MBC3):
	let RTCisLatched = false;
	let latchedSeconds = 0;					//RTC latched seconds.
	let latchedMinutes = 0;					//RTC latched minutes.
	let latchedHours = 0;						//RTC latched hours.
	let latchedLDays = 0;						//RTC latched lower 8-bits of the day counter.
	let latchedHDays = 0;						//RTC latched high-bit of the day counter.
	let RTCSeconds = 0;						//RTC seconds counter.
	let RTCMinutes = 0;						//RTC minutes counter.
	let RTCHours = 0;							//RTC hours counter.
	let RTCDays = 0;							//RTC days counter.
	let RTCDayOverFlow = false;				//Did the RTC overflow and wrap the day counter?
	let RTCHALT = false;						//Is the RTC allowed to clock up?
	//Gyro:
	let highX = 127;
	let lowX = 127;
	let highY = 127;
	let lowY = 127;
	//Sound variables:
	let audioHandle = null;						//XAudioJS handle
	let numSamplesTotal = 0;						//Length of the sound buffers.
	let dutyLookup = [								//Map the duty values given to ones we can work with.
		[false, false, false, false, false, false, false, true],
		[true, false, false, false, false, false, false, true],
		[true, false, false, false, false, true, true, true],
		[false, true, true, true, true, true, true, false]
	];
	let bufferContainAmount = 0;					//Buffer maintenance metric.
	let LSFR15Table = null;
	let LSFR7Table = null;
	let channel1FrequencyTracker = 0x2000;
	let channel1DutyTracker = 0;
	let channel1CachedDuty = dutyLookup[2];
	let channel1totalLength = 0;
	let channel1envelopeVolume = 0;
	let channel1envelopeType = false;
	let channel1envelopeSweeps = 0;
	let channel1envelopeSweepsLast = 0;
	let channel1consecutive = true;
	let channel1frequency = 0;
	let channel1SweepFault = false;
	let channel1ShadowFrequency = 0;
	let channel1timeSweep = 1;
	let channel1lastTimeSweep = 0;
	let channel1Swept = false;
	let channel1frequencySweepDivider = 0;
	let channel1decreaseSweep = false;
	let channel2FrequencyTracker = 0x2000;
	let channel2DutyTracker = 0;
	let channel2CachedDuty = dutyLookup[2];
	let channel2totalLength = 0;
	let channel2envelopeVolume = 0;
	let channel2envelopeType = false;
	let channel2envelopeSweeps = 0;
	let channel2envelopeSweepsLast = 0;
	let channel2consecutive = true;
	let channel2frequency = 0;
	let channel3canPlay = false;
	let channel3totalLength = 0;
	let channel3patternType = 4;
	let channel3frequency = 0;
	let channel3consecutive = true;
	let channel4totalLength = 0;
	let channel4envelopeVolume = 0;
	let channel4currentVolume = 0;
	let channel4envelopeType = false;
	let channel4envelopeSweeps = 0;
	let channel4envelopeSweepsLast = 0;
	let channel4consecutive = true;
	let channel4BitRange = 0x7FFF;
	let channel4VolumeShifter = 15;
	let channel1FrequencyCounter = 0x2000;
	let channel2FrequencyCounter = 0x2000;
	let channel3Counter = 0x800;
	let channel3FrequencyPeriod = 0x800;
	let channel3lastSampleLookup = 0;
	let channel4lastSampleLookup = 0;
	let VinLeftChannelMasterVolume = 8;
	let VinRightChannelMasterVolume = 8;
	let mixerOutputCache = 0;
	let sequencerClocks = 0x2000;
	let sequencePosition = 0;
	let channel4FrequencyPeriod = 8;
	let channel4Counter = 8;
	let cachedChannel3Sample = 0;
	let cachedChannel4Sample = 0;
	let channel1Enabled = false;
	let channel2Enabled = false;
	let channel3Enabled = false;
	let channel4Enabled = false;
	let channel1canPlay = false;
	let channel2canPlay = false;
	let channel4canPlay = false;
	let audioClocksUntilNextEvent = 1;
	let audioClocksUntilNextEventCounter = 1;
	channel1OutputLevelCache();
	channel2OutputLevelCache();
	channel3OutputLevelCache();
	channel4OutputLevelCache();
	let noiseSampleTable = LSFR15Table;
	let soundMasterEnabled = false;			//As its name implies
	let channel3PCM = null;					//Channel 3 adjusted sample buffer.
	//Channel paths enabled:
	let leftChannel1 = false;
	let leftChannel2 = false;
	let leftChannel3 = false;
	let leftChannel4 = false;
	let rightChannel1 = false;
	let rightChannel2 = false;
	let rightChannel3 = false;
	let rightChannel4 = false;
	//Channel output level caches:
	let channel1currentSampleLeft = 0;
	let channel1currentSampleRight = 0;
	let channel2currentSampleLeft = 0;
	let channel2currentSampleRight = 0;
	let channel3currentSampleLeft = 0;
	let channel3currentSampleRight = 0;
	let channel4currentSampleLeft = 0;
	let channel4currentSampleRight = 0;
	let channel1currentSampleLeftSecondary = 0;
	let channel1currentSampleRightSecondary = 0;
	let channel2currentSampleLeftSecondary = 0;
	let channel2currentSampleRightSecondary = 0;
	let channel3currentSampleLeftSecondary = 0;
	let channel3currentSampleRightSecondary = 0;
	let channel4currentSampleLeftSecondary = 0;
	let channel4currentSampleRightSecondary = 0;
	let channel1currentSampleLeftTrimary = 0;
	let channel1currentSampleRightTrimary = 0;
	let channel2currentSampleLeftTrimary = 0;
	let channel2currentSampleRightTrimary = 0;
	//Pre-multipliers to cache some calculations:
	let emulatorSpeed = 1;
	let clocksPerSecond = emulatorSpeed * 0x400000;
	baseCPUCyclesPerIteration = clocksPerSecond / 1000 * settings.emulatorLoopInterval;
	CPUCyclesTotalRoundoff = baseCPUCyclesPerIteration % 4;
	CPUCyclesTotalBase = CPUCyclesTotal = (baseCPUCyclesPerIteration - CPUCyclesTotalRoundoff) | 0;
	CPUCyclesTotalCurrent = 0;
	//Audio generation counters:
	let audioTicks = 0;				//Used to sample the audio system every x CPU instructions.
	let audioIndex = 0;				//Used to keep alignment on audio generation.
	let downsampleInput = 0;
	let audioDestinationPosition = 0;	//Used to keep alignment on audio generation.
	let rollover = 0;					//Used to keep alignment on the number of samples to output (Realign from counter alias).
	//Timing Variables
	// let emulatorTicks = 0;				//Times for how many instructions to execute before ending the loop.
	let DIVTicks = 56;					//DIV Ticks Counter (Invisible lower 8-bit)
	// let LCDTicks = 60;					//Counter for how many instructions have been executed on a scanline so far.
	let timerTicks = 0;				//Counter for the TIMA timer.
	let TIMAEnabled = false;			//Is TIMA enabled?
	let TACClocker = 1024;				//Timer Max Ticks
	let serialTimer = 0;				//Serial IRQ Timer
	let serialShiftTimer = 0;			//Serial Transfer Shift Timer
	let serialShiftTimerAllocated = 0;	//Serial Transfer Shift Timer Refill
	let IRQEnableDelay = 0;			//Are the interrupts on queue to be enabled?
	var dateVar = new Date();
	let lastIteration = dateVar.getTime();//The last time we iterated the main loop.
	dateVar = new Date();
	let firstIteration = dateVar.getTime();
	let iterations = 0;
	let actualScanLine = 0;			//Actual scan line...
	let lastUnrenderedLine = 0;		//Last rendered scan line...
	let queuedScanLines = 0;
	let totalLinesPassed = 0;
	let haltPostClocks = 0;			//Post-Halt clocking.
	//ROM Cartridge Components:
	let cMBC1 = false;					//Does the cartridge use MBC1?
	let cMBC2 = false;					//Does the cartridge use MBC2?
	let cMBC3 = false;					//Does the cartridge use MBC3?
	let cMBC5 = false;					//Does the cartridge use MBC5?
	let cMBC7 = false;					//Does the cartridge use MBC7?
	let cSRAM = false;					//Does the cartridge use save RAM?
	let cMMMO1 = false;				//...
	let cRUMBLE = false;				//Does the cartridge use the RUMBLE addressing (modified MBC5)?
	let cCamera = false;				//Is the cartridge actually a GameBoy Camera?
	let cTAMA5 = false;				//Does the cartridge use TAMA5? (Tamagotchi Cartridge)
	let cHuC3 = false;					//Does the cartridge use HuC3 (Hudson Soft / modified MBC3)?
	let cHuC1 = false;					//Does the cartridge use HuC1 (Hudson Soft / modified MBC1)?
	let cTIMER = false;				//Does the cartridge have an RTC?
	let ROMBanks = [					// 1 Bank = 16 KBytes = 256 Kbits
		2, 4, 8, 16, 32, 64, 128, 256, 512
	];
	ROMBanks[0x52] = 72;
	ROMBanks[0x53] = 80;
	ROMBanks[0x54] = 96;
	let numRAMBanks = 0;					//How many RAM banks were actually allocated?
	////Graphics Variables
	let currVRAMBank = 0;					//Current VRAM bank for GBC.
	let backgroundX = 0;					//Register SCX (X-Scroll)
	let backgroundY = 0;					//Register SCY (Y-Scroll)
	let gfxWindowDisplay = false;			//Is the windows enabled?
	let gfxSpriteShow = false;				//Are sprites enabled?
	let gfxSpriteNormalHeight = true;		//Are we doing 8x8 or 8x16 sprites?
	let bgEnabled = true;					//Is the BG enabled?
	let BGPriorityEnabled = true;			//Can we flag the BG for priority over sprites?
	let gfxWindowCHRBankPosition = 0;		//The current bank of the character map the window uses.
	let gfxBackgroundCHRBankPosition = 0;	//The current bank of the character map the BG uses.
	let gfxBackgroundBankOffset = 0x80;	//Fast mapping of the tile numbering/
	let windowY = 0;						//Current Y offset of the window.
	let windowX = 0;						//Current X offset of the window.
	let drewBlank = 0;						//To prevent the repeating of drawing a blank screen.
	let drewFrame = false;					//Throttle how many draws we can do to once per iteration.
	let midScanlineOffset = -1;			//mid-scanline rendering offset.
	let pixelEnd = 0;						//track the x-coord limit for line rendering (mid-scanline usage).
	let currentX = 0;						//The x-coord we left off at for mid-scanline rendering.
	//BG Tile Pointer Caches:
	let BGCHRBank1 = null;
	let BGCHRBank2 = null;
	let BGCHRCurrentBank = null;
	//Tile Data Cache:
	let tileCache = null;
	//Palettes:
	let colors = [0xEFFFDE, 0xADD794, 0x529273, 0x183442];			//"Classic" GameBoy palette colors.
	let OBJPalette = null;
	let BGPalette = null;
	let gbcOBJRawPalette = null;
	let gbcBGRawPalette = null;
	let gbOBJPalette = null;
	let gbBGPalette = null;
	let gbcOBJPalette = null;
	let gbcBGPalette = null;
	let gbBGColorizedPalette = null;
	let gbOBJColorizedPalette = null;
	let cachedBGPaletteConversion = null;
	let cachedOBJPaletteConversion = null;
	let colorizedGBPalettes = false;
	let BGLayerRender = null;			//Reference to the BG rendering function.
	let WindowLayerRender = null;		//Reference to the window rendering function.
	let SpriteLayerRender = null;		//Reference to the OAM rendering function.
	let frameBuffer = [];				//The internal frame-buffer.
	let swizzledFrame = null;			//The secondary gfx buffer that holds the converted RGBA values.
	let canvasBuffer = null;			//imageData handle
	let pixelStart = 0;				//Temp variable for holding the current working framebuffer offset.
	//Variables used for scaling in JS:
	let resizePathClear = true;
	//Initialize the white noise cache tables ahead of time:
	intializeWhiteNoise();
// const GBBOOTROM = [		//GB BOOT ROM
// 	//Add 256 byte boot rom here if you are going to use it.
// ];
// const GBCBOOTROM = [	//GBC BOOT ROM
// 	//Add 2048 byte boot rom here if you are going to use it.
// ];
// const ffxxDump = [	//Dump of the post-BOOT I/O register state (From gambatte):
// 	0x0F, 0x00, 0x7C, 0xFF, 0x00, 0x00, 0x00, 0xF8, 	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01,
// 	0x80, 0xBF, 0xF3, 0xFF, 0xBF, 0xFF, 0x3F, 0x00, 	0xFF, 0xBF, 0x7F, 0xFF, 0x9F, 0xFF, 0xBF, 0xFF,
// 	0xFF, 0x00, 0x00, 0xBF, 0x77, 0xF3, 0xF1, 0xFF, 	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
// 	0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 	0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF,
// 	0x91, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFC, 	0x00, 0x00, 0x00, 0x00, 0xFF, 0x7E, 0xFF, 0xFE,
// 	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x3E, 0xFF, 	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
// 	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 	0xC0, 0xFF, 0xC1, 0x00, 0xFE, 0xFF, 0xFF, 0xFF,
// 	0xF8, 0xFF, 0x00, 0x00, 0x00, 0x8F, 0x00, 0x00, 	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
// 	0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B, 	0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,
// 	0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E, 	0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,
// 	0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC, 	0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E,
// 	0x45, 0xEC, 0x52, 0xFA, 0x08, 0xB7, 0x07, 0x5D, 	0x01, 0xFD, 0xC0, 0xFF, 0x08, 0xFC, 0x00, 0xE5,
// 	0x0B, 0xF8, 0xC2, 0xCE, 0xF4, 0xF9, 0x0F, 0x7F, 	0x45, 0x6D, 0x3D, 0xFE, 0x46, 0x97, 0x33, 0x5E,
// 	0x08, 0xEF, 0xF1, 0xFF, 0x86, 0x83, 0x24, 0x74, 	0x12, 0xFC, 0x00, 0x9F, 0xB4, 0xB7, 0x06, 0xD5,
// 	0xD0, 0x7A, 0x00, 0x9E, 0x04, 0x5F, 0x41, 0x2F, 	0x1D, 0x77, 0x36, 0x75, 0x81, 0xAA, 0x70, 0x3A,
// 	0x98, 0xD1, 0x71, 0x02, 0x4D, 0x01, 0xC1, 0xFF, 	0x0D, 0x00, 0xD3, 0x05, 0xF9, 0x00, 0x0B, 0x00
// ];
// const OPCODE = [
// 	//NOP
// 	//#0x00:
// 	function (parentObj) {
// 		//Do Nothing...
// 	},
// 	//LD BC, nn
// 	//#0x01:
// 	function (parentObj) {
// 		registerC = memoryReader[programCounter](parentObj, programCounter);
// 		registerB = memoryRead((programCounter + 1) & 0xFFFF);
// 		programCounter = (programCounter + 2) & 0xFFFF;
// 	},
// 	//LD (BC), A
// 	//#0x02:
// 	function (parentObj) {
// 		memoryWrite((registerB << 8) | registerC, registerA);
// 	},
// 	//INC BC
// 	//#0x03:
// 	function (parentObj) {
// 		var temp_var = ((registerB << 8) | registerC) + 1;
// 		registerB = (temp_var >> 8) & 0xFF;
// 		registerC = temp_var & 0xFF;
// 	},
// 	//INC B
// 	//#0x04:
// 	function (parentObj) {
// 		registerB = (registerB + 1) & 0xFF;
// 		FZero = (registerB == 0);
// 		FHalfCarry = ((registerB & 0xF) == 0);
// 		FSubtract = false;
// 	},
// 	//DEC B
// 	//#0x05:
// 	function (parentObj) {
// 		registerB = (registerB - 1) & 0xFF;
// 		FZero = (registerB == 0);
// 		FHalfCarry = ((registerB & 0xF) == 0xF);
// 		FSubtract = true;
// 	},
// 	//LD B, n
// 	//#0x06:
// 	function (parentObj) {
// 		registerB = memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 	},
// 	//RLCA
// 	//#0x07:
// 	function (parentObj) {
// 		FCarry = (registerA > 0x7F);
// 		registerA = ((registerA << 1) & 0xFF) | (registerA >> 7);
// 		FZero = FSubtract = FHalfCarry = false;
// 	},
// 	//LD (nn), SP
// 	//#0x08:
// 	function (parentObj) {
// 		var temp_var = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 2) & 0xFFFF;
// 		memoryWrite(temp_var, stackPointer & 0xFF);
// 		memoryWrite((temp_var + 1) & 0xFFFF, stackPointer >> 8);
// 	},
// 	//ADD HL, BC
// 	//#0x09:
// 	function (parentObj) {
// 		var dirtySum = registersHL + ((registerB << 8) | registerC);
// 		FHalfCarry = ((registersHL & 0xFFF) > (dirtySum & 0xFFF));
// 		FCarry = (dirtySum > 0xFFFF);
// 		registersHL = dirtySum & 0xFFFF;
// 		FSubtract = false;
// 	},
// 	//LD A, (BC)
// 	//#0x0A:
// 	function (parentObj) {
// 		registerA = memoryRead((registerB << 8) | registerC);
// 	},
// 	//DEC BC
// 	//#0x0B:
// 	function (parentObj) {
// 		var temp_var = (((registerB << 8) | registerC) - 1) & 0xFFFF;
// 		registerB = temp_var >> 8;
// 		registerC = temp_var & 0xFF;
// 	},
// 	//INC C
// 	//#0x0C:
// 	function (parentObj) {
// 		registerC = (registerC + 1) & 0xFF;
// 		FZero = (registerC == 0);
// 		FHalfCarry = ((registerC & 0xF) == 0);
// 		FSubtract = false;
// 	},
// 	//DEC C
// 	//#0x0D:
// 	function (parentObj) {
// 		registerC = (registerC - 1) & 0xFF;
// 		FZero = (registerC == 0);
// 		FHalfCarry = ((registerC & 0xF) == 0xF);
// 		FSubtract = true;
// 	},
// 	//LD C, n
// 	//#0x0E:
// 	function (parentObj) {
// 		registerC = memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 	},
// 	//RRCA
// 	//#0x0F:
// 	function (parentObj) {
// 		registerA = (registerA >> 1) | ((registerA & 1) << 7);
// 		FCarry = (registerA > 0x7F);
// 		FZero = FSubtract = FHalfCarry = false;
// 	},
// 	//STOP
// 	//#0x10:
// 	function (parentObj) {
// 		if (cGBC) {
// 			if ((memory[0xFF4D] & 0x01) == 0x01) {		//Speed change requested.
// 				if (memory[0xFF4D] > 0x7F) {				//Go back to single speed mode.
// 					cout("Going into single clock speed mode.", 0);
// 					doubleSpeedShifter = 0;
// 					memory[0xFF4D] &= 0x7F;				//Clear the double speed mode flag.
// 				}
// 				else {												//Go to double speed mode.
// 					cout("Going into double clock speed mode.", 0);
// 					doubleSpeedShifter = 1;
// 					memory[0xFF4D] |= 0x80;				//Set the double speed mode flag.
// 				}
// 				memory[0xFF4D] &= 0xFE;					//Reset the request bit.
// 			}
// 			else {
// 				handleSTOP();
// 			}
// 		}
// 		else {
// 			handleSTOP();
// 		}
// 	},
// 	//LD DE, nn
// 	//#0x11:
// 	function (parentObj) {
// 		registerE = memoryReader[programCounter](parentObj, programCounter);
// 		registerD = memoryRead((programCounter + 1) & 0xFFFF);
// 		programCounter = (programCounter + 2) & 0xFFFF;
// 	},
// 	//LD (DE), A
// 	//#0x12:
// 	function (parentObj) {
// 		memoryWrite((registerD << 8) | registerE, registerA);
// 	},
// 	//INC DE
// 	//#0x13:
// 	function (parentObj) {
// 		var temp_var = ((registerD << 8) | registerE) + 1;
// 		registerD = (temp_var >> 8) & 0xFF;
// 		registerE = temp_var & 0xFF;
// 	},
// 	//INC D
// 	//#0x14:
// 	function (parentObj) {
// 		registerD = (registerD + 1) & 0xFF;
// 		FZero = (registerD == 0);
// 		FHalfCarry = ((registerD & 0xF) == 0);
// 		FSubtract = false;
// 	},
// 	//DEC D
// 	//#0x15:
// 	function (parentObj) {
// 		registerD = (registerD - 1) & 0xFF;
// 		FZero = (registerD == 0);
// 		FHalfCarry = ((registerD & 0xF) == 0xF);
// 		FSubtract = true;
// 	},
// 	//LD D, n
// 	//#0x16:
// 	function (parentObj) {
// 		registerD = memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 	},
// 	//RLA
// 	//#0x17:
// 	function (parentObj) {
// 		var carry_flag = (FCarry) ? 1 : 0;
// 		FCarry = (registerA > 0x7F);
// 		registerA = ((registerA << 1) & 0xFF) | carry_flag;
// 		FZero = FSubtract = FHalfCarry = false;
// 	},
// 	//JR n
// 	//#0x18:
// 	function (parentObj) {
// 		programCounter = (programCounter + ((memoryReader[programCounter](parentObj, programCounter) << 24) >> 24) + 1) & 0xFFFF;
// 	},
// 	//ADD HL, DE
// 	//#0x19:
// 	function (parentObj) {
// 		var dirtySum = registersHL + ((registerD << 8) | registerE);
// 		FHalfCarry = ((registersHL & 0xFFF) > (dirtySum & 0xFFF));
// 		FCarry = (dirtySum > 0xFFFF);
// 		registersHL = dirtySum & 0xFFFF;
// 		FSubtract = false;
// 	},
// 	//LD A, (DE)
// 	//#0x1A:
// 	function (parentObj) {
// 		registerA = memoryRead((registerD << 8) | registerE);
// 	},
// 	//DEC DE
// 	//#0x1B:
// 	function (parentObj) {
// 		var temp_var = (((registerD << 8) | registerE) - 1) & 0xFFFF;
// 		registerD = temp_var >> 8;
// 		registerE = temp_var & 0xFF;
// 	},
// 	//INC E
// 	//#0x1C:
// 	function (parentObj) {
// 		registerE = (registerE + 1) & 0xFF;
// 		FZero = (registerE == 0);
// 		FHalfCarry = ((registerE & 0xF) == 0);
// 		FSubtract = false;
// 	},
// 	//DEC E
// 	//#0x1D:
// 	function (parentObj) {
// 		registerE = (registerE - 1) & 0xFF;
// 		FZero = (registerE == 0);
// 		FHalfCarry = ((registerE & 0xF) == 0xF);
// 		FSubtract = true;
// 	},
// 	//LD E, n
// 	//#0x1E:
// 	function (parentObj) {
// 		registerE = memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 	},
// 	//RRA
// 	//#0x1F:
// 	function (parentObj) {
// 		var carry_flag = (FCarry) ? 0x80 : 0;
// 		FCarry = ((registerA & 1) == 1);
// 		registerA = (registerA >> 1) | carry_flag;
// 		FZero = FSubtract = FHalfCarry = false;
// 	},
// 	//JR NZ, n
// 	//#0x20:
// 	function (parentObj) {
// 		if (!FZero) {
// 			programCounter = (programCounter + ((memoryReader[programCounter](parentObj, programCounter) << 24) >> 24) + 1) & 0xFFFF;
// 			CPUTicks += 4;
// 		}
// 		else {
// 			programCounter = (programCounter + 1) & 0xFFFF;
// 		}
// 	},
// 	//LD HL, nn
// 	//#0x21:
// 	function (parentObj) {
// 		registersHL = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 2) & 0xFFFF;
// 	},
// 	//LDI (HL), A
// 	//#0x22:
// 	function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, registerA);
// 		registersHL = (registersHL + 1) & 0xFFFF;
// 	},
// 	//INC HL
// 	//#0x23:
// 	function (parentObj) {
// 		registersHL = (registersHL + 1) & 0xFFFF;
// 	},
// 	//INC H
// 	//#0x24:
// 	function (parentObj) {
// 		var H = ((registersHL >> 8) + 1) & 0xFF;
// 		FZero = (H == 0);
// 		FHalfCarry = ((H & 0xF) == 0);
// 		FSubtract = false;
// 		registersHL = (H << 8) | (registersHL & 0xFF);
// 	},
// 	//DEC H
// 	//#0x25:
// 	function (parentObj) {
// 		var H = ((registersHL >> 8) - 1) & 0xFF;
// 		FZero = (H == 0);
// 		FHalfCarry = ((H & 0xF) == 0xF);
// 		FSubtract = true;
// 		registersHL = (H << 8) | (registersHL & 0xFF);
// 	},
// 	//LD H, n
// 	//#0x26:
// 	function (parentObj) {
// 		registersHL = (memoryReader[programCounter](parentObj, programCounter) << 8) | (registersHL & 0xFF);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 	},
// 	//DAA
// 	//#0x27:
// 	function (parentObj) {
// 		if (!FSubtract) {
// 			if (FCarry || registerA > 0x99) {
// 				registerA = (registerA + 0x60) & 0xFF;
// 				FCarry = true;
// 			}
// 			if (FHalfCarry || (registerA & 0xF) > 0x9) {
// 				registerA = (registerA + 0x06) & 0xFF;
// 				FHalfCarry = false;
// 			}
// 		}
// 		else if (FCarry && FHalfCarry) {
// 			registerA = (registerA + 0x9A) & 0xFF;
// 			FHalfCarry = false;
// 		}
// 		else if (FCarry) {
// 			registerA = (registerA + 0xA0) & 0xFF;
// 		}
// 		else if (FHalfCarry) {
// 			registerA = (registerA + 0xFA) & 0xFF;
// 			FHalfCarry = false;
// 		}
// 		FZero = (registerA == 0);
// 	},
// 	//JR Z, n
// 	//#0x28:
// 	function (parentObj) {
// 		if (FZero) {
// 			programCounter = (programCounter + ((memoryReader[programCounter](parentObj, programCounter) << 24) >> 24) + 1) & 0xFFFF;
// 			CPUTicks += 4;
// 		}
// 		else {
// 			programCounter = (programCounter + 1) & 0xFFFF;
// 		}
// 	},
// 	//ADD HL, HL
// 	//#0x29:
// 	function (parentObj) {
// 		FHalfCarry = ((registersHL & 0xFFF) > 0x7FF);
// 		FCarry = (registersHL > 0x7FFF);
// 		registersHL = (registersHL << 1) & 0xFFFF;
// 		FSubtract = false;
// 	},
// 	//LDI A, (HL)
// 	//#0x2A:
// 	function (parentObj) {
// 		registerA = memoryReader[registersHL](parentObj, registersHL);
// 		registersHL = (registersHL + 1) & 0xFFFF;
// 	},
// 	//DEC HL
// 	//#0x2B:
// 	function (parentObj) {
// 		registersHL = (registersHL - 1) & 0xFFFF;
// 	},
// 	//INC L
// 	//#0x2C:
// 	function (parentObj) {
// 		var L = (registersHL + 1) & 0xFF;
// 		FZero = (L == 0);
// 		FHalfCarry = ((L & 0xF) == 0);
// 		FSubtract = false;
// 		registersHL = (registersHL & 0xFF00) | L;
// 	},
// 	//DEC L
// 	//#0x2D:
// 	function (parentObj) {
// 		var L = (registersHL - 1) & 0xFF;
// 		FZero = (L == 0);
// 		FHalfCarry = ((L & 0xF) == 0xF);
// 		FSubtract = true;
// 		registersHL = (registersHL & 0xFF00) | L;
// 	},
// 	//LD L, n
// 	//#0x2E:
// 	function (parentObj) {
// 		registersHL = (registersHL & 0xFF00) | memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 	},
// 	//CPL
// 	//#0x2F:
// 	function (parentObj) {
// 		registerA ^= 0xFF;
// 		FSubtract = FHalfCarry = true;
// 	},
// 	//JR NC, n
// 	//#0x30:
// 	function (parentObj) {
// 		if (!FCarry) {
// 			programCounter = (programCounter + ((memoryReader[programCounter](parentObj, programCounter) << 24) >> 24) + 1) & 0xFFFF;
// 			CPUTicks += 4;
// 		}
// 		else {
// 			programCounter = (programCounter + 1) & 0xFFFF;
// 		}
// 	},
// 	//LD SP, nn
// 	//#0x31:
// 	function (parentObj) {
// 		stackPointer = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 2) & 0xFFFF;
// 	},
// 	//LDD (HL), A
// 	//#0x32:
// 	function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, registerA);
// 		registersHL = (registersHL - 1) & 0xFFFF;
// 	},
// 	//INC SP
// 	//#0x33:
// 	function (parentObj) {
// 		stackPointer = (stackPointer + 1) & 0xFFFF;
// 	},
// 	//INC (HL)
// 	//#0x34:
// 	function (parentObj) {
// 		var temp_var = (memoryReader[registersHL](parentObj, registersHL) + 1) & 0xFF;
// 		FZero = (temp_var == 0);
// 		FHalfCarry = ((temp_var & 0xF) == 0);
// 		FSubtract = false;
// 		memoryWriter[registersHL](parentObj, registersHL, temp_var);
// 	},
// 	//DEC (HL)
// 	//#0x35:
// 	function (parentObj) {
// 		var temp_var = (memoryReader[registersHL](parentObj, registersHL) - 1) & 0xFF;
// 		FZero = (temp_var == 0);
// 		FHalfCarry = ((temp_var & 0xF) == 0xF);
// 		FSubtract = true;
// 		memoryWriter[registersHL](parentObj, registersHL, temp_var);
// 	},
// 	//LD (HL), n
// 	//#0x36:
// 	function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[programCounter](parentObj, programCounter));
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 	},
// 	//SCF
// 	//#0x37:
// 	function (parentObj) {
// 		FCarry = true;
// 		FSubtract = FHalfCarry = false;
// 	},
// 	//JR C, n
// 	//#0x38:
// 	function (parentObj) {
// 		if (FCarry) {
// 			programCounter = (programCounter + ((memoryReader[programCounter](parentObj, programCounter) << 24) >> 24) + 1) & 0xFFFF;
// 			CPUTicks += 4;
// 		}
// 		else {
// 			programCounter = (programCounter + 1) & 0xFFFF;
// 		}
// 	},
// 	//ADD HL, SP
// 	//#0x39:
// 	function (parentObj) {
// 		var dirtySum = registersHL + stackPointer;
// 		FHalfCarry = ((registersHL & 0xFFF) > (dirtySum & 0xFFF));
// 		FCarry = (dirtySum > 0xFFFF);
// 		registersHL = dirtySum & 0xFFFF;
// 		FSubtract = false;
// 	},
// 	//LDD A, (HL)
// 	//#0x3A:
// 	function (parentObj) {
// 		registerA = memoryReader[registersHL](parentObj, registersHL);
// 		registersHL = (registersHL - 1) & 0xFFFF;
// 	},
// 	//DEC SP
// 	//#0x3B:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 	},
// 	//INC A
// 	//#0x3C:
// 	function (parentObj) {
// 		registerA = (registerA + 1) & 0xFF;
// 		FZero = (registerA == 0);
// 		FHalfCarry = ((registerA & 0xF) == 0);
// 		FSubtract = false;
// 	},
// 	//DEC A
// 	//#0x3D:
// 	function (parentObj) {
// 		registerA = (registerA - 1) & 0xFF;
// 		FZero = (registerA == 0);
// 		FHalfCarry = ((registerA & 0xF) == 0xF);
// 		FSubtract = true;
// 	},
// 	//LD A, n
// 	//#0x3E:
// 	function (parentObj) {
// 		registerA = memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 	},
// 	//CCF
// 	//#0x3F:
// 	function (parentObj) {
// 		FCarry = !FCarry;
// 		FSubtract = FHalfCarry = false;
// 	},
// 	//LD B, B
// 	//#0x40:
// 	function (parentObj) {
// 		//Do nothing...
// 	},
// 	//LD B, C
// 	//#0x41:
// 	function (parentObj) {
// 		registerB = registerC;
// 	},
// 	//LD B, D
// 	//#0x42:
// 	function (parentObj) {
// 		registerB = registerD;
// 	},
// 	//LD B, E
// 	//#0x43:
// 	function (parentObj) {
// 		registerB = registerE;
// 	},
// 	//LD B, H
// 	//#0x44:
// 	function (parentObj) {
// 		registerB = registersHL >> 8;
// 	},
// 	//LD B, L
// 	//#0x45:
// 	function (parentObj) {
// 		registerB = registersHL & 0xFF;
// 	},
// 	//LD B, (HL)
// 	//#0x46:
// 	function (parentObj) {
// 		registerB = memoryReader[registersHL](parentObj, registersHL);
// 	},
// 	//LD B, A
// 	//#0x47:
// 	function (parentObj) {
// 		registerB = registerA;
// 	},
// 	//LD C, B
// 	//#0x48:
// 	function (parentObj) {
// 		registerC = registerB;
// 	},
// 	//LD C, C
// 	//#0x49:
// 	function (parentObj) {
// 		//Do nothing...
// 	},
// 	//LD C, D
// 	//#0x4A:
// 	function (parentObj) {
// 		registerC = registerD;
// 	},
// 	//LD C, E
// 	//#0x4B:
// 	function (parentObj) {
// 		registerC = registerE;
// 	},
// 	//LD C, H
// 	//#0x4C:
// 	function (parentObj) {
// 		registerC = registersHL >> 8;
// 	},
// 	//LD C, L
// 	//#0x4D:
// 	function (parentObj) {
// 		registerC = registersHL & 0xFF;
// 	},
// 	//LD C, (HL)
// 	//#0x4E:
// 	function (parentObj) {
// 		registerC = memoryReader[registersHL](parentObj, registersHL);
// 	},
// 	//LD C, A
// 	//#0x4F:
// 	function (parentObj) {
// 		registerC = registerA;
// 	},
// 	//LD D, B
// 	//#0x50:
// 	function (parentObj) {
// 		registerD = registerB;
// 	},
// 	//LD D, C
// 	//#0x51:
// 	function (parentObj) {
// 		registerD = registerC;
// 	},
// 	//LD D, D
// 	//#0x52:
// 	function (parentObj) {
// 		//Do nothing...
// 	},
// 	//LD D, E
// 	//#0x53:
// 	function (parentObj) {
// 		registerD = registerE;
// 	},
// 	//LD D, H
// 	//#0x54:
// 	function (parentObj) {
// 		registerD = registersHL >> 8;
// 	},
// 	//LD D, L
// 	//#0x55:
// 	function (parentObj) {
// 		registerD = registersHL & 0xFF;
// 	},
// 	//LD D, (HL)
// 	//#0x56:
// 	function (parentObj) {
// 		registerD = memoryReader[registersHL](parentObj, registersHL);
// 	},
// 	//LD D, A
// 	//#0x57:
// 	function (parentObj) {
// 		registerD = registerA;
// 	},
// 	//LD E, B
// 	//#0x58:
// 	function (parentObj) {
// 		registerE = registerB;
// 	},
// 	//LD E, C
// 	//#0x59:
// 	function (parentObj) {
// 		registerE = registerC;
// 	},
// 	//LD E, D
// 	//#0x5A:
// 	function (parentObj) {
// 		registerE = registerD;
// 	},
// 	//LD E, E
// 	//#0x5B:
// 	function (parentObj) {
// 		//Do nothing...
// 	},
// 	//LD E, H
// 	//#0x5C:
// 	function (parentObj) {
// 		registerE = registersHL >> 8;
// 	},
// 	//LD E, L
// 	//#0x5D:
// 	function (parentObj) {
// 		registerE = registersHL & 0xFF;
// 	},
// 	//LD E, (HL)
// 	//#0x5E:
// 	function (parentObj) {
// 		registerE = memoryReader[registersHL](parentObj, registersHL);
// 	},
// 	//LD E, A
// 	//#0x5F:
// 	function (parentObj) {
// 		registerE = registerA;
// 	},
// 	//LD H, B
// 	//#0x60:
// 	function (parentObj) {
// 		registersHL = (registerB << 8) | (registersHL & 0xFF);
// 	},
// 	//LD H, C
// 	//#0x61:
// 	function (parentObj) {
// 		registersHL = (registerC << 8) | (registersHL & 0xFF);
// 	},
// 	//LD H, D
// 	//#0x62:
// 	function (parentObj) {
// 		registersHL = (registerD << 8) | (registersHL & 0xFF);
// 	},
// 	//LD H, E
// 	//#0x63:
// 	function (parentObj) {
// 		registersHL = (registerE << 8) | (registersHL & 0xFF);
// 	},
// 	//LD H, H
// 	//#0x64:
// 	function (parentObj) {
// 		//Do nothing...
// 	},
// 	//LD H, L
// 	//#0x65:
// 	function (parentObj) {
// 		registersHL = (registersHL & 0xFF) * 0x101;
// 	},
// 	//LD H, (HL)
// 	//#0x66:
// 	function (parentObj) {
// 		registersHL = (memoryReader[registersHL](parentObj, registersHL) << 8) | (registersHL & 0xFF);
// 	},
// 	//LD H, A
// 	//#0x67:
// 	function (parentObj) {
// 		registersHL = (registerA << 8) | (registersHL & 0xFF);
// 	},
// 	//LD L, B
// 	//#0x68:
// 	function (parentObj) {
// 		registersHL = (registersHL & 0xFF00) | registerB;
// 	},
// 	//LD L, C
// 	//#0x69:
// 	function (parentObj) {
// 		registersHL = (registersHL & 0xFF00) | registerC;
// 	},
// 	//LD L, D
// 	//#0x6A:
// 	function (parentObj) {
// 		registersHL = (registersHL & 0xFF00) | registerD;
// 	},
// 	//LD L, E
// 	//#0x6B:
// 	function (parentObj) {
// 		registersHL = (registersHL & 0xFF00) | registerE;
// 	},
// 	//LD L, H
// 	//#0x6C:
// 	function (parentObj) {
// 		registersHL = (registersHL & 0xFF00) | (registersHL >> 8);
// 	},
// 	//LD L, L
// 	//#0x6D:
// 	function (parentObj) {
// 		//Do nothing...
// 	},
// 	//LD L, (HL)
// 	//#0x6E:
// 	function (parentObj) {
// 		registersHL = (registersHL & 0xFF00) | memoryReader[registersHL](parentObj, registersHL);
// 	},
// 	//LD L, A
// 	//#0x6F:
// 	function (parentObj) {
// 		registersHL = (registersHL & 0xFF00) | registerA;
// 	},
// 	//LD (HL), B
// 	//#0x70:
// 	function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, registerB);
// 	},
// 	//LD (HL), C
// 	//#0x71:
// 	function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, registerC);
// 	},
// 	//LD (HL), D
// 	//#0x72:
// 	function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, registerD);
// 	},
// 	//LD (HL), E
// 	//#0x73:
// 	function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, registerE);
// 	},
// 	//LD (HL), H
// 	//#0x74:
// 	function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, registersHL >> 8);
// 	},
// 	//LD (HL), L
// 	//#0x75:
// 	function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, registersHL & 0xFF);
// 	},
// 	//HALT
// 	//#0x76:
// 	function (parentObj) {
// 		//See if there's already an IRQ match:
// 		if ((interruptsEnabled & interruptsRequested & 0x1F) > 0) {
// 			if (!cGBC && !usedBootROM) {
// 				//HALT bug in the DMG CPU model (Program Counter fails to increment for one instruction after HALT):
// 				skipPCIncrement = true;
// 			}
// 			else {
// 				//CGB gets around the HALT PC bug by doubling the hidden NOP.
// 				CPUTicks += 4;
// 			}
// 		}
// 		else {
// 			//CPU is stalled until the next IRQ match:
// 			calculateHALTPeriod();
// 		}
// 	},
// 	//LD (HL), A
// 	//#0x77:
// 	function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, registerA);
// 	},
// 	//LD A, B
// 	//#0x78:
// 	function (parentObj) {
// 		registerA = registerB;
// 	},
// 	//LD A, C
// 	//#0x79:
// 	function (parentObj) {
// 		registerA = registerC;
// 	},
// 	//LD A, D
// 	//#0x7A:
// 	function (parentObj) {
// 		registerA = registerD;
// 	},
// 	//LD A, E
// 	//#0x7B:
// 	function (parentObj) {
// 		registerA = registerE;
// 	},
// 	//LD A, H
// 	//#0x7C:
// 	function (parentObj) {
// 		registerA = registersHL >> 8;
// 	},
// 	//LD A, L
// 	//#0x7D:
// 	function (parentObj) {
// 		registerA = registersHL & 0xFF;
// 	},
// 	//LD, A, (HL)
// 	//#0x7E:
// 	function (parentObj) {
// 		registerA = memoryReader[registersHL](parentObj, registersHL);
// 	},
// 	//LD A, A
// 	//#0x7F:
// 	function (parentObj) {
// 		//Do Nothing...
// 	},
// 	//ADD A, B
// 	//#0x80:
// 	function (parentObj) {
// 		var dirtySum = registerA + registerB;
// 		FHalfCarry = ((dirtySum & 0xF) < (registerA & 0xF));
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADD A, C
// 	//#0x81:
// 	function (parentObj) {
// 		var dirtySum = registerA + registerC;
// 		FHalfCarry = ((dirtySum & 0xF) < (registerA & 0xF));
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADD A, D
// 	//#0x82:
// 	function (parentObj) {
// 		var dirtySum = registerA + registerD;
// 		FHalfCarry = ((dirtySum & 0xF) < (registerA & 0xF));
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADD A, E
// 	//#0x83:
// 	function (parentObj) {
// 		var dirtySum = registerA + registerE;
// 		FHalfCarry = ((dirtySum & 0xF) < (registerA & 0xF));
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADD A, H
// 	//#0x84:
// 	function (parentObj) {
// 		var dirtySum = registerA + (registersHL >> 8);
// 		FHalfCarry = ((dirtySum & 0xF) < (registerA & 0xF));
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADD A, L
// 	//#0x85:
// 	function (parentObj) {
// 		var dirtySum = registerA + (registersHL & 0xFF);
// 		FHalfCarry = ((dirtySum & 0xF) < (registerA & 0xF));
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADD A, (HL)
// 	//#0x86:
// 	function (parentObj) {
// 		var dirtySum = registerA + memoryReader[registersHL](parentObj, registersHL);
// 		FHalfCarry = ((dirtySum & 0xF) < (registerA & 0xF));
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADD A, A
// 	//#0x87:
// 	function (parentObj) {
// 		FHalfCarry = ((registerA & 0x8) == 0x8);
// 		FCarry = (registerA > 0x7F);
// 		registerA = (registerA << 1) & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADC A, B
// 	//#0x88:
// 	function (parentObj) {
// 		var dirtySum = registerA + registerB + ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) + (registerB & 0xF) + ((FCarry) ? 1 : 0) > 0xF);
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADC A, C
// 	//#0x89:
// 	function (parentObj) {
// 		var dirtySum = registerA + registerC + ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) + (registerC & 0xF) + ((FCarry) ? 1 : 0) > 0xF);
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADC A, D
// 	//#0x8A:
// 	function (parentObj) {
// 		var dirtySum = registerA + registerD + ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) + (registerD & 0xF) + ((FCarry) ? 1 : 0) > 0xF);
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADC A, E
// 	//#0x8B:
// 	function (parentObj) {
// 		var dirtySum = registerA + registerE + ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) + (registerE & 0xF) + ((FCarry) ? 1 : 0) > 0xF);
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADC A, H
// 	//#0x8C:
// 	function (parentObj) {
// 		var tempValue = (registersHL >> 8);
// 		var dirtySum = registerA + tempValue + ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) + (tempValue & 0xF) + ((FCarry) ? 1 : 0) > 0xF);
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADC A, L
// 	//#0x8D:
// 	function (parentObj) {
// 		var tempValue = (registersHL & 0xFF);
// 		var dirtySum = registerA + tempValue + ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) + (tempValue & 0xF) + ((FCarry) ? 1 : 0) > 0xF);
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADC A, (HL)
// 	//#0x8E:
// 	function (parentObj) {
// 		var tempValue = memoryReader[registersHL](parentObj, registersHL);
// 		var dirtySum = registerA + tempValue + ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) + (tempValue & 0xF) + ((FCarry) ? 1 : 0) > 0xF);
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//ADC A, A
// 	//#0x8F:
// 	function (parentObj) {
// 		//shift left register A one bit for some ops here as an optimization:
// 		var dirtySum = (registerA << 1) | ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((((registerA << 1) & 0x1E) | ((FCarry) ? 1 : 0)) > 0xF);
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//SUB A, B
// 	//#0x90:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerB;
// 		FHalfCarry = ((registerA & 0xF) < (dirtySum & 0xF));
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//SUB A, C
// 	//#0x91:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerC;
// 		FHalfCarry = ((registerA & 0xF) < (dirtySum & 0xF));
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//SUB A, D
// 	//#0x92:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerD;
// 		FHalfCarry = ((registerA & 0xF) < (dirtySum & 0xF));
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//SUB A, E
// 	//#0x93:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerE;
// 		FHalfCarry = ((registerA & 0xF) < (dirtySum & 0xF));
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//SUB A, H
// 	//#0x94:
// 	function (parentObj) {
// 		var dirtySum = registerA - (registersHL >> 8);
// 		FHalfCarry = ((registerA & 0xF) < (dirtySum & 0xF));
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//SUB A, L
// 	//#0x95:
// 	function (parentObj) {
// 		var dirtySum = registerA - (registersHL & 0xFF);
// 		FHalfCarry = ((registerA & 0xF) < (dirtySum & 0xF));
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//SUB A, (HL)
// 	//#0x96:
// 	function (parentObj) {
// 		var dirtySum = registerA - memoryReader[registersHL](parentObj, registersHL);
// 		FHalfCarry = ((registerA & 0xF) < (dirtySum & 0xF));
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//SUB A, A
// 	//#0x97:
// 	function (parentObj) {
// 		//number - same number == 0
// 		registerA = 0;
// 		FHalfCarry = FCarry = false;
// 		FZero = FSubtract = true;
// 	},
// 	//SBC A, B
// 	//#0x98:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerB - ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) - (registerB & 0xF) - ((FCarry) ? 1 : 0) < 0);
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = true;
// 	},
// 	//SBC A, C
// 	//#0x99:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerC - ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) - (registerC & 0xF) - ((FCarry) ? 1 : 0) < 0);
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = true;
// 	},
// 	//SBC A, D
// 	//#0x9A:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerD - ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) - (registerD & 0xF) - ((FCarry) ? 1 : 0) < 0);
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = true;
// 	},
// 	//SBC A, E
// 	//#0x9B:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerE - ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) - (registerE & 0xF) - ((FCarry) ? 1 : 0) < 0);
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = true;
// 	},
// 	//SBC A, H
// 	//#0x9C:
// 	function (parentObj) {
// 		var temp_var = registersHL >> 8;
// 		var dirtySum = registerA - temp_var - ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) - (temp_var & 0xF) - ((FCarry) ? 1 : 0) < 0);
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = true;
// 	},
// 	//SBC A, L
// 	//#0x9D:
// 	function (parentObj) {
// 		var dirtySum = registerA - (registersHL & 0xFF) - ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) - (registersHL & 0xF) - ((FCarry) ? 1 : 0) < 0);
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = true;
// 	},
// 	//SBC A, (HL)
// 	//#0x9E:
// 	function (parentObj) {
// 		var temp_var = memoryReader[registersHL](parentObj, registersHL);
// 		var dirtySum = registerA - temp_var - ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) - (temp_var & 0xF) - ((FCarry) ? 1 : 0) < 0);
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = true;
// 	},
// 	//SBC A, A
// 	//#0x9F:
// 	function (parentObj) {
// 		//Optimized SBC A:
// 		if (FCarry) {
// 			FZero = false;
// 			FSubtract = FHalfCarry = FCarry = true;
// 			registerA = 0xFF;
// 		}
// 		else {
// 			FHalfCarry = FCarry = false;
// 			FSubtract = FZero = true;
// 			registerA = 0;
// 		}
// 	},
// 	//AND B
// 	//#0xA0:
// 	function (parentObj) {
// 		registerA &= registerB;
// 		FZero = (registerA == 0);
// 		FHalfCarry = true;
// 		FSubtract = FCarry = false;
// 	},
// 	//AND C
// 	//#0xA1:
// 	function (parentObj) {
// 		registerA &= registerC;
// 		FZero = (registerA == 0);
// 		FHalfCarry = true;
// 		FSubtract = FCarry = false;
// 	},
// 	//AND D
// 	//#0xA2:
// 	function (parentObj) {
// 		registerA &= registerD;
// 		FZero = (registerA == 0);
// 		FHalfCarry = true;
// 		FSubtract = FCarry = false;
// 	},
// 	//AND E
// 	//#0xA3:
// 	function (parentObj) {
// 		registerA &= registerE;
// 		FZero = (registerA == 0);
// 		FHalfCarry = true;
// 		FSubtract = FCarry = false;
// 	},
// 	//AND H
// 	//#0xA4:
// 	function (parentObj) {
// 		registerA &= (registersHL >> 8);
// 		FZero = (registerA == 0);
// 		FHalfCarry = true;
// 		FSubtract = FCarry = false;
// 	},
// 	//AND L
// 	//#0xA5:
// 	function (parentObj) {
// 		registerA &= registersHL;
// 		FZero = (registerA == 0);
// 		FHalfCarry = true;
// 		FSubtract = FCarry = false;
// 	},
// 	//AND (HL)
// 	//#0xA6:
// 	function (parentObj) {
// 		registerA &= memoryReader[registersHL](parentObj, registersHL);
// 		FZero = (registerA == 0);
// 		FHalfCarry = true;
// 		FSubtract = FCarry = false;
// 	},
// 	//AND A
// 	//#0xA7:
// 	function (parentObj) {
// 		//number & same number = same number
// 		FZero = (registerA == 0);
// 		FHalfCarry = true;
// 		FSubtract = FCarry = false;
// 	},
// 	//XOR B
// 	//#0xA8:
// 	function (parentObj) {
// 		registerA ^= registerB;
// 		FZero = (registerA == 0);
// 		FSubtract = FHalfCarry = FCarry = false;
// 	},
// 	//XOR C
// 	//#0xA9:
// 	function (parentObj) {
// 		registerA ^= registerC;
// 		FZero = (registerA == 0);
// 		FSubtract = FHalfCarry = FCarry = false;
// 	},
// 	//XOR D
// 	//#0xAA:
// 	function (parentObj) {
// 		registerA ^= registerD;
// 		FZero = (registerA == 0);
// 		FSubtract = FHalfCarry = FCarry = false;
// 	},
// 	//XOR E
// 	//#0xAB:
// 	function (parentObj) {
// 		registerA ^= registerE;
// 		FZero = (registerA == 0);
// 		FSubtract = FHalfCarry = FCarry = false;
// 	},
// 	//XOR H
// 	//#0xAC:
// 	function (parentObj) {
// 		registerA ^= (registersHL >> 8);
// 		FZero = (registerA == 0);
// 		FSubtract = FHalfCarry = FCarry = false;
// 	},
// 	//XOR L
// 	//#0xAD:
// 	function (parentObj) {
// 		registerA ^= (registersHL & 0xFF);
// 		FZero = (registerA == 0);
// 		FSubtract = FHalfCarry = FCarry = false;
// 	},
// 	//XOR (HL)
// 	//#0xAE:
// 	function (parentObj) {
// 		registerA ^= memoryReader[registersHL](parentObj, registersHL);
// 		FZero = (registerA == 0);
// 		FSubtract = FHalfCarry = FCarry = false;
// 	},
// 	//XOR A
// 	//#0xAF:
// 	function (parentObj) {
// 		//number ^ same number == 0
// 		registerA = 0;
// 		FZero = true;
// 		FSubtract = FHalfCarry = FCarry = false;
// 	},
// 	//OR B
// 	//#0xB0:
// 	function (parentObj) {
// 		registerA |= registerB;
// 		FZero = (registerA == 0);
// 		FSubtract = FCarry = FHalfCarry = false;
// 	},
// 	//OR C
// 	//#0xB1:
// 	function (parentObj) {
// 		registerA |= registerC;
// 		FZero = (registerA == 0);
// 		FSubtract = FCarry = FHalfCarry = false;
// 	},
// 	//OR D
// 	//#0xB2:
// 	function (parentObj) {
// 		registerA |= registerD;
// 		FZero = (registerA == 0);
// 		FSubtract = FCarry = FHalfCarry = false;
// 	},
// 	//OR E
// 	//#0xB3:
// 	function (parentObj) {
// 		registerA |= registerE;
// 		FZero = (registerA == 0);
// 		FSubtract = FCarry = FHalfCarry = false;
// 	},
// 	//OR H
// 	//#0xB4:
// 	function (parentObj) {
// 		registerA |= (registersHL >> 8);
// 		FZero = (registerA == 0);
// 		FSubtract = FCarry = FHalfCarry = false;
// 	},
// 	//OR L
// 	//#0xB5:
// 	function (parentObj) {
// 		registerA |= (registersHL & 0xFF);
// 		FZero = (registerA == 0);
// 		FSubtract = FCarry = FHalfCarry = false;
// 	},
// 	//OR (HL)
// 	//#0xB6:
// 	function (parentObj) {
// 		registerA |= memoryReader[registersHL](parentObj, registersHL);
// 		FZero = (registerA == 0);
// 		FSubtract = FCarry = FHalfCarry = false;
// 	},
// 	//OR A
// 	//#0xB7:
// 	function (parentObj) {
// 		//number | same number == same number
// 		FZero = (registerA == 0);
// 		FSubtract = FCarry = FHalfCarry = false;
// 	},
// 	//CP B
// 	//#0xB8:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerB;
// 		FHalfCarry = ((dirtySum & 0xF) > (registerA & 0xF));
// 		FCarry = (dirtySum < 0);
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//CP C
// 	//#0xB9:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerC;
// 		FHalfCarry = ((dirtySum & 0xF) > (registerA & 0xF));
// 		FCarry = (dirtySum < 0);
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//CP D
// 	//#0xBA:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerD;
// 		FHalfCarry = ((dirtySum & 0xF) > (registerA & 0xF));
// 		FCarry = (dirtySum < 0);
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//CP E
// 	//#0xBB:
// 	function (parentObj) {
// 		var dirtySum = registerA - registerE;
// 		FHalfCarry = ((dirtySum & 0xF) > (registerA & 0xF));
// 		FCarry = (dirtySum < 0);
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//CP H
// 	//#0xBC:
// 	function (parentObj) {
// 		var dirtySum = registerA - (registersHL >> 8);
// 		FHalfCarry = ((dirtySum & 0xF) > (registerA & 0xF));
// 		FCarry = (dirtySum < 0);
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//CP L
// 	//#0xBD:
// 	function (parentObj) {
// 		var dirtySum = registerA - (registersHL & 0xFF);
// 		FHalfCarry = ((dirtySum & 0xF) > (registerA & 0xF));
// 		FCarry = (dirtySum < 0);
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//CP (HL)
// 	//#0xBE:
// 	function (parentObj) {
// 		var dirtySum = registerA - memoryReader[registersHL](parentObj, registersHL);
// 		FHalfCarry = ((dirtySum & 0xF) > (registerA & 0xF));
// 		FCarry = (dirtySum < 0);
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//CP A
// 	//#0xBF:
// 	function (parentObj) {
// 		FHalfCarry = FCarry = false;
// 		FZero = FSubtract = true;
// 	},
// 	//RET !FZ
// 	//#0xC0:
// 	function (parentObj) {
// 		if (!FZero) {
// 			programCounter = (memoryRead((stackPointer + 1) & 0xFFFF) << 8) | memoryReader[stackPointer](parentObj, stackPointer);
// 			stackPointer = (stackPointer + 2) & 0xFFFF;
// 			CPUTicks += 12;
// 		}
// 	},
// 	//POP BC
// 	//#0xC1:
// 	function (parentObj) {
// 		registerC = memoryReader[stackPointer](parentObj, stackPointer);
// 		registerB = memoryRead((stackPointer + 1) & 0xFFFF);
// 		stackPointer = (stackPointer + 2) & 0xFFFF;
// 	},
// 	//JP !FZ, nn
// 	//#0xC2:
// 	function (parentObj) {
// 		if (!FZero) {
// 			programCounter = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 			CPUTicks += 4;
// 		}
// 		else {
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 		}
// 	},
// 	//JP nn
// 	//#0xC3:
// 	function (parentObj) {
// 		programCounter = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 	},
// 	//CALL !FZ, nn
// 	//#0xC4:
// 	function (parentObj) {
// 		if (!FZero) {
// 			var temp_pc = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 			stackPointer = (stackPointer - 1) & 0xFFFF;
// 			memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 			stackPointer = (stackPointer - 1) & 0xFFFF;
// 			memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 			programCounter = temp_pc;
// 			CPUTicks += 12;
// 		}
// 		else {
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 		}
// 	},
// 	//PUSH BC
// 	//#0xC5:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, registerB);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, registerC);
// 	},
// 	//ADD, n
// 	//#0xC6:
// 	function (parentObj) {
// 		var dirtySum = registerA + memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 		FHalfCarry = ((dirtySum & 0xF) < (registerA & 0xF));
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//RST 0
// 	//#0xC7:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 		programCounter = 0;
// 	},
// 	//RET FZ
// 	//#0xC8:
// 	function (parentObj) {
// 		if (FZero) {
// 			programCounter = (memoryRead((stackPointer + 1) & 0xFFFF) << 8) | memoryReader[stackPointer](parentObj, stackPointer);
// 			stackPointer = (stackPointer + 2) & 0xFFFF;
// 			CPUTicks += 12;
// 		}
// 	},
// 	//RET
// 	//#0xC9:
// 	function (parentObj) {
// 		programCounter =  (memoryRead((stackPointer + 1) & 0xFFFF) << 8) | memoryReader[stackPointer](parentObj, stackPointer);
// 		stackPointer = (stackPointer + 2) & 0xFFFF;
// 	},
// 	//JP FZ, nn
// 	//#0xCA:
// 	function (parentObj) {
// 		if (FZero) {
// 			programCounter = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 			CPUTicks += 4;
// 		}
// 		else {
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 		}
// 	},
// 	//Secondary OP Code Set:
// 	//#0xCB:
// 	function (parentObj) {
// 		var opcode = memoryReader[programCounter](parentObj, programCounter);
// 		//Increment the program counter to the next instruction:
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 		//Get how many CPU cycles the current 0xCBXX op code counts for:
// 		CPUTicks += SecondaryTICKTable[opcode];
// 		//Execute secondary OP codes for the 0xCB OP code call.
// 		CBOPCODE[opcode](parentObj);
// 	},
// 	//CALL FZ, nn
// 	//#0xCC:
// 	function (parentObj) {
// 		if (FZero) {
// 			var temp_pc = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 			stackPointer = (stackPointer - 1) & 0xFFFF;
// 			memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 			stackPointer = (stackPointer - 1) & 0xFFFF;
// 			memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 			programCounter = temp_pc;
// 			CPUTicks += 12;
// 		}
// 		else {
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 		}
// 	},
// 	//CALL nn
// 	//#0xCD:
// 	function (parentObj) {
// 		var temp_pc = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 2) & 0xFFFF;
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 		programCounter = temp_pc;
// 	},
// 	//ADC A, n
// 	//#0xCE:
// 	function (parentObj) {
// 		var tempValue = memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 		var dirtySum = registerA + tempValue + ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) + (tempValue & 0xF) + ((FCarry) ? 1 : 0) > 0xF);
// 		FCarry = (dirtySum > 0xFF);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = false;
// 	},
// 	//RST 0x8
// 	//#0xCF:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 		programCounter = 0x8;
// 	},
// 	//RET !FC
// 	//#0xD0:
// 	function (parentObj) {
// 		if (!FCarry) {
// 			programCounter = (memoryRead((stackPointer + 1) & 0xFFFF) << 8) | memoryReader[stackPointer](parentObj, stackPointer);
// 			stackPointer = (stackPointer + 2) & 0xFFFF;
// 			CPUTicks += 12;
// 		}
// 	},
// 	//POP DE
// 	//#0xD1:
// 	function (parentObj) {
// 		registerE = memoryReader[stackPointer](parentObj, stackPointer);
// 		registerD = memoryRead((stackPointer + 1) & 0xFFFF);
// 		stackPointer = (stackPointer + 2) & 0xFFFF;
// 	},
// 	//JP !FC, nn
// 	//#0xD2:
// 	function (parentObj) {
// 		if (!FCarry) {
// 			programCounter = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 			CPUTicks += 4;
// 		}
// 		else {
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 		}
// 	},
// 	//0xD3 - Illegal
// 	//#0xD3:
// 	function (parentObj) {
// 		cout("Illegal op code 0xD3 called, pausing emulation.", 2);
// 		pause();
// 	},
// 	//CALL !FC, nn
// 	//#0xD4:
// 	function (parentObj) {
// 		if (!FCarry) {
// 			var temp_pc = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 			stackPointer = (stackPointer - 1) & 0xFFFF;
// 			memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 			stackPointer = (stackPointer - 1) & 0xFFFF;
// 			memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 			programCounter = temp_pc;
// 			CPUTicks += 12;
// 		}
// 		else {
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 		}
// 	},
// 	//PUSH DE
// 	//#0xD5:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, registerD);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, registerE);
// 	},
// 	//SUB A, n
// 	//#0xD6:
// 	function (parentObj) {
// 		var dirtySum = registerA - memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 		FHalfCarry = ((registerA & 0xF) < (dirtySum & 0xF));
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//RST 0x10
// 	//#0xD7:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 		programCounter = 0x10;
// 	},
// 	//RET FC
// 	//#0xD8:
// 	function (parentObj) {
// 		if (FCarry) {
// 			programCounter = (memoryRead((stackPointer + 1) & 0xFFFF) << 8) | memoryReader[stackPointer](parentObj, stackPointer);
// 			stackPointer = (stackPointer + 2) & 0xFFFF;
// 			CPUTicks += 12;
// 		}
// 	},
// 	//RETI
// 	//#0xD9:
// 	function (parentObj) {
// 		programCounter = (memoryRead((stackPointer + 1) & 0xFFFF) << 8) | memoryReader[stackPointer](parentObj, stackPointer);
// 		stackPointer = (stackPointer + 2) & 0xFFFF;
// 		//Immediate for HALT:
// 		IRQEnableDelay = (IRQEnableDelay == 2 || memoryReader[programCounter](parentObj, programCounter) == 0x76) ? 1 : 2;
// 	},
// 	//JP FC, nn
// 	//#0xDA:
// 	function (parentObj) {
// 		if (FCarry) {
// 			programCounter = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 			CPUTicks += 4;
// 		}
// 		else {
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 		}
// 	},
// 	//0xDB - Illegal
// 	//#0xDB:
// 	function (parentObj) {
// 		cout("Illegal op code 0xDB called, pausing emulation.", 2);
// 		pause();
// 	},
// 	//CALL FC, nn
// 	//#0xDC:
// 	function (parentObj) {
// 		if (FCarry) {
// 			var temp_pc = (memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter);
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 			stackPointer = (stackPointer - 1) & 0xFFFF;
// 			memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 			stackPointer = (stackPointer - 1) & 0xFFFF;
// 			memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 			programCounter = temp_pc;
// 			CPUTicks += 12;
// 		}
// 		else {
// 			programCounter = (programCounter + 2) & 0xFFFF;
// 		}
// 	},
// 	//0xDD - Illegal
// 	//#0xDD:
// 	function (parentObj) {
// 		cout("Illegal op code 0xDD called, pausing emulation.", 2);
// 		pause();
// 	},
// 	//SBC A, n
// 	//#0xDE:
// 	function (parentObj) {
// 		var temp_var = memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 		var dirtySum = registerA - temp_var - ((FCarry) ? 1 : 0);
// 		FHalfCarry = ((registerA & 0xF) - (temp_var & 0xF) - ((FCarry) ? 1 : 0) < 0);
// 		FCarry = (dirtySum < 0);
// 		registerA = dirtySum & 0xFF;
// 		FZero = (registerA == 0);
// 		FSubtract = true;
// 	},
// 	//RST 0x18
// 	//#0xDF:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 		programCounter = 0x18;
// 	},
// 	//LDH (n), A
// 	//#0xE0:
// 	function (parentObj) {
// 		memoryHighWrite(memoryReader[programCounter](parentObj, programCounter), registerA);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 	},
// 	//POP HL
// 	//#0xE1:
// 	function (parentObj) {
// 		registersHL = (memoryRead((stackPointer + 1) & 0xFFFF) << 8) | memoryReader[stackPointer](parentObj, stackPointer);
// 		stackPointer = (stackPointer + 2) & 0xFFFF;
// 	},
// 	//LD (0xFF00 + C), A
// 	//#0xE2:
// 	function (parentObj) {
// 		memoryHighWriter[registerC](parentObj, registerC, registerA);
// 	},
// 	//0xE3 - Illegal
// 	//#0xE3:
// 	function (parentObj) {
// 		cout("Illegal op code 0xE3 called, pausing emulation.", 2);
// 		pause();
// 	},
// 	//0xE4 - Illegal
// 	//#0xE4:
// 	function (parentObj) {
// 		cout("Illegal op code 0xE4 called, pausing emulation.", 2);
// 		pause();
// 	},
// 	//PUSH HL
// 	//#0xE5:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, registersHL >> 8);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, registersHL & 0xFF);
// 	},
// 	//AND n
// 	//#0xE6:
// 	function (parentObj) {
// 		registerA &= memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 		FZero = (registerA == 0);
// 		FHalfCarry = true;
// 		FSubtract = FCarry = false;
// 	},
// 	//RST 0x20
// 	//#0xE7:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 		programCounter = 0x20;
// 	},
// 	//ADD SP, n
// 	//#0xE8:
// 	function (parentObj) {
// 		var temp_value2 = (memoryReader[programCounter](parentObj, programCounter) << 24) >> 24;
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 		var temp_value = (stackPointer + temp_value2) & 0xFFFF;
// 		temp_value2 = stackPointer ^ temp_value2 ^ temp_value;
// 		stackPointer = temp_value;
// 		FCarry = ((temp_value2 & 0x100) == 0x100);
// 		FHalfCarry = ((temp_value2 & 0x10) == 0x10);
// 		FZero = FSubtract = false;
// 	},
// 	//JP, (HL)
// 	//#0xE9:
// 	function (parentObj) {
// 		programCounter = registersHL;
// 	},
// 	//LD n, A
// 	//#0xEA:
// 	function (parentObj) {
// 		memoryWrite((memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter), registerA);
// 		programCounter = (programCounter + 2) & 0xFFFF;
// 	},
// 	//0xEB - Illegal
// 	//#0xEB:
// 	function (parentObj) {
// 		cout("Illegal op code 0xEB called, pausing emulation.", 2);
// 		pause();
// 	},
// 	//0xEC - Illegal
// 	//#0xEC:
// 	function (parentObj) {
// 		cout("Illegal op code 0xEC called, pausing emulation.", 2);
// 		pause();
// 	},
// 	//0xED - Illegal
// 	//#0xED:
// 	function (parentObj) {
// 		cout("Illegal op code 0xED called, pausing emulation.", 2);
// 		pause();
// 	},
// 	//XOR n
// 	//#0xEE:
// 	function (parentObj) {
// 		registerA ^= memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 		FZero = (registerA == 0);
// 		FSubtract = FHalfCarry = FCarry = false;
// 	},
// 	//RST 0x28
// 	//#0xEF:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 		programCounter = 0x28;
// 	},
// 	//LDH A, (n)
// 	//#0xF0:
// 	function (parentObj) {
// 		registerA = memoryHighRead(memoryReader[programCounter](parentObj, programCounter));
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 	},
// 	//POP AF
// 	//#0xF1:
// 	function (parentObj) {
// 		var temp_var = memoryReader[stackPointer](parentObj, stackPointer);
// 		FZero = (temp_var > 0x7F);
// 		FSubtract = ((temp_var & 0x40) == 0x40);
// 		FHalfCarry = ((temp_var & 0x20) == 0x20);
// 		FCarry = ((temp_var & 0x10) == 0x10);
// 		registerA = memoryRead((stackPointer + 1) & 0xFFFF);
// 		stackPointer = (stackPointer + 2) & 0xFFFF;
// 	},
// 	//LD A, (0xFF00 + C)
// 	//#0xF2:
// 	function (parentObj) {
// 		registerA = memoryHighReader[registerC](parentObj, registerC);
// 	},
// 	//DI
// 	//#0xF3:
// 	function (parentObj) {
// 		IME = false;
// 		IRQEnableDelay = 0;
// 	},
// 	//0xF4 - Illegal
// 	//#0xF4:
// 	function (parentObj) {
// 		cout("Illegal op code 0xF4 called, pausing emulation.", 2);
// 		pause();
// 	},
// 	//PUSH AF
// 	//#0xF5:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, registerA);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, ((FZero) ? 0x80 : 0) | ((FSubtract) ? 0x40 : 0) | ((FHalfCarry) ? 0x20 : 0) | ((FCarry) ? 0x10 : 0));
// 	},
// 	//OR n
// 	//#0xF6:
// 	function (parentObj) {
// 		registerA |= memoryReader[programCounter](parentObj, programCounter);
// 		FZero = (registerA == 0);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 		FSubtract = FCarry = FHalfCarry = false;
// 	},
// 	//RST 0x30
// 	//#0xF7:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 		programCounter = 0x30;
// 	},
// 	//LDHL SP, n
// 	//#0xF8:
// 	function (parentObj) {
// 		var temp_var = (memoryReader[programCounter](parentObj, programCounter) << 24) >> 24;
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 		registersHL = (stackPointer + temp_var) & 0xFFFF;
// 		temp_var = stackPointer ^ temp_var ^ registersHL;
// 		FCarry = ((temp_var & 0x100) == 0x100);
// 		FHalfCarry = ((temp_var & 0x10) == 0x10);
// 		FZero = FSubtract = false;
// 	},
// 	//LD SP, HL
// 	//#0xF9:
// 	function (parentObj) {
// 		stackPointer = registersHL;
// 	},
// 	//LD A, (nn)
// 	//#0xFA:
// 	function (parentObj) {
// 		registerA = memoryRead((memoryRead((programCounter + 1) & 0xFFFF) << 8) | memoryReader[programCounter](parentObj, programCounter));
// 		programCounter = (programCounter + 2) & 0xFFFF;
// 	},
// 	//EI
// 	//#0xFB:
// 	function (parentObj) {
// 		//Immediate for HALT:
// 		IRQEnableDelay = (IRQEnableDelay == 2 || memoryReader[programCounter](parentObj, programCounter) == 0x76) ? 1 : 2;
// 	},
// 	//0xFC - Illegal
// 	//#0xFC:
// 	function (parentObj) {
// 		cout("Illegal op code 0xFC called, pausing emulation.", 2);
// 		pause();
// 	},
// 	//0xFD - Illegal
// 	//#0xFD:
// 	function (parentObj) {
// 		cout("Illegal op code 0xFD called, pausing emulation.", 2);
// 		pause();
// 	},
// 	//CP n
// 	//#0xFE:
// 	function (parentObj) {
// 		var dirtySum = registerA - memoryReader[programCounter](parentObj, programCounter);
// 		programCounter = (programCounter + 1) & 0xFFFF;
// 		FHalfCarry = ((dirtySum & 0xF) > (registerA & 0xF));
// 		FCarry = (dirtySum < 0);
// 		FZero = (dirtySum == 0);
// 		FSubtract = true;
// 	},
// 	//RST 0x38
// 	//#0xFF:
// 	function (parentObj) {
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter >> 8);
// 		stackPointer = (stackPointer - 1) & 0xFFFF;
// 		memoryWriter[stackPointer](parentObj, stackPointer, programCounter & 0xFF);
// 		programCounter = 0x38;
// 	}
// ];
// const CBOPCODE = [
// 	//RLC B
// 	//#0x00:
// 	function (parentObj) {
// 		FCarry = (registerB > 0x7F);
// 		registerB = ((registerB << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerB == 0);
// 	}
// 	//RLC C
// 	//#0x01:
// 	,function (parentObj) {
// 		FCarry = (registerC > 0x7F);
// 		registerC = ((registerC << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerC == 0);
// 	}
// 	//RLC D
// 	//#0x02:
// 	,function (parentObj) {
// 		FCarry = (registerD > 0x7F);
// 		registerD = ((registerD << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerD == 0);
// 	}
// 	//RLC E
// 	//#0x03:
// 	,function (parentObj) {
// 		FCarry = (registerE > 0x7F);
// 		registerE = ((registerE << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerE == 0);
// 	}
// 	//RLC H
// 	//#0x04:
// 	,function (parentObj) {
// 		FCarry = (registersHL > 0x7FFF);
// 		registersHL = ((registersHL << 1) & 0xFE00) | ((FCarry) ? 0x100 : 0) | (registersHL & 0xFF);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registersHL < 0x100);
// 	}
// 	//RLC L
// 	//#0x05:
// 	,function (parentObj) {
// 		FCarry = ((registersHL & 0x80) == 0x80);
// 		registersHL = (registersHL & 0xFF00) | ((registersHL << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FHalfCarry = FSubtract = false;
// 		FZero = ((registersHL & 0xFF) == 0);
// 	}
// 	//RLC (HL)
// 	//#0x06:
// 	,function (parentObj) {
// 		var temp_var = memoryReader[registersHL](parentObj, registersHL);
// 		FCarry = (temp_var > 0x7F);
// 		temp_var = ((temp_var << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		memoryWriter[registersHL](parentObj, registersHL, temp_var);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (temp_var == 0);
// 	}
// 	//RLC A
// 	//#0x07:
// 	,function (parentObj) {
// 		FCarry = (registerA > 0x7F);
// 		registerA = ((registerA << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerA == 0);
// 	}
// 	//RRC B
// 	//#0x08:
// 	,function (parentObj) {
// 		FCarry = ((registerB & 0x01) == 0x01);
// 		registerB = ((FCarry) ? 0x80 : 0) | (registerB >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerB == 0);
// 	}
// 	//RRC C
// 	//#0x09:
// 	,function (parentObj) {
// 		FCarry = ((registerC & 0x01) == 0x01);
// 		registerC = ((FCarry) ? 0x80 : 0) | (registerC >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerC == 0);
// 	}
// 	//RRC D
// 	//#0x0A:
// 	,function (parentObj) {
// 		FCarry = ((registerD & 0x01) == 0x01);
// 		registerD = ((FCarry) ? 0x80 : 0) | (registerD >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerD == 0);
// 	}
// 	//RRC E
// 	//#0x0B:
// 	,function (parentObj) {
// 		FCarry = ((registerE & 0x01) == 0x01);
// 		registerE = ((FCarry) ? 0x80 : 0) | (registerE >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerE == 0);
// 	}
// 	//RRC H
// 	//#0x0C:
// 	,function (parentObj) {
// 		FCarry = ((registersHL & 0x0100) == 0x0100);
// 		registersHL = ((FCarry) ? 0x8000 : 0) | ((registersHL >> 1) & 0xFF00) | (registersHL & 0xFF);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registersHL < 0x100);
// 	}
// 	//RRC L
// 	//#0x0D:
// 	,function (parentObj) {
// 		FCarry = ((registersHL & 0x01) == 0x01);
// 		registersHL = (registersHL & 0xFF00) | ((FCarry) ? 0x80 : 0) | ((registersHL & 0xFF) >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = ((registersHL & 0xFF) == 0);
// 	}
// 	//RRC (HL)
// 	//#0x0E:
// 	,function (parentObj) {
// 		var temp_var = memoryReader[registersHL](parentObj, registersHL);
// 		FCarry = ((temp_var & 0x01) == 0x01);
// 		temp_var = ((FCarry) ? 0x80 : 0) | (temp_var >> 1);
// 		memoryWriter[registersHL](parentObj, registersHL, temp_var);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (temp_var == 0);
// 	}
// 	//RRC A
// 	//#0x0F:
// 	,function (parentObj) {
// 		FCarry = ((registerA & 0x01) == 0x01);
// 		registerA = ((FCarry) ? 0x80 : 0) | (registerA >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerA == 0);
// 	}
// 	//RL B
// 	//#0x10:
// 	,function (parentObj) {
// 		var newFCarry = (registerB > 0x7F);
// 		registerB = ((registerB << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerB == 0);
// 	}
// 	//RL C
// 	//#0x11:
// 	,function (parentObj) {
// 		var newFCarry = (registerC > 0x7F);
// 		registerC = ((registerC << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerC == 0);
// 	}
// 	//RL D
// 	//#0x12:
// 	,function (parentObj) {
// 		var newFCarry = (registerD > 0x7F);
// 		registerD = ((registerD << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerD == 0);
// 	}
// 	//RL E
// 	//#0x13:
// 	,function (parentObj) {
// 		var newFCarry = (registerE > 0x7F);
// 		registerE = ((registerE << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerE == 0);
// 	}
// 	//RL H
// 	//#0x14:
// 	,function (parentObj) {
// 		var newFCarry = (registersHL > 0x7FFF);
// 		registersHL = ((registersHL << 1) & 0xFE00) | ((FCarry) ? 0x100 : 0) | (registersHL & 0xFF);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registersHL < 0x100);
// 	}
// 	//RL L
// 	//#0x15:
// 	,function (parentObj) {
// 		var newFCarry = ((registersHL & 0x80) == 0x80);
// 		registersHL = (registersHL & 0xFF00) | ((registersHL << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = ((registersHL & 0xFF) == 0);
// 	}
// 	//RL (HL)
// 	//#0x16:
// 	,function (parentObj) {
// 		var temp_var = memoryReader[registersHL](parentObj, registersHL);
// 		var newFCarry = (temp_var > 0x7F);
// 		temp_var = ((temp_var << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FCarry = newFCarry;
// 		memoryWriter[registersHL](parentObj, registersHL, temp_var);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (temp_var == 0);
// 	}
// 	//RL A
// 	//#0x17:
// 	,function (parentObj) {
// 		var newFCarry = (registerA > 0x7F);
// 		registerA = ((registerA << 1) & 0xFF) | ((FCarry) ? 1 : 0);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerA == 0);
// 	}
// 	//RR B
// 	//#0x18:
// 	,function (parentObj) {
// 		var newFCarry = ((registerB & 0x01) == 0x01);
// 		registerB = ((FCarry) ? 0x80 : 0) | (registerB >> 1);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerB == 0);
// 	}
// 	//RR C
// 	//#0x19:
// 	,function (parentObj) {
// 		var newFCarry = ((registerC & 0x01) == 0x01);
// 		registerC = ((FCarry) ? 0x80 : 0) | (registerC >> 1);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerC == 0);
// 	}
// 	//RR D
// 	//#0x1A:
// 	,function (parentObj) {
// 		var newFCarry = ((registerD & 0x01) == 0x01);
// 		registerD = ((FCarry) ? 0x80 : 0) | (registerD >> 1);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerD == 0);
// 	}
// 	//RR E
// 	//#0x1B:
// 	,function (parentObj) {
// 		var newFCarry = ((registerE & 0x01) == 0x01);
// 		registerE = ((FCarry) ? 0x80 : 0) | (registerE >> 1);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerE == 0);
// 	}
// 	//RR H
// 	//#0x1C:
// 	,function (parentObj) {
// 		var newFCarry = ((registersHL & 0x0100) == 0x0100);
// 		registersHL = ((FCarry) ? 0x8000 : 0) | ((registersHL >> 1) & 0xFF00) | (registersHL & 0xFF);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registersHL < 0x100);
// 	}
// 	//RR L
// 	//#0x1D:
// 	,function (parentObj) {
// 		var newFCarry = ((registersHL & 0x01) == 0x01);
// 		registersHL = (registersHL & 0xFF00) | ((FCarry) ? 0x80 : 0) | ((registersHL & 0xFF) >> 1);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = ((registersHL & 0xFF) == 0);
// 	}
// 	//RR (HL)
// 	//#0x1E:
// 	,function (parentObj) {
// 		var temp_var = memoryReader[registersHL](parentObj, registersHL);
// 		var newFCarry = ((temp_var & 0x01) == 0x01);
// 		temp_var = ((FCarry) ? 0x80 : 0) | (temp_var >> 1);
// 		FCarry = newFCarry;
// 		memoryWriter[registersHL](parentObj, registersHL, temp_var);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (temp_var == 0);
// 	}
// 	//RR A
// 	//#0x1F:
// 	,function (parentObj) {
// 		var newFCarry = ((registerA & 0x01) == 0x01);
// 		registerA = ((FCarry) ? 0x80 : 0) | (registerA >> 1);
// 		FCarry = newFCarry;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerA == 0);
// 	}
// 	//SLA B
// 	//#0x20:
// 	,function (parentObj) {
// 		FCarry = (registerB > 0x7F);
// 		registerB = (registerB << 1) & 0xFF;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerB == 0);
// 	}
// 	//SLA C
// 	//#0x21:
// 	,function (parentObj) {
// 		FCarry = (registerC > 0x7F);
// 		registerC = (registerC << 1) & 0xFF;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerC == 0);
// 	}
// 	//SLA D
// 	//#0x22:
// 	,function (parentObj) {
// 		FCarry = (registerD > 0x7F);
// 		registerD = (registerD << 1) & 0xFF;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerD == 0);
// 	}
// 	//SLA E
// 	//#0x23:
// 	,function (parentObj) {
// 		FCarry = (registerE > 0x7F);
// 		registerE = (registerE << 1) & 0xFF;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerE == 0);
// 	}
// 	//SLA H
// 	//#0x24:
// 	,function (parentObj) {
// 		FCarry = (registersHL > 0x7FFF);
// 		registersHL = ((registersHL << 1) & 0xFE00) | (registersHL & 0xFF);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registersHL < 0x100);
// 	}
// 	//SLA L
// 	//#0x25:
// 	,function (parentObj) {
// 		FCarry = ((registersHL & 0x0080) == 0x0080);
// 		registersHL = (registersHL & 0xFF00) | ((registersHL << 1) & 0xFF);
// 		FHalfCarry = FSubtract = false;
// 		FZero = ((registersHL & 0xFF) == 0);
// 	}
// 	//SLA (HL)
// 	//#0x26:
// 	,function (parentObj) {
// 		var temp_var = memoryReader[registersHL](parentObj, registersHL);
// 		FCarry = (temp_var > 0x7F);
// 		temp_var = (temp_var << 1) & 0xFF;
// 		memoryWriter[registersHL](parentObj, registersHL, temp_var);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (temp_var == 0);
// 	}
// 	//SLA A
// 	//#0x27:
// 	,function (parentObj) {
// 		FCarry = (registerA > 0x7F);
// 		registerA = (registerA << 1) & 0xFF;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerA == 0);
// 	}
// 	//SRA B
// 	//#0x28:
// 	,function (parentObj) {
// 		FCarry = ((registerB & 0x01) == 0x01);
// 		registerB = (registerB & 0x80) | (registerB >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerB == 0);
// 	}
// 	//SRA C
// 	//#0x29:
// 	,function (parentObj) {
// 		FCarry = ((registerC & 0x01) == 0x01);
// 		registerC = (registerC & 0x80) | (registerC >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerC == 0);
// 	}
// 	//SRA D
// 	//#0x2A:
// 	,function (parentObj) {
// 		FCarry = ((registerD & 0x01) == 0x01);
// 		registerD = (registerD & 0x80) | (registerD >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerD == 0);
// 	}
// 	//SRA E
// 	//#0x2B:
// 	,function (parentObj) {
// 		FCarry = ((registerE & 0x01) == 0x01);
// 		registerE = (registerE & 0x80) | (registerE >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerE == 0);
// 	}
// 	//SRA H
// 	//#0x2C:
// 	,function (parentObj) {
// 		FCarry = ((registersHL & 0x0100) == 0x0100);
// 		registersHL = ((registersHL >> 1) & 0xFF00) | (registersHL & 0x80FF);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registersHL < 0x100);
// 	}
// 	//SRA L
// 	//#0x2D:
// 	,function (parentObj) {
// 		FCarry = ((registersHL & 0x0001) == 0x0001);
// 		registersHL = (registersHL & 0xFF80) | ((registersHL & 0xFF) >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = ((registersHL & 0xFF) == 0);
// 	}
// 	//SRA (HL)
// 	//#0x2E:
// 	,function (parentObj) {
// 		var temp_var = memoryReader[registersHL](parentObj, registersHL);
// 		FCarry = ((temp_var & 0x01) == 0x01);
// 		temp_var = (temp_var & 0x80) | (temp_var >> 1);
// 		memoryWriter[registersHL](parentObj, registersHL, temp_var);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (temp_var == 0);
// 	}
// 	//SRA A
// 	//#0x2F:
// 	,function (parentObj) {
// 		FCarry = ((registerA & 0x01) == 0x01);
// 		registerA = (registerA & 0x80) | (registerA >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerA == 0);
// 	}
// 	//SWAP B
// 	//#0x30:
// 	,function (parentObj) {
// 		registerB = ((registerB & 0xF) << 4) | (registerB >> 4);
// 		FZero = (registerB == 0);
// 		FCarry = FHalfCarry = FSubtract = false;
// 	}
// 	//SWAP C
// 	//#0x31:
// 	,function (parentObj) {
// 		registerC = ((registerC & 0xF) << 4) | (registerC >> 4);
// 		FZero = (registerC == 0);
// 		FCarry = FHalfCarry = FSubtract = false;
// 	}
// 	//SWAP D
// 	//#0x32:
// 	,function (parentObj) {
// 		registerD = ((registerD & 0xF) << 4) | (registerD >> 4);
// 		FZero = (registerD == 0);
// 		FCarry = FHalfCarry = FSubtract = false;
// 	}
// 	//SWAP E
// 	//#0x33:
// 	,function (parentObj) {
// 		registerE = ((registerE & 0xF) << 4) | (registerE >> 4);
// 		FZero = (registerE == 0);
// 		FCarry = FHalfCarry = FSubtract = false;
// 	}
// 	//SWAP H
// 	//#0x34:
// 	,function (parentObj) {
// 		registersHL = ((registersHL & 0xF00) << 4) | ((registersHL & 0xF000) >> 4) | (registersHL & 0xFF);
// 		FZero = (registersHL < 0x100);
// 		FCarry = FHalfCarry = FSubtract = false;
// 	}
// 	//SWAP L
// 	//#0x35:
// 	,function (parentObj) {
// 		registersHL = (registersHL & 0xFF00) | ((registersHL & 0xF) << 4) | ((registersHL & 0xF0) >> 4);
// 		FZero = ((registersHL & 0xFF) == 0);
// 		FCarry = FHalfCarry = FSubtract = false;
// 	}
// 	//SWAP (HL)
// 	//#0x36:
// 	,function (parentObj) {
// 		var temp_var = memoryReader[registersHL](parentObj, registersHL);
// 		temp_var = ((temp_var & 0xF) << 4) | (temp_var >> 4);
// 		memoryWriter[registersHL](parentObj, registersHL, temp_var);
// 		FZero = (temp_var == 0);
// 		FCarry = FHalfCarry = FSubtract = false;
// 	}
// 	//SWAP A
// 	//#0x37:
// 	,function (parentObj) {
// 		registerA = ((registerA & 0xF) << 4) | (registerA >> 4);
// 		FZero = (registerA == 0);
// 		FCarry = FHalfCarry = FSubtract = false;
// 	}
// 	//SRL B
// 	//#0x38:
// 	,function (parentObj) {
// 		FCarry = ((registerB & 0x01) == 0x01);
// 		registerB >>= 1;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerB == 0);
// 	}
// 	//SRL C
// 	//#0x39:
// 	,function (parentObj) {
// 		FCarry = ((registerC & 0x01) == 0x01);
// 		registerC >>= 1;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerC == 0);
// 	}
// 	//SRL D
// 	//#0x3A:
// 	,function (parentObj) {
// 		FCarry = ((registerD & 0x01) == 0x01);
// 		registerD >>= 1;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerD == 0);
// 	}
// 	//SRL E
// 	//#0x3B:
// 	,function (parentObj) {
// 		FCarry = ((registerE & 0x01) == 0x01);
// 		registerE >>= 1;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerE == 0);
// 	}
// 	//SRL H
// 	//#0x3C:
// 	,function (parentObj) {
// 		FCarry = ((registersHL & 0x0100) == 0x0100);
// 		registersHL = ((registersHL >> 1) & 0xFF00) | (registersHL & 0xFF);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registersHL < 0x100);
// 	}
// 	//SRL L
// 	//#0x3D:
// 	,function (parentObj) {
// 		FCarry = ((registersHL & 0x0001) == 0x0001);
// 		registersHL = (registersHL & 0xFF00) | ((registersHL & 0xFF) >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = ((registersHL & 0xFF) == 0);
// 	}
// 	//SRL (HL)
// 	//#0x3E:
// 	,function (parentObj) {
// 		var temp_var = memoryReader[registersHL](parentObj, registersHL);
// 		FCarry = ((temp_var & 0x01) == 0x01);
// 		memoryWriter[registersHL](parentObj, registersHL, temp_var >> 1);
// 		FHalfCarry = FSubtract = false;
// 		FZero = (temp_var < 2);
// 	}
// 	//SRL A
// 	//#0x3F:
// 	,function (parentObj) {
// 		FCarry = ((registerA & 0x01) == 0x01);
// 		registerA >>= 1;
// 		FHalfCarry = FSubtract = false;
// 		FZero = (registerA == 0);
// 	}
// 	//BIT 0, B
// 	//#0x40:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerB & 0x01) == 0);
// 	}
// 	//BIT 0, C
// 	//#0x41:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerC & 0x01) == 0);
// 	}
// 	//BIT 0, D
// 	//#0x42:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerD & 0x01) == 0);
// 	}
// 	//BIT 0, E
// 	//#0x43:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerE & 0x01) == 0);
// 	}
// 	//BIT 0, H
// 	//#0x44:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0100) == 0);
// 	}
// 	//BIT 0, L
// 	//#0x45:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0001) == 0);
// 	}
// 	//BIT 0, (HL)
// 	//#0x46:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((memoryReader[registersHL](parentObj, registersHL) & 0x01) == 0);
// 	}
// 	//BIT 0, A
// 	//#0x47:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerA & 0x01) == 0);
// 	}
// 	//BIT 1, B
// 	//#0x48:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerB & 0x02) == 0);
// 	}
// 	//BIT 1, C
// 	//#0x49:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerC & 0x02) == 0);
// 	}
// 	//BIT 1, D
// 	//#0x4A:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerD & 0x02) == 0);
// 	}
// 	//BIT 1, E
// 	//#0x4B:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerE & 0x02) == 0);
// 	}
// 	//BIT 1, H
// 	//#0x4C:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0200) == 0);
// 	}
// 	//BIT 1, L
// 	//#0x4D:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0002) == 0);
// 	}
// 	//BIT 1, (HL)
// 	//#0x4E:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((memoryReader[registersHL](parentObj, registersHL) & 0x02) == 0);
// 	}
// 	//BIT 1, A
// 	//#0x4F:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerA & 0x02) == 0);
// 	}
// 	//BIT 2, B
// 	//#0x50:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerB & 0x04) == 0);
// 	}
// 	//BIT 2, C
// 	//#0x51:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerC & 0x04) == 0);
// 	}
// 	//BIT 2, D
// 	//#0x52:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerD & 0x04) == 0);
// 	}
// 	//BIT 2, E
// 	//#0x53:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerE & 0x04) == 0);
// 	}
// 	//BIT 2, H
// 	//#0x54:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0400) == 0);
// 	}
// 	//BIT 2, L
// 	//#0x55:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0004) == 0);
// 	}
// 	//BIT 2, (HL)
// 	//#0x56:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((memoryReader[registersHL](parentObj, registersHL) & 0x04) == 0);
// 	}
// 	//BIT 2, A
// 	//#0x57:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerA & 0x04) == 0);
// 	}
// 	//BIT 3, B
// 	//#0x58:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerB & 0x08) == 0);
// 	}
// 	//BIT 3, C
// 	//#0x59:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerC & 0x08) == 0);
// 	}
// 	//BIT 3, D
// 	//#0x5A:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerD & 0x08) == 0);
// 	}
// 	//BIT 3, E
// 	//#0x5B:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerE & 0x08) == 0);
// 	}
// 	//BIT 3, H
// 	//#0x5C:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0800) == 0);
// 	}
// 	//BIT 3, L
// 	//#0x5D:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0008) == 0);
// 	}
// 	//BIT 3, (HL)
// 	//#0x5E:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((memoryReader[registersHL](parentObj, registersHL) & 0x08) == 0);
// 	}
// 	//BIT 3, A
// 	//#0x5F:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerA & 0x08) == 0);
// 	}
// 	//BIT 4, B
// 	//#0x60:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerB & 0x10) == 0);
// 	}
// 	//BIT 4, C
// 	//#0x61:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerC & 0x10) == 0);
// 	}
// 	//BIT 4, D
// 	//#0x62:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerD & 0x10) == 0);
// 	}
// 	//BIT 4, E
// 	//#0x63:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerE & 0x10) == 0);
// 	}
// 	//BIT 4, H
// 	//#0x64:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x1000) == 0);
// 	}
// 	//BIT 4, L
// 	//#0x65:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0010) == 0);
// 	}
// 	//BIT 4, (HL)
// 	//#0x66:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((memoryReader[registersHL](parentObj, registersHL) & 0x10) == 0);
// 	}
// 	//BIT 4, A
// 	//#0x67:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerA & 0x10) == 0);
// 	}
// 	//BIT 5, B
// 	//#0x68:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerB & 0x20) == 0);
// 	}
// 	//BIT 5, C
// 	//#0x69:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerC & 0x20) == 0);
// 	}
// 	//BIT 5, D
// 	//#0x6A:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerD & 0x20) == 0);
// 	}
// 	//BIT 5, E
// 	//#0x6B:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerE & 0x20) == 0);
// 	}
// 	//BIT 5, H
// 	//#0x6C:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x2000) == 0);
// 	}
// 	//BIT 5, L
// 	//#0x6D:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0020) == 0);
// 	}
// 	//BIT 5, (HL)
// 	//#0x6E:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((memoryReader[registersHL](parentObj, registersHL) & 0x20) == 0);
// 	}
// 	//BIT 5, A
// 	//#0x6F:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerA & 0x20) == 0);
// 	}
// 	//BIT 6, B
// 	//#0x70:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerB & 0x40) == 0);
// 	}
// 	//BIT 6, C
// 	//#0x71:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerC & 0x40) == 0);
// 	}
// 	//BIT 6, D
// 	//#0x72:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerD & 0x40) == 0);
// 	}
// 	//BIT 6, E
// 	//#0x73:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerE & 0x40) == 0);
// 	}
// 	//BIT 6, H
// 	//#0x74:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x4000) == 0);
// 	}
// 	//BIT 6, L
// 	//#0x75:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0040) == 0);
// 	}
// 	//BIT 6, (HL)
// 	//#0x76:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((memoryReader[registersHL](parentObj, registersHL) & 0x40) == 0);
// 	}
// 	//BIT 6, A
// 	//#0x77:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerA & 0x40) == 0);
// 	}
// 	//BIT 7, B
// 	//#0x78:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerB & 0x80) == 0);
// 	}
// 	//BIT 7, C
// 	//#0x79:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerC & 0x80) == 0);
// 	}
// 	//BIT 7, D
// 	//#0x7A:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerD & 0x80) == 0);
// 	}
// 	//BIT 7, E
// 	//#0x7B:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerE & 0x80) == 0);
// 	}
// 	//BIT 7, H
// 	//#0x7C:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x8000) == 0);
// 	}
// 	//BIT 7, L
// 	//#0x7D:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registersHL & 0x0080) == 0);
// 	}
// 	//BIT 7, (HL)
// 	//#0x7E:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((memoryReader[registersHL](parentObj, registersHL) & 0x80) == 0);
// 	}
// 	//BIT 7, A
// 	//#0x7F:
// 	,function (parentObj) {
// 		FHalfCarry = true;
// 		FSubtract = false;
// 		FZero = ((registerA & 0x80) == 0);
// 	}
// 	//RES 0, B
// 	//#0x80:
// 	,function (parentObj) {
// 		registerB &= 0xFE;
// 	}
// 	//RES 0, C
// 	//#0x81:
// 	,function (parentObj) {
// 		registerC &= 0xFE;
// 	}
// 	//RES 0, D
// 	//#0x82:
// 	,function (parentObj) {
// 		registerD &= 0xFE;
// 	}
// 	//RES 0, E
// 	//#0x83:
// 	,function (parentObj) {
// 		registerE &= 0xFE;
// 	}
// 	//RES 0, H
// 	//#0x84:
// 	,function (parentObj) {
// 		registersHL &= 0xFEFF;
// 	}
// 	//RES 0, L
// 	//#0x85:
// 	,function (parentObj) {
// 		registersHL &= 0xFFFE;
// 	}
// 	//RES 0, (HL)
// 	//#0x86:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) & 0xFE);
// 	}
// 	//RES 0, A
// 	//#0x87:
// 	,function (parentObj) {
// 		registerA &= 0xFE;
// 	}
// 	//RES 1, B
// 	//#0x88:
// 	,function (parentObj) {
// 		registerB &= 0xFD;
// 	}
// 	//RES 1, C
// 	//#0x89:
// 	,function (parentObj) {
// 		registerC &= 0xFD;
// 	}
// 	//RES 1, D
// 	//#0x8A:
// 	,function (parentObj) {
// 		registerD &= 0xFD;
// 	}
// 	//RES 1, E
// 	//#0x8B:
// 	,function (parentObj) {
// 		registerE &= 0xFD;
// 	}
// 	//RES 1, H
// 	//#0x8C:
// 	,function (parentObj) {
// 		registersHL &= 0xFDFF;
// 	}
// 	//RES 1, L
// 	//#0x8D:
// 	,function (parentObj) {
// 		registersHL &= 0xFFFD;
// 	}
// 	//RES 1, (HL)
// 	//#0x8E:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) & 0xFD);
// 	}
// 	//RES 1, A
// 	//#0x8F:
// 	,function (parentObj) {
// 		registerA &= 0xFD;
// 	}
// 	//RES 2, B
// 	//#0x90:
// 	,function (parentObj) {
// 		registerB &= 0xFB;
// 	}
// 	//RES 2, C
// 	//#0x91:
// 	,function (parentObj) {
// 		registerC &= 0xFB;
// 	}
// 	//RES 2, D
// 	//#0x92:
// 	,function (parentObj) {
// 		registerD &= 0xFB;
// 	}
// 	//RES 2, E
// 	//#0x93:
// 	,function (parentObj) {
// 		registerE &= 0xFB;
// 	}
// 	//RES 2, H
// 	//#0x94:
// 	,function (parentObj) {
// 		registersHL &= 0xFBFF;
// 	}
// 	//RES 2, L
// 	//#0x95:
// 	,function (parentObj) {
// 		registersHL &= 0xFFFB;
// 	}
// 	//RES 2, (HL)
// 	//#0x96:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) & 0xFB);
// 	}
// 	//RES 2, A
// 	//#0x97:
// 	,function (parentObj) {
// 		registerA &= 0xFB;
// 	}
// 	//RES 3, B
// 	//#0x98:
// 	,function (parentObj) {
// 		registerB &= 0xF7;
// 	}
// 	//RES 3, C
// 	//#0x99:
// 	,function (parentObj) {
// 		registerC &= 0xF7;
// 	}
// 	//RES 3, D
// 	//#0x9A:
// 	,function (parentObj) {
// 		registerD &= 0xF7;
// 	}
// 	//RES 3, E
// 	//#0x9B:
// 	,function (parentObj) {
// 		registerE &= 0xF7;
// 	}
// 	//RES 3, H
// 	//#0x9C:
// 	,function (parentObj) {
// 		registersHL &= 0xF7FF;
// 	}
// 	//RES 3, L
// 	//#0x9D:
// 	,function (parentObj) {
// 		registersHL &= 0xFFF7;
// 	}
// 	//RES 3, (HL)
// 	//#0x9E:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) & 0xF7);
// 	}
// 	//RES 3, A
// 	//#0x9F:
// 	,function (parentObj) {
// 		registerA &= 0xF7;
// 	}
// 	//RES 3, B
// 	//#0xA0:
// 	,function (parentObj) {
// 		registerB &= 0xEF;
// 	}
// 	//RES 4, C
// 	//#0xA1:
// 	,function (parentObj) {
// 		registerC &= 0xEF;
// 	}
// 	//RES 4, D
// 	//#0xA2:
// 	,function (parentObj) {
// 		registerD &= 0xEF;
// 	}
// 	//RES 4, E
// 	//#0xA3:
// 	,function (parentObj) {
// 		registerE &= 0xEF;
// 	}
// 	//RES 4, H
// 	//#0xA4:
// 	,function (parentObj) {
// 		registersHL &= 0xEFFF;
// 	}
// 	//RES 4, L
// 	//#0xA5:
// 	,function (parentObj) {
// 		registersHL &= 0xFFEF;
// 	}
// 	//RES 4, (HL)
// 	//#0xA6:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) & 0xEF);
// 	}
// 	//RES 4, A
// 	//#0xA7:
// 	,function (parentObj) {
// 		registerA &= 0xEF;
// 	}
// 	//RES 5, B
// 	//#0xA8:
// 	,function (parentObj) {
// 		registerB &= 0xDF;
// 	}
// 	//RES 5, C
// 	//#0xA9:
// 	,function (parentObj) {
// 		registerC &= 0xDF;
// 	}
// 	//RES 5, D
// 	//#0xAA:
// 	,function (parentObj) {
// 		registerD &= 0xDF;
// 	}
// 	//RES 5, E
// 	//#0xAB:
// 	,function (parentObj) {
// 		registerE &= 0xDF;
// 	}
// 	//RES 5, H
// 	//#0xAC:
// 	,function (parentObj) {
// 		registersHL &= 0xDFFF;
// 	}
// 	//RES 5, L
// 	//#0xAD:
// 	,function (parentObj) {
// 		registersHL &= 0xFFDF;
// 	}
// 	//RES 5, (HL)
// 	//#0xAE:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) & 0xDF);
// 	}
// 	//RES 5, A
// 	//#0xAF:
// 	,function (parentObj) {
// 		registerA &= 0xDF;
// 	}
// 	//RES 6, B
// 	//#0xB0:
// 	,function (parentObj) {
// 		registerB &= 0xBF;
// 	}
// 	//RES 6, C
// 	//#0xB1:
// 	,function (parentObj) {
// 		registerC &= 0xBF;
// 	}
// 	//RES 6, D
// 	//#0xB2:
// 	,function (parentObj) {
// 		registerD &= 0xBF;
// 	}
// 	//RES 6, E
// 	//#0xB3:
// 	,function (parentObj) {
// 		registerE &= 0xBF;
// 	}
// 	//RES 6, H
// 	//#0xB4:
// 	,function (parentObj) {
// 		registersHL &= 0xBFFF;
// 	}
// 	//RES 6, L
// 	//#0xB5:
// 	,function (parentObj) {
// 		registersHL &= 0xFFBF;
// 	}
// 	//RES 6, (HL)
// 	//#0xB6:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) & 0xBF);
// 	}
// 	//RES 6, A
// 	//#0xB7:
// 	,function (parentObj) {
// 		registerA &= 0xBF;
// 	}
// 	//RES 7, B
// 	//#0xB8:
// 	,function (parentObj) {
// 		registerB &= 0x7F;
// 	}
// 	//RES 7, C
// 	//#0xB9:
// 	,function (parentObj) {
// 		registerC &= 0x7F;
// 	}
// 	//RES 7, D
// 	//#0xBA:
// 	,function (parentObj) {
// 		registerD &= 0x7F;
// 	}
// 	//RES 7, E
// 	//#0xBB:
// 	,function (parentObj) {
// 		registerE &= 0x7F;
// 	}
// 	//RES 7, H
// 	//#0xBC:
// 	,function (parentObj) {
// 		registersHL &= 0x7FFF;
// 	}
// 	//RES 7, L
// 	//#0xBD:
// 	,function (parentObj) {
// 		registersHL &= 0xFF7F;
// 	}
// 	//RES 7, (HL)
// 	//#0xBE:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) & 0x7F);
// 	}
// 	//RES 7, A
// 	//#0xBF:
// 	,function (parentObj) {
// 		registerA &= 0x7F;
// 	}
// 	//SET 0, B
// 	//#0xC0:
// 	,function (parentObj) {
// 		registerB |= 0x01;
// 	}
// 	//SET 0, C
// 	//#0xC1:
// 	,function (parentObj) {
// 		registerC |= 0x01;
// 	}
// 	//SET 0, D
// 	//#0xC2:
// 	,function (parentObj) {
// 		registerD |= 0x01;
// 	}
// 	//SET 0, E
// 	//#0xC3:
// 	,function (parentObj) {
// 		registerE |= 0x01;
// 	}
// 	//SET 0, H
// 	//#0xC4:
// 	,function (parentObj) {
// 		registersHL |= 0x0100;
// 	}
// 	//SET 0, L
// 	//#0xC5:
// 	,function (parentObj) {
// 		registersHL |= 0x01;
// 	}
// 	//SET 0, (HL)
// 	//#0xC6:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) | 0x01);
// 	}
// 	//SET 0, A
// 	//#0xC7:
// 	,function (parentObj) {
// 		registerA |= 0x01;
// 	}
// 	//SET 1, B
// 	//#0xC8:
// 	,function (parentObj) {
// 		registerB |= 0x02;
// 	}
// 	//SET 1, C
// 	//#0xC9:
// 	,function (parentObj) {
// 		registerC |= 0x02;
// 	}
// 	//SET 1, D
// 	//#0xCA:
// 	,function (parentObj) {
// 		registerD |= 0x02;
// 	}
// 	//SET 1, E
// 	//#0xCB:
// 	,function (parentObj) {
// 		registerE |= 0x02;
// 	}
// 	//SET 1, H
// 	//#0xCC:
// 	,function (parentObj) {
// 		registersHL |= 0x0200;
// 	}
// 	//SET 1, L
// 	//#0xCD:
// 	,function (parentObj) {
// 		registersHL |= 0x02;
// 	}
// 	//SET 1, (HL)
// 	//#0xCE:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) | 0x02);
// 	}
// 	//SET 1, A
// 	//#0xCF:
// 	,function (parentObj) {
// 		registerA |= 0x02;
// 	}
// 	//SET 2, B
// 	//#0xD0:
// 	,function (parentObj) {
// 		registerB |= 0x04;
// 	}
// 	//SET 2, C
// 	//#0xD1:
// 	,function (parentObj) {
// 		registerC |= 0x04;
// 	}
// 	//SET 2, D
// 	//#0xD2:
// 	,function (parentObj) {
// 		registerD |= 0x04;
// 	}
// 	//SET 2, E
// 	//#0xD3:
// 	,function (parentObj) {
// 		registerE |= 0x04;
// 	}
// 	//SET 2, H
// 	//#0xD4:
// 	,function (parentObj) {
// 		registersHL |= 0x0400;
// 	}
// 	//SET 2, L
// 	//#0xD5:
// 	,function (parentObj) {
// 		registersHL |= 0x04;
// 	}
// 	//SET 2, (HL)
// 	//#0xD6:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) | 0x04);
// 	}
// 	//SET 2, A
// 	//#0xD7:
// 	,function (parentObj) {
// 		registerA |= 0x04;
// 	}
// 	//SET 3, B
// 	//#0xD8:
// 	,function (parentObj) {
// 		registerB |= 0x08;
// 	}
// 	//SET 3, C
// 	//#0xD9:
// 	,function (parentObj) {
// 		registerC |= 0x08;
// 	}
// 	//SET 3, D
// 	//#0xDA:
// 	,function (parentObj) {
// 		registerD |= 0x08;
// 	}
// 	//SET 3, E
// 	//#0xDB:
// 	,function (parentObj) {
// 		registerE |= 0x08;
// 	}
// 	//SET 3, H
// 	//#0xDC:
// 	,function (parentObj) {
// 		registersHL |= 0x0800;
// 	}
// 	//SET 3, L
// 	//#0xDD:
// 	,function (parentObj) {
// 		registersHL |= 0x08;
// 	}
// 	//SET 3, (HL)
// 	//#0xDE:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) | 0x08);
// 	}
// 	//SET 3, A
// 	//#0xDF:
// 	,function (parentObj) {
// 		registerA |= 0x08;
// 	}
// 	//SET 4, B
// 	//#0xE0:
// 	,function (parentObj) {
// 		registerB |= 0x10;
// 	}
// 	//SET 4, C
// 	//#0xE1:
// 	,function (parentObj) {
// 		registerC |= 0x10;
// 	}
// 	//SET 4, D
// 	//#0xE2:
// 	,function (parentObj) {
// 		registerD |= 0x10;
// 	}
// 	//SET 4, E
// 	//#0xE3:
// 	,function (parentObj) {
// 		registerE |= 0x10;
// 	}
// 	//SET 4, H
// 	//#0xE4:
// 	,function (parentObj) {
// 		registersHL |= 0x1000;
// 	}
// 	//SET 4, L
// 	//#0xE5:
// 	,function (parentObj) {
// 		registersHL |= 0x10;
// 	}
// 	//SET 4, (HL)
// 	//#0xE6:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) | 0x10);
// 	}
// 	//SET 4, A
// 	//#0xE7:
// 	,function (parentObj) {
// 		registerA |= 0x10;
// 	}
// 	//SET 5, B
// 	//#0xE8:
// 	,function (parentObj) {
// 		registerB |= 0x20;
// 	}
// 	//SET 5, C
// 	//#0xE9:
// 	,function (parentObj) {
// 		registerC |= 0x20;
// 	}
// 	//SET 5, D
// 	//#0xEA:
// 	,function (parentObj) {
// 		registerD |= 0x20;
// 	}
// 	//SET 5, E
// 	//#0xEB:
// 	,function (parentObj) {
// 		registerE |= 0x20;
// 	}
// 	//SET 5, H
// 	//#0xEC:
// 	,function (parentObj) {
// 		registersHL |= 0x2000;
// 	}
// 	//SET 5, L
// 	//#0xED:
// 	,function (parentObj) {
// 		registersHL |= 0x20;
// 	}
// 	//SET 5, (HL)
// 	//#0xEE:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) | 0x20);
// 	}
// 	//SET 5, A
// 	//#0xEF:
// 	,function (parentObj) {
// 		registerA |= 0x20;
// 	}
// 	//SET 6, B
// 	//#0xF0:
// 	,function (parentObj) {
// 		registerB |= 0x40;
// 	}
// 	//SET 6, C
// 	//#0xF1:
// 	,function (parentObj) {
// 		registerC |= 0x40;
// 	}
// 	//SET 6, D
// 	//#0xF2:
// 	,function (parentObj) {
// 		registerD |= 0x40;
// 	}
// 	//SET 6, E
// 	//#0xF3:
// 	,function (parentObj) {
// 		registerE |= 0x40;
// 	}
// 	//SET 6, H
// 	//#0xF4:
// 	,function (parentObj) {
// 		registersHL |= 0x4000;
// 	}
// 	//SET 6, L
// 	//#0xF5:
// 	,function (parentObj) {
// 		registersHL |= 0x40;
// 	}
// 	//SET 6, (HL)
// 	//#0xF6:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) | 0x40);
// 	}
// 	//SET 6, A
// 	//#0xF7:
// 	,function (parentObj) {
// 		registerA |= 0x40;
// 	}
// 	//SET 7, B
// 	//#0xF8:
// 	,function (parentObj) {
// 		registerB |= 0x80;
// 	}
// 	//SET 7, C
// 	//#0xF9:
// 	,function (parentObj) {
// 		registerC |= 0x80;
// 	}
// 	//SET 7, D
// 	//#0xFA:
// 	,function (parentObj) {
// 		registerD |= 0x80;
// 	}
// 	//SET 7, E
// 	//#0xFB:
// 	,function (parentObj) {
// 		registerE |= 0x80;
// 	}
// 	//SET 7, H
// 	//#0xFC:
// 	,function (parentObj) {
// 		registersHL |= 0x8000;
// 	}
// 	//SET 7, L
// 	//#0xFD:
// 	,function (parentObj) {
// 		registersHL |= 0x80;
// 	}
// 	//SET 7, (HL)
// 	//#0xFE:
// 	,function (parentObj) {
// 		memoryWriter[registersHL](parentObj, registersHL, memoryReader[registersHL](parentObj, registersHL) | 0x80);
// 	}
// 	//SET 7, A
// 	//#0xFF:
// 	,function (parentObj) {
// 		registerA |= 0x80;
// 	}
// ];
// const TICKTable = [		//Number of machine cycles for each instruction:
// /*   0,  1,  2,  3,  4,  5,  6,  7,      8,  9,  A, B,  C,  D, E,  F*/
//      4, 12,  8,  8,  4,  4,  8,  4,     20,  8,  8, 8,  4,  4, 8,  4,  //0
//      4, 12,  8,  8,  4,  4,  8,  4,     12,  8,  8, 8,  4,  4, 8,  4,  //1
//      8, 12,  8,  8,  4,  4,  8,  4,      8,  8,  8, 8,  4,  4, 8,  4,  //2
//      8, 12,  8,  8, 12, 12, 12,  4,      8,  8,  8, 8,  4,  4, 8,  4,  //3

//      4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //4
//      4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //5
//      4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //6
//      8,  8,  8,  8,  8,  8,  4,  8,      4,  4,  4, 4,  4,  4, 8,  4,  //7

//      4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //8
//      4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //9
//      4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //A
//      4,  4,  4,  4,  4,  4,  8,  4,      4,  4,  4, 4,  4,  4, 8,  4,  //B

//      8, 12, 12, 16, 12, 16,  8, 16,      8, 16, 12, 0, 12, 24, 8, 16,  //C
//      8, 12, 12,  4, 12, 16,  8, 16,      8, 16, 12, 4, 12,  4, 8, 16,  //D
//     12, 12,  8,  4,  4, 16,  8, 16,     16,  4, 16, 4,  4,  4, 8, 16,  //E
//     12, 12,  8,  4,  4, 16,  8, 16,     12,  8, 16, 4,  0,  4, 8, 16   //F
// ];
// const SecondaryTICKTable = [	//Number of machine cycles for each 0xCBXX instruction:
// /*  0, 1, 2, 3, 4, 5,  6, 7,        8, 9, A, B, C, D,  E, F*/
//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //0
//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //1
//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //2
//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //3

//     8, 8, 8, 8, 8, 8, 12, 8,        8, 8, 8, 8, 8, 8, 12, 8,  //4
//     8, 8, 8, 8, 8, 8, 12, 8,        8, 8, 8, 8, 8, 8, 12, 8,  //5
//     8, 8, 8, 8, 8, 8, 12, 8,        8, 8, 8, 8, 8, 8, 12, 8,  //6
//     8, 8, 8, 8, 8, 8, 12, 8,        8, 8, 8, 8, 8, 8, 12, 8,  //7

//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //8
//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //9
//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //A
//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //B

//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //C
//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //D
//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8,  //E
//     8, 8, 8, 8, 8, 8, 16, 8,        8, 8, 8, 8, 8, 8, 16, 8   //F
// ];
// function saveSRAMState () {
// 	if (!cBATT || MBCRam.length == 0) {
// 		//No battery backup...
// 		return [];
// 	}
// 	else {
// 		//Return the MBC RAM for backup...
// 		return fromTypedArray(MBCRam);
// 	}
// }
// function saveRTCState () {
// 	if (!cTIMER) {
// 		//No battery backup...
// 		return [];
// 	}
// 	else {
// 		//Return the MBC RAM for backup...
// 		return [
// 			lastIteration,
// 			RTCisLatched,
// 			latchedSeconds,
// 			latchedMinutes,
// 			latchedHours,
// 			latchedLDays,
// 			latchedHDays,
// 			RTCSeconds,
// 			RTCMinutes,
// 			RTCHours,
// 			RTCDays,
// 			RTCDayOverFlow,
// 			RTCHALT
// 		];
// 	}
// }
export function start () {
	initMemory();	//Write the startup memory.
	ROMLoad();		//Load the ROM into memory and get cartridge information from it.
	// initLCD();		//Initialize the graphics.
	initSound();	//Sound object initialization.
	// run();			//Start the emulation.
}
function initMemory () {
	//Initialize the RAM:
	// memory = getTypedArray(0x10000, 0, "uint8");
	// frameBuffer = getTypedArray(23040, 0xF8F8F8, "int32");
	// BGCHRBank1 = getTypedArray(0x800, 0, "uint8");
	// TICKTable = toTypedArray(TICKTable, "uint8");
	// SecondaryTICKTable = toTypedArray(SecondaryTICKTable, "uint8");
	channel3PCM = getTypedArray(0x20, 0, "int8");
}
// function generateCacheArray (tileAmount) {
// 	var tileArray = [];
// 	var tileNumber = 0;
// 	while (tileNumber < tileAmount) {
// 		tileArray[tileNumber++] = getTypedArray(64, 0, "uint8");
// 	}
// 	return tileArray;
// }
// function initSkipBootstrap () {
// 	//Fill in the boot ROM set register values
// 	//Default values to the GB boot ROM values, then fill in the GBC boot ROM values after ROM loading
// 	var index = 0xFF;
// 	while (index >= 0) {
// 		if (index >= 0x30 && index < 0x40) {
// 			memoryWrite(0xFF00 | index, ffxxDump[index]);
// 		}
// 		else {
// 			switch (index) {
// 				case 0x00:
// 				case 0x01:
// 				case 0x02:
// 				case 0x05:
// 				case 0x07:
// 				case 0x0F:
// 				case 0xFF:
// 					memoryWrite(0xFF00 | index, ffxxDump[index]);
// 					break;
// 				default:
// 					memory[0xFF00 | index] = ffxxDump[index];
// 			}
// 		}
// 		--index;
// 	}
// 	if (cGBC) {
// 		memory[0xFF6C] = 0xFE;
// 		memory[0xFF74] = 0xFE;
// 	}
// 	else {
// 		memory[0xFF48] = 0xFF;
// 		memory[0xFF49] = 0xFF;
// 		memory[0xFF6C] = 0xFF;
// 		memory[0xFF74] = 0xFF;
// 	}
// 	//Start as an unset device:
// 	cout("Starting without the GBC boot ROM.", 0);
// 	registerA = (cGBC) ? 0x11 : 0x1;
// 	registerB = 0;
// 	registerC = 0x13;
// 	registerD = 0;
// 	registerE = 0xD8;
// 	FZero = true;
// 	FSubtract = false;
// 	FHalfCarry = true;
// 	FCarry = true;
// 	registersHL = 0x014D;
// 	LCDCONTROL = LINECONTROL;
// 	IME = false;
// 	IRQLineMatched = 0;
// 	interruptsRequested = 225;
// 	interruptsEnabled = 0;
// 	hdmaRunning = false;
// 	CPUTicks = 12;
// 	STATTracker = 0;
// 	modeSTAT = 1;
// 	spriteCount = 252;
// 	LYCMatchTriggerSTAT = false;
// 	mode2TriggerSTAT = false;
// 	mode1TriggerSTAT = false;
// 	mode0TriggerSTAT = false;
// 	LCDisOn = true;
// 	channel1FrequencyTracker = 0x2000;
// 	channel1DutyTracker = 0;
// 	channel1CachedDuty = dutyLookup[2];
// 	channel1totalLength = 0;
// 	channel1envelopeVolume = 0;
// 	channel1envelopeType = false;
// 	channel1envelopeSweeps = 0;
// 	channel1envelopeSweepsLast = 0;
// 	channel1consecutive = true;
// 	channel1frequency = 1985;
// 	channel1SweepFault = true;
// 	channel1ShadowFrequency = 1985;
// 	channel1timeSweep = 1;
// 	channel1lastTimeSweep = 0;
// 	channel1Swept = false;
// 	channel1frequencySweepDivider = 0;
// 	channel1decreaseSweep = false;
// 	channel2FrequencyTracker = 0x2000;
// 	channel2DutyTracker = 0;
// 	channel2CachedDuty = dutyLookup[2];
// 	channel2totalLength = 0;
// 	channel2envelopeVolume = 0;
// 	channel2envelopeType = false;
// 	channel2envelopeSweeps = 0;
// 	channel2envelopeSweepsLast = 0;
// 	channel2consecutive = true;
// 	channel2frequency = 0;
// 	channel3canPlay = false;
// 	channel3totalLength = 0;
// 	channel3patternType = 4;
// 	channel3frequency = 0;
// 	channel3consecutive = true;
// 	channel3Counter = 0x418;
// 	channel4FrequencyPeriod = 8;
// 	channel4totalLength = 0;
// 	channel4envelopeVolume = 0;
// 	channel4currentVolume = 0;
// 	channel4envelopeType = false;
// 	channel4envelopeSweeps = 0;
// 	channel4envelopeSweepsLast = 0;
// 	channel4consecutive = true;
// 	channel4BitRange = 0x7FFF;
// 	channel4VolumeShifter = 15;
// 	channel1FrequencyCounter = 0x200;
// 	channel2FrequencyCounter = 0x200;
// 	channel3Counter = 0x800;
// 	channel3FrequencyPeriod = 0x800;
// 	channel3lastSampleLookup = 0;
// 	channel4lastSampleLookup = 0;
// 	VinLeftChannelMasterVolume = 8;
// 	VinRightChannelMasterVolume = 8;
// 	soundMasterEnabled = true;
// 	leftChannel1 = true;
// 	leftChannel2 = true;
// 	leftChannel3 = true;
// 	leftChannel4 = true;
// 	rightChannel1 = true;
// 	rightChannel2 = true;
// 	rightChannel3 = false;
// 	rightChannel4 = false;
// 	DIVTicks = 27044;
// 	// LCDTicks = 160;
// 	timerTicks = 0;
// 	TIMAEnabled = false;
// 	TACClocker = 1024;
// 	serialTimer = 0;
// 	serialShiftTimer = 0;
// 	serialShiftTimerAllocated = 0;
// 	IRQEnableDelay = 0;
// 	actualScanLine = 144;
// 	lastUnrenderedLine = 0;
// 	gfxWindowDisplay = false;
// 	gfxSpriteShow = false;
// 	gfxSpriteNormalHeight = true;
// 	bgEnabled = true;
// 	BGPriorityEnabled = true;
// 	gfxWindowCHRBankPosition = 0;
// 	gfxBackgroundCHRBankPosition = 0;
// 	gfxBackgroundBankOffset = 0;
// 	windowY = 0;
// 	windowX = 0;
// 	drewBlank = 0;
// 	midScanlineOffset = -1;
// 	currentX = 0;
// }
// function initBootstrap () {
// 	//Start as an unset device:
// 	cout("Starting the selected boot ROM.", 0);
// 	programCounter = 0;
// 	stackPointer = 0;
// 	IME = false;
// 	// LCDTicks = 0;
// 	DIVTicks = 0;
// 	registerA = 0;
// 	registerB = 0;
// 	registerC = 0;
// 	registerD = 0;
// 	registerE = 0;
// 	FZero = FSubtract = FHalfCarry = FCarry = false;
// 	registersHL = 0;
// 	leftChannel1 = false;
// 	leftChannel2 = false;
// 	leftChannel3 = false;
// 	leftChannel4 = false;
// 	rightChannel1 = false;
// 	rightChannel2 = false;
// 	rightChannel3 = false;
// 	rightChannel4 = false;
// 	channel2frequency = channel1frequency = 0;
// 	channel4consecutive = channel2consecutive = channel1consecutive = false;
// 	VinLeftChannelMasterVolume = 8;
// 	VinRightChannelMasterVolume = 8;
// 	memory[0xFF00] = 0xF;	//Set the joypad state.
// }
function ROMLoad () {
	// //Load the first two ROM banks (0x0000 - 0x7FFF) into regular gameboy memory:
	// ROM = [];
	// usedBootROM = settings[1] && ((!settings[11] && GBCBOOTROM.length == 0x800) || (settings[11] && GBBOOTROM.length == 0x100));
	// var maxLength = ROMImage.length;
	// // if (maxLength < 0x4000) {
	// // 	throw(new Error("ROM image size too small."));
	// // }
	// ROM = getTypedArray(maxLength, 0, "uint8");
	// var romIndex = 0;
	// if (usedBootROM) {
	// 	if (!settings[11]) {
	// 		//Patch in the GBC boot ROM into the memory map:
	// 		for (; romIndex < 0x100; ++romIndex) {
	// 			memory[romIndex] = GBCBOOTROM[romIndex];											//Load in the GameBoy Color BOOT ROM.
	// 			ROM[romIndex] = (ROMImage.charCodeAt(romIndex) & 0xFF);							//Decode the ROM binary for the switch out.
	// 		}
	// 		for (; romIndex < 0x200; ++romIndex) {
	// 			memory[romIndex] = ROM[romIndex] = (ROMImage.charCodeAt(romIndex) & 0xFF);	//Load in the game ROM.
	// 		}
	// 		for (; romIndex < 0x900; ++romIndex) {
	// 			memory[romIndex] = GBCBOOTROM[romIndex - 0x100];									//Load in the GameBoy Color BOOT ROM.
	// 			ROM[romIndex] = (ROMImage.charCodeAt(romIndex) & 0xFF);							//Decode the ROM binary for the switch out.
	// 		}
	// 		usedGBCBootROM = true;
	// 	}
	// 	else {
	// 		//Patch in the GBC boot ROM into the memory map:
	// 		for (; romIndex < 0x100; ++romIndex) {
	// 			memory[romIndex] = GBBOOTROM[romIndex];											//Load in the GameBoy Color BOOT ROM.
	// 			ROM[romIndex] = (ROMImage.charCodeAt(romIndex) & 0xFF);							//Decode the ROM binary for the switch out.
	// 		}
	// 	}
	// 	for (; romIndex < 0x4000; ++romIndex) {
	// 		memory[romIndex] = ROM[romIndex] = (ROMImage.charCodeAt(romIndex) & 0xFF);	//Load in the game ROM.
	// 	}
	// }
	// else {
	// 	//Don't load in the boot ROM:
	// 	for (; romIndex < 0x4000; ++romIndex) {
	// 		memory[romIndex] = ROM[romIndex] = (ROMImage.charCodeAt(romIndex) & 0xFF);	//Load in the game ROM.
	// 	}
	// }
	// //Finish the decoding of the ROM binary:
	// for (; romIndex < maxLength; ++romIndex) {
	// 	ROM[romIndex] = (ROMImage.charCodeAt(romIndex) & 0xFF);
	// }
	// ROMBankEdge = Math.floor(ROM.length / 0x4000);
	//Set up the emulator for the cartidge specifics:
	interpretCartridge();
	//Check for IRQ matching upon initialization:
	// checkIRQMatching();
}
// function getROMImage () {
// 	//Return the binary version of the ROM image currently running:
// 	if (ROMImage.length > 0) {
// 		return ROMImage.length;
// 	}
// 	var length = ROM.length;
// 	for (var index = 0; index < length; index++) {
// 		ROMImage += String.fromCharCode(ROM[index]);
// 	}
// 	return ROMImage;
// }
function interpretCartridge () {
	// ROM name
	// for (var index = 0x134; index < 0x13F; index++) {
	// 	if (ROMImage.charCodeAt(index) > 0) {
	// 		name += ROMImage[index];
	// 	}
	// }
	// // ROM game code (for newer games)
	// for (var index = 0x13F; index < 0x143; index++) {
	// 	if (ROMImage.charCodeAt(index) > 0) {
	// 		gameCode += ROMImage[index];
	// 	}
	// }
	// cout("Game Title: " + name + "[" + gameCode + "][" + ROMImage[0x143] + "]", 0);
	// cout("Game Code: " + gameCode, 0);
	// // Cartridge type
	// cartridgeType = ROM[0x147];
	// cout("Cartridge type #" + cartridgeType, 0);
	//Map out ROM cartridge sub-types.
	// var MBCType = "";
	// switch (cartridgeType) {
	// 	case 0x00:
	// 		//ROM w/o bank switching
	// 		if (!settings[9]) {
				// MBCType = "ROM";
			// 	break;
			// }
		// case 0x01:
		// 	cMBC1 = true;
		// 	MBCType = "MBC1";
		// 	break;
		// case 0x02:
		// 	cMBC1 = true;
		// 	cSRAM = true;
		// 	MBCType = "MBC1 + SRAM";
		// 	break;
		// case 0x03:
		// 	cMBC1 = true;
		// 	cSRAM = true;
		// 	cBATT = true;
		// 	MBCType = "MBC1 + SRAM + BATT";
		// 	break;
		// case 0x05:
		// 	cMBC2 = true;
		// 	MBCType = "MBC2";
		// 	break;
		// case 0x06:
		// 	cMBC2 = true;
		// 	cBATT = true;
		// 	MBCType = "MBC2 + BATT";
		// 	break;
		// case 0x08:
		// 	cSRAM = true;
		// 	MBCType = "ROM + SRAM";
		// 	break;
		// case 0x09:
		// 	cSRAM = true;
		// 	cBATT = true;
		// 	MBCType = "ROM + SRAM + BATT";
		// 	break;
		// case 0x0B:
		// 	cMMMO1 = true;
		// 	MBCType = "MMMO1";
		// 	break;
		// case 0x0C:
		// 	cMMMO1 = true;
		// 	cSRAM = true;
		// 	MBCType = "MMMO1 + SRAM";
		// 	break;
		// case 0x0D:
		// 	cMMMO1 = true;
		// 	cSRAM = true;
		// 	cBATT = true;
		// 	MBCType = "MMMO1 + SRAM + BATT";
		// 	break;
		// case 0x0F:
		// 	cMBC3 = true;
		// 	cTIMER = true;
		// 	cBATT = true;
		// 	MBCType = "MBC3 + TIMER + BATT";
		// 	break;
		// case 0x10:
		// 	cMBC3 = true;
		// 	cTIMER = true;
		// 	cBATT = true;
		// 	cSRAM = true;
		// 	MBCType = "MBC3 + TIMER + BATT + SRAM";
		// 	break;
		// case 0x11:
		// 	cMBC3 = true;
		// 	MBCType = "MBC3";
		// 	break;
		// case 0x12:
		// 	cMBC3 = true;
		// 	cSRAM = true;
		// 	MBCType = "MBC3 + SRAM";
		// 	break;
		// case 0x13:
		// 	cMBC3 = true;
		// 	cSRAM = true;
		// 	cBATT = true;
		// 	MBCType = "MBC3 + SRAM + BATT";
		// 	break;
		// case 0x19:
		// 	cMBC5 = true;
		// 	MBCType = "MBC5";
		// 	break;
		// case 0x1A:
		// 	cMBC5 = true;
		// 	cSRAM = true;
		// 	MBCType = "MBC5 + SRAM";
		// 	break;
		// case 0x1B:
		// 	cMBC5 = true;
		// 	cSRAM = true;
		// 	cBATT = true;
		// 	MBCType = "MBC5 + SRAM + BATT";
		// 	break;
		// case 0x1C:
		// 	cRUMBLE = true;
		// 	MBCType = "RUMBLE";
		// 	break;
		// case 0x1D:
		// 	cRUMBLE = true;
		// 	cSRAM = true;
		// 	MBCType = "RUMBLE + SRAM";
		// 	break;
		// case 0x1E:
		// 	cRUMBLE = true;
		// 	cSRAM = true;
		// 	cBATT = true;
		// 	MBCType = "RUMBLE + SRAM + BATT";
		// 	break;
		// case 0x1F:
		// 	cCamera = true;
		// 	MBCType = "GameBoy Camera";
		// 	break;
		// case 0x22:
		// 	cMBC7 = true;
		// 	cSRAM = true;
		// 	cBATT = true;
		// 	MBCType = "MBC7 + SRAM + BATT";
		// 	break;
		// case 0xFD:
		// 	cTAMA5 = true;
		// 	MBCType = "TAMA5";
		// 	break;
		// case 0xFE:
		// 	cHuC3 = true;
		// 	MBCType = "HuC3";
		// 	break;
		// case 0xFF:
		// 	cHuC1 = true;
		// 	MBCType = "HuC1";
		// 	break;
		// default:
		// 	MBCType = "Unknown";
		// 	cout("Cartridge type is unknown.", 2);
		// 	pause();
	// }
	// cout("Cartridge Type: " + MBCType + ".", 0);
	// ROM and RAM banks
	// numROMBanks = ROMBanks[ROM[0x148]];
	// cout(numROMBanks + " ROM banks.", 0);
	// switch (RAMBanks[ROM[0x149]]) {
	// 	case 0:
	// 		cout("No RAM banking requested for allocation or MBC is of type 2.", 0);
	// 		break;
	// 	case 2:
	// 		cout("1 RAM bank requested for allocation.", 0);
	// 		break;
	// 	case 3:
	// 		cout("4 RAM banks requested for allocation.", 0);
	// 		break;
	// 	case 4:
	// 		cout("16 RAM banks requested for allocation.", 0);
	// 		break;
	// 	default:
	// 		cout("RAM bank amount requested is unknown, will use maximum allowed by specified MBC type.", 0);
	// }
	//Check the GB/GBC mode byte:
	// if (!usedBootROM) {
	// 	switch (ROM[0x143]) {
	// 		case 0x00:	//Only GB mode
				// cGBC = false;
	// 			cout("Only GB mode detected.", 0);
	// 			break;
	// 		case 0x32:	//Exception to the GBC identifying code:
	// 			if (!settings[2] && name + gameCode + ROM[0x143] == "Game and Watch 50") {
	// 				cGBC = true;
	// 				cout("Created a boot exception for Game and Watch Gallery 2 (GBC ID byte is wrong on the cartridge).", 1);
	// 			}
	// 			else {
	// 				cGBC = false;
	// 			}
	// 			break;
	// 		case 0x80:	//Both GB + GBC modes
	// 			cGBC = !settings[2];
	// 			cout("GB and GBC mode detected.", 0);
	// 			break;
	// 		case 0xC0:	//Only GBC mode
	// 			cGBC = true;
	// 			cout("Only GBC mode detected.", 0);
	// 			break;
	// 		default:
	// 			cGBC = false;
	// 			cout("Unknown GameBoy game type code #" + ROM[0x143] + ", defaulting to GB mode (Old games don't have a type code).", 1);
	// 	}
		// inBootstrap = false;
		setupRAM();	//CPU/(V)RAM initialization.
		// initSkipBootstrap();
	// }
	// else {
	// 	cGBC = usedGBCBootROM;	//Allow the GBC boot ROM to run in GBC mode...
	// 	setupRAM();	//CPU/(V)RAM initialization.
	// 	initBootstrap();
	// }
	// initializeModeSpecificArrays();
	//License Code Lookup:
	// var cOldLicense = ROM[0x14B];
	// var cNewLicense = (ROM[0x144] & 0xFF00) | (ROM[0x145] & 0xFF);
	// if (cOldLicense != 0x33) {
	// 	//Old Style License Header
	// 	cout("Old style license code: " + cOldLicense, 0);
	// }
	// else {
	// 	//New Style License Header
	// 	cout("New style license code: " + cNewLicense, 0);
	// }
	// ROMImage = "";	//Memory consumption reduction.
}
// function disableBootROM () {
// 	//Remove any traces of the boot ROM from ROM memory.
// 	for (var index = 0; index < 0x100; ++index) {
// 		memory[index] = ROM[index];	//Replace the GameBoy or GameBoy Color boot ROM with the game ROM.
// 	}
// 	if (usedGBCBootROM) {
// 		//Remove any traces of the boot ROM from ROM memory.
// 		for (index = 0x200; index < 0x900; ++index) {
// 			memory[index] = ROM[index];	//Replace the GameBoy Color boot ROM with the game ROM.
// 		}
// 		if (!cGBC) {
// 			//Clean up the post-boot (GB mode only) state:
// 			GBCtoGBModeAdjust();
// 		}
// 		else {
// 			recompileBootIOWriteHandling();
// 		}
// 	}
// 	else {
// 		recompileBootIOWriteHandling();
// 	}
// }
function initializeTiming () {
	//Emulator Timing:
}
// function setSpeed (speed) {
// 	emulatorSpeed = speed;
// 	initializeTiming();
// 	if (audioHandle) {
// 		initSound();
// 	}
// }
function setupRAM () {
	// //Setup the auxilliary/switchable RAM:
	// if (cMBC2) {
	// 	numRAMBanks = 1 / 16;
	// }
	// else if (cMBC1 || cRUMBLE || cMBC3 || cHuC3) {
	// 	numRAMBanks = 4;
	// }
	// else if (cMBC5) {
	// 	numRAMBanks = 16;
	// }
	// else if (cSRAM) {
	// 	numRAMBanks = 1;
	// }
	// if (numRAMBanks > 0) {
	// 	if (!MBCRAMUtilized()) {
	// 		//For ROM and unknown MBC cartridges using the external RAM:
	// 		MBCRAMBanksEnabled = true;
	// 	}
	// 	//Switched RAM Used
	// 	var MBCRam = (typeof openMBC == "function") ? openMBC(name) : [];
	// 	if (MBCRam.length > 0) {
	// 		//Flash the SRAM into memory:
	// 		MBCRam = toTypedArray(MBCRam, "uint8");
	// 	}
	// 	else {
	// 		MBCRam = getTypedArray(numRAMBanks * 0x2000, 0, "uint8");
	// 	}
	// }
	// cout("Actual bytes of MBC RAM allocated: " + (numRAMBanks * 0x2000), 0);
	// //Setup the RAM for GBC mode.
	// if (cGBC) {
	// 	VRAM = getTypedArray(0x2000, 0, "uint8");
	// 	GBCMemory = getTypedArray(0x7000, 0, "uint8");
	// }
	// memoryReadJumpCompile();
	memoryWriteJumpCompile();
}
// function MBCRAMUtilized () {
// 	return cMBC1 || cMBC2 || cMBC3 || cMBC5 || cMBC7 || cRUMBLE;
// }
// function initLCD () {
// 	if (offscreenRGBCount != 92160) {
// 		//Only create the resizer handle if we need it:
// 		// compileResizeFrameBufferFunction();
// 	}
// 	else {
// 		//Resizer not needed:
// 		resizer = null;
// 	}
// 	try {
// 		canvasOffscreen = document.createElement("canvas");
// 		canvasOffscreen.width = offscreenWidth;
// 		canvasOffscreen.height = offscreenHeight;
// 		drawContextOffscreen = canvasOffscreen.getContext("2d");
// 		drawContextOnscreen = canvas.getContext("2d");
// 		canvas.setAttribute("style", (canvas.getAttribute("style") || "") + "; image-rendering: " + ((settings[13]) ? "auto" : "-webkit-optimize-contrast") + ";" +
// 		"image-rendering: " + ((settings[13]) ? "optimizeQuality" : "-o-crisp-edges") + ";" +
// 		"image-rendering: " + ((settings[13]) ? "optimizeQuality" : "-moz-crisp-edges") + ";" +
// 		"-ms-interpolation-mode: " + ((settings[13]) ? "bicubic" : "nearest-neighbor") + ";");
// 		drawContextOffscreen.webkitImageSmoothingEnabled  = settings[13];
// 		drawContextOffscreen.mozImageSmoothingEnabled = settings[13];
// 		drawContextOnscreen.webkitImageSmoothingEnabled  = settings[13];
// 		drawContextOnscreen.mozImageSmoothingEnabled = settings[13];
// 		//Get a CanvasPixelArray buffer:
// 		try {
// 			canvasBuffer = drawContextOffscreen.createImageData(offscreenWidth, offscreenHeight);
// 		}
// 		catch (error) {
// 			cout("Falling back to the getImageData initialization (Error \"" + error.message + "\").", 1);
// 			canvasBuffer = drawContextOffscreen.getImageData(0, 0, offscreenWidth, offscreenHeight);
// 		}
// 		var index = offscreenRGBCount;
// 		while (index > 0) {
// 			canvasBuffer.data[index -= 4] = 0xF8;
// 			canvasBuffer.data[index + 1] = 0xF8;
// 			canvasBuffer.data[index + 2] = 0xF8;
// 			canvasBuffer.data[index + 3] = 0xFF;
// 		}
// 		graphicsBlit();
// 		canvas.style.visibility = "visible";
// 		if (swizzledFrame == null) {
// 			swizzledFrame = getTypedArray(69120, 0xFF, "uint8");
// 		}
// 		//Test the draw system and browser vblank latching:
// 		drewFrame = true;										//Copy the latest graphics to buffer.
// 		requestDraw();
// 	}
// 	catch (error) {
// 		throw(new Error("HTML5 Canvas support required: " + error.message + "file: " + error.fileName + ", line: " + error.lineNumber));
// 	}
// }
// function graphicsBlit () {
// 	if (offscreenWidth == onscreenWidth && offscreenHeight == onscreenHeight) {
// 		drawContextOnscreen.putImageData(canvasBuffer, 0, 0);
// 	}
// 	else {
// 		drawContextOffscreen.putImageData(canvasBuffer, 0, 0);
// 		drawContextOnscreen.drawImage(canvasOffscreen, 0, 0, onscreenWidth, onscreenHeight);
// 	}
// }
// function JoyPadEvent (key, down) {
// 	if (down) {
// 		JoyPad &= 0xFF ^ (1 << key);
// 		if (!cGBC && (!usedBootROM || !usedGBCBootROM)) {
// 			interruptsRequested |= 0x10;	//A real GBC doesn't set this!
// 			remainingClocks = 0;
// 			checkIRQMatching();
// 		}
// 	}
// 	else {
// 		JoyPad |= (1 << key);
// 	}
// 	memory[0xFF00] = (memory[0xFF00] & 0x30) + ((((memory[0xFF00] & 0x20) == 0) ? (JoyPad >> 4) : 0xF) & (((memory[0xFF00] & 0x10) == 0) ? (JoyPad & 0xF) : 0xF));
// 	CPUStopped = false;
// }
// function GyroEvent (x, y) {
// 	x *= -100;
// 	x += 2047;
// 	highX = x >> 8;
// 	lowX = x & 0xFF;
// 	y *= -100;
// 	y += 2047;
// 	highY = y >> 8;
// 	lowY = y & 0xFF;
// }
function initSound () {
	audioResamplerFirstPassFactor = Math.max(Math.min(Math.floor(clocksPerSecond / 44100), Math.floor(0xFFFF / 0x1E0)), 1);
	downSampleInputDivider = 1 / (audioResamplerFirstPassFactor * 0xF0);
	if (settings.soundOn) {
		audioHandle = new XAudioServer(2, clocksPerSecond / audioResamplerFirstPassFactor, 0, Math.max(baseCPUCyclesPerIteration * settings.audioBufferMaxSpanAmount / audioResamplerFirstPassFactor, 8192) << 1, null, settings.volumeLevel, function () {
			settings.soundOn = false;
		});
		initAudioBuffer();
	}
	else if (audioHandle) {
		//Mute the audio output, as it has an immediate silencing effect:
		audioHandle.changeVolume(0);
	}
}
// function changeVolume () {
// 	if (settings.soundOn && audioHandle) {
// 		audioHandle.changeVolume(settings.volumeLevel);
// 	}
// }
function initAudioBuffer () {
	audioIndex = 0;
	audioDestinationPosition = 0;
	downsampleInput = 0;
	bufferContainAmount = Math.max(baseCPUCyclesPerIteration * settings.audioBufferMinSpanAmount / audioResamplerFirstPassFactor, 4096) << 1;
	numSamplesTotal = (baseCPUCyclesPerIteration / audioResamplerFirstPassFactor) << 1;
	audioBuffer = getTypedArray(numSamplesTotal, 0, "float32");
}
function intializeWhiteNoise () {
	//Noise Sample Tables:
	var randomFactor = 1;
	//15-bit LSFR Cache Generation:
	LSFR15Table = getTypedArray(0x80000, 0, "int8");
	var LSFR = 0x7FFF;	//Seed value has all its bits set.
	var LSFRShifted = 0x3FFF;
	for (var index = 0; index < 0x8000; ++index) {
		//Normalize the last LSFR value for usage:
		randomFactor = 1 - (LSFR & 1);	//Docs say it's the inverse.
		//Cache the different volume level results:
		LSFR15Table[0x08000 | index] = randomFactor;
		LSFR15Table[0x10000 | index] = randomFactor * 0x2;
		LSFR15Table[0x18000 | index] = randomFactor * 0x3;
		LSFR15Table[0x20000 | index] = randomFactor * 0x4;
		LSFR15Table[0x28000 | index] = randomFactor * 0x5;
		LSFR15Table[0x30000 | index] = randomFactor * 0x6;
		LSFR15Table[0x38000 | index] = randomFactor * 0x7;
		LSFR15Table[0x40000 | index] = randomFactor * 0x8;
		LSFR15Table[0x48000 | index] = randomFactor * 0x9;
		LSFR15Table[0x50000 | index] = randomFactor * 0xA;
		LSFR15Table[0x58000 | index] = randomFactor * 0xB;
		LSFR15Table[0x60000 | index] = randomFactor * 0xC;
		LSFR15Table[0x68000 | index] = randomFactor * 0xD;
		LSFR15Table[0x70000 | index] = randomFactor * 0xE;
		LSFR15Table[0x78000 | index] = randomFactor * 0xF;
		//Recompute the LSFR algorithm:
		LSFRShifted = LSFR >> 1;
		LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 14);
	}
	//7-bit LSFR Cache Generation:
	LSFR7Table = getTypedArray(0x800, 0, "int8");
	LSFR = 0x7F;	//Seed value has all its bits set.
	for (index = 0; index < 0x80; ++index) {
		//Normalize the last LSFR value for usage:
		randomFactor = 1 - (LSFR & 1);	//Docs say it's the inverse.
		//Cache the different volume level results:
		LSFR7Table[0x080 | index] = randomFactor;
		LSFR7Table[0x100 | index] = randomFactor * 0x2;
		LSFR7Table[0x180 | index] = randomFactor * 0x3;
		LSFR7Table[0x200 | index] = randomFactor * 0x4;
		LSFR7Table[0x280 | index] = randomFactor * 0x5;
		LSFR7Table[0x300 | index] = randomFactor * 0x6;
		LSFR7Table[0x380 | index] = randomFactor * 0x7;
		LSFR7Table[0x400 | index] = randomFactor * 0x8;
		LSFR7Table[0x480 | index] = randomFactor * 0x9;
		LSFR7Table[0x500 | index] = randomFactor * 0xA;
		LSFR7Table[0x580 | index] = randomFactor * 0xB;
		LSFR7Table[0x600 | index] = randomFactor * 0xC;
		LSFR7Table[0x680 | index] = randomFactor * 0xD;
		LSFR7Table[0x700 | index] = randomFactor * 0xE;
		LSFR7Table[0x780 | index] = randomFactor * 0xF;
		//Recompute the LSFR algorithm:
		LSFRShifted = LSFR >> 1;
		LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 6);
	}
	//Set the default noise table:
	noiseSampleTable = LSFR15Table;
}
function audioUnderrunAdjustment () {
	if (settings.soundOn) {
		var underrunAmount = audioHandle.remainingBuffer();
		if (typeof underrunAmount == "number") {
			underrunAmount = bufferContainAmount - Math.max(underrunAmount, 0);
			if (underrunAmount > 0) {
				recalculateIterationClockLimitForAudio((underrunAmount >> 1) * audioResamplerFirstPassFactor);
			}
		}
	}
}
function initializeAudioStartState () {
}
function outputAudio () {
	audioBuffer[audioDestinationPosition++] = (downsampleInput >>> 16) * downSampleInputDivider - 1;
	audioBuffer[audioDestinationPosition++] = (downsampleInput & 0xFFFF) * downSampleInputDivider - 1;
	if (audioDestinationPosition == numSamplesTotal) {
		audioHandle.writeAudioNoCallback(audioBuffer);
		audioDestinationPosition = 0;
	}
	downsampleInput = 0;
}
//Below are the audio generation functions timed against the CPU:
function generateAudio (numSamples) {
	var multiplier = 0;
	if (soundMasterEnabled && !CPUStopped) {
		for (var clockUpTo = 0; numSamples > 0;) {
			clockUpTo = Math.min(audioClocksUntilNextEventCounter, sequencerClocks, numSamples);
			audioClocksUntilNextEventCounter -= clockUpTo;
			sequencerClocks -= clockUpTo;
			numSamples -= clockUpTo;
			while (clockUpTo > 0) {
				multiplier = Math.min(clockUpTo, audioResamplerFirstPassFactor - audioIndex);
				clockUpTo -= multiplier;
				audioIndex += multiplier;
				downsampleInput += mixerOutputCache * multiplier;
				if (audioIndex == audioResamplerFirstPassFactor) {
					audioIndex = 0;
					outputAudio();
				}
			}
			if (sequencerClocks == 0) {
				audioComputeSequencer();
				sequencerClocks = 0x2000;
			}
			if (audioClocksUntilNextEventCounter == 0) {
				computeAudioChannels();
			}
		}
	}
	else {
		//SILENT OUTPUT:
		while (numSamples > 0) {
			multiplier = Math.min(numSamples, audioResamplerFirstPassFactor - audioIndex);
			numSamples -= multiplier;
			audioIndex += multiplier;
			if (audioIndex == audioResamplerFirstPassFactor) {
				audioIndex = 0;
				outputAudio();
			}
		}
	}
}
//Generate audio, but don't actually output it (Used for when sound is disabled by user/browser):
function generateAudioFake (numSamples) {
	if (soundMasterEnabled && !CPUStopped) {
		for (var clockUpTo = 0; numSamples > 0;) {
			clockUpTo = Math.min(audioClocksUntilNextEventCounter, sequencerClocks, numSamples);
			audioClocksUntilNextEventCounter -= clockUpTo;
			sequencerClocks -= clockUpTo;
			numSamples -= clockUpTo;
			if (sequencerClocks == 0) {
				audioComputeSequencer();
				sequencerClocks = 0x2000;
			}
			if (audioClocksUntilNextEventCounter == 0) {
				computeAudioChannels();
			}
		}
	}
}
function audioJIT () {
	//Audio Sample Generation Timing:
	if (settings.soundOn) {
		generateAudio(audioTicks);
	}
	else {
		generateAudioFake(audioTicks);
	}
	audioTicks = 0;
}
function audioComputeSequencer () {
	switch (sequencePosition++) {
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
			sequencePosition = 0;
	}
}
function clockAudioLength () {
	//Channel 1:
	if (channel1totalLength > 1) {
		--channel1totalLength;
	}
	else if (channel1totalLength == 1) {
		channel1totalLength = 0;
		channel1EnableCheck();
		memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
	}
	//Channel 2:
	if (channel2totalLength > 1) {
		--channel2totalLength;
	}
	else if (channel2totalLength == 1) {
		channel2totalLength = 0;
		channel2EnableCheck();
		memory[0xFF26] &= 0xFD;	//Channel #2 On Flag Off
	}
	//Channel 3:
	if (channel3totalLength > 1) {
		--channel3totalLength;
	}
	else if (channel3totalLength == 1) {
		channel3totalLength = 0;
		channel3EnableCheck();
		memory[0xFF26] &= 0xFB;	//Channel #3 On Flag Off
	}
	//Channel 4:
	if (channel4totalLength > 1) {
		--channel4totalLength;
	}
	else if (channel4totalLength == 1) {
		channel4totalLength = 0;
		channel4EnableCheck();
		memory[0xFF26] &= 0xF7;	//Channel #4 On Flag Off
	}
}
function clockAudioSweep () {
	//Channel 1:
	if (!channel1SweepFault && channel1timeSweep > 0) {
		if (--channel1timeSweep == 0) {
			runAudioSweep();
		}
	}
}
function runAudioSweep () {
	//Channel 1:
	if (channel1lastTimeSweep > 0) {
		if (channel1frequencySweepDivider > 0) {
			channel1Swept = true;
			if (channel1decreaseSweep) {
				channel1ShadowFrequency -= channel1ShadowFrequency >> channel1frequencySweepDivider;
				channel1frequency = channel1ShadowFrequency & 0x7FF;
				channel1FrequencyTracker = (0x800 - channel1frequency) << 2;
			}
			else {
				channel1ShadowFrequency += channel1ShadowFrequency >> channel1frequencySweepDivider;
				channel1frequency = channel1ShadowFrequency;
				if (channel1ShadowFrequency <= 0x7FF) {
					channel1FrequencyTracker = (0x800 - channel1frequency) << 2;
					//Run overflow check twice:
					if ((channel1ShadowFrequency + (channel1ShadowFrequency >> channel1frequencySweepDivider)) > 0x7FF) {
						channel1SweepFault = true;
						channel1EnableCheck();
						memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
					}
				}
				else {
					channel1frequency &= 0x7FF;
					channel1SweepFault = true;
					channel1EnableCheck();
					memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
				}
			}
			channel1timeSweep = channel1lastTimeSweep;
		}
		else {
			//Channel has sweep disabled and timer becomes a length counter:
			channel1SweepFault = true;
			channel1EnableCheck();
		}
	}
}
function channel1AudioSweepPerformDummy () {
	//Channel 1:
	if (channel1frequencySweepDivider > 0) {
		if (!channel1decreaseSweep) {
			var channel1ShadowFrequency = channel1ShadowFrequency + (channel1ShadowFrequency >> channel1frequencySweepDivider);
			if (channel1ShadowFrequency <= 0x7FF) {
				//Run overflow check twice:
				if ((channel1ShadowFrequency + (channel1ShadowFrequency >> channel1frequencySweepDivider)) > 0x7FF) {
					channel1SweepFault = true;
					channel1EnableCheck();
					memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
				}
			}
			else {
				channel1SweepFault = true;
				channel1EnableCheck();
				memory[0xFF26] &= 0xFE;	//Channel #1 On Flag Off
			}
		}
	}
}
function clockAudioEnvelope () {
	//Channel 1:
	if (channel1envelopeSweepsLast > -1) {
		if (channel1envelopeSweeps > 0) {
			--channel1envelopeSweeps;
		}
		else {
			if (!channel1envelopeType) {
				if (channel1envelopeVolume > 0) {
					--channel1envelopeVolume;
					channel1envelopeSweeps = channel1envelopeSweepsLast;
					channel1OutputLevelCache();
				}
				else {
					channel1envelopeSweepsLast = -1;
				}
			}
			else if (channel1envelopeVolume < 0xF) {
				++channel1envelopeVolume;
				channel1envelopeSweeps = channel1envelopeSweepsLast;
				channel1OutputLevelCache();
			}
			else {
				channel1envelopeSweepsLast = -1;
			}
		}
	}
	//Channel 2:
	if (channel2envelopeSweepsLast > -1) {
		if (channel2envelopeSweeps > 0) {
			--channel2envelopeSweeps;
		}
		else {
			if (!channel2envelopeType) {
				if (channel2envelopeVolume > 0) {
					--channel2envelopeVolume;
					channel2envelopeSweeps = channel2envelopeSweepsLast;
					channel2OutputLevelCache();
				}
				else {
					channel2envelopeSweepsLast = -1;
				}
			}
			else if (channel2envelopeVolume < 0xF) {
				++channel2envelopeVolume;
				channel2envelopeSweeps = channel2envelopeSweepsLast;
				channel2OutputLevelCache();
			}
			else {
				channel2envelopeSweepsLast = -1;
			}
		}
	}
	//Channel 4:
	if (channel4envelopeSweepsLast > -1) {
		if (channel4envelopeSweeps > 0) {
			--channel4envelopeSweeps;
		}
		else {
			if (!channel4envelopeType) {
				if (channel4envelopeVolume > 0) {
					channel4currentVolume = --channel4envelopeVolume << channel4VolumeShifter;
					channel4envelopeSweeps = channel4envelopeSweepsLast;
					channel4UpdateCache();
				}
				else {
					channel4envelopeSweepsLast = -1;
				}
			}
			else if (channel4envelopeVolume < 0xF) {
				channel4currentVolume = ++channel4envelopeVolume << channel4VolumeShifter;
				channel4envelopeSweeps = channel4envelopeSweepsLast;
				channel4UpdateCache();
			}
			else {
				channel4envelopeSweepsLast = -1;
			}
		}
	}
}
function computeAudioChannels () {
	//Clock down the four audio channels to the next closest audio event:
	channel1FrequencyCounter -= audioClocksUntilNextEvent;
	channel2FrequencyCounter -= audioClocksUntilNextEvent;
	channel3Counter -= audioClocksUntilNextEvent;
	channel4Counter -= audioClocksUntilNextEvent;
	//Channel 1 counter:
	if (channel1FrequencyCounter == 0) {
		channel1FrequencyCounter = channel1FrequencyTracker;
		channel1DutyTracker = (channel1DutyTracker + 1) & 0x7;
		channel1OutputLevelTrimaryCache();
	}
	//Channel 2 counter:
	if (channel2FrequencyCounter == 0) {
		channel2FrequencyCounter = channel2FrequencyTracker;
		channel2DutyTracker = (channel2DutyTracker + 1) & 0x7;
		channel2OutputLevelTrimaryCache();
	}
	//Channel 3 counter:
	if (channel3Counter == 0) {
		if (channel3canPlay) {
			channel3lastSampleLookup = (channel3lastSampleLookup + 1) & 0x1F;
		}
		channel3Counter = channel3FrequencyPeriod;
		channel3UpdateCache();
	}
	//Channel 4 counter:
	if (channel4Counter == 0) {
		channel4lastSampleLookup = (channel4lastSampleLookup + 1) & channel4BitRange;
		channel4Counter = channel4FrequencyPeriod;
		channel4UpdateCache();
	}
	//Find the number of clocks to next closest counter event:
	audioClocksUntilNextEventCounter = audioClocksUntilNextEvent = Math.min(channel1FrequencyCounter, channel2FrequencyCounter, channel3Counter, channel4Counter);
}
function channel1EnableCheck () {
	channel1Enabled = ((channel1consecutive || channel1totalLength > 0) && !channel1SweepFault && channel1canPlay);
	channel1OutputLevelSecondaryCache();
}
function channel1VolumeEnableCheck () {
	channel1canPlay = (memory[0xFF12] > 7);
	channel1EnableCheck();
	channel1OutputLevelSecondaryCache();
}
function channel1OutputLevelCache () {
	channel1currentSampleLeft = (leftChannel1) ? channel1envelopeVolume : 0;
	channel1currentSampleRight = (rightChannel1) ? channel1envelopeVolume : 0;
	channel1OutputLevelSecondaryCache();
}
function channel1OutputLevelSecondaryCache () {
	if (channel1Enabled) {
		channel1currentSampleLeftSecondary = channel1currentSampleLeft;
		channel1currentSampleRightSecondary = channel1currentSampleRight;
	}
	else {
		channel1currentSampleLeftSecondary = 0;
		channel1currentSampleRightSecondary = 0;
	}
	channel1OutputLevelTrimaryCache();
}
function channel1OutputLevelTrimaryCache () {
	if (channel1CachedDuty[channel1DutyTracker] && settings.channelOn[0]) {
		channel1currentSampleLeftTrimary = channel1currentSampleLeftSecondary;
		channel1currentSampleRightTrimary = channel1currentSampleRightSecondary;
	}
	else {
		channel1currentSampleLeftTrimary = 0;
		channel1currentSampleRightTrimary = 0;
	}
	mixerOutputLevelCache();
}
function channel2EnableCheck () {
	channel2Enabled = ((channel2consecutive || channel2totalLength > 0) && channel2canPlay);
	channel2OutputLevelSecondaryCache();
}
function channel2VolumeEnableCheck () {
	channel2canPlay = (memory[0xFF17] > 7);
	channel2EnableCheck();
	channel2OutputLevelSecondaryCache();
}
function channel2OutputLevelCache () {
	channel2currentSampleLeft = (leftChannel2) ? channel2envelopeVolume : 0;
	channel2currentSampleRight = (rightChannel2) ? channel2envelopeVolume : 0;
	channel2OutputLevelSecondaryCache();
}
function channel2OutputLevelSecondaryCache () {
	if (channel2Enabled) {
		channel2currentSampleLeftSecondary = channel2currentSampleLeft;
		channel2currentSampleRightSecondary = channel2currentSampleRight;
	}
	else {
		channel2currentSampleLeftSecondary = 0;
		channel2currentSampleRightSecondary = 0;
	}
	channel2OutputLevelTrimaryCache();
}
function channel2OutputLevelTrimaryCache () {
	// duty
	if (channel2CachedDuty[channel2DutyTracker] && settings.channelOn[1]) {
		channel2currentSampleLeftTrimary = channel2currentSampleLeftSecondary;
		channel2currentSampleRightTrimary = channel2currentSampleRightSecondary;
	}
	else {
		channel2currentSampleLeftTrimary = 0;
		channel2currentSampleRightTrimary = 0;
	}
	mixerOutputLevelCache();
}
function channel3EnableCheck () {
	channel3Enabled = (/*channel3canPlay && */(channel3consecutive || channel3totalLength > 0));
	channel3OutputLevelSecondaryCache();
}
function channel3OutputLevelCache () {
	channel3currentSampleLeft = (leftChannel3) ? cachedChannel3Sample : 0;
	channel3currentSampleRight = (rightChannel3) ? cachedChannel3Sample : 0;
	channel3OutputLevelSecondaryCache();
}
function channel3OutputLevelSecondaryCache () {
	if (channel3Enabled && settings.channelOn[2]) {
		channel3currentSampleLeftSecondary = channel3currentSampleLeft;
		channel3currentSampleRightSecondary = channel3currentSampleRight;
	}
	else {
		channel3currentSampleLeftSecondary = 0;
		channel3currentSampleRightSecondary = 0;
	}
	mixerOutputLevelCache();
}
function channel4EnableCheck () {
	channel4Enabled = ((channel4consecutive || channel4totalLength > 0) && channel4canPlay);
	channel4OutputLevelSecondaryCache();
}
function channel4VolumeEnableCheck () {
	channel4canPlay = (memory[0xFF21] > 7);
	channel4EnableCheck();
	channel4OutputLevelSecondaryCache();
}
function channel4OutputLevelCache () {
	channel4currentSampleLeft = (leftChannel4) ? cachedChannel4Sample : 0;
	channel4currentSampleRight = (rightChannel4) ? cachedChannel4Sample : 0;
	channel4OutputLevelSecondaryCache();
}
function channel4OutputLevelSecondaryCache () {
	if (channel4Enabled && settings.channelOn[3]) {
		channel4currentSampleLeftSecondary = channel4currentSampleLeft;
		channel4currentSampleRightSecondary = channel4currentSampleRight;
	}
	else {
		channel4currentSampleLeftSecondary = 0;
		channel4currentSampleRightSecondary = 0;
	}
	mixerOutputLevelCache();
}
function mixerOutputLevelCache () {
	// hmm
	mixerOutputCache = ((((channel1currentSampleLeftTrimary + channel2currentSampleLeftTrimary + channel3currentSampleLeftSecondary + channel4currentSampleLeftSecondary) * VinLeftChannelMasterVolume) << 16) |
	((channel1currentSampleRightTrimary + channel2currentSampleRightTrimary + channel3currentSampleRightSecondary + channel4currentSampleRightSecondary) * VinRightChannelMasterVolume));
}
function channel3UpdateCache () {
	cachedChannel3Sample = channel3PCM[channel3lastSampleLookup] >> channel3patternType;
	channel3OutputLevelCache();
}
function channel3WriteRAM (address, data) {
	if (channel3canPlay) {
		audioJIT();
		//address = channel3lastSampleLookup >> 1;
	}
	memory[0xFF30 | address] = data;
	address <<= 1;
	channel3PCM[address] = data >> 4;
	channel3PCM[address | 1] = data & 0xF;
}
function channel4UpdateCache () {
	cachedChannel4Sample = noiseSampleTable[channel4currentVolume | channel4lastSampleLookup];
	channel4OutputLevelCache();
}
export function run () {
	//The preprocessing before the actual iteration loop:
	// if ((stopEmulator & 2) == 0) {
		// if ((stopEmulator & 1) == 1) {
			// if (!CPUStopped) {
				// stopEmulator = 0;
				audioUnderrunAdjustment();
				// clockUpdate();			//RTC clocking.
				// if (!halt) {
				// 	executeIteration();
				// }
				// else {						//Finish the HALT rundown execution.
					// CPUTicks = 0;
					// calculateHALTPeriod();
					// console.log(halt);
					// if (halt) {
					// 	// iterationEndRoutine();
					// }
					// else {
						executeIteration();
					// }
				// }
				//Request the graphics target to be updated:
				// requestDraw();
			// }
			// else {
			// 	audioUnderrunAdjustment();
			// 	audioTicks += CPUCyclesTotal;
			// 	audioJIT();
			// 	stopEmulator |= 1;			//End current loop.
			// }
		// }
		// else {		//We can only get here if there was an internal error, but the loop was restarted.
		// 	cout("Iterator restarted a faulted core.", 2);
		// 	pause();
		// }
	// }
}
function executeIteration () {
	audioTicks += CPUCyclesTotal >> doubleSpeedShifter;
	audioJIT();	//Make sure we at least output once per iteration.
	recalculateIterationClockLimit();




	// //Iterate the interpreter loop:
	// var opcodeToExecute = 0;
	// var timedTicks = 0;
	// // console.log(stopEmulator);
	// console.log('---------')
	// while (stopEmulator == 0) {
	// 	//Interrupt Arming:
	// 	// switch (IRQEnableDelay) {
	// 	// 	case 1:
	// 	// 		IME = true;
	// 	// 		checkIRQMatching();
	// 	// 	case 2:
	// 	// 		--IRQEnableDelay;
	// 	// }
	// 	//Is an IRQ set to fire?:
	// 	// if (IRQLineMatched > 0) {
	// 	// 	//IME is true and and interrupt was matched:
	// 	// 	launchIRQ();
	// 	// }
	// 	//Fetch the current opcode:
	// 	opcodeToExecute = memoryReader[programCounter](this, programCounter);
	// 	//Increment the program counter to the next instruction:
	// 	programCounter = (programCounter + 1) & 0xFFFF;
	// 	//Check for the program counter quirk:
	// 	//Get how many CPU cycles the current instruction counts for:
	// 	CPUTicks = TICKTable[opcodeToExecute];
	// 	//Execute the current instruction:
	// 	// OPCODE[opcodeToExecute](this);
	// 	//Update the state (Inlined updateCoreFull manually here):
	// 	//Update the clocking for the LCD emulation:
	// 	LCDTicks += CPUTicks >> doubleSpeedShifter;	//LCD Timing
	// 	// LCDCONTROL[actualScanLine](this);					//Scan Line and STAT Mode Control
	// 	//Single-speed relative timing for A/V emulation:
	// 	timedTicks = CPUTicks >> doubleSpeedShifter;		//CPU clocking can be updated from the LCD handling.
	// 	audioTicks += timedTicks;								//Audio Timing
	// 	emulatorTicks += timedTicks;							//Emulator Timing
	// 	//CPU Timers:
	// 	DIVTicks += CPUTicks;								//DIV Timing
	// 	// if (TIMAEnabled) {										//TIMA Timing
	// 	// 	timerTicks += CPUTicks;
	// 	// 	while (timerTicks >= TACClocker) {
	// 	// 		timerTicks -= TACClocker;
	// 	// 		if (++memory[0xFF05] == 0x100) {
	// 	// 			memory[0xFF05] = memory[0xFF06];
	// 	// 			interruptsRequested |= 0x4;
	// 	// 			checkIRQMatching();
	// 	// 		}
	// 	// 	}
	// 	// }
	// 	// if (serialTimer > 0) {										//Serial Timing
	// 	// 	//IRQ Counter:
	// 	// 	serialTimer -= CPUTicks;
	// 	// 	if (serialTimer <= 0) {
	// 	// 		interruptsRequested |= 0x8;
	// 	// 		checkIRQMatching();
	// 	// 	}
	// 	// 	//Bit Shit Counter:
	// 	// 	serialShiftTimer -= CPUTicks;
	// 	// 	if (serialShiftTimer <= 0) {
	// 	// 		serialShiftTimer = serialShiftTimerAllocated;
	// 	// 		memory[0xFF01] = ((memory[0xFF01] << 1) & 0xFE) | 0x01;	//We could shift in actual link data here if we were to implement such!!!
	// 	// 	}
	// 	// }
	// 	//End of iteration routine:
	// 	if (emulatorTicks >= CPUCyclesTotal) {
	// 		console.log(CPUCyclesTotal)
	// 		iterationEndRoutine();
	// 	}
	// }
}
// function iterationEndRoutine () {
// 	if ((stopEmulator & 0x1) == 0) {
// 		// console.log(audioTicks);
// 		audioJIT();	//Make sure we at least output once per iteration.
// 		//Update DIV Alignment (Integer overflow safety):
// 		memory[0xFF04] = (memory[0xFF04] + (DIVTicks >> 8)) & 0xFF;
// 		DIVTicks &= 0xFF;
// 		//Update emulator flags:
// 		stopEmulator |= 1;			//End current loop.
// 		emulatorTicks -= CPUCyclesTotal;
// 		CPUCyclesTotalCurrent += CPUCyclesTotalRoundoff;
// 		recalculateIterationClockLimit();
// 	}
// }
// function handleSTOP () {
// 	CPUStopped = true;						//Stop CPU until joypad input changes.
// 	iterationEndRoutine();
// 	if (emulatorTicks < 0) {
// 		audioTicks -= emulatorTicks;
// 		audioJIT();
// 	}
// }
function recalculateIterationClockLimit () {
	var endModulus = CPUCyclesTotalCurrent % 4;
	CPUCyclesTotal = CPUCyclesTotalBase + CPUCyclesTotalCurrent - endModulus;
	CPUCyclesTotalCurrent = endModulus;
}
function recalculateIterationClockLimitForAudio (audioClocking) {
	CPUCyclesTotal += Math.min((audioClocking >> 2) << 2, CPUCyclesTotalBase << 1);
}
// function scanLineMode2 () {	//OAM Search Period
// 	if (STATTracker != 1) {
// 		if (mode2TriggerSTAT) {
// 			interruptsRequested |= 0x2;
// 			checkIRQMatching();
// 		}
// 		STATTracker = 1;
// 		modeSTAT = 2;
// 	}
// }
// function scanLineMode3 () {	//Scan Line Drawing Period
// 	if (modeSTAT != 3) {
// 		if (STATTracker == 0 && mode2TriggerSTAT) {
// 			interruptsRequested |= 0x2;
// 			checkIRQMatching();
// 		}
// 		STATTracker = 1;
// 		modeSTAT = 3;
// 	}
// }
// function scanLineMode0 () {	//Horizontal Blanking Period
// 	if (modeSTAT != 0) {
// 		if (STATTracker != 2) {
// 			if (STATTracker == 0) {
// 				if (mode2TriggerSTAT) {
// 					interruptsRequested |= 0x2;
// 					checkIRQMatching();
// 				}
// 				modeSTAT = 3;
// 			}
// 			incrementScanLineQueue();
// 			updateSpriteCount(actualScanLine);
// 			STATTracker = 2;
// 		}
// 		if (LCDTicks >= spriteCount) {
// 			if (hdmaRunning) {
// 				executeHDMA();
// 			}
// 			if (mode0TriggerSTAT) {
// 				interruptsRequested |= 0x2;
// 				checkIRQMatching();
// 			}
// 			STATTracker = 3;
// 			modeSTAT = 0;
// 		}
// 	}
// }
// function clocksUntilLYCMatch () {
// 	if (memory[0xFF45] != 0) {
// 		if (memory[0xFF45] > actualScanLine) {
// 			return 456 * (memory[0xFF45] - actualScanLine);
// 		}
// 		return 456 * (154 - actualScanLine + memory[0xFF45]);
// 	}
// 	return (456 * ((actualScanLine == 153 && memory[0xFF44] == 0) ? 154 : (153 - actualScanLine))) + 8;
// }
// function clocksUntilMode0 () {
// 	switch (modeSTAT) {
// 		case 0:
// 			if (actualScanLine == 143) {
// 				updateSpriteCount(0);
// 				return spriteCount + 5016;
// 			}
// 			updateSpriteCount(actualScanLine + 1);
// 			return spriteCount + 456;
// 		case 2:
// 		case 3:
// 			updateSpriteCount(actualScanLine);
// 			return spriteCount;
// 		case 1:
// 			updateSpriteCount(0);
// 			return spriteCount + (456 * (154 - actualScanLine));
// 	}
// }
// function updateSpriteCount (line) {
// 	spriteCount = 252;
// 	if (cGBC && gfxSpriteShow) {										//Is the window enabled and are we in CGB mode?
// 		var lineAdjusted = line + 0x10;
// 		var yoffset = 0;
// 		var yCap = (gfxSpriteNormalHeight) ? 0x8 : 0x10;
// 		for (var OAMAddress = 0xFE00; OAMAddress < 0xFEA0 && spriteCount < 312; OAMAddress += 4) {
// 			yoffset = lineAdjusted - memory[OAMAddress];
// 			if (yoffset > -1 && yoffset < yCap) {
// 				spriteCount += 6;
// 			}
// 		}
// 	}
// }
// function matchLYC () {	//LYC Register Compare
// 	if (memory[0xFF44] == memory[0xFF45]) {
// 		memory[0xFF41] |= 0x04;
// 		if (LYCMatchTriggerSTAT) {
// 			interruptsRequested |= 0x2;
// 			checkIRQMatching();
// 		}
// 	}
// 	else {
// 		memory[0xFF41] &= 0x7B;
// 	}
// }
// function updateCore () {
	//Update the clocking for the LCD emulation:
	// LCDTicks += CPUTicks >> doubleSpeedShifter;	//LCD Timing
	// LCDCONTROL[actualScanLine](this);					//Scan Line and STAT Mode Control
	//Single-speed relative timing for A/V emulation:
	// var timedTicks = CPUTicks >> doubleSpeedShifter;	//CPU clocking can be updated from the LCD handling.
	// audioTicks += timedTicks;								//Audio Timing
	// emulatorTicks += timedTicks;							//Emulator Timing
	//CPU Timers:
	// DIVTicks += CPUTicks;								//DIV Timing
	// if (TIMAEnabled) {										//TIMA Timing
	// 	timerTicks += CPUTicks;
	// 	while (timerTicks >= TACClocker) {
	// 		timerTicks -= TACClocker;
	// 		if (++memory[0xFF05] == 0x100) {
	// 			memory[0xFF05] = memory[0xFF06];
	// 			interruptsRequested |= 0x4;
	// 			// checkIRQMatching();
	// 		}
	// 	}
	// }
	// if (serialTimer > 0) {										//Serial Timing
	// 	//IRQ Counter:
	// 	serialTimer -= CPUTicks;
	// 	if (serialTimer <= 0) {
	// 		interruptsRequested |= 0x8;
	// 		checkIRQMatching();
	// 	}
	// 	//Bit Shit Counter:
	// 	serialShiftTimer -= CPUTicks;
	// 	if (serialShiftTimer <= 0) {
	// 		serialShiftTimer = serialShiftTimerAllocated;
	// 		memory[0xFF01] = ((memory[0xFF01] << 1) & 0xFE) | 0x01;	//We could shift in actual link data here if we were to implement such!!!
	// 	}
	// }
// }
// function updateCoreFull () {
// 	//Update the state machine:
// 	// updateCore();
// 	//End of iteration routine:
// 	// if (emulatorTicks >= CPUCyclesTotal) {
// 	// 	iterationEndRoutine();
// 	// }
// }
// function initializeLCDController () {
// 	//Display on hanlding:
// 	var line = 0;
// 	while (line < 154) {
// 		if (line < 143) {
// 			//We're on a normal scan line:
// 			LINECONTROL[line] = function (parentObj) {
// 				if (LCDTicks < 80) {
// 					scanLineMode2();
// 				}
// 				else if (LCDTicks < 252) {
// 					scanLineMode3();
// 				}
// 				else if (LCDTicks < 456) {
// 					scanLineMode0();
// 				}
// 				else {
// 					//We're on a new scan line:
// 					LCDTicks -= 456;
// 					if (STATTracker != 3) {
// 						//Make sure the mode 0 handler was run at least once per scan line:
// 						if (STATTracker != 2) {
// 							if (STATTracker == 0 && mode2TriggerSTAT) {
// 								interruptsRequested |= 0x2;
// 							}
// 							incrementScanLineQueue();
// 						}
// 						if (hdmaRunning) {
// 							executeHDMA();
// 						}
// 						if (mode0TriggerSTAT) {
// 							interruptsRequested |= 0x2;
// 						}
// 					}
// 					//Update the scanline registers and assert the LYC counter:
// 					actualScanLine = ++memory[0xFF44];
// 					//Perform a LYC counter assert:
// 					if (actualScanLine == memory[0xFF45]) {
// 						memory[0xFF41] |= 0x04;
// 						if (LYCMatchTriggerSTAT) {
// 							interruptsRequested |= 0x2;
// 						}
// 					}
// 					else {
// 						memory[0xFF41] &= 0x7B;
// 					}
// 					checkIRQMatching();
// 					//Reset our mode contingency variables:
// 					STATTracker = 0;
// 					modeSTAT = 2;
// 					LINECONTROL[actualScanLine](parentObj);	//Scan Line and STAT Mode Control.
// 				}
// 			}
// 		}
// 		else if (line == 143) {
// 			//We're on the last visible scan line of the LCD screen:
// 			LINECONTROL[143] = function (parentObj) {
// 				if (LCDTicks < 80) {
// 					scanLineMode2();
// 				}
// 				else if (LCDTicks < 252) {
// 					scanLineMode3();
// 				}
// 				else if (LCDTicks < 456) {
// 					scanLineMode0();
// 				}
// 				else {
// 					//Starting V-Blank:
// 					//Just finished the last visible scan line:
// 					LCDTicks -= 456;
// 					if (STATTracker != 3) {
// 						//Make sure the mode 0 handler was run at least once per scan line:
// 						if (STATTracker != 2) {
// 							if (STATTracker == 0 && mode2TriggerSTAT) {
// 								interruptsRequested |= 0x2;
// 							}
// 							incrementScanLineQueue();
// 						}
// 						if (hdmaRunning) {
// 							executeHDMA();
// 						}
// 						if (mode0TriggerSTAT) {
// 							interruptsRequested |= 0x2;
// 						}
// 					}
// 					//Update the scanline registers and assert the LYC counter:
// 					actualScanLine = memory[0xFF44] = 144;
// 					//Perform a LYC counter assert:
// 					if (memory[0xFF45] == 144) {
// 						memory[0xFF41] |= 0x04;
// 						if (LYCMatchTriggerSTAT) {
// 							interruptsRequested |= 0x2;
// 						}
// 					}
// 					else {
// 						memory[0xFF41] &= 0x7B;
// 					}
// 					//Reset our mode contingency variables:
// 					STATTracker = 0;
// 					//Update our state for v-blank:
// 					modeSTAT = 1;
// 					interruptsRequested |= (mode1TriggerSTAT) ? 0x3 : 0x1;
// 					checkIRQMatching();
// 					//Attempt to blit out to our canvas:
// 					if (drewBlank == 0) {
// 						//Ensure JIT framing alignment:
// 						if (totalLinesPassed < 144 || (totalLinesPassed == 144 && midScanlineOffset > -1)) {
// 							//Make sure our gfx are up-to-date:
// 							graphicsJITVBlank();
// 							//Draw the frame:
// 							prepareFrame();
// 						}
// 					}
// 					else {
// 						//LCD off takes at least 2 frames:
// 						--drewBlank;
// 					}
// 					LINECONTROL[144](parentObj);	//Scan Line and STAT Mode Control.
// 				}
// 			}
// 		}
// 		else if (line < 153) {
// 			//In VBlank
// 			LINECONTROL[line] = function (parentObj) {
// 				if (LCDTicks >= 456) {
// 					//We're on a new scan line:
// 					LCDTicks -= 456;
// 					actualScanLine = ++memory[0xFF44];
// 					//Perform a LYC counter assert:
// 					if (actualScanLine == memory[0xFF45]) {
// 						memory[0xFF41] |= 0x04;
// 						if (LYCMatchTriggerSTAT) {
// 							interruptsRequested |= 0x2;
// 							checkIRQMatching();
// 						}
// 					}
// 					else {
// 						memory[0xFF41] &= 0x7B;
// 					}
// 					LINECONTROL[actualScanLine](parentObj);	//Scan Line and STAT Mode Control.
// 				}
// 			}
// 		}
// 		else {
// 			//VBlank Ending (We're on the last actual scan line)
// 			LINECONTROL[153] = function (parentObj) {
// 				if (LCDTicks >= 8) {
// 					if (STATTracker != 4 && memory[0xFF44] == 153) {
// 						memory[0xFF44] = 0;	//LY register resets to 0 early.
// 						//Perform a LYC counter assert:
// 						if (memory[0xFF45] == 0) {
// 							memory[0xFF41] |= 0x04;
// 							if (LYCMatchTriggerSTAT) {
// 								interruptsRequested |= 0x2;
// 								checkIRQMatching();
// 							}
// 						}
// 						else {
// 							memory[0xFF41] &= 0x7B;
// 						}
// 						STATTracker = 4;
// 					}
// 					if (LCDTicks >= 456) {
// 						//We reset back to the beginning:
// 						LCDTicks -= 456;
// 						STATTracker = actualScanLine = 0;
// 						LINECONTROL[0](parentObj);	//Scan Line and STAT Mode Control.
// 					}
// 				}
// 			}
// 		}
// 		++line;
// 	}
// }
// function DisplayShowOff () {
// 	if (drewBlank == 0) {
// 		//Output a blank screen to the output framebuffer:
// 		clearFrameBuffer();
// 		drewFrame = true;
// 	}
// 	drewBlank = 2;
// }
// function executeHDMA () {
// 	DMAWrite(1);
// 	if (halt) {
// 		if ((LCDTicks - spriteCount) < ((4 >> doubleSpeedShifter) | 0x20)) {
// 			//HALT clocking correction:
// 			CPUTicks = 4 + ((0x20 + spriteCount) << doubleSpeedShifter);
// 			LCDTicks = spriteCount + ((4 >> doubleSpeedShifter) | 0x20);
// 		}
// 	}
// 	else {
// 		LCDTicks += (4 >> doubleSpeedShifter) | 0x20;			//LCD Timing Update For HDMA.
// 	}
// 	if (memory[0xFF55] == 0) {
// 		hdmaRunning = false;
// 		memory[0xFF55] = 0xFF;	//Transfer completed ("Hidden last step," since some ROMs don't imply this, but most do).
// 	}
// 	else {
// 		--memory[0xFF55];
// 	}
// }
// function clockUpdate () {
// 	if (cTIMER) {
// 		var dateObj = new Date();
// 		var newTime = dateObj.getTime();
// 		var timeElapsed = newTime - lastIteration;	//Get the numnber of milliseconds since this last executed.
// 		lastIteration = newTime;
// 		if (cTIMER && !RTCHALT) {
// 			//Update the MBC3 RTC:
// 			RTCSeconds += timeElapsed / 1000;
// 			while (RTCSeconds >= 60) {	//System can stutter, so the seconds difference can get large, thus the "while".
// 				RTCSeconds -= 60;
// 				++RTCMinutes;
// 				if (RTCMinutes >= 60) {
// 					RTCMinutes -= 60;
// 					++RTCHours;
// 					if (RTCHours >= 24) {
// 						RTCHours -= 24
// 						++RTCDays;
// 						if (RTCDays >= 512) {
// 							RTCDays -= 512;
// 							RTCDayOverFlow = true;
// 						}
// 					}
// 				}
// 			}
// 		}
// 	}
// }
// function prepareFrame () {
// 	//Copy the internal frame buffer to the output buffer:
// 	// swizzleFrameBuffer();
// 	drewFrame = true;
// }
// function requestDraw () {
// 	if (drewFrame) {
// 		dispatchDraw();
// 	}
// }
// function dispatchDraw () {
// 	if (offscreenRGBCount > 0) {
// 		//We actually updated the graphics internally, so copy out:
// 		if (offscreenRGBCount == 92160) {
// 			// processDraw(swizzledFrame);
// 		}
// 		else {
// 			resizeFrameBuffer();
// 		}
// 	}
// }
// function processDraw (frameBuffer) {
// 	var canvasRGBALength = offscreenRGBCount;
// 	var canvasData = canvasBuffer.data;
// 	var bufferIndex = 0;
// 	for (var canvasIndex = 0; canvasIndex < canvasRGBALength; ++canvasIndex) {
// 		canvasData[canvasIndex++] = frameBuffer[bufferIndex++];
// 		canvasData[canvasIndex++] = frameBuffer[bufferIndex++];
// 		canvasData[canvasIndex++] = frameBuffer[bufferIndex++];
// 	}
// 	graphicsBlit();
// 	drewFrame = false;
// }
// function swizzleFrameBuffer () {
// 	//Convert our dirty 24-bit (24-bit, with internal render flags above it) framebuffer to an 8-bit buffer with separate indices for the RGB channels:
// 	var frameBuffer = frameBuffer;
// 	var swizzledFrame = swizzledFrame;
// 	var bufferIndex = 0;
// 	for (var canvasIndex = 0; canvasIndex < 69120;) {
// 		swizzledFrame[canvasIndex++] = (frameBuffer[bufferIndex] >> 16) & 0xFF;		//Red
// 		swizzledFrame[canvasIndex++] = (frameBuffer[bufferIndex] >> 8) & 0xFF;		//Green
// 		swizzledFrame[canvasIndex++] = frameBuffer[bufferIndex++] & 0xFF;			//Blue
// 	}
// }
// function clearFrameBuffer () {
// 	var bufferIndex = 0;
// 	var frameBuffer = swizzledFrame;
// 	if (cGBC || colorizedGBPalettes) {
// 		while (bufferIndex < 69120) {
// 			frameBuffer[bufferIndex++] = 248;
// 		}
// 	}
// 	else {
// 		while (bufferIndex < 69120) {
// 			frameBuffer[bufferIndex++] = 239;
// 			frameBuffer[bufferIndex++] = 255;
// 			frameBuffer[bufferIndex++] = 222;
// 		}
// 	}
// }
// function resizeFrameBuffer () {
// 	//Resize in javascript with resize.js:
// 	if (resizePathClear) {
// 		resizePathClear = false;
// 		resizer.resize(swizzledFrame);
// 	}
// }
// function renderScanLine (scanlineToRender) {
// 	pixelStart = scanlineToRender * 160;
// 	if (bgEnabled) {
// 		pixelEnd = 160;
// 		BGLayerRender(scanlineToRender);
// 		WindowLayerRender(scanlineToRender);
// 	}
// 	else {
// 		var pixelLine = (scanlineToRender + 1) * 160;
// 		var defaultColor = (cGBC || colorizedGBPalettes) ? 0xF8F8F8 : 0xEFFFDE;
// 		for (var pixelPosition = (scanlineToRender * 160) + currentX; pixelPosition < pixelLine; pixelPosition++) {
// 			frameBuffer[pixelPosition] = defaultColor;
// 		}
// 	}
// 	SpriteLayerRender(scanlineToRender);
// 	currentX = 0;
// 	midScanlineOffset = -1;
// }
// function renderMidScanLine () {
// 	if (actualScanLine < 144 && modeSTAT == 3) {
// 		//TODO: Get this accurate:
// 		if (midScanlineOffset == -1) {
// 			midScanlineOffset = backgroundX & 0x7;
// 		}
// 		if (LCDTicks >= 82) {
// 			pixelEnd = LCDTicks - 74;
// 			pixelEnd = Math.min(pixelEnd - midScanlineOffset - (pixelEnd % 0x8), 160);
// 			if (bgEnabled) {
// 				pixelStart = lastUnrenderedLine * 160;
// 				BGLayerRender(lastUnrenderedLine);
// 				WindowLayerRender(lastUnrenderedLine);
// 				//TODO: Do midscanline JIT for sprites...
// 			}
// 			else {
// 				var pixelLine = (lastUnrenderedLine * 160) + pixelEnd;
// 				var defaultColor = (cGBC || colorizedGBPalettes) ? 0xF8F8F8 : 0xEFFFDE;
// 				for (var pixelPosition = (lastUnrenderedLine * 160) + currentX; pixelPosition < pixelLine; pixelPosition++) {
// 					frameBuffer[pixelPosition] = defaultColor;
// 				}
// 			}
// 			currentX = pixelEnd;
// 		}
// 	}
// }
// function initializeModeSpecificArrays () {
// 	LCDCONTROL = (LCDisOn) ? LINECONTROL : DISPLAYOFFCONTROL;
// 	if (cGBC) {
// 		gbcOBJRawPalette = getTypedArray(0x40, 0, "uint8");
// 		gbcBGRawPalette = getTypedArray(0x40, 0, "uint8");
// 		gbcOBJPalette = getTypedArray(0x20, 0x1000000, "int32");
// 		gbcBGPalette = getTypedArray(0x40, 0, "int32");
// 		BGCHRBank2 = getTypedArray(0x800, 0, "uint8");
// 		BGCHRCurrentBank = (currVRAMBank > 0) ? BGCHRBank2 : BGCHRBank1;
// 		tileCache = generateCacheArray(0xF80);
// 	}
// 	else {
// 		gbOBJPalette = getTypedArray(8, 0, "int32");
// 		gbBGPalette = getTypedArray(4, 0, "int32");
// 		BGPalette = gbBGPalette;
// 		OBJPalette = gbOBJPalette;
// 		tileCache = generateCacheArray(0x700);
// 		sortBuffer = getTypedArray(0x100, 0, "uint8");
// 		OAMAddressCache = getTypedArray(10, 0, "int32");
// 	}
// 	renderPathBuild();
// }
// function GBCtoGBModeAdjust () {
// 	cout("Stepping down from GBC mode.", 0);
// 	VRAM = GBCMemory = BGCHRCurrentBank = BGCHRBank2 = null;
// 	tileCache.length = 0x700;
// 	if (settings[4]) {
// 		gbBGColorizedPalette = getTypedArray(4, 0, "int32");
// 		gbOBJColorizedPalette = getTypedArray(8, 0, "int32");
// 		cachedBGPaletteConversion = getTypedArray(4, 0, "int32");
// 		cachedOBJPaletteConversion = getTypedArray(8, 0, "int32");
// 		BGPalette = gbBGColorizedPalette;
// 		OBJPalette = gbOBJColorizedPalette;
// 		gbOBJPalette = gbBGPalette = null;
// 		getGBCColor();
// 	}
// 	else {
// 		gbOBJPalette = getTypedArray(8, 0, "int32");
// 		gbBGPalette = getTypedArray(4, 0, "int32");
// 		BGPalette = gbBGPalette;
// 		OBJPalette = gbOBJPalette;
// 	}
// 	sortBuffer = getTypedArray(0x100, 0, "uint8");
// 	OAMAddressCache = getTypedArray(10, 0, "int32");
// 	renderPathBuild();
// 	memoryReadJumpCompile();
// 	memoryWriteJumpCompile();
// }
// function renderPathBuild () {
// 	if (!cGBC) {
// 		BGLayerRender = BGGBLayerRender;
// 		WindowLayerRender = WindowGBLayerRender;
// 		SpriteLayerRender = SpriteGBLayerRender;
// 	}
// 	else {
// 		priorityFlaggingPathRebuild();
// 		SpriteLayerRender = SpriteGBCLayerRender;
// 	}
// }
// function priorityFlaggingPathRebuild () {
// 	if (BGPriorityEnabled) {
// 		BGLayerRender = BGGBCLayerRender;
// 		WindowLayerRender = WindowGBCLayerRender;
// 	}
// 	else {
// 		BGLayerRender = BGGBCLayerRenderNoPriorityFlagging;
// 		WindowLayerRender = WindowGBCLayerRenderNoPriorityFlagging;
// 	}
// }
// function initializeReferencesFromSaveState () {
// 	LCDCONTROL = (LCDisOn) ? LINECONTROL : DISPLAYOFFCONTROL;
// 	var tileIndex = 0;
// 	if (!cGBC) {
// 		if (colorizedGBPalettes) {
// 			BGPalette = gbBGColorizedPalette;
// 			OBJPalette = gbOBJColorizedPalette;
// 			updateGBBGPalette = updateGBColorizedBGPalette;
// 			updateGBOBJPalette = updateGBColorizedOBJPalette;

// 		}
// 		else {
// 			BGPalette = gbBGPalette;
// 			OBJPalette = gbOBJPalette;
// 		}
// 		tileCache = generateCacheArray(0x700);
// 		for (tileIndex = 0x8000; tileIndex < 0x9000; tileIndex += 2) {
// 			generateGBOAMTileLine(tileIndex);
// 		}
// 		for (tileIndex = 0x9000; tileIndex < 0x9800; tileIndex += 2) {
// 			generateGBTileLine(tileIndex);
// 		}
// 		sortBuffer = getTypedArray(0x100, 0, "uint8");
// 		OAMAddressCache = getTypedArray(10, 0, "int32");
// 	}
// 	else {
// 		BGCHRCurrentBank = (currVRAMBank > 0) ? BGCHRBank2 : BGCHRBank1;
// 		tileCache = generateCacheArray(0xF80);
// 		for (; tileIndex < 0x1800; tileIndex += 0x10) {
// 			generateGBCTileBank1(tileIndex);
// 			generateGBCTileBank2(tileIndex);
// 		}
// 	}
// 	renderPathBuild();
// }
// function RGBTint (value) {
// 	//Adjustment for the GBC's tinting (According to Gambatte):
// 	var r = value & 0x1F;
// 	var g = (value >> 5) & 0x1F;
// 	var b = (value >> 10) & 0x1F;
// 	return ((r * 13 + g * 2 + b) >> 1) << 16 | (g * 3 + b) << 9 | (r * 3 + g * 2 + b * 11) >> 1;
// }
// function getGBCColor () {
// 	//GBC Colorization of DMG ROMs:
// 	//BG
// 	for (var counter = 0; counter < 4; counter++) {
// 		var adjustedIndex = counter << 1;
// 		//BG
// 		cachedBGPaletteConversion[counter] = RGBTint((gbcBGRawPalette[adjustedIndex | 1] << 8) | gbcBGRawPalette[adjustedIndex]);
// 		//OBJ 1
// 		cachedOBJPaletteConversion[counter] = RGBTint((gbcOBJRawPalette[adjustedIndex | 1] << 8) | gbcOBJRawPalette[adjustedIndex]);
// 	}
// 	//OBJ 2
// 	for (counter = 4; counter < 8; counter++) {
// 		adjustedIndex = counter << 1;
// 		cachedOBJPaletteConversion[counter] = RGBTint((gbcOBJRawPalette[adjustedIndex | 1] << 8) | gbcOBJRawPalette[adjustedIndex]);
// 	}
// 	//Update the palette entries:
// 	updateGBBGPalette = updateGBColorizedBGPalette;
// 	updateGBOBJPalette = updateGBColorizedOBJPalette;
// 	updateGBBGPalette(memory[0xFF47]);
// 	updateGBOBJPalette(0, memory[0xFF48]);
// 	updateGBOBJPalette(1, memory[0xFF49]);
// 	colorizedGBPalettes = true;
// }
// function updateGBRegularBGPalette (data) {
// 	gbBGPalette[0] = colors[data & 0x03] | 0x2000000;
// 	gbBGPalette[1] = colors[(data >> 2) & 0x03];
// 	gbBGPalette[2] = colors[(data >> 4) & 0x03];
// 	gbBGPalette[3] = colors[data >> 6];
// }
// function updateGBColorizedBGPalette (data) {
// 	//GB colorization:
// 	gbBGColorizedPalette[0] = cachedBGPaletteConversion[data & 0x03] | 0x2000000;
// 	gbBGColorizedPalette[1] = cachedBGPaletteConversion[(data >> 2) & 0x03];
// 	gbBGColorizedPalette[2] = cachedBGPaletteConversion[(data >> 4) & 0x03];
// 	gbBGColorizedPalette[3] = cachedBGPaletteConversion[data >> 6];
// }
// function updateGBRegularOBJPalette (index, data) {
// 	gbOBJPalette[index | 1] = colors[(data >> 2) & 0x03];
// 	gbOBJPalette[index | 2] = colors[(data >> 4) & 0x03];
// 	gbOBJPalette[index | 3] = colors[data >> 6];
// }
// function updateGBColorizedOBJPalette (index, data) {
// 	//GB colorization:
// 	gbOBJColorizedPalette[index | 1] = cachedOBJPaletteConversion[index | ((data >> 2) & 0x03)];
// 	gbOBJColorizedPalette[index | 2] = cachedOBJPaletteConversion[index | ((data >> 4) & 0x03)];
// 	gbOBJColorizedPalette[index | 3] = cachedOBJPaletteConversion[index | (data >> 6)];
// }
// function updateGBCBGPalette (index, data) {
// 	if (gbcBGRawPalette[index] != data) {
// 		midScanLineJIT();
// 		//Update the color palette for BG tiles since it changed:
// 		gbcBGRawPalette[index] = data;
// 		if ((index & 0x06) == 0) {
// 			//Palette 0 (Special tile Priority stuff)
// 			data = 0x2000000 | RGBTint((gbcBGRawPalette[index | 1] << 8) | gbcBGRawPalette[index & 0x3E]);
// 			index >>= 1;
// 			gbcBGPalette[index] = data;
// 			gbcBGPalette[0x20 | index] = 0x1000000 | data;
// 		}
// 		else {
// 			//Regular Palettes (No special crap)
// 			data = RGBTint((gbcBGRawPalette[index | 1] << 8) | gbcBGRawPalette[index & 0x3E]);
// 			index >>= 1;
// 			gbcBGPalette[index] = data;
// 			gbcBGPalette[0x20 | index] = 0x1000000 | data;
// 		}
// 	}
// }
// function updateGBCOBJPalette (index, data) {
// 	if (gbcOBJRawPalette[index] != data) {
// 		//Update the color palette for OBJ tiles since it changed:
// 		gbcOBJRawPalette[index] = data;
// 		if ((index & 0x06) > 0) {
// 			//Regular Palettes (No special crap)
// 			midScanLineJIT();
// 			gbcOBJPalette[index >> 1] = 0x1000000 | RGBTint((gbcOBJRawPalette[index | 1] << 8) | gbcOBJRawPalette[index & 0x3E]);
// 		}
// 	}
// }
// function BGGBLayerRender (scanlineToRender) {
// 	var scrollYAdjusted = (backgroundY + scanlineToRender) & 0xFF;						//The line of the BG we're at.
// 	var tileYLine = (scrollYAdjusted & 7) << 3;
// 	var tileYDown = gfxBackgroundCHRBankPosition | ((scrollYAdjusted & 0xF8) << 2);	//The row of cached tiles we're fetching from.
// 	var scrollXAdjusted = (backgroundX + currentX) & 0xFF;						//The scroll amount of the BG.
// 	var pixelPosition = pixelStart + currentX;									//Current pixel we're working on.
// 	var pixelPositionEnd = pixelStart + ((gfxWindowDisplay && (scanlineToRender - windowY) >= 0) ? Math.min(Math.max(windowX, 0) + currentX, pixelEnd) : pixelEnd);	//Make sure we do at most 160 pixels a scanline.
// 	var tileNumber = tileYDown + (scrollXAdjusted >> 3);
// 	var chrCode = BGCHRBank1[tileNumber];
// 	if (chrCode < gfxBackgroundBankOffset) {
// 		chrCode |= 0x100;
// 	}
// 	var tile = tileCache[chrCode];
// 	for (var texel = (scrollXAdjusted & 0x7); texel < 8 && pixelPosition < pixelPositionEnd && scrollXAdjusted < 0x100; ++scrollXAdjusted) {
// 		frameBuffer[pixelPosition++] = BGPalette[tile[tileYLine | texel++]];
// 	}
// 	var scrollXAdjustedAligned = Math.min(pixelPositionEnd - pixelPosition, 0x100 - scrollXAdjusted) >> 3;
// 	scrollXAdjusted += scrollXAdjustedAligned << 3;
// 	scrollXAdjustedAligned += tileNumber;
// 	while (tileNumber < scrollXAdjustedAligned) {
// 		chrCode = BGCHRBank1[++tileNumber];
// 		if (chrCode < gfxBackgroundBankOffset) {
// 			chrCode |= 0x100;
// 		}
// 		tile = tileCache[chrCode];
// 		texel = tileYLine;
// 		frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 		frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 		frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 		frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 		frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 		frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 		frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 		frameBuffer[pixelPosition++] = BGPalette[tile[texel]];
// 	}
// 	if (pixelPosition < pixelPositionEnd) {
// 		if (scrollXAdjusted < 0x100) {
// 			chrCode = BGCHRBank1[++tileNumber];
// 			if (chrCode < gfxBackgroundBankOffset) {
// 				chrCode |= 0x100;
// 			}
// 			tile = tileCache[chrCode];
// 			for (texel = tileYLine - 1; pixelPosition < pixelPositionEnd && scrollXAdjusted < 0x100; ++scrollXAdjusted) {
// 				frameBuffer[pixelPosition++] = BGPalette[tile[++texel]];
// 			}
// 		}
// 		scrollXAdjustedAligned = ((pixelPositionEnd - pixelPosition) >> 3) + tileYDown;
// 		while (tileYDown < scrollXAdjustedAligned) {
// 			chrCode = BGCHRBank1[tileYDown++];
// 			if (chrCode < gfxBackgroundBankOffset) {
// 				chrCode |= 0x100;
// 			}
// 			tile = tileCache[chrCode];
// 			texel = tileYLine;
// 			frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 			frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 			frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 			frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 			frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 			frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 			frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 			frameBuffer[pixelPosition++] = BGPalette[tile[texel]];
// 		}
// 		if (pixelPosition < pixelPositionEnd) {
// 			chrCode = BGCHRBank1[tileYDown];
// 			if (chrCode < gfxBackgroundBankOffset) {
// 				chrCode |= 0x100;
// 			}
// 			tile = tileCache[chrCode];
// 			switch (pixelPositionEnd - pixelPosition) {
// 				case 7:
// 					frameBuffer[pixelPosition + 6] = BGPalette[tile[tileYLine | 6]];
// 				case 6:
// 					frameBuffer[pixelPosition + 5] = BGPalette[tile[tileYLine | 5]];
// 				case 5:
// 					frameBuffer[pixelPosition + 4] = BGPalette[tile[tileYLine | 4]];
// 				case 4:
// 					frameBuffer[pixelPosition + 3] = BGPalette[tile[tileYLine | 3]];
// 				case 3:
// 					frameBuffer[pixelPosition + 2] = BGPalette[tile[tileYLine | 2]];
// 				case 2:
// 					frameBuffer[pixelPosition + 1] = BGPalette[tile[tileYLine | 1]];
// 				case 1:
// 					frameBuffer[pixelPosition] = BGPalette[tile[tileYLine]];
// 			}
// 		}
// 	}
// }
// function BGGBCLayerRender (scanlineToRender) {
// 	var scrollYAdjusted = (backgroundY + scanlineToRender) & 0xFF;						//The line of the BG we're at.
// 	var tileYLine = (scrollYAdjusted & 7) << 3;
// 	var tileYDown = gfxBackgroundCHRBankPosition | ((scrollYAdjusted & 0xF8) << 2);	//The row of cached tiles we're fetching from.
// 	var scrollXAdjusted = (backgroundX + currentX) & 0xFF;						//The scroll amount of the BG.
// 	var pixelPosition = pixelStart + currentX;									//Current pixel we're working on.
// 	var pixelPositionEnd = pixelStart + ((gfxWindowDisplay && (scanlineToRender - windowY) >= 0) ? Math.min(Math.max(windowX, 0) + currentX, pixelEnd) : pixelEnd);	//Make sure we do at most 160 pixels a scanline.
// 	var tileNumber = tileYDown + (scrollXAdjusted >> 3);
// 	var chrCode = BGCHRBank1[tileNumber];
// 	if (chrCode < gfxBackgroundBankOffset) {
// 		chrCode |= 0x100;
// 	}
// 	var attrCode = BGCHRBank2[tileNumber];
// 	var tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 	var palette = ((attrCode & 0x7) << 2) | ((attrCode & 0x80) >> 2);
// 	for (var texel = (scrollXAdjusted & 0x7); texel < 8 && pixelPosition < pixelPositionEnd && scrollXAdjusted < 0x100; ++scrollXAdjusted) {
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[tileYLine | texel++]];
// 	}
// 	var scrollXAdjustedAligned = Math.min(pixelPositionEnd - pixelPosition, 0x100 - scrollXAdjusted) >> 3;
// 	scrollXAdjusted += scrollXAdjustedAligned << 3;
// 	scrollXAdjustedAligned += tileNumber;
// 	while (tileNumber < scrollXAdjustedAligned) {
// 		chrCode = BGCHRBank1[++tileNumber];
// 		if (chrCode < gfxBackgroundBankOffset) {
// 			chrCode |= 0x100;
// 		}
// 		attrCode = BGCHRBank2[tileNumber];
// 		tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 		palette = ((attrCode & 0x7) << 2) | ((attrCode & 0x80) >> 2);
// 		texel = tileYLine;
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel]];
// 	}
// 	if (pixelPosition < pixelPositionEnd) {
// 		if (scrollXAdjusted < 0x100) {
// 			chrCode = BGCHRBank1[++tileNumber];
// 			if (chrCode < gfxBackgroundBankOffset) {
// 				chrCode |= 0x100;
// 			}
// 			attrCode = BGCHRBank2[tileNumber];
// 			tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 			palette = ((attrCode & 0x7) << 2) | ((attrCode & 0x80) >> 2);
// 			for (texel = tileYLine - 1; pixelPosition < pixelPositionEnd && scrollXAdjusted < 0x100; ++scrollXAdjusted) {
// 				frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[++texel]];
// 			}
// 		}
// 		scrollXAdjustedAligned = ((pixelPositionEnd - pixelPosition) >> 3) + tileYDown;
// 		while (tileYDown < scrollXAdjustedAligned) {
// 			chrCode = BGCHRBank1[tileYDown];
// 			if (chrCode < gfxBackgroundBankOffset) {
// 				chrCode |= 0x100;
// 			}
// 			attrCode = BGCHRBank2[tileYDown++];
// 			tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 			palette = ((attrCode & 0x7) << 2) | ((attrCode & 0x80) >> 2);
// 			texel = tileYLine;
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel]];
// 		}
// 		if (pixelPosition < pixelPositionEnd) {
// 			chrCode = BGCHRBank1[tileYDown];
// 			if (chrCode < gfxBackgroundBankOffset) {
// 				chrCode |= 0x100;
// 			}
// 			attrCode = BGCHRBank2[tileYDown];
// 			tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 			palette = ((attrCode & 0x7) << 2) | ((attrCode & 0x80) >> 2);
// 			switch (pixelPositionEnd - pixelPosition) {
// 				case 7:
// 					frameBuffer[pixelPosition + 6] = gbcBGPalette[palette | tile[tileYLine | 6]];
// 				case 6:
// 					frameBuffer[pixelPosition + 5] = gbcBGPalette[palette | tile[tileYLine | 5]];
// 				case 5:
// 					frameBuffer[pixelPosition + 4] = gbcBGPalette[palette | tile[tileYLine | 4]];
// 				case 4:
// 					frameBuffer[pixelPosition + 3] = gbcBGPalette[palette | tile[tileYLine | 3]];
// 				case 3:
// 					frameBuffer[pixelPosition + 2] = gbcBGPalette[palette | tile[tileYLine | 2]];
// 				case 2:
// 					frameBuffer[pixelPosition + 1] = gbcBGPalette[palette | tile[tileYLine | 1]];
// 				case 1:
// 					frameBuffer[pixelPosition] = gbcBGPalette[palette | tile[tileYLine]];
// 			}
// 		}
// 	}
// }
// function BGGBCLayerRenderNoPriorityFlagging (scanlineToRender) {
// 	var scrollYAdjusted = (backgroundY + scanlineToRender) & 0xFF;						//The line of the BG we're at.
// 	var tileYLine = (scrollYAdjusted & 7) << 3;
// 	var tileYDown = gfxBackgroundCHRBankPosition | ((scrollYAdjusted & 0xF8) << 2);	//The row of cached tiles we're fetching from.
// 	var scrollXAdjusted = (backgroundX + currentX) & 0xFF;						//The scroll amount of the BG.
// 	var pixelPosition = pixelStart + currentX;									//Current pixel we're working on.
// 	var pixelPositionEnd = pixelStart + ((gfxWindowDisplay && (scanlineToRender - windowY) >= 0) ? Math.min(Math.max(windowX, 0) + currentX, pixelEnd) : pixelEnd);	//Make sure we do at most 160 pixels a scanline.
// 	var tileNumber = tileYDown + (scrollXAdjusted >> 3);
// 	var chrCode = BGCHRBank1[tileNumber];
// 	if (chrCode < gfxBackgroundBankOffset) {
// 		chrCode |= 0x100;
// 	}
// 	var attrCode = BGCHRBank2[tileNumber];
// 	var tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 	var palette = (attrCode & 0x7) << 2;
// 	for (var texel = (scrollXAdjusted & 0x7); texel < 8 && pixelPosition < pixelPositionEnd && scrollXAdjusted < 0x100; ++scrollXAdjusted) {
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[tileYLine | texel++]];
// 	}
// 	var scrollXAdjustedAligned = Math.min(pixelPositionEnd - pixelPosition, 0x100 - scrollXAdjusted) >> 3;
// 	scrollXAdjusted += scrollXAdjustedAligned << 3;
// 	scrollXAdjustedAligned += tileNumber;
// 	while (tileNumber < scrollXAdjustedAligned) {
// 		chrCode = BGCHRBank1[++tileNumber];
// 		if (chrCode < gfxBackgroundBankOffset) {
// 			chrCode |= 0x100;
// 		}
// 		attrCode = BGCHRBank2[tileNumber];
// 		tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 		palette = (attrCode & 0x7) << 2;
// 		texel = tileYLine;
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 		frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel]];
// 	}
// 	if (pixelPosition < pixelPositionEnd) {
// 		if (scrollXAdjusted < 0x100) {
// 			chrCode = BGCHRBank1[++tileNumber];
// 			if (chrCode < gfxBackgroundBankOffset) {
// 				chrCode |= 0x100;
// 			}
// 			attrCode = BGCHRBank2[tileNumber];
// 			tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 			palette = (attrCode & 0x7) << 2;
// 			for (texel = tileYLine - 1; pixelPosition < pixelPositionEnd && scrollXAdjusted < 0x100; ++scrollXAdjusted) {
// 				frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[++texel]];
// 			}
// 		}
// 		scrollXAdjustedAligned = ((pixelPositionEnd - pixelPosition) >> 3) + tileYDown;
// 		while (tileYDown < scrollXAdjustedAligned) {
// 			chrCode = BGCHRBank1[tileYDown];
// 			if (chrCode < gfxBackgroundBankOffset) {
// 				chrCode |= 0x100;
// 			}
// 			attrCode = BGCHRBank2[tileYDown++];
// 			tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 			palette = (attrCode & 0x7) << 2;
// 			texel = tileYLine;
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 			frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel]];
// 		}
// 		if (pixelPosition < pixelPositionEnd) {
// 			chrCode = BGCHRBank1[tileYDown];
// 			if (chrCode < gfxBackgroundBankOffset) {
// 				chrCode |= 0x100;
// 			}
// 			attrCode = BGCHRBank2[tileYDown];
// 			tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 			palette = (attrCode & 0x7) << 2;
// 			switch (pixelPositionEnd - pixelPosition) {
// 				case 7:
// 					frameBuffer[pixelPosition + 6] = gbcBGPalette[palette | tile[tileYLine | 6]];
// 				case 6:
// 					frameBuffer[pixelPosition + 5] = gbcBGPalette[palette | tile[tileYLine | 5]];
// 				case 5:
// 					frameBuffer[pixelPosition + 4] = gbcBGPalette[palette | tile[tileYLine | 4]];
// 				case 4:
// 					frameBuffer[pixelPosition + 3] = gbcBGPalette[palette | tile[tileYLine | 3]];
// 				case 3:
// 					frameBuffer[pixelPosition + 2] = gbcBGPalette[palette | tile[tileYLine | 2]];
// 				case 2:
// 					frameBuffer[pixelPosition + 1] = gbcBGPalette[palette | tile[tileYLine | 1]];
// 				case 1:
// 					frameBuffer[pixelPosition] = gbcBGPalette[palette | tile[tileYLine]];
// 			}
// 		}
// 	}
// }
// function WindowGBLayerRender (scanlineToRender) {
// 	if (gfxWindowDisplay) {									//Is the window enabled?
// 		var scrollYAdjusted = scanlineToRender - windowY;		//The line of the BG we're at.
// 		if (scrollYAdjusted >= 0) {
// 			var scrollXRangeAdjusted = (windowX > 0) ? (windowX + currentX) : currentX;
// 			var pixelPosition = pixelStart + scrollXRangeAdjusted;
// 			var pixelPositionEnd = pixelStart + pixelEnd;
// 			if (pixelPosition < pixelPositionEnd) {
// 				var tileYLine = (scrollYAdjusted & 0x7) << 3;
// 				var tileNumber = (gfxWindowCHRBankPosition | ((scrollYAdjusted & 0xF8) << 2)) + (currentX >> 3);
// 				var chrCode = BGCHRBank1[tileNumber];
// 				if (chrCode < gfxBackgroundBankOffset) {
// 					chrCode |= 0x100;
// 				}
// 				var tile = tileCache[chrCode];
// 				var texel = (scrollXRangeAdjusted - windowX) & 0x7;
// 				scrollXRangeAdjusted = Math.min(8, texel + pixelPositionEnd - pixelPosition);
// 				while (texel < scrollXRangeAdjusted) {
// 					frameBuffer[pixelPosition++] = BGPalette[tile[tileYLine | texel++]];
// 				}
// 				scrollXRangeAdjusted = tileNumber + ((pixelPositionEnd - pixelPosition) >> 3);
// 				while (tileNumber < scrollXRangeAdjusted) {
// 					chrCode = BGCHRBank1[++tileNumber];
// 					if (chrCode < gfxBackgroundBankOffset) {
// 						chrCode |= 0x100;
// 					}
// 					tile = tileCache[chrCode];
// 					texel = tileYLine;
// 					frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 					frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 					frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 					frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 					frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 					frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 					frameBuffer[pixelPosition++] = BGPalette[tile[texel++]];
// 					frameBuffer[pixelPosition++] = BGPalette[tile[texel]];
// 				}
// 				if (pixelPosition < pixelPositionEnd) {
// 					chrCode = BGCHRBank1[++tileNumber];
// 					if (chrCode < gfxBackgroundBankOffset) {
// 						chrCode |= 0x100;
// 					}
// 					tile = tileCache[chrCode];
// 					switch (pixelPositionEnd - pixelPosition) {
// 						case 7:
// 							frameBuffer[pixelPosition + 6] = BGPalette[tile[tileYLine | 6]];
// 						case 6:
// 							frameBuffer[pixelPosition + 5] = BGPalette[tile[tileYLine | 5]];
// 						case 5:
// 							frameBuffer[pixelPosition + 4] = BGPalette[tile[tileYLine | 4]];
// 						case 4:
// 							frameBuffer[pixelPosition + 3] = BGPalette[tile[tileYLine | 3]];
// 						case 3:
// 							frameBuffer[pixelPosition + 2] = BGPalette[tile[tileYLine | 2]];
// 						case 2:
// 							frameBuffer[pixelPosition + 1] = BGPalette[tile[tileYLine | 1]];
// 						case 1:
// 							frameBuffer[pixelPosition] = BGPalette[tile[tileYLine]];
// 					}
// 				}
// 			}
// 		}
// 	}
// }
// function WindowGBCLayerRender (scanlineToRender) {
// 	if (gfxWindowDisplay) {									//Is the window enabled?
// 		var scrollYAdjusted = scanlineToRender - windowY;		//The line of the BG we're at.
// 		if (scrollYAdjusted >= 0) {
// 			var scrollXRangeAdjusted = (windowX > 0) ? (windowX + currentX) : currentX;
// 			var pixelPosition = pixelStart + scrollXRangeAdjusted;
// 			var pixelPositionEnd = pixelStart + pixelEnd;
// 			if (pixelPosition < pixelPositionEnd) {
// 				var tileYLine = (scrollYAdjusted & 0x7) << 3;
// 				var tileNumber = (gfxWindowCHRBankPosition | ((scrollYAdjusted & 0xF8) << 2)) + (currentX >> 3);
// 				var chrCode = BGCHRBank1[tileNumber];
// 				if (chrCode < gfxBackgroundBankOffset) {
// 					chrCode |= 0x100;
// 				}
// 				var attrCode = BGCHRBank2[tileNumber];
// 				var tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 				var palette = ((attrCode & 0x7) << 2) | ((attrCode & 0x80) >> 2);
// 				var texel = (scrollXRangeAdjusted - windowX) & 0x7;
// 				scrollXRangeAdjusted = Math.min(8, texel + pixelPositionEnd - pixelPosition);
// 				while (texel < scrollXRangeAdjusted) {
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[tileYLine | texel++]];
// 				}
// 				scrollXRangeAdjusted = tileNumber + ((pixelPositionEnd - pixelPosition) >> 3);
// 				while (tileNumber < scrollXRangeAdjusted) {
// 					chrCode = BGCHRBank1[++tileNumber];
// 					if (chrCode < gfxBackgroundBankOffset) {
// 						chrCode |= 0x100;
// 					}
// 					attrCode = BGCHRBank2[tileNumber];
// 					tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 					palette = ((attrCode & 0x7) << 2) | ((attrCode & 0x80) >> 2);
// 					texel = tileYLine;
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel]];
// 				}
// 				if (pixelPosition < pixelPositionEnd) {
// 					chrCode = BGCHRBank1[++tileNumber];
// 					if (chrCode < gfxBackgroundBankOffset) {
// 						chrCode |= 0x100;
// 					}
// 					attrCode = BGCHRBank2[tileNumber];
// 					tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 					palette = ((attrCode & 0x7) << 2) | ((attrCode & 0x80) >> 2);
// 					switch (pixelPositionEnd - pixelPosition) {
// 						case 7:
// 							frameBuffer[pixelPosition + 6] = gbcBGPalette[palette | tile[tileYLine | 6]];
// 						case 6:
// 							frameBuffer[pixelPosition + 5] = gbcBGPalette[palette | tile[tileYLine | 5]];
// 						case 5:
// 							frameBuffer[pixelPosition + 4] = gbcBGPalette[palette | tile[tileYLine | 4]];
// 						case 4:
// 							frameBuffer[pixelPosition + 3] = gbcBGPalette[palette | tile[tileYLine | 3]];
// 						case 3:
// 							frameBuffer[pixelPosition + 2] = gbcBGPalette[palette | tile[tileYLine | 2]];
// 						case 2:
// 							frameBuffer[pixelPosition + 1] = gbcBGPalette[palette | tile[tileYLine | 1]];
// 						case 1:
// 							frameBuffer[pixelPosition] = gbcBGPalette[palette | tile[tileYLine]];
// 					}
// 				}
// 			}
// 		}
// 	}
// }
// function WindowGBCLayerRenderNoPriorityFlagging (scanlineToRender) {
// 	if (gfxWindowDisplay) {									//Is the window enabled?
// 		var scrollYAdjusted = scanlineToRender - windowY;		//The line of the BG we're at.
// 		if (scrollYAdjusted >= 0) {
// 			var scrollXRangeAdjusted = (windowX > 0) ? (windowX + currentX) : currentX;
// 			var pixelPosition = pixelStart + scrollXRangeAdjusted;
// 			var pixelPositionEnd = pixelStart + pixelEnd;
// 			if (pixelPosition < pixelPositionEnd) {
// 				var tileYLine = (scrollYAdjusted & 0x7) << 3;
// 				var tileNumber = (gfxWindowCHRBankPosition | ((scrollYAdjusted & 0xF8) << 2)) + (currentX >> 3);
// 				var chrCode = BGCHRBank1[tileNumber];
// 				if (chrCode < gfxBackgroundBankOffset) {
// 					chrCode |= 0x100;
// 				}
// 				var attrCode = BGCHRBank2[tileNumber];
// 				var tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 				var palette = (attrCode & 0x7) << 2;
// 				var texel = (scrollXRangeAdjusted - windowX) & 0x7;
// 				scrollXRangeAdjusted = Math.min(8, texel + pixelPositionEnd - pixelPosition);
// 				while (texel < scrollXRangeAdjusted) {
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[tileYLine | texel++]];
// 				}
// 				scrollXRangeAdjusted = tileNumber + ((pixelPositionEnd - pixelPosition) >> 3);
// 				while (tileNumber < scrollXRangeAdjusted) {
// 					chrCode = BGCHRBank1[++tileNumber];
// 					if (chrCode < gfxBackgroundBankOffset) {
// 						chrCode |= 0x100;
// 					}
// 					attrCode = BGCHRBank2[tileNumber];
// 					tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 					palette = (attrCode & 0x7) << 2;
// 					texel = tileYLine;
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel++]];
// 					frameBuffer[pixelPosition++] = gbcBGPalette[palette | tile[texel]];
// 				}
// 				if (pixelPosition < pixelPositionEnd) {
// 					chrCode = BGCHRBank1[++tileNumber];
// 					if (chrCode < gfxBackgroundBankOffset) {
// 						chrCode |= 0x100;
// 					}
// 					attrCode = BGCHRBank2[tileNumber];
// 					tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | chrCode];
// 					palette = (attrCode & 0x7) << 2;
// 					switch (pixelPositionEnd - pixelPosition) {
// 						case 7:
// 							frameBuffer[pixelPosition + 6] = gbcBGPalette[palette | tile[tileYLine | 6]];
// 						case 6:
// 							frameBuffer[pixelPosition + 5] = gbcBGPalette[palette | tile[tileYLine | 5]];
// 						case 5:
// 							frameBuffer[pixelPosition + 4] = gbcBGPalette[palette | tile[tileYLine | 4]];
// 						case 4:
// 							frameBuffer[pixelPosition + 3] = gbcBGPalette[palette | tile[tileYLine | 3]];
// 						case 3:
// 							frameBuffer[pixelPosition + 2] = gbcBGPalette[palette | tile[tileYLine | 2]];
// 						case 2:
// 							frameBuffer[pixelPosition + 1] = gbcBGPalette[palette | tile[tileYLine | 1]];
// 						case 1:
// 							frameBuffer[pixelPosition] = gbcBGPalette[palette | tile[tileYLine]];
// 					}
// 				}
// 			}
// 		}
// 	}
// }
// function SpriteGBLayerRender (scanlineToRender) {
// 	if (gfxSpriteShow) {										//Are sprites enabled?
// 		var lineAdjusted = scanlineToRender + 0x10;
// 		var OAMAddress = 0xFE00;
// 		var yoffset = 0;
// 		var xcoord = 1;
// 		var xCoordStart = 0;
// 		var xCoordEnd = 0;
// 		var attrCode = 0;
// 		var palette = 0;
// 		var tile = null;
// 		var data = 0;
// 		var spriteCount = 0;
// 		var length = 0;
// 		var currentPixel = 0;
// 		var linePixel = 0;
// 		//Clear our x-coord sort buffer:
// 		while (xcoord < 168) {
// 			sortBuffer[xcoord++] = 0xFF;
// 		}
// 		if (gfxSpriteNormalHeight) {
// 			//Draw the visible sprites:
// 			for (var length = findLowestSpriteDrawable(lineAdjusted, 0x7); spriteCount < length; ++spriteCount) {
// 				OAMAddress = OAMAddressCache[spriteCount];
// 				yoffset = (lineAdjusted - memory[OAMAddress]) << 3;
// 				attrCode = memory[OAMAddress | 3];
// 				palette = (attrCode & 0x10) >> 2;
// 				tile = tileCache[((attrCode & 0x60) << 4) | memory[OAMAddress | 0x2]];
// 				linePixel = xCoordStart = memory[OAMAddress | 1];
// 				xCoordEnd = Math.min(168 - linePixel, 8);
// 				xcoord = (linePixel > 7) ? 0 : (8 - linePixel);
// 				for (currentPixel = pixelStart + ((linePixel > 8) ? (linePixel - 8) : 0); xcoord < xCoordEnd; ++xcoord, ++currentPixel, ++linePixel) {
// 					if (sortBuffer[linePixel] > xCoordStart) {
// 						if (frameBuffer[currentPixel] >= 0x2000000) {
// 							data = tile[yoffset | xcoord];
// 							if (data > 0) {
// 								frameBuffer[currentPixel] = OBJPalette[palette | data];
// 								sortBuffer[linePixel] = xCoordStart;
// 							}
// 						}
// 						else if (frameBuffer[currentPixel] < 0x1000000) {
// 							data = tile[yoffset | xcoord];
// 							if (data > 0 && attrCode < 0x80) {
// 								frameBuffer[currentPixel] = OBJPalette[palette | data];
// 								sortBuffer[linePixel] = xCoordStart;
// 							}
// 						}
// 					}
// 				}
// 			}
// 		}
// 		else {
// 			//Draw the visible sprites:
// 			for (var length = findLowestSpriteDrawable(lineAdjusted, 0xF); spriteCount < length; ++spriteCount) {
// 				OAMAddress = OAMAddressCache[spriteCount];
// 				yoffset = (lineAdjusted - memory[OAMAddress]) << 3;
// 				attrCode = memory[OAMAddress | 3];
// 				palette = (attrCode & 0x10) >> 2;
// 				if ((attrCode & 0x40) == (0x40 & yoffset)) {
// 					tile = tileCache[((attrCode & 0x60) << 4) | (memory[OAMAddress | 0x2] & 0xFE)];
// 				}
// 				else {
// 					tile = tileCache[((attrCode & 0x60) << 4) | memory[OAMAddress | 0x2] | 1];
// 				}
// 				yoffset &= 0x3F;
// 				linePixel = xCoordStart = memory[OAMAddress | 1];
// 				xCoordEnd = Math.min(168 - linePixel, 8);
// 				xcoord = (linePixel > 7) ? 0 : (8 - linePixel);
// 				for (currentPixel = pixelStart + ((linePixel > 8) ? (linePixel - 8) : 0); xcoord < xCoordEnd; ++xcoord, ++currentPixel, ++linePixel) {
// 					if (sortBuffer[linePixel] > xCoordStart) {
// 						if (frameBuffer[currentPixel] >= 0x2000000) {
// 							data = tile[yoffset | xcoord];
// 							if (data > 0) {
// 								frameBuffer[currentPixel] = OBJPalette[palette | data];
// 								sortBuffer[linePixel] = xCoordStart;
// 							}
// 						}
// 						else if (frameBuffer[currentPixel] < 0x1000000) {
// 							data = tile[yoffset | xcoord];
// 							if (data > 0 && attrCode < 0x80) {
// 								frameBuffer[currentPixel] = OBJPalette[palette | data];
// 								sortBuffer[linePixel] = xCoordStart;
// 							}
// 						}
// 					}
// 				}
// 			}
// 		}
// 	}
// }
// function findLowestSpriteDrawable (scanlineToRender, drawableRange) {
// 	var address = 0xFE00;
// 	var spriteCount = 0;
// 	var diff = 0;
// 	while (address < 0xFEA0 && spriteCount < 10) {
// 		diff = scanlineToRender - memory[address];
// 		if ((diff & drawableRange) == diff) {
// 			OAMAddressCache[spriteCount++] = address;
// 		}
// 		address += 4;
// 	}
// 	return spriteCount;
// }
// function SpriteGBCLayerRender (scanlineToRender) {
// 	if (gfxSpriteShow) {										//Are sprites enabled?
// 		var OAMAddress = 0xFE00;
// 		var lineAdjusted = scanlineToRender + 0x10;
// 		var yoffset = 0;
// 		var xcoord = 0;
// 		var endX = 0;
// 		var xCounter = 0;
// 		var attrCode = 0;
// 		var palette = 0;
// 		var tile = null;
// 		var data = 0;
// 		var currentPixel = 0;
// 		var spriteCount = 0;
// 		if (gfxSpriteNormalHeight) {
// 			for (; OAMAddress < 0xFEA0 && spriteCount < 10; OAMAddress += 4) {
// 				yoffset = lineAdjusted - memory[OAMAddress];
// 				if ((yoffset & 0x7) == yoffset) {
// 					xcoord = memory[OAMAddress | 1] - 8;
// 					endX = Math.min(160, xcoord + 8);
// 					attrCode = memory[OAMAddress | 3];
// 					palette = (attrCode & 7) << 2;
// 					tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | memory[OAMAddress | 2]];
// 					xCounter = (xcoord > 0) ? xcoord : 0;
// 					xcoord -= yoffset << 3;
// 					for (currentPixel = pixelStart + xCounter; xCounter < endX; ++xCounter, ++currentPixel) {
// 						if (frameBuffer[currentPixel] >= 0x2000000) {
// 							data = tile[xCounter - xcoord];
// 							if (data > 0) {
// 								frameBuffer[currentPixel] = gbcOBJPalette[palette | data];
// 							}
// 						}
// 						else if (frameBuffer[currentPixel] < 0x1000000) {
// 							data = tile[xCounter - xcoord];
// 							if (data > 0 && attrCode < 0x80) {		//Don't optimize for attrCode, as LICM-capable JITs should optimize its checks.
// 								frameBuffer[currentPixel] = gbcOBJPalette[palette | data];
// 							}
// 						}
// 					}
// 					++spriteCount;
// 				}
// 			}
// 		}
// 		else {
// 			for (; OAMAddress < 0xFEA0 && spriteCount < 10; OAMAddress += 4) {
// 				yoffset = lineAdjusted - memory[OAMAddress];
// 				if ((yoffset & 0xF) == yoffset) {
// 					xcoord = memory[OAMAddress | 1] - 8;
// 					endX = Math.min(160, xcoord + 8);
// 					attrCode = memory[OAMAddress | 3];
// 					palette = (attrCode & 7) << 2;
// 					if ((attrCode & 0x40) == (0x40 & (yoffset << 3))) {
// 						tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | (memory[OAMAddress | 0x2] & 0xFE)];
// 					}
// 					else {
// 						tile = tileCache[((attrCode & 0x08) << 8) | ((attrCode & 0x60) << 4) | memory[OAMAddress | 0x2] | 1];
// 					}
// 					xCounter = (xcoord > 0) ? xcoord : 0;
// 					xcoord -= (yoffset & 0x7) << 3;
// 					for (currentPixel = pixelStart + xCounter; xCounter < endX; ++xCounter, ++currentPixel) {
// 						if (frameBuffer[currentPixel] >= 0x2000000) {
// 							data = tile[xCounter - xcoord];
// 							if (data > 0) {
// 								frameBuffer[currentPixel] = gbcOBJPalette[palette | data];
// 							}
// 						}
// 						else if (frameBuffer[currentPixel] < 0x1000000) {
// 							data = tile[xCounter - xcoord];
// 							if (data > 0 && attrCode < 0x80) {		//Don't optimize for attrCode, as LICM-capable JITs should optimize its checks.
// 								frameBuffer[currentPixel] = gbcOBJPalette[palette | data];
// 							}
// 						}
// 					}
// 					++spriteCount;
// 				}
// 			}
// 		}
// 	}
// }
// //Generate only a single tile line for the GB tile cache mode:
// function generateGBTileLine (address) {
// 	var lineCopy = (memory[0x1 | address] << 8) | memory[0x9FFE & address];
// 	var tileBlock = tileCache[(address & 0x1FF0) >> 4];
// 	address = (address & 0xE) << 2;
// 	tileBlock[address | 7] = ((lineCopy & 0x100) >> 7) | (lineCopy & 0x1);
// 	tileBlock[address | 6] = ((lineCopy & 0x200) >> 8) | ((lineCopy & 0x2) >> 1);
// 	tileBlock[address | 5] = ((lineCopy & 0x400) >> 9) | ((lineCopy & 0x4) >> 2);
// 	tileBlock[address | 4] = ((lineCopy & 0x800) >> 10) | ((lineCopy & 0x8) >> 3);
// 	tileBlock[address | 3] = ((lineCopy & 0x1000) >> 11) | ((lineCopy & 0x10) >> 4);
// 	tileBlock[address | 2] = ((lineCopy & 0x2000) >> 12) | ((lineCopy & 0x20) >> 5);
// 	tileBlock[address | 1] = ((lineCopy & 0x4000) >> 13) | ((lineCopy & 0x40) >> 6);
// 	tileBlock[address] = ((lineCopy & 0x8000) >> 14) | ((lineCopy & 0x80) >> 7);
// }
// //Generate only a single tile line for the GBC tile cache mode (Bank 1):
// function generateGBCTileLineBank1 (address) {
// 	var lineCopy = (memory[0x1 | address] << 8) | memory[0x9FFE & address];
// 	address &= 0x1FFE;
// 	var tileBlock1 = tileCache[address >> 4];
// 	var tileBlock2 = tileCache[0x200 | (address >> 4)];
// 	var tileBlock3 = tileCache[0x400 | (address >> 4)];
// 	var tileBlock4 = tileCache[0x600 | (address >> 4)];
// 	address = (address & 0xE) << 2;
// 	var addressFlipped = 0x38 - address;
// 	tileBlock4[addressFlipped] = tileBlock2[address] = tileBlock3[addressFlipped | 7] = tileBlock1[address | 7] = ((lineCopy & 0x100) >> 7) | (lineCopy & 0x1);
// 	tileBlock4[addressFlipped | 1] = tileBlock2[address | 1] = tileBlock3[addressFlipped | 6] = tileBlock1[address | 6] = ((lineCopy & 0x200) >> 8) | ((lineCopy & 0x2) >> 1);
// 	tileBlock4[addressFlipped | 2] = tileBlock2[address | 2] = tileBlock3[addressFlipped | 5] = tileBlock1[address | 5] = ((lineCopy & 0x400) >> 9) | ((lineCopy & 0x4) >> 2);
// 	tileBlock4[addressFlipped | 3] = tileBlock2[address | 3] = tileBlock3[addressFlipped | 4] = tileBlock1[address | 4] = ((lineCopy & 0x800) >> 10) | ((lineCopy & 0x8) >> 3);
// 	tileBlock4[addressFlipped | 4] = tileBlock2[address | 4] = tileBlock3[addressFlipped | 3] = tileBlock1[address | 3] = ((lineCopy & 0x1000) >> 11) | ((lineCopy & 0x10) >> 4);
// 	tileBlock4[addressFlipped | 5] = tileBlock2[address | 5] = tileBlock3[addressFlipped | 2] = tileBlock1[address | 2] = ((lineCopy & 0x2000) >> 12) | ((lineCopy & 0x20) >> 5);
// 	tileBlock4[addressFlipped | 6] = tileBlock2[address | 6] = tileBlock3[addressFlipped | 1] = tileBlock1[address | 1] = ((lineCopy & 0x4000) >> 13) | ((lineCopy & 0x40) >> 6);
// 	tileBlock4[addressFlipped | 7] = tileBlock2[address | 7] = tileBlock3[addressFlipped] = tileBlock1[address] = ((lineCopy & 0x8000) >> 14) | ((lineCopy & 0x80) >> 7);
// }
// //Generate all the flip combinations for a full GBC VRAM bank 1 tile:
// function generateGBCTileBank1 (vramAddress) {
// 	var address = vramAddress >> 4;
// 	var tileBlock1 = tileCache[address];
// 	var tileBlock2 = tileCache[0x200 | address];
// 	var tileBlock3 = tileCache[0x400 | address];
// 	var tileBlock4 = tileCache[0x600 | address];
// 	var lineCopy = 0;
// 	vramAddress |= 0x8000;
// 	address = 0;
// 	var addressFlipped = 56;
// 	do {
// 		lineCopy = (memory[0x1 | vramAddress] << 8) | memory[vramAddress];
// 		tileBlock4[addressFlipped] = tileBlock2[address] = tileBlock3[addressFlipped | 7] = tileBlock1[address | 7] = ((lineCopy & 0x100) >> 7) | (lineCopy & 0x1);
// 		tileBlock4[addressFlipped | 1] = tileBlock2[address | 1] = tileBlock3[addressFlipped | 6] = tileBlock1[address | 6] = ((lineCopy & 0x200) >> 8) | ((lineCopy & 0x2) >> 1);
// 		tileBlock4[addressFlipped | 2] = tileBlock2[address | 2] = tileBlock3[addressFlipped | 5] = tileBlock1[address | 5] = ((lineCopy & 0x400) >> 9) | ((lineCopy & 0x4) >> 2);
// 		tileBlock4[addressFlipped | 3] = tileBlock2[address | 3] = tileBlock3[addressFlipped | 4] = tileBlock1[address | 4] = ((lineCopy & 0x800) >> 10) | ((lineCopy & 0x8) >> 3);
// 		tileBlock4[addressFlipped | 4] = tileBlock2[address | 4] = tileBlock3[addressFlipped | 3] = tileBlock1[address | 3] = ((lineCopy & 0x1000) >> 11) | ((lineCopy & 0x10) >> 4);
// 		tileBlock4[addressFlipped | 5] = tileBlock2[address | 5] = tileBlock3[addressFlipped | 2] = tileBlock1[address | 2] = ((lineCopy & 0x2000) >> 12) | ((lineCopy & 0x20) >> 5);
// 		tileBlock4[addressFlipped | 6] = tileBlock2[address | 6] = tileBlock3[addressFlipped | 1] = tileBlock1[address | 1] = ((lineCopy & 0x4000) >> 13) | ((lineCopy & 0x40) >> 6);
// 		tileBlock4[addressFlipped | 7] = tileBlock2[address | 7] = tileBlock3[addressFlipped] = tileBlock1[address] = ((lineCopy & 0x8000) >> 14) | ((lineCopy & 0x80) >> 7);
// 		address += 8;
// 		addressFlipped -= 8;
// 		vramAddress += 2;
// 	} while (addressFlipped > -1);
// }
// //Generate only a single tile line for the GBC tile cache mode (Bank 2):
// function generateGBCTileLineBank2 (address) {
// 	var lineCopy = (VRAM[0x1 | address] << 8) | VRAM[0x1FFE & address];
// 	var tileBlock1 = tileCache[0x800 | (address >> 4)];
// 	var tileBlock2 = tileCache[0xA00 | (address >> 4)];
// 	var tileBlock3 = tileCache[0xC00 | (address >> 4)];
// 	var tileBlock4 = tileCache[0xE00 | (address >> 4)];
// 	address = (address & 0xE) << 2;
// 	var addressFlipped = 0x38 - address;
// 	tileBlock4[addressFlipped] = tileBlock2[address] = tileBlock3[addressFlipped | 7] = tileBlock1[address | 7] = ((lineCopy & 0x100) >> 7) | (lineCopy & 0x1);
// 	tileBlock4[addressFlipped | 1] = tileBlock2[address | 1] = tileBlock3[addressFlipped | 6] = tileBlock1[address | 6] = ((lineCopy & 0x200) >> 8) | ((lineCopy & 0x2) >> 1);
// 	tileBlock4[addressFlipped | 2] = tileBlock2[address | 2] = tileBlock3[addressFlipped | 5] = tileBlock1[address | 5] = ((lineCopy & 0x400) >> 9) | ((lineCopy & 0x4) >> 2);
// 	tileBlock4[addressFlipped | 3] = tileBlock2[address | 3] = tileBlock3[addressFlipped | 4] = tileBlock1[address | 4] = ((lineCopy & 0x800) >> 10) | ((lineCopy & 0x8) >> 3);
// 	tileBlock4[addressFlipped | 4] = tileBlock2[address | 4] = tileBlock3[addressFlipped | 3] = tileBlock1[address | 3] = ((lineCopy & 0x1000) >> 11) | ((lineCopy & 0x10) >> 4);
// 	tileBlock4[addressFlipped | 5] = tileBlock2[address | 5] = tileBlock3[addressFlipped | 2] = tileBlock1[address | 2] = ((lineCopy & 0x2000) >> 12) | ((lineCopy & 0x20) >> 5);
// 	tileBlock4[addressFlipped | 6] = tileBlock2[address | 6] = tileBlock3[addressFlipped | 1] = tileBlock1[address | 1] = ((lineCopy & 0x4000) >> 13) | ((lineCopy & 0x40) >> 6);
// 	tileBlock4[addressFlipped | 7] = tileBlock2[address | 7] = tileBlock3[addressFlipped] = tileBlock1[address] = ((lineCopy & 0x8000) >> 14) | ((lineCopy & 0x80) >> 7);
// }
// //Generate all the flip combinations for a full GBC VRAM bank 2 tile:
// function generateGBCTileBank2 (vramAddress) {
// 	var address = vramAddress >> 4;
// 	var tileBlock1 = tileCache[0x800 | address];
// 	var tileBlock2 = tileCache[0xA00 | address];
// 	var tileBlock3 = tileCache[0xC00 | address];
// 	var tileBlock4 = tileCache[0xE00 | address];
// 	var lineCopy = 0;
// 	address = 0;
// 	var addressFlipped = 56;
// 	do {
// 		lineCopy = (VRAM[0x1 | vramAddress] << 8) | VRAM[vramAddress];
// 		tileBlock4[addressFlipped] = tileBlock2[address] = tileBlock3[addressFlipped | 7] = tileBlock1[address | 7] = ((lineCopy & 0x100) >> 7) | (lineCopy & 0x1);
// 		tileBlock4[addressFlipped | 1] = tileBlock2[address | 1] = tileBlock3[addressFlipped | 6] = tileBlock1[address | 6] = ((lineCopy & 0x200) >> 8) | ((lineCopy & 0x2) >> 1);
// 		tileBlock4[addressFlipped | 2] = tileBlock2[address | 2] = tileBlock3[addressFlipped | 5] = tileBlock1[address | 5] = ((lineCopy & 0x400) >> 9) | ((lineCopy & 0x4) >> 2);
// 		tileBlock4[addressFlipped | 3] = tileBlock2[address | 3] = tileBlock3[addressFlipped | 4] = tileBlock1[address | 4] = ((lineCopy & 0x800) >> 10) | ((lineCopy & 0x8) >> 3);
// 		tileBlock4[addressFlipped | 4] = tileBlock2[address | 4] = tileBlock3[addressFlipped | 3] = tileBlock1[address | 3] = ((lineCopy & 0x1000) >> 11) | ((lineCopy & 0x10) >> 4);
// 		tileBlock4[addressFlipped | 5] = tileBlock2[address | 5] = tileBlock3[addressFlipped | 2] = tileBlock1[address | 2] = ((lineCopy & 0x2000) >> 12) | ((lineCopy & 0x20) >> 5);
// 		tileBlock4[addressFlipped | 6] = tileBlock2[address | 6] = tileBlock3[addressFlipped | 1] = tileBlock1[address | 1] = ((lineCopy & 0x4000) >> 13) | ((lineCopy & 0x40) >> 6);
// 		tileBlock4[addressFlipped | 7] = tileBlock2[address | 7] = tileBlock3[addressFlipped] = tileBlock1[address] = ((lineCopy & 0x8000) >> 14) | ((lineCopy & 0x80) >> 7);
// 		address += 8;
// 		addressFlipped -= 8;
// 		vramAddress += 2;
// 	} while (addressFlipped > -1);
// }
// //Generate only a single tile line for the GB tile cache mode (OAM accessible range):
// function generateGBOAMTileLine (address) {
// 	var lineCopy = (memory[0x1 | address] << 8) | memory[0x9FFE & address];
// 	address &= 0x1FFE;
// 	var tileBlock1 = tileCache[address >> 4];
// 	var tileBlock2 = tileCache[0x200 | (address >> 4)];
// 	var tileBlock3 = tileCache[0x400 | (address >> 4)];
// 	var tileBlock4 = tileCache[0x600 | (address >> 4)];
// 	address = (address & 0xE) << 2;
// 	var addressFlipped = 0x38 - address;
// 	tileBlock4[addressFlipped] = tileBlock2[address] = tileBlock3[addressFlipped | 7] = tileBlock1[address | 7] = ((lineCopy & 0x100) >> 7) | (lineCopy & 0x1);
// 	tileBlock4[addressFlipped | 1] = tileBlock2[address | 1] = tileBlock3[addressFlipped | 6] = tileBlock1[address | 6] = ((lineCopy & 0x200) >> 8) | ((lineCopy & 0x2) >> 1);
// 	tileBlock4[addressFlipped | 2] = tileBlock2[address | 2] = tileBlock3[addressFlipped | 5] = tileBlock1[address | 5] = ((lineCopy & 0x400) >> 9) | ((lineCopy & 0x4) >> 2);
// 	tileBlock4[addressFlipped | 3] = tileBlock2[address | 3] = tileBlock3[addressFlipped | 4] = tileBlock1[address | 4] = ((lineCopy & 0x800) >> 10) | ((lineCopy & 0x8) >> 3);
// 	tileBlock4[addressFlipped | 4] = tileBlock2[address | 4] = tileBlock3[addressFlipped | 3] = tileBlock1[address | 3] = ((lineCopy & 0x1000) >> 11) | ((lineCopy & 0x10) >> 4);
// 	tileBlock4[addressFlipped | 5] = tileBlock2[address | 5] = tileBlock3[addressFlipped | 2] = tileBlock1[address | 2] = ((lineCopy & 0x2000) >> 12) | ((lineCopy & 0x20) >> 5);
// 	tileBlock4[addressFlipped | 6] = tileBlock2[address | 6] = tileBlock3[addressFlipped | 1] = tileBlock1[address | 1] = ((lineCopy & 0x4000) >> 13) | ((lineCopy & 0x40) >> 6);
// 	tileBlock4[addressFlipped | 7] = tileBlock2[address | 7] = tileBlock3[addressFlipped] = tileBlock1[address] = ((lineCopy & 0x8000) >> 14) | ((lineCopy & 0x80) >> 7);
// }
// function graphicsJIT () {
// 	if (LCDisOn) {
// 		totalLinesPassed = 0;			//Mark frame for ensuring a JIT pass for the next framebuffer output.
// 		graphicsJITScanlineGroup();
// 	}
// }
// function graphicsJITVBlank () {
// 	//JIT the graphics to v-blank framing:
// 	totalLinesPassed += queuedScanLines;
// 	graphicsJITScanlineGroup();
// }
// function graphicsJITScanlineGroup () {
// 	//Normal rendering JIT, where we try to do groups of scanlines at once:
// 	while (queuedScanLines > 0) {
// 		renderScanLine(lastUnrenderedLine);
// 		if (lastUnrenderedLine < 143) {
// 			++lastUnrenderedLine;
// 		}
// 		else {
// 			lastUnrenderedLine = 0;
// 		}
// 		--queuedScanLines;
// 	}
// }
// function incrementScanLineQueue () {
// 	if (queuedScanLines < 144) {
// 		++queuedScanLines;
// 	}
// 	else {
// 		currentX = 0;
// 		midScanlineOffset = -1;
// 		if (lastUnrenderedLine < 143) {
// 			++lastUnrenderedLine;
// 		}
// 		else {
// 			lastUnrenderedLine = 0;
// 		}
// 	}
// }
// function midScanLineJIT () {
// 	// graphicsJIT();
// 	renderMidScanLine();
// }
//Check for the highest priority IRQ to fire:
// function launchIRQ () {
// 	var bitShift = 0;
// 	var testbit = 1;
// 	do {
// 		//Check to see if an interrupt is enabled AND requested.
// 		if ((testbit & IRQLineMatched) == testbit) {
// 			IME = false;						//Reset the interrupt enabling.
// 			interruptsRequested -= testbit;	//Reset the interrupt request.
// 			IRQLineMatched = 0;				//Reset the IRQ assertion.
// 			//Interrupts have a certain clock cycle length:
// 			CPUTicks = 20;
// 			//Set the stack pointer to the current program counter value:
// 			stackPointer = (stackPointer - 1) & 0xFFFF;
// 			memoryWriter[stackPointer](this, stackPointer, programCounter >> 8);
// 			stackPointer = (stackPointer - 1) & 0xFFFF;
// 			memoryWriter[stackPointer](this, stackPointer, programCounter & 0xFF);
// 			//Set the program counter to the interrupt's address:
// 			programCounter = 0x40 | (bitShift << 3);
// 			//Clock the core for mid-instruction updates:
// 			updateCore();
// 			return;									//We only want the highest priority interrupt.
// 		}
// 		testbit = 1 << ++bitShift;
// 	} while (bitShift < 5);
// }
/*
	Check for IRQs to be fired while not in HALT:
*/
// function checkIRQMatching () {
// 	if (IME) {
// 		IRQLineMatched = interruptsEnabled & interruptsRequested & 0x1F;
// 	}
// }
/*
	Handle the HALT opcode by predicting all IRQ cases correctly,
	then selecting the next closest IRQ firing from the prediction to
	clock up to. This prevents hacky looping that doesn't predict, but
	instead just clocks through the core update procedure by one which
	is very slow. Not many emulators do this because they have to cover
	all the IRQ prediction cases and they usually get them wrong.
*/
// function calculateHALTPeriod () {
// 	//Initialize our variables and start our prediction:
// 	if (!halt) {
// 		halt = true;
// 		var currentClocks = -1;
// 		var temp_var = 0;
// 		if (LCDisOn) {
// 			//If the LCD is enabled, then predict the LCD IRQs enabled:
// 			if ((interruptsEnabled & 0x1) == 0x1) {
// 				currentClocks = ((456 * (((modeSTAT == 1) ? 298 : 144) - actualScanLine)) - LCDTicks) << doubleSpeedShifter;
// 			}
// 			if ((interruptsEnabled & 0x2) == 0x2) {
// 				if (mode0TriggerSTAT) {
// 					temp_var = (clocksUntilMode0() - LCDTicks) << doubleSpeedShifter;
// 					if (temp_var <= currentClocks || currentClocks == -1) {
// 						currentClocks = temp_var;
// 					}
// 				}
// 				if (mode1TriggerSTAT && (interruptsEnabled & 0x1) == 0) {
// 					temp_var = ((456 * (((modeSTAT == 1) ? 298 : 144) - actualScanLine)) - LCDTicks) << doubleSpeedShifter;
// 					if (temp_var <= currentClocks || currentClocks == -1) {
// 						currentClocks = temp_var;
// 					}
// 				}
// 				if (mode2TriggerSTAT) {
// 					temp_var = (((actualScanLine >= 143) ? (456 * (154 - actualScanLine)) : 456) - LCDTicks) << doubleSpeedShifter;
// 					if (temp_var <= currentClocks || currentClocks == -1) {
// 						currentClocks = temp_var;
// 					}
// 				}
// 				if (LYCMatchTriggerSTAT && memory[0xFF45] <= 153) {
// 					temp_var = (clocksUntilLYCMatch() - LCDTicks) << doubleSpeedShifter;
// 					if (temp_var <= currentClocks || currentClocks == -1) {
// 						currentClocks = temp_var;
// 					}
// 				}
// 			}
// 		}
// 		if (TIMAEnabled && (interruptsEnabled & 0x4) == 0x4) {
// 			//CPU timer IRQ prediction:
// 			temp_var = ((0x100 - memory[0xFF05]) * TACClocker) - timerTicks;
// 			if (temp_var <= currentClocks || currentClocks == -1) {
// 				currentClocks = temp_var;
// 			}
// 		}
// 		if (serialTimer > 0 && (interruptsEnabled & 0x8) == 0x8) {
// 			//Serial IRQ prediction:
// 			if (serialTimer <= currentClocks || currentClocks == -1) {
// 				currentClocks = serialTimer;
// 			}
// 		}
// 	}
// 	else {
// 		var currentClocks = remainingClocks;
// 	}
// 	var maxClocks = (CPUCyclesTotal - emulatorTicks) << doubleSpeedShifter;
// 	if (currentClocks >= 0) {
// 		if (currentClocks <= maxClocks) {
// 			//Exit out of HALT normally:
// 			CPUTicks = Math.max(currentClocks, CPUTicks);
// 			updateCoreFull();
// 			halt = false;
// 			CPUTicks = 0;
// 		}
// 		else {
// 			//Still in HALT, clock only up to the clocks specified per iteration:
// 			CPUTicks = Math.max(maxClocks, CPUTicks);
// 			remainingClocks = currentClocks - CPUTicks;
// 		}
// 	}
// 	else {
// 		//Still in HALT, clock only up to the clocks specified per iteration:
// 		//Will stay in HALT forever (Stuck in HALT forever), but the APU and LCD are still clocked, so don't pause:
// 		CPUTicks += maxClocks;
// 	}
// }
//Memory Reading:
// function memoryRead (address) {
// 	//Act as a wrapper for reading the returns from the compiled jumps to memory.
// 	return memoryReader[address](this, address);	//This seems to be faster than the usual if/else.
// }
// function memoryHighRead (address) {
// 	//Act as a wrapper for reading the returns from the compiled jumps to memory.
// 	return memoryHighReader[address](this, address);	//This seems to be faster than the usual if/else.
// }
// function memoryReadJumpCompile () {
// 	//Faster in some browsers, since we are doing less conditionals overall by implementing them in advance.
// 	for (var index = 0x0000; index <= 0xFFFF; index++) {
// 		if (index < 0x4000) {
// 			memoryReader[index] = memoryReadNormal;
// 		}
// 		else if (index < 0x8000) {
// 			memoryReader[index] = memoryReadROM;
// 		}
// 		else if (index < 0x9800) {
// 			memoryReader[index] = (cGBC) ? VRAMDATAReadCGBCPU : VRAMDATAReadDMGCPU;
// 		}
// 		else if (index < 0xA000) {
// 			memoryReader[index] = (cGBC) ? VRAMCHRReadCGBCPU : VRAMCHRReadDMGCPU;
// 		}
// 		else if (index >= 0xA000 && index < 0xC000) {
// 			if ((numRAMBanks == 1 / 16 && index < 0xA200) || numRAMBanks >= 1) {
// 				if (cMBC7) {
// 					memoryReader[index] = memoryReadMBC7;
// 				}
// 				else if (!cMBC3) {
// 					memoryReader[index] = memoryReadMBC;
// 				}
// 				else {
// 					//MBC3 RTC + RAM:
// 					memoryReader[index] = memoryReadMBC3;
// 				}
// 			}
// 			else {
// 				memoryReader[index] = memoryReadBAD;
// 			}
// 		}
// 		else if (index >= 0xC000 && index < 0xE000) {
// 			if (!cGBC || index < 0xD000) {
// 				memoryReader[index] = memoryReadNormal;
// 			}
// 			else {
// 				memoryReader[index] = memoryReadGBCMemory;
// 			}
// 		}
// 		else if (index >= 0xE000 && index < 0xFE00) {
// 			if (!cGBC || index < 0xF000) {
// 				memoryReader[index] = memoryReadECHONormal;
// 			}
// 			else {
// 				memoryReader[index] = memoryReadECHOGBCMemory;
// 			}
// 		}
// 		else if (index < 0xFEA0) {
// 			memoryReader[index] = memoryReadOAM;
// 		}
// 		else if (cGBC && index >= 0xFEA0 && index < 0xFF00) {
// 			memoryReader[index] = memoryReadNormal;
// 		}
// 		else if (index >= 0xFF00) {
// 			switch (index) {
// 				case 0xFF00:
// 					//JOYPAD:
// 					memoryHighReader[0] = memoryReader[0xFF00] = function (parentObj, address) {
// 						return 0xC0 | memory[0xFF00];	//Top nibble returns as set.
// 					}
// 					break;
// 				case 0xFF01:
// 					//SB
// 					memoryHighReader[0x01] = memoryReader[0xFF01] = function (parentObj, address) {
// 						return (memory[0xFF02] < 0x80) ? memory[0xFF01] : 0xFF;
// 					}
// 					break;
// 				case 0xFF02:
// 					//SC
// 					if (cGBC) {
// 						memoryHighReader[0x02] = memoryReader[0xFF02] = function (parentObj, address) {
// 							return ((serialTimer <= 0) ? 0x7C : 0xFC) | memory[0xFF02];
// 						}
// 					}
// 					else {
// 						memoryHighReader[0x02] = memoryReader[0xFF02] = function (parentObj, address) {
// 							return ((serialTimer <= 0) ? 0x7E : 0xFE) | memory[0xFF02];
// 						}
// 					}
// 					break;
// 				case 0xFF03:
// 					memoryHighReader[0x03] = memoryReader[0xFF03] = memoryReadBAD;
// 					break;
// 				case 0xFF04:
// 					//DIV
// 					memoryHighReader[0x04] = memoryReader[0xFF04] = function (parentObj, address) {
// 						memory[0xFF04] = (memory[0xFF04] + (DIVTicks >> 8)) & 0xFF;
// 						DIVTicks &= 0xFF;
// 						return memory[0xFF04];

// 					}
// 					break;
// 				case 0xFF05:
// 				case 0xFF06:
// 					memoryHighReader[index & 0xFF] = memoryHighReadNormal;
// 					memoryReader[index] = memoryReadNormal;
// 					break;
// 				case 0xFF07:
// 					memoryHighReader[0x07] = memoryReader[0xFF07] = function (parentObj, address) {
// 						return 0xF8 | memory[0xFF07];
// 					}
// 					break;
// 				case 0xFF08:
// 				case 0xFF09:
// 				case 0xFF0A:
// 				case 0xFF0B:
// 				case 0xFF0C:
// 				case 0xFF0D:
// 				case 0xFF0E:
// 					memoryHighReader[index & 0xFF] = memoryReader[index] = memoryReadBAD;
// 					break;
// 				case 0xFF0F:
// 					//IF
// 					memoryHighReader[0x0F] = memoryReader[0xFF0F] = function (parentObj, address) {
// 						return 0xE0 | interruptsRequested;
// 					}
// 					break;
// 				case 0xFF10:
// 					memoryHighReader[0x10] = memoryReader[0xFF10] = function (parentObj, address) {
// 						return 0x80 | memory[0xFF10];
// 					}
// 					break;
// 				case 0xFF11:
// 					memoryHighReader[0x11] = memoryReader[0xFF11] = function (parentObj, address) {
// 						return 0x3F | memory[0xFF11];
// 					}
// 					break;
// 				case 0xFF12:
// 					memoryHighReader[0x12] = memoryHighReadNormal;
// 					memoryReader[0xFF12] = memoryReadNormal;
// 					break;
// 				case 0xFF13:
// 					memoryHighReader[0x13] = memoryReader[0xFF13] = memoryReadBAD;
// 					break;
// 				case 0xFF14:
// 					memoryHighReader[0x14] = memoryReader[0xFF14] = function (parentObj, address) {
// 						return 0xBF | memory[0xFF14];
// 					}
// 					break;
// 				case 0xFF15:
// 					memoryHighReader[0x15] = memoryReadBAD;
// 					memoryReader[0xFF15] = memoryReadBAD;
// 					break;
// 				case 0xFF16:
// 					memoryHighReader[0x16] = memoryReader[0xFF16] = function (parentObj, address) {
// 						return 0x3F | memory[0xFF16];
// 					}
// 					break;
// 				case 0xFF17:
// 					memoryHighReader[0x17] = memoryHighReadNormal;
// 					memoryReader[0xFF17] = memoryReadNormal;
// 					break;
// 				case 0xFF18:
// 					memoryHighReader[0x18] = memoryReader[0xFF18] = memoryReadBAD;
// 					break;
// 				case 0xFF19:
// 					memoryHighReader[0x19] = memoryReader[0xFF19] = function (parentObj, address) {
// 						return 0xBF | memory[0xFF19];
// 					}
// 					break;
// 				case 0xFF1A:
// 					memoryHighReader[0x1A] = memoryReader[0xFF1A] = function (parentObj, address) {
// 						return 0x7F | memory[0xFF1A];
// 					}
// 					break;
// 				case 0xFF1B:
// 					memoryHighReader[0x1B] = memoryReader[0xFF1B] = memoryReadBAD;
// 					break;
// 				case 0xFF1C:
// 					memoryHighReader[0x1C] = memoryReader[0xFF1C] = function (parentObj, address) {
// 						return 0x9F | memory[0xFF1C];
// 					}
// 					break;
// 				case 0xFF1D:
// 					memoryHighReader[0x1D] = memoryReader[0xFF1D] = memoryReadBAD;
// 					break;
// 				case 0xFF1E:
// 					memoryHighReader[0x1E] = memoryReader[0xFF1E] = function (parentObj, address) {
// 						return 0xBF | memory[0xFF1E];
// 					}
// 					break;
// 				case 0xFF1F:
// 				case 0xFF20:
// 					memoryHighReader[index & 0xFF] = memoryReader[index] = memoryReadBAD;
// 					break;
// 				case 0xFF21:
// 				case 0xFF22:
// 					memoryHighReader[index & 0xFF] = memoryHighReadNormal;
// 					memoryReader[index] = memoryReadNormal;
// 					break;
// 				case 0xFF23:
// 					memoryHighReader[0x23] = memoryReader[0xFF23] = function (parentObj, address) {
// 						return 0xBF | memory[0xFF23];
// 					}
// 					break;
// 				case 0xFF24:
// 				case 0xFF25:
// 					memoryHighReader[index & 0xFF] = memoryHighReadNormal;
// 					memoryReader[index] = memoryReadNormal;
// 					break;
// 				case 0xFF26:
// 					memoryHighReader[0x26] = memoryReader[0xFF26] = function (parentObj, address) {
// 						audioJIT();
// 						return 0x70 | memory[0xFF26];
// 					}
// 					break;
// 				case 0xFF27:
// 				case 0xFF28:
// 				case 0xFF29:
// 				case 0xFF2A:
// 				case 0xFF2B:
// 				case 0xFF2C:
// 				case 0xFF2D:
// 				case 0xFF2E:
// 				case 0xFF2F:
// 					memoryHighReader[index & 0xFF] = memoryReader[index] = memoryReadBAD;
// 					break;
// 				case 0xFF30:
// 				case 0xFF31:
// 				case 0xFF32:
// 				case 0xFF33:
// 				case 0xFF34:
// 				case 0xFF35:
// 				case 0xFF36:
// 				case 0xFF37:
// 				case 0xFF38:
// 				case 0xFF39:
// 				case 0xFF3A:
// 				case 0xFF3B:
// 				case 0xFF3C:
// 				case 0xFF3D:
// 				case 0xFF3E:
// 				case 0xFF3F:
// 					memoryReader[index] = function (parentObj, address) {
// 						return (channel3canPlay) ? memory[0xFF00 | (channel3lastSampleLookup >> 1)] : memory[address];
// 					}
// 					memoryHighReader[index & 0xFF] = function (parentObj, address) {
// 						return (channel3canPlay) ? memory[0xFF00 | (channel3lastSampleLookup >> 1)] : memory[0xFF00 | address];
// 					}
// 					break;
// 				case 0xFF40:
// 					memoryHighReader[0x40] = memoryHighReadNormal;
// 					memoryReader[0xFF40] = memoryReadNormal;
// 					break;
// 				case 0xFF41:
// 					memoryHighReader[0x41] = memoryReader[0xFF41] = function (parentObj, address) {
// 						return 0x80 | memory[0xFF41] | modeSTAT;
// 					}
// 					break;
// 				case 0xFF42:
// 					memoryHighReader[0x42] = memoryReader[0xFF42] = function (parentObj, address) {
// 						return backgroundY;
// 					}
// 					break;
// 				case 0xFF43:
// 					memoryHighReader[0x43] = memoryReader[0xFF43] = function (parentObj, address) {
// 						return backgroundX;
// 					}
// 					break;
// 				case 0xFF44:
// 					memoryHighReader[0x44] = memoryReader[0xFF44] = function (parentObj, address) {
// 						return ((LCDisOn) ? memory[0xFF44] : 0);
// 					}
// 					break;
// 				case 0xFF45:
// 				case 0xFF46:
// 				case 0xFF47:
// 				case 0xFF48:
// 				case 0xFF49:
// 					memoryHighReader[index & 0xFF] = memoryHighReadNormal;
// 					memoryReader[index] = memoryReadNormal;
// 					break;
// 				case 0xFF4A:
// 					//WY
// 					memoryHighReader[0x4A] = memoryReader[0xFF4A] = function (parentObj, address) {
// 						return windowY;
// 					}
// 					break;
// 				case 0xFF4B:
// 					memoryHighReader[0x4B] = memoryHighReadNormal;
// 					memoryReader[0xFF4B] = memoryReadNormal;
// 					break;
// 				case 0xFF4C:
// 					memoryHighReader[0x4C] = memoryReader[0xFF4C] = memoryReadBAD;
// 					break;
// 				case 0xFF4D:
// 					memoryHighReader[0x4D] = memoryHighReadNormal;
// 					memoryReader[0xFF4D] = memoryReadNormal;
// 					break;
// 				case 0xFF4E:
// 					memoryHighReader[0x4E] = memoryReader[0xFF4E] = memoryReadBAD;
// 					break;
// 				case 0xFF4F:
// 					memoryHighReader[0x4F] = memoryReader[0xFF4F] = function (parentObj, address) {
// 						return currVRAMBank;
// 					}
// 					break;
// 				case 0xFF50:
// 				case 0xFF51:
// 				case 0xFF52:
// 				case 0xFF53:
// 				case 0xFF54:
// 					memoryHighReader[index & 0xFF] = memoryHighReadNormal;
// 					memoryReader[index] = memoryReadNormal;
// 					break;
// 				case 0xFF55:
// 					if (cGBC) {
// 						memoryHighReader[0x55] = memoryReader[0xFF55] = function (parentObj, address) {
// 							if (!LCDisOn && hdmaRunning) {	//Undocumented behavior alert: HDMA becomes GDMA when LCD is off (Worms Armageddon Fix).
// 								//DMA
// 								DMAWrite((memory[0xFF55] & 0x7F) + 1);
// 								memory[0xFF55] = 0xFF;	//Transfer completed.
// 								hdmaRunning = false;
// 							}
// 							return memory[0xFF55];
// 						}
// 					}
// 					else {
// 						memoryReader[0xFF55] = memoryReadNormal;
// 						memoryHighReader[0x55] = memoryHighReadNormal;
// 					}
// 					break;
// 				case 0xFF56:
// 					if (cGBC) {
// 						memoryHighReader[0x56] = memoryReader[0xFF56] = function (parentObj, address) {
// 							//Return IR "not connected" status:
// 							return 0x3C | ((memory[0xFF56] >= 0xC0) ? (0x2 | (memory[0xFF56] & 0xC1)) : (memory[0xFF56] & 0xC3));
// 						}
// 					}
// 					else {
// 						memoryReader[0xFF56] = memoryReadNormal;
// 						memoryHighReader[0x56] = memoryHighReadNormal;
// 					}
// 					break;
// 				case 0xFF57:
// 				case 0xFF58:
// 				case 0xFF59:
// 				case 0xFF5A:
// 				case 0xFF5B:
// 				case 0xFF5C:
// 				case 0xFF5D:
// 				case 0xFF5E:
// 				case 0xFF5F:
// 				case 0xFF60:
// 				case 0xFF61:
// 				case 0xFF62:
// 				case 0xFF63:
// 				case 0xFF64:
// 				case 0xFF65:
// 				case 0xFF66:
// 				case 0xFF67:
// 					memoryHighReader[index & 0xFF] = memoryReader[index] = memoryReadBAD;
// 					break;
// 				case 0xFF68:
// 				case 0xFF69:
// 				case 0xFF6A:
// 				case 0xFF6B:
// 					memoryHighReader[index & 0xFF] = memoryHighReadNormal;
// 					memoryReader[index] = memoryReadNormal;
// 					break;
// 				case 0xFF6C:
// 					if (cGBC) {
// 						memoryHighReader[0x6C] = memoryReader[0xFF6C] = function (parentObj, address) {
// 							return 0xFE | memory[0xFF6C];
// 						}
// 					}
// 					else {
// 						memoryHighReader[0x6C] = memoryReader[0xFF6C] = memoryReadBAD;
// 					}
// 					break;
// 				case 0xFF6D:
// 				case 0xFF6E:
// 				case 0xFF6F:
// 					memoryHighReader[index & 0xFF] = memoryReader[index] = memoryReadBAD;
// 					break;
// 				case 0xFF70:
// 					if (cGBC) {
// 						//SVBK
// 						memoryHighReader[0x70] = memoryReader[0xFF70] = function (parentObj, address) {
// 							return 0x40 | memory[0xFF70];
// 						}
// 					}
// 					else {
// 						memoryHighReader[0x70] = memoryReader[0xFF70] = memoryReadBAD;
// 					}
// 					break;
// 				case 0xFF71:
// 					memoryHighReader[0x71] = memoryReader[0xFF71] = memoryReadBAD;
// 					break;
// 				case 0xFF72:
// 				case 0xFF73:
// 					memoryHighReader[index & 0xFF] = memoryReader[index] = memoryReadNormal;
// 					break;
// 				case 0xFF74:
// 					if (cGBC) {
// 						memoryHighReader[0x74] = memoryReader[0xFF74] = memoryReadNormal;
// 					}
// 					else {
// 						memoryHighReader[0x74] = memoryReader[0xFF74] = memoryReadBAD;
// 					}
// 					break;
// 				case 0xFF75:
// 					memoryHighReader[0x75] = memoryReader[0xFF75] = function (parentObj, address) {
// 						return 0x8F | memory[0xFF75];
// 					}
// 					break;
//                 case 0xFF76:
//                     //Undocumented realtime PCM amplitude readback:
//                     memoryHighReader[0x76] = memoryReader[0xFF76] = function (parentObj, address) {
//                         audioJIT();
//                         return (channel2envelopeVolume << 4) | channel1envelopeVolume;
//                     }
//                     break;
//                 case 0xFF77:
//                     //Undocumented realtime PCM amplitude readback:
//                     memoryHighReader[0x77] = memoryReader[0xFF77] = function (parentObj, address) {
//                         audioJIT();
//                         return (channel4envelopeVolume << 4) | channel3envelopeVolume;
//                     }
//                     break;
// 				case 0xFF78:
// 				case 0xFF79:
// 				case 0xFF7A:
// 				case 0xFF7B:
// 				case 0xFF7C:
// 				case 0xFF7D:
// 				case 0xFF7E:
// 				case 0xFF7F:
// 					memoryHighReader[index & 0xFF] = memoryReader[index] = memoryReadBAD;
// 					break;
// 				case 0xFFFF:
// 					//IE
// 					memoryHighReader[0xFF] = memoryReader[0xFFFF] = function (parentObj, address) {
// 						return interruptsEnabled;
// 					}
// 					break;
// 				default:
// 					memoryReader[index] = memoryReadNormal;
// 					memoryHighReader[index & 0xFF] = memoryHighReadNormal;
// 			}
// 		}
// 		else {
// 			memoryReader[index] = memoryReadBAD;
// 		}
// 	}
// }
// function memoryReadNormal (parentObj, address) {
// 	return memory[address];
// }
// function memoryHighReadNormal (parentObj, address) {
// 	return memory[0xFF00 | address];
// }
// function memoryReadROM (parentObj, address) {
// 	return ROM[currentROMBank + address];
// }
// function memoryReadMBC (parentObj, address) {
// 	//Switchable RAM
// 	if (MBCRAMBanksEnabled || settings[10]) {
// 		return MBCRam[address + currMBCRAMBankPosition];
// 	}
// 	//cout("Reading from disabled RAM.", 1);
// 	return 0xFF;
// }
// function memoryReadMBC7 (parentObj, address) {
// 	//Switchable RAM
// 	if (MBCRAMBanksEnabled || settings[10]) {
// 		switch (address) {
// 			case 0xA000:
// 			case 0xA060:
// 			case 0xA070:
// 				return 0;
// 			case 0xA080:
// 				//TODO: Gyro Control Register
// 				return 0;
// 			case 0xA050:
// 				//Y High Byte
// 				return highY;
// 			case 0xA040:
// 				//Y Low Byte
// 				return lowY;
// 			case 0xA030:
// 				//X High Byte
// 				return highX;
// 			case 0xA020:
// 				//X Low Byte:
// 				return lowX;
// 			default:
// 				return MBCRam[address + currMBCRAMBankPosition];
// 		}
// 	}
// 	//cout("Reading from disabled RAM.", 1);
// 	return 0xFF;
// }
// function memoryReadMBC3 (parentObj, address) {
// 	//Switchable RAM
// 	if (MBCRAMBanksEnabled || settings[10]) {
// 		switch (currMBCRAMBank) {
// 			case 0x00:
// 			case 0x01:
// 			case 0x02:
// 			case 0x03:
// 				return MBCRam[address + currMBCRAMBankPosition];
// 				break;
// 			case 0x08:
// 				return latchedSeconds;
// 				break;
// 			case 0x09:
// 				return latchedMinutes;
// 				break;
// 			case 0x0A:
// 				return latchedHours;
// 				break;
// 			case 0x0B:
// 				return latchedLDays;
// 				break;
// 			case 0x0C:
// 				return (((RTCDayOverFlow) ? 0x80 : 0) + ((RTCHALT) ? 0x40 : 0)) + latchedHDays;
// 		}
// 	}
// 	//cout("Reading from invalid or disabled RAM.", 1);
// 	return 0xFF;
// }
// function memoryReadGBCMemory (parentObj, address) {
// 	return GBCMemory[address + gbcRamBankPosition];
// }
// function memoryReadOAM (parentObj, address) {
// 	return (modeSTAT > 1) ?  0xFF : memory[address];
// }
// function memoryReadECHOGBCMemory (parentObj, address) {
// 	return GBCMemory[address + gbcRamBankPositionECHO];
// }
// function memoryReadECHONormal (parentObj, address) {
// 	return memory[address - 0x2000];
// }
// function memoryReadBAD (parentObj, address) {
// 	return 0xFF;
// }
// function VRAMDATAReadCGBCPU (parentObj, address) {
// 	//CPU Side Reading The VRAM (Optimized for GameBoy Color)
// 	return (modeSTAT > 2) ? 0xFF : ((currVRAMBank == 0) ? memory[address] : VRAM[address & 0x1FFF]);
// }
// function VRAMDATAReadDMGCPU (parentObj, address) {
// 	//CPU Side Reading The VRAM (Optimized for classic GameBoy)
// 	return (modeSTAT > 2) ? 0xFF : memory[address];
// }
// function VRAMCHRReadCGBCPU (parentObj, address) {
// 	//CPU Side Reading the Character Data Map:
// 	return (modeSTAT > 2) ? 0xFF : BGCHRCurrentBank[address & 0x7FF];
// }
// function VRAMCHRReadDMGCPU (parentObj, address) {
// 	//CPU Side Reading the Character Data Map:
// 	return (modeSTAT > 2) ? 0xFF : BGCHRBank1[address & 0x7FF];
// }
// function setCurrentMBC1ROMBank () {
// 	//Read the cartridge ROM data from RAM memory:
// 	switch (ROMBank1offs) {
// 		case 0x00:
// 		case 0x20:
// 		case 0x40:
// 		case 0x60:
// 			//Bank calls for 0x00, 0x20, 0x40, and 0x60 are really for 0x01, 0x21, 0x41, and 0x61.
// 			currentROMBank = (ROMBank1offs % ROMBankEdge) << 14;
// 			break;
// 		default:
// 			currentROMBank = ((ROMBank1offs % ROMBankEdge) - 1) << 14;
// 	}
// }
// function setCurrentMBC2AND3ROMBank () {
// 	//Read the cartridge ROM data from RAM memory:
// 	//Only map bank 0 to bank 1 here (MBC2 is like MBC1, but can only do 16 banks, so only the bank 0 quirk appears for MBC2):
// 	currentROMBank = Math.max((ROMBank1offs % ROMBankEdge) - 1, 0) << 14;
// }
// function setCurrentMBC5ROMBank () {
// 	//Read the cartridge ROM data from RAM memory:
// 	currentROMBank = ((ROMBank1offs % ROMBankEdge) - 1) << 14;
// }
//Memory Writing:
// function memoryWrite (address, data) {
// 	//Act as a wrapper for writing by compiled jumps to specific memory writing functions.
// 	memoryWriter[address](this, address, data);
// }
//0xFFXX fast path:
export function memoryHighWrite (address, data) {
	//Act as a wrapper for writing by compiled jumps to specific memory writing functions.
	memoryHighWriter[address](this, address, data);
}
function memoryWriteJumpCompile () {
	//Faster in some browsers, since we are doing less conditionals overall by implementing them in advance.
	for (var index = 0xFF00; index <= 0xFFFF; index++) {
		// if (index < 0x8000) {
			// if (cMBC1) {
			// 	if (index < 0x2000) {
			// 		memoryWriter[index] = MBCWriteEnable;
			// 	}
			// 	else if (index < 0x4000) {
			// 		memoryWriter[index] = MBC1WriteROMBank;
			// 	}
			// 	else if (index < 0x6000) {
			// 		memoryWriter[index] = MBC1WriteRAMBank;
			// 	}
			// 	else {
			// 		memoryWriter[index] = MBC1WriteType;
			// 	}
			// }
			// else if (cMBC2) {
			// 	if (index < 0x1000) {
			// 		memoryWriter[index] = MBCWriteEnable;
			// 	}
			// 	else if (index >= 0x2100 && index < 0x2200) {
			// 		memoryWriter[index] = MBC2WriteROMBank;
			// 	}
			// 	else {
			// 		memoryWriter[index] = cartIgnoreWrite;
			// 	}
			// }
			// else if (cMBC3) {
			// 	if (index < 0x2000) {
			// 		memoryWriter[index] = MBCWriteEnable;
			// 	}
			// 	else if (index < 0x4000) {
			// 		memoryWriter[index] = MBC3WriteROMBank;
			// 	}
			// 	else if (index < 0x6000) {
			// 		memoryWriter[index] = MBC3WriteRAMBank;
			// 	}
			// 	else {
			// 		memoryWriter[index] = MBC3WriteRTCLatch;
			// 	}
			// }
			// else if (cMBC5 || cRUMBLE || cMBC7) {
			// 	if (index < 0x2000) {
			// 		memoryWriter[index] = MBCWriteEnable;
			// 	}
			// 	else if (index < 0x3000) {
			// 		memoryWriter[index] = MBC5WriteROMBankLow;
			// 	}
			// 	else if (index < 0x4000) {
			// 		memoryWriter[index] = MBC5WriteROMBankHigh;
			// 	}
			// 	else if (index < 0x6000) {
			// 		memoryWriter[index] = (cRUMBLE) ? RUMBLEWriteRAMBank : MBC5WriteRAMBank;
			// 	}
			// 	else {
			// 		memoryWriter[index] = cartIgnoreWrite;
			// 	}
			// }
			// else if (cHuC3) {
			// 	if (index < 0x2000) {
			// 		memoryWriter[index] = MBCWriteEnable;
			// 	}
			// 	else if (index < 0x4000) {
			// 		memoryWriter[index] = MBC3WriteROMBank;
			// 	}
			// 	else if (index < 0x6000) {
			// 		memoryWriter[index] = HuC3WriteRAMBank;
			// 	}
			// 	else {
			// 		memoryWriter[index] = cartIgnoreWrite;
			// 	}
			// }
			// else {
				// memoryWriter[index] = cartIgnoreWrite;
			// }
		// }
		// else if (index < 0x9000) {
		// 	memoryWriter[index] = (cGBC) ? VRAMGBCDATAWrite : VRAMGBDATAWrite;
		// }
		// else if (index < 0x9800) {
		// 	memoryWriter[index] = (cGBC) ? VRAMGBCDATAWrite : VRAMGBDATAUpperWrite;
		// }
		// else if (index < 0xA000) {
		// 	memoryWriter[index] = (cGBC) ? VRAMGBCCHRMAPWrite : VRAMGBCHRMAPWrite;
		// }
		// else if (index < 0xC000) {
		// 	// if ((numRAMBanks == 1 / 16 && index < 0xA200) || numRAMBanks >= 1) {
		// 	// 	if (!cMBC3) {
		// 	// 		memoryWriter[index] = memoryWriteMBCRAM;
		// 	// 	}
		// 	// 	else {
		// 	// 		//MBC3 RTC + RAM:
		// 	// 		memoryWriter[index] = memoryWriteMBC3RAM;
		// 	// 	}
		// 	// }
		// 	// else {
		// 		memoryWriter[index] = cartIgnoreWrite;
		// 	// }
		// }
		// else if (index < 0xE000) {
		// 	// if (cGBC && index >= 0xD000) {
		// 	// 	memoryWriter[index] = memoryWriteGBCRAM;
		// 	// }
		// 	// else {
		// 		memoryWriter[index] = memoryWriteNormal;
		// 	// }
		// }
		// else if (index < 0xFE00) {
		// 	// if (cGBC && index >= 0xF000) {
		// 	// 	memoryWriter[index] = memoryWriteECHOGBCRAM;
		// 	// }
		// 	// else {
		// 		memoryWriter[index] = memoryWriteECHONormal;
		// 	// }
		// }
		// else if (index <= 0xFEA0) {
		// 	memoryWriter[index] = memoryWriteOAMRAM;
		// }
		// else if (index < 0xFF00) {
			// if (cGBC) {											//Only GBC has access to this RAM.
			// 	memoryWriter[index] = memoryWriteNormal;
			// }
			// else {
				// memoryWriter[index] = cartIgnoreWrite;
			// }
		// }
		// else {
			//Start the I/O initialization by filling in the slots as normal memory:
			// memoryWriter[index] = memoryWriteNormal;
			// memoryHighWriter[index & 0xFF] = memoryHighWriteNormal;
		// }
	}
	registerWriteJumpCompile();				//Compile the I/O write functions separately...
}
// function MBCWriteEnable (parentObj, address, data) {
// 	//MBC RAM Bank Enable/Disable:
// 	MBCRAMBanksEnabled = ((data & 0x0F) == 0x0A);	//If lower nibble is 0x0A, then enable, otherwise disable.
// }
// function MBC1WriteROMBank (parentObj, address, data) {
// 	//MBC1 ROM bank switching:
// 	ROMBank1offs = (ROMBank1offs & 0x60) | (data & 0x1F);
// 	setCurrentMBC1ROMBank();
// }
// function MBC1WriteRAMBank (parentObj, address, data) {
// 	//MBC1 RAM bank switching
// 	if (MBC1Mode) {
// 		//4/32 Mode
// 		currMBCRAMBank = data & 0x03;
// 		currMBCRAMBankPosition = (currMBCRAMBank << 13) - 0xA000;
// 	}
// 	else {
// 		//16/8 Mode
// 		ROMBank1offs = ((data & 0x03) << 5) | (ROMBank1offs & 0x1F);
// 		setCurrentMBC1ROMBank();
// 	}
// }
// function MBC1WriteType (parentObj, address, data) {
// 	//MBC1 mode setting:
// 	MBC1Mode = ((data & 0x1) == 0x1);
// 	if (MBC1Mode) {
// 		ROMBank1offs &= 0x1F;
// 		setCurrentMBC1ROMBank();
// 	}
// 	else {
// 		currMBCRAMBank = 0;
// 		currMBCRAMBankPosition = -0xA000;
// 	}
// }
// function MBC2WriteROMBank (parentObj, address, data) {
// 	//MBC2 ROM bank switching:
// 	ROMBank1offs = data & 0x0F;
// 	setCurrentMBC2AND3ROMBank();
// }
// function MBC3WriteROMBank (parentObj, address, data) {
// 	//MBC3 ROM bank switching:
// 	ROMBank1offs = data & 0x7F;
// 	setCurrentMBC2AND3ROMBank();
// }
// function MBC3WriteRAMBank (parentObj, address, data) {
// 	currMBCRAMBank = data;
// 	if (data < 4) {
// 		//MBC3 RAM bank switching
// 		currMBCRAMBankPosition = (currMBCRAMBank << 13) - 0xA000;
// 	}
// }
// function MBC3WriteRTCLatch (parentObj, address, data) {
// 	if (data == 0) {
// 		RTCisLatched = false;
// 	}
// 	else if (!RTCisLatched) {
// 		//Copy over the current RTC time for reading.
// 		RTCisLatched = true;
// 		latchedSeconds = RTCSeconds | 0;
// 		latchedMinutes = RTCMinutes;
// 		latchedHours = RTCHours;
// 		latchedLDays = (RTCDays & 0xFF);
// 		latchedHDays = RTCDays >> 8;
// 	}
// }
// function MBC5WriteROMBankLow (parentObj, address, data) {
// 	//MBC5 ROM bank switching:
// 	ROMBank1offs = (ROMBank1offs & 0x100) | data;
// 	setCurrentMBC5ROMBank();
// }
// function MBC5WriteROMBankHigh (parentObj, address, data) {
// 	//MBC5 ROM bank switching (by least significant bit):
// 	ROMBank1offs  = ((data & 0x01) << 8) | (ROMBank1offs & 0xFF);
// 	setCurrentMBC5ROMBank();
// }
// function MBC5WriteRAMBank (parentObj, address, data) {
// 	//MBC5 RAM bank switching
// 	currMBCRAMBank = data & 0xF;
// 	currMBCRAMBankPosition = (currMBCRAMBank << 13) - 0xA000;
// }
// function RUMBLEWriteRAMBank (parentObj, address, data) {
// 	//MBC5 RAM bank switching
// 	//Like MBC5, but bit 3 of the lower nibble is used for rumbling and bit 2 is ignored.
// 	currMBCRAMBank = data & 0x03;
// 	currMBCRAMBankPosition = (currMBCRAMBank << 13) - 0xA000;
// }
// function HuC3WriteRAMBank (parentObj, address, data) {
// 	//HuC3 RAM bank switching
// 	currMBCRAMBank = data & 0x03;
// 	currMBCRAMBankPosition = (currMBCRAMBank << 13) - 0xA000;
// }
// function cartIgnoreWrite (parentObj, address, data) {
// 	//We might have encountered illegal RAM writing or such, so just do nothing...
// }
// function memoryWriteNormal (parentObj, address, data) {
// 	memory[address] = data;
// }
// function memoryHighWriteNormal (parentObj, address, data) {
// 	memory[0xFF00 | address] = data;
// }
// function memoryWriteMBCRAM (parentObj, address, data) {
// 	if (MBCRAMBanksEnabled || settings[10]) {
// 		MBCRam[address + currMBCRAMBankPosition] = data;
// 	}
// }
// function memoryWriteMBC3RAM (parentObj, address, data) {
// 	if (MBCRAMBanksEnabled || settings[10]) {
// 		switch (currMBCRAMBank) {
// 			case 0x00:
// 			case 0x01:
// 			case 0x02:
// 			case 0x03:
// 				MBCRam[address + currMBCRAMBankPosition] = data;
// 				break;
// 			case 0x08:
// 				if (data < 60) {
// 					RTCSeconds = data;
// 				}
// 				else {
// 					cout("(Bank #" + currMBCRAMBank + ") RTC write out of range: " + data, 1);
// 				}
// 				break;
// 			case 0x09:
// 				if (data < 60) {
// 					RTCMinutes = data;
// 				}
// 				else {
// 					cout("(Bank #" + currMBCRAMBank + ") RTC write out of range: " + data, 1);
// 				}
// 				break;
// 			case 0x0A:
// 				if (data < 24) {
// 					RTCHours = data;
// 				}
// 				else {
// 					cout("(Bank #" + currMBCRAMBank + ") RTC write out of range: " + data, 1);
// 				}
// 				break;
// 			case 0x0B:
// 				RTCDays = (data & 0xFF) | (RTCDays & 0x100);
// 				break;
// 			case 0x0C:
// 				RTCDayOverFlow = (data > 0x7F);
// 				RTCHalt = (data & 0x40) == 0x40;
// 				RTCDays = ((data & 0x1) << 8) | (RTCDays & 0xFF);
// 				break;
// 			default:
// 				cout("Invalid MBC3 bank address selected: " + currMBCRAMBank, 0);
// 		}
// 	}
// }
// function memoryWriteGBCRAM (parentObj, address, data) {
// 	GBCMemory[address + gbcRamBankPosition] = data;
// }
// function memoryWriteOAMRAM (parentObj, address, data) {
// 	if (modeSTAT < 2) {		//OAM RAM cannot be written to in mode 2 & 3
// 		if (memory[address] != data) {
// 			graphicsJIT();
// 			memory[address] = data;
// 		}
// 	}
// }
// function memoryWriteECHOGBCRAM (parentObj, address, data) {
// 	GBCMemory[address + gbcRamBankPositionECHO] = data;
// }
// function memoryWriteECHONormal (parentObj, address, data) {
// 	memory[address - 0x2000] = data;
// }
// function VRAMGBDATAWrite (parentObj, address, data) {
// 	if (modeSTAT < 3) {	//VRAM cannot be written to during mode 3
// 		if (memory[address] != data) {
// 			//JIT the graphics render queue:
// 			graphicsJIT();
// 			memory[address] = data;
// 			generateGBOAMTileLine(address);
// 		}
// 	}
// }
// function VRAMGBDATAUpperWrite (parentObj, address, data) {
// 	if (modeSTAT < 3) {	//VRAM cannot be written to during mode 3
// 		if (memory[address] != data) {
// 			//JIT the graphics render queue:
// 			graphicsJIT();
// 			memory[address] = data;
// 			generateGBTileLine(address);
// 		}
// 	}
// }
// function VRAMGBCDATAWrite (parentObj, address, data) {
// 	if (modeSTAT < 3) {	//VRAM cannot be written to during mode 3
// 		if (currVRAMBank == 0) {
// 			if (memory[address] != data) {
// 				//JIT the graphics render queue:
// 				graphicsJIT();
// 				memory[address] = data;
// 				generateGBCTileLineBank1(address);
// 			}
// 		}
// 		else {
// 			address &= 0x1FFF;
// 			if (VRAM[address] != data) {
// 				//JIT the graphics render queue:
// 				graphicsJIT();
// 				VRAM[address] = data;
// 				generateGBCTileLineBank2(address);
// 			}
// 		}
// 	}
// }
// function VRAMGBCHRMAPWrite (parentObj, address, data) {
// 	if (modeSTAT < 3) {	//VRAM cannot be written to during mode 3
// 		address &= 0x7FF;
// 		if (BGCHRBank1[address] != data) {
// 			//JIT the graphics render queue:
// 			graphicsJIT();
// 			BGCHRBank1[address] = data;
// 		}
// 	}
// }
// function VRAMGBCCHRMAPWrite (parentObj, address, data) {
// 	if (modeSTAT < 3) {	//VRAM cannot be written to during mode 3
// 		address &= 0x7FF;
// 		if (BGCHRCurrentBank[address] != data) {
// 			//JIT the graphics render queue:
// 			graphicsJIT();
// 			BGCHRCurrentBank[address] = data;
// 		}
// 	}
// }
// function DMAWrite (tilesToTransfer) {
// 	if (!halt) {
// 		//Clock the CPU for the DMA transfer (CPU is halted during the transfer):
// 		CPUTicks += 4 | ((tilesToTransfer << 5) << doubleSpeedShifter);
// 	}
// 	//Source address of the transfer:
// 	var source = (memory[0xFF51] << 8) | memory[0xFF52];
// 	//Destination address in the VRAM memory range:
// 	var destination = (memory[0xFF53] << 8) | memory[0xFF54];
// 	//Creating some references:
// 	var memoryReader = memoryReader;
// 	//JIT the graphics render queue:
// 	// graphicsJIT();
// 	var memory = memory;
// 	//Determining which bank we're working on so we can optimize:
// 	if (currVRAMBank == 0) {
// 		//DMA transfer for VRAM bank 0:
// 		do {
// 			if (destination < 0x1800) {
// 				memory[0x8000 | destination] = memoryReader[source](this, source++);
// 				memory[0x8001 | destination] = memoryReader[source](this, source++);
// 				memory[0x8002 | destination] = memoryReader[source](this, source++);
// 				memory[0x8003 | destination] = memoryReader[source](this, source++);
// 				memory[0x8004 | destination] = memoryReader[source](this, source++);
// 				memory[0x8005 | destination] = memoryReader[source](this, source++);
// 				memory[0x8006 | destination] = memoryReader[source](this, source++);
// 				memory[0x8007 | destination] = memoryReader[source](this, source++);
// 				memory[0x8008 | destination] = memoryReader[source](this, source++);
// 				memory[0x8009 | destination] = memoryReader[source](this, source++);
// 				memory[0x800A | destination] = memoryReader[source](this, source++);
// 				memory[0x800B | destination] = memoryReader[source](this, source++);
// 				memory[0x800C | destination] = memoryReader[source](this, source++);
// 				memory[0x800D | destination] = memoryReader[source](this, source++);
// 				memory[0x800E | destination] = memoryReader[source](this, source++);
// 				memory[0x800F | destination] = memoryReader[source](this, source++);
// 				generateGBCTileBank1(destination);
// 				destination += 0x10;
// 			}
// 			else {
// 				destination &= 0x7F0;
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank1[destination++] = memoryReader[source](this, source++);
// 				destination = (destination + 0x1800) & 0x1FF0;
// 			}
// 			source &= 0xFFF0;
// 			--tilesToTransfer;
// 		} while (tilesToTransfer > 0);
// 	}
// 	else {
// 		var VRAM = VRAM;
// 		//DMA transfer for VRAM bank 1:
// 		do {
// 			if (destination < 0x1800) {
// 				VRAM[destination] = memoryReader[source](this, source++);
// 				VRAM[destination | 0x1] = memoryReader[source](this, source++);
// 				VRAM[destination | 0x2] = memoryReader[source](this, source++);
// 				VRAM[destination | 0x3] = memoryReader[source](this, source++);
// 				VRAM[destination | 0x4] = memoryReader[source](this, source++);
// 				VRAM[destination | 0x5] = memoryReader[source](this, source++);
// 				VRAM[destination | 0x6] = memoryReader[source](this, source++);
// 				VRAM[destination | 0x7] = memoryReader[source](this, source++);
// 				VRAM[destination | 0x8] = memoryReader[source](this, source++);
// 				VRAM[destination | 0x9] = memoryReader[source](this, source++);
// 				VRAM[destination | 0xA] = memoryReader[source](this, source++);
// 				VRAM[destination | 0xB] = memoryReader[source](this, source++);
// 				VRAM[destination | 0xC] = memoryReader[source](this, source++);
// 				VRAM[destination | 0xD] = memoryReader[source](this, source++);
// 				VRAM[destination | 0xE] = memoryReader[source](this, source++);
// 				VRAM[destination | 0xF] = memoryReader[source](this, source++);
// 				generateGBCTileBank2(destination);
// 				destination += 0x10;
// 			}
// 			else {
// 				destination &= 0x7F0;
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				BGCHRBank2[destination++] = memoryReader[source](this, source++);
// 				destination = (destination + 0x1800) & 0x1FF0;
// 			}
// 			source &= 0xFFF0;
// 			--tilesToTransfer;
// 		} while (tilesToTransfer > 0);
// 	}
// 	//Update the HDMA registers to their next addresses:
// 	memory[0xFF51] = source >> 8;
// 	memory[0xFF52] = source & 0xF0;
// 	memory[0xFF53] = destination >> 8;
// 	memory[0xFF54] = destination & 0xF0;
// }
function registerWriteJumpCompile () {
	//I/O Registers (GB + GBC):
	//JoyPad
	// memoryHighWriter[0] = memoryWriter[0xFF00] = function (parentObj, address, data) {
	// 	memory[0xFF00] = (data & 0x30) | ((((data & 0x20) == 0) ? (JoyPad >> 4) : 0xF) & (((data & 0x10) == 0) ? (JoyPad & 0xF) : 0xF));
	// }
	// //SB (Serial Transfer Data)
	// memoryHighWriter[0x1] = memoryWriter[0xFF01] = function (parentObj, address, data) {
	// 	if (memory[0xFF02] < 0x80) {	//Cannot write while a serial transfer is active.
	// 		memory[0xFF01] = data;
	// 	}
	// }
	// //SC (Serial Transfer Control):
	// memoryHighWriter[0x2] = memoryHighWriteNormal;
	// memoryWriter[0xFF02] = memoryWriteNormal;
	// //Unmapped I/O:
	// memoryHighWriter[0x3] = memoryWriter[0xFF03] = cartIgnoreWrite;
	// //DIV
	// memoryHighWriter[0x4] = memoryWriter[0xFF04] = function (parentObj, address, data) {
	// 	DIVTicks &= 0xFF;	//Update DIV for realignment.
	// 	memory[0xFF04] = 0;
	// }
	// //TIMA
	// memoryHighWriter[0x5] = memoryWriter[0xFF05] = function (parentObj, address, data) {
	// 	memory[0xFF05] = data;
	// }
	// //TMA
	// memoryHighWriter[0x6] = memoryWriter[0xFF06] = function (parentObj, address, data) {
	// 	memory[0xFF06] = data;
	// }
	// //TAC
	// memoryHighWriter[0x7] = memoryWriter[0xFF07] = function (parentObj, address, data) {
	// 	memory[0xFF07] = data & 0x07;
	// 	TIMAEnabled = (data & 0x04) == 0x04;
	// 	TACClocker = Math.pow(4, ((data & 0x3) != 0) ? (data & 0x3) : 4) << 2;	//TODO: Find a way to not make a conditional in here...
	// }
	// //Unmapped I/O:
	// memoryHighWriter[0x8] = memoryWriter[0xFF08] = cartIgnoreWrite;
	// memoryHighWriter[0x9] = memoryWriter[0xFF09] = cartIgnoreWrite;
	// memoryHighWriter[0xA] = memoryWriter[0xFF0A] = cartIgnoreWrite;
	// memoryHighWriter[0xB] = memoryWriter[0xFF0B] = cartIgnoreWrite;
	// memoryHighWriter[0xC] = memoryWriter[0xFF0C] = cartIgnoreWrite;
	// memoryHighWriter[0xD] = memoryWriter[0xFF0D] = cartIgnoreWrite;
	// memoryHighWriter[0xE] = memoryWriter[0xFF0E] = cartIgnoreWrite;
	// //IF (Interrupt Request)
	// memoryHighWriter[0xF] = memoryWriter[0xFF0F] = function (parentObj, address, data) {
	// 	interruptsRequested = data;
	// 	// checkIRQMatching();
	// }
	//NR10:
	memoryHighWriter[0x10] = memoryWriter[0xFF10] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			if (channel1decreaseSweep && (data & 0x08) == 0) {
				if (channel1Swept) {
					channel1SweepFault = true;
				}
			}
			channel1lastTimeSweep = (data & 0x70) >> 4;
			channel1frequencySweepDivider = data & 0x07;
			channel1decreaseSweep = ((data & 0x08) == 0x08);
			memory[0xFF10] = data;
			channel1EnableCheck();
		}
	}
	//NR11:
	memoryHighWriter[0x11] = memoryWriter[0xFF11] = function (parentObj, address, data) {
		if (soundMasterEnabled || !cGBC) {
			if (soundMasterEnabled) {
				audioJIT();
			}
			else {
				data &= 0x3F;
			}
			channel1CachedDuty = dutyLookup[data >> 6];
			channel1totalLength = 0x40 - (data & 0x3F);
			memory[0xFF11] = data;
			channel1EnableCheck();
		}
	}
	//NR12:
	memoryHighWriter[0x12] = memoryWriter[0xFF12] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			if (channel1Enabled && channel1envelopeSweeps == 0) {
				//Zombie Volume PAPU Bug:
				if (((memory[0xFF12] ^ data) & 0x8) == 0x8) {
					if ((memory[0xFF12] & 0x8) == 0) {
						if ((memory[0xFF12] & 0x7) == 0x7) {
							channel1envelopeVolume += 2;
						}
						else {
							++channel1envelopeVolume;
						}
					}
					channel1envelopeVolume = (16 - channel1envelopeVolume) & 0xF;
				}
				else if ((memory[0xFF12] & 0xF) == 0x8) {
					channel1envelopeVolume = (1 + channel1envelopeVolume) & 0xF;
				}
				channel1OutputLevelCache();
			}
			channel1envelopeType = ((data & 0x08) == 0x08);
			memory[0xFF12] = data;
			channel1VolumeEnableCheck();
		}
	}
	//NR13:
	memoryHighWriter[0x13] = memoryWriter[0xFF13] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			channel1frequency = (channel1frequency & 0x700) | data;
			channel1FrequencyTracker = (0x800 - channel1frequency) << 2;
		}
	}
	//NR14:
	memoryHighWriter[0x14] = memoryWriter[0xFF14] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			channel1consecutive = ((data & 0x40) == 0x0);
			channel1frequency = ((data & 0x7) << 8) | (channel1frequency & 0xFF);
			channel1FrequencyTracker = (0x800 - channel1frequency) << 2;
			if (data > 0x7F) {
				//Reload 0xFF10:
				channel1timeSweep = channel1lastTimeSweep;
				channel1Swept = false;
				//Reload 0xFF12:
				var nr12 = memory[0xFF12];
				channel1envelopeVolume = nr12 >> 4;
				channel1OutputLevelCache();
				channel1envelopeSweepsLast = (nr12 & 0x7) - 1;
				if (channel1totalLength == 0) {
					channel1totalLength = 0x40;
				}
				if (channel1lastTimeSweep > 0 || channel1frequencySweepDivider > 0) {
					memory[0xFF26] |= 0x1;
				}
				else {
					memory[0xFF26] &= 0xFE;
				}
				if ((data & 0x40) == 0x40) {
					memory[0xFF26] |= 0x1;
				}
				channel1ShadowFrequency = channel1frequency;
				//Reset frequency overflow check + frequency sweep type check:
				channel1SweepFault = false;
				//Supposed to run immediately:
				channel1AudioSweepPerformDummy();
			}
			channel1EnableCheck();
			memory[0xFF14] = data;
		}
	}
	//NR20 (Unused I/O):
	// memoryHighWriter[0x15] = memoryWriter[0xFF15] = cartIgnoreWrite;
	//NR21:
	memoryHighWriter[0x16] = memoryWriter[0xFF16] = function (parentObj, address, data) {
		if (soundMasterEnabled || !cGBC) {
			if (soundMasterEnabled) {
				audioJIT();
			}
			else {
				data &= 0x3F;
			}
			channel2CachedDuty = dutyLookup[data >> 6];
			channel2totalLength = 0x40 - (data & 0x3F);
			memory[0xFF16] = data;
			channel2EnableCheck();
		}
	}
	//NR22:
	memoryHighWriter[0x17] = memoryWriter[0xFF17] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			if (channel2Enabled && channel2envelopeSweeps == 0) {
				//Zombie Volume PAPU Bug:
				if (((memory[0xFF17] ^ data) & 0x8) == 0x8) {
					if ((memory[0xFF17] & 0x8) == 0) {
						if ((memory[0xFF17] & 0x7) == 0x7) {
							channel2envelopeVolume += 2;
						}
						else {
							++channel2envelopeVolume;
						}
					}
					channel2envelopeVolume = (16 - channel2envelopeVolume) & 0xF;
				}
				else if ((memory[0xFF17] & 0xF) == 0x8) {
					channel2envelopeVolume = (1 + channel2envelopeVolume) & 0xF;
				}
				channel2OutputLevelCache();
			}
			channel2envelopeType = ((data & 0x08) == 0x08);
			memory[0xFF17] = data;
			channel2VolumeEnableCheck();
		}
	}
	//NR23:
	memoryHighWriter[0x18] = memoryWriter[0xFF18] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			channel2frequency = (channel2frequency & 0x700) | data;
			channel2FrequencyTracker = (0x800 - channel2frequency) << 2;
		}
	}
	//NR24:
	memoryHighWriter[0x19] = memoryWriter[0xFF19] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			if (data > 0x7F) {
				//Reload 0xFF17:
				var nr22 = memory[0xFF17];
				channel2envelopeVolume = nr22 >> 4;
				channel2OutputLevelCache();
				channel2envelopeSweepsLast = (nr22 & 0x7) - 1;
				if (channel2totalLength == 0) {
					channel2totalLength = 0x40;
				}
				if ((data & 0x40) == 0x40) {
					memory[0xFF26] |= 0x2;
				}
			}
			channel2consecutive = ((data & 0x40) == 0x0);
			channel2frequency = ((data & 0x7) << 8) | (channel2frequency & 0xFF);
			channel2FrequencyTracker = (0x800 - channel2frequency) << 2;
			memory[0xFF19] = data;
			channel2EnableCheck();
		}
	}
	//NR30:
	memoryHighWriter[0x1A] = memoryWriter[0xFF1A] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			if (!channel3canPlay && data >= 0x80) {
				channel3lastSampleLookup = 0;
				channel3UpdateCache();
			}
			channel3canPlay = (data > 0x7F);
			if (channel3canPlay && memory[0xFF1A] > 0x7F && !channel3consecutive) {
				memory[0xFF26] |= 0x4;
			}
			memory[0xFF1A] = data;
			//channel3EnableCheck();
		}
	}
	//NR31:
	memoryHighWriter[0x1B] = memoryWriter[0xFF1B] = function (parentObj, address, data) {
		if (soundMasterEnabled || !cGBC) {
			if (soundMasterEnabled) {
				audioJIT();
			}
			channel3totalLength = 0x100 - data;
			channel3EnableCheck();
		}
	}
	//NR32:
	memoryHighWriter[0x1C] = memoryWriter[0xFF1C] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			data &= 0x60;
			memory[0xFF1C] = data;
			channel3patternType = (data == 0) ? 4 : ((data >> 5) - 1);
		}
	}
	//NR33:
	memoryHighWriter[0x1D] = memoryWriter[0xFF1D] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			channel3frequency = (channel3frequency & 0x700) | data;
			channel3FrequencyPeriod = (0x800 - channel3frequency) << 1;
		}
	}
	//NR34:
	memoryHighWriter[0x1E] = memoryWriter[0xFF1E] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			if (data > 0x7F) {
				if (channel3totalLength == 0) {
					channel3totalLength = 0x100;
				}
				channel3lastSampleLookup = 0;
				if ((data & 0x40) == 0x40) {
					memory[0xFF26] |= 0x4;
				}
			}
			channel3consecutive = ((data & 0x40) == 0x0);
			channel3frequency = ((data & 0x7) << 8) | (channel3frequency & 0xFF);
			channel3FrequencyPeriod = (0x800 - channel3frequency) << 1;
			memory[0xFF1E] = data;
			channel3EnableCheck();
		}
	}
	//NR40 (Unused I/O):
	// memoryHighWriter[0x1F] = memoryWriter[0xFF1F] = cartIgnoreWrite;
	//NR41:
	memoryHighWriter[0x20] = memoryWriter[0xFF20] = function (parentObj, address, data) {
		if (soundMasterEnabled || !cGBC) {
			if (soundMasterEnabled) {
				audioJIT();
			}
			channel4totalLength = 0x40 - (data & 0x3F);
			channel4EnableCheck();
		}
	}
	//NR42:
	memoryHighWriter[0x21] = memoryWriter[0xFF21] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			if (channel4Enabled && channel4envelopeSweeps == 0) {
				//Zombie Volume PAPU Bug:
				if (((memory[0xFF21] ^ data) & 0x8) == 0x8) {
					if ((memory[0xFF21] & 0x8) == 0) {
						if ((memory[0xFF21] & 0x7) == 0x7) {
							channel4envelopeVolume += 2;
						}
						else {
							++channel4envelopeVolume;
						}
					}
					channel4envelopeVolume = (16 - channel4envelopeVolume) & 0xF;
				}
				else if ((memory[0xFF21] & 0xF) == 0x8) {
					channel4envelopeVolume = (1 + channel4envelopeVolume) & 0xF;
				}
				channel4currentVolume = channel4envelopeVolume << channel4VolumeShifter;
			}
			channel4envelopeType = ((data & 0x08) == 0x08);
			memory[0xFF21] = data;
			channel4UpdateCache();
			channel4VolumeEnableCheck();
		}
	}
	//NR43:
	memoryHighWriter[0x22] = memoryWriter[0xFF22] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			channel4FrequencyPeriod = Math.max((data & 0x7) << 4, 8) << (data >> 4);
			var bitWidth = (data & 0x8);
			if ((bitWidth == 0x8 && channel4BitRange == 0x7FFF) || (bitWidth == 0 && channel4BitRange == 0x7F)) {
				channel4lastSampleLookup = 0;
				channel4BitRange = (bitWidth == 0x8) ? 0x7F : 0x7FFF;
				channel4VolumeShifter = (bitWidth == 0x8) ? 7 : 15;
				channel4currentVolume = channel4envelopeVolume << channel4VolumeShifter;
				noiseSampleTable = (bitWidth == 0x8) ? LSFR7Table : LSFR15Table;
			}
			memory[0xFF22] = data;
			channel4UpdateCache();
		}
	}
	//NR44:
	memoryHighWriter[0x23] = memoryWriter[0xFF23] = function (parentObj, address, data) {
		if (soundMasterEnabled) {
			audioJIT();
			memory[0xFF23] = data;
			channel4consecutive = ((data & 0x40) == 0x0);
			if (data > 0x7F) {
				var nr42 = memory[0xFF21];
				channel4envelopeVolume = nr42 >> 4;
				channel4currentVolume = channel4envelopeVolume << channel4VolumeShifter;
				channel4envelopeSweepsLast = (nr42 & 0x7) - 1;
				if (channel4totalLength == 0) {
					channel4totalLength = 0x40;
				}
				if ((data & 0x40) == 0x40) {
					memory[0xFF26] |= 0x8;
				}
			}
			channel4EnableCheck();
		}
	}
	//NR50:
	memoryHighWriter[0x24] = memoryWriter[0xFF24] = function (parentObj, address, data) {
		if (soundMasterEnabled && memory[0xFF24] != data) {
			audioJIT();
			memory[0xFF24] = data;
			VinLeftChannelMasterVolume = ((data >> 4) & 0x07) + 1;
			VinRightChannelMasterVolume = (data & 0x07) + 1;
			mixerOutputLevelCache();
		}
	}
	//NR51:
	memoryHighWriter[0x25] = memoryWriter[0xFF25] = function (parentObj, address, data) {
		if (soundMasterEnabled && memory[0xFF25] != data) {
			audioJIT();
			memory[0xFF25] = data;
			rightChannel1 = ((data & 0x01) == 0x01);
			rightChannel2 = ((data & 0x02) == 0x02);
			rightChannel3 = ((data & 0x04) == 0x04);
			rightChannel4 = ((data & 0x08) == 0x08);
			leftChannel1 = ((data & 0x10) == 0x10);
			leftChannel2 = ((data & 0x20) == 0x20);
			leftChannel3 = ((data & 0x40) == 0x40);
			leftChannel4 = (data > 0x7F);
			channel1OutputLevelCache();
			channel2OutputLevelCache();
			channel3OutputLevelCache();
			channel4OutputLevelCache();
		}
	}
	//NR52:
	memoryHighWriter[0x26] = memoryWriter[0xFF26] = function (parentObj, address, data) {
		audioJIT();
		if (!soundMasterEnabled && data > 0x7F) {
			memory[0xFF26] = 0x80;
			soundMasterEnabled = true;
			initializeAudioStartState();
		}
		else if (soundMasterEnabled && data < 0x80) {
			memory[0xFF26] = 0;
			soundMasterEnabled = false;
			//GBDev wiki says the registers are written with zeros on power off:
			for (var index = 0xFF10; index < 0xFF26; index++) {
				memoryWriter[index](parentObj, index, 0);
			}
		}
	}
	// //0xFF27 to 0xFF2F don't do anything...
	// memoryHighWriter[0x27] = memoryWriter[0xFF27] = cartIgnoreWrite;
	// memoryHighWriter[0x28] = memoryWriter[0xFF28] = cartIgnoreWrite;
	// memoryHighWriter[0x29] = memoryWriter[0xFF29] = cartIgnoreWrite;
	// memoryHighWriter[0x2A] = memoryWriter[0xFF2A] = cartIgnoreWrite;
	// memoryHighWriter[0x2B] = memoryWriter[0xFF2B] = cartIgnoreWrite;
	// memoryHighWriter[0x2C] = memoryWriter[0xFF2C] = cartIgnoreWrite;
	// memoryHighWriter[0x2D] = memoryWriter[0xFF2D] = cartIgnoreWrite;
	// memoryHighWriter[0x2E] = memoryWriter[0xFF2E] = cartIgnoreWrite;
	// memoryHighWriter[0x2F] = memoryWriter[0xFF2F] = cartIgnoreWrite;
	//WAVE PCM RAM:
	memoryHighWriter[0x30] = memoryWriter[0xFF30] = function (parentObj, address, data) {
		channel3WriteRAM(0, data);
	}
	memoryHighWriter[0x31] = memoryWriter[0xFF31] = function (parentObj, address, data) {
		channel3WriteRAM(0x1, data);
	}
	memoryHighWriter[0x32] = memoryWriter[0xFF32] = function (parentObj, address, data) {
		channel3WriteRAM(0x2, data);
	}
	memoryHighWriter[0x33] = memoryWriter[0xFF33] = function (parentObj, address, data) {
		channel3WriteRAM(0x3, data);
	}
	memoryHighWriter[0x34] = memoryWriter[0xFF34] = function (parentObj, address, data) {
		channel3WriteRAM(0x4, data);
	}
	memoryHighWriter[0x35] = memoryWriter[0xFF35] = function (parentObj, address, data) {
		channel3WriteRAM(0x5, data);
	}
	memoryHighWriter[0x36] = memoryWriter[0xFF36] = function (parentObj, address, data) {
		channel3WriteRAM(0x6, data);
	}
	memoryHighWriter[0x37] = memoryWriter[0xFF37] = function (parentObj, address, data) {
		channel3WriteRAM(0x7, data);
	}
	memoryHighWriter[0x38] = memoryWriter[0xFF38] = function (parentObj, address, data) {
		channel3WriteRAM(0x8, data);
	}
	memoryHighWriter[0x39] = memoryWriter[0xFF39] = function (parentObj, address, data) {
		channel3WriteRAM(0x9, data);
	}
	memoryHighWriter[0x3A] = memoryWriter[0xFF3A] = function (parentObj, address, data) {
		channel3WriteRAM(0xA, data);
	}
	memoryHighWriter[0x3B] = memoryWriter[0xFF3B] = function (parentObj, address, data) {
		channel3WriteRAM(0xB, data);
	}
	memoryHighWriter[0x3C] = memoryWriter[0xFF3C] = function (parentObj, address, data) {
		channel3WriteRAM(0xC, data);
	}
	memoryHighWriter[0x3D] = memoryWriter[0xFF3D] = function (parentObj, address, data) {
		channel3WriteRAM(0xD, data);
	}
	memoryHighWriter[0x3E] = memoryWriter[0xFF3E] = function (parentObj, address, data) {
		channel3WriteRAM(0xE, data);
	}
	memoryHighWriter[0x3F] = memoryWriter[0xFF3F] = function (parentObj, address, data) {
		channel3WriteRAM(0xF, data);
	}
	// //SCY
	// memoryHighWriter[0x42] = memoryWriter[0xFF42] = function (parentObj, address, data) {
	// 	if (backgroundY != data) {
	// 		midScanLineJIT();
	// 		backgroundY = data;
	// 	}
	// }
	// //SCX
	// memoryHighWriter[0x43] = memoryWriter[0xFF43] = function (parentObj, address, data) {
	// 	if (backgroundX != data) {
	// 		midScanLineJIT();
	// 		backgroundX = data;
	// 	}
	// }
	// //LY
	// memoryHighWriter[0x44] = memoryWriter[0xFF44] = function (parentObj, address, data) {
	// 	//Read Only:
	// 	if (LCDisOn) {
	// 		//Gambatte says to do this:
	// 		modeSTAT = 2;
	// 		midScanlineOffset = -1;
	// 		totalLinesPassed = currentX = queuedScanLines = lastUnrenderedLine = LCDTicks = STATTracker = actualScanLine = memory[0xFF44] = 0;
	// 	}
	// }
	// //LYC
	// memoryHighWriter[0x45] = memoryWriter[0xFF45] = function (parentObj, address, data) {
	// 	if (memory[0xFF45] != data) {
	// 		memory[0xFF45] = data;
	// 		if (LCDisOn) {
	// 			matchLYC();	//Get the compare of the first scan line.
	// 		}
	// 	}
	// }
	// //WY
	// memoryHighWriter[0x4A] = memoryWriter[0xFF4A] = function (parentObj, address, data) {
	// 	if (windowY != data) {
	// 		midScanLineJIT();
	// 		windowY = data;
	// 	}
	// }
	// //WX
	// memoryHighWriter[0x4B] = memoryWriter[0xFF4B] = function (parentObj, address, data) {
	// 	if (memory[0xFF4B] != data) {
	// 		midScanLineJIT();
	// 		memory[0xFF4B] = data;
	// 		windowX = data - 7;
	// 	}
	// }
	// memoryHighWriter[0x72] = memoryWriter[0xFF72] = function (parentObj, address, data) {
	// 	memory[0xFF72] = data;
	// }
	// memoryHighWriter[0x73] = memoryWriter[0xFF73] = function (parentObj, address, data) {
	// 	memory[0xFF73] = data;
	// }
	// memoryHighWriter[0x75] = memoryWriter[0xFF75] = function (parentObj, address, data) {
	// 	memory[0xFF75] = data;
	// }
	// memoryHighWriter[0x76] = memoryWriter[0xFF76] = cartIgnoreWrite;
	// memoryHighWriter[0x77] = memoryWriter[0xFF77] = cartIgnoreWrite;
	// //IE (Interrupt Enable)
	// memoryHighWriter[0xFF] = memoryWriter[0xFFFF] = function (parentObj, address, data) {
	// 	interruptsEnabled = data;
	// 	// checkIRQMatching();
	// }
	// recompileModelSpecificIOWriteHandling();
	// recompileBootIOWriteHandling();
}
// function recompileModelSpecificIOWriteHandling () {
	// if (cGBC) {
	// 	//GameBoy Color Specific I/O:
	// 	//SC (Serial Transfer Control Register)
	// 	memoryHighWriter[0x2] = memoryWriter[0xFF02] = function (parentObj, address, data) {
	// 		if (((data & 0x1) == 0x1)) {
	// 			//Internal clock:
	// 			memory[0xFF02] = (data & 0x7F);
	// 			serialTimer = ((data & 0x2) == 0) ? 4096 : 128;	//Set the Serial IRQ counter.
	// 			serialShiftTimer = serialShiftTimerAllocated = ((data & 0x2) == 0) ? 512 : 16;	//Set the transfer data shift counter.
	// 		}
	// 		else {
	// 			//External clock:
	// 			memory[0xFF02] = data;
	// 			serialShiftTimer = serialShiftTimerAllocated = serialTimer = 0;	//Zero the timers, since we're emulating as if nothing is connected.
	// 		}
	// 	}
	// 	memoryHighWriter[0x40] = memoryWriter[0xFF40] = function (parentObj, address, data) {
	// 		if (memory[0xFF40] != data) {
	// 			midScanLineJIT();
	// 			var temp_var = (data > 0x7F);
	// 			if (temp_var != LCDisOn) {
	// 				//When the display mode changes...
	// 				LCDisOn = temp_var;
	// 				memory[0xFF41] &= 0x78;
	// 				midScanlineOffset = -1;
	// 				totalLinesPassed = currentX = queuedScanLines = lastUnrenderedLine = STATTracker = LCDTicks = actualScanLine = memory[0xFF44] = 0;
	// 				if (LCDisOn) {
	// 					modeSTAT = 2;
	// 					matchLYC();	//Get the compare of the first scan line.
	// 					LCDCONTROL = LINECONTROL;
	// 				}
	// 				else {
	// 					modeSTAT = 0;
	// 					LCDCONTROL = DISPLAYOFFCONTROL;
	// 					DisplayShowOff();
	// 				}
	// 				interruptsRequested &= 0xFD;
	// 			}
	// 			gfxWindowCHRBankPosition = ((data & 0x40) == 0x40) ? 0x400 : 0;
	// 			gfxWindowDisplay = ((data & 0x20) == 0x20);
	// 			gfxBackgroundBankOffset = ((data & 0x10) == 0x10) ? 0 : 0x80;
	// 			gfxBackgroundCHRBankPosition = ((data & 0x08) == 0x08) ? 0x400 : 0;
	// 			gfxSpriteNormalHeight = ((data & 0x04) == 0);
	// 			gfxSpriteShow = ((data & 0x02) == 0x02);
	// 			BGPriorityEnabled = ((data & 0x01) == 0x01);
	// 			priorityFlaggingPathRebuild();	//Special case the priority flagging as an optimization.
	// 			memory[0xFF40] = data;
	// 		}
	// 	}
	// 	memoryHighWriter[0x41] = memoryWriter[0xFF41] = function (parentObj, address, data) {
	// 		LYCMatchTriggerSTAT = ((data & 0x40) == 0x40);
	// 		mode2TriggerSTAT = ((data & 0x20) == 0x20);
	// 		mode1TriggerSTAT = ((data & 0x10) == 0x10);
	// 		mode0TriggerSTAT = ((data & 0x08) == 0x08);
	// 		memory[0xFF41] = data & 0x78;
	// 	}
	// 	memoryHighWriter[0x46] = memoryWriter[0xFF46] = function (parentObj, address, data) {
	// 		memory[0xFF46] = data;
	// 		if (data < 0xE0) {
	// 			data <<= 8;
	// 			address = 0xFE00;
	// 			var stat = modeSTAT;
	// 			modeSTAT = 0;
	// 			var newData = 0;
	// 			do {
	// 				newData = memoryReader[data](parentObj, data++);
	// 				if (newData != memory[address]) {
	// 					//JIT the graphics render queue:
	// 					modeSTAT = stat;
	// 					graphicsJIT();
	// 					modeSTAT = 0;
	// 					memory[address++] = newData;
	// 					break;
	// 				}
	// 			} while (++address < 0xFEA0);
	// 			if (address < 0xFEA0) {
	// 				do {
	// 					memory[address++] = memoryReader[data](parentObj, data++);
	// 					memory[address++] = memoryReader[data](parentObj, data++);
	// 					memory[address++] = memoryReader[data](parentObj, data++);
	// 					memory[address++] = memoryReader[data](parentObj, data++);
	// 				} while (address < 0xFEA0);
	// 			}
	// 			modeSTAT = stat;
	// 		}
	// 	}
	// 	//KEY1
	// 	memoryHighWriter[0x4D] = memoryWriter[0xFF4D] = function (parentObj, address, data) {
	// 		memory[0xFF4D] = (data & 0x7F) | (memory[0xFF4D] & 0x80);
	// 	}
	// 	memoryHighWriter[0x4F] = memoryWriter[0xFF4F] = function (parentObj, address, data) {
	// 		currVRAMBank = data & 0x01;
	// 		if (currVRAMBank > 0) {
	// 			BGCHRCurrentBank = BGCHRBank2;
	// 		}
	// 		else {
	// 			BGCHRCurrentBank = BGCHRBank1;
	// 		}
	// 		//Only writable by GBC.
	// 	}
	// 	memoryHighWriter[0x51] = memoryWriter[0xFF51] = function (parentObj, address, data) {
	// 		if (!hdmaRunning) {
	// 			memory[0xFF51] = data;
	// 		}
	// 	}
	// 	memoryHighWriter[0x52] = memoryWriter[0xFF52] = function (parentObj, address, data) {
	// 		if (!hdmaRunning) {
	// 			memory[0xFF52] = data & 0xF0;
	// 		}
	// 	}
	// 	memoryHighWriter[0x53] = memoryWriter[0xFF53] = function (parentObj, address, data) {
	// 		if (!hdmaRunning) {
	// 			memory[0xFF53] = data & 0x1F;
	// 		}
	// 	}
	// 	memoryHighWriter[0x54] = memoryWriter[0xFF54] = function (parentObj, address, data) {
	// 		if (!hdmaRunning) {
	// 			memory[0xFF54] = data & 0xF0;
	// 		}
	// 	}
	// 	memoryHighWriter[0x55] = memoryWriter[0xFF55] = function (parentObj, address, data) {
	// 		if (!hdmaRunning) {
	// 			if ((data & 0x80) == 0) {
	// 				//DMA
	// 				DMAWrite((data & 0x7F) + 1);
	// 				memory[0xFF55] = 0xFF;	//Transfer completed.
	// 			}
	// 			else {
	// 				//H-Blank DMA
	// 				hdmaRunning = true;
	// 				memory[0xFF55] = data & 0x7F;
	// 			}
	// 		}
	// 		else if ((data & 0x80) == 0) {
	// 			//Stop H-Blank DMA
	// 			hdmaRunning = false;
	// 			memory[0xFF55] |= 0x80;
	// 		}
	// 		else {
	// 			memory[0xFF55] = data & 0x7F;
	// 		}
	// 	}
	// 	memoryHighWriter[0x68] = memoryWriter[0xFF68] = function (parentObj, address, data) {
	// 		memory[0xFF69] = gbcBGRawPalette[data & 0x3F];
	// 		memory[0xFF68] = data;
	// 	}
	// 	memoryHighWriter[0x69] = memoryWriter[0xFF69] = function (parentObj, address, data) {
	// 		updateGBCBGPalette(memory[0xFF68] & 0x3F, data);
	// 		if (memory[0xFF68] > 0x7F) { // high bit = autoincrement
	// 			var next = ((memory[0xFF68] + 1) & 0x3F);
	// 			memory[0xFF68] = (next | 0x80);
	// 			memory[0xFF69] = gbcBGRawPalette[next];
	// 		}
	// 		else {
	// 			memory[0xFF69] = data;
	// 		}
	// 	}
	// 	memoryHighWriter[0x6A] = memoryWriter[0xFF6A] = function (parentObj, address, data) {
	// 		memory[0xFF6B] = gbcOBJRawPalette[data & 0x3F];
	// 		memory[0xFF6A] = data;
	// 	}
	// 	memoryHighWriter[0x6B] = memoryWriter[0xFF6B] = function (parentObj, address, data) {
	// 		updateGBCOBJPalette(memory[0xFF6A] & 0x3F, data);
	// 		if (memory[0xFF6A] > 0x7F) { // high bit = autoincrement
	// 			var next = ((memory[0xFF6A] + 1) & 0x3F);
	// 			memory[0xFF6A] = (next | 0x80);
	// 			memory[0xFF6B] = gbcOBJRawPalette[next];
	// 		}
	// 		else {
	// 			memory[0xFF6B] = data;
	// 		}
	// 	}
	// 	//SVBK
	// 	memoryHighWriter[0x70] = memoryWriter[0xFF70] = function (parentObj, address, data) {
	// 		var addressCheck = (memory[0xFF51] << 8) | memory[0xFF52];	//Cannot change the RAM bank while WRAM is the source of a running HDMA.
	// 		if (!hdmaRunning || addressCheck < 0xD000 || addressCheck >= 0xE000) {
	// 			gbcRamBank = Math.max(data & 0x07, 1);	//Bank range is from 1-7
	// 			gbcRamBankPosition = ((gbcRamBank - 1) << 12) - 0xD000;
	// 			gbcRamBankPositionECHO = gbcRamBankPosition - 0x2000;
	// 		}
	// 		memory[0xFF70] = data;	//Bit 6 cannot be written to.
	// 	}
	// 	memoryHighWriter[0x74] = memoryWriter[0xFF74] = function (parentObj, address, data) {
	// 		memory[0xFF74] = data;
	// 	}
	// }
	// else {
		// //Fill in the GameBoy Color I/O registers as normal RAM for GameBoy compatibility:
		// //SC (Serial Transfer Control Register)
		// memoryHighWriter[0x2] = memoryWriter[0xFF02] = function (parentObj, address, data) {
		// 	if (((data & 0x1) == 0x1)) {
		// 		//Internal clock:
		// 		memory[0xFF02] = (data & 0x7F);
		// 		serialTimer = 4096;	//Set the Serial IRQ counter.
		// 		serialShiftTimer = serialShiftTimerAllocated = 512;	//Set the transfer data shift counter.
		// 	}
		// 	else {
		// 		//External clock:
		// 		memory[0xFF02] = data;
		// 		serialShiftTimer = serialShiftTimerAllocated = serialTimer = 0;	//Zero the timers, since we're emulating as if nothing is connected.
		// 	}
		// }
		// memoryHighWriter[0x40] = memoryWriter[0xFF40] = function (parentObj, address, data) {
		// 	if (memory[0xFF40] != data) {
		// 		midScanLineJIT();
		// 		var temp_var = (data > 0x7F);
		// 		if (temp_var != LCDisOn) {
		// 			//When the display mode changes...
		// 			LCDisOn = temp_var;
		// 			memory[0xFF41] &= 0x78;
		// 			midScanlineOffset = -1;
		// 			totalLinesPassed = currentX = queuedScanLines = lastUnrenderedLine = STATTracker = LCDTicks = actualScanLine = memory[0xFF44] = 0;
		// 			if (LCDisOn) {
		// 				modeSTAT = 2;
		// 				matchLYC();	//Get the compare of the first scan line.
		// 				LCDCONTROL = LINECONTROL;
		// 			}
		// 			else {
		// 				modeSTAT = 0;
		// 				LCDCONTROL = DISPLAYOFFCONTROL;
		// 				DisplayShowOff();
		// 			}
		// 			interruptsRequested &= 0xFD;
		// 		}
		// 		gfxWindowCHRBankPosition = ((data & 0x40) == 0x40) ? 0x400 : 0;
		// 		gfxWindowDisplay = (data & 0x20) == 0x20;
		// 		gfxBackgroundBankOffset = ((data & 0x10) == 0x10) ? 0 : 0x80;
		// 		gfxBackgroundCHRBankPosition = ((data & 0x08) == 0x08) ? 0x400 : 0;
		// 		gfxSpriteNormalHeight = ((data & 0x04) == 0);
		// 		gfxSpriteShow = (data & 0x02) == 0x02;
		// 		bgEnabled = ((data & 0x01) == 0x01);
		// 		memory[0xFF40] = data;
		// 	}
		// }
		// memoryHighWriter[0x41] = memoryWriter[0xFF41] = function (parentObj, address, data) {
		// 	LYCMatchTriggerSTAT = ((data & 0x40) == 0x40);
		// 	mode2TriggerSTAT = ((data & 0x20) == 0x20);
		// 	mode1TriggerSTAT = ((data & 0x10) == 0x10);
		// 	mode0TriggerSTAT = ((data & 0x08) == 0x08);
		// 	memory[0xFF41] = data & 0x78;
		// 	if ((!usedBootROM || !usedGBCBootROM) && LCDisOn && modeSTAT < 2) {
		// 		interruptsRequested |= 0x2;
		// 		// checkIRQMatching();
		// 	}
		// }
		// memoryHighWriter[0x46] = memoryWriter[0xFF46] = function (parentObj, address, data) {
		// 	memory[0xFF46] = data;
		// 	if (data > 0x7F && data < 0xE0) {	//DMG cannot DMA from the ROM banks.
		// 		data <<= 8;
		// 		address = 0xFE00;
		// 		var stat = modeSTAT;
		// 		modeSTAT = 0;
		// 		var newData = 0;
		// 		do {
		// 			newData = memoryReader[data](parentObj, data++);
		// 			if (newData != memory[address]) {
		// 				//JIT the graphics render queue:
		// 				modeSTAT = stat;
		// 				graphicsJIT();
		// 				modeSTAT = 0;
		// 				memory[address++] = newData;
		// 				break;
		// 			}
		// 		} while (++address < 0xFEA0);
		// 		if (address < 0xFEA0) {
		// 			do {
		// 				memory[address++] = memoryReader[data](parentObj, data++);
		// 				memory[address++] = memoryReader[data](parentObj, data++);
		// 				memory[address++] = memoryReader[data](parentObj, data++);
		// 				memory[address++] = memoryReader[data](parentObj, data++);
		// 			} while (address < 0xFEA0);
		// 		}
		// 		modeSTAT = stat;
		// 	}
		// }
		// memoryHighWriter[0x47] = memoryWriter[0xFF47] = function (parentObj, address, data) {
		// 	if (memory[0xFF47] != data) {
		// 		midScanLineJIT();
		// 		updateGBBGPalette(data);
		// 		memory[0xFF47] = data;
		// 	}
		// }
		// memoryHighWriter[0x48] = memoryWriter[0xFF48] = function (parentObj, address, data) {
		// 	if (memory[0xFF48] != data) {
		// 		midScanLineJIT();
		// 		updateGBOBJPalette(0, data);
		// 		memory[0xFF48] = data;
		// 	}
		// }
		// memoryHighWriter[0x49] = memoryWriter[0xFF49] = function (parentObj, address, data) {
		// 	if (memory[0xFF49] != data) {
		// 		midScanLineJIT();
		// 		updateGBOBJPalette(4, data);
		// 		memory[0xFF49] = data;
		// 	}
		// }
		// memoryHighWriter[0x4D] = memoryWriter[0xFF4D] = function (parentObj, address, data) {
		// 	memory[0xFF4D] = data;
		// }
		// memoryHighWriter[0x4F] = memoryWriter[0xFF4F] = cartIgnoreWrite;	//Not writable in DMG mode.
		// memoryHighWriter[0x55] = memoryWriter[0xFF55] = cartIgnoreWrite;
		// memoryHighWriter[0x68] = memoryWriter[0xFF68] = cartIgnoreWrite;
		// memoryHighWriter[0x69] = memoryWriter[0xFF69] = cartIgnoreWrite;
		// memoryHighWriter[0x6A] = memoryWriter[0xFF6A] = cartIgnoreWrite;
		// memoryHighWriter[0x6B] = memoryWriter[0xFF6B] = cartIgnoreWrite;
		// memoryHighWriter[0x6C] = memoryWriter[0xFF6C] = cartIgnoreWrite;
		// memoryHighWriter[0x70] = memoryWriter[0xFF70] = cartIgnoreWrite;
		// memoryHighWriter[0x74] = memoryWriter[0xFF74] = cartIgnoreWrite;
	// }
// }
// function recompileBootIOWriteHandling () {
// 	//Boot I/O Registers:
// 	if (inBootstrap) {
// 		memoryHighWriter[0x50] = memoryWriter[0xFF50] = function (parentObj, address, data) {
// 			cout("Boot ROM reads blocked: Bootstrap process has ended.", 0);
// 			inBootstrap = false;
// 			disableBootROM();			//Fill in the boot ROM ranges with ROM  bank 0 ROM ranges
// 			memory[0xFF50] = data;	//Bits are sustained in memory?
// 		}
// 		if (cGBC) {
// 			memoryHighWriter[0x6C] = memoryWriter[0xFF6C] = function (parentObj, address, data) {
// 				if (inBootstrap) {
// 					cGBC = ((data & 0x1) == 0);
// 					//Exception to the GBC identifying code:
// 					if (name + gameCode + ROM[0x143] == "Game and Watch 50") {
// 						cGBC = true;
// 						cout("Created a boot exception for Game and Watch Gallery 2 (GBC ID byte is wrong on the cartridge).", 1);
// 					}
// 					cout("Booted to GBC Mode: " + cGBC, 0);
// 				}
// 				memory[0xFF6C] = data;
// 			}
// 		}
// 	}
// 	else {
// 		//Lockout the ROMs from accessing the BOOT ROM control register:
// 		memoryHighWriter[0x50] = memoryWriter[0xFF50] = cartIgnoreWrite;
// 	}
// }
//Helper Functions
// function toTypedArray (baseArray, memtype) {
// 	try {
// 		if (settings[5]) {
// 			return baseArray;
// 		}
// 		if (!baseArray || !baseArray.length) {
// 			return [];
// 		}
// 		var length = baseArray.length;
// 		switch (memtype) {
// 			case "uint8":
// 				var typedArrayTemp = new Uint8Array(length);
// 				break;
// 			case "int8":
// 				var typedArrayTemp = new Int8Array(length);
// 				break;
// 			case "int32":
// 				var typedArrayTemp = new Int32Array(length);
// 				break;
// 			case "float32":
// 				var typedArrayTemp = new Float32Array(length);
// 		}
// 		for (var index = 0; index < length; index++) {
// 			typedArrayTemp[index] = baseArray[index];
// 		}
// 		return typedArrayTemp;
// 	}
// 	catch (error) {
// 		cout("Could not convert an array to a typed array: " + error.message, 1);
// 		return baseArray;
// 	}
// }
// function fromTypedArray (baseArray) {
// 	try {
// 		if (!baseArray || !baseArray.length) {
// 			return [];
// 		}
// 		var arrayTemp = [];
// 		for (var index = 0; index < baseArray.length; ++index) {
// 			arrayTemp[index] = baseArray[index];
// 		}
// 		return arrayTemp;
// 	}
// 	catch (error) {
// 		cout("Conversion from a typed array failed: " + error.message, 1);
// 		return baseArray;
// 	}
// }
function getTypedArray(length, defaultValue, numberType) {
	try {
		switch (numberType) {
			case "int8":
				var arrayHandle = new Int8Array(length);
				break;
			case "uint8":
				var arrayHandle = new Uint8Array(length);
				break;
			case "int32":
				var arrayHandle = new Int32Array(length);
				break;
			case "float32":
				var arrayHandle = new Float32Array(length);
		}
		if (defaultValue != 0) {
			var index = 0;
			while (index < length) {
				arrayHandle[index++] = defaultValue;
			}
		}
	}
	catch (error) {
		cout("Could not convert an array to a typed array: " + error.message, 1);
		var arrayHandle = [];
		var index = 0;
		while (index < length) {
			arrayHandle[index++] = defaultValue;
		}
	}
	return arrayHandle;
}
