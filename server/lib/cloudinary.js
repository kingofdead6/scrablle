import { v2 as cloudinary } from 'cloudinary';
import { CLOUDINARY, uploadsEnabled } from '../config.js';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  cloudinary.config({
    cloud_name: CLOUDINARY.cloudName,
    api_key: CLOUDINARY.apiKey,
    api_secret: CLOUDINARY.apiSecret,
    secure: true,
  });
  configured = true;
}

export const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
]);

/**
 * Uploads an avatar buffer and returns { url, publicId }. Cropped to a square
 * face-aware thumbnail on Cloudinary's side, so a friend list never has to pull
 * down the full-size original.
 */
export function uploadAvatar(buffer, { userId }) {
  if (!uploadsEnabled()) return Promise.reject(new Error('Image uploads are not configured.'));
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY.folder,
        public_id: `user-${userId}-${Date.now()}`,
        resource_type: 'image',
        overwrite: true,
        transformation: [
          { width: 512, height: 512, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/** Best-effort cleanup of a replaced avatar; never fails the request. */
export async function deleteAvatar(publicId) {
  if (!publicId || !uploadsEnabled()) return;
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.warn('Could not delete old avatar:', err.message);
  }
}
