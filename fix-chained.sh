#!/bin/bash
find src -name "*.tsx" -type f -exec sed -i 's/\/40\/60/\/40/g' {} +
find src -name "*.tsx" -type f -exec sed -i 's/\/40\/80/\/60/g' {} +
find src -name "*.tsx" -type f -exec sed -i 's/\/40\/90/\/80/g' {} +
find src -name "*.tsx" -type f -exec sed -i 's/\/80\/60/\/80/g' {} +
