const fs = require('fs').promises;
const path = require('path');

/**
 * Recursively walk through the folder and return all file paths
 * @param dir
 * @returns {Promise<string>}
 */
async function walk(dir) {
    let files = await fs.readdir(dir);
    files = await Promise.all(files.map(async file => {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) return walk(filePath);
        else if(stats.isFile()) return filePath;
    }));

    return files.reduce((all, folderContents) => all.concat(folderContents), []);
}

exports.walk = walk;