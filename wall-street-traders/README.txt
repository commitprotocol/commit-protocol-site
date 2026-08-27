WALL STREET TRADERS — GITHUB PAGES

Official website package for Wall Street Traders by Commit Protocol.

Installation

Upload the entire wall-street-traders folder to the root of your GitHub Pages repository.

Because the trading-floor/traders directory contains 444 images, the GitHub web uploader may reject the folder or limit uploads to fewer than 100 files at a time. Use GitHub Desktop or Git from the command line to upload the complete project in one commit.

Do not upload the ZIP file directly to the repository. GitHub Pages does not extract ZIP archives automatically.

Official pages

Website: https://commitprotocol.org/wall-street-traders/

Documentation: https://commitprotocol.org/wall-street-traders/docs/

Collab Kit: https://commitprotocol.org/wall-street-traders/collabs/

The Trading Floor: https://commitprotocol.org/wall-street-traders/trading-floor/

The Trading Floor

The Trading Floor contains the public gallery for all 444 Wall Street Traders.

Required files inside wall-street-traders/trading-floor/:

index.html

styles.css

app.js

data/metadata.csv

traders/1.png through traders/444.png

trader/1/index.html through trader/444/index.html

Each individual Trader page contains its own Open Graph and X metadata. These pages allow the correct NFT image, title and description to appear when a Trader link is shared. Sharing uses the official X intent URL and does not require an X API key.

Existing Commit Protocol assets

The website uses these existing files from the root of the Commit Protocol repository:

/logo.png

/menu.css

/menu.html

Official addresses

Collection contract:
0x7a5f95f898cf968cac3f9d6231f03f36c3da5b0d

Deployer wallet:
0xc63904D71fB1fed5bB90a148A3aeA661bc85875B

The official treasury address is documented in wall-street-traders/docs/index.html.

Before launch

Confirm that all 444 Trader images are available inside the traders directory.

Confirm that data/metadata.csv contains the final metadata for all 444 Traders.

Add or confirm the official marketplace link.

Verify the collection contract, deployer wallet and treasury address.

Test the website, documentation, Collab Kit and Trading Floor URLs after deployment.

Only links and addresses published through the official Wall Street Traders and Commit Protocol channels should be considered authentic.
