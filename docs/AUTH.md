# Tiba authentication

Tiba supports Google, GitHub, and Sui wallet sign-in. Google and GitHub are optional: a provider is shown only when both of its environment variables are set. Sui wallet sign-in needs no third-party OAuth credentials.

## Required Vercel environment variables

Set these in the Tiba Vercel project under **Settings → Environment Variables**. Use the same values for Preview and Production where appropriate.

```text
DATABASE_URL=<the existing Neon pooled connection string>
AUTH_SECRET=<a long random value; generate with `openssl rand -base64 32`>
```

To enable Google, also set:

```text
AUTH_GOOGLE_ID=<Google OAuth client ID>
AUTH_GOOGLE_SECRET=<Google OAuth client secret>
```

To enable GitHub, also set:

```text
AUTH_GITHUB_ID=<GitHub OAuth client ID>
AUTH_GITHUB_SECRET=<GitHub OAuth client secret>
```

The remaining existing Tiba variables (`OPERATOR_TOKEN`, `SUI_NETWORK`, `SUI_PRIVATE_KEY`, `SUI_ADDRESS`, and the configured adjudication/provider variables) stay as they are. Do not paste secrets into the repository.

## Google OAuth client

1. Open the [Google Cloud Credentials console](https://console.cloud.google.com/apis/credentials).
2. Select the Tiba Google Cloud project, configure the OAuth consent screen if it is not configured, then choose **Create credentials → OAuth client ID**.
3. Select **Web application**.
4. Add these Authorized redirect URIs:

   ```text
   http://localhost:3000/api/auth/callback/google
   https://tiba-preview-REPLACE_WITH_VERCEL_DOMAIN.vercel.app/api/auth/callback/google
   ```

   Replace the second host with the deployed Tiba Vercel domain reported with this change. If Tiba has a stable production domain, add that exact callback too:

   ```text
   https://YOUR_TIBA_DOMAIN/api/auth/callback/google
   ```

5. Copy the client ID into `AUTH_GOOGLE_ID` and the client secret into `AUTH_GOOGLE_SECRET` in Vercel.

Google redirects back to `/api/auth/callback/google`; do not use `/signin` as the OAuth redirect URI.

## GitHub OAuth app

1. Open [GitHub Developer Settings](https://github.com/settings/developers), choose **OAuth Apps → New OAuth App**.
2. Set **Application name** to `Tiba`.
3. Set **Homepage URL** to `http://localhost:3000` while developing locally. For the deployed app, use `https://YOUR_TIBA_DOMAIN` in a separate app or update the app before production use.
4. Set **Authorization callback URL** to one of these for the environment being used:

   ```text
   http://localhost:3000/api/auth/callback/github
   https://tiba-preview-REPLACE_WITH_VERCEL_DOMAIN.vercel.app/api/auth/callback/github
   ```

   Replace the second host with the deployed Tiba Vercel domain reported with this change. A GitHub OAuth app accepts one callback URL, so use separate local and deployed apps when both environments need to work at the same time.

5. Create a client secret, then copy the app's **Client ID** into `AUTH_GITHUB_ID` and the secret into `AUTH_GITHUB_SECRET` in Vercel.

## Sui wallet sign-in

The sign-in page connects a Sui-compatible wallet through `@mysten/dapp-kit`. Tiba then:

1. Sends the claimed address to the server for a cryptographically random five-minute nonce.
2. Returns a human-readable message containing the canonical address, nonce, and the statement that no transaction or funds are authorized.
3. Asks the wallet to sign that message with `useSignPersonalMessage`.
4. Verifies the signature on the server with `@mysten/sui` against the claimed Sui address and the HttpOnly, HMAC-bound nonce cookie.
5. Creates or finds the Auth.js `User` whose ID is the canonical Sui address, then starts the session.

The signature is a sign-in proof only. It is not a transaction and cannot move funds. The wallet option stays available when Google and GitHub are not configured; `AUTH_SECRET` is still required for the server to issue and verify wallet challenges.
