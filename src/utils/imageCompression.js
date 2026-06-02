/**
 * ============================================================================
 * LeanPrompts Studio
 * @author       Ivica Vrgoc
 * @link         https://github.com/IvicaV/LeanPrompts
 * @copyright    Copyright (c) 2025-present Ivica Vrgoc. All rights reserved.
 * @license      AGPL-3.0
 * ============================================================================
 * This file is part of LeanPrompts Studio.
 * 
 * LeanPrompts Studio is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 * ============================================================================
 */
export const compressImage = (file, maxSize = 1024, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

export const extractThumbnail = (imageSrc, cropArea, targetSize = 128) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');

      let sourceX, sourceY, sourceWidth, sourceHeight;

      // INTELLIGENTER AUTO-CROP: Verhindert Stauchung beim initialen Upload/Paste
      // Wenn 100% angefordert werden, berechnen wir stattdessen ein perfektes Quadrat aus der Mitte.
      if (cropArea.x === 0 && cropArea.y === 0 && cropArea.width === 100 && cropArea.height === 100) {
          const size = Math.min(img.width, img.height);
          sourceX = (img.width - size) / 2;
          sourceY = (img.height - size) / 2;
          sourceWidth = size;
          sourceHeight = size;
      } else {
          // Standard-Verhalten für das manuelle Crop-Tool im Workspace
          sourceX = (cropArea.x / 100) * img.width;
          sourceY = (cropArea.y / 100) * img.height;
          sourceWidth = (cropArea.width / 100) * img.width;
          sourceHeight = (cropArea.height / 100) * img.height;
      }

      // Rendert den (nun korrekten) Ausschnitt in das 128x128 Canvas
      ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetSize, targetSize);
      resolve(canvas.toDataURL('image/webp', 0.8));
    };
  });
};
