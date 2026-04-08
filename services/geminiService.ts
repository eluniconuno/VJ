
import { GoogleGenAI, Type } from "@google/genai";
import { VJState } from '../types';

// SYSTEM_INSTRUCTION defines the persona and rules for the VJ Performance Engine AI
const SYSTEM_INSTRUCTION = `
You are "CORRUPTED DATA // NEURAL SYNTHESIZER", a high-end Visual Research Engine.
You manage a Three.js particle system and a Dynamic Layered Typography engine.

### MISSION:
Your goal is to "research" visual possibilities through data corruption and glitch aesthetics. 
You don't just "generate" images; you "synthesize" them from raw data streams.

### TERMINOLOGY:
- "Geometry" is now "Data Structure".
- "Noise Mode" is now "Corruption Mode".
- "Chaos" is "Deformation Intensity".
- "Flow" is "Animation Speed".

### DATA MERGING & RESEARCH:
- "Conceptual Data Merging" is the fusion of distinct data sources. Any layer (Image/Video) marked as "CORPUS" will displace and corrupt the "Data Structure" (particles).
- "Compression", "Datamosh", and "Glitch" intensities (0.0 to 1.0) simulate the "Poor Image" aesthetic.
- "Distortion" on an Image layer turns it into a 3D structure (Displacement).

### PRESETS:
- "Brutalist Fusion": Monolith + Mesh Tear + DNA Fusion.
- "Neural Matrix": Data Grid + Bit Crush + Collision.
- "Corrupted Biology": DNA + Vortex + Interference.

### MULTI-LAYER SYSTEM:
You can manage multiple layers of different types:
- PARTICLES: The base particle system.
- 3D: GLTF/GLB models.
- SPLINE: Spline scenes.
- IMAGE: Background or floating images. Use "Distort" to turn them into 3D.
- VIDEO: Background or floating videos.
- IFRAME: Embed any website.
- SHAPE: Add multiple physical geometries (ORB, TORUS, etc.).

Any layer can be a "CORPUS" (data source for merging).
Each layer has properties: id, type, url, shapeType, visible, opacity, scale, posX, posY, posZ, rotX, rotY, rotZ, blendMode, isCorpus, distortion.

### MULTI-LAYER TEXT SYSTEM:
You can manage multiple text overlays simultaneously. 
- Animations: 'pulse', 'glitch', 'neon', 'marquee' (scrolling), 'wave' (floating), 'bounce' (jumping), 'chroma' (color cycle).
- Blend Modes: 'normal', 'overlay', 'screen', 'difference' (invert on background), 'exclusion'.

### COMMAND EXAMPLES:
- "Synthesize a brutalist monolith with electric blue data tears": Set activeShape='MONOLITH', noiseMode=MESH_TEAR, color='#2D70FF'.
- "Add a 3D skull model from this URL": Add a layer with type='3d', url='URL'.
- "Embed this Spline scene": Add a layer with type='spline', url='https://my.spline.design/...'.
- "Place a floating image of a circuit board": Add a layer with type='image', url='URL', scale=10.
- "Corrupt the grid with bit crush and add a technical overlay": Set activeShape='DATA_GRID', noiseMode=BIT_CRUSH, showTechnicalOverlay=true.
- "Show a glitchy 'CORRUPTED' in the middle": Append layer with anim='glitch', size=15.

### OUTPUT FORMAT:
Always return JSON with 'intent', 'responseText', and 'parameters' (Partial<VJState>).
Focus parameters on 'layers' array when modifying 3D/Image/Video layers.
`;

/**
 * Processes user natural language prompts into VJ engine state updates.
 * Initializes a new GoogleGenAI instance for each request to ensure fresh context and compliance.
 */
export const processUserPrompt = async (
  prompt: string, 
  contextData?: { audioStats: string, currentState: VJState }
): Promise<{ type: 'action' | 'info'; data: any }> => {
  // Always initialize right before making an API call to use latest environment configuration
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const model = "gemini-3-flash-preview";
  
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      intent: { type: Type.STRING, enum: ["action", "info"] },
      responseText: { type: Type.STRING },
      parameters: {
        type: Type.OBJECT,
        properties: {
          activeShape: { type: Type.STRING },
          noiseMode: { type: Type.INTEGER },
          effectMode: { type: Type.INTEGER },
          color: { type: Type.STRING },
          deformationIntensity: { type: Type.NUMBER },
          mergeMode: { type: Type.STRING, enum: ["additive", "collision", "interference", "dna_fusion", "erosion"] },
          compressionArtifacts: { type: Type.NUMBER },
          showTechnicalOverlay: { type: Type.BOOLEAN },
          layers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING },
                url: { type: Type.STRING },
                visible: { type: Type.BOOLEAN },
                opacity: { type: Type.NUMBER },
                scale: { type: Type.NUMBER },
                posX: { type: Type.NUMBER },
                posY: { type: Type.NUMBER },
                posZ: { type: Type.NUMBER },
                rotX: { type: Type.NUMBER },
                rotY: { type: Type.NUMBER },
                rotZ: { type: Type.NUMBER },
                blendMode: { type: Type.STRING }
              },
              required: ["id", "type"]
            }
          },
          textOverlays: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text: { type: Type.STRING },
                font: { type: Type.STRING },
                size: { type: Type.NUMBER },
                posX: { type: Type.NUMBER },
                posY: { type: Type.NUMBER },
                color: { type: Type.STRING },
                anim: { type: Type.STRING },
                blendMode: { type: Type.STRING },
                outline: { type: Type.BOOLEAN },
                opacity: { type: Type.NUMBER }
              },
              required: ["id", "text"]
            }
          }
        }
      }
    },
    required: ["intent", "responseText"]
  };

  let fullPrompt = `User Prompt: "${prompt}"`;
  if (contextData) {
    fullPrompt += `\n[STATE]: ${JSON.stringify(contextData.currentState.textOverlays)}\n[AUDIO]: ${contextData.audioStats}`;
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: fullPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return { type: 'action', data: JSON.parse(text) };

  } catch (error) {
    console.error("Gemini VJ Core Error:", error);
    return { type: 'info', data: { responseText: "Engine interference detected. System remains stable." } };
  }
};
