# Behavior Chart

## What it does

- Sign in with Google using Firebase Authentication
- Persist login sessions in the browser
- Persist nicknames in Firestore
- Pick a specific day
- Rank yourself from `1` to `5`
- Write exactly five bullet points about that day
- Read everyone else's bullet points for the same day
- Rate their day from `1` to `5`
- Assign a `Mentioned Brooks Modesitt` tag that applies a `-0.5` score penalty once per entry
- See each person's average score and chart placement
- Keep a persistent personal color for each person
- Share the same entries and ratings across multiple browsers and devices

## Backend

This app now uses:

- Firebase Authentication for Google sign-in
- Cloud Firestore for shared persistence
- Browser-local auth persistence for staying signed in

## Setup

Setup steps are in [FIREBASE_SETUP.md](/Users/taylortam/Downloads/code/degen-maxxers/FIREBASE_SETUP.md:1).

The main project files are:

- [index.html](/Users/taylortam/Downloads/code/degen-maxxers/index.html:1)
- [styles.css](/Users/taylortam/Downloads/code/degen-maxxers/styles.css:1)
- [app.js](/Users/taylortam/Downloads/code/degen-maxxers/app.js:1)
- [config.public.js](/Users/taylortam/Downloads/code/degen-maxxers/config.public.js:1)
- [config.example.js](/Users/taylortam/Downloads/code/degen-maxxers/config.example.js:1)
- [firestore.rules](/Users/taylortam/Downloads/code/degen-maxxers/firestore.rules:1)
