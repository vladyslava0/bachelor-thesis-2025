/**
 * --------------------------------------------------------
 * File: index.js
 * Author: Vladyslava Bilyk (xbilyk03)
 * This file creates and starts the main proxy server.
 * --------------------------------------------------------
 */
const http = require('http');
const httpProxy = require('http-proxy');
const zlib = require('zlib');
const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { maskUrlInHTML, maskUrlInScript, downloadEasyPrivacy, getOriginalUrl} = require('./maskUrl.js');
const { URL } = require('url');


const app = express();
/**
 * Static files served from the WWW folder containing the page code
 * Adapted from the official Express documentation:
 * https://expressjs.com/en/starter/static-files.html
 */
app.use(express.static(path.join(__dirname, '../WWW')));

/**
 * Start the express server on port 8080
 * Adapted from the official Express documentation:
 * https://expressjs.com/
 */
app.listen(8080, () => {
    console.log('Express server running on port 8080');
});


// Create object of proxy
const proxy = httpProxy.createProxyServer({ selfHandleResponse: true });

let scriptPath; // Global variable for absolute path to the script path
// Creating an absolute path to the cache folder
const cacheFolder = path.join(__dirname, 'proxy-cache');
  
// Call the function to download the EasyPrivacy list
downloadEasyPrivacy();

/**
 * A function that sends a request to Google Tag Manager using the URL received in the arguments,
 * receives a script in response and stores it in the proxy server cache, after masking
 * any suspicious URLs in it.
 * @param scriptUrl - URL script, that will be used for request
 * @param path - path to the file in cache folder
 * @returns {Promise<void>} - Promise, which is executed if the script is successfully loaded and modified.
 *  and is rejected with an error
 */
const getAndSaveScript = (scriptUrl, path) => {
    return new Promise((resolve, reject) => {
        https.get(scriptUrl, (res) => {
            // If the script is successfully transferred
            if (res.statusCode === 200) {
                // Create write stream to the file in cache folder
                const fileStream = fs.createWriteStream(path);
                // Transfer the contents of the response to the file without any changes.
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    // When the file is written, call the function to mask the URL
                    fileStream.close(() => {
                        try {
                            // Passing the contents of a file to a variable
                            let content = fs.readFileSync(path, 'utf8');
                            // URL masking is provided in the script
                            content = maskUrlInScript(content);
                            // The modified content is returned to the file
                            fs.writeFileSync(path, content, 'utf8');
                            // Successful completion of Promise
                            resolve();
                        } catch (e) {
                            // Completion of Promise with an error
                            reject(e);
                        }
                    });
                });
            } else { // If the response code indicates that the script transfer failed
                reject(new Error(`${res.statusCode} Error getting script`));
            }
        }).on('error', (e) => {
            reject(new Error(`Error while loading script: ${e.message}`));
        });
    });
};

/**
 * An asynchronous function that takes the content of an HTML page, finds the URL in it, 
 * calls a function that makes a request using it, and then masks the URL on the page
 * @param html - HTML page content
 * @returns - modified HTML page content
 */
