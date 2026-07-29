// Reads the first few bytes of a buffer to determine its REAL file type,
// regardless of what mimetype/extension the client claimed. This is the
// only trustworthy way to validate an upload — a client can label any file
// "image/jpeg" in its request, but it can't fake the actual byte signature
// of a real JPEG/PNG/WEBP file.
//
// file-type is an ESM-only package; `await import()` is the correct way to
// load an ESM module from CommonJS code (a plain `require` would fail).
async function detectImageType(buffer) {
  const { fileTypeFromBuffer } = await import("file-type");
  const type = await fileTypeFromBuffer(buffer);

  if (!type || !type.mime.startsWith("image/")) {
    return null;
  }
  return type; // { ext: 'jpg', mime: 'image/jpeg' }
}

module.exports = detectImageType;
