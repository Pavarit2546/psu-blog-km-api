/**
 * Authentication abstraction.
 *
 * - `mock`  (default, development only): Payload's built-in local auth with seeded
 *           synthetic demo accounts. Clearly labelled in the UI. NOT PSU SSO.
 * - `oidc`  (planned): PSU SSO via OpenID Connect. Not implemented yet — selecting it
 *           fails closed. Integration plan: use a Payload custom auth strategy
 *           (`auth.strategies` on the users collection) that validates the PSU OIDC
 *           session/ID token with a maintained OIDC client library (e.g. `openid-client`),
 *           maps the `sub`/employee claim to a user record, and disables local passwords
 *           (`auth.disableLocalStrategy`). Configuration would come from env vars such as
 *           OIDC_ISSUER_URL / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET — names to be confirmed
 *           with the PSU identity team.
 */
export type AuthProviderKind = 'mock' | 'oidc'

export type AuthProviderInfo = {
  kind: AuthProviderKind
  label: string
  loginPath: string
  isDevelopmentOnly: boolean
}

export function getAuthProvider(): AuthProviderInfo {
  const kind = (process.env.AUTH_PROVIDER || 'mock') as AuthProviderKind
  if (kind === 'oidc') {
    throw new Error('AUTH_PROVIDER=oidc is not implemented yet (PSU SSO integration pending)')
  }
  return {
    kind: 'mock',
    label: 'Mock PSU Authentication (development only)',
    loginPath: '/login',
    isDevelopmentOnly: true,
  }
}
