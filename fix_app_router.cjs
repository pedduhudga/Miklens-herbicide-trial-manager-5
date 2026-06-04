const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// Replace BrowserRouter with HashRouter
code = code.replace(/import \{ BrowserRouter, Routes, Route, Navigate \} from 'react-router-dom';/, "import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';");
code = code.replace(/<BrowserRouter>/, "<HashRouter>");
code = code.replace(/<\/BrowserRouter>/, "</HashRouter>");

fs.writeFileSync('src/App.jsx', code);
