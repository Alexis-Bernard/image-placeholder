const csv = require('csv-parser');
const fs = require('fs');

const readFromCsv = async (path) => {
  const data = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(path)
      .pipe(csv())
      .on('data', (row) => {
        data.push(row);
      })
      .on('end', () => {
        resolve(data);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

module.exports = {
  readFromCsv,
};
