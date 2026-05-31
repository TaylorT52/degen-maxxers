# Behavior Chart Prototype

This is a static vanilla HTML/CSS/JS prototype for the behavior chart site.

## What it does

- Sign in with a phone number
- Optionally add a nickname
- Pick a specific day
- Rank yourself from `1` to `5`
- Write exactly five bullet points about that day
- Read everyone else's bullet points for the same day
- Rate their day from `1` to `5`
- See each person's average score and chart placement
- Keep a persistent personal color for each phone number

## How it stores data

Right now, everything is stored in `localStorage` so the site works as a fully static prototype.

That means:

- It works immediately when you open `index.html`
- You can test different users by switching phone numbers
- Data is saved in the current browser
- It is not yet a real shared multi-user backend

## Files

- `index.html`
- `styles.css`
- `app.js`

## Next step for a real shared version

To make this work across multiple phones and browsers, the next step would be to connect this UI to:

- Firebase Auth + Firestore
- or Supabase Auth + Database

That would give you real phone verification, shared entries, and shared ratings while still letting you host the frontend on GitHub Pages.
