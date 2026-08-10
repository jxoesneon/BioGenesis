#!/bin/bash
find src -name "*.tsx" -type f -exec sed -i 's/bg-slate-900/bg-cyan-950\/40/g' {} +
find src -name "*.tsx" -type f -exec sed -i 's/bg-slate-950/bg-[#04121e]\/80/g' {} +
find src -name "*.tsx" -type f -exec sed -i 's/text-slate-/text-cyan-/g' {} +
