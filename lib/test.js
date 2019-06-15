let n = 0;
let t;
export function t_start() {
    n++;
    t = (n == 1) ? performance.now() : null;
}

export function t_end() {
    n--;
    if (n == 0 && t != null) {
        console.log('PERF ', performance.now() - t)
        t = null;
    } else if (n < 0) {
        n = 0;
    }
}