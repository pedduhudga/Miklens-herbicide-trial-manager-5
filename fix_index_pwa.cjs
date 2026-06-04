const fs = require('fs');

let code = fs.readFileSync('index.html', 'utf8');

const metaTags = `
    <!-- PWA & Mobile Optimization Tags -->
    <link rel="manifest" href="./manifest.json">
    <meta name="theme-color" content="#059669">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="TrialManager">
    <link rel="icon" type="image/svg+xml" href="./favicon.svg">
`;

code = code.replace(/<title>/, metaTags + '\n    <title>');

fs.writeFileSync('index.html', code);
