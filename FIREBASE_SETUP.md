# Firebase Setup

This app now uses Firebase Authentication and Cloud Firestore so entries, ratings, tags, logins, and nicknames persist across multiple browsers and devices.

## What to configure

1. Create a Firebase project and register a web app.
2. Enable `Authentication > Sign-in method > Google`.
3. Add `localhost` to `Authentication > Settings > Authorized domains` for local testing.
4. Later, add your GitHub Pages domain in that same Authorized domains list.
5. Create a Cloud Firestore database in production or test mode.
6. Replace the Firestore rules with the contents of [firestore.rules](/Users/taylortam/Downloads/code/degen-maxxers/firestore.rules:1).
7. Copy [config.example.js](/Users/taylortam/Downloads/code/degen-maxxers/config.example.js:1) to `config.js`, then fill in the Firebase web config values there.

## Firestore collections used by the app

- `users`
- `entries`
- `ratings`
- `tags`

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

### `tags/{entryId__tagKey__assigneeUid}`

- `entryId`
- `date`
- `assigneeUid`
- `tagKey`
- `createdAt`
- `updatedAt`

## Notes

- Firebase web config values are meant to be used in frontend code; they are not private secrets.
- `config.js` is intentionally gitignored so each clone can keep its own local Firebase project settings.
- Google sign-in does not require Firebase SMS billing.
- If popup sign-in is blocked on mobile or by the browser, the app falls back to redirect-style Google sign-in.
