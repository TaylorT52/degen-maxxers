# Firebase Setup

This app now uses Firebase Authentication and Cloud Firestore so entries, ratings, logins, and nicknames persist across multiple browsers and devices.

## What to configure

1. Create a Firebase project and register a web app.
2. Enable `Authentication > Sign-in method > Phone`.
3. Set an SMS region policy in `Authentication > Settings`.
4. If you test locally and your Firebase project was created after April 28, 2025, add `localhost` as an authorized domain.
5. Upgrade the Firebase project to the Blaze plan before testing real phone SMS login. Firebase documents phone-auth verification SMS as Blaze-only.
6. Create a Cloud Firestore database in production or test mode.
7. Replace the Firestore rules with the contents of [firestore.rules](/Users/taylortam/Downloads/code/degen-maxxers/firestore.rules:1).
8. Fill in the Firebase web config values in [config.js](/Users/taylortam/Downloads/code/degen-maxxers/config.js:1).

## Firestore collections used by the app

- `users`
- `entries`
- `ratings`

## Data model

### `users/{uid}`

- `uid`
- `phoneNumber`
- `nickname`
- `color`
- `createdAt`
- `updatedAt`

### `entries/{uid_YYYY-MM-DD}`

- `ownerUid`
- `ownerPhoneNumber`
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
- For low-cost testing, Firebase lets you configure fictional phone numbers in Authentication so you can verify the login flow without sending real SMS messages.
- When you later publish on GitHub Pages, add that Pages domain to Firebase Authentication authorized domains too.
