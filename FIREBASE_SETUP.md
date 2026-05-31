# Firebase Setup

This app now uses Firebase Authentication and Cloud Firestore so entries, ratings, logins, and nicknames persist across multiple browsers and devices.

## What to configure

1. Create a Firebase project and register a web app.
2. Enable `Authentication > Sign-in method > Google`.
3. Add `localhost` to `Authentication > Settings > Authorized domains` for local testing.
4. Later, add your GitHub Pages domain in that same Authorized domains list.
5. Create a Cloud Firestore database in production or test mode.
6. Replace the Firestore rules with the contents of [firestore.rules](/Users/taylortam/Downloads/code/degen-maxxers/firestore.rules:1).
7. Fill in the Firebase web config values in [config.js](/Users/taylortam/Downloads/code/degen-maxxers/config.js:1).

## Firestore collections used by the app

- `users`
- `entries`
- `ratings`

## Data model

### `users/{uid}`

- `uid`
- `authDisplayName`
- `nickname`
- `color`
- `createdAt`
- `updatedAt`

### `entries/{uid_YYYY-MM-DD}`

- `ownerUid`
- `ownerColor`
- `date`
- `selfScore`
- `bullets`
- `createdAt`
- `updatedAt`

### `ratings/{entryId__raterUid}`

- `entryId`
- `date`
- `raterUid`
- `targetUid`
- `score`
- `createdAt`
- `updatedAt`

## Notes

- Firebase web config values are meant to be used in frontend code; they are not private secrets.
- Google sign-in does not require Firebase SMS billing.
- If popup sign-in is blocked on mobile or by the browser, the app falls back to redirect-style Google sign-in.
