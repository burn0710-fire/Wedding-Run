import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import * as spine from "@esotericsoftware/spine-canvas";

console.log("index.tsx loaded");
console.log("spine.VERSION:", (spine as any).VERSION);

(globalThis as any).physics = (globalThis as any).physics ?? {
  update: () => {},
  readPhysics: () => {},
  readPhysicsConstraint: () => {},
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
