# Mobile & Web Build Instructions

This project has been transformed from a single-file legacy HTML application into a modern React + Vite application with Capacitor configured for Android deployment. The source code is shared 100% between the web and mobile platforms.

## Prerequisites
- **Node.js**: v18 or newer
- **Android Studio**: Required for generating APKs and emulating Android builds.
- **Java Development Kit (JDK)**: v17+ required by Android Studio.

## 1. Web Deployment (PWA / Standard Web Host)
The web deployment process remains exactly the same as any standard Vite application.

\`\`\`bash
# 1. Install dependencies
npm install

# 2. Build the production React bundle (outputs to /dist)
npm run build
\`\`\`

You can deploy the \`/dist\` directory to any static hosting provider (Vercel, Netlify, GitHub Pages, Firebase Hosting). The Service Worker (\`sw.js\`) handles offline caching automatically.

## 2. Android APK Generation

Capacitor bridges our \`/dist\` web build into a native Android container.

### Step 1: Prepare the Web Build
Every time you make changes to the React code (`src/`), you must rebuild the web assets and sync them into the Android container.

\`\`\`bash
npm run build
npx cap sync android
\`\`\`

### Step 2: Open Android Studio
You can launch Android Studio directly from the CLI:

\`\`\`bash
npx cap open android
\`\`\`

### Step 3: Build the APK in Android Studio
1. Wait for Gradle to finish syncing (watch the progress bar at the bottom right).
2. From the top menu, select **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
3. Once completed, a popup will appear in the bottom right corner. Click **"locate"** to find your \`app-debug.apk\`.
4. Transfer this APK to your Android device to test.

## 3. Play Store Publishing
To generate a production-ready file for the Google Play Store:
1. In Android Studio, go to **Build > Generate Signed Bundle / APK**.
2. Select **Android App Bundle (.aab)**.
3. Follow the wizard to create or select your keystore.
4. Upload the generated \`.aab\` file to the Google Play Console.

## Advanced Native Integrations
If you add new hardware features (like Geolocation), install the specific Capacitor plugin:
\`\`\`bash
npm install @capacitor/geolocation
npx cap sync android
\`\`\`
*Note: Always remember to add the required Android permissions inside \`android/app/src/main/AndroidManifest.xml\` when adding new hardware plugins.*
