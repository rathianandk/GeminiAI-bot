<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

# gStrEats EyAI // Street Food Intelligence

**gStrEats EyAI** is a spatial discovery engine designed to map, analyze, and preserve the micro-economies of local street food vendors and landmarks. Powered by Gemini 3 and 2.5 series models, it transforms raw urban data into a high-fidelity culinary "Neural Grid."

## 🚀 Mission: Street Visibility
In many urban centers, street vendors form the backbone of the economy but remain digitally invisible. gStrEats EyAI bridges this divide by:
- **Broadcasting Live Signals**: Allowing vendors to activate their presence on a real-time spatial grid.
- **Urban Reasoning**: Using specialized frameworks to analyze the physical and cultural impact of food nodes.
- **Cultural Preservation**: Tracing the "Flavor Genealogy" of spice migrations and historical culinary staples.

## ✨ Key Features

### 1. Neural Discovery & Scrape
- **Discovery Agent**: Uses Google Search grounding to identify legendary, real-world street food spots within a 5km radius.
- **Spatial Analytics**: Generates high-level intelligence dashboards covering cuisine distribution, price spectrums, and legendary indices.

### 2. High-Fidelity Spatial Lens
- **Urban Framework Analysis**: Deep-dives into **Pedestrian Dynamics**, **Architectural Morphology**, and **Visual Semiotics**.
- **Causal Bottlenecks**: Identifies the physical root causes (e.g., zero-setback facades) that constrain food node throughput.
- **Operational Recommendations**: Proposes decentralization strategies like digital buffers and virtual tokenization.

### 3. Cross-Temporal Historian
- **Multimodal Genealogy**: Upload a photo of a dish to trace its historical migration and cultural origin using a 1M token context window.
- **Flavor Timeline**: Visualizes the evolution of neighborhood staples across different historical eras.

### 4. Linguistic Calibration
- **Bilingual Interface**: Seamlessly switch between English and Tamil (Madras Bashai mapping).
- **TTS Summaries**: "Kore" voice prebuilt for cheerful, localized audio summaries of food nodes.

### 5. Vendor Hub
- **Signal Activation**: Vendors can manage their "Hub," update inventory manifests, and broadcast their location live.
- **Gemini Bio Gen**: One-click evocative bio generation for vendor storefronts.

## 🛠️ Technology Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Intelligence**: `@google/genai` (Gemini 3 Pro/Flash Preview, Gemini 2.5 Flash Native Audio)
- **Mapping**: Leaflet.js with customized Voyager Dark/Inverted styling.
- **Visuals**: Three.js (3D Neural Coordination Mesh), Chart.js (Spatial Analytics).

## 🧩 Agent Architecture
The app features an autonomous **Coordination Loop** where multiple agents collaborate:
- **Spatial Agent**: Scans the grid for density anomalies.
- **Discovery Agent**: Scrapes real-world node data.
- **Lens Agent**: Verifies structural authenticity.
- **Analytics Agent**: Processes economic zoning.
- **Linguistic Agent**: Calibrates local dialect bios.

## ⚙️ Setup
1. **API Key**: Ensure you have a valid Gemini API Key from [Google AI Studio](https://aistudio.google.com/).
2. **Environment**: The application expects the key via `process.env.API_KEY`.
3. **Execution**: This project uses ES6 modules. Run through a standard local server or host on platforms like Vercel/Firebase.

---
*Developed as a high-fidelity experiment in Spatial Intelligence and Urban Logistics.*
