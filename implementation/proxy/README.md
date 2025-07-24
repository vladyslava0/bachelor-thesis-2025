# Proxy Server

This folder contains the main files with the code for the proxy server I implemented. Next, I will describe how to integrate and run the proxy server on Merlin or another domain.

Author: Vladyslava Bilyk (xbilyk03)  
Academic year: 2024/2025

## Requirements

- Node.js (was tested on versions v18.20.4 and v16.20.2)
- NPM (was tested on version 9.9.3.)


## Installation

```bash
npm install
```

This command installs all required dependencies listed in the `package.json` file and creates a `node_modules/` directory containing the necessary Node.js packages.

## Configuration

### Merlin
The proxy server I provided is ready for testing on the university server Merlin. 
To do this, the contents of the `WWW/` folder, which I provided with the implementation, must be placed in the corresponding `WWW/` folder in your directory on Merlin. This will place a simple page with a script that is connected to my Google Analytics account. 
The `proxy/` folder must also be placed in your directory on the Merlin server. After that, the proxy server will be ready to run. Go to the `proxy/` folder and run the command:

```bash
node index.js
```
To check the work of the proxy server, go to: http://merlin.fit.vutbr.cz:3000
Important! Before each proxy server restart, delete the script from the `proxy-cache/` folder.

### Another domain
If testing will be performed with a different page and on a different domain, the following changes must be made:

1. It is important to place and run the proxy server on the same domain as the web server.
2. In the `index.js` file, in the `proxy.web` function, change the `target` to the domain and port on which the web page server is running.
3. If necessary, change the port on which the proxy server is running in function `server.listen` in the `index.js` file
4. In the `mask.js` file, change all `merlin.fit.vutbr.cz:3000` to the domain on which the proxy server is running, and specify the correct proxy port.
5. If the Express server is no longer needed, remove its initialization and start from the code.
6. Run the command:
```bash
node index.js
```

As a result, the proxy server will run on the same domain as the web page, and you can check that it is working by going to: http://yourDomain:proxyPort
