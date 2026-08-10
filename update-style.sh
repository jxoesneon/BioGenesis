#!/bin/bash

files=("src/components/GeneticsDrawer.tsx" "src/components/Header.tsx" "src/components/TelemetryPanel.tsx" "src/App.tsx")

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        sed -i 's/-emerald-/-cyan-/g' "$file"
        sed -i 's/rgba(16,185,129/rgba(6,182,212/g' "$file"
        sed -i 's/glow-text-emerald/glow-text-cyan/g' "$file"
    fi
done

sed -i "s/theme: 'acid'/theme: 'abyssal'/g" src/App.tsx

cat << 'CSS_EOF' > src/index.css
@import "tailwindcss";

@layer base {
  body {
    font-family: 'Rajdhani', sans-serif;
    user-select: none;
    overflow: hidden;
  }
  h1, h2, h3, .font-orbitron {
    font-family: 'Orbitron', sans-serif;
  }
}

/* Custom Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.8);
}
::-webkit-scrollbar-thumb {
  background: #06b6d4;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #22d3ee;
}

/* Biopunk Glass Panel UI - Holographic Style */
.bio-panel {
  background: rgba(8, 27, 38, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(6, 182, 212, 0.4);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.6), inset 0 0 15px rgba(6, 182, 212, 0.15);
}
.bio-panel-active {
  border-color: rgba(34, 211, 238, 0.8);
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.4);
}

/* Custom Range Input */
input[type=range] {
  -webkit-appearance: none;
  background: rgba(30, 41, 59, 0.8);
  border-radius: 4px;
  height: 6px;
}
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: #06b6d4;
  box-shadow: 0 0 10px #06b6d4;
  cursor: pointer;
  transition: transform 0.1s ease;
}
input[type=range]::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  background: #22d3ee;
}

/* Text Glow Effects */
.glow-text-cyan { text-shadow: 0 0 8px rgba(6, 182, 212, 0.6); }
.glow-text-violet { text-shadow: 0 0 8px rgba(168, 85, 247, 0.6); }
.glow-text-rose { text-shadow: 0 0 8px rgba(244, 63, 94, 0.6); }
CSS_EOF

