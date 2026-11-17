import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';

const directory = new URL('./fixtures/', import.meta.url);
const file = new URL('message.txt', directory);

export const MAX_BYTES = 4096;

export function readFixture(request, onEntry = () => {}) {
  onEntry();
  if (request.tool !== 'fs.read' || request.args.fixture !== 'message-v1' ||
      Object.keys(request.args).length !== 1) throw Error('Unexpected operation');
  // Project root and its ancestors are trusted and stable throughout this call.
  if (!lstatSync(new URL('./fixtures', import.meta.url)).isDirectory()) throw Error('Unsafe fixture directory');
  const expected = lstatSync(file, { bigint: true });
  if (!expected.isFile() || expected.nlink !== 1n) throw Error('Unsafe fixture');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const actual = fstatSync(fd, { bigint: true });
    if (!actual.isFile() || actual.nlink !== 1n || actual.dev !== expected.dev ||
        actual.ino !== expected.ino) throw Error('Fixture changed');
    if (actual.size > BigInt(MAX_BYTES)) throw Error('Fixture too large');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length <= MAX_BYTES) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) return bytes.subarray(0, length);
      length += count;
    }
    throw Error('Fixture too large');
  } finally {
    closeSync(fd);
  }
}
