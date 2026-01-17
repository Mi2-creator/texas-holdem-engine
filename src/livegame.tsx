/**
 * Live Game Entry Point
 * Phase L3 - Standalone entry for live Texas Hold'em game
 *
 * Run with: npm run dev (after updating vite config or index.html)
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { LiveGame } from './game/ui/LiveGame';

function App() {
  return (
    <LiveGame
      config={{
        smallBlind: 5,
        bigBlind: 10,
        startingStack: 1000,
        heroName: 'You',
        aiName: 'Opponent',
        aiStyle: 'neutral',
      }}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
