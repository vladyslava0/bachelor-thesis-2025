# Bachelor Thesis "Deceiving Block Lists" Project Structure

This directory contains the complete materials for the bachelor's thesis "Deceiving Block Lists", including the technical report and implementation files.
 
The goal of this work is to create a tool capable of bypassing blockers that rely on lists of blocked URLs, ensuring the proper functioning of analytical, marketing, and remarketing scripts.

This project presents the solution I developed - a custom proxy server focused on intercepting requests related specifically to Google scripts, such as Google Analytics and Google Ads. The core idea of the proxy is to disguise script URLs within the website’s HTML and inside the JavaScript files received from the original script servers. When the browser later attempts to load these disguised URLs, the proxy detects them, restores the original URLs and redirects the requests to the actual external servers.

**Technologies used:** Node.js, Express, http-proxy, JavaScript

Author: Vladyslava Bilyk (xbilyk03)  
Academic year: 2024/2025

## Folder Structure

- `thesis/` - contains the LaTeX source files of the written thesis.
- `implementation/` - contains the code and related files.
  - `WWW/` - a simple static page used for testing the proxy behavior.
  - `proxy/` - the main source code of the proxy server.
    - `index.js` - the main entry point for launching the proxy server.
    - `maskUrl.js` - a helper module used in `index.js` 
    - `package.json` - defines the required dependencies for the Node.js application.
    - `package-lock.json` - locks specific versions of the installed dependencies.
    - `proxy-cache/` - a folder that contains downloaded script.
    - `filter_list/` - a folder that contains the downloaded EasyPrivacy list.
    - `README.md` - contains instructions for installing, configuring and starting the proxy server.
- `xbilyk03.pdf` - the final thesis (technical report) in PDF format.
