import * as notes from '../lib/notes.js';

const samples = '02468ACEFFFEEDDCCBA9876544332211'.split('').map(d => parseInt(d, 16));

export const tracks = [[],[],[],[]];

tracks[0] = Array(14).fill().map((_,i) => ({
    freq: notes['C,D,Ds,F,G,A,As'.split(',')[i%7]+(6+i/7|0)],
    // freq: notes.C6,
    samples,
})).reduce((arr, x) => arr.concat([x, 0.1]), []);