async function processHTML(html) {
    // Find matches with a regular expression describing the possible appearance of the URL
    const match = html.match(/https:\/\/www\.googletagmanager\.com\/([a-zA-Z]+)[./]js\?id=[^"']+/);

    // If a match is found
    if (match) {
        // Constant containing the found URL
        const originalUrl = match[0];
        // Constant containing the name of the script
        const scriptName = match[1];
        // Constant containing the path to the file with the script
        scriptPath = path.join(cacheFolder, `${scriptName}.js`);

        // If the script is not yet stored in the cache, it will be fetched
        if (!fs.existsSync(scriptPath) || fs.statSync(scriptPath).size === 0) {
            // Call the function to get the script from the Google Tag Manager server
            await getAndSaveScript(originalUrl, scriptPath);
        } 
        // Calls a function to modify the URL in the HTML code
        const modifiedBody = maskUrlInHTML(html);
    
        return modifiedBody;
    }

    return html; // If there no such URL of scripts in HTML code
}

/**
 * A function that creates an HTTP server that accepts requests from a browser.
 * @param {http.IncomingMessage} req - browser request object
 * @param {http.ServerResponse} res - response object from the server
 * @returns {http.Server} - HTTP server object
 */
const server = http.createServer((req, res) => {
    // Processing requests for redirecting masked requests
    if (req.url.includes('proxy-send')) {
        // Creates a complete URL from the relative path of the request
        const fullUrl = new URL(req.url, `http://${req.headers.host}`).href;
        // Call the function to restore the original URL
        const originalUrl = getOriginalUrl(fullUrl); 

        // From the line containing the URL, create an object of type URL
        const parsedUrl = new URL(originalUrl);
        // Replace the request host in the headers
        req.headers.host = parsedUrl.host;

        // Create an object 'options'
        const options = {
            method: req.method,
            headers: req.headers
        };

        // A request to the Google server is being prepared
        // A googleReq object is created, which waits for data
        const googleReq = https.request(originalUrl, options, (googleRes) => {
            // Extract the content-type header
            const contentType = googleRes.headers['content-type'] || '';
            // Extract the content-encoding header
            const contentEncoding = googleRes.headers['content-encoding'] || '';
            // If the response contains JavaScript code -> mask suspicious URLs in it
            if (contentType.includes('text/javascript') || contentType.includes('application/javascript'))  {
                let data = [];
                // Let's combine parts of the answer into one array
                googleRes.on('data', (chunk) => {
                    data.push(chunk);
                });
                // When the data is completely in the variable, checks can be performed
                googleRes.on('end', async () => {
                    // Combines an array of buffers into a single buffer
                    data = Buffer.concat(data);
                    try {
                        // A check is performed to see if the response was compressed,
                        // and if so, decompression is performed
                        if (contentEncoding.includes('gzip')) {
                            data = zlib.gunzipSync(data);
                        } else if (contentEncoding.includes('br')) {
                            data = zlib.brotliDecompressSync(data);
                        } else if (contentEncoding.includes('deflate')) {
                            data = zlib.inflateSync(data);
                        }

                        // After decompression, call the function to mask the URL in the response
                        const modifiedRes = maskUrlInScript(data.toString());

                        // Remove the compression header, as the response has been decompressed.
                        delete googleRes.headers['content-encoding'];
                        // Updating the header about the length of the answer
                        googleRes.headers['content-length'] = Buffer.byteLength(modifiedRes, 'utf-8');

                        // Send headers with status code to browser
                        res.writeHead(googleRes.statusCode, googleRes.headers);
                        // Finish the response and send the body of the response to the browser.
                        res.end(modifiedRes);
                    } catch (e) { // Handling decompression or modifications errors 
                        console.error('Error modifying JavaScript content:', e.message);
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        res.end('Internal Server Error');
                    }
                });
            } else {
                // If it is not JavaScript code, return the response as it is
                res.writeHead(googleRes.statusCode, googleRes.headers);
                googleRes.pipe(res);
            }
        });

        req.pipe(googleReq); // The body of the original request is transferred to the googleReq object

        // Handling a network error when sending a request
        googleReq.on('error', (e) => {
            console.error('Error forwarding request to Google server:', e.message);
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Bad Gateway');
        });

        return;
    }

    // Processing requests for getting a script from the proxy cache
    if (req.url.includes('proxy-script')) {
        // If the script is stored in the proxy cache and is not empty, return it to the browser
        if (fs.existsSync(scriptPath) && fs.statSync(scriptPath).size > 0) {
            // Return the status code and the 'Content-Type' header
            res.writeHead(200, {  'Content-Type': 'application/javascript' });
            // Transferring the file contents
            fs.createReadStream(scriptPath).pipe(res);
        } else { // If the script is not in the proxy cache, return an error
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }

        return;
    }

    // Proxying unmasked requests to the web server
    proxy.web(req, res, { target: 'http://127.0.0.1:8080' }, (e) => {
        console.error(`Error proxying: ${e.message}`);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
    }); 
});

/**
 * The 'proxyRes' event handler, which is executed after receiving a response from the server.
 * @param proxyRes - response from the server
 * @param req - request from a browser
 * @param res - the response that will be sent to the browser
 */
proxy.on('proxyRes', (proxyRes, req, res) => {
    // A variable containing the value of the content-type header, if header present
    let contentType = proxyRes.headers['content-type'] || '';
    // A variable containing the value of the content-encoding header, if header present
    let contentEncoding = proxyRes.headers['content-encoding'] || '';


    // If it is not HTML, pass the response without changes
    if (!contentType.includes('text/html')) {
        // Send headers with status code to browser
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        // Pass the response body, if there is one
        proxyRes.pipe(res);
        return;
    }

    let data = [];
    // Collect parts of the answer into an array
    proxyRes.on('data', (chunk) => {
        data.push(chunk);
    });
    // Once the data has been collected, the content can be decompressed and modified
    proxyRes.on('end', async () => {
        // Combines an array of buffers into a single buffer
        data = Buffer.concat(data);
        try {
            // Decompress the content, depending on the type of content-encoding header
            if (contentEncoding.includes('gzip')) {
                data = zlib.gunzipSync(data);
            } else if (contentEncoding.includes('deflate')) {
                data = zlib.inflateSync(data);
            } else if (contentEncoding.includes('br')) {
                data = zlib.brotliDecompressSync(data);
            }
            // Call a function to search for and mask URL
            const modifiedHTML = await processHTML(data.toString());
        
            // Change response length, which changed after URL masking
            proxyRes.headers['content-length'] = Buffer.byteLength(modifiedHTML, 'utf-8');
            // Remove compression header
            delete proxyRes.headers['content-encoding'];
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            res.end(modifiedHTML);
        } catch (e) { // Handling decompression errors or HTML page modifications
            console.error('Error modifying HTML content:', e.message);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    });
});

/**
 * Start the proxy server on port 3000
 */
server.listen(3000, () => {
    console.log('Proxy server is running on port 3000');
});