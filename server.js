const express = require('express');
const cors = require('cors');
const { JSDOM } = require('jsdom');

// Ensure fetch is available globally
let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();

const app = express();
app.use(cors());
app.use(express.static('public'));

// Function to recursively fetch scripts and search for keywords
async function fetchScriptsRecursively(scripts, origin, keywordList) {
    let scriptContents = '';
    for (const script of scripts) {
        const scriptURL = new URL(script.src, origin).href; // Resolve relative URLs
        console.log(`Fetching script from URL: ${scriptURL}`); // Print the script URL
        try {
            const response = await fetch(scriptURL);
            const text = await response.text();
            scriptContents += ' ' + text;

            // Check for keywords in the current script
            keywordList.forEach(keyword => {
                if (text.toLowerCase().includes(keyword.toLowerCase())) {
                    console.log(`Keyword "${keyword}" found in ${scriptURL}`);
                }
            });

            // Parse new scripts within fetched script
            const dom = new JSDOM(text, { url: scriptURL });
            const nestedScripts = dom.window.document.querySelectorAll('script[src]');
            if (nestedScripts.length > 0) {
                scriptContents += ' ' + await fetchScriptsRecursively(Array.from(nestedScripts), scriptURL, keywordList);
            }
        } catch (err) {
            console.error(`Failed to fetch script ${scriptURL}: ${err.message}`);
        }
    }
    return scriptContents;
}

app.get('/crawl', async (req, res) => {
    const { url, keyword } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required.' });
    }
    if (!keyword) {
        return res.status(400).json({ error: 'Keywords parameter is required.' });
    }

    const keywordList = keyword.split(',').map(k => k.trim());
    try {
        const response = await fetch(url);
        const html = await response.text();
        const dom = new JSDOM(html);

        // Extract text content from the entire document
        const bodyContent = dom.window.document.documentElement.textContent;

        // Extract script tags from both head and body
        const scripts = dom.window.document.querySelectorAll('script');

        console.log(`Found ${scripts.length} scripts.`); // Log the count of scripts found

        // Log and check attributes for each script
        for (const script of scripts) {
            console.log(`Script src: ${script.src}`);
            if (script.hasAttribute('async')) {
                console.log(`This script is loaded asynchronously: ${script.src}`);
            }
            if (script.hasAttribute('defer')) {
                console.log(`This script is loaded with defer: ${script.src}`);
            }
        }

        const scriptContents = await fetchScriptsRecursively(Array.from(scripts), url, keywordList);

        // Combine body content and script content
        const combinedContent = bodyContent + ' ' + scriptContents;

        // Search for keywords in combined content
        const foundKeywords = [];
        const notFoundKeywords = [];

        keywordList.forEach(keyword => {
            if (combinedContent.toLowerCase().includes(keyword.toLowerCase())) {
                foundKeywords.push(`Keyword "${keyword}" found.`);
            } else {
                notFoundKeywords.push(`Keyword "${keyword}" not found.`);
            }
        });

        res.json({ found: foundKeywords, notFound: notFoundKeywords });
    } catch (error) {
        console.error(`Error fetching external scripts: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch external scripts.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));