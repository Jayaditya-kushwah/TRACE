import Tesseract from 'tesseract.js';
import path from 'path';
import fs from 'fs';

/**
 * Performs OCR text extraction on an image file path.
 * Supports PNG, JPEG, WebP, and TIFF.
 */
export async function performOCR(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found at path: ${filePath}`);
  }

  console.log(`Starting OCR text extraction for: ${filePath}`);
  
  try {
    const result = await Tesseract.recognize(filePath, 'eng', {
      logger: m => console.log(`[Tesseract OCR] ${m.status}: ${Math.round(m.progress * 100)}%`),
    });

    const text = result.data.text;
    console.log(`OCR extraction completed successfully. Characters extracted: ${text.length}`);
    return text;
  } catch (error) {
    console.error('Tesseract OCR failed:', error);
    throw error;
  }
}
