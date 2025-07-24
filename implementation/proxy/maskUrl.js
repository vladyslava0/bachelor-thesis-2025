/**
 * --------------------------------------------------------
 * File: maskUrl.js
 * Author: Vladyslava Bilyk (xbilyk03)
 * This file contains functions for finding and masking URLs that may be blocked.
 * --------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// Global map of correspondences between URLs and their hashes
const urlMap = new Map();

// Creating an absolute path to the file 'easyprivacy.txt'
const easyPrivacyPath = path.join(__dirname, 'filter_list', 'easyprivacy.txt');

/**
 * Function that downloads the EasyPrivacy list to the easyprivacy.txt file locally on the proxy
 */
function downloadEasyPrivacy() {
    // Check if file already exist
    if (fs.existsSync(easyPrivacyPath)) {
        console.log('EasyPrivacy list already exists.');
        return;
    }
  
    /**
     * Download the list from the official URL.
     * Based on an example from the official documentation for the https library in Node.js.
     */
    https.get('https://easylist.to/easylist/easyprivacy.txt', (res) => {
        // If the request do not succeeded
        if (res.statusCode !== 200) {
            console.error(`Failed to download: ${res.statusCode}`);
            // Drain stream 'res'
            res.resume();
            return;
        }
        // Create write stream to the 'easyprivacy.txt' file
        const fileStream = fs.createWriteStream(easyPrivacyPath);
        // Transfer the contents of the response to the 'easyprivacy.txt' file without any changes.
        res.pipe(fileStream);
        
        // Finish writing to the file
        fileStream.on('finish', () => {
            fileStream.close();
            console.log('EasyPrivacy list downloaded and saved.');
        });
    }).on('error', (e) => { // Error handling and error message output to the console
        console.error('Error while loading list EasyPrivacy:', e.message);
    });
}

/**
 * Function that return true if line contains domain or part of it 
 * @param line - line from the EasyPrivacy list
 * @returns - returns true if the string matches the specified category
 */
function domainLine(line) {
    // /^\.[.a-zA-Z0-9-]+\/.*/ - regular expression describing a string that starts with '.',
    //  followed by the domain name with allowed characters, after the '/' sign, and then any number of any characters
    return (
        line.startsWith('||') ||
      (
        line.startsWith('.') &&
        line.includes('/') &&
        /^\.[.a-zA-Z0-9-]+\/.*/.test(line)
      )
    );
}

/**
 * Function that returns a string from the list EasyPrivacy cleared from rules
 * @param line - line from the EasyPrivacy list
 * @returns - returns the part of the URL that has been cleaned of rules
 */ 
function getDomain(line) {
    // If a line begins with '||', delete the sign
    if (line.startsWith('||')) {
        line = line.slice(2);
    }

    // Cut everything after the first symbol found from left to right '^' or '$' or '?' (including them)
    const index = line.search(/[\^$?]/);
    if (index !== -1) {
        line = line.slice(0, index);
    }

    // If a line ends with '/', delete the symbolClick to apply
    if (line.endsWith('/')) {
        line = line.slice(0, -1);
    }

    return line;
}

/**
 * Function that hashes the received string and stores the correspondence 
 * between the hash and the original in a map
 * @param original - the entire URL or part of it
 * @returns - returns the created hash
 */ 
function hashUrl(original) {
    // The received string is hashed using the md5 algorithm
    const hash = crypto.createHash('md5').update(original).digest('hex');
    urlMap.set(hash, original);
    return hash;
}

/**
 * Function that masks the URL to Google Tag Manager in HTML code
 * @param html - HTML page content
 * @returns - modified HTML page content
 */ 
