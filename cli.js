import path from 'path';
import generate from './index.js';
import * as fs from './lib/fs.js';
import * as stringify from './lib/stringify.js';
import argv from './lib/cliArgs.js';

async function writeData({ locations }) {
  let date = process.env['SCRAPE_DATE'] ?  '-' + process.env['SCRAPE_DATE'] : '';

  await fs.ensureDir('dist')

  await fs.writeFile(path.join('dist', `data${date}.json`), JSON.stringify(locations, null, 2));

  await fs.writeCSV(path.join('dist', `data${date}.csv`), stringify.csvForDay(locations));

  return { locations };
}

generate(argv.date, argv)
  .then(writeData);
