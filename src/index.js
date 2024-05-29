const express = require('express');
const { registerFont, createCanvas } = require('canvas');
const { CanvasEmoji } = require('canvas-emoji');
const levenshtein = require('fast-levenshtein');

// Load the environment variables
require('dotenv').config();

// Register the font
registerFont('fonts/Outfit-Bold.ttf', { family: 'Outfit' });

// Create the express app
const app = express();

/**
 * Variables to ajdust the image
 */
const canvasWidth = parseInt(process.env.CANVAS_WIDTH) || 1275;
const maxFontSize = parseInt(process.env.MAX_FONT_SIZE) || 200;
const baseFontColor = process.env.BASE_FONT_COLOR || '#fff';
const specialWordFontColor = process.env.SPECIAL_WORD_FONT_COLOR || '#FB7417';
const specialWordList = process.env.SPECIAL_WORD_LIST?.split(',') || [];

/**
 * Variables to calculate the image
 */
const ratio = 1275 / 362;
const canvasHeight = canvasWidth / ratio;
const ratios = {
  2: 1.275,
  3: 1.167,
  4: 1.12,
  5: 1.095,
};

/**
 * Get the font to use
 * @param {number} [size=maxFontSize] - The size of the font
 * @returns {string} The font to use
 */
const getFont = (size = maxFontSize) => `bold ${size}px Outfit`;

/**
 * Get the color of for word
 * @param {string} word - The word to color
 * @returns {string} The color to use for the word
 */
const getColor = (word) => {
  // Check if word is null or empty
  if (!word) {
    return baseFontColor;
  }

  // Check if the word is in the colored word list
  return specialWordList.some((specialWord) =>
    specialWord.length > 3
      ? levenshtein.get(word, specialWord, { useCollator: true }) <= 2
      : word.toLowerCase() === specialWord.toLowerCase(),
  )
    ? specialWordFontColor
    : baseFontColor;
};

/**
 * Draw a word on the canvas
 * @param {CanvasRenderingContext2D} context - The context of the canvas
 * @param {string} word - The word to draw
 * @param {number} x - The x position of the word
 * @param {number} y - The y position of the word
 * @returns {number} The width of the word
 */
const drawWord = (context, word, x, y, fontSize) => {
  if (word.length > 1 && word.endsWith('!')) {
    word = word.substring(0, word.length - 1);

    const textSize = drawWord(context, word, x, y, fontSize);
    return textSize + drawWord(context, '!', x + textSize, y, fontSize);
  }

  context.textAlign = 'left';
  context.fillStyle = getColor(word);

  const canvasEmoji = new CanvasEmoji(context);
  canvasEmoji.drawPngReplaceEmoji({
    text: word,
    x,
    y,
    emojiW: fontSize,
    emojiH: fontSize,
  });

  return context.measureText(`${word} `).width;
};

/**
 * Compute the font size to use for the text to fit the canvas. The font will be automatically set in the context.
 * @param {string} text - The text to display
 * @param {CanvasRenderingContext2D} context - The context of the canvas to draw on
 * @returns
 */
const computeFontSize = (text) => {
  // Create a new canvas to compute the font size
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext('2d');

  // Set the default font and font size
  context.font = getFont();

  // Calculate the width of the text
  let { width: textWidth, actualBoundingBoxDescent, actualBoundingBoxAscent } = context.measureText(text);

  // Initialize the dichotomy
  const dichotomy = {
    min: 0,
    max: maxFontSize,
  };

  // Decrease the font size until the text fits the canvas
  do {
    // Compute the new font size
    const newFontSize = Math.floor((dichotomy.min + dichotomy.max) / 2);

    // Set the new font size
    context.font = getFont(newFontSize);

    // Calculate the width of the text
    ({ width: textWidth, actualBoundingBoxDescent, actualBoundingBoxAscent } = context.measureText(text));

    // Update the dichotomy
    if (textWidth > canvasWidth || actualBoundingBoxDescent + actualBoundingBoxAscent > canvasHeight) {
      console.log('Decrease font size');
      dichotomy.max = newFontSize;
    } else {
      console.log('Increase font size');
      dichotomy.min = newFontSize;
    }
  } while (dichotomy.max - dichotomy.min > 1);

  return dichotomy.min;
};

