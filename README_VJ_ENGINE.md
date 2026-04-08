# Arena VJ Engine - Technical Documentation & Guide

## Project Overview
This is a high-performance VJ (Video Jockey) engine built with **React**, **Three.js**, and **Vite**. It features a particle-based visualizer capable of rendering 12,000+ particles with real-time audio reactivity, geometric morphing, and post-processing effects.

## Core Features

### 1. Dual Shape Merging (SOP Logic)
Inspired by Surface Operators (SOPs) in tools like TouchDesigner, this engine allows you to fuse two geometric forms:
- **Shape A & Shape B:** Select two distinct geometries (e.g., Cube and Sphere).
- **Merge Modes:**
    - `LERP`: Smooth linear interpolation.
    - `ADDITIVE`: Sums coordinates for complex expansion.
    - `SUBTRACTIVE`: Carves Shape B out of Shape A.
    - `CROSS_AXIS`: Mixes axes (e.g., X/Z from A, Y from B) for hybrid structures.
    - `INTERSECT`: Pulls points toward the smaller shared volume.

### 2. Pure Geometry Generation
The engine uses custom mathematical generators for perfect geometric primitives:
- **Cube, Pyramid, Cylinder**: Generated as solid meshes with high-density point distribution, ensuring they look like physical objects when "Pure Geometry" mode is active.

### 3. Arena VJ Mixer
A professional-grade mixing interface:
- **Decks A & B**: Two independent visual states.
- **Crossfader**: Real-time interpolation between Deck A and Deck B.
- **Clip Matrix**: Save visual "snapshots" to slots and trigger them instantly.
- **Send Live**: Capture the current main output and send it to a specific deck for further mixing.

### 4. Audio Reactivity & BPM Sync
- **Frequency Analysis**: Bass, Mid, and Treble directly modulate noise, scale, and color.
- **BPM Sync**: Synchronizes visual pulses with a master clock (BPM).
- **Audio Force**: Global multiplier for all audio-driven movements.

### 5. Corruption & Glitch Engine
- **Noise Types**: Vortex, Ripple, Harmonics, Mesh Tear, Datamosh, Bit Crush, etc.
- **Post-Processing**: Feedback Smear (Datamosh trails), RGB Shift, Scanlines, and Kaleidoscope.

## Technical Architecture

### State Management
The entire engine state is held in `vjState` (defined in `types.ts`). This state is mirrored in `vjStateRef` inside the canvas for high-performance access within the `requestAnimationFrame` loop.

### Shaders
- **ParticleShader**: Handles 3D displacement, color mapping, and interaction.
- **CorruptionShader**: Applied to 3D models, images, and videos for uniform "data corruption" effects.
- **FeedbackShader**: Implements the frame-buffer smear effect.

### Interaction
- **OrbitControls**: Standard 3D navigation (Rotate/Zoom).
- **Mouse Interaction**: Optional vertex displacement (can be toggled in the MOTION tab).

## How to Run in an IDE
1. **Extract the ZIP** to a folder.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Start Development Server**:
   ```bash
   npm run dev
   ```
4. **Build for Production**:
   ```bash
   npm run build
   ```

## Key Files
- `src/App.tsx`: Main entry point and state initialization.
- `src/components/VJCanvas.tsx`: The Three.js engine and render loop.
- `src/components/Controls.tsx`: UI logic and Deck/Clip management.
- `src/types.ts`: TypeScript definitions for the entire system.
- `src/services/audioService.ts`: Web Audio API integration.

---
*Developed for high-end generative art and live performance.*
