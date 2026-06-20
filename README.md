# AutoNovel UI

AutoNovel UI is a streamlined, desktop-style interface for local inference novel generation pipelines. It allows you to build a novel from a premise, to an outline, to fully drafted chapters using either local AI models (via LM Studio, Ollama, etc.) or cloud-based models.

## How to Run This Application

You can use this application by running it locally on your computer.

### Run Locally (Best for long-term use)

Export the project and run it using Node.js.

1. **Export the Application**: 
   - Clone this GitHub repository.
2. **Install Node.js**: Ensure you have Node.js installed on your computer (v18 or higher recommended).
3. **Install Dependencies**:
   - Open a terminal in the exported project folder.
   - Run `npm install` to install all required packages.
4. **Environment Variables**:
   - Copy `.env.example` to `.env` (or `.env.local`).
   - Use this command `cp .env.example .env`
   - Update the environment vabiales that will be used.
   - If you plan to use Cloud inference for example, (Gemini), add your `GEMINI_API_KEY` to the `.env` file.
5. **Start the Development Server**:
   - Run `npm run dev`.
   - Open your browser to `http://localhost:3000`.
6. **Configure Local AI**:
   - If using local inference, make sure LM Studio or Ollama is running, and configure the settings in the app as described below.
  
   1. **Start your local AI server** (e.g., LM Studio).
   - Ensure the Local Server is running (usually on port 1234).
   - **Crucial step**: Ensure **CORS is enabled** in your LM Studio Server settings, so the browser doesn't block the request.
   2. **Access the Settings** (gear icon in the bottom left).
   - Turn off "Use Cloud Inference" if you want to use your local model.
   - Set the Local Inference API URL to `http://127.0.0.1:1234/v1` (using `127.0.0.1` instead of `localhost` helps prevent browser mixed-content blocking).

## Writing Guardrails

This app includes built-in "Writing Guardrails" designed to prevent local (and cloud) models from generating "AI slop." You can configure these in the Settings menu:

- **CRAFT.md Rules**: High-level instructions for good prose (Show don't tell, grounded descriptions).
- **ANTI-SLOP.md**: A list of banned, overused AI words (tapestry, testament, delve).
- **ANTI-PATTERNS.md**: Structural elements to avoid (neat wrap-ups, rhetorical questions at chapter ends).

These instructions act as an "immune system" during the drafting phase to ensure higher-quality output.
