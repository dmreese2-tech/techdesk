import React from 'react';

// ---------------------------------------------------------------------------
// DESIGN TOKENS AND GLOBAL TYPE
//
// Lifted out of TechDeskDashboard.jsx so every module can reach the palette
// without importing the whole app. FONTS stays a component because it injects
// the font @import and the cue-light keyframes once, where the shell renders it.
// ---------------------------------------------------------------------------

export const COLOR = {
  void: '#0B0E11',
  panel: '#12161B',
  card: '#181D24',
  cardHover: '#1D232B',
  line: '#2A323C',
  lineBright: '#3C4A58',
  blueprint: '#5B7A8C',
  textPrimary: '#EDEFF2',
  textMuted: '#8A94A3',
  textFaint: '#5B6472',
  amber: '#E8A33D',
  amberDim: '#5A4426',
  green: '#4CAF6D',
  greenDim: '#254A32',
  slate: '#6B7480',
  slateDim: '#2A2E35',
};

export const FONTS = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

    .td-display { font-family: 'Oswald', sans-serif; text-transform: uppercase; }
    .td-body { font-family: 'Inter', sans-serif; }
    .td-mono { font-family: 'IBM Plex Mono', monospace; }

    @keyframes pulse-glow {
      0%, 100% { opacity: 1; box-shadow: 0 0 6px 1px var(--glow); }
      50% { opacity: 0.55; box-shadow: 0 0 2px 0px var(--glow); }
    }
    .cue-light-standby {
      --glow: ${COLOR.amber};
      animation: pulse-glow 2.2s ease-in-out infinite;
    }
    .cue-light-running {
      box-shadow: 0 0 8px 2px ${COLOR.green};
    }
    .td-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .td-scrollbar::-webkit-scrollbar-thumb { background: ${COLOR.line}; border-radius: 3px; }

    /* Every input in this app is styled width: 100% with padding and a border.
       Under the default content-box that means the element renders WIDER than
       the column it sits in — a 66px grid cell holding an input with 8px
       padding and a 1px border draws 84px, overflows by 18, and paints over
       whatever is next to it. That is what made the cue box sit on top of the
       stock checkbox, and it was never a gap problem: no gap survives an
       element 18px too wide. */
    *, *::before, *::after {
      box-sizing: border-box;
    }

    /* The page itself, not just the app shell — otherwise the browser's default
           8px body margin leaves a white frame around a full-bleed dark UI. */
        html, body, #root {
          margin: 0;
          padding: 0;
          min-height: 100%;
          background: #0B0E11;
        }

        /* An outline takes no layout space, so the ring is drawn on whatever sits
       next to the focused control. At offset 2 it reached 4px out and touched
       any neighbour less than 12px away — which was most of them. Offset 1
       reaches 3px, stays clearly visible, and gives every side-by-side pair in
       the app room without each one having to be widened by hand. */
    .td-focusable:focus-visible {
      outline: 2px solid ${COLOR.amber};
      outline-offset: 1px;
    }

    @media (prefers-reduced-motion: reduce) {
      .cue-light-standby { animation: none; }
    }
  `}</style>
);
