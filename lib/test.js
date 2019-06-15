const times = [];
export function t_start() {
    times.push(performance.now());
}

export function t_end() {
    if (times.length > 0) {
        console.log('PERF ', performance.now() - times.shift())
    }
}