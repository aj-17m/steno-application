/**
 * Cloudinary helper — upload audio buffers / file paths.
 *
 * Set these env vars:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Free tier: 25 GB storage, 25 GB/month bandwidth — plenty for an edu platform.
 */
const cloudinary = require('cloudinary').v2;
const fs         = require('fs');
const streamLib  = require('stream');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key   : process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure    : true,
});

/**
 * Upload a Buffer to Cloudinary.
 * @param {Buffer} buffer
 * @param {string} publicId  - e.g. "steno-audio/1234567890"
 * @returns {Promise<string>} secure_url
 */
function uploadBuffer(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'video', folder: 'steno-audio', public_id: publicId, overwrite: true },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    );
    const readable = new streamLib.PassThrough();
    readable.end(buffer);
    readable.pipe(uploadStream);
  });
}

/**
 * Upload a local file path to Cloudinary, then delete the temp file.
 * @param {string} filePath  - absolute path on disk
 * @param {string} publicId
 * @returns {Promise<string>} secure_url
 */
async function uploadFile(filePath, publicId) {
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'video',   // Cloudinary treats audio as "video"
    folder       : 'steno-audio',
    public_id    : publicId,
    overwrite    : true,
  });
  // Clean up temp file
  try { fs.unlinkSync(filePath); } catch (_) {}
  return result.secure_url;
}

/**
 * Delete a Cloudinary asset by its secure_url (best-effort, won't throw).
 * @param {string} url  - the secure_url stored in DB
 */
async function deleteByUrl(url) {
  try {
    if (!url || url.startsWith('uploads/')) return; // old local path — skip
    // Extract public_id from URL:
    // e.g. https://res.cloudinary.com/<cloud>/video/upload/v123/steno-audio/filename
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    if (match) await cloudinary.uploader.destroy(match[1], { resource_type: 'video' });
  } catch (_) {}
}

module.exports = { uploadBuffer, uploadFile, deleteByUrl };