const splitLines = (text, maxLineLength) => {
  const lines = [];

  // Split the lines who exceeds the max line length
  text.split('\n').forEach((line) => {
    while (line.length > maxLineLength) {
      let pos = line.substring(0, maxLineLength).lastIndexOf(' ');
      pos = pos <= 0 ? maxLineLength : pos;

      lines.push(line.substring(0, pos));

      let i = line.indexOf(' ', pos) + 1;
      if (i < pos || i > pos + maxLineLength) {
        i = pos;
      }
      line = line.substring(i);
    }

    lines.push(line);
  });

  return lines;
};

const computeLineHeight = (lines, textDetails) => {
  // Calculate the line height
  const multiplier = ratios[lines.length] || 0.7 / lines.length ** 1.5 + 1;
  const lineHeight =
    ((textDetails.actualBoundingBoxDescent + textDetails.actualBoundingBoxAscent) / lines.length) * multiplier;

  return lineHeight;
};

const getLongestLineLength = (lines) => lines.reduce((max, line) => (line.length > max ? line.length : max), 0);

// Create a route for the image
app.get('/image/:text', async (req, res) => {
  try {
    console.log('Request received on /image');

    // Instantiate the canvas object
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const context = canvas.getContext('2d');

    // Get the text from the request
    let { text } = req.params;

    let lines = text.split('\n');

    // Initialize the dichotomy
    const dichotomy = {
      min: 0,
      max: getLongestLineLength(lines),
      maxFontSize: computeFontSize(lines),
      lines,
    };

    // Start the dichotomy
    do {
      // Compute the new max line length
      const newMaxLineLength = Math.floor((dichotomy.min + dichotomy.max) / 2);

      // Split the lines
      const splittedLines = splitLines(text, newMaxLineLength);

      // Compute the new font size
      const newFontSize = computeFontSize(splittedLines.join('\n'));

      // Update the dichotomy
      if (newFontSize > dichotomy.maxFontSize) {
        dichotomy.maxFontSize = newFontSize;
        dichotomy.lines = splittedLines;

        // Set the font size
        context.font = getFont(dichotomy.maxFontSize);

        // Get the size details of the text
        const textDetails = context.measureText(splittedLines.join('\n'));

        // Compute line height
        const lineHeight = computeLineHeight(splittedLines, textDetails);

        if (
          canvasHeight - textDetails.actualBoundingBoxDescent + textDetails.actualBoundingBoxAscent >
          lineHeight * 2
        ) {
          dichotomy.max = newMaxLineLength;
        } else {
          dichotomy.min = newMaxLineLength;
        }
      } else {
        dichotomy.max = newMaxLineLength;
      }
    } while (dichotomy.max - dichotomy.min > 1);

    // Set the font size
    context.font = getFont(dichotomy.maxFontSize);

    // Get the lines
    lines = dichotomy.lines;

    // Join the lines
    text = lines.join('\n');

    // Get the size details of the text
    const textDetails = context.measureText(text);

    // Compute line height
    const lineHeight = computeLineHeight(lines, textDetails);

    // Calculate the y position of the text
    let y = (canvasHeight - textDetails.actualBoundingBoxDescent + textDetails.actualBoundingBoxAscent) / 2;

    // Draw the text
    lines.forEach((line) => {
      // Calculate the x position of the text
      let x = (canvasWidth - context.measureText(line).width) / 2;

      // Draw the text
      line.split(' ').forEach((word) => {
        x += drawWord(context, word, x, y, dichotomy.maxFontSize);
      });

      // Increment the y position
      y += lineHeight;
    });

    // Send the image as a response
    res.set('Content-Type', 'image/png');
    res.send(canvas.toBuffer());
  } catch (err) {
    console.log(err);
    res.set('Content-Type', 'application/json');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(3000, () => {
  console.log('Server listening on port 3000');
});