function maskUrlInHTML(html) {
    return html.replace(
        /https:\/\/www\.googletagmanager\.com\/[a-zA-Z]+[./]js\?id=[^"']+/g,
        (match) => {
            const hash = hashUrl(match);
            return `http://merlin.fit.vutbr.cz:3000/proxy-script/${hash}`;
        }
    );
}

/**
 * Function that finds and masks a path or part of a path in a script, given as an argument.
 * @param content - script content
 * @param path - the path that must be found and masked
 * @returns - modified script content
 */ 
function replacePartOfPath(content, path) {
    // Escaping special characters '.' and '*' in the path string
    const escapedTarget = path.replace(/[.*]/g, '\\$&'); 

    // Regular expression for finding a path that is located in 
    // a string that already has a modified domain
    const re = new RegExp(
        `(?:http://merlin.fit.vutbr.cz:3000[^;]+)${escapedTarget}`, 
        'g'
    ); 

    // If a string or strings are found, replacement occurs
    return content.replace(re, (match) => {
        return match.replace(path, '/proxy-get');
    });
}

/**
 * Function that finds and masks the part of the URL containing the domain in the script.
 * @param content - script content
 * @param domain - part of the URL that needs to be found and replaced
 * @returns - modified script content
 */ 
function replaceDomain(content, domain) {
    // Escaping special characters '.' and '*' in the URL string
    const searchPart = domain.replace(/[.*]/g, '\\$&');

    /*
        Match a URL that includes a dynamic part (like a variable or expression) before a domain.

        Breakdown:
        (["'])                           - capture group 1: the first quote
        https:\\/\\/                     - Match "https://"
        (                                - capture group 2: the dynamic variable part before the domain
        ["']\\+[^+]+\\+["']\\.?          -  pattern 1: string concatenation like '"+var+"'
        |["']\\+\\([^)]+\\)\\+["']\\.?   -  pattern 2: expression in concatenation like '"+(expr)+"'
        |\\{[^}]+\\}\\.?                 -  pattern 3: variable in curly braces like '{var}'
        )
        (?:${searchPart})                - match the variable ${searchPart}(and do not capture it)
        ([/?][^"']*)?                    - optional capture group 3: the rest of url
        (["'])                           - capture group 4: the last quote
    */
    const reWithVar = new RegExp(
        `(["'])https:\\/\\/(["']\\+[^+]+\\+["']\\.?|["']\\+\\([^)]+\\)\\+["']\\.?|\\{[^}]+\\}\\.?)(?:${searchPart})([/?][^"']*)?(["'])`,
        'g'
      );

    // If a match is found -> masking is applied
    content = content.replace(reWithVar, (match, quote1, variable, path = '', quote2) => {
        // Apply hashing to the part of the URL received from the EasyPrivacy list
        const hash = hashUrl(domain);
        // Creating a new masked URL
        const newUrl = `http://merlin.fit.vutbr.cz:3000/proxy-send/` + variable + `~` + hash + path;
        return `${quote1}${newUrl}${quote2}`;
    });

    /*
        Match a URL that do not include variable, but can include subdomain and include the given domain

        Breakdown:
        (["'])                    - capture group 1: the first quote
        https:\\/\\/              - match "https://"
        ([^.+"'{}()]*\\.?)?       - optional capture group 2: the subdomain that might appear
        (?:${searchPart})         - match the variable ${searchPart}(and do not capture it)
        (\\/[^"']*)?              - optional capture group 3: the rest of url
        (["'])                    - capture group 4: the last quote
    */
    const re = new RegExp(`(["'])https:\\/\\/([^.+"'{}()]*\\.?)?(?:${searchPart})([/?][^"']*)?(["'])`, 'g');

    content = content.replace(re, (match, quote1, subdomain = '', path = '', quote2) => {
        const hash = hashUrl(domain);
        // If the found string contains a subdomain, the separator '~' is added
        if (subdomain){
            subdomain += '~';
        }
        const newUrl = `http://merlin.fit.vutbr.cz:3000/proxy-send/` + subdomain + hash + path;
        return `${quote1}${newUrl}${quote2}`;
    });

    return content;
}

/**
 * The main function, in which the rules from the 'easyprivacy.txt' list are read,
 * searching and modifying the URL in the script received from the arguments
 * @param content - script content
 * @returns - modified script content
 */ 
function maskUrlInScript(content) {
    // Get an array of lines from the EasyPrivacy list
    const lines = fs.readFileSync(easyPrivacyPath, 'utf-8').split('\n');

    // Go through each line of the list
    for (const line of lines) {
        // Cut off whitespace from both sides
        let domain = line.trim();
        // Check if the rule contains the domain
        if (domainLine(domain)) {
            // Cut off the rules, leaving the clean part of the URL
            domain = getDomain(domain);
            if (domain) {
                // Search for this part of the URL and replace it
                content = replaceDomain(content, domain);
            }
        }
    }
    // Modification of the 'collect' path segment is being performed.
    content = replacePartOfPath(content,'/collect');
    // The variable that determines the version in the URL query parameters is being replaced
    content = content.replace(/e.v="2"/g, 'e.v="vut-2"');
    return content;
}

/**
 * Function that restores the original URL from a masked one
 * @param {string|URL} maskedUrl - masked URL
 * @returns - original URL
 */ 
function getOriginalUrl(maskedUrl) {
    const parsed = new URL(maskedUrl);
    // Break the URL into parts of segments
    const parts = parsed.pathname.split('/');

    const encoded = parts[2]; // Part of the URL that contains the hash
    let restPath = ''; // A variable that will contain the rest of the path
    // If the rest of the path after the hash is not empty
    if(parts.slice(3).join('/')){
        restPath = '/' + parts.slice(3).join('/');
        // Restore the masked segment of the path 'proxy-get' to the original 'collect'
        if (restPath.includes('/proxy-get')) {
            restPath = restPath.replace('/proxy-get', '/collect');
        }
    }

    let subdomain = ''; // Variable for subdomain that was not hashed
    let hash = ''; // Variable for hash 
    let query = parsed.search; // Constant for URL parameters
    // Restore the original version
    if (query.includes('vut-2')) {
        query = query.replace('vut-2', '2');
    }

    // If the hash has a subdomain -> separate them
    if(encoded.includes('~')){
        const split = encoded.split('~');
        subdomain = split[0];
        hash = split[1];
    } else { // If only hash is in the segment
        hash = encoded;
    }
    // Obtain the original part of the URL from the correspondence map
    const original = urlMap.get(hash);
    // If hash was not found in map
    if (!original) {
        throw new Error('Can not found hash in the map');
    }

    // Restoring the full URL
    const restoredUrl = `https://${subdomain}${original}${restPath}${query}`;
    return restoredUrl;
}


// Export functions
module.exports = {
    maskUrlInHTML,
    maskUrlInScript,
    downloadEasyPrivacy,
    getOriginalUrl
};