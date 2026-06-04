# Herbicide Trial Manager

A professional, mobile-first agricultural research platform for tracking, evaluating, and reporting on herbicide efficacy trials.

## Architecture
This project is built using:
- **React 18 + Vite** for the frontend UI.
- **Tailwind CSS v4** for styling.
- **Capacitor** for native Android APK generation.
- **Google Apps Script** for backend database integrations (Abstracted via `src/services/db.js`).

## Multi-Platform Deployment
This codebase is designed to run perfectly as a standard web application, an installable Progressive Web App (PWA), and a native Android application.

### 1. GitHub Pages (Web Deployment)
The application automatically builds and deploys to GitHub Pages upon pushing to the `main` branch using GitHub Actions.

- The routing uses `HashRouter` to ensure deep links do not break on static hosts.
- Assets are configured using relative paths (`base: './'`) to ensure they resolve correctly inside GitHub Pages subdirectories.

### 2. Android APK (Capacitor)
To build the native Android app:

1. Build the web project:
   `npm run build`
2. Sync the built assets (`/dist`) into the Capacitor Android container:
   `npx cap sync android`
3. Open Android Studio to build the final APK or AAB:
   `npx cap open android`

*For detailed Android build steps, see [MOBILE_BUILD_INSTRUCTIONS.md](./MOBILE_BUILD_INSTRUCTIONS.md).*

## Development
To start the local development server:

`npm install`
`npm run dev`
