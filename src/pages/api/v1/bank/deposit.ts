import legacyHandler from '../../bank/deposit';

/** Handles v1 bank deposit API requests. */
export default function handler(req, res) {
  return legacyHandler(req, res);
}
