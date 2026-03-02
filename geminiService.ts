import {GoogleGenAI, Type} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AnalysisResult {
  isBlurry: boolean;
  blurReason?: string;
  errors: {
    type: string;
    description: string;
    coordinates: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }[];
  overallHealth: "Excellent" | "Good" | "Fair" | "Poor";
  summary: string;
}

export async function analyzeLaptopImage(base64Image: string, model: string): Promise<AnalysisResult> {
  const modelName = "gemini-3-flash-preview";
  
  const prompt = `
    You are an expert HP hardware diagnostic AI. 
    Analyze the provided image of an HP laptop (Model: ${model}).
    Focus on external issues: outer shell damage, screen cracks/pixels, and keyboard defects (missing keys, worn labels).
    
    1. Check if the image is blurry or too dark to analyze.
    2. If clear, detect all visible external errors.
    3. For each error, provide its bounding box coordinates in normalized format (0-1000).
    4. Provide an overall health assessment.
    
    Return the result strictly in JSON format.
  `;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1] || base64Image,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isBlurry: { type: Type.BOOLEAN },
          blurReason: { type: Type.STRING },
          errors: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                description: { type: Type.STRING },
                coordinates: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.NUMBER, description: "Left coordinate (0-1000)" },
                    y: { type: Type.NUMBER, description: "Top coordinate (0-1000)" },
                    width: { type: Type.NUMBER, description: "Width (0-1000)" },
                    height: { type: Type.NUMBER, description: "Height (0-1000)" },
                  },
                  required: ["x", "y", "width", "height"],
                },
              },
              required: ["type", "description", "coordinates"],
            },
          },
          overallHealth: { type: Type.STRING, enum: ["Excellent", "Good", "Fair", "Poor"] },
          summary: { type: Type.STRING },
        },
        required: ["isBlurry", "errors", "overallHealth", "summary"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
}
