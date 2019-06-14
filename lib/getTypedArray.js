export function getTypedArray(length, defaultValue, numberType) {
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
	return arrayHandle;
}
