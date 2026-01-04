
const polynomial = 0x04C11DB7;

function crc32_reverse(polynomial: number) {
    var reversedPolynomial = 0

    for (let i = 0; i < 32; i++) {
        reversedPolynomial = reversedPolynomial << 1
        reversedPolynomial = reversedPolynomial | ((polynomial >>> i) & 1)
    }

    return reversedPolynomial
}

const reversedPolynomial = crc32_reverse(polynomial);

function crc32_generate() {
    var table = new Array()
    var i, j, n

    for (i = 0; i < 256; i++) {
        n = i
        for (j = 8; j > 0; j--) {
            if ((n & 1) == 1) {
                n = (n >>> 1) ^ reversedPolynomial
            } else {
                n = n >>> 1
            }
        }
        table[i] = n
    }

    return table
}

function crc32_initial() {
    return 0xFFFFFFFF
}

function crc32_add_byte(table: number[], crc: number, byte: number) {
    crc = (crc >>> 8) ^ table[(byte) ^ (crc & 0x000000FF)]
    return crc
}

function crc32_final(crc: number) {
    crc = ~crc
    crc = (crc < 0) ? (0xFFFFFFFF + crc + 1) : crc
    return crc & 0xFFFFFFFF;
}

// Deprecated
// export function crc32_string(str: string) {
//     var table = crc32_generate()
//     var crc =  crc32_initial()

//     for (let i = 0; i < str.length; i++)
//         crc = crc32_add_byte(table, crc, str.charCodeAt(i))

//     crc = crc32_final(crc)
//     return crc
// }

export function crc32_buffer(data: Uint8Array) {
    var table = crc32_generate()
    var crc = crc32_initial()

    for (let i = 0; i < data.length; i++)
        crc = crc32_add_byte(table, crc, data[i])

    crc = crc32_final(crc)
    return crc
}

export function crc32_text_utf8(text: string): number {
    const utf8Bytes = new TextEncoder().encode(text);
    return crc32_buffer(utf8Bytes);
}

export function crc32_text_utf16(text: string): number {
    const utf16Bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        utf16Bytes[i * 2] = code & 0xFF;
        utf16Bytes[i * 2 + 1] = (code >> 8) & 0xFF;
    }
    return crc32_buffer(utf16Bytes);
}
