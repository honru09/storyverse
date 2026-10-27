/**
 * The login form has a single account field for both password channels.
 * Which channel serves a submit is decided by the identifier's shape
 * alone: anything containing "@" is an email address and goes to the
 * Firebase email/password channel; everything else is a username and
 * goes to this site's own username channel. Keeping the rule in one pure
 * function means the panel, its hints and the tests cannot drift apart.
 */
export function identifierKind(value) {
  return typeof value === 'string' && value.includes('@') ? 'email' : 'username';
}
