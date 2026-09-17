declare global {
    var global: typeof globalThis;
}

if (
    typeof globalThis !== "undefined" &&
    !(globalThis as typeof globalThis & { global?: typeof globalThis }).global
) {
    (globalThis as typeof globalThis & { global?: typeof globalThis }).global =
        globalThis;
}
