// Every knob the server reads from the environment, in one place.
// Nothing here throws on a missing value: the game must keep working for guests
// even before .env is filled in. Features switch themselves off instead.

const str = (name, fallback = '') => (process.env[name] || '').trim() || fallback;

export const PORT = Number(process.env.PORT) || 3001;

export const MONGODB_URI = str('MONGODB_URI');
export const MONGODB_DB = str('MONGODB_DB', 'scrabble-live');

export const JWT_SECRET = str('JWT_SECRET');
export const JWT_EXPIRES_IN = str('JWT_EXPIRES_IN', '30d');

export const CLOUDINARY = {
  cloudName: str('CLOUDINARY_CLOUD_NAME'),
  apiKey: str('CLOUDINARY_API_KEY'),
  apiSecret: str('CLOUDINARY_API_SECRET'),
  folder: str('CLOUDINARY_FOLDER', 'scrabble-live/avatars'),
};

export const CORS_ORIGIN = str('CORS_ORIGIN', '*');

// Accounts need both a database to store them and a secret to sign sessions
// with. Without either, the server runs in guest-only mode: rooms, codes and
// gameplay all work, and /api/auth/* answers 503 with a clear reason.
export const accountsEnabled = () => Boolean(MONGODB_URI && JWT_SECRET);
export const uploadsEnabled = () =>
  Boolean(CLOUDINARY.cloudName && CLOUDINARY.apiKey && CLOUDINARY.apiSecret);

export function describeConfig() {
  return {
    accounts: accountsEnabled(),
    uploads: uploadsEnabled(),
    missing: [
      !MONGODB_URI && 'MONGODB_URI',
      !JWT_SECRET && 'JWT_SECRET',
      !CLOUDINARY.cloudName && 'CLOUDINARY_CLOUD_NAME',
      !CLOUDINARY.apiKey && 'CLOUDINARY_API_KEY',
      !CLOUDINARY.apiSecret && 'CLOUDINARY_API_SECRET',
    ].filter(Boolean),
  };
}
