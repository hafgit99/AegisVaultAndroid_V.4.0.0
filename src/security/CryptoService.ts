export const SQLCIPHER_HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i;

export const wipeBytes = (value?: Uint8Array | Buffer | null): void => {
  if (!value) return;
  if (typeof (value as any).fill === 'function') {
    (value as any).fill(0);
    return;
  }
  for (let i = 0; i < value.length; i++) value[i] = 0;
};

export const buildSqlCipherRawKeyPragma = (
  operation: 'key' | 'rekey',
  keyHex: string,
): string => {
  if (!SQLCIPHER_HEX_KEY_PATTERN.test(keyHex)) {
    throw new Error(`Invalid SQLCipher ${operation} key format`);
  }
  return `PRAGMA ${operation} = "x'${keyHex.toLowerCase()}'";`;
};
