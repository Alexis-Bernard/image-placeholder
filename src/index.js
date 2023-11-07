const express = require('express');
const { registerFont, createCanvas } = require('canvas');
const levenshtein = require('fast-levenshtein');
const { readFromCsv } = require('./utils');

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
const maxLineLength = parseInt(process.env.MAX_LINE_LENGTH) || 100;
const maxFontSize = parseInt(process.env.MAX_FONT_SIZE) || 100;
const baseFontColor = process.env.BASE_FONT_COLOR || '#fff';
const specialWordFontColor = process.env.SPECIAL_WORD_FONT_COLOR || '#FB7417';
const specialWordList = process.env.SPECIAL_WORD_LIST?.split(',') || [];

/**
 * Variables to calculate the image
 */
const dataToDisplay = [];
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
const drawWord = (context, word, x, y) => {
  if (word.length > 1 && word.endsWith('!')) {
    word = word.substring(0, word.length - 1);

    const textSize = drawWord(context, word, x, y);
    return textSize + drawWord(context, '!', x + textSize, y);
  }

  context.textAlign = 'left';
  context.fillStyle = getColor(word);
  context.fillText(word, x, y);

  return context.measureText(`${word} `).width;
};

// Create a route for the image
app.get('/review', async (req, res) => {
  try {
    console.log('Request received on /review');

    // Check if the data is already loaded
    if (!dataToDisplay.length) {
      console.log('Reading data from CSV');

      const data = await readFromCsv('data/reviews.csv');

      console.log(`Found ${data.length} reviews`);

      dataToDisplay.push(...data);
    }

    // Instantiate the canvas object
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const context = canvas.getContext('2d');

    // Get a text randomly from the data
    let { text } = dataToDisplay[Math.floor(Math.random() * dataToDisplay.length)];

    // Initialize the array of splitted lines
    const splittedLines = [];

    // Split the lines who exceeds the max line length
    text.split('\n').forEach((line) => {
      while (line.length > maxLineLength) {
        let pos = line.substring(0, maxLineLength).lastIndexOf(' ');
        pos = pos <= 0 ? maxLineLength : pos;

        splittedLines.push(line.substring(0, pos));

        let i = line.indexOf(' ', pos) + 1;
        if (i < pos || i > pos + maxLineLength) {
          i = pos;
        }
        line = line.substring(i);
      }

      splittedLines.push(line);
    });

    // Join the lines with a line break
    text = splittedLines.join('\n');

    // Set the default font and font size
    context.font = getFont();

    // Calculate the width of the text
    let { width: textWidth, actualBoundingBoxDescent, actualBoundingBoxAscent } = context.measureText(text);

    // Initialize the font size
    let fontSize = maxFontSize;

    // Decrease the font size until the text fits the canvas
    while (textWidth > canvasWidth || actualBoundingBoxDescent + actualBoundingBoxAscent > canvasHeight) {
      fontSize -= 1;
      context.font = getFont(fontSize);
      ({ width: textWidth, actualBoundingBoxDescent, actualBoundingBoxAscent } = context.measureText(text));
    }

    // Get the size details of the text
    const textDetails = context.measureText(text);

    // Split the text into lines
    const lines = text.split('\n');

    // Calculate the line height
    const multiplier = ratios[lines.length] || 0.7 / lines.length ** 1.5 + 1;
    const lineHeight =
      ((textDetails.actualBoundingBoxDescent + textDetails.actualBoundingBoxAscent) / lines.length) * multiplier;

    // Calculate the y position of the text
    let y = (canvasHeight - textDetails.actualBoundingBoxDescent + textDetails.actualBoundingBoxAscent) / 2;

    // Draw the text
    lines.forEach((line) => {
      // Calculate the x position of the text
      let x = (canvasWidth - context.measureText(line).width) / 2;

      // Draw the text
      line.split(' ').forEach((word) => {
        x += drawWord(context, word, x, y);
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
