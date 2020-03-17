import cheerio from 'cheerio';
import needle from 'needle';
import path from 'path';
import csvParse from 'csv-parse';
import puppeteer from 'puppeteer';
import pdfreader from 'pdfreader';
import https from 'https';
import * as fs from './fs.js';
import * as transform from './transform.js';
import * as datetime from './datetime.js';

// Spoof Chrome, just in case
needle.defaults({
  parse_response: false,
  user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36',
  open_timeout: 5000, // Maximum time to wait to establish a connection
  response_timeout: 5000, // Maximum time to wait for a response
  read_timeout: 30000 // Maximum time to wait for data to transfer
});

// Ignore TLS failures (such as Texas DHHS)
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

/*
  Get the path of cache for the given URL at the given date
*/
function getCachedFilePath(url, type, date) {
  let cachePath;
  if (date === false) {
    // This data probably has its own timeseries in it
    // Use local cache, assumed to be recent
    cachePath = 'cache';
  }
  else {
    cachePath = path.join('coronadatascraper-cache', date);
  }

  let urlHash = transform.hash(url);
  let extension = type || path.extname(url) || 'txt';

  let filePath = path.join(cachePath, `${urlHash}.${extension}`);

  return filePath;
}

/*
  Get the cache for the following URL at a given date
  Returns undefined if no cache available, null if it's ok to proceed with fetching
*/
async function getCachedFile(url, type, date) {
  let body;
  let filePath = getCachedFilePath(url, type, date);

  // await fs.ensureDir(path.dirname(filePath));
  if (await fs.exists(filePath)) {
    console.log('  ⚡️ Cache hit for %s from %s', url, filePath);
    return await fs.readFile(filePath);
  }
  else if (date && datetime.dateIsBefore(new Date(date), datetime.getDate())) {
    console.log('  ⚠️  Cannot go back in time to get %s, no cache present', url);
    return;
  }
  console.log('  🐢 Cache miss for %s at %s', url, filePath);
  return null;
}

/*
  Saved the passed data as cache
*/
async function cacheFile(url, type, date, data) {
  let filePath = getCachedFilePath(url, type, date);
  await fs.ensureDir(path.dirname(filePath));
  return fs.writeFile(filePath, data);
}

/*
  Fetch whatever is at the given URL (cached)
*/
async function fetch(url, type, date) {
  if (date !== false) {
    if (!date && process.env['SCRAPE_DATE']) {
      date = process.env['SCRAPE_DATE'];
    }
    else if (!date) {
      date = datetime.getYYYYMD();
    }
  }

  let body = await getCachedFile(url, type, date);
  if (body === null) {
    console.log('  🚦  Loading data for %s from server', url);
    let response = await needle('get', url);
    body = response.body.toString();
    await cacheFile(url, type, date, body);
    return body;
  }
  return body;
}

/*
  Load the webpage at the given URL and return a Cheerio object
*/
async function page(url, date) {
  let body = await fetch(url, 'html', date);

  if (!body) {
    return null;
  }

  return cheerio.load(body);
}

/*
  Load and parse JSON from the given URL
*/
async function json(url, date) {
  let body = await fetch(url, 'json', date);

  if (!body) {
    return null;
  }

  return JSON.parse(body);
}

/*
  Load and parse CSV from the given URL
*/
function csv(url, date) {
  return new Promise(async (resolve, reject) => {
    let body = await fetch(url, 'csv', date);

    if (!body) {
      return resolve(null);
    }

    csvParse(body, {
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
/*
  Load and parse PDF from the given URL
*/
function pdf(url, date) {
  return new Promise(async (resolve, reject) => {
    // var url ="https://www.w3.org/TR/2011/NOTE-WCAG20-TECHS-20111213/working-examples/PDF2/bookmarks.pdf";
    var buffer = await bufferize(url);
    var lines = await readlines(buffer);
    lines = await JSON.parse(JSON.stringify(lines));
    console.log(lines);
    resolve(lines)
  });
}
async function bufferize(url) {
  var hn = url.substring(url.search("//") + 2);
  hn = hn.substring(0, hn.search("/"));
  var pt = url.substring(url.search("//") + 2);
  pt = pt.substring(pt.search("/"));
  const options = { hostname: hn, port: 443, path: pt, method: "GET" };
  return new Promise(function(resolve, reject) {
    var buff = new Buffer.alloc(0);
    const req = https.request(options, res => {
      res.on("data", d => {
        buff = Buffer.concat([buff, d]);
      });
      res.on("end", () => {
        resolve(buff);
      });
    });
    req.on("error", e => {
      console.error("https request error: " + e);
    });
    req.end();
  });
}

/*
if second param is set then a space ' ' inserted whenever text 
chunks are separated by more than xwidth 
this helps in situations where words appear separated but
this is because of x coords (there are no spaces between words) 

each page is a different array element
*/
async function readlines(buffer, xwidth) {
  return new Promise((resolve, reject) => {
    var pdftxt = new Array();
    var pg = 0;
    new pdfreader.PdfReader().parseBuffer(buffer, function(err, item) {
      if (err) console.log("pdf reader error: " + err);
      else if (!item) {
        pdftxt.forEach(function(a, idx) {
          pdftxt[idx].forEach(function(v, i) {
            pdftxt[idx][i].splice(1, 2);
          });
        });
        resolve(pdftxt);
      } else if (item && item.page) {
        pg = item.page - 1;
        pdftxt[pg] = [];
      } else if (item.text) {
        var t = 0;
        var sp = "";
        pdftxt[pg].forEach(function(val, idx) {
          if (val[1] == item.y) {
            if (xwidth && item.x - val[2] > xwidth) {
              sp += " ";
            } else {
              sp = "";
            }
            pdftxt[pg][idx][0] += sp + item.text;
            t = 1;
          }
        });
        if (t == 0) {
          pdftxt[pg].push([item.text, item.y, item.x]);
        }
      }
    });
  });
}

/*
  Launch Puppeteer, go to the URL and return a Cheerio object

  Pass alwaysRun=true to run Puppeteer again even if cached
*/
async function headless(url, date, alwaysRun) {
  if (date !== false) {
    if (!date && process.env['SCRAPE_DATE']) {
      date = process.env['SCRAPE_DATE'];
    }
    else if (!date) {
      date = datetime.getYYYYMD();
    }
  }

  let html = await getCachedFile(url, 'html', date);
  if (html === null) {
    console.log('  🚦  Loading data for %s from server with a headless browser', url);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800, isMobile: false });

    let response;
    try {
      response = await page.goto(url, {
        timeout: 25000,
        waitUntil: 'networkidle2'
      });
    }
    catch(err) {
      browser.close();
      if (err.name === 'TimeoutError') {
        console.log('  ❌ Timed out trying to fetch %s headless', url);
        return null;
      }
      throw err;
    }

    if (response._status < 400) {
      await page.waitFor(3000);
      html = await page.content();
      browser.close();
      await cacheFile(url, 'html', date, html);
    } else {
      console.log('  ❌ Got error %d trying to fetch %s headless', response._status, url);
      browser.close();
      return null;
    }
  }
  else if (alwaysRun) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.setContent(html.toString());
    await page.waitFor(3000);
    html = await page.content();
    browser.close();
  }

  let $ = await cheerio.load(html);
  return $;
}

export { fetch, page, json, csv, pdf, headless };
