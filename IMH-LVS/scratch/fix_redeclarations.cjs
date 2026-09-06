const fs = require('fs');

let content = fs.readFileSync('src/pages/ArtworkPage.tsx', 'utf8');

// The line is: const [artworks, setArtworks] = useState<Artwork[]>(() => artworks);
content = content.replace(/const \[artworks, setArtworks\] = useState<Artwork\[\]>\(\(\) => artworks\);/, '');

fs.writeFileSync('src/pages/ArtworkPage.tsx', content);

let qaContent = fs.readFileSync('src/pages/QAPage.tsx', 'utf8');
qaContent = qaContent.replace(/const \[comparisons, setComparisons\] = useState<Comparison\[\]>\(\(\) => comparisons\);/, '');
fs.writeFileSync('src/pages/QAPage.tsx', qaContent);

