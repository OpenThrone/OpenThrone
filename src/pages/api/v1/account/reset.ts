import legacyHandler from '../../account/reset';

/** Handles v1 account reset API requests. */
export default function handler(req, res) {
  return legacyHandler(req, res);
}
