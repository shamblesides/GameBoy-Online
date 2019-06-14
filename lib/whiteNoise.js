export const LSFR15Table = new Int8Array(0x80000);
export const LSFR7Table = new Int8Array(0x800);

//Noise Sample Tables:
var randomFactor = 1;

//15-bit LSFR Cache Generation:
var LSFR = 0x7FFF;	//Seed value has all its bits set.
var LSFRShifted = 0x3FFF;
for (var index = 0; index < 0x8000; ++index) {
    //Normalize the last LSFR value for usage:
    randomFactor = 1 - (LSFR & 1);	//Docs say it's the inverse.
    //Cache the different volume level results:
    for (let j = 0x1; j <= 0xF; ++j) {
        LSFR15Table[j*0x8000 | index] = randomFactor * j;
    }
    //Recompute the LSFR algorithm:
    LSFRShifted = LSFR >> 1;
    LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 14);
}
//7-bit LSFR Cache Generation:
LSFR = 0x7F;	//Seed value has all its bits set.
for (index = 0; index < 0x80; ++index) {
    //Normalize the last LSFR value for usage:
    randomFactor = 1 - (LSFR & 1);	//Docs say it's the inverse.
    //Cache the different volume level results:
    for (let j = 0x1; j <= 0xF; ++j) {
        LSFR7Table[j*0x80 | index] = randomFactor * j;
    }
    //Recompute the LSFR algorithm:
    LSFRShifted = LSFR >> 1;
    LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 6);
}
