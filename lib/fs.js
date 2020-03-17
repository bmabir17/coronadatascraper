import fs from 'fs';
import csvParse from 'csv-parse';
import csvStringify from 'csv-stringify';
import pdfreader from 'pdfreader';
/*
  Check if a file exists
*/
async function exists(filePath) {
  return await fs.promises.access(filePath, fs.constants.R_OK).then(() => true).catch(() => false);
}

/*
  Read a file
*/
async function readFile(filePath) {
  return await fs.promises.readFile(filePath);
}

/*
  Read JSON
*/
async function readJSON(filePath) {
  return JSON.parse(await readFile(filePath));
}

/*
  Read a CSV file
*/
async function readCSV(filePath) {
  return new Promise(async (resolve, reject) => {
    let data = await readFile(filePath);

    csvParse(data, {
      columns: true
    }, function(err, output) {
      if (err) {
        reject(err);
      }
      else {
        resolve(output);
      }
    });
  });
}
async function readPDF(filePath) {
  return new Promise(async (resolve, reject) => {
    // var pdfreader = require("pdfreader");
    var rows = {}; // indexed by y-position
    var output = [];
    new pdfreader.PdfReader().parseFileItems(filePath, function(
      err,
      item
    ) {
      
      if (err) {
        reject(err);
      }
      else {
        if (!item || item.page) {
          // end of file, or page
          printPdfRows(rows,output);
          resolve(output);
          console.log("PAGE:", output);
          rows = {}; // clear rows for next page
        } else if (item.text) {
          // accumulate text items into rows object, per line
          (rows[item.y] = rows[item.y] || []).push(item.text);
          // console.log("ROWS:", item.text);
        }
        resolve(output)
      }
    });
  });
}
function printPdfRows(rows,output) {
  Object.keys(rows) // => array of y-positions (type: float)
    .sort((y1, y2) => parseFloat(y1) - parseFloat(y2)) // sort float positions
    .forEach(y => output.push((rows[y] || []).join("")));
}

/*
  Write a file
*/
async function writeFile(filePath, data) {
  return await fs.promises.writeFile(filePath, data);
}

/*
  Write JSON
*/
async function writeJSON(filePath, data) {
  return await writeFile(filePath, JSON.stringify(data, null, 2));
}

/*
  Write CSV
*/
async function writeCSV(filePath, data) {
  return new Promise(async (resolve, reject) => {
    csvStringify(data, (err, output) => {
      if (err) {
        reject(err);
      }
      else {
        resolve(writeFile(filePath, output));
      }
    });
  });
}

/*
  Ensure dir
*/
async function ensureDir(dirPath) {
  if (!(await exists(dirPath))) {
    return await fs.promises.mkdir(dirPath, { recursive: true });
  }
}

export { readFile, readJSON, readCSV, readPDF, writeFile, writeJSON, writeCSV, exists, ensureDir };
